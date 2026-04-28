import tempfile
from pathlib import Path

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.core.models import Site
from apps.integration.models import DocumentExtraction, IntegrationDocument


@override_settings(MEDIA_ROOT=Path(tempfile.gettempdir()) / "cookops_test_media")
class IntegrationOcrApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="OCR Site", code="SITE-OCR")

    def test_upload_document_returns_201(self):
        file_obj = SimpleUploadedFile("invoice.pdf", b"dummy-pdf-content", content_type="application/pdf")
        payload = {
            "site": str(self.site.id),
            "document_type": "invoice",
            "source": "upload",
            "file": file_obj,
        }

        response = self.client.post("/api/v1/integration/documents/", payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(IntegrationDocument.objects.count(), 1)
        self.assertEqual(IntegrationDocument.objects.first().filename, "invoice.pdf")

    def test_open_uploaded_document_file_returns_200(self):
        file_obj = SimpleUploadedFile("invoice.pdf", b"dummy-pdf-content", content_type="application/pdf")
        response = self.client.post(
            "/api/v1/integration/documents/",
            {
                "site": str(self.site.id),
                "document_type": "invoice",
                "source": "upload",
                "file": file_obj,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document_id = response.json()["id"]
        file_response = self.client.get(f"/api/v1/integration/documents/{document_id}/file/")
        self.assertEqual(file_response.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(file_response.streaming_content) if hasattr(file_response, "streaming_content") else file_response.content, b"dummy-pdf-content")

    def test_create_extraction_returns_201(self):
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type="goods_receipt",
            source="api",
            filename="bl-001.json",
            status="uploaded",
        )
        payload = {
            "extractor_name": "ocr-engine",
            "extractor_version": "0.1",
            "status": "succeeded",
            "raw_payload": {"supplier": "Metro"},
            "normalized_payload": {"delivery_note_number": "BL-001"},
            "confidence": "98.10",
        }

        response = self.client.post(
            f"/api/v1/integration/documents/{document.id}/extractions/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DocumentExtraction.objects.count(), 1)

    def test_create_extraction_for_missing_document_returns_404(self):
        payload = {
            "extractor_name": "ocr-engine",
            "status": "failed",
            "raw_payload": {},
        }

        response = self.client.post(
            "/api/v1/integration/documents/11111111-1111-1111-1111-111111111111/extractions/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json()["code"], "not_found")

    def test_extract_claude_uses_mock_payload_and_creates_extraction(self):
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type="goods_receipt",
            source="api",
            filename="bl-claude.pdf",
            status="uploaded",
            metadata={
                "mock_claude_normalized_payload": {
                    "site": str(self.site.id),
                    "supplier": "11111111-1111-1111-1111-111111111111",
                    "delivery_note_number": "BL-MOCK-001",
                    "received_at": "2026-03-01T10:00:00Z",
                    "metadata": {"source": "mock"},
                    "lines": [{"raw_product_name": "Milk", "qty_value": "1.000", "qty_unit": "l"}],
                }
            },
        )

        response = self.client.post(
            f"/api/v1/integration/documents/{document.id}/extract-claude/",
            {"idempotency_key": "claude-mock-001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DocumentExtraction.objects.count(), 1)
        extraction = DocumentExtraction.objects.first()
        self.assertEqual(extraction.extractor_name, "claude")
        self.assertEqual(extraction.status, "succeeded")
