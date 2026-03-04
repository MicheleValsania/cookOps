from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integration.import_batches import complete_batch, fail_batch, find_completed_batch, start_batch
from apps.purchasing.api.v1.serializers import (
    AutoReconciliationSerializer,
    GoodsReceiptSerializer,
    InvoiceGoodsReceiptMatchSerializer,
    InvoiceSerializer,
)
from apps.purchasing.models import GoodsReceipt, Invoice, InvoiceGoodsReceiptMatch
from apps.purchasing.services.reconciliation_auto_match import auto_match_invoice_lines


class GoodsReceiptViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = GoodsReceipt.objects.select_related("site", "supplier").prefetch_related("lines").all()
    serializer_class = GoodsReceiptSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        site_id = (self.request.query_params.get("site") or "").strip()
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        return queryset.order_by("-received_at", "-created_at")

    def create(self, request, *args, **kwargs):
        source = "api"
        import_type = "goods_receipt"
        idempotency_key = request.headers.get("Idempotency-Key")
        if not idempotency_key:
            raise ValidationError({"idempotency_key": "Idempotency-Key header is required."})

        existing = find_completed_batch(source, import_type, idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(source, import_type, idempotency_key, request.data)

        try:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            instance = serializer.save()
            data = self.get_serializer(instance).data
            complete_batch(batch, status.HTTP_201_CREATED, data)
            headers = self.get_success_headers(data)
            return Response(data, status=status.HTTP_201_CREATED, headers=headers)
        except ValidationError as exc:
            fail_batch(batch, status.HTTP_400_BAD_REQUEST, exc.detail)
            raise
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


class InvoiceViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Invoice.objects.select_related("site", "supplier").prefetch_related("lines").all()
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        site_id = (self.request.query_params.get("site") or "").strip()
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        return queryset.order_by("-invoice_date", "-created_at")

    def create(self, request, *args, **kwargs):
        source = "api"
        import_type = "invoice"
        idempotency_key = request.headers.get("Idempotency-Key")
        if not idempotency_key:
            raise ValidationError({"idempotency_key": "Idempotency-Key header is required."})

        existing = find_completed_batch(source, import_type, idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(source, import_type, idempotency_key, request.data)

        try:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            instance = serializer.save()
            data = self.get_serializer(instance).data
            complete_batch(batch, status.HTTP_201_CREATED, data)
            headers = self.get_success_headers(data)
            return Response(data, status=status.HTTP_201_CREATED, headers=headers)
        except ValidationError as exc:
            fail_batch(batch, status.HTTP_400_BAD_REQUEST, exc.detail)
            raise
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


class InvoiceGoodsReceiptMatchViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = InvoiceGoodsReceiptMatch.objects.select_related(
        "invoice_line__invoice",
        "goods_receipt_line__receipt",
    ).all()
    serializer_class = InvoiceGoodsReceiptMatchSerializer


class InvoiceAutoMatchView(APIView):
    def post(self, request):
        serializer = AutoReconciliationSerializer(data=request.data or {}, context={})
        serializer.is_valid(raise_exception=True)
        invoice = serializer.context["invoice"]
        qty_tolerance_ratio = serializer.validated_data["qty_tolerance_ratio"]
        outcome = auto_match_invoice_lines(invoice, qty_tolerance_ratio=qty_tolerance_ratio)
        return Response(
            {
                "invoice_id": str(invoice.id),
                "created_matches": outcome.created_matches,
                "linked_invoice_lines": outcome.linked_invoice_lines,
                "match_ids": outcome.match_ids,
                "warnings": outcome.warnings,
            },
            status=status.HTTP_200_OK,
        )
