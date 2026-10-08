from django.conf import settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Organization, Site


class TenantIsolationApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.chefside = Organization.objects.get(pk=settings.DEFAULT_ORGANIZATION_ID)
        self.other = Organization.objects.create(name="Other Restaurant", slug="other-restaurant")

    def test_legacy_key_only_lists_chefside_sites(self):
        chefside_site = Site.objects.create(organization=self.chefside, name="ChefSide", code="CHEFSIDE")
        other_site = Site.objects.create(organization=self.other, name="Other", code="OTHER")

        response = self.client.get("/api/v1/sites/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {row["id"] for row in response.json()}
        self.assertIn(str(chefside_site.id), returned_ids)
        self.assertNotIn(str(other_site.id), returned_ids)

    def test_legacy_key_cannot_read_or_modify_another_organization_site(self):
        other_site = Site.objects.create(organization=self.other, name="Other", code="OTHER")

        patch_response = self.client.patch(
            f"/api/v1/sites/{other_site.id}/",
            {"name": "Changed"},
            format="json",
        )
        delete_response = self.client.delete(
            f"/api/v1/sites/{other_site.id}/",
            {"confirm_text": "ELIMINA DEFINITIVAMENTE"},
            format="json",
        )

        self.assertEqual(patch_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)
        other_site.refresh_from_db()
        self.assertEqual(other_site.name, "Other")

    def test_supplier_catalog_is_isolated_by_organization(self):
        chefside_supplier = Supplier.objects.create(organization=self.chefside, name="ChefSide Supplier")
        other_supplier = Supplier.objects.create(organization=self.other, name="Other Supplier")
        SupplierProduct.objects.create(supplier=other_supplier, name="Hidden Product", uom="kg")

        suppliers_response = self.client.get("/api/v1/suppliers/")
        products_response = self.client.get(f"/api/v1/suppliers/{other_supplier.id}/products/")

        self.assertEqual(suppliers_response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in suppliers_response.json()], [str(chefside_supplier.id)])
        self.assertEqual(products_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_created_records_belong_to_authenticated_organization(self):
        site_response = self.client.post(
            "/api/v1/sites/",
            {"name": "New Site", "code": "NEW_SITE"},
            format="json",
        )
        supplier_response = self.client.post(
            "/api/v1/suppliers/",
            {"name": "New Supplier"},
            format="json",
        )

        self.assertEqual(site_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(supplier_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Site.objects.get(pk=site_response.json()["id"]).organization, self.chefside)
        self.assertEqual(Supplier.objects.get(pk=supplier_response.json()["id"]).organization, self.chefside)
