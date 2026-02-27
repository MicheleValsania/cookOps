import uuid

from django.db import models

from apps.catalog.models import SupplierProduct
from apps.core.models import Site


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


class DocumentType(models.TextChoices):
    GOODS_RECEIPT = "goods_receipt", "goods_receipt"
    INVOICE = "invoice", "invoice"


class DocumentSource(models.TextChoices):
    UPLOAD = "upload", "upload"
    EMAIL = "email", "email"
    API = "api", "api"


class DocumentStatus(models.TextChoices):
    UPLOADED = "uploaded", "uploaded"
    PROCESSING = "processing", "processing"
    EXTRACTED = "extracted", "extracted"
    FAILED = "failed", "failed"


class IntegrationDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="integration_documents")
    document_type = models.CharField(max_length=32, choices=DocumentType.choices)
    source = models.CharField(max_length=16, choices=DocumentSource.choices, default=DocumentSource.UPLOAD)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=128, blank=True, null=True)
    file_size = models.BigIntegerField(blank=True, null=True)
    file = models.FileField(upload_to="integration/documents/%Y/%m/%d", blank=True, null=True)
    storage_path = models.CharField(max_length=500, blank=True, null=True)
    status = models.CharField(max_length=16, choices=DocumentStatus.choices, default=DocumentStatus.UPLOADED)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integration_document"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.document_type}:{self.filename}"


class ExtractionStatus(models.TextChoices):
    PENDING = "pending", "pending"
    SUCCEEDED = "succeeded", "succeeded"
    FAILED = "failed", "failed"


class DocumentExtraction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(IntegrationDocument, on_delete=models.CASCADE, related_name="extractions")
    extractor_name = models.CharField(max_length=64)
    extractor_version = models.CharField(max_length=32, blank=True, null=True)
    status = models.CharField(max_length=16, choices=ExtractionStatus.choices, default=ExtractionStatus.PENDING)
    raw_payload = models.JSONField(default=dict, blank=True)
    normalized_payload = models.JSONField(default=dict, blank=True)
    confidence = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integration_document_extraction"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.document_id}:{self.extractor_name}:{self.status}"
