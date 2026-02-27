import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.integration.models import RecipeSnapshot


class FicheRecipeTitlesApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")

    def test_list_titles_from_snapshot_fallback(self):
        first_id = uuid.uuid4()
        RecipeSnapshot.objects.create(
            fiche_product_id=first_id,
            title="Pizza Margherita",
            snapshot_hash="hash-1",
            payload={},
        )
        RecipeSnapshot.objects.create(
            fiche_product_id=uuid.uuid4(),
            title="Burger Classic",
            snapshot_hash="hash-2",
            payload={},
        )

        response = self.client.get("/api/v1/integration/fiches/recipe-titles/?q=pizza")

        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Pizza Margherita")
        self.assertEqual(results[0]["fiche_product_id"], str(first_id))
