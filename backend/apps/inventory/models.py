import uuid

from django.db import models

from apps.catalog.models import SupplierProduct
from apps.core.models import Site


class QtyUnit(models.TextChoices):
    KG = "kg", "kg"
    G = "g", "g"
    L = "l", "l"
    ML = "ml", "ml"
    CL = "cl", "cl"
    PC = "pc", "pc"


class SourceType(models.TextChoices):
    SUPPLIER_PRODUCT = "supplier_product", "supplier_product"
    RECIPE = "recipe", "recipe"


class LotStatus(models.TextChoices):
    ACTIVE = "active", "active"
    CONSUMED = "consumed", "consumed"
    DISCARDED = "discarded", "discarded"
    BLOCKED = "blocked", "blocked"


class MovementType(models.TextChoices):
    IN = "IN", "IN"
    OUT = "OUT", "OUT"
    ADJUST = "ADJUST", "ADJUST"
    TRANSFER = "TRANSFER", "TRANSFER"


class InventorySessionStatus(models.TextChoices):
    DRAFT = "draft", "draft"
    IN_PROGRESS = "in_progress", "in_progress"
    CLOSED = "closed", "closed"
    CANCELLED = "cancelled", "cancelled"


class InventoryCountScope(models.TextChoices):
    SITE = "site", "site"
    SECTOR = "sector", "sector"
    POINT = "point", "point"


class InventorySector(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="inventory_sectors")
    name = models.CharField(max_length=160)
    code = models.CharField(max_length=64, blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_sector"
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "name"],
                name="uq_inventory_sector_site_name",
            )
        ]

    def __str__(self) -> str:
        return f"{self.site} - {self.name}"


class StockPoint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="stock_points")
    sector = models.ForeignKey(InventorySector, on_delete=models.CASCADE, related_name="stock_points")
    name = models.CharField(max_length=160)
    code = models.CharField(max_length=64, blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_stock_point"
        ordering = ["sector__sort_order", "sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "sector", "name"],
                name="uq_inventory_stock_point_site_sector_name",
            )
        ]

    def __str__(self) -> str:
        return f"{self.site} - {self.name}"


class Lot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="lots")
    source_type = models.CharField(max_length=32, choices=SourceType.choices)
    supplier_product = models.ForeignKey(
        SupplierProduct,
        on_delete=models.SET_NULL,
        related_name="lots",
        blank=True,
        null=True,
    )
    fiche_product_id = models.UUIDField(blank=True, null=True)
    recipe_snapshot_hash = models.CharField(max_length=128, blank=True, null=True)
    supplier_lot_code = models.CharField(max_length=128, blank=True, null=True)
    internal_lot_code = models.CharField(max_length=128)
    production_date = models.DateField(blank=True, null=True)
    dlc_date = models.DateField(blank=True, null=True)
    qty_value = models.DecimalField(max_digits=12, decimal_places=3)
    qty_unit = models.CharField(max_length=8, choices=QtyUnit.choices)
    status = models.CharField(max_length=16, choices=LotStatus.choices, default=LotStatus.ACTIVE)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "inventory_lot"
        ordering = ["internal_lot_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "internal_lot_code"],
                name="uq_inventory_lot_site_internal_lot_code",
            )
        ]

    def __str__(self) -> str:
        return f"{self.internal_lot_code}"


class InventoryMovement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(
        Site,
        on_delete=models.PROTECT,
        related_name="inventory_movements",
        blank=True,
        null=True,
    )
    lot = models.ForeignKey(
        Lot,
        on_delete=models.SET_NULL,
        related_name="movements",
        blank=True,
        null=True,
    )
    supplier_product = models.ForeignKey(
        SupplierProduct,
        on_delete=models.SET_NULL,
        related_name="inventory_movements",
        blank=True,
        null=True,
    )
    supplier_code = models.CharField(max_length=128, blank=True, null=True)
    raw_product_name = models.CharField(max_length=255, blank=True, null=True)
    movement_type = models.CharField(max_length=16, choices=MovementType.choices)
    qty_value = models.DecimalField(max_digits=12, decimal_places=3)
    qty_unit = models.CharField(max_length=8, choices=QtyUnit.choices)
    happened_at = models.DateTimeField()
    ref_type = models.CharField(max_length=64, blank=True, null=True)
    ref_id = models.CharField(max_length=128, blank=True, null=True)

    class Meta:
        db_table = "inventory_movement"
        ordering = ["-happened_at", "id"]

    def __str__(self) -> str:
        return f"{self.movement_type} {self.qty_value} {self.qty_unit}"


class InventorySession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="inventory_sessions")
    sector = models.ForeignKey(
        InventorySector,
        on_delete=models.SET_NULL,
        related_name="inventory_sessions",
        blank=True,
        null=True,
    )
    label = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=24, choices=InventorySessionStatus.choices, default=InventorySessionStatus.DRAFT)
    source_app = models.CharField(max_length=64, default="traccia_mobile")
    count_scope = models.CharField(max_length=16, choices=InventoryCountScope.choices, default=InventoryCountScope.SITE)
    notes = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_session"
        ordering = ["-started_at", "-created_at"]

    def __str__(self) -> str:
        return self.label or f"Inventory session {self.id}"


class InventoryCountLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(InventorySession, on_delete=models.CASCADE, related_name="lines")
    stock_point = models.ForeignKey(
        StockPoint,
        on_delete=models.SET_NULL,
        related_name="inventory_count_lines",
        blank=True,
        null=True,
    )
    supplier_product = models.ForeignKey(SupplierProduct, on_delete=models.PROTECT, related_name="inventory_count_lines")
    qty_value = models.DecimalField(max_digits=12, decimal_places=3)
    qty_unit = models.CharField(max_length=8, choices=QtyUnit.choices)
    expected_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    delta_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    line_order = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    counted_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_count_line"
        ordering = ["line_order", "created_at"]

    def __str__(self) -> str:
        return f"{self.session_id} - {self.supplier_product}"
