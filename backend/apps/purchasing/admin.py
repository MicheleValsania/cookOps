from django.contrib import admin

from apps.purchasing.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    Invoice,
    InvoiceGoodsReceiptMatch,
    InvoiceLine,
)


class GoodsReceiptLineInline(admin.TabularInline):
    model = GoodsReceiptLine
    extra = 0


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
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


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "site", "supplier", "invoice_date", "due_date")
    search_fields = ("invoice_number", "supplier__name", "site__name")
    inlines = (InvoiceLineInline,)


@admin.register(InvoiceLine)
class InvoiceLineAdmin(admin.ModelAdmin):
    list_display = (
        "invoice",
        "supplier_product",
        "goods_receipt_line",
        "qty_value",
        "qty_unit",
        "unit_price",
        "line_total",
    )
    search_fields = ("invoice__invoice_number", "raw_product_name", "note")
    list_filter = ("qty_unit",)


@admin.register(InvoiceGoodsReceiptMatch)
class InvoiceGoodsReceiptMatchAdmin(admin.ModelAdmin):
    list_display = ("invoice_line", "goods_receipt_line", "status", "matched_qty_value", "matched_amount")
    list_filter = ("status",)
    search_fields = (
        "invoice_line__invoice__invoice_number",
        "goods_receipt_line__receipt__delivery_note_number",
        "note",
    )
