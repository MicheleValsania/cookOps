from rest_framework import serializers

from apps.catalog.models import Supplier, SupplierProduct


class SupplierSerializer(serializers.ModelSerializer):
    def validate_name(self, value):
        duplicate = Supplier.find_by_normalized_name(value)
        if duplicate and (not self.instance or duplicate.id != self.instance.id):
            raise serializers.ValidationError(
                f"A supplier with equivalent normalized name already exists: {duplicate.name}."
            )
        return str(value or "").strip()

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
            "category",
            "allergens",
            "metadata",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "supplier", "created_at", "updated_at")
