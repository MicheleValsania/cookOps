from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Site
from apps.integration.models import IntegrationImportBatch
from apps.purchasing.models import GoodsReceipt


class GoodsReceiptApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Site A", code="SITE-A")
        self.supplier = Supplier.objects.create(name="Supplier A")

    def test_create_goods_receipt_returns_201(self):
        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "delivery_note_number": "BL-001",
            "received_at": "2026-02-26T10:00:00Z",
            "metadata": {"source": "manual"},
            "lines": [
                {
                    "raw_product_name": "Tomatoes",
                    "qty_value": "2.500",
                    "qty_unit": "kg",
                }
            ],
        }

        response = self.client.post(
            "/api/v1/goods-receipts/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="gr-create-001",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(GoodsReceipt.objects.count(), 1)
        self.assertEqual(GoodsReceipt.objects.first().lines.count(), 1)

    def test_create_goods_receipt_with_invalid_qty_returns_400(self):
        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "delivery_note_number": "BL-002",
            "received_at": "2026-02-26T10:00:00Z",
            "metadata": {},
            "lines": [
                {
                    "raw_product_name": "Olive oil",
                    "qty_value": "0",
                    "qty_unit": "l",
                }
            ],
        }

        response = self.client.post(
            "/api/v1/goods-receipts/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="gr-invalid-001",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("qty_value", response.json()["lines"][0])

    def test_create_goods_receipt_without_idempotency_key_returns_400(self):
        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "delivery_note_number": "BL-004",
            "received_at": "2026-02-26T10:00:00Z",
            "metadata": {},
            "lines": [{"raw_product_name": "Garlic", "qty_value": "1.000", "qty_unit": "kg"}],
        }

        response = self.client.post("/api/v1/goods-receipts/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "Idempotency-Key header is required.")

    def test_create_goods_receipt_is_idempotent_with_header(self):
        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "delivery_note_number": "BL-003",
            "received_at": "2026-02-26T10:00:00Z",
            "metadata": {},
            "lines": [{"raw_product_name": "Onion", "qty_value": "1.000", "qty_unit": "kg"}],
        }

        first = self.client.post(
            "/api/v1/goods-receipts/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="idem-gr-001",
        )
        second = self.client.post(
            "/api/v1/goods-receipts/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="idem-gr-001",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(GoodsReceipt.objects.count(), 1)
        self.assertEqual(
            IntegrationImportBatch.objects.filter(import_type="goods_receipt", idempotency_key="idem-gr-001").count(),
            1,
        )

    def test_create_goods_receipt_with_supplier_product_from_other_supplier_returns_400(self):
        other_supplier = Supplier.objects.create(name="Supplier B")
        foreign_product = SupplierProduct.objects.create(
            supplier=other_supplier,
            name="Foreign Product",
            uom="kg",
        )
        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "delivery_note_number": "BL-005",
            "received_at": "2026-02-26T10:00:00Z",
            "metadata": {},
            "lines": [
                {
                    "supplier_product": str(foreign_product.id),
                    "raw_product_name": "Foreign Product",
                    "qty_value": "1.000",
                    "qty_unit": "kg",
                }
            ],
        }

        response = self.client.post(
            "/api/v1/goods-receipts/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="gr-foreign-001",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("supplier_product", response.json()["lines"][0])
