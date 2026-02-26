from django.contrib import admin

from apps.inventory.models import InventoryMovement, Lot


@admin.register(Lot)
class LotAdmin(admin.ModelAdmin):
    list_display = ("internal_lot_code", "site", "source_type", "status", "qty_value", "qty_unit", "dlc_date")
    search_fields = ("internal_lot_code", "supplier_lot_code")
    list_filter = ("source_type", "status", "qty_unit")


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ("movement_type", "qty_value", "qty_unit", "happened_at", "lot", "supplier_product")
    search_fields = ("ref_type", "ref_id")
    list_filter = ("movement_type", "qty_unit")
