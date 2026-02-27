import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("integration", "0002_integrationimportbatch"),
    ]

    operations = [
        migrations.CreateModel(
            name="IntegrationDocument",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "document_type",
                    models.CharField(choices=[("goods_receipt", "goods_receipt"), ("invoice", "invoice")], max_length=32),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[("upload", "upload"), ("email", "email"), ("api", "api")],
                        default="upload",
                        max_length=16,
                    ),
                ),
                ("filename", models.CharField(max_length=255)),
                ("content_type", models.CharField(blank=True, max_length=128, null=True)),
                ("file_size", models.BigIntegerField(blank=True, null=True)),
                ("file", models.FileField(blank=True, null=True, upload_to="integration/documents/%Y/%m/%d")),
                ("storage_path", models.CharField(blank=True, max_length=500, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("uploaded", "uploaded"), ("processing", "processing"), ("extracted", "extracted"), ("failed", "failed")],
                        default="uploaded",
                        max_length=16,
                    ),
                ),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "site",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="integration_documents", to="core.site"),
                ),
            ],
            options={
                "db_table": "integration_document",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="DocumentExtraction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("extractor_name", models.CharField(max_length=64)),
                ("extractor_version", models.CharField(blank=True, max_length=32, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "pending"), ("succeeded", "succeeded"), ("failed", "failed")],
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("raw_payload", models.JSONField(blank=True, default=dict)),
                ("normalized_payload", models.JSONField(blank=True, default=dict)),
                ("confidence", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("error_message", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "document",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="extractions", to="integration.integrationdocument"),
                ),
            ],
            options={
                "db_table": "integration_document_extraction",
                "ordering": ["-created_at"],
            },
        ),
    ]
