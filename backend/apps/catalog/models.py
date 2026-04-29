import re
import unicodedata
import uuid

from django.db import models


def normalize_supplier_name(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    without_accents = "".join(
        char
        for char in unicodedata.normalize("NFD", raw)
        if unicodedata.category(char) != "Mn"
    )
    return re.sub(r"[^A-Za-z0-9]+", "", without_accents).upper()


class Supplier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    vat_number = models.CharField(max_length=64, blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_supplier"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    @classmethod
    def find_by_normalized_name(cls, value: str | None):
        normalized = normalize_supplier_name(value)
        if not normalized:
            return None
        for candidate in cls.objects.all():
            if normalize_supplier_name(candidate.name) == normalized:
                return candidate
        return None


class SupplierProduct(models.Model):
    class Uom(models.TextChoices):
        KG = "kg", "kg"
        G = "g", "g"
        L = "l", "l"
        ML = "ml", "ml"
        CL = "cl", "cl"
        PC = "pc", "pc"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name="products",
    )
    name = models.CharField(max_length=255)
    supplier_sku = models.CharField(max_length=128, blank=True, null=True)
    ean = models.CharField(max_length=64, blank=True, null=True)
    uom = models.CharField(max_length=8, choices=Uom.choices)
    pack_qty = models.DecimalField(max_digits=12, decimal_places=3, blank=True, null=True)
    active = models.BooleanField(default=True)
    traceability_flag = models.BooleanField(default=False)
    category = models.CharField(max_length=128, blank=True, null=True)
    allergens = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_supplier_product"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["supplier", "name"],
                name="uq_catalog_supplier_product_supplier_name",
            )
        ]

    def __str__(self) -> str:
        return f"{self.supplier.name} - {self.name}"
