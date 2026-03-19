from datetime import date, datetime, timezone
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier
from apps.core.models import Site
from apps.integration.models import DocumentSource, DocumentType, IntegrationDocument
from apps.inventory.models import InventoryMovement, MovementType
from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine, Invoice, InvoiceLine


class IntegrationDocumentDeleteApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Central Site", code="CENTRAL")
        self.supplier = Supplier.objects.create(name="Dup Supplier")

    def test_delete_document_also_removes_linked_invoice_and_fallback_movements(self):
        invoice = Invoice.objects.create(
            site=self.site,
            supplier=self.supplier,
            invoice_number="FAC-2026-001",
            invoice_date=date(2026, 3, 17),
            metadata={},
        )
        line = InvoiceLine.objects.create(
            invoice=invoice,
            raw_product_name="Pomodori",
            supplier_code="POM01",
            qty_value=Decimal("2.000"),
            qty_unit="kg",
        )
        InventoryMovement.objects.create(
            site=self.site,
            movement_type=MovementType.IN,
            qty_value=Decimal("2.000"),
            qty_unit="kg",
            happened_at=datetime(2026, 3, 17, tzinfo=timezone.utc),
            ref_type="invoice_line_fallback",
            ref_id=str(line.id),
        )
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.INVOICE,
            source=DocumentSource.UPLOAD,
            filename="facture.pdf",
            status="extracted",
            metadata={"ingest": {"target": "invoice", "record_id": str(invoice.id)}},
        )

        response = self.client.delete(f"/api/v1/integration/documents/{document.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(IntegrationDocument.objects.filter(pk=document.id).exists())
        self.assertFalse(Invoice.objects.filter(pk=invoice.id).exists())
        self.assertFalse(InvoiceLine.objects.filter(pk=line.id).exists())
        self.assertFalse(InventoryMovement.objects.filter(ref_type="invoice_line_fallback", ref_id=str(line.id)).exists())

    def test_delete_document_also_removes_linked_goods_receipt_and_stock_movements(self):
        receipt = GoodsReceipt.objects.create(
            site=self.site,
            supplier=self.supplier,
            delivery_note_number="BL-2026-001",
            received_at=datetime(2026, 3, 17, tzinfo=timezone.utc),
            metadata={},
        )
        line = GoodsReceiptLine.objects.create(
            receipt=receipt,
            raw_product_name="Mozzarella",
            supplier_code="MOZ01",
            supplier_lot_code="LOT-001",
            qty_value=Decimal("3.000"),
            qty_unit="kg",
        )
        InventoryMovement.objects.create(
            site=self.site,
            movement_type=MovementType.IN,
            qty_value=Decimal("3.000"),
            qty_unit="kg",
            happened_at=datetime(2026, 3, 17, tzinfo=timezone.utc),
            ref_type="goods_receipt_line",
            ref_id=str(line.id),
        )
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.GOODS_RECEIPT,
            source=DocumentSource.UPLOAD,
            filename="bl.pdf",
            status="extracted",
            metadata={"ingest": {"target": "goods_receipt", "record_id": str(receipt.id)}},
        )

        response = self.client.delete(f"/api/v1/integration/documents/{document.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(IntegrationDocument.objects.filter(pk=document.id).exists())
        self.assertFalse(GoodsReceipt.objects.filter(pk=receipt.id).exists())
        self.assertFalse(GoodsReceiptLine.objects.filter(pk=line.id).exists())
        self.assertFalse(InventoryMovement.objects.filter(ref_type="goods_receipt_line", ref_id=str(line.id)).exists())
