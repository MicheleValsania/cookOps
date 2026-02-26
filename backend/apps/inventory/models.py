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
