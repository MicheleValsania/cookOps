from django.contrib import admin

from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine


class GoodsReceiptLineInline(admin.TabularInline):
    model = GoodsReceiptLine
    extra = 0


@admin.register(GoodsReceipt)
class GoodsReceiptAdmin(admin.ModelAdmin):
    list_display = ("delivery_note_number", "site", "supplier", "received_at")
    search_fields = ("delivery_note_number", "supplier__name", "site__name")
    inlines = (GoodsReceiptLineInline,)


@admin.register(GoodsReceiptLine)
class GoodsReceiptLineAdmin(admin.ModelAdmin):
    list_display = ("receipt", "supplier_product", "qty_value", "qty_unit", "unit_price")
    search_fields = ("receipt__delivery_note_number", "raw_product_name", "supplier_lot_code")
    list_filter = ("qty_unit",)
