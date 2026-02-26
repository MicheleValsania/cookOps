from django.contrib import admin

from apps.catalog.models import Supplier, SupplierProduct


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "vat_number", "created_at")
    search_fields = ("name", "vat_number")


@admin.register(SupplierProduct)
class SupplierProductAdmin(admin.ModelAdmin):
    list_display = ("name", "supplier", "uom", "active", "traceability_flag", "created_at")
    list_filter = ("uom", "active", "traceability_flag")
    search_fields = ("name", "supplier__name", "supplier_sku", "ean")
