from django.contrib import admin

from apps.inventory.models import InventoryCountLine, InventoryMovement, InventorySector, InventorySession, Lot, StockPoint


@admin.register(Lot)
class LotAdmin(admin.ModelAdmin):
    list_display = ("internal_lot_code", "site", "source_type", "status", "qty_value", "qty_unit", "dlc_date")
    search_fields = ("internal_lot_code", "supplier_lot_code")
    list_filter = ("source_type", "status", "qty_unit")


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ("movement_type", "qty_value", "qty_unit", "happened_at", "site", "supplier_product", "raw_product_name", "lot")
    search_fields = ("ref_type", "ref_id")
    list_filter = ("movement_type", "qty_unit")


@admin.register(InventorySector)
class InventorySectorAdmin(admin.ModelAdmin):
    list_display = ("name", "site", "sort_order", "is_active")
    search_fields = ("name", "code", "site__name")
    list_filter = ("is_active",)


@admin.register(StockPoint)
class StockPointAdmin(admin.ModelAdmin):
    list_display = ("name", "site", "sector", "sort_order", "is_active")
    search_fields = ("name", "code", "site__name", "sector__name")
    list_filter = ("is_active", "sector")


class InventoryCountLineInline(admin.TabularInline):
    model = InventoryCountLine
    extra = 0


@admin.register(InventorySession)
class InventorySessionAdmin(admin.ModelAdmin):
    list_display = ("id", "site", "sector", "status", "count_scope", "source_app", "started_at", "closed_at")
    search_fields = ("id", "label", "site__name", "sector__name")
    list_filter = ("status", "count_scope", "source_app")
    inlines = [InventoryCountLineInline]
