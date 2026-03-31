import uuid

from django.db import models

from apps.catalog.models import SupplierProduct
from apps.core.models import Site
from apps.purchasing.models import InvoiceGoodsReceiptMatch


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
    LABEL_CAPTURE = "label_capture", "label_capture"


class DocumentSource(models.TextChoices):
    UPLOAD = "upload", "upload"
    EMAIL = "email", "email"
    API = "api", "api"
    DRIVE = "drive", "drive"


class DocumentStatus(models.TextChoices):
    UPLOADED = "uploaded", "uploaded"
    PROCESSING = "processing", "processing"
    EXTRACTED = "extracted", "extracted"
    FAILED = "failed", "failed"
    ARCHIVED_DUPLICATE = "archived_duplicate", "archived_duplicate"


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
    status = models.CharField(max_length=24, choices=DocumentStatus.choices, default=DocumentStatus.UPLOADED)
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


class ReconciliationDecisionStatus(models.TextChoices):
    REVIEW_REQUIRED = "review_required", "review_required"
    IGNORED = "ignored", "ignored"
    MATCHED = "matched", "matched"


class TraceabilityReconciliationDecision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="traceability_reconciliation_decisions")
    event_id = models.CharField(max_length=128)
    decision_status = models.CharField(max_length=24, choices=ReconciliationDecisionStatus.choices)
    notes = models.TextField(blank=True, null=True)
    linked_document = models.ForeignKey(
        IntegrationDocument,
        on_delete=models.SET_NULL,
        related_name="reconciliation_decisions",
        blank=True,
        null=True,
    )
    linked_match = models.ForeignKey(
        InvoiceGoodsReceiptMatch,
        on_delete=models.SET_NULL,
        related_name="traceability_decisions",
        blank=True,
        null=True,
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integration_traceability_reconciliation_decision"
        ordering = ["-updated_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "event_id"],
                name="uq_integration_traceability_reconciliation_decision_site_event",
            )
        ]

    def __str__(self) -> str:
        return f"{self.site_id}:{self.event_id}:{self.decision_status}"


class CleaningCadence(models.TextChoices):
    AFTER_USE = "after_use", "after_use"
    END_OF_SERVICE = "end_of_service", "end_of_service"
    DAILY = "daily", "daily"
    TWICE_WEEKLY = "twice_weekly", "twice_weekly"
    WEEKLY = "weekly", "weekly"
    FORTNIGHTLY = "fortnightly", "fortnightly"
    MONTHLY = "monthly", "monthly"
    QUARTERLY = "quarterly", "quarterly"
    SEMIANNUAL = "semiannual", "semiannual"
    ANNUAL = "annual", "annual"


class CleaningCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cleaning_category"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CleaningProcedure(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        CleaningCategory,
        on_delete=models.SET_NULL,
        related_name="procedures",
        blank=True,
        null=True,
    )
    name = models.CharField(max_length=200)
    steps = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cleaning_procedure"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CleaningElement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="cleaning_elements")
    name = models.CharField(max_length=200)
    category = models.ForeignKey(
        CleaningCategory,
        on_delete=models.SET_NULL,
        related_name="elements",
        blank=True,
        null=True,
    )
    procedure = models.ForeignKey(
        CleaningProcedure,
        on_delete=models.SET_NULL,
        related_name="elements",
        blank=True,
        null=True,
    )
    is_global = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cleaning_element"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.site_id})"


class CleaningElementArea(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    element = models.ForeignKey(CleaningElement, on_delete=models.CASCADE, related_name="areas")
    sector_id = models.UUIDField()
    sector_name = models.CharField(max_length=160)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cleaning_element_area"
        ordering = ["sort_order", "sector_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["element", "sector_id"],
                name="uq_cleaning_element_area_element_sector",
            )
        ]

    def __str__(self) -> str:
        return f"{self.element_id}:{self.sector_name}"


class CleaningPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="cleaning_plans")
    element = models.ForeignKey(CleaningElement, on_delete=models.CASCADE, related_name="plans")
    sector_id = models.UUIDField(blank=True, null=True)
    sector_name = models.CharField(max_length=160, blank=True, null=True)
    cadence = models.CharField(max_length=32, choices=CleaningCadence.choices, default=CleaningCadence.DAILY)
    due_time = models.TimeField()
    start_date = models.DateField()
    timezone = models.CharField(max_length=64, default="Europe/Paris")
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cleaning_plan"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["site", "cadence"], name="idx_cleaning_plan_site_cadence"),
        ]

    def __str__(self) -> str:
        return f"{self.site_id}:{self.element_id}:{self.cadence}"
