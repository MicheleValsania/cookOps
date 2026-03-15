import tempfile
from pathlib import Path
from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Site
from apps.integration.models import DocumentSource, DocumentType, IntegrationDocument, IntegrationImportBatch


@override_settings(MEDIA_ROOT=Path(tempfile.gettempdir()) / "cookops_test_media")
class IntegrationTracciaAssetImportApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Central Site", code="CENTRAL")

    @patch("apps.integration.api.v1.views.TracciaClient")
    def test_import_traccia_assets_creates_drive_documents(self, client_cls):
        client = client_cls.return_value
        client.request_json.return_value = (
            200,
            {
                "results": [
                    {
                        "id": "a6cb7672-ea95-44c3-9440-9eb55e383f0d",
                        "asset_type": "PHOTO_LABEL",
                        "file_name": "label-001.jpg",
                        "drive_file_id": "drive-001",
                        "drive_link": "https://drive.example/001",
                        "mime_type": "image/jpeg",
                        "sha256": "abc123",
                        "captured_at": "2026-03-15T08:30:00Z",
                        "uploaded_at": "2026-03-15T08:31:00Z",
                    }
                ]
            },
        )
        client.request_bytes.return_value = (200, {"Content-Type": "image/jpeg"}, b"jpeg-bytes")

        response = self.client.post(
            "/api/v1/integration/traccia-assets/import/",
            {"site": str(self.site.id), "limit": 10, "asset_type": "PHOTO_LABEL", "idempotency_key": "traccia-import-001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["created_count"], 1)
        self.assertEqual(IntegrationDocument.objects.count(), 1)
        document = IntegrationDocument.objects.get()
        self.assertEqual(document.site, self.site)
        self.assertEqual(document.document_type, DocumentType.LABEL_CAPTURE)
        self.assertEqual(document.source, DocumentSource.DRIVE)
        self.assertEqual(document.metadata["drive_file_id"], "drive-001")
        self.assertTrue(document.file.name)
        self.assertEqual(
            IntegrationImportBatch.objects.filter(
                source="traccia",
                import_type="asset_import",
                idempotency_key="traccia-import-001",
            ).count(),
            1,
        )

    @patch("apps.integration.api.v1.views.TracciaClient")
    def test_import_traccia_assets_skips_existing_drive_file(self, client_cls):
        IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.LABEL_CAPTURE,
            source=DocumentSource.DRIVE,
            filename="label-001.jpg",
            status="uploaded",
            metadata={"drive_file_id": "drive-001"},
        )
        client = client_cls.return_value
        client.request_json.return_value = (
            200,
            {
                "results": [
                    {
                        "id": "a6cb7672-ea95-44c3-9440-9eb55e383f0d",
                        "asset_type": "PHOTO_LABEL",
                        "file_name": "label-001.jpg",
                        "drive_file_id": "drive-001",
                        "drive_link": "https://drive.example/001",
                        "mime_type": "image/jpeg",
                        "sha256": "abc123",
                        "captured_at": "2026-03-15T08:30:00Z",
                        "uploaded_at": "2026-03-15T08:31:00Z",
                    }
                ]
            },
        )

        response = self.client.post(
            "/api/v1/integration/traccia-assets/import/",
            {"site": str(self.site.id), "limit": 10, "asset_type": "PHOTO_LABEL"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["created_count"], 0)
        self.assertEqual(response.json()["skipped_existing"], 1)
        self.assertEqual(IntegrationDocument.objects.count(), 1)
        client.request_bytes.assert_not_called()
