from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_alter_servicemenuentry_expected_qty"),
        ("integration", "0003_documents_and_extractions"),
        ("purchasing", "0004_line_supplier_code"),
    ]

    operations = [
        migrations.CreateModel(
            name="TraceabilityReconciliationDecision",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("event_id", models.CharField(max_length=128)),
                (
                    "decision_status",
                    models.CharField(
                        choices=[("review_required", "review_required"), ("ignored", "ignored"), ("matched", "matched")],
                        max_length=24,
                    ),
                ),
                ("notes", models.TextField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "linked_document",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="reconciliation_decisions",
                        to="integration.integrationdocument",
                    ),
                ),
                (
                    "linked_match",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="traceability_decisions",
                        to="purchasing.invoicegoodsreceiptmatch",
                    ),
                ),
                (
                    "site",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="traceability_reconciliation_decisions",
                        to="core.site",
                    ),
                ),
            ],
            options={
                "db_table": "integration_traceability_reconciliation_decision",
                "ordering": ["-updated_at", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="traceabilityreconciliationdecision",
            constraint=models.UniqueConstraint(
                fields=("site", "event_id"),
                name="uq_integration_traceability_reconciliation_decision_site_event",
            ),
        ),
    ]
