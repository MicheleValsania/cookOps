from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier
from apps.core.models import Site
from apps.integration.models import DocumentExtraction, IntegrationDocument, IntegrationImportBatch
from apps.purchasing.models import GoodsReceipt


class IntegrationIngestApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Ingest Site", code="SITE-INGEST")
        self.supplier = Supplier.objects.create(name="Ingest Supplier")

    def test_ingest_goods_receipt_from_extraction_returns_201(self):
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type="goods_receipt",
            source="api",
            filename="bl-ocr-001.json",
            status="extracted",
        )
        extraction = DocumentExtraction.objects.create(
            document=document,
            extractor_name="ocr-engine",
            status="succeeded",
            normalized_payload={
                "site": str(self.site.id),
                "supplier": str(self.supplier.id),
                "delivery_note_number": "BL-OCR-001",
                "received_at": "2026-02-27T10:00:00Z",
                "metadata": {"source": "ocr"},
                "lines": [{"raw_product_name": "Tomato", "qty_value": "3.000", "qty_unit": "kg"}],
            },
        )

        payload = {
            "extraction_id": str(extraction.id),
            "idempotency_key": "ocr-gr-001",
        }

        response = self.client.post(
            f"/api/v1/integration/documents/{document.id}/ingest/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(GoodsReceipt.objects.count(), 1)
        self.assertEqual(
            IntegrationImportBatch.objects.filter(source="ocr", import_type="goods_receipt", idempotency_key="ocr-gr-001").count(),
            1,
        )

    def test_ingest_goods_receipt_is_idempotent(self):
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type="goods_receipt",
            source="api",
            filename="bl-ocr-002.json",
            status="extracted",
        )
        extraction = DocumentExtraction.objects.create(
            document=document,
            extractor_name="ocr-engine",
            status="succeeded",
            normalized_payload={
                "site": str(self.site.id),
                "supplier": str(self.supplier.id),
                "delivery_note_number": "BL-OCR-002",
                "received_at": "2026-02-27T10:00:00Z",
                "metadata": {},
                "lines": [{"raw_product_name": "Onion", "qty_value": "1.000", "qty_unit": "kg"}],
            },
        )
        payload = {"extraction_id": str(extraction.id), "idempotency_key": "ocr-gr-002"}

        first = self.client.post(f"/api/v1/integration/documents/{document.id}/ingest/", payload, format="json")
        second = self.client.post(f"/api/v1/integration/documents/{document.id}/ingest/", payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(GoodsReceipt.objects.count(), 1)

    def test_ingest_requires_succeeded_extraction(self):
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type="goods_receipt",
            source="api",
            filename="bl-ocr-003.json",
            status="processing",
        )
        extraction = DocumentExtraction.objects.create(
            document=document,
            extractor_name="ocr-engine",
            status="pending",
            normalized_payload={"dummy": True},
        )

        payload = {"extraction_id": str(extraction.id), "idempotency_key": "ocr-gr-003"}
        response = self.client.post(f"/api/v1/integration/documents/{document.id}/ingest/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertIn("extraction_id", response.json()["field_errors"])
