import uuid
from decimal import Decimal

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("catalog", "0002_supplierproduct"),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="GoodsReceipt",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("delivery_note_number", models.CharField(max_length=128)),
                ("received_at", models.DateTimeField()),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "site",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="goods_receipts", to="core.site"),
                ),
                (
                    "supplier",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="goods_receipts", to="catalog.supplier"),
                ),
            ],
            options={
                "db_table": "purchasing_goods_receipt",
                "ordering": ["-received_at", "delivery_note_number"],
            },
        ),
        migrations.CreateModel(
            name="GoodsReceiptLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("raw_product_name", models.CharField(blank=True, max_length=255, null=True)),
                ("supplier_lot_code", models.CharField(blank=True, max_length=128, null=True)),
                ("dlc_date", models.DateField(blank=True, null=True)),
                (
                    "qty_value",
                    models.DecimalField(
                        decimal_places=3,
                        max_digits=12,
                        validators=[django.core.validators.MinValueValidator(Decimal("0.001"))],
                    ),
                ),
                (
                    "qty_unit",
                    models.CharField(
                        choices=[("kg", "kg"), ("g", "g"), ("l", "l"), ("ml", "ml"), ("cl", "cl"), ("pc", "pc")],
                        max_length=8,
                    ),
                ),
                ("unit_price", models.DecimalField(blank=True, decimal_places=4, max_digits=12, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "receipt",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="purchasing.goodsreceipt"),
                ),
                (
                    "supplier_product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="goods_receipt_lines",
                        to="catalog.supplierproduct",
                    ),
                ),
            ],
            options={
                "db_table": "purchasing_goods_receipt_line",
                "ordering": ["id"],
            },
        ),
        migrations.AddConstraint(
            model_name="goodsreceipt",
            constraint=models.UniqueConstraint(
                fields=("site", "supplier", "delivery_note_number"),
                name="uq_purchasing_gr_site_supplier_delivery_note",
            ),
        ),
    ]
