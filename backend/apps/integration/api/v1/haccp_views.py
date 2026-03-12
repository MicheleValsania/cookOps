from collections import Counter
from decimal import Decimal, InvalidOperation

from django.http import HttpRequest
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integration.api.v1.serializers import HaccpOcrValidationSerializer, HaccpScheduleSerializer
from apps.integration.services.traccia_client import TracciaClient, TracciaClientError
from apps.purchasing.models import GoodsReceiptLine, InvoiceGoodsReceiptMatch, InvoiceLine


def _pass_through_headers(request: HttpRequest):
    idempotency_key = request.headers.get("Idempotency-Key")
    return {"Idempotency-Key": idempotency_key} if idempotency_key else {}


def _proxy_error(exc: TracciaClientError):
    return Response(exc.payload, status=exc.status_code)


def _payload_results(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            return results
    return []


def _normalize_text(value) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _serialize_goods_receipt_line(line: GoodsReceiptLine):
    return {
        "id": str(line.id),
        "delivery_note_number": line.receipt.delivery_note_number,
        "received_at": line.receipt.received_at.isoformat(),
        "supplier_code": line.supplier_code,
        "raw_product_name": line.raw_product_name,
        "supplier_lot_code": line.supplier_lot_code,
        "qty_value": f"{line.qty_value:.3f}",
        "qty_unit": line.qty_unit,
    }


def _serialize_invoice_line(line: InvoiceLine):
    return {
        "id": str(line.id),
        "invoice_number": line.invoice.invoice_number,
        "invoice_date": line.invoice.invoice_date.isoformat(),
        "supplier_code": line.supplier_code,
        "raw_product_name": line.raw_product_name,
        "qty_value": f"{line.qty_value:.3f}",
        "qty_unit": line.qty_unit,
        "goods_receipt_line": str(line.goods_receipt_line_id) if line.goods_receipt_line_id else None,
    }


def _serialize_match(match: InvoiceGoodsReceiptMatch):
    return {
        "id": str(match.id),
        "status": match.status,
        "invoice_line": str(match.invoice_line_id),
        "goods_receipt_line": str(match.goods_receipt_line_id),
        "matched_qty_value": f"{match.matched_qty_value:.3f}" if match.matched_qty_value is not None else None,
        "matched_amount": str(match.matched_amount) if match.matched_amount is not None else None,
    }


class HaccpTracciaReconciliationOverviewView(APIView):
    MATCH_SCAN_LIMIT = 5

    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        limit = (request.query_params.get("limit") or "120").strip()

        try:
            client = TracciaClient()
            lifecycle_code, lifecycle_payload = client.request_json(
                "GET",
                "/api/v1/haccp/lifecycle-events/",
                params={"site": site_id, "limit": limit},
                headers=_pass_through_headers(request),
            )
            schedule_code, schedule_payload = client.request_json(
                "GET",
                "/api/v1/haccp/schedules/",
                params={"site": site_id, "task_type": "label_print"},
                headers=_pass_through_headers(request),
            )
            if lifecycle_code >= 400:
                return Response(lifecycle_payload, status=lifecycle_code)
            if schedule_code >= 400:
                return Response(schedule_payload, status=schedule_code)
        except TracciaClientError as exc:
            return _proxy_error(exc)

        lifecycle_rows = _payload_results(lifecycle_payload)
        schedule_rows = _payload_results(schedule_payload)

        goods_receipt_lines = list(
            GoodsReceiptLine.objects.select_related("receipt", "supplier_product", "receipt__supplier")
            .filter(receipt__site_id=site_id)
            .order_by("-receipt__received_at", "-created_at")
        )
        invoice_lines = list(
            InvoiceLine.objects.select_related("invoice", "supplier_product", "goods_receipt_line__receipt")
            .filter(invoice__site_id=site_id)
            .order_by("-invoice__invoice_date", "-created_at")
        )
        match_rows = list(
            InvoiceGoodsReceiptMatch.objects.select_related("invoice_line__invoice", "goods_receipt_line__receipt")
            .filter(invoice_line__invoice__site_id=site_id)
            .order_by("-created_at")
        )

        goods_by_code: dict[str, list[GoodsReceiptLine]] = {}
        goods_by_name: dict[str, list[GoodsReceiptLine]] = {}
        goods_by_lot: dict[str, list[GoodsReceiptLine]] = {}
        for line in goods_receipt_lines:
            code_key = _normalize_text(line.supplier_code)
            name_values = {
                _normalize_text(line.raw_product_name),
                _normalize_text(line.supplier_product.name if line.supplier_product_id else ""),
            }
            lot_key = _normalize_text(line.supplier_lot_code)
            if code_key:
                goods_by_code.setdefault(code_key, []).append(line)
            for name_key in name_values:
                if name_key:
                    goods_by_name.setdefault(name_key, []).append(line)
            if lot_key:
                goods_by_lot.setdefault(lot_key, []).append(line)

        invoice_by_code: dict[str, list[InvoiceLine]] = {}
        invoice_by_name: dict[str, list[InvoiceLine]] = {}
        for line in invoice_lines:
            code_key = _normalize_text(line.supplier_code)
            name_values = {
                _normalize_text(line.raw_product_name),
                _normalize_text(line.supplier_product.name if line.supplier_product_id else ""),
            }
            if code_key:
                invoice_by_code.setdefault(code_key, []).append(line)
            for name_key in name_values:
                if name_key:
                    invoice_by_name.setdefault(name_key, []).append(line)

        matches_by_gr: dict[str, list[InvoiceGoodsReceiptMatch]] = {}
        matches_by_invoice: dict[str, list[InvoiceGoodsReceiptMatch]] = {}
        for match in match_rows:
            matches_by_gr.setdefault(str(match.goods_receipt_line_id), []).append(match)
            matches_by_invoice.setdefault(str(match.invoice_line_id), []).append(match)

        overview_rows = []
        status_counter = Counter()

        for row in lifecycle_rows:
            lot = row.get("lot") if isinstance(row.get("lot"), dict) else {}
            supplier_code = _normalize_text(row.get("supplier_code"))
            product_label = _normalize_text(row.get("product_label") or row.get("product_name") or row.get("label"))
            supplier_lot_code = _normalize_text(lot.get("supplier_lot_code") or row.get("supplier_lot_code"))
            qty_unit = str(row.get("qty_unit") or row.get("unit") or "").strip().lower()
            event_qty = _to_decimal(row.get("qty_value") or row.get("quantity") or "0")

            candidate_goods: list[GoodsReceiptLine] = []
            candidate_invoices: list[InvoiceLine] = []

            for candidate in goods_by_lot.get(supplier_lot_code, []):
                if candidate not in candidate_goods:
                    candidate_goods.append(candidate)
            for candidate in goods_by_code.get(supplier_code, []):
                if candidate not in candidate_goods:
                    candidate_goods.append(candidate)
            for candidate in goods_by_name.get(product_label, []):
                if candidate not in candidate_goods:
                    candidate_goods.append(candidate)

            for candidate in invoice_by_code.get(supplier_code, []):
                if candidate not in candidate_invoices:
                    candidate_invoices.append(candidate)
            for candidate in invoice_by_name.get(product_label, []):
                if candidate not in candidate_invoices:
                    candidate_invoices.append(candidate)

            if not candidate_goods and product_label:
                for line in goods_receipt_lines:
                    name_key = _normalize_text(line.raw_product_name or (line.supplier_product.name if line.supplier_product_id else ""))
                    if name_key and (product_label in name_key or name_key in product_label):
                        candidate_goods.append(line)
                        if len(candidate_goods) >= self.MATCH_SCAN_LIMIT:
                            break

            if not candidate_invoices and product_label:
                for line in invoice_lines:
                    name_key = _normalize_text(line.raw_product_name or (line.supplier_product.name if line.supplier_product_id else ""))
                    if name_key and (product_label in name_key or name_key in product_label):
                        candidate_invoices.append(line)
                        if len(candidate_invoices) >= self.MATCH_SCAN_LIMIT:
                            break

            if qty_unit:
                candidate_goods = [line for line in candidate_goods if str(line.qty_unit).strip().lower() == qty_unit]
                candidate_invoices = [line for line in candidate_invoices if str(line.qty_unit).strip().lower() == qty_unit]

            matched_pairs: list[InvoiceGoodsReceiptMatch] = []
            alerts: list[str] = []
            goods_match_ids = set()
            invoice_match_ids = set()

            for line in candidate_goods:
                for match in matches_by_gr.get(str(line.id), []):
                    if str(match.id) not in goods_match_ids:
                        goods_match_ids.add(str(match.id))
                        matched_pairs.append(match)
            for line in candidate_invoices:
                for match in matches_by_invoice.get(str(line.id), []):
                    if str(match.id) not in invoice_match_ids and str(match.id) not in goods_match_ids:
                        invoice_match_ids.add(str(match.id))
                        matched_pairs.append(match)

            goods_qty = sum((line.qty_value for line in candidate_goods), Decimal("0"))
            invoice_qty = sum((line.qty_value for line in candidate_invoices), Decimal("0"))

            if candidate_goods and not matched_pairs:
                alerts.append("Bolla trovata ma non ancora riconciliata con una fattura.")
            if candidate_invoices and not matched_pairs:
                alerts.append("Fattura trovata ma non ancora riconciliata con una bolla.")
            if supplier_lot_code and candidate_goods and not any(_normalize_text(line.supplier_lot_code) == supplier_lot_code for line in candidate_goods):
                alerts.append("Codice lotto Traccia non trovato sulle bolle locali.")
            if event_qty > 0 and goods_qty > 0 and qty_unit and abs(goods_qty - event_qty) > Decimal("0.001"):
                alerts.append("Quantita lifecycle diversa dal cumulato delle bolle candidate.")

            if matched_pairs:
                reconcile_status = "reconciled"
            elif candidate_goods and candidate_invoices:
                reconcile_status = "documents_found"
            elif candidate_goods:
                reconcile_status = "goods_receipt_only"
            elif candidate_invoices:
                reconcile_status = "invoice_only"
            else:
                reconcile_status = "missing"

            status_counter[reconcile_status] += 1

            overview_rows.append(
                {
                    "event_id": str(row.get("event_id") or row.get("id") or ""),
                    "event_type": str(row.get("event_type") or row.get("type") or "movement"),
                    "happened_at": row.get("happened_at") or row.get("created_at"),
                    "product_label": row.get("product_label") or row.get("product_name") or row.get("label") or "-",
                    "supplier_code": row.get("supplier_code") or "",
                    "qty_value": str(row.get("qty_value") or row.get("quantity") or "0"),
                    "qty_unit": row.get("qty_unit") or row.get("unit") or "",
                    "lot": {
                        "internal_lot_code": lot.get("internal_lot_code") or lot.get("code") or row.get("internal_lot_code") or "",
                        "supplier_lot_code": lot.get("supplier_lot_code") or row.get("supplier_lot_code") or "",
                        "status": lot.get("status") or "",
                        "dlc_date": lot.get("dlc_date") or "",
                    },
                    "reconcile_status": reconcile_status,
                    "goods_receipts": [_serialize_goods_receipt_line(line) for line in candidate_goods[: self.MATCH_SCAN_LIMIT]],
                    "invoices": [_serialize_invoice_line(line) for line in candidate_invoices[: self.MATCH_SCAN_LIMIT]],
                    "matches": [_serialize_match(match) for match in matched_pairs[: self.MATCH_SCAN_LIMIT]],
                    "alerts": alerts,
                }
            )

        schedule_counter = Counter(str(item.get("status") or "planned") for item in schedule_rows)

        return Response(
            {
                "site": site_id,
                "summary": {
                    "lifecycle_events": len(lifecycle_rows),
                    "goods_receipt_lines": len(goods_receipt_lines),
                    "invoice_lines": len(invoice_lines),
                    "matches": len(match_rows),
                    "reconciled_events": status_counter["reconciled"],
                    "goods_receipt_only_events": status_counter["goods_receipt_only"],
                    "invoice_only_events": status_counter["invoice_only"],
                    "missing_events": status_counter["missing"],
                    "documents_found_events": status_counter["documents_found"],
                    "label_tasks_planned": schedule_counter["planned"],
                    "label_tasks_done": schedule_counter["done"],
                },
                "label_schedule_summary": {
                    "planned": schedule_counter["planned"],
                    "done": schedule_counter["done"],
                    "skipped": schedule_counter["skipped"],
                    "cancelled": schedule_counter["cancelled"],
                },
                "results": overview_rows,
            },
            status=status.HTTP_200_OK,
        )


class HaccpOcrQueueView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        limit = (request.query_params.get("limit") or "100").strip()
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "GET",
                "/api/v1/haccp/ocr-results/",
                params={"site": site_id, "limit": limit},
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)


