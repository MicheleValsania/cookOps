from datetime import date, time

from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.api.tokens import issue_access_token
from apps.core.models import Organization, Site
from apps.integration.import_batches import find_completed_batch, start_batch
from apps.integration.models import (
    CleaningCategory,
    CleaningElement,
    CleaningPlan,
    CleaningProcedure,
    IntegrationDocument,
    RecipeSnapshot,
)
from apps.inventory.models import InventorySector, InventorySession
from apps.pos.models import PosSource
from apps.purchasing.models import GoodsReceipt


class TenantIsolationModulesTests(APITestCase):
    def setUp(self):
        self.chefside = Organization.objects.get(pk=settings.DEFAULT_ORGANIZATION_ID)
        self.other = Organization.objects.create(name="Restaurant Test", slug="restaurant-test")
        self.chefside_site = Site.objects.create(
            organization=self.chefside, name="ChefSide", code="CHEFSIDE"
        )
        self.other_site = Site.objects.create(
            organization=self.other, name="Other", code="OTHER"
        )
        self.chefside_supplier = Supplier.objects.create(
            organization=self.chefside, name="ChefSide Supplier"
        )
        self.other_supplier = Supplier.objects.create(
            organization=self.other, name="Other Supplier"
        )
        self.chefside_product = SupplierProduct.objects.create(
            supplier=self.chefside_supplier,
            name="ChefSide Product",
            supplier_sku="CS-001",
            uom="kg",
        )
        self.other_product = SupplierProduct.objects.create(
            supplier=self.other_supplier,
            name="Other Product",
            supplier_sku="OT-001",
            uom="kg",
        )
        self.chefside_sector = InventorySector.objects.create(
            site=self.chefside_site, name="ChefSide Sector"
        )
        self.other_sector = InventorySector.objects.create(
            site=self.other_site, name="Other Sector"
        )
        self.chefside_session = InventorySession.objects.create(
            site=self.chefside_site, sector=self.chefside_sector, label="ChefSide Inventory"
        )
        self.other_session = InventorySession.objects.create(
            site=self.other_site, sector=self.other_sector, label="Other Inventory"
        )
        self.chefside_document = IntegrationDocument.objects.create(
            site=self.chefside_site,
            document_type="invoice",
            source="api",
            filename="chefside.pdf",
        )
        self.other_document = IntegrationDocument.objects.create(
            site=self.other_site,
            document_type="invoice",
            source="api",
            filename="other.pdf",
        )
        self.chefside_category = CleaningCategory.objects.create(
            organization=self.chefside, name="ChefSide Cleaning"
        )
        self.other_category = CleaningCategory.objects.create(
            organization=self.other, name="Other Cleaning"
        )
        self.other_procedure = CleaningProcedure.objects.create(
            organization=self.other,
            category=self.other_category,
            name="Other Procedure",
        )
        self.other_element = CleaningElement.objects.create(
            site=self.other_site,
            category=self.other_category,
            procedure=self.other_procedure,
            name="Other Element",
        )
        self.other_plan = CleaningPlan.objects.create(
            site=self.other_site,
            element=self.other_element,
            cadence="daily",
            due_time=time(10, 0),
            start_date=date.today(),
        )
        RecipeSnapshot.objects.create(
            organization=self.chefside,
            fiche_product_id="11111111-1111-4111-8111-111111111111",
            title="ChefSide Recipe",
            snapshot_hash="chefside-hash",
        )
        RecipeSnapshot.objects.create(
            organization=self.other,
            fiche_product_id="22222222-2222-4222-8222-222222222222",
            title="Other Recipe",
            snapshot_hash="other-hash",
        )
        self.authenticate(self.chefside)

    def authenticate(self, organization):
        token = issue_access_token(
            organization_id=organization.id,
            role="owner",
            kind="test",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    @staticmethod
    def ids(rows):
        return {str(row["id"]) for row in rows}

    def test_lists_only_return_current_organization_records(self):
        checks = (
            (reverse("site-list"), str(self.chefside_site.id), str(self.other_site.id)),
            (reverse("inventory-sector-list-create"), str(self.chefside_sector.id), str(self.other_sector.id)),
            (reverse("inventory-session-list-create"), str(self.chefside_session.id), str(self.other_session.id)),
            (reverse("integration-document-list"), str(self.chefside_document.id), str(self.other_document.id)),
            (reverse("haccp-cleaning-category-list-create"), str(self.chefside_category.id), str(self.other_category.id)),
        )

        for url, visible_id, hidden_id in checks:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK, url)
            rows = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
            row_ids = self.ids(rows)
            self.assertIn(visible_id, row_ids, url)
            self.assertNotIn(hidden_id, row_ids, url)

    def test_other_tenant_sees_its_data_not_chefside_history(self):
        self.authenticate(self.other)

        response = self.client.get(reverse("inventory-session-list-create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids(response.data), {str(self.other_session.id)})

        response = self.client.get(reverse("integration-document-list"))
        rows = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(self.ids(rows), {str(self.other_document.id)})

    def test_cross_tenant_details_and_site_queries_are_not_found(self):
        requests = (
            ("get", reverse("inventory-session-detail", kwargs={"session_id": self.other_session.id})),
            ("get", reverse("integration-document-detail", kwargs={"pk": self.other_document.id})),
            ("patch", reverse("haccp-cleaning-category-detail", kwargs={"category_id": self.other_category.id})),
            ("patch", reverse("haccp-cleaning-procedure-detail", kwargs={"procedure_id": self.other_procedure.id})),
            ("patch", reverse("haccp-cleaning-element-detail", kwargs={"element_id": self.other_element.id})),
            ("patch", reverse("haccp-cleaning-plan-detail", kwargs={"plan_id": self.other_plan.id})),
            ("get", f'{reverse("haccp-traccia-sector-list")}?site={self.other_site.id}'),
        )
        for method, url in requests:
            response = getattr(self.client, method)(url, {}, format="json")
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, url)

    def test_inventory_product_search_does_not_leak_other_catalog(self):
        response = self.client.get(
            reverse("inventory-product-search"),
            {"site": self.chefside_site.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product_ids = {row["supplier_product_id"] for row in response.data["results"]}
        self.assertIn(str(self.chefside_product.id), product_ids)
        self.assertNotIn(str(self.other_product.id), product_ids)

    def test_cross_tenant_writes_are_rejected(self):
        response = self.client.post(
            reverse("inventory-session-list-create"),
            {"site": str(self.other_site.id), "label": "Forbidden"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        response = self.client.post(
            reverse("goods-receipt-create"),
            {
                "site": str(self.other_site.id),
                "supplier": str(self.other_supplier.id),
                "delivery_note_number": "FORBIDDEN",
                "received_at": timezone.now().isoformat(),
                "lines": [],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="tenant-cross-write",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(GoodsReceipt.objects.filter(delivery_note_number="FORBIDDEN").exists())

        other_source = PosSource.objects.create(site=self.other_site, name="Other POS", vendor="test")
        response = self.client.post(
            reverse("pos-import-daily"),
            {
                "site_id": str(self.other_site.id),
                "pos_source_id": str(other_source.id),
                "sales_date": date.today().isoformat(),
                "lines": [],
                "payload": {},
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="tenant-cross-pos",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_recipe_titles_and_import_idempotency_are_tenant_scoped(self):
        self.authenticate(self.other)
        response = self.client.get(reverse("integration-fiches-recipe-titles"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {row["title"] for row in response.data["results"]}
        self.assertIn("Other Recipe", titles)
        self.assertNotIn("ChefSide Recipe", titles)

        response = self.client.post(reverse("integration-fiches-snapshot-import"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.post(reverse("integration-fiches-catalog-import"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        chefside_batch = start_batch(self.chefside.id, "api", "test", "same-key", {})
        other_batch = start_batch(self.other.id, "api", "test", "same-key", {})
        chefside_batch.status = chefside_batch.Status.COMPLETED
        chefside_batch.save(update_fields=["status"])
        other_batch.status = other_batch.Status.COMPLETED
        other_batch.save(update_fields=["status"])

        self.assertEqual(
            find_completed_batch(self.chefside.id, "api", "test", "same-key").id,
            chefside_batch.id,
        )
        self.assertEqual(
            find_completed_batch(self.other.id, "api", "test", "same-key").id,
            other_batch.id,
        )
