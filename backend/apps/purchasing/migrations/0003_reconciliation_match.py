import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("purchasing", "0002_invoice_and_lines"),
    ]

    operations = [
        migrations.CreateModel(
            name="InvoiceGoodsReceiptMatch",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "status",
                    models.CharField(
                        choices=[("matched", "matched"), ("partial", "partial"), ("mismatch", "mismatch"), ("manual", "manual")],
                        default="manual",
                        max_length=16,
                    ),
                ),
                ("matched_qty_value", models.DecimalField(blank=True, decimal_places=3, max_digits=12, null=True)),
                ("matched_amount", models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True)),
                ("note", models.TextField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "goods_receipt_line",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reconciliation_matches",
                        to="purchasing.goodsreceiptline",
                    ),
                ),
                (
                    "invoice_line",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reconciliation_matches",
                        to="purchasing.invoiceline",
                    ),
                ),
            ],
            options={
                "db_table": "purchasing_invoice_goods_receipt_match",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="invoicegoodsreceiptmatch",
            constraint=models.UniqueConstraint(
                fields=("invoice_line", "goods_receipt_line"),
                name="uq_purchasing_invoice_goods_receipt_match_pair",
            ),
        ),
    ]