class HaccpOcrValidateView(APIView):
    def post(self, request, document_id):
        serializer = HaccpOcrValidationSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "POST",
                f"/api/v1/haccp/ocr-results/{document_id}/validate/",
                data=serializer.validated_data,
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)


class HaccpLifecycleEventListView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        limit = (request.query_params.get("limit") or "200").strip()
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "GET",
                "/api/v1/haccp/lifecycle-events/",
                params={"site": site_id, "limit": limit},
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)


class HaccpSectorListView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "GET",
                "/api/v1/haccp/sectors/",
                params={"site": site_id},
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)


class HaccpColdPointListView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        if not site_id:
            return Response({"detail": "site query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        sector_id = (request.query_params.get("sector") or "").strip()
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "GET",
                "/api/v1/haccp/cold-points/",
                params={"site": site_id, "sector": sector_id},
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)


class HaccpSectorSyncView(APIView):
    def post(self, request):
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "POST",
                "/api/v1/haccp/sectors/sync/",
                data=request.data,
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)


class HaccpColdPointSyncView(APIView):
    def post(self, request):
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "POST",
                "/api/v1/haccp/cold-points/sync/",
                data=request.data,
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)


class HaccpScheduleListCreateView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        task_type = (request.query_params.get("task_type") or "").strip()
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "GET",
                "/api/v1/haccp/schedules/",
                params={"site": site_id, "task_type": task_type},
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)

    def post(self, request):
        serializer = HaccpScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "POST",
                "/api/v1/haccp/schedules/",
                data=serializer.validated_data,
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)


class HaccpScheduleDetailView(APIView):
    def patch(self, request, schedule_id):
        serializer = HaccpScheduleSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "PATCH",
                f"/api/v1/haccp/schedules/{schedule_id}/",
                data=serializer.validated_data,
                headers=_pass_through_headers(request),
            )
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)

    def delete(self, request, schedule_id):
        try:
            client = TracciaClient()
            code, payload = client.request_json(
                "DELETE",
                f"/api/v1/haccp/schedules/{schedule_id}/",
                headers=_pass_through_headers(request),
            )
            if code == status.HTTP_204_NO_CONTENT:
                return Response(status=code)
            return Response(payload, status=code)
        except TracciaClientError as exc:
            return _proxy_error(exc)
