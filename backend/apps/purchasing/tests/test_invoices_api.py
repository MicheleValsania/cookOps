from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Site
from apps.integration.models import IntegrationImportBatch
from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine, Invoice


class InvoiceApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Site Invoice", code="SITE-INV")
        self.supplier = Supplier.objects.create(name="Supplier Invoice")
        self.product = SupplierProduct.objects.create(supplier=self.supplier, name="Milk", uom="l")

    def test_create_invoice_returns_201(self):
        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "invoice_number": "INV-001",
            "invoice_date": "2026-02-27",
            "metadata": {"source": "manual"},
            "lines": [
                {
                    "supplier_product": str(self.product.id),
                    "raw_product_name": "Milk",
                    "qty_value": "6.000",
                    "qty_unit": "l",
                    "unit_price": "1.7000"
                }
            ]
        }

        response = self.client.post(
            "/api/v1/invoices/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="inv-create-001",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(Invoice.objects.first().lines.count(), 1)

    def test_create_invoice_without_idempotency_key_returns_400(self):
        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "invoice_number": "INV-002",
            "invoice_date": "2026-02-27",
            "metadata": {},
            "lines": [
                {
                    "raw_product_name": "Butter",
                    "qty_value": "2.000",
                    "qty_unit": "kg"
                }
            ]
        }

        response = self.client.post("/api/v1/invoices/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertEqual(response.json()["field_errors"]["idempotency_key"], "Idempotency-Key header is required.")

    def test_create_invoice_is_idempotent_with_header(self):
        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "invoice_number": "INV-003",
            "invoice_date": "2026-02-27",
            "metadata": {},
            "lines": [
                {
                    "supplier_product": str(self.product.id),
                    "raw_product_name": "Milk",
                    "qty_value": "4.000",
                    "qty_unit": "l"
                }
            ]
        }

        first = self.client.post(
            "/api/v1/invoices/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="idem-inv-001",
        )
        second = self.client.post(
            "/api/v1/invoices/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="idem-inv-001",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(
            IntegrationImportBatch.objects.filter(import_type="invoice", idempotency_key="idem-inv-001").count(),
            1,
        )

    def test_create_invoice_with_foreign_goods_receipt_line_returns_400(self):
        other_supplier = Supplier.objects.create(name="Supplier Other")
        receipt = GoodsReceipt.objects.create(
            site=self.site,
            supplier=other_supplier,
            delivery_note_number="BL-INV-01",
            received_at="2026-02-27T10:00:00Z",
            metadata={},
        )
        gr_line = GoodsReceiptLine.objects.create(
            receipt=receipt,
            raw_product_name="Foreign",
            qty_value="1.000",
            qty_unit="kg",
        )

        payload = {
            "site": str(self.site.id),
            "supplier": str(self.supplier.id),
            "invoice_number": "INV-004",
            "invoice_date": "2026-02-27",
            "metadata": {},
            "lines": [
                {
                    "goods_receipt_line": str(gr_line.id),
                    "raw_product_name": "Foreign",
                    "qty_value": "1.000",
                    "qty_unit": "kg"
                }
            ]
        }

        response = self.client.post(
            "/api/v1/invoices/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="inv-foreign-001",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertIn("goods_receipt_line", response.json()["field_errors"]["lines"][0])
