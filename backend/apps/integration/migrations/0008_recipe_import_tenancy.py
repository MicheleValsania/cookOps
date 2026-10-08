import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


DEFAULT_ORGANIZATION_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def assign_historical_data(apps, schema_editor):
    for model_name in ("IntegrationImportBatch", "RecipeSnapshot", "RecipeIngredientLink"):
        model = apps.get_model("integration", model_name)
        model.objects.filter(organization__isnull=True).update(
            organization_id=DEFAULT_ORGANIZATION_ID
        )


def unassign_historical_data(apps, schema_editor):
    for model_name in ("IntegrationImportBatch", "RecipeSnapshot", "RecipeIngredientLink"):
        model = apps.get_model("integration", model_name)
        model.objects.filter(organization_id=DEFAULT_ORGANIZATION_ID).update(organization=None)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_organization_tenancy"),
        ("integration", "0007_cleaning_tenancy"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="recipesnapshot",
            name="uq_integration_recipe_snapshot_fiche_hash",
        ),
        migrations.AddField(
            model_name="integrationimportbatch",
            name="organization",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="integration_import_batches",
                to="core.organization",
            ),
        ),
        migrations.AddField(
            model_name="recipeingredientlink",
            name="organization",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="recipe_ingredient_links",
                to="core.organization",
            ),
        ),
        migrations.AddField(
            model_name="recipesnapshot",
            name="organization",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="recipe_snapshots",
                to="core.organization",
            ),
        ),
        migrations.RunPython(assign_historical_data, unassign_historical_data),
        migrations.AlterField(
            model_name="integrationimportbatch",
            name="organization",
            field=models.ForeignKey(
                default=settings.DEFAULT_ORGANIZATION_ID,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="integration_import_batches",
                to="core.organization",
            ),
        ),
        migrations.AlterField(
            model_name="recipeingredientlink",
            name="organization",
            field=models.ForeignKey(
                default=settings.DEFAULT_ORGANIZATION_ID,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="recipe_ingredient_links",
                to="core.organization",
            ),
        ),
        migrations.AlterField(
            model_name="recipesnapshot",
            name="organization",
            field=models.ForeignKey(
                default=settings.DEFAULT_ORGANIZATION_ID,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="recipe_snapshots",
                to="core.organization",
            ),
        ),
        migrations.AddConstraint(
            model_name="recipesnapshot",
            constraint=models.UniqueConstraint(
                fields=("organization", "fiche_product_id", "snapshot_hash"),
                name="uq_integration_recipe_snapshot_org_fiche_hash",
            ),
        ),
    ]
