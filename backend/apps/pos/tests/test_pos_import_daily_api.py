from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Site
from apps.pos.models import PosSource, SalesEventDaily


class PosImportDailyApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Site POS", code="SITE-POS")
        self.source = PosSource.objects.create(site=self.site, name="Main POS", vendor="Lightspeed")

    def test_import_daily_returns_201(self):
        payload = {
            "site_id": str(self.site.id),
            "pos_source_id": str(self.source.id),
            "sales_date": "2026-02-26",
            "lines": [{"pos_name": "Pizza", "qty": 10}],
        }

        response = self.client.post("/api/v1/pos/import/daily/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SalesEventDaily.objects.count(), 1)

    def test_import_daily_without_lines_returns_400(self):
        payload = {
            "site_id": str(self.site.id),
            "pos_source_id": str(self.source.id),
            "sales_date": "2026-02-26",
        }

        response = self.client.post("/api/v1/pos/import/daily/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lines", response.json())
