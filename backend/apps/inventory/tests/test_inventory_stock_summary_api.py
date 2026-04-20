from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Site
from apps.inventory.models import InventoryMovement


class InventoryStockSummaryApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Inventory Site", code="INV-SITE")
        self.supplier = Supplier.objects.create(name="GINEYS S.A.S")
        self.product = SupplierProduct.objects.create(
            supplier=self.supplier,
            name="CREME TENUE FOISONNEMENT 35% DEBIC (Poche=5L)",
            supplier_sku="0261249",
            uom="l",
            category="bof",
        )

    def test_stock_summary_groups_movements_by_supplier_product_even_when_code_is_missing(self):
        InventoryMovement.objects.create(
            site=self.site,
            supplier_product=self.product,
            supplier_code="0261249",
            raw_product_name=self.product.name,
            movement_type="IN",
            qty_value="10.000",
            qty_unit="l",
        )
        InventoryMovement.objects.create(
            site=self.site,
            supplier_product=self.product,
            supplier_code=None,
            raw_product_name=self.product.name,
            movement_type="IN",
            qty_value="5.000",
            qty_unit="l",
        )

        response = self.client.get(f"/api/v1/inventory/stock-summary/?site={self.site.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        row = payload["results"][0]
        self.assertEqual(row["supplier_code"], "0261249")
        self.assertEqual(row["product_key"], "0261249")
        self.assertEqual(row["product_name"], self.product.name)
        self.assertEqual(row["current_stock"], "15.000")
