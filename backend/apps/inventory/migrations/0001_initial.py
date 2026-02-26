import uuid

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
            name="Lot",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "source_type",
                    models.CharField(choices=[("supplier_product", "supplier_product"), ("recipe", "recipe")], max_length=32),
                ),
                ("fiche_product_id", models.UUIDField(blank=True, null=True)),
                ("recipe_snapshot_hash", models.CharField(blank=True, max_length=128, null=True)),
                ("supplier_lot_code", models.CharField(blank=True, max_length=128, null=True)),
                ("internal_lot_code", models.CharField(max_length=128)),
                ("production_date", models.DateField(blank=True, null=True)),
                ("dlc_date", models.DateField(blank=True, null=True)),
                ("qty_value", models.DecimalField(decimal_places=3, max_digits=12)),
                (
                    "qty_unit",
                    models.CharField(
                        choices=[("kg", "kg"), ("g", "g"), ("l", "l"), ("ml", "ml"), ("cl", "cl"), ("pc", "pc")],
                        max_length=8,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("active", "active"), ("consumed", "consumed"), ("discarded", "discarded"), ("blocked", "blocked")],
                        default="active",
                        max_length=16,
                    ),
                ),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "site",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="lots", to="core.site"),
                ),
                (
                    "supplier_product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="lots",
                        to="catalog.supplierproduct",
                    ),
                ),
            ],
            options={
                "db_table": "inventory_lot",
                "ordering": ["internal_lot_code"],
            },
        ),
        migrations.CreateModel(
            name="InventoryMovement",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "movement_type",
                    models.CharField(choices=[("IN", "IN"), ("OUT", "OUT"), ("ADJUST", "ADJUST"), ("TRANSFER", "TRANSFER")], max_length=16),
                ),
                ("qty_value", models.DecimalField(decimal_places=3, max_digits=12)),
                (
                    "qty_unit",
                    models.CharField(
                        choices=[("kg", "kg"), ("g", "g"), ("l", "l"), ("ml", "ml"), ("cl", "cl"), ("pc", "pc")],
                        max_length=8,
                    ),
                ),
                ("happened_at", models.DateTimeField()),
                ("ref_type", models.CharField(blank=True, max_length=64, null=True)),
                ("ref_id", models.CharField(blank=True, max_length=128, null=True)),
                (
                    "lot",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="movements",
                        to="inventory.lot",
                    ),
                ),
                (
                    "supplier_product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="inventory_movements",
                        to="catalog.supplierproduct",
                    ),
                ),
            ],
            options={
                "db_table": "inventory_movement",
                "ordering": ["-happened_at", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="lot",
            constraint=models.UniqueConstraint(
                fields=("site", "internal_lot_code"),
                name="uq_inventory_lot_site_internal_lot_code",
            ),
        ),
    ]
