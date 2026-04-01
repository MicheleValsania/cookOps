from collections import defaultdict
from datetime import datetime, time, timezone
from decimal import Decimal, InvalidOperation
import uuid

from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.api.v1.serializers import InventoryMovementSerializer
from apps.inventory.models import InventoryMovement, MovementType
from apps.core.models import Site
from apps.purchasing.models import GoodsReceipt, Invoice


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


def _movement_display_name(m: InventoryMovement) -> str:
    if m.supplier_product_id and m.supplier_product:
        return m.supplier_product.name
    if m.raw_product_name:
        return m.raw_product_name
    return ""


class InventoryStockSummaryView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        movements = (
            InventoryMovement.objects.select_related("supplier_product", "supplier_product__supplier")
            .filter(Q(site_id=site_id) | Q(lot__site_id=site_id))
            .order_by("-happened_at", "-id")
        )
        grouped: dict[tuple[str, str], dict] = defaultdict(
            lambda: {
                "product_key": "",
                "product_label": "",
                "product_name": "",
                "supplier_code": "",
                "supplier_name": "",
                "product_category": "",
                "qty_unit": "",
                "total_in": Decimal("0"),
                "total_out": Decimal("0"),
                "in_from_docs": Decimal("0"),
                "in_from_invoice_fallback": Decimal("0"),
                "out_from_inventory": Decimal("0"),
                "out_other": Decimal("0"),
                "current_stock": Decimal("0"),
                "last_movement_at": None,
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
            if not row["supplier_code"] and m.supplier_code:
                row["supplier_code"] = str(m.supplier_code).strip()
            if not row["product_name"]:
                row["product_name"] = _movement_display_name(m)
            if not row["supplier_name"] and m.supplier_product_id and m.supplier_product and m.supplier_product.supplier:
                row["supplier_name"] = m.supplier_product.supplier.name
            if not row["product_category"] and m.supplier_product_id and m.supplier_product and m.supplier_product.category:
                row["product_category"] = str(m.supplier_product.category or "")
            qty = Decimal(str(m.qty_value or "0"))
            if row["last_movement_at"] is None or m.happened_at > row["last_movement_at"]:
                row["last_movement_at"] = m.happened_at
            if m.movement_type == "OUT":
                row["total_out"] += qty
                row["current_stock"] -= qty
                if str(m.ref_type or "") == "inventory_adjustment":
                    row["out_from_inventory"] += qty
                else:
                    row["out_other"] += qty
            else:
                row["total_in"] += qty
                row["current_stock"] += qty
                if str(m.ref_type or "") == "invoice_line_fallback":
                    row["in_from_invoice_fallback"] += qty
                elif str(m.ref_type or "") == "goods_receipt_line":
                    row["in_from_docs"] += qty
                elif str(m.ref_type or "") != "inventory_adjustment":
                    row["in_from_docs"] += qty

        results = [
            {
                "product_key": row["product_key"],
                "product_label": row["product_label"],
                "product_name": row["product_name"],
                "supplier_code": row["supplier_code"] or None,
                "supplier_name": row["supplier_name"],
                "product_category": row["product_category"],
                "qty_unit": row["qty_unit"],
                "total_in": f"{row['total_in']:.3f}",
                "total_out": f"{row['total_out']:.3f}",
                "in_from_docs": f"{row['in_from_docs']:.3f}",
                "in_from_invoice_fallback": f"{row['in_from_invoice_fallback']:.3f}",
                "out_from_inventory": f"{row['out_from_inventory']:.3f}",
                "out_other": f"{row['out_other']:.3f}",
                "current_stock": f"{row['current_stock']:.3f}",
                "last_movement_at": row["last_movement_at"].isoformat().replace("+00:00", "Z")
                if row["last_movement_at"]
                else None,
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


class InventoryRebuildFromPurchasingView(APIView):
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        site_id = str(payload.get("site") or request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not Site.objects.filter(pk=site_id).exists():
            return Response({"detail": "site not found."}, status=status.HTTP_400_BAD_REQUEST)

        created_goods = 0
        created_invoices = 0
        skipped_goods = 0
        skipped_invoices = 0

        receipts = GoodsReceipt.objects.prefetch_related("lines").filter(site_id=site_id)
        for receipt in receipts:
            for line in receipt.lines.all():
                ref_id = str(line.id)
                if InventoryMovement.objects.filter(ref_type="goods_receipt_line", ref_id=ref_id).exists():
                    skipped_goods += 1
                    continue
                InventoryMovement.objects.create(
                    site=receipt.site,
                    lot=None,
                    supplier_product=line.supplier_product,
                    supplier_code=line.supplier_code,
                    raw_product_name=line.raw_product_name,
                    movement_type=MovementType.IN,
                    qty_value=line.qty_value,
                    qty_unit=line.qty_unit,
                    happened_at=receipt.received_at,
                    ref_type="goods_receipt_line",
                    ref_id=ref_id,
                )
                created_goods += 1

        invoices = Invoice.objects.prefetch_related("lines").filter(site_id=site_id)
        for invoice in invoices:
            for line in invoice.lines.all():
                if line.goods_receipt_line_id:
                    continue
                ref_id = str(line.id)
                if InventoryMovement.objects.filter(ref_type="invoice_line_fallback", ref_id=ref_id).exists():
                    skipped_invoices += 1
                    continue
                happened_at = datetime.combine(invoice.invoice_date, time.min, tzinfo=timezone.utc)
                InventoryMovement.objects.create(
                    site=invoice.site,
                    lot=None,
                    supplier_product=line.supplier_product,
                    supplier_code=line.supplier_code,
                    raw_product_name=line.raw_product_name,
                    movement_type=MovementType.IN,
                    qty_value=line.qty_value,
                    qty_unit=line.qty_unit,
                    happened_at=happened_at,
                    ref_type="invoice_line_fallback",
                    ref_id=ref_id,
                )
                created_invoices += 1

        return Response(
            {
                "site": site_id,
                "created_goods_receipts": created_goods,
                "created_invoice_fallbacks": created_invoices,
                "skipped_goods_receipts": skipped_goods,
                "skipped_invoice_fallbacks": skipped_invoices,
            },
            status=status.HTTP_200_OK,
        )
