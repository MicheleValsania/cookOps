import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import connections, transaction

from apps.catalog.models import Supplier, SupplierProduct


SAFE_DB_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_\\.]*$")


def _safe_identifier(value: str, fallback: str) -> str:
    candidate = value.strip()
    if not SAFE_DB_IDENTIFIER.match(candidate):
        return fallback
    return candidate


def _to_decimal(value: Any):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _normalize_uom(unit: str | None) -> str:
    candidate = (unit or "").strip().lower()
    aliases = {
        "kg": "kg",
        "g": "g",
        "l": "l",
        "ml": "ml",
        "cl": "cl",
        "pc": "pc",
        "pz": "pc",
        "piece": "pc",
        "pieces": "pc",
        "unit": "pc",
        "unite": "pc",
        "unites": "pc",
    }
    return aliases.get(candidate, "pc")


def import_supplier_catalog_from_fiches() -> dict[str, Any]:
    if "fiches" not in connections.databases:
        return {"ok": False, "detail": "FICHES DB non configurato."}

    supplier_created = 0
    supplier_updated = 0
    product_created = 0
    product_updated = 0
    invalid_supplier_ids = 0
    invalid_product_ids = 0

    suppliers_sql = "SELECT id::text, name FROM suppliers ORDER BY name ASC"
    products_sql = """
        SELECT id::text, supplier_id::text, name, source_code, source_unit, unit, source_price, unit_price
        FROM supplier_products
        ORDER BY name ASC
    """

    try:
        with connections["fiches"].cursor() as cursor:
            cursor.execute(suppliers_sql)
            supplier_rows = cursor.fetchall()
            cursor.execute(products_sql)
            product_rows = cursor.fetchall()
    except Exception as exc:
        return {"ok": False, "detail": f"Impossibile leggere DB fiches: {exc}"}

    supplier_by_source_id: dict[str, Supplier] = {}
    with transaction.atomic():
        for source_id, name in supplier_rows:
            supplier_name = str(name or "").strip()
            if not supplier_name:
                continue
            supplier_uuid = None
            try:
                supplier_uuid = uuid.UUID(str(source_id))
            except (TypeError, ValueError):
                invalid_supplier_ids += 1

            supplier = Supplier.objects.filter(name=supplier_name).first()
            if supplier is None:
                create_kwargs = {"name": supplier_name, "metadata": {"source": "fiches", "fiches_supplier_id": str(source_id)}}
                if supplier_uuid:
                    create_kwargs["id"] = supplier_uuid
                supplier = Supplier.objects.create(**create_kwargs)
                supplier_created += 1
            else:
                metadata = supplier.metadata or {}
                metadata["source"] = "fiches"
                metadata["fiches_supplier_id"] = str(source_id)
                supplier.metadata = metadata
                supplier.save(update_fields=["metadata", "updated_at"])
                supplier_updated += 1

            supplier_by_source_id[str(source_id)] = supplier

        for source_product_id, source_supplier_id, name, source_code, source_unit, unit, source_price, unit_price in product_rows:
            product_name = str(name or "").strip()
            if not product_name:
                continue
            supplier = supplier_by_source_id.get(str(source_supplier_id))
            if not supplier:
                continue
            product_uuid = None
            try:
                product_uuid = uuid.UUID(str(source_product_id))
            except (TypeError, ValueError):
                invalid_product_ids += 1

            normalized_uom = _normalize_uom(unit or source_unit)
            pack_qty = _to_decimal(source_price)

            existing = SupplierProduct.objects.filter(supplier=supplier, name=product_name).first()
            metadata = (existing.metadata if existing else {}) or {}
            metadata["source"] = "fiches"
            metadata["fiches_product_id"] = str(source_product_id)
            metadata["source_unit_price"] = str(unit_price) if unit_price is not None else None
            metadata["source_unit"] = source_unit

            if existing is None:
                create_kwargs = {
                    "supplier": supplier,
                    "name": product_name,
                    "supplier_sku": str(source_code).strip() if source_code else None,
                    "uom": normalized_uom,
                    "pack_qty": pack_qty,
                    "active": True,
                    "traceability_flag": False,
                    "allergens": [],
                    "metadata": metadata,
                }
                if product_uuid:
                    create_kwargs["id"] = product_uuid
                SupplierProduct.objects.create(**create_kwargs)
                product_created += 1
            else:
                existing.supplier_sku = str(source_code).strip() if source_code else existing.supplier_sku
                existing.uom = normalized_uom
                existing.pack_qty = pack_qty if pack_qty is not None else existing.pack_qty
                existing.active = True
                existing.metadata = metadata
                existing.save(update_fields=["supplier_sku", "uom", "pack_qty", "active", "metadata", "updated_at"])
                product_updated += 1

    return {
        "ok": True,
        "suppliers_read": len(supplier_rows),
        "products_read": len(product_rows),
        "supplier_created": supplier_created,
        "supplier_updated": supplier_updated,
        "product_created": product_created,
        "product_updated": product_updated,
        "invalid_supplier_ids": invalid_supplier_ids,
        "invalid_product_ids": invalid_product_ids,
    }
