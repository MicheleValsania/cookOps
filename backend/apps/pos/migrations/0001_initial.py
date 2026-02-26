import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PosSource",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("vendor", models.CharField(max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "site",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="pos_sources", to="core.site"),
                ),
            ],
            options={
                "db_table": "pos_source",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="SalesEventDaily",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sales_date", models.DateField()),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "pos_source",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="sales_events_daily", to="pos.possource"),
                ),
                (
                    "site",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="sales_events_daily", to="core.site"),
                ),
            ],
            options={
                "db_table": "pos_sales_event_daily",
                "ordering": ["-sales_date"],
            },
        ),
        migrations.AddConstraint(
            model_name="saleseventdaily",
            constraint=models.UniqueConstraint(
                fields=("site", "pos_source", "sales_date"),
                name="uq_pos_sales_event_daily_site_source_date",
            ),
        ),
    ]
