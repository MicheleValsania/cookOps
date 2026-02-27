from django.test import TestCase
from rest_framework.test import APIClient


class FicheCatalogImportApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")

    def test_import_returns_400_when_fiches_db_not_readable(self):
        response = self.client.post("/api/v1/integration/fiches/catalog/import/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("fiches", response.json().get("detail", "").lower())
