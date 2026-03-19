from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Site
from apps.integration.models import DocumentExtraction, DocumentSource, DocumentType, IntegrationDocument
from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine, Invoice, InvoiceGoodsReceiptMatch, InvoiceLine


@override_settings(TRACCIA_API_BASE_URL="https://traccia.test")
class HaccpReconciliationOverviewApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Site HACCP", code="SITE-HACCP")
        self.supplier = Supplier.objects.create(name="Supplier HACCP")
        self.product = SupplierProduct.objects.create(
            supplier=self.supplier,
            name="Pomodoro pelato",
            uom="kg",
        )

    def _build_local_documents(self):
        receipt = GoodsReceipt.objects.create(
            site=self.site,
            supplier=self.supplier,
            delivery_note_number="BL-900",
            received_at="2026-03-08T08:00:00Z",
            metadata={},
        )
        gr_line = GoodsReceiptLine.objects.create(
            receipt=receipt,
            supplier_product=self.product,
            raw_product_name="Pomodoro pelato",
            supplier_code="POM-01",
            supplier_lot_code="LOT-TRACCIA-1",
            qty_value="5.000",
            qty_unit="kg",
        )
        invoice = Invoice.objects.create(
            site=self.site,
            supplier=self.supplier,
            invoice_number="FAC-900",
            invoice_date="2026-03-08",
            metadata={},
        )
        inv_line = InvoiceLine.objects.create(
            invoice=invoice,
            supplier_product=self.product,
            raw_product_name="Pomodoro pelato",
            supplier_code="POM-01",
            goods_receipt_line=gr_line,
            qty_value="5.000",
            qty_unit="kg",
            line_total="18.5000",
        )
        InvoiceGoodsReceiptMatch.objects.create(
            invoice_line=inv_line,
            goods_receipt_line=gr_line,
            status="matched",
            matched_qty_value="5.000",
            matched_amount="18.5000",
            metadata={"source": "test"},
        )

    @patch("apps.integration.api.v1.haccp_views.TracciaClient.request_json")
    def test_overview_returns_reconciled_row_and_label_schedule_summary(self, request_json_mock):
        self._build_local_documents()

        def side_effect(method, path, params=None, data=None, headers=None):
            if path == "/api/v1/haccp/lifecycle-events/":
                return (
                    status.HTTP_200_OK,
                    {
                        "results": [
                            {
                                "id": "evt-1",
                                "event_type": "lot_loaded",
                                "happened_at": "2026-03-08T08:15:00Z",
                                "product_label": "Pomodoro pelato",
                                "supplier_code": "POM-01",
                                "qty_value": "5.000",
                                "qty_unit": "kg",
                                "lot": {
                                    "internal_lot_code": "INT-1",
                                    "supplier_lot_code": "LOT-TRACCIA-1",
                                    "status": "open",
                                },
                            }
                        ]
                    },
                )
            if path == "/api/v1/haccp/schedules/":
                return (
                    status.HTTP_200_OK,
                    {
                        "results": [
                            {"id": "sched-1", "site": str(self.site.id), "task_type": "label_print", "status": "planned"},
                            {"id": "sched-2", "site": str(self.site.id), "task_type": "label_print", "status": "done"},
                        ]
                    },
                )
            raise AssertionError(f"Unexpected path {path}")

        request_json_mock.side_effect = side_effect

        response = self.client.get(f"/api/v1/haccp/traccia/reconciliation-overview/?site={self.site.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["summary"]["lifecycle_events"], 1)
        self.assertEqual(body["summary"]["reconciled_events"], 1)
        self.assertEqual(body["label_schedule_summary"]["planned"], 1)
        self.assertEqual(body["label_schedule_summary"]["done"], 1)
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["reconcile_status"], "reconciled")
        self.assertEqual(len(body["results"][0]["goods_receipts"]), 1)
        self.assertEqual(len(body["results"][0]["invoices"]), 1)
        self.assertEqual(len(body["results"][0]["matches"]), 1)

    @patch("apps.integration.api.v1.haccp_views.TracciaClient.request_json")
    def test_overview_marks_event_missing_when_no_local_documents_match(self, request_json_mock):
        request_json_mock.side_effect = [
            (
                status.HTTP_200_OK,
                {
                    "results": [
                        {
                            "id": "evt-missing",
                            "event_type": "lot_loaded",
                            "happened_at": "2026-03-08T08:15:00Z",
                            "product_label": "Basilico",
                            "supplier_code": "BAS-99",
                            "qty_value": "1.000",
                            "qty_unit": "kg",
                            "lot": {"supplier_lot_code": "LOT-MISSING"},
                        }
                    ]
                },
            ),
            (status.HTTP_200_OK, {"results": []}),
        ]

        response = self.client.get(f"/api/v1/haccp/traccia/reconciliation-overview/?site={self.site.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["summary"]["missing_events"], 1)
        self.assertEqual(body["results"][0]["reconcile_status"], "missing")
        self.assertEqual(body["results"][0]["goods_receipts"], [])
        self.assertEqual(body["results"][0]["invoices"], [])

    @patch("apps.integration.api.v1.haccp_views.TracciaClient.request_json")
    def test_overview_falls_back_to_validated_label_capture_documents(self, request_json_mock):
        invoice = Invoice.objects.create(
            site=self.site,
            supplier=self.supplier,
            invoice_number="FAC-LABEL-1",
            invoice_date="2026-03-08",
            metadata={},
        )
        InvoiceLine.objects.create(
            invoice=invoice,
            supplier_product=self.product,
            raw_product_name="Pomodoro pelato",
            supplier_code="POM-01",
            qty_value="5.000",
            qty_unit="kg",
            line_total="18.5000",
        )
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.LABEL_CAPTURE,
            source=DocumentSource.DRIVE,
            filename="capture-1.jpg",
            status="extracted",
            metadata={"review_status": "validated", "reviewed_at": "2026-03-08T08:15:00Z"},
        )
        DocumentExtraction.objects.create(
            document=document,
            extractor_name="claude",
            status="succeeded",
            normalized_payload={
                "product_guess": "Pomodoro pelato",
                "supplier_code": "POM-01",
                "supplier_lot_code": "LOT-LOCAL-1",
                "weight_value": "5.000",
                "weight_unit": "kg",
            },
        )
        request_json_mock.side_effect = [
            (status.HTTP_200_OK, {"results": []}),
            (status.HTTP_200_OK, {"results": []}),
        ]

        response = self.client.get(f"/api/v1/haccp/traccia/reconciliation-overview/?site={self.site.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["summary"]["lifecycle_events"], 1)
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["event_type"], "label_capture_validated")
        self.assertEqual(body["results"][0]["source_document_id"], str(document.id))
        self.assertEqual(body["results"][0]["reconcile_status"], "invoice_only")
        self.assertEqual(len(body["results"][0]["invoices"]), 1)

    @patch("apps.integration.api.v1.haccp_views.TracciaClient.request_json")
    def test_overview_matches_invoice_by_linked_goods_receipt_lot(self, request_json_mock):
        receipt = GoodsReceipt.objects.create(
            site=self.site,
            supplier=self.supplier,
            delivery_note_number="BL-LOT-1",
            received_at="2026-03-17T08:00:00Z",
            metadata={},
        )
        gr_line = GoodsReceiptLine.objects.create(
            receipt=receipt,
            supplier_product=self.product,
            raw_product_name="Mozzarella julienne",
            supplier_code="NI41",
            supplier_lot_code="060326",
            qty_value="3.000",
            qty_unit="kg",
        )
        invoice = Invoice.objects.create(
            site=self.site,
            supplier=self.supplier,
            invoice_number="FAC-LOT-1",
            invoice_date="2026-03-17",
            metadata={},
        )
        InvoiceLine.objects.create(
            invoice=invoice,
            supplier_product=self.product,
            raw_product_name="Cioccolato fondente",
            supplier_code="OTHER-CODE",
            goods_receipt_line=gr_line,
            qty_value="3.000",
            qty_unit="kg",
            line_total="30.0000",
        )
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.LABEL_CAPTURE,
            source=DocumentSource.DRIVE,
            filename="capture-mozzarella.jpg",
            status="extracted",
            metadata={"review_status": "validated", "reviewed_at": "2026-03-17T20:16:17Z"},
        )
        DocumentExtraction.objects.create(
            document=document,
            extractor_name="claude",
            status="succeeded",
            normalized_payload={
                "product_guess": "Mozzarella julienne",
                "supplier_code": "NI41",
                "supplier_lot_code": "060326",
                "weight_value": "3.000",
                "weight_unit": "kg",
            },
        )
        request_json_mock.side_effect = [
            (status.HTTP_200_OK, {"results": []}),
            (status.HTTP_200_OK, {"results": []}),
        ]

        response = self.client.get(f"/api/v1/haccp/traccia/reconciliation-overview/?site={self.site.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["reconcile_status"], "documents_found")
        self.assertEqual(len(body["results"][0]["goods_receipts"]), 1)
        self.assertEqual(len(body["results"][0]["invoices"]), 1)
        self.assertEqual(body["results"][0]["invoices"][0]["invoice_number"], "FAC-LOT-1")
        self.assertEqual(body["results"][0]["invoices"][0]["supplier_lot_code"], "060326")
