from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integration.api.v1.serializers import (
    DocumentExtractionSerializer,
    ExtractionIngestSerializer,
    IntegrationDocumentSerializer,
)
from apps.integration.fiches_titles import fetch_recipe_titles
from apps.integration.import_batches import complete_batch, fail_batch, find_completed_batch, start_batch
from apps.integration.models import DocumentExtraction, IntegrationDocument
from apps.purchasing.api.v1.serializers import GoodsReceiptSerializer, InvoiceSerializer


class IntegrationDocumentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = IntegrationDocument.objects.all()
    serializer_class = IntegrationDocumentSerializer
    parser_classes = (MultiPartParser, FormParser)


class DocumentExtractionViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentExtractionSerializer
    queryset = DocumentExtraction.objects.all()

    def get_document(self) -> IntegrationDocument:
        return get_object_or_404(IntegrationDocument, pk=self.kwargs["document_id"])

    def perform_create(self, serializer):
        serializer.save(document=self.get_document())


class DocumentIngestViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = IntegrationDocument.objects.all()
    serializer_class = ExtractionIngestSerializer

    def get_document(self) -> IntegrationDocument:
        return get_object_or_404(IntegrationDocument, pk=self.kwargs["document_id"])

    def create(self, request, *args, **kwargs):
        document = self.get_document()
        serializer = self.get_serializer(data=request.data, context={"document": document})
        serializer.is_valid(raise_exception=True)

        idempotency_key = serializer.validated_data["idempotency_key"]
        extraction = serializer.validated_data["extraction"]
        target = serializer.validated_data["target"]

        source = "ocr"
        import_type = target

        existing = find_completed_batch(source, import_type, idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        payload = extraction.normalized_payload
        batch = start_batch(
            source,
            import_type,
            idempotency_key,
            {
                "document_id": str(document.id),
                "extraction_id": str(extraction.id),
                "payload": payload,
            },
        )

        import_serializer_class = GoodsReceiptSerializer if target == "goods_receipt" else InvoiceSerializer
        try:
            import_serializer = import_serializer_class(data=payload)
            import_serializer.is_valid(raise_exception=True)
            instance = import_serializer.save()
            data = import_serializer_class(instance).data
            complete_batch(batch, status.HTTP_201_CREATED, data)
            return Response(data, status=status.HTTP_201_CREATED)
        except ValidationError as exc:
            fail_batch(batch, status.HTTP_400_BAD_REQUEST, exc.detail)
            raise
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


class FicheRecipeTitleListView(APIView):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        try:
            limit = int(request.query_params.get("limit", 30))
        except ValueError:
            limit = 30

        titles = fetch_recipe_titles(query=query, limit=limit)
        return Response({"results": titles})
