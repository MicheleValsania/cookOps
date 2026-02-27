from rest_framework import serializers

from apps.integration.models import DocumentExtraction, IntegrationDocument


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
