import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.integration.models import IntegrationImportBatch, RecipeSnapshot


class FicheSnapshotEnvelopeImportApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.fiche_id = uuid.uuid4()

    def _envelope(self, title="Pizza Margherita", ingredient_qty="1 pc"):
        return {
            "export_version": "1.1",
            "exported_at": "2026-02-28T12:00:00Z",
            "source_app": "fiches-recettes",
            "warnings": [],
            "fiches": [
                {
                    "fiche_id": str(self.fiche_id),
                    "updated_at": "2026-02-28T11:00:00Z",
                    "title": title,
                    "language": "fr",
                    "category": "Pizze",
                    "allergens": [],
                    "ingredients": [
                        {
                            "ingredient_name_raw": "Farina",
                            "quantity_raw": ingredient_qty,
                            "note": None,
                            "supplier_name": "AEM",
                            "supplier_id": None,
                            "supplier_product_id": None,
                            "unit_price_value": None,
                            "unit_price_unit": None,
                        }
                    ],
                    "procedure_steps": ["Impasta"],
                    "haccp_profiles": [],
                    "storage_profiles": [],
                    "label_hints": None,
                    "warnings": [],
                }
            ],
        }

    def test_import_envelope_v11_creates_snapshot(self):
        response = self.client.post(
            "/api/v1/integration/fiches/snapshots/import-envelope/",
            {"envelope": self._envelope()},
            format="json",
            HTTP_IDEMPOTENCY_KEY="env-001",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["created"], 1)
        self.assertEqual(body["skipped_existing"], 0)
        self.assertEqual(RecipeSnapshot.objects.filter(fiche_product_id=self.fiche_id).count(), 1)

    def test_import_envelope_is_idempotent_with_same_payload(self):
        payload = {"envelope": self._envelope()}
        first = self.client.post(
            "/api/v1/integration/fiches/snapshots/import-envelope/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="env-002",
        )
        second = self.client.post(
            "/api/v1/integration/fiches/snapshots/import-envelope/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="env-002",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(RecipeSnapshot.objects.filter(fiche_product_id=self.fiche_id).count(), 1)
        self.assertEqual(
            IntegrationImportBatch.objects.filter(
                source="fiches",
                import_type="recipe_snapshot_envelope",
                idempotency_key="env-002",
                status=IntegrationImportBatch.Status.COMPLETED,
            ).count(),
            1,
        )

    def test_import_envelope_creates_new_snapshot_when_recipe_changes(self):
        first = self.client.post(
            "/api/v1/integration/fiches/snapshots/import-envelope/",
            {"envelope": self._envelope(ingredient_qty="1 pc")},
            format="json",
            HTTP_IDEMPOTENCY_KEY="env-003-a",
        )
        second = self.client.post(
            "/api/v1/integration/fiches/snapshots/import-envelope/",
            {"envelope": self._envelope(ingredient_qty="2 pc")},
            format="json",
            HTTP_IDEMPOTENCY_KEY="env-003-b",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(RecipeSnapshot.objects.filter(fiche_product_id=self.fiche_id).count(), 2)

    def test_import_envelope_rejects_invalid_version(self):
        envelope = self._envelope()
        envelope["export_version"] = "1.0"
        response = self.client.post(
            "/api/v1/integration/fiches/snapshots/import-envelope/",
            {"envelope": envelope},
            format="json",
            HTTP_IDEMPOTENCY_KEY="env-004",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("export_version", response.json()["detail"])
