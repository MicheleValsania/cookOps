from rest_framework import serializers

from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine


class GoodsReceiptLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = GoodsReceiptLine
        fields = (
            "id",
            "supplier_product",
            "raw_product_name",
            "supplier_lot_code",
            "dlc_date",
            "qty_value",
            "qty_unit",
            "unit_price",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_qty_value(self, value):
        if value <= 0:
            raise serializers.ValidationError("qty_value must be greater than 0.")
        return value


class GoodsReceiptSerializer(serializers.ModelSerializer):
    lines = GoodsReceiptLineSerializer(many=True)

    class Meta:
        model = GoodsReceipt
        fields = (
            "id",
            "site",
            "supplier",
            "delivery_note_number",
            "received_at",
            "metadata",
            "lines",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])
        receipt = GoodsReceipt.objects.create(**validated_data)
        GoodsReceiptLine.objects.bulk_create(
            [GoodsReceiptLine(receipt=receipt, **line_data) for line_data in lines_data]
        )
        return receipt
