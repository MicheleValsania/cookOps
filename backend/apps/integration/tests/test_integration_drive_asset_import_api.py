import tempfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Site
from apps.integration.models import DocumentSource, DocumentType, IntegrationDocument, IntegrationImportBatch


@override_settings(MEDIA_ROOT=Path(tempfile.gettempdir()) / "cookops_test_media")
class IntegrationDriveAssetImportApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Central Site", code="CENTRAL")

    @patch("apps.integration.services.drive_importer.run_claude_extraction")
    @patch("apps.integration.services.drive_importer.DriveClient")
    def test_import_drive_assets_creates_documents(self, client_cls, extract_mock):
        client = client_cls.return_value
        extract_mock.return_value = SimpleNamespace(status="succeeded", error_message="")
        client.folder_id = "folder-001"
        client.iter_folder_files.return_value = iter([
            {
                "id": "drive-001",
                "name": "label-001.jpg",
                "mimeType": "image/jpeg",
                "createdTime": "2026-03-15T08:30:00Z",
                "modifiedTime": "2026-03-15T08:31:00Z",
                "webViewLink": "https://drive.google.com/file/d/drive-001/view",
            }
        ])
        client.download_file.return_value = ({"Content-Type": "image/jpeg"}, b"jpeg-bytes")

        response = self.client.post(
            "/api/v1/integration/drive-assets/import/",
            {"site": str(self.site.id), "limit": 10, "document_type": "label_capture", "idempotency_key": "drive-import-001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["created_count"], 1)
        self.assertEqual(response.json()["scanned_count"], 1)
        self.assertEqual(response.json()["extracted_count"], 1)
        document = IntegrationDocument.objects.get()
        self.assertEqual(document.site, self.site)
        self.assertEqual(document.document_type, DocumentType.LABEL_CAPTURE)
        self.assertEqual(document.source, DocumentSource.DRIVE)
        self.assertEqual(document.metadata["drive_file_id"], "drive-001")
        self.assertEqual(document.metadata["drive_folder_id"], "folder-001")
        self.assertTrue(document.file.name)
        self.assertEqual(
            IntegrationImportBatch.objects.filter(
                source="drive",
                import_type="asset_import",
                idempotency_key="drive-import-001",
            ).count(),
            1,
        )

    @patch("apps.integration.services.drive_importer.run_claude_extraction")
    @patch("apps.integration.services.drive_importer.DriveClient")
    def test_import_drive_assets_skips_existing_drive_file(self, client_cls, extract_mock):
        IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.LABEL_CAPTURE,
            source=DocumentSource.DRIVE,
            filename="label-001.jpg",
            status="uploaded",
            metadata={"drive_file_id": "drive-001"},
        )
        client = client_cls.return_value
        client.folder_id = "folder-001"
        client.iter_folder_files.return_value = iter([
            {
                "id": "drive-001",
                "name": "label-001.jpg",
                "mimeType": "image/jpeg",
                "webViewLink": "https://drive.google.com/file/d/drive-001/view",
            }
        ])

        response = self.client.post(
            "/api/v1/integration/drive-assets/import/",
            {"site": str(self.site.id), "limit": 10, "document_type": "label_capture"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["created_count"], 0)
        self.assertEqual(response.json()["skipped_existing"], 1)
        self.assertEqual(IntegrationDocument.objects.count(), 1)
        client.download_file.assert_not_called()
        extract_mock.assert_not_called()

    @patch("apps.integration.services.drive_importer.run_claude_extraction")
    @patch("apps.integration.services.drive_importer.DriveClient")
    def test_import_drive_assets_scans_past_existing_rows_to_find_new_files(self, client_cls, extract_mock):
        IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.LABEL_CAPTURE,
            source=DocumentSource.DRIVE,
            filename="older-001.jpg",
            status="uploaded",
            metadata={"drive_file_id": "drive-001"},
        )
        extract_mock.return_value = SimpleNamespace(status="succeeded", error_message="")
        client = client_cls.return_value
        client.folder_id = "folder-001"
        client.iter_folder_files.return_value = iter([
            {
                "id": "drive-001",
                "name": "older-001.jpg",
                "mimeType": "image/jpeg",
                "webViewLink": "https://drive.google.com/file/d/drive-001/view",
            },
            {
                "id": "drive-002",
                "name": "newer-002.jpg",
                "mimeType": "image/jpeg",
                "createdTime": "2026-04-16T08:30:00Z",
                "modifiedTime": "2026-04-16T08:31:00Z",
                "webViewLink": "https://drive.google.com/file/d/drive-002/view",
            },
        ])
        client.download_file.return_value = ({"Content-Type": "image/jpeg"}, b"jpeg-bytes")

        response = self.client.post(
            "/api/v1/integration/drive-assets/import/",
            {"site": str(self.site.id), "limit": 1, "document_type": "label_capture"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["created_count"], 1)
        self.assertEqual(response.json()["skipped_existing"], 1)
        self.assertEqual(response.json()["scanned_count"], 2)
        self.assertTrue(IntegrationDocument.objects.filter(metadata__drive_file_id="drive-002").exists())
