import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("integration", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="IntegrationImportBatch",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("source", models.CharField(max_length=64)),
                ("import_type", models.CharField(max_length=64)),
                (
                    "status",
                    models.CharField(
                        choices=[("started", "started"), ("completed", "completed"), ("failed", "failed")],
                        default="started",
                        max_length=16,
                    ),
                ),
                ("idempotency_key", models.CharField(blank=True, max_length=255, null=True)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("result", models.JSONField(blank=True, default=dict)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "integration_import_batch",
                "ordering": ["-started_at"],
            },
        ),
    ]
