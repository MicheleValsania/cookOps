from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.integration.import_batches import complete_batch, fail_batch, find_completed_batch, start_batch
from apps.pos.api.v1.serializers import SalesEventDailyImportSerializer
from apps.pos.models import SalesEventDaily


class SalesEventDailyImportViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = SalesEventDaily.objects.all()
    serializer_class = SalesEventDailyImportSerializer

    def create(self, request, *args, **kwargs):
        source = "api"
        import_type = "pos_sales_daily"
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
