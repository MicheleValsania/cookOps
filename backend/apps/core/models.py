import uuid

from django.conf import settings
from django.db import models


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=120, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "core_organization"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class OrganizationMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "owner"
        ADMIN = "admin", "admin"
        MANAGER = "manager", "manager"
        OPERATOR = "operator", "operator"
        VIEWER = "viewer", "viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cookops_memberships")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.OPERATOR)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "core_organization_membership"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"],
                name="uq_core_organization_membership_user",
            )
        ]

    def __str__(self) -> str:
        return f"{self.organization} - {self.user} ({self.role})"


class Site(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="sites",
        default=settings.DEFAULT_ORGANIZATION_ID,
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "core_site"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="uq_core_site_organization_code")
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class ServiceMenuEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="service_menu_entries")
    service_date = models.DateField()
    space_key = models.CharField(max_length=64)
    section = models.CharField(max_length=128, blank=True, null=True)
    title = models.CharField(max_length=255)
    fiche_product_id = models.UUIDField(blank=True, null=True)
    expected_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "core_service_menu_entry"
        ordering = ["service_date", "space_key", "sort_order", "title"]
        indexes = [
            models.Index(fields=["site", "service_date"], name="idx_core_srv_site_date"),
            models.Index(fields=["fiche_product_id"], name="idx_core_srv_fiche"),
        ]

    def __str__(self) -> str:
        return f"{self.service_date} {self.space_key} - {self.title}"
