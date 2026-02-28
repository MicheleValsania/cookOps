import uuid
from decimal import Decimal

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
            portions="4",
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
        by_ingredient = {row["ingredient"]: row for row in body["rows"]}
        self.assertEqual(Decimal(str(by_ingredient["Farina"]["qty_total"])), Decimal("0.5"))
        self.assertEqual(by_ingredient["Farina"]["unit"], "kg")
        self.assertEqual(Decimal(str(by_ingredient["Mozzarella"]["qty_total"])), Decimal("0.25"))
        self.assertEqual(by_ingredient["Mozzarella"]["unit"], "kg")

    def test_qty_string_is_parsed_from_fiche_payload(self):
        fiche_id = uuid.uuid4()
        RecipeSnapshot.objects.create(
            fiche_product_id=fiche_id,
            title="Insalata Caesar",
            snapshot_hash="hash-caesar",
            payload={
                "ingredients": [
                    {"name": "Pollo", "qty": "130 g", "supplier": "AEM"},
                ]
            },
        )
        self.client.post(
            "/api/v1/servizio/menu-entries/sync",
            {
                "site_id": str(self.site.id),
                "service_date": "2026-02-27",
                "entries": [
                    {
                        "space_key": "menu-giorno",
                        "title": "Insalata Caesar",
                        "fiche_product_id": str(fiche_id),
                        "expected_qty": "2.000",
                    }
                ],
            },
            format="json",
        )
        response = self.client.get(
            f"/api/v1/servizio/ingredients?site={self.site.id}&date=2026-02-27&view=supplier"
        )
        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ingredient"], "Pollo")
        self.assertEqual(rows[0]["unit"], "kg")
        self.assertEqual(Decimal(str(rows[0]["qty_total"])), Decimal("0.26"))

    def test_ingredients_fallback_to_title_when_uuid_not_found(self):
        RecipeSnapshot.objects.create(
            fiche_product_id=uuid.uuid4(),
            title="Gazpacho Andaluz",
            snapshot_hash="hash-gazpacho",
            payload={
                "ingredients": [
                    {"name": "Pomodoro", "qty": "2.000", "unit": "kg", "supplier": "Orto"},
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
                        "space_key": "menu-giorno",
                        "section": "Speciali",
                        "title": "Gazpacho Andaluz",
                        "fiche_product_id": str(uuid.uuid4()),
                        "expected_qty": "1.000",
                        "sort_order": 0,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(sync_response.status_code, 201)

        response = self.client.get(
            f"/api/v1/servizio/ingredients?site={self.site.id}&date=2026-02-27&view=supplier"
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["view"], "supplier")
        self.assertEqual(len(body["rows"]), 1)
        self.assertEqual(body["rows"][0]["ingredient"], "Pomodoro")

    def test_filters_entries_by_validity_window(self):
        fiche_id = uuid.uuid4()
        RecipeSnapshot.objects.create(
            fiche_product_id=fiche_id,
            title="Panisse",
            snapshot_hash="hash-panisse",
            payload={
                "ingredients": [
                    {"name": "Ceci", "qty": "1.000", "unit": "kg", "supplier": "AEM"},
                ]
            },
        )
        self.client.post(
            "/api/v1/servizio/menu-entries/sync",
            {
                "site_id": str(self.site.id),
                "service_date": "2026-02-27",
                "entries": [
                    {
                        "space_key": "carta-principale",
                        "title": "Panisse",
                        "fiche_product_id": str(fiche_id),
                        "expected_qty": "1.000",
                        "metadata": {
                            "valid_from": "2026-04-02",
                            "valid_to": "2026-11-01",
                        },
                    }
                ],
            },
            format="json",
        )
        response = self.client.get(
            f"/api/v1/servizio/ingredients?site={self.site.id}&date=2026-02-27&view=supplier"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rows"], [])

    def test_expands_nested_recipe_ingredients(self):
        bouillon_id = uuid.uuid4()
        soupe_id = uuid.uuid4()
        RecipeSnapshot.objects.create(
            fiche_product_id=bouillon_id,
            title="bouillon de poisson",
            snapshot_hash="hash-bouillon",
            portions="10",
            payload={
                "ingredients": [
                    {"name": "aretes de poisson", "qty": "1.000", "unit": "kg", "supplier": "Poissonnerie"},
                    {"name": "oignons", "qty": "0.300", "unit": "kg", "supplier": "Orto"},
                ]
            },
        )
        RecipeSnapshot.objects.create(
            fiche_product_id=soupe_id,
            title="Soupe de la mer",
            snapshot_hash="hash-soupe",
            portions="4",
            payload={
                "ingredients": [
                    {"name": "bouillon de poisson", "qty": "2.000", "unit": "l"},
                ]
            },
        )
        self.client.post(
            "/api/v1/servizio/menu-entries/sync",
            {
                "site_id": str(self.site.id),
                "service_date": "2026-02-27",
                "entries": [
                    {
                        "space_key": "menu-giorno",
                        "title": "Soupe de la mer",
                        "fiche_product_id": str(soupe_id),
                        "expected_qty": "4.000",
                    }
                ],
            },
            format="json",
        )

        response = self.client.get(
            f"/api/v1/servizio/ingredients?site={self.site.id}&date=2026-02-27&view=supplier"
        )
        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]
        by_ingredient = {row["ingredient"]: row for row in rows}
        self.assertIn("aretes de poisson", by_ingredient)
        self.assertIn("oignons", by_ingredient)
        self.assertNotIn("bouillon de poisson", by_ingredient)
        self.assertEqual(Decimal(str(by_ingredient["aretes de poisson"]["qty_total"])), Decimal("0.2"))
        self.assertEqual(by_ingredient["aretes de poisson"]["unit"], "kg")
        self.assertEqual(by_ingredient["aretes de poisson"]["source_type"], "derived_recipe")
        self.assertEqual(by_ingredient["aretes de poisson"]["source_recipe_title"], "bouillon de poisson")
