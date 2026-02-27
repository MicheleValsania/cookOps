from rest_framework import serializers

from apps.integration.models import DocumentExtraction, ExtractionStatus, IntegrationDocument


class IntegrationDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationDocument
        fields = (
            "id",
            "site",
            "document_type",
            "source",
            "filename",
            "content_type",
            "file_size",
            "file",
            "storage_path",
            "status",
            "metadata",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "filename",
            "content_type",
            "file_size",
            "storage_path",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        source = attrs.get("source", "upload")
        if source == "upload" and not attrs.get("file"):
            raise serializers.ValidationError({"file": "file is required when source is upload."})
        return attrs

    def create(self, validated_data):
        file_obj = validated_data.get("file")
        if file_obj is not None:
            validated_data["filename"] = file_obj.name
            validated_data["content_type"] = getattr(file_obj, "content_type", None)
            validated_data["file_size"] = getattr(file_obj, "size", None)
        document = super().create(validated_data)
        if document.file:
            document.storage_path = document.file.name
            document.save(update_fields=["storage_path", "updated_at"])
        return document


class DocumentExtractionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentExtraction
        fields = (
            "id",
            "document",
            "extractor_name",
            "extractor_version",
            "status",
            "raw_payload",
            "normalized_payload",
            "confidence",
            "error_message",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "document", "created_at", "updated_at")


class ExtractionIngestSerializer(serializers.Serializer):
    extraction_id = serializers.UUIDField()
    idempotency_key = serializers.CharField(max_length=255)
    target = serializers.ChoiceField(
        choices=("goods_receipt", "invoice"),
        required=False,
    )

    def validate(self, attrs):
        document = self.context["document"]
        extraction_id = attrs["extraction_id"]
        target = attrs.get("target") or document.document_type

        if target != document.document_type:
            raise serializers.ValidationError(
                {"target": "target must match document.document_type."}
            )

        try:
            extraction = document.extractions.get(pk=extraction_id)
        except DocumentExtraction.DoesNotExist as exc:
            raise serializers.ValidationError(
                {"extraction_id": "extraction_id does not belong to this document."}
            ) from exc

        if extraction.status != ExtractionStatus.SUCCEEDED:
            raise serializers.ValidationError(
                {"extraction_id": "Only succeeded extractions can be ingested."}
            )
        if not isinstance(extraction.normalized_payload, dict) or not extraction.normalized_payload:
            raise serializers.ValidationError(
                {"extraction_id": "normalized_payload must be a non-empty object."}
            )

        attrs["target"] = target
        attrs["extraction"] = extraction
        return attrs


class FicheSnapshotImportSerializer(serializers.Serializer):
    query = serializers.CharField(required=False, allow_blank=True, default="")
    limit = serializers.IntegerField(required=False, min_value=1, max_value=5000, default=500)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class FicheCatalogImportSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")
