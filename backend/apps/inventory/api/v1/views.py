from collections import defaultdict
from datetime import datetime, time, timezone
from decimal import Decimal, InvalidOperation
import uuid

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone as dj_timezone
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import SupplierProduct
from apps.inventory.api.v1.serializers import (
    InventoryCountLineBulkUpsertSerializer,
    InventoryCountLineSerializer,
    InventoryMovementSerializer,
    InventorySectorSerializer,
    InventorySessionDetailSerializer,
    InventorySessionSerializer,
    StockPointSerializer,
)
from apps.inventory.models import (
    InventoryCountLine,
    InventoryMovement,
    InventorySector,
    InventorySession,
    InventorySessionStatus,
    MovementType,
    StockPoint,
)
from apps.core.models import Site
from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine, Invoice, InvoiceLine


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
        if m.supplier_product.supplier_sku:
            return str(m.supplier_product.supplier_sku).strip()
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


def _movement_group_key(m: InventoryMovement) -> tuple[str, str]:
    unit = (m.qty_unit or "").strip().lower()
    if m.supplier_product_id and m.supplier_product:
        return (f"product:{m.supplier_product_id}", unit)
    return (_movement_label(m), unit)


def _current_stock_map_for_site(site_id: str) -> dict[tuple[str, str], dict[str, Decimal | datetime | str]]:
    rows: dict[tuple[str, str], dict[str, Decimal | datetime | str]] = defaultdict(
        lambda: {"current_stock": Decimal("0"), "last_movement_at": None}
    )
    movements = (
        InventoryMovement.objects.select_related("supplier_product")
        .filter(Q(site_id=site_id) | Q(lot__site_id=site_id))
        .order_by("-happened_at", "-id")
    )
    for movement in movements:
        if not movement.supplier_product_id:
            continue
        key = (str(movement.supplier_product_id), str(movement.qty_unit or "").strip().lower())
        row = rows[key]
        qty = Decimal(str(movement.qty_value or "0"))
        if movement.movement_type == MovementType.OUT:
            row["current_stock"] = Decimal(str(row["current_stock"])) - qty
        else:
            row["current_stock"] = Decimal(str(row["current_stock"])) + qty
        if row["last_movement_at"] is None or movement.happened_at > row["last_movement_at"]:
            row["last_movement_at"] = movement.happened_at
    return rows


class InventoryStockSummaryView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        movements = list(
            InventoryMovement.objects.select_related("supplier_product", "supplier_product__supplier")
            .filter(Q(site_id=site_id) | Q(lot__site_id=site_id))
            .order_by("-happened_at", "-id")
        )
        goods_receipt_ref_ids = [m.ref_id for m in movements if str(m.ref_type or "") == "goods_receipt_line" and m.ref_id]
        invoice_ref_ids = [m.ref_id for m in movements if str(m.ref_type or "") == "invoice_line_fallback" and m.ref_id]
        goods_price_by_ref = {
            str(line.id): Decimal(str(line.unit_price))
            for line in GoodsReceiptLine.objects.filter(id__in=goods_receipt_ref_ids).exclude(unit_price__isnull=True)
        }
        invoice_price_by_ref = {
            str(line.id): Decimal(str(line.unit_price))
            for line in InvoiceLine.objects.filter(id__in=invoice_ref_ids).exclude(unit_price__isnull=True)
        }
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
                "valued_in_qty": Decimal("0"),
                "valued_in_amount": Decimal("0"),
            }
        )
        for m in movements:
            key = _movement_group_key(m)
            row = grouped[key]
            label = _movement_label(m)
            row["product_key"] = label
            row["product_label"] = label
            row["qty_unit"] = key[1]
            supplier_sku = ""
            if m.supplier_product_id and m.supplier_product and m.supplier_product.supplier_sku:
                supplier_sku = str(m.supplier_product.supplier_sku).strip()
            if not row["supplier_code"] and (supplier_sku or m.supplier_code):
                row["supplier_code"] = supplier_sku or str(m.supplier_code).strip()
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
                unit_price = None
                if str(m.ref_type or "") == "invoice_line_fallback":
                    row["in_from_invoice_fallback"] += qty
                    unit_price = invoice_price_by_ref.get(str(m.ref_id or ""))
                elif str(m.ref_type or "") == "goods_receipt_line":
                    row["in_from_docs"] += qty
                    unit_price = goods_price_by_ref.get(str(m.ref_id or ""))
                elif str(m.ref_type or "") != "inventory_adjustment":
                    row["in_from_docs"] += qty
                if unit_price is not None:
                    row["valued_in_qty"] += qty
                    row["valued_in_amount"] += qty * unit_price

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
                "weighted_avg_cost": (
                    f"{(row['valued_in_amount'] / row['valued_in_qty']):.4f}"
                    if row['valued_in_qty'] > 0 else None
                ),
                "stock_value": (
                    f"{(row['current_stock'] * (row['valued_in_amount'] / row['valued_in_qty'])):.2f}"
                    if row['valued_in_qty'] > 0 else None
                ),
                "last_movement_at": row["last_movement_at"].isoformat().replace("+00:00", "Z")
                if row["last_movement_at"]
                else None,
            }
            for row in grouped.values()
        ]
        results.sort(key=lambda item: (item["product_key"], item["qty_unit"]))
        return Response({"results": results, "count": len(results)}, status=status.HTTP_200_OK)


