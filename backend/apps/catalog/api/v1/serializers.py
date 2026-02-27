from rest_framework import serializers

from apps.catalog.models import Supplier, SupplierProduct


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ("id", "name", "vat_number", "metadata", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class SupplierProductSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = SupplierProduct
        fields = (
            "id",
            "supplier",
            "supplier_name",
            "name",
            "supplier_sku",
            "ean",
            "uom",
            "pack_qty",
            "active",
            "traceability_flag",
            "allergens",
            "metadata",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "supplier", "created_at", "updated_at")
