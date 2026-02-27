from django.contrib import admin

from apps.core.models import ServiceMenuEntry, Site


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "code")


@admin.register(ServiceMenuEntry)
class ServiceMenuEntryAdmin(admin.ModelAdmin):
    list_display = ("service_date", "site", "space_key", "section", "title", "expected_qty", "is_active")
    list_filter = ("service_date", "space_key", "is_active")
    search_fields = ("title", "section", "space_key")
