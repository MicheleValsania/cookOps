from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import uuid

from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.api.v1.serializers import InventoryMovementSerializer
from apps.inventory.models import InventoryMovement
from apps.core.models import Site


class InventoryMovementViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = InventoryMovementSerializer
    queryset = InventoryMovement.objects.select_related("supplier_product", "lot").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        site_id = (self.request.query_params.get("site") or "").strip()
        if site_id:
            queryset = queryset.filter(Q(site_id=site_id) | Q(lot__site_id=site_id))
        try:
            limit = int(self.request.query_params.get("limit", "200"))
        except ValueError:
            limit = 200
        limit = max(1, min(limit, 1000))
        return queryset.order_by("-happened_at", "-id")[:limit]


def _movement_label(m: InventoryMovement) -> str:
    if m.supplier_code:
        return str(m.supplier_code).strip()
    if m.supplier_product_id and m.supplier_product:
        return m.supplier_product.name
    if m.raw_product_name:
        return m.raw_product_name
    return "UNSPECIFIED"


class InventoryStockSummaryView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        movements = (
            InventoryMovement.objects.select_related("supplier_product")
            .filter(Q(site_id=site_id) | Q(lot__site_id=site_id))
            .order_by("-happened_at", "-id")
        )
        grouped: dict[tuple[str, str], dict] = defaultdict(
            lambda: {
                "product_key": "",
                "product_label": "",
                "qty_unit": "",
                "total_in": Decimal("0"),
                "total_out": Decimal("0"),
                "current_stock": Decimal("0"),
            }
        )
        for m in movements:
            label = _movement_label(m)
            unit = (m.qty_unit or "").strip().lower()
            key = (label, unit)
            row = grouped[key]
            row["product_key"] = label
            row["product_label"] = label
            row["qty_unit"] = unit
            qty = Decimal(str(m.qty_value or "0"))
            if m.movement_type == "OUT":
                row["total_out"] += qty
                row["current_stock"] -= qty
            else:
                row["total_in"] += qty
                row["current_stock"] += qty

        results = [
            {
                "product_key": row["product_key"],
                "product_label": row["product_label"],
                "qty_unit": row["qty_unit"],
                "total_in": f"{row['total_in']:.3f}",
                "total_out": f"{row['total_out']:.3f}",
                "current_stock": f"{row['current_stock']:.3f}",
            }
            for row in grouped.values()
        ]
        results.sort(key=lambda item: (item["product_key"], item["qty_unit"]))
        return Response({"results": results, "count": len(results)}, status=status.HTTP_200_OK)


class InventoryApplyView(APIView):
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        site_id = str(payload.get("site") or "").strip()
        lines = payload.get("lines") if isinstance(payload.get("lines"), list) else []
        happened_at_raw = str(payload.get("happened_at") or "").strip()
        scope = str(payload.get("scope") or "total").strip()

        if not site_id:
            return Response({"detail": "site is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not Site.objects.filter(pk=site_id).exists():
            return Response({"detail": "site not found."}, status=status.HTTP_400_BAD_REQUEST)
        if not lines:
            return Response({"detail": "lines is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            happened_at = datetime.fromisoformat(happened_at_raw.replace("Z", "+00:00")) if happened_at_raw else datetime.now(timezone.utc)
        except ValueError:
            happened_at = datetime.now(timezone.utc)

        current_by_key: dict[tuple[str, str], Decimal] = defaultdict(lambda: Decimal("0"))
        current_movements = InventoryMovement.objects.select_related("supplier_product").filter(
            Q(site_id=site_id) | Q(lot__site_id=site_id)
        )
        for m in current_movements:
            label = _movement_label(m).strip()
            unit = str(m.qty_unit or "").strip().lower()
            key = (label, unit)
            qty = Decimal(str(m.qty_value or "0"))
            if m.movement_type == "OUT":
                current_by_key[key] -= qty
            else:
                current_by_key[key] += qty

        adjustment_id = str(uuid.uuid4())
        applied = []
        for idx, line in enumerate(lines):
            if not isinstance(line, dict):
                continue
            product_key = str(line.get("supplier_code") or line.get("product_key") or line.get("raw_product_name") or "").strip()
            qty_unit = str(line.get("qty_unit") or "").strip().lower()
            if not product_key or not qty_unit:
                continue
            raw_qty = str(line.get("qty_value") or "").replace(",", ".").strip()
            try:
                target_qty = Decimal(raw_qty)
            except (InvalidOperation, ValueError):
                continue
            current_qty = current_by_key.get((product_key, qty_unit), Decimal("0"))
            delta = target_qty - current_qty
            if delta == 0:
                continue
            movement_type = "IN" if delta > 0 else "OUT"
            InventoryMovement.objects.create(
                site_id=site_id,
                lot=None,
                supplier_product=None,
                supplier_code=product_key if line.get("supplier_code") else None,
                raw_product_name=product_key if not line.get("supplier_code") else str(line.get("raw_product_name") or ""),
                movement_type=movement_type,
                qty_value=abs(delta),
                qty_unit=qty_unit,
                happened_at=happened_at,
                ref_type="inventory_adjustment",
                ref_id=adjustment_id,
            )
            applied.append(
                {
                    "line": idx,
                    "product_key": product_key,
                    "qty_unit": qty_unit,
                    "current_qty": f"{current_qty:.3f}",
                    "target_qty": f"{target_qty:.3f}",
                    "delta": f"{delta:.3f}",
                    "movement_type": movement_type,
                }
            )

        return Response(
            {
                "adjustment_id": adjustment_id,
                "scope": scope,
                "applied_count": len(applied),
                "applied": applied,
            },
            status=status.HTTP_201_CREATED,
        )
