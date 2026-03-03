from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Site
from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine, Invoice, InvoiceGoodsReceiptMatch, InvoiceLine


class ReconciliationMatchApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Site Rec", code="SITE-REC")
        self.supplier = Supplier.objects.create(name="Supplier Rec")
        self.product = SupplierProduct.objects.create(supplier=self.supplier, name="Flour", uom="kg")

    def _build_lines(self):
        receipt = GoodsReceipt.objects.create(
            site=self.site,
            supplier=self.supplier,
            delivery_note_number="BL-REC-001",
            received_at="2026-02-27T10:00:00Z",
            metadata={},
        )
        gr_line = GoodsReceiptLine.objects.create(
            receipt=receipt,
            supplier_product=self.product,
            raw_product_name="Flour",
            qty_value="10.000",
            qty_unit="kg",
        )

        invoice = Invoice.objects.create(
            site=self.site,
            supplier=self.supplier,
            invoice_number="INV-REC-001",
            invoice_date="2026-02-27",
            metadata={},
        )
        inv_line = InvoiceLine.objects.create(
            invoice=invoice,
            supplier_product=self.product,
            raw_product_name="Flour",
            qty_value="10.000",
            qty_unit="kg",
        )
        return inv_line, gr_line

    def test_create_reconciliation_match_returns_201(self):
        inv_line, gr_line = self._build_lines()
        payload = {
            "invoice_line": str(inv_line.id),
            "goods_receipt_line": str(gr_line.id),
            "status": "matched",
            "matched_qty_value": "10.000",
            "matched_amount": "15.0000",
            "note": "Manual validation",
            "metadata": {"source": "operator"},
        }

        response = self.client.post("/api/v1/reconciliation/matches/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(InvoiceGoodsReceiptMatch.objects.count(), 1)

    def test_create_reconciliation_match_with_cross_supplier_returns_400(self):
        inv_line, _ = self._build_lines()

        other_site = Site.objects.create(name="Site X", code="SITE-X")
        other_supplier = Supplier.objects.create(name="Supplier X")
        other_receipt = GoodsReceipt.objects.create(
            site=other_site,
            supplier=other_supplier,
            delivery_note_number="BL-X-001",
            received_at="2026-02-27T10:00:00Z",
            metadata={},
        )
        foreign_gr_line = GoodsReceiptLine.objects.create(
            receipt=other_receipt,
            raw_product_name="Sugar",
            qty_value="1.000",
            qty_unit="kg",
        )

        payload = {
            "invoice_line": str(inv_line.id),
            "goods_receipt_line": str(foreign_gr_line.id),
            "status": "manual",
        }

        response = self.client.post("/api/v1/reconciliation/matches/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertIn("goods_receipt_line", response.json()["field_errors"])

    def test_auto_match_creates_match_for_compatible_lines(self):
        inv_line, _ = self._build_lines()
        payload = {"invoice_id": str(inv_line.invoice_id), "qty_tolerance_ratio": "0.0500"}

        response = self.client.post("/api/v1/reconciliation/auto-match/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["created_matches"], 1)
        self.assertEqual(InvoiceGoodsReceiptMatch.objects.count(), 1)

    def test_auto_match_marks_partial_when_sensitive_product_missing_traceability(self):
        sensitive_product = SupplierProduct.objects.create(
            supplier=self.supplier,
            name="Fresh fish",
            uom="kg",
            traceability_flag=True,
        )
        receipt = GoodsReceipt.objects.create(
            site=self.site,
            supplier=self.supplier,
            delivery_note_number="BL-SENS-001",
            received_at="2026-02-27T10:00:00Z",
            metadata={},
        )
        gr_line = GoodsReceiptLine.objects.create(
            receipt=receipt,
            supplier_product=sensitive_product,
            raw_product_name="Fresh fish",
            qty_value="5.000",
            qty_unit="kg",
            supplier_lot_code=None,
            dlc_date=None,
        )
        invoice = Invoice.objects.create(
            site=self.site,
            supplier=self.supplier,
            invoice_number="INV-SENS-001",
            invoice_date="2026-02-27",
            metadata={},
        )
        InvoiceLine.objects.create(
            invoice=invoice,
            supplier_product=sensitive_product,
            raw_product_name="Fresh fish",
            qty_value="5.000",
            qty_unit="kg",
        )

        response = self.client.post(
            "/api/v1/reconciliation/auto-match/",
            {"invoice_id": str(invoice.id)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        match = InvoiceGoodsReceiptMatch.objects.get(goods_receipt_line=gr_line)
        self.assertEqual(match.status, "partial")
        self.assertIn("traceability_warning", match.metadata)
