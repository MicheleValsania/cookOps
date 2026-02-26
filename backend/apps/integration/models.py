import uuid

from django.db import models

from apps.catalog.models import SupplierProduct


class QtyUnit(models.TextChoices):
    KG = "kg", "kg"
    G = "g", "g"
    L = "l", "l"
    ML = "ml", "ml"
    CL = "cl", "cl"
    PC = "pc", "pc"


class IntegrationImportBatch(models.Model):
    class Status(models.TextChoices):
        STARTED = "started", "started"
        COMPLETED = "completed", "completed"
        FAILED = "failed", "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.CharField(max_length=64)
    import_type = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.STARTED)
    idempotency_key = models.CharField(max_length=255, blank=True, null=True)
    payload = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integration_import_batch"
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"{self.source}:{self.import_type}:{self.status}"


class RecipeSnapshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fiche_product_id = models.UUIDField()
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=128, blank=True, null=True)
    portions = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    snapshot_hash = models.CharField(max_length=128)
    source_updated_at = models.DateTimeField(blank=True, null=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "integration_recipe_snapshot"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["fiche_product_id", "snapshot_hash"],
                name="uq_integration_recipe_snapshot_fiche_hash",
            )
        ]

    def __str__(self) -> str:
        return f"{self.title} [{self.snapshot_hash}]"


class RecipeIngredientLink(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fiche_product_id = models.UUIDField()
    supplier_product = models.ForeignKey(
        SupplierProduct,
        on_delete=models.SET_NULL,
        related_name="ingredient_links",
        blank=True,
        null=True,
    )
    qty_value = models.DecimalField(max_digits=12, decimal_places=3, blank=True, null=True)
    qty_unit = models.CharField(max_length=8, choices=QtyUnit.choices)
    note = models.TextField(blank=True, null=True)
    snapshot_hash = models.CharField(max_length=128)

    class Meta:
        db_table = "integration_recipe_ingredient_link"
        ordering = ["fiche_product_id", "id"]

    def __str__(self) -> str:
        return f"{self.fiche_product_id} - {self.qty_value} {self.qty_unit}"
