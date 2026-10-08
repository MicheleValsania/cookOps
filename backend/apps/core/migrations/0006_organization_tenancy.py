import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


DEFAULT_ORGANIZATION_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def assign_historical_data(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    Site = apps.get_model("core", "Site")
    organization, _ = Organization.objects.update_or_create(
        id=DEFAULT_ORGANIZATION_ID,
        defaults={
            "name": "ChefSide France",
            "slug": "chefside-france",
            "is_active": True,
        },
    )
    Site.objects.filter(organization__isnull=True).update(organization=organization)


def unassign_historical_data(apps, schema_editor):
    Site = apps.get_model("core", "Site")
    Organization = apps.get_model("core", "Organization")
    Site.objects.filter(organization_id=DEFAULT_ORGANIZATION_ID).update(organization=None)
    Organization.objects.filter(id=DEFAULT_ORGANIZATION_ID).delete()


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0005_alter_servicemenuentry_expected_qty"),
    ]

    operations = [
        migrations.CreateModel(
            name="Organization",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("slug", models.SlugField(max_length=120, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "core_organization", "ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="OrganizationMembership",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "role",
                    models.CharField(
                        choices=[
                            ("owner", "owner"),
                            ("admin", "admin"),
                            ("manager", "manager"),
                            ("operator", "operator"),
                            ("viewer", "viewer"),
                        ],
                        default="operator",
                        max_length=16,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="memberships",
                        to="core.organization",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cookops_memberships",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "core_organization_membership"},
        ),
        migrations.AddField(
            model_name="site",
            name="organization",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="sites",
                to="core.organization",
            ),
        ),
        migrations.RunPython(assign_historical_data, unassign_historical_data),
        migrations.AlterField(
            model_name="site",
            name="organization",
            field=models.ForeignKey(
                default=settings.DEFAULT_ORGANIZATION_ID,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="sites",
                to="core.organization",
            ),
        ),
        migrations.AlterField(
            model_name="site",
            name="code",
            field=models.CharField(max_length=100),
        ),
        migrations.AddConstraint(
            model_name="organizationmembership",
            constraint=models.UniqueConstraint(
                fields=("organization", "user"),
                name="uq_core_organization_membership_user",
            ),
        ),
        migrations.AddConstraint(
            model_name="site",
            constraint=models.UniqueConstraint(
                fields=("organization", "code"),
                name="uq_core_site_organization_code",
            ),
        ),
    ]
