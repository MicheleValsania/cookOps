import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


DEFAULT_ORGANIZATION_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def assign_historical_cleaning_data(apps, schema_editor):
    CleaningCategory = apps.get_model("integration", "CleaningCategory")
    CleaningProcedure = apps.get_model("integration", "CleaningProcedure")
    CleaningCategory.objects.filter(organization__isnull=True).update(
        organization_id=DEFAULT_ORGANIZATION_ID
    )
    CleaningProcedure.objects.filter(organization__isnull=True).update(
        organization_id=DEFAULT_ORGANIZATION_ID
    )


def unassign_historical_cleaning_data(apps, schema_editor):
    CleaningCategory = apps.get_model("integration", "CleaningCategory")
    CleaningProcedure = apps.get_model("integration", "CleaningProcedure")
    CleaningCategory.objects.filter(organization_id=DEFAULT_ORGANIZATION_ID).update(organization=None)
    CleaningProcedure.objects.filter(organization_id=DEFAULT_ORGANIZATION_ID).update(organization=None)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_organization_tenancy"),
        ("integration", "0006_cleaning_models"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleaningcategory",
            name="organization",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="cleaning_categories",
                to="core.organization",
            ),
        ),
        migrations.AddField(
            model_name="cleaningprocedure",
            name="organization",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="cleaning_procedures",
                to="core.organization",
            ),
        ),
        migrations.RunPython(assign_historical_cleaning_data, unassign_historical_cleaning_data),
        migrations.AlterField(
            model_name="cleaningcategory",
            name="organization",
            field=models.ForeignKey(
                default=settings.DEFAULT_ORGANIZATION_ID,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="cleaning_categories",
                to="core.organization",
            ),
        ),
        migrations.AlterField(
            model_name="cleaningprocedure",
            name="organization",
            field=models.ForeignKey(
                default=settings.DEFAULT_ORGANIZATION_ID,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="cleaning_procedures",
                to="core.organization",
            ),
        ),
    ]
