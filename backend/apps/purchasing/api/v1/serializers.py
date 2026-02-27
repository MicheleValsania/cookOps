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

    def validate(self, attrs):
        supplier = attrs.get("supplier")
        lines = attrs.get("lines", [])
        line_errors = []
        has_errors = False

        for line in lines:
            supplier_product = line.get("supplier_product")
            current_error = {}
            if supplier_product and supplier_product.supplier_id != supplier.id:
                current_error["supplier_product"] = (
                    "supplier_product must belong to the selected supplier."
                )
                has_errors = True
            line_errors.append(current_error)

        if has_errors:
            raise serializers.ValidationError({"lines": line_errors})

        return attrs

    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])
        receipt = GoodsReceipt.objects.create(**validated_data)
        GoodsReceiptLine.objects.bulk_create(
            [GoodsReceiptLine(receipt=receipt, **line_data) for line_data in lines_data]
        )
        return receipt
