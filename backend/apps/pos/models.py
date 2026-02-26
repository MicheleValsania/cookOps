import uuid

from django.db import models

from apps.core.models import Site


class PosSource(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="pos_sources")
    name = models.CharField(max_length=255)
    vendor = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_source"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.vendor})"


class SalesEventDaily(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="sales_events_daily")
    pos_source = models.ForeignKey(PosSource, on_delete=models.PROTECT, related_name="sales_events_daily")
    sales_date = models.DateField()
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pos_sales_event_daily"
        ordering = ["-sales_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "pos_source", "sales_date"],
                name="uq_pos_sales_event_daily_site_source_date",
            )
        ]

    def __str__(self) -> str:
        return f"{self.sales_date} - {self.pos_source.name}"