class InventorySectorListCreateView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        queryset = InventorySector.objects.select_related("site").all()
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        return Response(InventorySectorSerializer(queryset.order_by("sort_order", "name"), many=True).data)

    def post(self, request):
        serializer = InventorySectorSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        site = get_object_or_404(Site, pk=serializer.validated_data["site"].id)
        sector = InventorySector.objects.create(
            site=site,
            name=str(serializer.validated_data["name"]).strip(),
            code=str(serializer.validated_data.get("code") or "").strip() or None,
            sort_order=serializer.validated_data.get("sort_order", 0),
            is_active=serializer.validated_data.get("is_active", True),
        )
        return Response(InventorySectorSerializer(sector).data, status=status.HTTP_201_CREATED)


class InventorySectorDetailView(APIView):
    def patch(self, request, sector_id):
        sector = get_object_or_404(InventorySector, pk=sector_id)
        serializer = InventorySectorSerializer(sector, data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        for field in ("name", "sort_order", "is_active"):
            if field in serializer.validated_data:
                setattr(sector, field, serializer.validated_data[field])
        if "code" in serializer.validated_data:
            sector.code = str(serializer.validated_data.get("code") or "").strip() or None
        sector.save()
        return Response(InventorySectorSerializer(sector).data)


class StockPointListCreateView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        sector_id = (request.query_params.get("sector") or "").strip()
        queryset = StockPoint.objects.select_related("site", "sector").all()
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        if sector_id:
            queryset = queryset.filter(sector_id=sector_id)
        return Response(StockPointSerializer(queryset.order_by("sector__sort_order", "sort_order", "name"), many=True).data)

    def post(self, request):
        serializer = StockPointSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        site = get_object_or_404(Site, pk=serializer.validated_data["site"].id)
        sector = get_object_or_404(InventorySector, pk=serializer.validated_data["sector"].id, site=site)
        point = StockPoint.objects.create(
            site=site,
            sector=sector,
            name=str(serializer.validated_data["name"]).strip(),
            code=str(serializer.validated_data.get("code") or "").strip() or None,
            sort_order=serializer.validated_data.get("sort_order", 0),
            is_active=serializer.validated_data.get("is_active", True),
            metadata=serializer.validated_data.get("metadata", {}),
        )
        return Response(StockPointSerializer(point).data, status=status.HTTP_201_CREATED)


class StockPointDetailView(APIView):
    def patch(self, request, point_id):
        point = get_object_or_404(StockPoint.objects.select_related("site"), pk=point_id)
        serializer = StockPointSerializer(point, data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        if "sector" in serializer.validated_data:
            point.sector = get_object_or_404(InventorySector, pk=serializer.validated_data["sector"].id, site=point.site)
        for field in ("name", "sort_order", "is_active", "metadata"):
            if field in serializer.validated_data:
                setattr(point, field, serializer.validated_data[field])
        if "code" in serializer.validated_data:
            point.code = str(serializer.validated_data.get("code") or "").strip() or None
        point.save()
        return Response(StockPointSerializer(point).data)


class InventoryProductSearchView(APIView):
    SEARCH_LIMIT = 120

    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        q = str(request.query_params.get("q") or "").strip()
        supplier_id = str(request.query_params.get("supplier") or "").strip()
        category = str(request.query_params.get("category") or "").strip()
        active_only = str(request.query_params.get("active_only") or "1").strip().lower() not in {"0", "false", "no"}
        only_stocked = str(request.query_params.get("only_stocked") or "0").strip().lower() in {"1", "true", "yes"}

        stock_map = _current_stock_map_for_site(site_id)
        queryset = SupplierProduct.objects.select_related("supplier").all()
        if active_only:
            queryset = queryset.filter(active=True)
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        if category:
            queryset = queryset.filter(category__iexact=category)
        if q:
            queryset = queryset.filter(
                Q(name__icontains=q)
                | Q(supplier_sku__icontains=q)
                | Q(supplier__name__icontains=q)
                | Q(category__icontains=q)
            )
        products = []
        for product in queryset.order_by("supplier__name", "name")[: self.SEARCH_LIMIT * 3]:
            key = (str(product.id), str(product.uom or "").strip().lower())
            current_row = stock_map.get(key, {"current_stock": Decimal("0"), "last_movement_at": None})
            current_stock = Decimal(str(current_row.get("current_stock") or "0"))
            if only_stocked and current_stock == 0:
                continue
            last_movement_at = current_row.get("last_movement_at")
            products.append(
                {
                    "supplier_product_id": str(product.id),
                    "supplier_id": str(product.supplier_id),
                    "supplier_name": product.supplier.name,
                    "supplier_code": product.supplier_sku,
                    "product_name": product.name,
                    "category": product.category,
                    "qty_unit": product.uom,
                    "current_stock": f"{current_stock:.3f}",
                    "last_movement_at": last_movement_at.isoformat().replace("+00:00", "Z") if last_movement_at else None,
                    "active": bool(product.active),
                }
            )
            if len(products) >= self.SEARCH_LIMIT:
                break
        return Response({"results": products, "count": len(products)}, status=status.HTTP_200_OK)


class InventorySessionListCreateView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        status_filter = (request.query_params.get("status") or "").strip()
        queryset = InventorySession.objects.select_related("site", "sector").all()
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return Response(InventorySessionSerializer(queryset.order_by("-started_at"), many=True).data)

    def post(self, request):
        serializer = InventorySessionSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        site = get_object_or_404(Site, pk=serializer.validated_data["site"].id)
        sector = None
        if serializer.validated_data.get("sector"):
            sector = get_object_or_404(InventorySector, pk=serializer.validated_data["sector"].id, site=site)
        session = InventorySession.objects.create(
            site=site,
            sector=sector,
            label=str(serializer.validated_data.get("label") or "").strip() or None,
            status=serializer.validated_data.get("status", InventorySessionStatus.DRAFT),
            source_app=str(serializer.validated_data.get("source_app") or "traccia_mobile").strip() or "traccia_mobile",
            count_scope=serializer.validated_data.get("count_scope", "site"),
            notes=str(serializer.validated_data.get("notes") or "").strip() or None,
            metadata=serializer.validated_data.get("metadata", {}),
        )
        return Response(InventorySessionSerializer(session).data, status=status.HTTP_201_CREATED)


class InventorySessionDetailView(APIView):
    def get(self, request, session_id):
        session = get_object_or_404(
            InventorySession.objects.select_related("site", "sector").prefetch_related("lines__supplier_product__supplier", "lines__stock_point"),
            pk=session_id,
        )
        return Response(InventorySessionDetailSerializer(session).data)


class InventorySessionLinesBulkUpsertView(APIView):
    def post(self, request, session_id):
        session = get_object_or_404(InventorySession.objects.select_related("site", "sector"), pk=session_id)
        if session.status in {InventorySessionStatus.CLOSED, InventorySessionStatus.CANCELLED}:
            return Response({"detail": "session is not editable."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = InventoryCountLineBulkUpsertSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        stock_map = _current_stock_map_for_site(str(session.site_id))
        saved_lines = []
        for idx, row in enumerate(serializer.validated_data["lines"]):
            product = get_object_or_404(SupplierProduct.objects.select_related("supplier"), pk=row["supplier_product"])
            stock_point = None
            if row.get("stock_point"):
                stock_point = get_object_or_404(StockPoint.objects.select_related("sector"), pk=row["stock_point"], site=session.site)
                if session.sector_id and stock_point.sector_id != session.sector_id:
                    return Response({"detail": "stock_point sector does not match session sector."}, status=status.HTTP_400_BAD_REQUEST)
            qty_unit = str(row["qty_unit"]).strip().lower()
            expected_qty = Decimal(str(stock_map.get((str(product.id), qty_unit), {}).get("current_stock") or "0"))
            qty_value = Decimal(str(row["qty_value"]))
            delta_qty = qty_value - expected_qty
            line = InventoryCountLine.objects.filter(
                session=session,
                stock_point=stock_point,
                supplier_product=product,
                qty_unit=qty_unit,
            ).first()
            if line:
                line.qty_value = qty_value
                line.expected_qty = expected_qty
                line.delta_qty = delta_qty
                line.line_order = row.get("line_order", idx)
                line.metadata = row.get("metadata", {})
                line.save()
            else:
                line = InventoryCountLine.objects.create(
                    session=session,
                    stock_point=stock_point,
                    supplier_product=product,
                    qty_value=qty_value,
                    qty_unit=qty_unit,
                    expected_qty=expected_qty,
                    delta_qty=delta_qty,
                    line_order=row.get("line_order", idx),
                    metadata=row.get("metadata", {}),
                )
            saved_lines.append(line)
        if session.status == InventorySessionStatus.DRAFT:
            session.status = InventorySessionStatus.IN_PROGRESS
            session.save(update_fields=["status", "updated_at"])
        return Response(
            {
                "saved_count": len(saved_lines),
                "lines": InventoryCountLineSerializer(saved_lines, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class InventorySessionCloseView(APIView):
    def post(self, request, session_id):
        session = get_object_or_404(
            InventorySession.objects.select_related("site").prefetch_related("lines__supplier_product__supplier"),
            pk=session_id,
        )
        if session.status == InventorySessionStatus.CLOSED:
            return Response({"detail": "session already closed."}, status=status.HTTP_400_BAD_REQUEST)
        if session.status == InventorySessionStatus.CANCELLED:
            return Response({"detail": "cancelled session cannot be closed."}, status=status.HTTP_400_BAD_REQUEST)
        now = dj_timezone.now()
        created = 0
        for line in session.lines.all():
            delta = Decimal(str(line.delta_qty or "0"))
            if delta == 0:
                continue
            InventoryMovement.objects.create(
                site=session.site,
                lot=None,
                supplier_product=line.supplier_product,
                supplier_code=line.supplier_product.supplier_sku,
                raw_product_name=line.supplier_product.name,
                movement_type=MovementType.IN if delta > 0 else MovementType.OUT,
                qty_value=abs(delta),
                qty_unit=line.qty_unit,
                happened_at=now,
                ref_type="inventory_session_close",
                ref_id=str(session.id),
            )
            created += 1
        session.status = InventorySessionStatus.CLOSED
        session.closed_at = now
        session.save(update_fields=["status", "closed_at", "updated_at"])
        return Response(
            {
                "session_id": str(session.id),
                "created_adjustments": created,
                "closed_at": now.isoformat().replace("+00:00", "Z"),
            },
            status=status.HTTP_200_OK,
        )


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
                movement_type = MovementType.OUT if line.qty_value < 0 else MovementType.IN
                InventoryMovement.objects.create(
                    site=invoice.site,
                    lot=None,
                    supplier_product=line.supplier_product,
                    supplier_code=line.supplier_code,
                    raw_product_name=line.raw_product_name,
                    movement_type=movement_type,
                    qty_value=abs(line.qty_value),
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
