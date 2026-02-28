from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.api.v1.serializers import (
    ServiceMenuEntrySerializer,
    ServiceMenuEntrySyncSerializer,
    SiteSerializer,
    SiteWriteSerializer,
)
from apps.core.models import ServiceMenuEntry, Site
from apps.core.services.service_ingredients import extract_ingredients, normalize_qty_unit
from apps.integration.models import RecipeSnapshot

PERMANENT_SERVICE_DATE = date(1900, 1, 1)
SCHEDULE_PERMANENT = "permanent"
SCHEDULE_DATE_SPECIFIC = "date_specific"
SCHEDULE_RECURRING_WEEKLY = "recurring_weekly"
SUPPORTED_SCHEDULE_MODES = {
    SCHEDULE_PERMANENT,
    SCHEDULE_DATE_SPECIFIC,
    SCHEDULE_RECURRING_WEEKLY,
}


class HealthView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({"status": "ok", "service": "cookops", "version": "v1"})


class SiteListView(APIView):
    def get(self, request):
        include_inactive = request.query_params.get("include_inactive") in {"1", "true", "True"}
        queryset = Site.objects.all() if include_inactive else Site.objects.filter(is_active=True)
        queryset = queryset.order_by("name")
        return Response(SiteSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = SiteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        site = serializer.save()
        return Response(SiteSerializer(site).data, status=status.HTTP_201_CREATED)


class SiteDetailView(APIView):
    def patch(self, request, site_id):
        site = get_object_or_404(Site, id=site_id)
        serializer = SiteWriteSerializer(site, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SiteSerializer(site).data)

    def delete(self, request, site_id):
        site = get_object_or_404(Site, id=site_id)
        confirmation = (request.data or {}).get("confirm_text", "")
        if confirmation != "ELIMINA DEFINITIVAMENTE":
            return Response(
                {"detail": "Conferma non valida. Digita ELIMINA DEFINITIVAMENTE per eliminare il punto vendita."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        site.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceMenuEntrySyncView(APIView):
    @staticmethod
    def _parse_iso_date(raw_value):
        if not raw_value:
            return None
        if isinstance(raw_value, date):
            return raw_value
        try:
            return date.fromisoformat(str(raw_value))
        except ValueError:
            return None

    @staticmethod
    def _normalize_weekdays(raw_value):
        if raw_value is None:
            return []
        if isinstance(raw_value, (int, str)):
            raw_items = [raw_value]
        elif isinstance(raw_value, list):
            raw_items = raw_value
        else:
            return []

        aliases = {
            "mon": 0,
            "monday": 0,
            "lun": 0,
            "lunedì": 0,
            "lunedi": 0,
            "tue": 1,
            "tuesday": 1,
            "mar": 1,
            "martedì": 1,
            "martedi": 1,
            "wed": 2,
            "wednesday": 2,
            "mer": 2,
            "mercoledì": 2,
            "mercoledi": 2,
            "thu": 3,
            "thursday": 3,
            "gio": 3,
            "giovedì": 3,
            "giovedi": 3,
            "fri": 4,
            "friday": 4,
            "ven": 4,
            "venerdì": 4,
            "venerdi": 4,
            "sat": 5,
            "saturday": 5,
            "sab": 5,
            "sun": 6,
            "sunday": 6,
            "dom": 6,
            "domenica": 6,
        }

        normalized = set()
        for item in raw_items:
            if isinstance(item, int):
                if 0 <= item <= 6:
                    normalized.add(item)
                elif 1 <= item <= 7:
                    normalized.add(item - 1)
                continue
            raw = str(item).strip().lower()
            if raw.isdigit():
                value = int(raw)
                if 0 <= value <= 6:
                    normalized.add(value)
                elif 1 <= value <= 7:
                    normalized.add(value - 1)
                continue
            mapped = aliases.get(raw)
            if mapped is not None:
                normalized.add(mapped)
        return sorted(normalized)

    @classmethod
    def _resolve_schedule_mode(cls, entry: ServiceMenuEntry):
        metadata = entry.metadata if isinstance(entry.metadata, dict) else {}
        schedule_mode = str(metadata.get("schedule_mode") or "").strip().lower()
        if schedule_mode in SUPPORTED_SCHEDULE_MODES:
            return schedule_mode
        if entry.service_date == PERMANENT_SERVICE_DATE:
            return SCHEDULE_PERMANENT
        if entry.space_key.startswith("carta"):
            return SCHEDULE_PERMANENT
        return SCHEDULE_DATE_SPECIFIC

    @classmethod
    def _is_entry_applicable_for_date(cls, entry: ServiceMenuEntry, target_date: date):
        metadata = entry.metadata if isinstance(entry.metadata, dict) else {}
        schedule_mode = cls._resolve_schedule_mode(entry)
        valid_from = cls._parse_iso_date(metadata.get("valid_from"))
        valid_to = cls._parse_iso_date(metadata.get("valid_to"))

        if valid_from and target_date < valid_from:
            return False
        if valid_to and target_date > valid_to:
            return False

        if schedule_mode == SCHEDULE_RECURRING_WEEKLY:
            weekdays = cls._normalize_weekdays(metadata.get("weekdays"))
            if weekdays and target_date.weekday() not in weekdays:
                return False
            return True
        if schedule_mode == SCHEDULE_PERMANENT:
            return True
        return entry.service_date == target_date

    @classmethod
    def _get_effective_entries(cls, site_id, target_date: date):
        dated_entries = list(
            ServiceMenuEntry.objects.filter(site_id=site_id, service_date=target_date, is_active=True).order_by(
                "space_key", "sort_order", "title"
            )
        )
        permanent_entries = list(
            ServiceMenuEntry.objects.filter(site_id=site_id, service_date=PERMANENT_SERVICE_DATE, is_active=True).order_by(
                "space_key", "sort_order", "title"
            )
        )
        legacy_card_entries: list[ServiceMenuEntry] = []
        if not permanent_entries:
            latest_legacy_date = (
                ServiceMenuEntry.objects.filter(site_id=site_id, is_active=True, space_key__startswith="carta")
                .exclude(service_date=PERMANENT_SERVICE_DATE)
                .order_by("-service_date")
                .values_list("service_date", flat=True)
                .first()
            )
            if latest_legacy_date:
                legacy_card_entries = list(
                    ServiceMenuEntry.objects.filter(
                        site_id=site_id,
                        service_date=latest_legacy_date,
                        is_active=True,
                        space_key__startswith="carta",
                    ).order_by("space_key", "sort_order", "title")
                )

        combined = []
        for entry in permanent_entries + legacy_card_entries + dated_entries:
            if cls._is_entry_applicable_for_date(entry, target_date):
                combined.append(entry)
        return combined

    def get(self, request):
        site_id = request.query_params.get("site")
        service_date = request.query_params.get("date")
        if not site_id or not service_date:
            return Response({"detail": "Query params 'site' and 'date' are required."}, status=status.HTTP_400_BAD_REQUEST)

        parsed_service_date = self._parse_iso_date(service_date)
        if not parsed_service_date:
            return Response({"detail": "Query param 'date' must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        effective_entries = self._get_effective_entries(site_id, parsed_service_date)
        return Response({"count": len(effective_entries), "entries": ServiceMenuEntrySerializer(effective_entries, many=True).data})

    @transaction.atomic
    def post(self, request):
        serializer = ServiceMenuEntrySyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        site = get_object_or_404(Site, id=serializer.validated_data["site_id"])
        service_date = serializer.validated_data["service_date"]
        entries = serializer.validated_data["entries"]

        permanent_entries_payload = []
        dated_entries_payload = []
        for item in entries:
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            schedule_mode = str(metadata.get("schedule_mode") or "").strip().lower()
            if schedule_mode not in SUPPORTED_SCHEDULE_MODES:
                schedule_mode = SCHEDULE_PERMANENT if item.get("space_key", "").startswith("carta") else SCHEDULE_DATE_SPECIFIC
                metadata = {**metadata, "schedule_mode": schedule_mode}
                item = {**item, "metadata": metadata}

            if schedule_mode in {SCHEDULE_PERMANENT, SCHEDULE_RECURRING_WEEKLY}:
                permanent_entries_payload.append(item)
            else:
                dated_entries_payload.append(item)

        ServiceMenuEntry.objects.filter(site=site, service_date=PERMANENT_SERVICE_DATE).delete()
        ServiceMenuEntry.objects.filter(site=site, service_date=service_date).delete()

        permanent_instances = [
            ServiceMenuEntry(
                site=site,
                service_date=PERMANENT_SERVICE_DATE,
                space_key=item["space_key"],
                section=item.get("section") or None,
                title=item["title"],
                fiche_product_id=item.get("fiche_product_id"),
                expected_qty=item.get("expected_qty") or Decimal("0"),
                sort_order=item.get("sort_order", 0),
                is_active=item.get("is_active", True),
                metadata=item.get("metadata") or {},
            )
            for item in permanent_entries_payload
        ]
        dated_instances = [
            ServiceMenuEntry(
                site=site,
                service_date=service_date,
                space_key=item["space_key"],
                section=item.get("section") or None,
                title=item["title"],
                fiche_product_id=item.get("fiche_product_id"),
                expected_qty=item.get("expected_qty") or Decimal("0"),
                sort_order=item.get("sort_order", 0),
                is_active=item.get("is_active", True),
                metadata=item.get("metadata") or {},
            )
            for item in dated_entries_payload
        ]

        if permanent_instances:
            ServiceMenuEntry.objects.bulk_create(permanent_instances)
        if dated_instances:
            ServiceMenuEntry.objects.bulk_create(dated_instances)

        effective_entries = self._get_effective_entries(site.id, service_date)
        return Response(
            {
                "site": str(site.id),
                "service_date": service_date,
                "count": len(effective_entries),
                "entries": ServiceMenuEntrySerializer(effective_entries, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ServiceIngredientsView(APIView):
    @staticmethod
    def _resolve_snapshot_for_entry(entry: ServiceMenuEntry):
        if entry.fiche_product_id:
            snapshot = (
                RecipeSnapshot.objects.filter(fiche_product_id=entry.fiche_product_id)
                .order_by("-source_updated_at", "-created_at")
                .first()
            )
            if snapshot:
                return snapshot

        title = (entry.title or "").strip()
        if not title:
            return None
        snapshot = RecipeSnapshot.objects.filter(title__iexact=title).order_by("-source_updated_at", "-created_at").first()
        if snapshot:
            return snapshot
        return RecipeSnapshot.objects.filter(title__icontains=title).order_by("-source_updated_at", "-created_at").first()

    @staticmethod
    def _resolve_snapshot_for_ingredient_title(title: str):
        cleaned = (title or "").strip()
        if not cleaned:
            return None
        return RecipeSnapshot.objects.filter(title__iexact=cleaned).order_by("-source_updated_at", "-created_at").first()

    @staticmethod
    def _parse_iso_date(raw_value):
        if not raw_value:
            return None
        if isinstance(raw_value, date):
            return raw_value
        try:
            return date.fromisoformat(str(raw_value))
        except ValueError:
            return None

    @classmethod
    def _is_entry_valid_for_service_date(cls, entry: ServiceMenuEntry, service_date: date):
        return ServiceMenuEntrySyncView._is_entry_applicable_for_date(entry, service_date)

    def _expand_snapshot_ingredients(
        self,
        snapshot,
        multiplier: Decimal,
        warnings: list[str],
        visited: set[str],
        depth: int = 0,
        derived_from_recipe: str | None = None,
    ):
        ingredients = extract_ingredients(snapshot.payload or {})
        if not ingredients:
            return []

        max_depth = 6
        if depth > max_depth:
            warnings.append(f"Espansione ingredienti interrotta: profondita massima superata per '{snapshot.title}'.")
            return []

        expanded: list[dict] = []
        for ing in ingredients:
            ingredient_name = (ing.get("name") or "").strip()
            qty_total = (ing.get("qty") or Decimal("0")) * multiplier
            supplier = ing.get("supplier") or "Senza fornitore"

            nested_snapshot = self._resolve_snapshot_for_ingredient_title(ingredient_name)
            nested_key = ""
            if nested_snapshot:
                nested_key = str(nested_snapshot.fiche_product_id).lower()
                if nested_key and nested_key in visited:
                    warnings.append(f"Ciclo rilevato su preparazione interna '{ingredient_name}'. Espansione saltata.")
                    nested_snapshot = None

            if nested_snapshot and qty_total > 0:
                nested_portions = nested_snapshot.portions if nested_snapshot.portions and nested_snapshot.portions > 0 else None
                nested_multiplier = qty_total / nested_portions if nested_portions else qty_total
                nested_visited = set(visited)
                if nested_key:
                    nested_visited.add(nested_key)
                nested_items = self._expand_snapshot_ingredients(
                    nested_snapshot,
                    nested_multiplier,
                    warnings,
                    nested_visited,
                    depth + 1,
                    derived_from_recipe or nested_snapshot.title,
                )
                if nested_items:
                    expanded.extend(nested_items)
                    continue

            qty_normalized, unit_normalized = normalize_qty_unit(qty_total, ing.get("unit"))
            expanded.append(
                {
                    "ingredient": ingredient_name,
                    "supplier": supplier,
                    "qty_total": qty_normalized,
                    "unit": unit_normalized,
                    "source_type": "derived_recipe" if derived_from_recipe else "direct",
                    "source_recipe_title": derived_from_recipe,
                }
            )
        return expanded

    def get(self, request):
        site_id = request.query_params.get("site")
        service_date = request.query_params.get("date")
        view_mode = request.query_params.get("view", "supplier")

        if not site_id or not service_date:
            return Response({"detail": "Query params 'site' and 'date' are required."}, status=status.HTTP_400_BAD_REQUEST)

        parsed_service_date = self._parse_iso_date(service_date)
        if not parsed_service_date:
            return Response({"detail": "Query param 'date' must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        entries = ServiceMenuEntrySyncView._get_effective_entries(site_id, parsed_service_date)
        if not entries:
            return Response({"rows": [], "warnings": ["Nessuna voce menu attiva per data/sede selezionata."]})

        warnings: list[str] = []

        supplier_agg: dict[tuple[str, str, str, str, str], Decimal] = defaultdict(lambda: Decimal("0"))
        recipe_rows: list[dict] = []

        for entry in entries:
            if not self._is_entry_valid_for_service_date(entry, parsed_service_date):
                continue
            snapshot = self._resolve_snapshot_for_entry(entry)
            if not snapshot:
                warnings.append(f"'{entry.title}': nessuna fiche importata trovata (uuid/titolo).")
                continue

            planned_portions = entry.expected_qty or Decimal("0")
            if planned_portions <= 0:
                warnings.append(f"'{entry.title}': porzioni target non valorizzate (> 0).")
                continue

            recipe_portions = snapshot.portions if snapshot.portions and snapshot.portions > 0 else None
            multiplier = planned_portions / recipe_portions if recipe_portions else planned_portions
            root_key = str(snapshot.fiche_product_id).lower() if snapshot.fiche_product_id else ""
            visited = {root_key} if root_key else set()
            expanded_ingredients = self._expand_snapshot_ingredients(snapshot, multiplier, warnings, visited, 0)
            if not expanded_ingredients:
                warnings.append(f"'{entry.title}': nessun ingrediente nel payload fiche.")
                continue

            recipe_ingredients: list[dict] = []
            for ing in expanded_ingredients:
                qty_total = ing["qty_total"]
                supplier = ing["supplier"] or "Senza fornitore"
                source_type = ing.get("source_type") or "direct"
                source_recipe_title = ing.get("source_recipe_title") or ""
                supplier_agg[(supplier, ing["ingredient"], ing["unit"], source_type, source_recipe_title)] += qty_total
                recipe_ingredients.append(
                    {
                        "ingredient": ing["ingredient"],
                        "supplier": supplier,
                        "qty_total": str(qty_total),
                        "unit": ing["unit"],
                        "source_type": source_type,
                        "source_recipe_title": source_recipe_title or None,
                    }
                )

            recipe_rows.append(
                {
                    "space": entry.space_key,
                    "section": entry.section,
                    "title": entry.title,
                    "expected_qty": str(planned_portions),
                    "recipe_portions": str(recipe_portions) if recipe_portions else None,
                    "ingredients": recipe_ingredients,
                }
            )

        if view_mode == "recipe":
            return Response({"view": "recipe", "rows": recipe_rows, "warnings": warnings})

        supplier_rows = [
            {
                "supplier": supplier,
                "ingredient": ingredient,
                "qty_total": str(total),
                "unit": unit,
                "source_type": source_type,
                "source_recipe_title": source_recipe_title or None,
            }
            for (supplier, ingredient, unit, source_type, source_recipe_title), total in sorted(
                supplier_agg.items(),
                key=lambda item: (item[0][0], item[0][1], item[0][3], item[0][4]),
            )
        ]
        return Response({"view": "supplier", "rows": supplier_rows, "warnings": warnings})
