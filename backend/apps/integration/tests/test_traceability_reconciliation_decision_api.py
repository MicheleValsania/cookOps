from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Site
from apps.integration.models import TraceabilityReconciliationDecision


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
