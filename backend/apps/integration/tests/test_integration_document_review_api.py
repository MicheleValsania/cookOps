from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Site
from apps.integration.models import DocumentExtraction, DocumentSource, DocumentType, IntegrationDocument


class IntegrationDocumentReviewApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Central Site", code="CENTRAL")
        self.document = IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.LABEL_CAPTURE,
            source=DocumentSource.DRIVE,
            filename="capture.jpg",
            status="extracted",
            metadata={},
        )
        self.extraction = DocumentExtraction.objects.create(
            document=self.document,
            extractor_name="claude",
            status="succeeded",
            normalized_payload={"supplier_name": "Old Supplier"},
        )

    def test_review_document_sets_review_status(self):
        response = self.client.post(
            f"/api/v1/integration/documents/{self.document.id}/review/",
            {"status": "validated", "notes": "OK"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.document.refresh_from_db()
        self.assertEqual(self.document.metadata["review_status"], "validated")
        self.assertEqual(self.document.metadata["review_notes"], "OK")

    def test_review_document_updates_corrected_payload(self):
        response = self.client.post(
            f"/api/v1/integration/documents/{self.document.id}/review/",
            {"status": "validated", "corrected_payload": {"supplier_name": "New Supplier", "supplier_lot_code": "LOT-001"}},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.extraction.refresh_from_db()
        self.assertEqual(self.extraction.normalized_payload["supplier_name"], "New Supplier")
        self.assertEqual(self.extraction.normalized_payload["supplier_lot_code"], "LOT-001")

    def test_review_document_rejects_invalid_status(self):
        response = self.client.post(
            f"/api/v1/integration/documents/{self.document.id}/review/",
            {"status": "pending_review"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
