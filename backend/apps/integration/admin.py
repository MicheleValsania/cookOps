from django.contrib import admin

from apps.integration.models import (
    DocumentExtraction,
    IntegrationDocument,
    IntegrationImportBatch,
    RecipeIngredientLink,
    RecipeSnapshot,
)


@admin.register(IntegrationImportBatch)
class IntegrationImportBatchAdmin(admin.ModelAdmin):
    list_display = ("source", "import_type", "status", "started_at", "finished_at")
    search_fields = ("source", "import_type", "idempotency_key")
    list_filter = ("status", "source", "import_type")


@admin.register(RecipeSnapshot)
class RecipeSnapshotAdmin(admin.ModelAdmin):
    list_display = ("title", "fiche_product_id", "snapshot_hash", "source_updated_at", "created_at")
    search_fields = ("title", "snapshot_hash", "fiche_product_id")
    list_filter = ("category",)


@admin.register(RecipeIngredientLink)
class RecipeIngredientLinkAdmin(admin.ModelAdmin):
    list_display = ("fiche_product_id", "supplier_product", "qty_value", "qty_unit", "snapshot_hash")
    search_fields = ("fiche_product_id", "snapshot_hash", "note")
    list_filter = ("qty_unit",)


@admin.register(IntegrationDocument)
class IntegrationDocumentAdmin(admin.ModelAdmin):
    list_display = ("filename", "document_type", "source", "status", "site", "created_at")
    search_fields = ("filename", "storage_path")
    list_filter = ("document_type", "source", "status")


@admin.register(DocumentExtraction)
class DocumentExtractionAdmin(admin.ModelAdmin):
    list_display = ("document", "extractor_name", "extractor_version", "status", "confidence", "created_at")
    search_fields = ("document__filename", "extractor_name", "extractor_version")
    list_filter = ("status", "extractor_name")
