from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Site
from apps.integration.models import IntegrationImportBatch
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

        response = self.client.post(
            "/api/v1/pos/import/daily/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="pos-create-001",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SalesEventDaily.objects.count(), 1)

    def test_import_daily_without_lines_returns_400(self):
        payload = {
            "site_id": str(self.site.id),
            "pos_source_id": str(self.source.id),
            "sales_date": "2026-02-26",
        }

        response = self.client.post(
            "/api/v1/pos/import/daily/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="pos-invalid-001",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertIn("lines", response.json()["field_errors"])

    def test_import_daily_without_idempotency_key_returns_400(self):
        payload = {
            "site_id": str(self.site.id),
            "pos_source_id": str(self.source.id),
            "sales_date": "2026-02-28",
            "lines": [{"pos_name": "Risotto", "qty": 3}],
        }

        response = self.client.post("/api/v1/pos/import/daily/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertEqual(
            response.json()["field_errors"]["idempotency_key"],
            "Idempotency-Key header is required.",
        )

    def test_import_daily_is_idempotent_with_header(self):
        payload = {
            "site_id": str(self.site.id),
            "pos_source_id": str(self.source.id),
            "sales_date": "2026-02-27",
            "lines": [{"pos_name": "Pasta", "qty": 7}],
        }

        first = self.client.post(
            "/api/v1/pos/import/daily/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="idem-pos-001",
        )
        second = self.client.post(
            "/api/v1/pos/import/daily/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="idem-pos-001",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SalesEventDaily.objects.count(), 1)
        self.assertEqual(
            IntegrationImportBatch.objects.filter(import_type="pos_sales_daily", idempotency_key="idem-pos-001").count(),
            1,
        )

    def test_import_daily_with_pos_source_from_other_site_returns_400(self):
        other_site = Site.objects.create(name="Site Other", code="SITE-OTHER")
        foreign_source = PosSource.objects.create(site=other_site, name="Other POS", vendor="Lightspeed")
        payload = {
            "site_id": str(self.site.id),
            "pos_source_id": str(foreign_source.id),
            "sales_date": "2026-03-01",
            "lines": [{"pos_name": "Soup", "qty": 2}],
        }

        response = self.client.post(
            "/api/v1/pos/import/daily/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="pos-foreign-001",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertIn("pos_source_id", response.json()["field_errors"])
