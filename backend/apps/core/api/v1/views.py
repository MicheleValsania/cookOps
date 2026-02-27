from collections import defaultdict
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
from apps.core.services.service_ingredients import extract_ingredients
from apps.integration.models import RecipeSnapshot


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
    @transaction.atomic
    def post(self, request):
        serializer = ServiceMenuEntrySyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        site = get_object_or_404(Site, id=serializer.validated_data["site_id"])
        service_date = serializer.validated_data["service_date"]
        entries = serializer.validated_data["entries"]

        ServiceMenuEntry.objects.filter(site=site, service_date=service_date).delete()

        instances = [
            ServiceMenuEntry(
                site=site,
                service_date=service_date,
                space_key=item["space_key"],
                section=item.get("section") or None,
                title=item["title"],
                fiche_product_id=item.get("fiche_product_id"),
                expected_qty=item.get("expected_qty") or Decimal("1"),
                sort_order=item.get("sort_order", 0),
                is_active=item.get("is_active", True),
                metadata=item.get("metadata") or {},
            )
            for item in entries
        ]

        ServiceMenuEntry.objects.bulk_create(instances)

        created = ServiceMenuEntry.objects.filter(site=site, service_date=service_date).order_by("sort_order", "title")
        return Response(
            {
                "site": str(site.id),
                "service_date": service_date,
                "count": created.count(),
                "entries": ServiceMenuEntrySerializer(created, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ServiceIngredientsView(APIView):
    def get(self, request):
        site_id = request.query_params.get("site")
        service_date = request.query_params.get("date")
        view_mode = request.query_params.get("view", "supplier")

        if not site_id or not service_date:
            return Response({"detail": "Query params 'site' and 'date' are required."}, status=status.HTTP_400_BAD_REQUEST)

        entries = ServiceMenuEntry.objects.filter(site_id=site_id, service_date=service_date, is_active=True).order_by(
            "space_key", "sort_order", "title"
        )
        if not entries.exists():
            return Response({"rows": [], "warnings": ["Nessuna voce menu attiva per data/sede selezionata."]})

        fiche_ids = [entry.fiche_product_id for entry in entries if entry.fiche_product_id]
        warnings: list[str] = []

        snapshots = {}
        for entry in entries:
            if not entry.fiche_product_id:
                continue
            snapshot = (
                RecipeSnapshot.objects.filter(fiche_product_id=entry.fiche_product_id)
                .order_by("-source_updated_at", "-created_at")
                .first()
            )
            if snapshot:
                snapshots[entry.fiche_product_id] = snapshot

        supplier_agg: dict[tuple[str, str, str], Decimal] = defaultdict(lambda: Decimal("0"))
        recipe_rows: list[dict] = []

        for entry in entries:
            if not entry.fiche_product_id:
                warnings.append(f"'{entry.title}': fiche_product_id mancante.")
                continue

            snapshot = snapshots.get(entry.fiche_product_id)
            if not snapshot:
                warnings.append(f"'{entry.title}': nessuna fiche importata trovata per {entry.fiche_product_id}.")
                continue

            ingredients = extract_ingredients(snapshot.payload or {})
            if not ingredients:
                warnings.append(f"'{entry.title}': nessun ingrediente nel payload fiche.")
                continue

            multiplier = entry.expected_qty or Decimal("1")
            recipe_ingredients: list[dict] = []
            for ing in ingredients:
                qty_total = (ing["qty"] or Decimal("0")) * multiplier
                supplier = ing["supplier"] or "Senza fornitore"
                unit = ing["unit"] or "pc"
                supplier_agg[(supplier, ing["name"], unit)] += qty_total
                recipe_ingredients.append(
                    {
                        "ingredient": ing["name"],
                        "supplier": supplier,
                        "qty_total": str(qty_total),
                        "unit": unit,
                    }
                )

            recipe_rows.append(
                {
                    "space": entry.space_key,
                    "section": entry.section,
                    "title": entry.title,
                    "expected_qty": str(multiplier),
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
            }
            for (supplier, ingredient, unit), total in sorted(supplier_agg.items(), key=lambda item: (item[0][0], item[0][1]))
        ]
        return Response({"view": "supplier", "rows": supplier_rows, "warnings": warnings})
