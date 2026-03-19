from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Site
from apps.integration.models import DocumentExtraction, DocumentSource, DocumentType, IntegrationDocument, TraceabilityReconciliationDecision
from apps.inventory.models import InventoryMovement, Lot


class TraceabilityReconciliationDecisionApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Central Site", code="CENTRAL")

    def test_upsert_decision(self):
        response = self.client.post(
            "/api/v1/integration/reconciliation-decisions/",
            {
                "site": str(self.site.id),
                "event_id": "evt-001",
                "decision_status": "review_required",
                "notes": "Verificare lotto e fornitore.",
                "metadata": {"source": "ui"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        decision = TraceabilityReconciliationDecision.objects.get()
        self.assertEqual(decision.decision_status, "review_required")
        self.assertEqual(decision.notes, "Verificare lotto e fornitore.")

    def test_list_decisions_by_site(self):
        TraceabilityReconciliationDecision.objects.create(
            site=self.site,
            event_id="evt-001",
            decision_status="ignored",
            notes="Rumore OCR.",
        )

        response = self.client.get(f"/api/v1/integration/reconciliation-decisions/?site={self.site.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()["results"]), 1)
        self.assertEqual(response.json()["results"][0]["decision_status"], "ignored")

    def test_delete_decision(self):
        TraceabilityReconciliationDecision.objects.create(
            site=self.site,
            event_id="evt-001",
            decision_status="ignored",
            notes="Rumore OCR.",
        )

        response = self.client.delete(
            f"/api/v1/integration/reconciliation-decisions/?site={self.site.id}&event_id=evt-001"
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TraceabilityReconciliationDecision.objects.filter(site=self.site, event_id="evt-001").exists())

    def test_matched_decision_creates_lot_allocation(self):
        document = IntegrationDocument.objects.create(
            site=self.site,
            document_type=DocumentType.LABEL_CAPTURE,
            source=DocumentSource.DRIVE,
            filename="capture.jpg",
            status="extracted",
            metadata={"review_status": "validated"},
        )
        DocumentExtraction.objects.create(
            document=document,
            extractor_name="claude",
            status="succeeded",
            normalized_payload={
                "product_guess": "Mozzarella julienne",
                "supplier_lot_code": "060326",
                "origin_lot_code": "INT-060326",
                "weight_value": "3.000",
                "weight_unit": "kg",
                "dlc_date": "2026-03-06",
            },
        )

        response = self.client.post(
            "/api/v1/integration/reconciliation-decisions/",
            {
                "site": str(self.site.id),
                "event_id": "evt-alloc-001",
                "decision_status": "matched",
                "linked_document": str(document.id),
                "metadata": {
                    "source_document_id": str(document.id),
                    "allocated_qty": "3.000",
                    "allocated_unit": "kg",
                    "supplier_lot_code": "060326",
                    "internal_lot_code": "INT-060326",
                    "product_label": "Mozzarella julienne",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        lot = Lot.objects.get(site=self.site, internal_lot_code="INT-060326")
        self.assertEqual(str(lot.qty_value), "3.000")
        movement = InventoryMovement.objects.get(ref_type="traceability_label_allocation", ref_id="evt-alloc-001")
        self.assertEqual(str(movement.qty_value), "3.000")
        self.assertEqual(movement.lot_id, lot.id)
