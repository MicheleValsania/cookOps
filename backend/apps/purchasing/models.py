import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Site


class QtyUnit(models.TextChoices):
    KG = "kg", "kg"
    G = "g", "g"
    L = "l", "l"
    ML = "ml", "ml"
    CL = "cl", "cl"
    PC = "pc", "pc"


class GoodsReceipt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="goods_receipts")
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="goods_receipts")
    delivery_note_number = models.CharField(max_length=128)
    received_at = models.DateTimeField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "purchasing_goods_receipt"
        ordering = ["-received_at", "delivery_note_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "supplier", "delivery_note_number"],
                name="uq_purchasing_gr_site_supplier_delivery_note",
            )
        ]

    def __str__(self) -> str:
        return f"{self.delivery_note_number}"


class GoodsReceiptLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name="lines")
    supplier_product = models.ForeignKey(
        SupplierProduct,
        on_delete=models.SET_NULL,
        related_name="goods_receipt_lines",
        blank=True,
        null=True,
    )
    raw_product_name = models.CharField(max_length=255, blank=True, null=True)
    supplier_lot_code = models.CharField(max_length=128, blank=True, null=True)
    dlc_date = models.DateField(blank=True, null=True)
    qty_value = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    qty_unit = models.CharField(max_length=8, choices=QtyUnit.choices)
    unit_price = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "purchasing_goods_receipt_line"
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.receipt.delivery_note_number} - {self.qty_value} {self.qty_unit}"


class Invoice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="invoices")
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="invoices")
    invoice_number = models.CharField(max_length=128)
    invoice_date = models.DateField()
    due_date = models.DateField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "purchasing_invoice"
        ordering = ["-invoice_date", "invoice_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "supplier", "invoice_number"],
                name="uq_purchasing_invoice_site_supplier_number",
            )
        ]

    def __str__(self) -> str:
        return self.invoice_number


class InvoiceLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    goods_receipt_line = models.ForeignKey(
        GoodsReceiptLine,
        on_delete=models.SET_NULL,
        related_name="invoice_lines",
        blank=True,
        null=True,
    )
    supplier_product = models.ForeignKey(
        SupplierProduct,
        on_delete=models.SET_NULL,
        related_name="invoice_lines",
        blank=True,
        null=True,
    )
    raw_product_name = models.CharField(max_length=255, blank=True, null=True)
    qty_value = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    qty_unit = models.CharField(max_length=8, choices=QtyUnit.choices)
    unit_price = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    line_total = models.DecimalField(max_digits=14, decimal_places=4, blank=True, null=True)
    vat_rate = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "purchasing_invoice_line"
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.invoice.invoice_number} - {self.qty_value} {self.qty_unit}"
