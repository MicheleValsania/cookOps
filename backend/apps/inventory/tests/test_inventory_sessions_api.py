from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Site
from apps.inventory.models import InventoryCountLine, InventoryMovement, InventorySector, InventorySession, StockPoint


class InventorySessionsApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Main Site", code="MAIN")
        self.supplier = Supplier.objects.create(name="Metro")
        self.product = SupplierProduct.objects.create(
            supplier=self.supplier,
            name="Mozzarella Fior di Latte",
            supplier_sku="MOZ-001",
            uom="kg",
            category="bof",
        )
        self.sector = InventorySector.objects.create(site=self.site, name="Cuisine")
        self.stock_point = StockPoint.objects.create(site=self.site, sector=self.sector, name="Frigo 1")

    def test_create_sector_and_stock_point(self):
        response = self.client.post(
            "/api/v1/inventory/sectors/",
            {"site": str(self.site.id), "name": "Bar", "sort_order": 2},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        sector_id = response.json()["id"]
        response = self.client.post(
            "/api/v1/inventory/stock-points/",
            {"site": str(self.site.id), "sector": sector_id, "name": "Back Bar"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_session_bulk_upsert_and_close_creates_adjustment_movement(self):
        InventoryMovement.objects.create(
            site=self.site,
            supplier_product=self.product,
            supplier_code=self.product.supplier_sku,
            raw_product_name=self.product.name,
            movement_type="IN",
            qty_value="10.000",
            qty_unit="kg",
            happened_at="2026-04-20T10:00:00Z",
            ref_type="goods_receipt_line",
            ref_id="seed-line-1",
        )

        response = self.client.post(
            "/api/v1/inventory/sessions/",
            {
                "site": str(self.site.id),
                "sector": str(self.sector.id),
                "count_scope": "sector",
                "source_app": "cookops_web",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        session_id = response.json()["id"]

        response = self.client.post(
            f"/api/v1/inventory/sessions/{session_id}/lines/bulk-upsert/",
            {
                "lines": [
                    {
                        "stock_point": str(self.stock_point.id),
                        "supplier_product": str(self.product.id),
                        "qty_value": "8.000",
                        "qty_unit": "kg",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(InventoryCountLine.objects.filter(session_id=session_id).count(), 1)
        line = InventoryCountLine.objects.get(session_id=session_id)
        self.assertEqual(str(line.expected_qty), "10.000")
        self.assertEqual(str(line.delta_qty), "-2.000")

        response = self.client.post(f"/api/v1/inventory/sessions/{session_id}/close/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertEqual(payload["created_adjustments"], 1)

        session = InventorySession.objects.get(id=session_id)
        self.assertEqual(session.status, "closed")
        movement = InventoryMovement.objects.filter(ref_type="inventory_session_close", ref_id=str(session.id)).get()
        self.assertEqual(movement.movement_type, "OUT")
        self.assertEqual(str(movement.qty_value), "2.000")

    def test_products_endpoint_returns_current_stock(self):
        InventoryMovement.objects.create(
            site=self.site,
            supplier_product=self.product,
            supplier_code=self.product.supplier_sku,
            raw_product_name=self.product.name,
            movement_type="IN",
            qty_value="4.000",
            qty_unit="kg",
            happened_at="2026-04-20T10:00:00Z",
            ref_type="goods_receipt_line",
            ref_id="seed-line-2",
        )

        response = self.client.get(f"/api/v1/inventory/products/?site={self.site.id}&q=moz")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        row = payload["results"][0]
        self.assertEqual(row["supplier_code"], "MOZ-001")
        self.assertEqual(row["current_stock"], "4.000")

    def test_session_can_be_updated_and_line_deleted(self):
        session = InventorySession.objects.create(
            site=self.site,
            sector=self.sector,
            label="Conteggio sera",
            source_app="cookops_web",
            count_scope="sector",
        )
        line = InventoryCountLine.objects.create(
            session=session,
            stock_point=self.stock_point,
            supplier_product=self.product,
            qty_value="3.000",
            qty_unit="kg",
            expected_qty="4.000",
            delta_qty="-1.000",
        )

        response = self.client.patch(
            f"/api/v1/inventory/sessions/{session.id}/",
            {
                "label": "Conteggio chiusura",
                "notes": "Verifica frigo 1",
                "status": "in_progress",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        session.refresh_from_db()
        self.assertEqual(session.label, "Conteggio chiusura")
        self.assertEqual(session.notes, "Verifica frigo 1")
        self.assertEqual(session.status, "in_progress")

        response = self.client.delete(f"/api/v1/inventory/sessions/{session.id}/lines/{line.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(InventoryCountLine.objects.filter(id=line.id).exists())
