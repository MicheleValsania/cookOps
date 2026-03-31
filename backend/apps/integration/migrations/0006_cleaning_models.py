from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("integration", "0005_alter_integrationdocument_document_type_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="CleaningCategory",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=160)),
                ("description", models.TextField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "cleaning_category",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="CleaningProcedure",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=200)),
                ("steps", models.JSONField(blank=True, default=list)),
                ("notes", models.TextField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "category",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="procedures",
                        to="integration.cleaningcategory",
                    ),
                ),
            ],
            options={
                "db_table": "cleaning_procedure",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="CleaningElement",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=200)),
                ("is_global", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "category",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="elements",
                        to="integration.cleaningcategory",
                    ),
                ),
                (
                    "procedure",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="elements",
                        to="integration.cleaningprocedure",
                    ),
                ),
                (
                    "site",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cleaning_elements",
                        to="core.site",
                    ),
                ),
            ],
            options={
                "db_table": "cleaning_element",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="CleaningElementArea",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sector_id", models.UUIDField()),
                ("sector_name", models.CharField(max_length=160)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "element",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="areas",
                        to="integration.cleaningelement",
                    ),
                ),
            ],
            options={
                "db_table": "cleaning_element_area",
                "ordering": ["sort_order", "sector_name"],
            },
        ),
        migrations.CreateModel(
            name="CleaningPlan",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sector_id", models.UUIDField(blank=True, null=True)),
                ("sector_name", models.CharField(blank=True, max_length=160, null=True)),
                ("cadence", models.CharField(choices=[("after_use", "after_use"), ("end_of_service", "end_of_service"), ("daily", "daily"), ("twice_weekly", "twice_weekly"), ("weekly", "weekly"), ("fortnightly", "fortnightly"), ("monthly", "monthly"), ("quarterly", "quarterly"), ("semiannual", "semiannual"), ("annual", "annual")], default="daily", max_length=32)),
                ("due_time", models.TimeField()),
                ("start_date", models.DateField()),
                ("timezone", models.CharField(default="Europe/Paris", max_length=64)),
                ("is_active", models.BooleanField(default=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "element",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="plans",
                        to="integration.cleaningelement",
                    ),
                ),
                (
                    "site",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cleaning_plans",
                        to="core.site",
                    ),
                ),
            ],
            options={
                "db_table": "cleaning_plan",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="cleaningplan",
            index=models.Index(fields=["site", "cadence"], name="idx_cleaning_plan_site_cadence"),
        ),
        migrations.AddConstraint(
            model_name="cleaningelementarea",
            constraint=models.UniqueConstraint(fields=("element", "sector_id"), name="uq_cleaning_element_area_element_sector"),
        ),
    ]
