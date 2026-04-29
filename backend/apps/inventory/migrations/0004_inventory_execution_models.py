from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0003_supplierproduct_category"),
        ("core", "0001_initial"),
        ("inventory", "0003_inventorymovement_supplier_code"),
    ]

    operations = [
        migrations.CreateModel(
            name="InventorySector",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=160)),
                ("code", models.CharField(blank=True, max_length=64, null=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("site", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="inventory_sectors", to="core.site")),
            ],
            options={
                "db_table": "inventory_sector",
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.CreateModel(
            name="InventorySession",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("label", models.CharField(blank=True, max_length=255, null=True)),
                ("status", models.CharField(choices=[("draft", "draft"), ("in_progress", "in_progress"), ("closed", "closed"), ("cancelled", "cancelled")], default="draft", max_length=24)),
                ("source_app", models.CharField(default="traccia_mobile", max_length=64)),
                ("count_scope", models.CharField(choices=[("site", "site"), ("sector", "sector"), ("point", "point")], default="site", max_length=16)),
                ("notes", models.TextField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("sector", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="inventory_sessions", to="inventory.inventorysector")),
                ("site", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="inventory_sessions", to="core.site")),
            ],
            options={
                "db_table": "inventory_session",
                "ordering": ["-started_at", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="StockPoint",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=160)),
                ("code", models.CharField(blank=True, max_length=64, null=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("sector", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stock_points", to="inventory.inventorysector")),
                ("site", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stock_points", to="core.site")),
            ],
            options={
                "db_table": "inventory_stock_point",
                "ordering": ["sector__sort_order", "sort_order", "name"],
            },
        ),
        migrations.CreateModel(
            name="InventoryCountLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("qty_value", models.DecimalField(decimal_places=3, max_digits=12)),
                ("qty_unit", models.CharField(choices=[("kg", "kg"), ("g", "g"), ("l", "l"), ("ml", "ml"), ("cl", "cl"), ("pc", "pc")], max_length=8)),
                ("expected_qty", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("delta_qty", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("line_order", models.PositiveIntegerField(default=0)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("counted_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="inventory.inventorysession")),
                ("stock_point", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="inventory_count_lines", to="inventory.stockpoint")),
                ("supplier_product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="inventory_count_lines", to="catalog.supplierproduct")),
            ],
            options={
                "db_table": "inventory_count_line",
                "ordering": ["line_order", "created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="inventorysector",
            constraint=models.UniqueConstraint(fields=("site", "name"), name="uq_inventory_sector_site_name"),
        ),
        migrations.AddConstraint(
            model_name="stockpoint",
            constraint=models.UniqueConstraint(fields=("site", "sector", "name"), name="uq_inventory_stock_point_site_sector_name"),
        ),
    ]
