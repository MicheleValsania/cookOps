import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="SupplierProduct",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("supplier_sku", models.CharField(blank=True, max_length=128, null=True)),
                ("ean", models.CharField(blank=True, max_length=64, null=True)),
                (
                    "uom",
                    models.CharField(
                        choices=[("kg", "kg"), ("g", "g"), ("l", "l"), ("ml", "ml"), ("cl", "cl"), ("pc", "pc")],
                        max_length=8,
                    ),
                ),
                ("pack_qty", models.DecimalField(blank=True, decimal_places=3, max_digits=12, null=True)),
                ("active", models.BooleanField(default=True)),
                ("traceability_flag", models.BooleanField(default=False)),
                ("allergens", models.JSONField(blank=True, default=list)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "supplier",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="products", to="catalog.supplier"),
                ),
            ],
            options={
                "db_table": "catalog_supplier_product",
                "ordering": ["name"],
            },
        ),
        migrations.AddConstraint(
            model_name="supplierproduct",
            constraint=models.UniqueConstraint(
                fields=("supplier", "name"),
                name="uq_catalog_supplier_product_supplier_name",
            ),
        ),
    ]
