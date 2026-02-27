import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Site
from apps.integration.models import RecipeSnapshot


class ServiceIngredientsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site, _ = Site.objects.get_or_create(
            code="LE_JARDIN_DES_PINS",
            defaults={"name": "Le Jardin des Pins", "is_active": True},
        )

    def test_sync_and_aggregate_supplier_view(self):
        fiche_id = uuid.uuid4()
        RecipeSnapshot.objects.create(
            fiche_product_id=fiche_id,
            title="Pizza Margherita",
            snapshot_hash="hash-pizza",
            payload={
                "ingredients": [
                    {"name": "Farina", "qty": "1.000", "unit": "kg", "supplier": "AEM"},
                    {"name": "Mozzarella", "qty": "0.500", "unit": "kg", "supplier": "AEM"},
                ]
            },
        )

        sync_response = self.client.post(
            "/api/v1/servizio/menu-entries/sync",
            {
                "site_id": str(self.site.id),
                "service_date": "2026-02-27",
                "entries": [
                    {
                        "space_key": "carta-principale",
                        "section": "Pizze",
                        "title": "Pizza Margherita",
                        "fiche_product_id": str(fiche_id),
                        "expected_qty": "2.000",
                        "sort_order": 0,
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(sync_response.status_code, 201)
        self.assertEqual(sync_response.json()["count"], 1)

        response = self.client.get(
            f"/api/v1/servizio/ingredients?site={self.site.id}&date=2026-02-27&view=supplier"
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["view"], "supplier")
        self.assertEqual(len(body["warnings"]), 0)
        self.assertEqual(len(body["rows"]), 2)
        row = body["rows"][0]
        self.assertIn("supplier", row)
        self.assertIn("ingredient", row)
        self.assertIn("qty_total", row)
        self.assertIn("unit", row)
