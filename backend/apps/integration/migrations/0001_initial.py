import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("catalog", "0002_supplierproduct"),
    ]

    operations = [
        migrations.CreateModel(
            name="RecipeSnapshot",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("fiche_product_id", models.UUIDField()),
                ("title", models.CharField(max_length=255)),
                ("category", models.CharField(blank=True, max_length=128, null=True)),
                ("portions", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("snapshot_hash", models.CharField(max_length=128)),
                ("source_updated_at", models.DateTimeField(blank=True, null=True)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "integration_recipe_snapshot",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="RecipeIngredientLink",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("fiche_product_id", models.UUIDField()),
                ("qty_value", models.DecimalField(blank=True, decimal_places=3, max_digits=12, null=True)),
                (
                    "qty_unit",
                    models.CharField(
                        choices=[("kg", "kg"), ("g", "g"), ("l", "l"), ("ml", "ml"), ("cl", "cl"), ("pc", "pc")],
                        max_length=8,
                    ),
                ),
                ("note", models.TextField(blank=True, null=True)),
                ("snapshot_hash", models.CharField(max_length=128)),
                (
                    "supplier_product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ingredient_links",
                        to="catalog.supplierproduct",
                    ),
                ),
            ],
            options={
                "db_table": "integration_recipe_ingredient_link",
                "ordering": ["fiche_product_id", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="recipesnapshot",
            constraint=models.UniqueConstraint(
                fields=("fiche_product_id", "snapshot_hash"),
                name="uq_integration_recipe_snapshot_fiche_hash",
            ),
        ),
    ]
