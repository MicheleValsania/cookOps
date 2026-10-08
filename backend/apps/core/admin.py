from django.contrib import admin

from apps.core.models import Organization, OrganizationMembership, ServiceMenuEntry, Site


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "role", "is_active", "created_at")
    list_filter = ("organization", "role", "is_active")
    search_fields = ("organization__name", "user__username", "user__email")


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "organization", "is_active", "created_at")
    list_filter = ("organization", "is_active")
    search_fields = ("name", "code")


@admin.register(ServiceMenuEntry)
class ServiceMenuEntryAdmin(admin.ModelAdmin):
    list_display = ("service_date", "site", "space_key", "section", "title", "expected_qty", "is_active")
    list_filter = ("service_date", "space_key", "is_active")
    search_fields = ("title", "section", "space_key")
