import uuid
from decimal import Decimal

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("purchasing", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Invoice",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("invoice_number", models.CharField(max_length=128)),
                ("invoice_date", models.DateField()),
                ("due_date", models.DateField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "site",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="invoices", to="core.site"),
                ),
                (
                    "supplier",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="invoices", to="catalog.supplier"),
                ),
            ],
            options={
                "db_table": "purchasing_invoice",
                "ordering": ["-invoice_date", "invoice_number"],
            },
        ),
        migrations.CreateModel(
            name="InvoiceLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("raw_product_name", models.CharField(blank=True, max_length=255, null=True)),
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
                ("line_total", models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True)),
                ("vat_rate", models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ("note", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "goods_receipt_line",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="invoice_lines",
                        to="purchasing.goodsreceiptline",
                    ),
                ),
                (
                    "invoice",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="purchasing.invoice"),
                ),
                (
                    "supplier_product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="invoice_lines",
                        to="catalog.supplierproduct",
                    ),
                ),
            ],
            options={
                "db_table": "purchasing_invoice_line",
                "ordering": ["id"],
            },
        ),
        migrations.AddConstraint(
            model_name="invoice",
            constraint=models.UniqueConstraint(
                fields=("site", "supplier", "invoice_number"),
                name="uq_purchasing_invoice_site_supplier_number",
            ),
        ),
    ]
