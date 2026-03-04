from rest_framework import serializers

from apps.inventory.models import InventoryMovement, Lot


class LotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lot
        fields = (
            "id",
            "site",
            "source_type",
            "supplier_product",
            "supplier_lot_code",
            "internal_lot_code",
            "production_date",
            "dlc_date",
            "qty_value",
            "qty_unit",
            "status",
            "metadata",
        )
        read_only_fields = fields


class InventoryMovementSerializer(serializers.ModelSerializer):
    lot = LotSerializer(read_only=True)
    supplier_product_name = serializers.CharField(source="supplier_product.name", read_only=True)

    class Meta:
        model = InventoryMovement
        fields = (
            "id",
            "site",
            "movement_type",
            "qty_value",
            "qty_unit",
            "happened_at",
            "ref_type",
            "ref_id",
            "supplier_product",
            "supplier_product_name",
            "supplier_code",
            "raw_product_name",
            "lot",
        )
        read_only_fields = fields
