import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


DEFAULT_ORGANIZATION_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def assign_historical_suppliers(apps, schema_editor):
    Supplier = apps.get_model("catalog", "Supplier")
    Supplier.objects.filter(organization__isnull=True).update(organization_id=DEFAULT_ORGANIZATION_ID)


def unassign_historical_suppliers(apps, schema_editor):
    Supplier = apps.get_model("catalog", "Supplier")
    Supplier.objects.filter(organization_id=DEFAULT_ORGANIZATION_ID).update(organization=None)


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0003_supplierproduct_category"),
        ("core", "0006_organization_tenancy"),
    ]

    operations = [
        migrations.AddField(
            model_name="supplier",
            name="organization",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="suppliers",
                to="core.organization",
            ),
        ),
        migrations.RunPython(assign_historical_suppliers, unassign_historical_suppliers),
        migrations.AlterField(
            model_name="supplier",
            name="organization",
            field=models.ForeignKey(
                default=settings.DEFAULT_ORGANIZATION_ID,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="suppliers",
                to="core.organization",
            ),
        ),
        migrations.AlterField(
            model_name="supplier",
            name="name",
            field=models.CharField(max_length=255),
        ),
        migrations.AddConstraint(
            model_name="supplier",
            constraint=models.UniqueConstraint(
                fields=("organization", "name"),
                name="uq_catalog_supplier_organization_name",
            ),
        ),
    ]
