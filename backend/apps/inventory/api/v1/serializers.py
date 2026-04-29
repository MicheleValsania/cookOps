from rest_framework import serializers

from apps.inventory.models import (
    InventoryCountLine,
    InventoryMovement,
    InventorySector,
    InventorySession,
    Lot,
    StockPoint,
)


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


class InventorySectorSerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", read_only=True)

    class Meta:
        model = InventorySector
        fields = ("id", "site", "site_name", "name", "code", "sort_order", "is_active")


class StockPointSerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", read_only=True)
    sector_name = serializers.CharField(source="sector.name", read_only=True)

    class Meta:
        model = StockPoint
        fields = ("id", "site", "site_name", "sector", "sector_name", "name", "code", "sort_order", "is_active", "metadata")


class InventoryCountLineSerializer(serializers.ModelSerializer):
    supplier_product_name = serializers.CharField(source="supplier_product.name", read_only=True)
    supplier_id = serializers.UUIDField(source="supplier_product.supplier_id", read_only=True)
    supplier_name = serializers.CharField(source="supplier_product.supplier.name", read_only=True)
    supplier_code = serializers.CharField(source="supplier_product.supplier_sku", read_only=True)
    stock_point_name = serializers.CharField(source="stock_point.name", read_only=True)

    class Meta:
        model = InventoryCountLine
        fields = (
            "id",
            "session",
            "stock_point",
            "stock_point_name",
            "supplier_product",
            "supplier_product_name",
            "supplier_id",
            "supplier_name",
            "supplier_code",
            "qty_value",
            "qty_unit",
            "expected_qty",
            "delta_qty",
            "line_order",
            "metadata",
            "counted_at",
        )
        read_only_fields = ("expected_qty", "delta_qty", "counted_at")


class InventorySessionSerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", read_only=True)
    sector_name = serializers.CharField(source="sector.name", read_only=True)

    class Meta:
        model = InventorySession
        fields = (
            "id",
            "site",
            "site_name",
            "sector",
            "sector_name",
            "label",
            "status",
            "source_app",
            "count_scope",
            "notes",
            "metadata",
            "started_at",
            "closed_at",
        )


class InventorySessionDetailSerializer(InventorySessionSerializer):
    lines = InventoryCountLineSerializer(many=True, read_only=True)

    class Meta(InventorySessionSerializer.Meta):
        fields = InventorySessionSerializer.Meta.fields + ("lines",)


class InventoryCountLineUpsertSerializer(serializers.Serializer):
    stock_point = serializers.UUIDField(required=False, allow_null=True)
    supplier_product = serializers.UUIDField()
    qty_value = serializers.DecimalField(max_digits=12, decimal_places=3)
    qty_unit = serializers.CharField(max_length=8)
    line_order = serializers.IntegerField(required=False, default=0)
    metadata = serializers.JSONField(required=False, default=dict)


class InventoryCountLineBulkUpsertSerializer(serializers.Serializer):
    lines = InventoryCountLineUpsertSerializer(many=True, allow_empty=False)
