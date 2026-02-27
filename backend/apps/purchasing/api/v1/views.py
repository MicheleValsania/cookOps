from rest_framework import mixins, status, viewsets
from rest_framework.response import Response

from apps.integration.import_batches import complete_batch, fail_batch, find_completed_batch, start_batch
from apps.purchasing.api.v1.serializers import GoodsReceiptSerializer
from apps.purchasing.models import GoodsReceipt


class GoodsReceiptViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = GoodsReceipt.objects.all()
    serializer_class = GoodsReceiptSerializer

    def create(self, request, *args, **kwargs):
        source = "api"
        import_type = "goods_receipt"
        idempotency_key = request.headers.get("Idempotency-Key")
        if not idempotency_key:
            return Response(
                {"detail": "Idempotency-Key header is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = find_completed_batch(source, import_type, idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(source, import_type, idempotency_key, request.data)

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            fail_batch(batch, status.HTTP_400_BAD_REQUEST, serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            instance = serializer.save()
            data = self.get_serializer(instance).data
            complete_batch(batch, status.HTTP_201_CREATED, data)
            headers = self.get_success_headers(data)
            return Response(data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise
