from django.contrib import admin

from apps.pos.models import PosSource, SalesEventDaily


@admin.register(PosSource)
class PosSourceAdmin(admin.ModelAdmin):
    list_display = ("name", "vendor", "site", "created_at")
    search_fields = ("name", "vendor", "site__name")


@admin.register(SalesEventDaily)
class SalesEventDailyAdmin(admin.ModelAdmin):
    list_display = ("sales_date", "site", "pos_source", "created_at")
    search_fields = ("site__name", "pos_source__name")
    list_filter = ("sales_date",)
