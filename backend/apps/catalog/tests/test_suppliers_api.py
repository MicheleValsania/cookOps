from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.models import Supplier, SupplierProduct


class SupplierApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")

    def test_list_suppliers_returns_200(self):
        response = self.client.get("/api/v1/suppliers/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), [])

    def test_create_supplier_returns_201(self):
        payload = {
            "name": "Metro",
            "vat_number": "IT12345678901",
            "metadata": {"source": "manual"},
        }

        response = self.client.post("/api/v1/suppliers/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Supplier.objects.count(), 1)
        self.assertEqual(Supplier.objects.first().name, "Metro")

    def test_list_supplier_products_returns_200(self):
        supplier = Supplier.objects.create(name="Supplier A")
        SupplierProduct.objects.create(
            supplier=supplier,
            name="Tomatoes",
            uom="kg",
        )

        response = self.client.get(f"/api/v1/suppliers/{supplier.id}/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["name"], "Tomatoes")

    def test_create_supplier_product_returns_201(self):
        supplier = Supplier.objects.create(name="Supplier B")
        payload = {
            "name": "Olive oil",
            "supplier_sku": "SKU-001",
            "ean": "1234567890123",
            "uom": "l",
            "pack_qty": "1.000",
            "active": True,
            "traceability_flag": False,
            "allergens": [],
            "metadata": {"origin": "IT"},
        }

        response = self.client.post(f"/api/v1/suppliers/{supplier.id}/products/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SupplierProduct.objects.count(), 1)
        created = SupplierProduct.objects.first()
        self.assertEqual(created.supplier_id, supplier.id)
        self.assertEqual(created.name, "Olive oil")
