import hashlib
import json
import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from django.conf import settings
from django.db import connections
from django.utils.dateparse import parse_datetime

from apps.integration.models import RecipeSnapshot


SAFE_DB_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_\\.]*$")
FICHES_TEXTUAL_ID_NAMESPACE = uuid.UUID("9a7b0c87-3d8f-4b29-a06d-3f5b0e33fd7f")


def _safe_identifier(value: str, fallback: str) -> str:
    candidate = value.strip()
    if not SAFE_DB_IDENTIFIER.match(candidate):
        return fallback
    return candidate


def _safe_optional_identifier(value: str) -> str:
    candidate = value.strip()
    if not candidate:
        return ""
    if not SAFE_DB_IDENTIFIER.match(candidate):
        return ""
    return candidate


def _to_decimal(value: Any):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _snapshot_hash(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _normalize_fiche_id(raw_value: Any) -> tuple[uuid.UUID | None, bool]:
    """
    Return a stable UUID for fiche IDs.
    - Native UUIDs are preserved.
    - Textual IDs are mapped deterministically via uuid5 namespace.
    """
    normalized = str(raw_value or "").strip()
    if not normalized:
        return None, False
    try:
        return uuid.UUID(normalized), False
    except (ValueError, TypeError, AttributeError):
        return uuid.uuid5(FICHES_TEXTUAL_ID_NAMESPACE, normalized), True


def _normalize_fiche_payload_from_v11(fiche: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": fiche.get("title") or "",
        "category": fiche.get("category"),
        "portions": fiche.get("portions"),
        "language": fiche.get("language"),
        "allergens": fiche.get("allergens") or [],
        "ingredients": fiche.get("ingredients") or [],
        "procedure_steps": fiche.get("procedure_steps") or [],
        "haccp_profiles": fiche.get("haccp_profiles") or [],
        "storage_profiles": fiche.get("storage_profiles") or [],
        "label_hints": fiche.get("label_hints"),
        "warnings": fiche.get("warnings") or [],
    }


def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _enrich_payload_supplier_codes(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return payload
    ingredients = payload.get("ingredients")
    if not isinstance(ingredients, list):
        return payload
    if "fiches" not in connections.databases:
        return payload

    product_ids: set[str] = set()
    supplier_ids: set[str] = set()
    ingredient_names: set[str] = set()
    for item in ingredients:
        if not isinstance(item, dict):
            continue
        supplier_code = str(item.get("supplierCode") or item.get("supplier_code") or "").strip()
        if supplier_code:
            continue
        product_id = str(item.get("supplierProductId") or item.get("supplier_product_id") or "").strip()
        if product_id:
            product_ids.add(product_id)
        supplier_id = str(item.get("supplierId") or item.get("supplier_id") or "").strip()
        if supplier_id:
            supplier_ids.add(supplier_id)
        name = str(item.get("name") or item.get("ingredient") or item.get("ingredient_name_raw") or "").strip()
        if name:
            ingredient_names.add(_normalize_text(name))

    id_lookup: dict[str, str] = {}
    name_lookup: dict[tuple[str, str], str] = {}
    try:
        with connections["fiches"].cursor() as cursor:
            if product_ids:
                cursor.execute(
                    "SELECT id, source_code FROM supplier_products WHERE id = ANY(%s) AND source_code IS NOT NULL",
                    [list(product_ids)],
                )
                for prod_id, source_code in cursor.fetchall():
                    if source_code:
                        id_lookup[str(prod_id)] = str(source_code).strip()

            if supplier_ids and ingredient_names:
                cursor.execute(
                    "SELECT supplier_id, name, source_code FROM supplier_products WHERE supplier_id = ANY(%s) AND source_code IS NOT NULL",
                    [list(supplier_ids)],
                )
                for supplier_id, name, source_code in cursor.fetchall():
                    if not source_code:
                        continue
                    name_key = _normalize_text(name)
                    if not name_key:
                        continue
                    name_lookup[(str(supplier_id), name_key)] = str(source_code).strip()
    except Exception:
        return payload

    if not id_lookup and not name_lookup:
        return payload

    for item in ingredients:
        if not isinstance(item, dict):
            continue
        current_code = str(item.get("supplierCode") or item.get("supplier_code") or "").strip()
        if current_code:
            continue
        product_id = str(item.get("supplierProductId") or item.get("supplier_product_id") or "").strip()
        if product_id and product_id in id_lookup:
            item["supplierCode"] = id_lookup[product_id]
            continue
        supplier_id = str(item.get("supplierId") or item.get("supplier_id") or "").strip()
        name = str(item.get("name") or item.get("ingredient") or item.get("ingredient_name_raw") or "").strip()
        if supplier_id and name:
            name_key = _normalize_text(name)
            candidate = name_lookup.get((supplier_id, name_key))
            if candidate:
                item["supplierCode"] = candidate

    return payload


def import_recipe_snapshots_from_v11_envelope(
    envelope: dict[str, Any], refresh_existing: bool = False
) -> dict[str, Any]:
    export_version = str(envelope.get("export_version") or "").strip()
    if export_version != "1.1":
        return {"ok": False, "detail": "Unsupported export_version. Expected '1.1'."}

    source_app = str(envelope.get("source_app") or "").strip()
    if source_app and source_app != "fiches-recettes":
        return {"ok": False, "detail": "Unsupported source_app. Expected 'fiches-recettes'."}

    fiches = envelope.get("fiches")
    if not isinstance(fiches, list):
        return {"ok": False, "detail": "Invalid envelope: 'fiches' must be an array."}

    created = 0
    refreshed = 0
    skipped_existing = 0
    invalid_ids = 0
    remapped_ids = 0
    invalid_payloads = 0
    examples: list[str] = []

    for fiche in fiches:
        if not isinstance(fiche, dict):
            invalid_payloads += 1
            continue

        fiche_id_raw = fiche.get("fiche_id")
        fiche_id, was_remapped = _normalize_fiche_id(fiche_id_raw)
        if not fiche_id:
            invalid_ids += 1
            continue
        if was_remapped:
            remapped_ids += 1

        payload = _normalize_fiche_payload_from_v11(fiche)
        payload = _enrich_payload_supplier_codes(payload)
        snapshot_hash = _snapshot_hash(payload)
        title = str(fiche.get("title") or "").strip()
        source_updated_at = parse_datetime(str(fiche.get("updated_at") or "")) if fiche.get("updated_at") else None
        portions = _to_decimal(fiche.get("portions"))

        snapshot, was_created = RecipeSnapshot.objects.get_or_create(
            fiche_product_id=fiche_id,
            snapshot_hash=snapshot_hash,
            defaults={
                "title": title,
                "category": fiche.get("category"),
                "portions": portions,
                "source_updated_at": source_updated_at,
                "payload": payload,
            },
        )
        if was_created:
            created += 1
            if len(examples) < 5:
                examples.append(title or str(fiche_id))
        else:
            if refresh_existing:
                update_fields: list[str] = []
                if snapshot.title != title:
                    snapshot.title = title
                    update_fields.append("title")
                if snapshot.category != fiche.get("category"):
                    snapshot.category = fiche.get("category")
                    update_fields.append("category")
                if snapshot.portions != portions:
                    snapshot.portions = portions
                    update_fields.append("portions")
                if snapshot.source_updated_at != source_updated_at:
                    snapshot.source_updated_at = source_updated_at
                    update_fields.append("source_updated_at")
                if snapshot.payload != payload:
                    snapshot.payload = payload
                    update_fields.append("payload")
                if update_fields:
                    snapshot.save(update_fields=update_fields)
                    refreshed += 1
                else:
                    skipped_existing += 1
            else:
                skipped_existing += 1

    return {
        "ok": True,
        "total_read": len(fiches),
        "created": created,
        "refreshed": refreshed,
        "skipped_existing": skipped_existing,
        "invalid_ids": invalid_ids,
        "remapped_ids": remapped_ids,
        "invalid_payloads": invalid_payloads,
        "examples": examples,
    }


def import_recipe_snapshots(query: str = "", limit: int = 500, refresh_existing: bool = False) -> dict[str, Any]:
    if "fiches" not in connections.databases:
        return {"ok": False, "detail": "FICHES DB non configurato."}

    table_name = _safe_identifier(getattr(settings, "FICHES_RECIPE_TABLE", "public.fiches"), "public.fiches")
    id_col = _safe_identifier(getattr(settings, "FICHES_RECIPE_ID_COLUMN", "id"), "id")
    title_col = _safe_identifier(getattr(settings, "FICHES_RECIPE_TITLE_COLUMN", "title"), "title")
    data_col = _safe_identifier(getattr(settings, "FICHES_RECIPE_DATA_COLUMN", "data"), "data")
    updated_col = _safe_identifier(getattr(settings, "FICHES_RECIPE_UPDATED_AT_COLUMN", "updated_at"), "updated_at")
    active_col = _safe_optional_identifier(getattr(settings, "FICHES_RECIPE_ACTIVE_COLUMN", ""))

    query = query.strip()
    limit = max(1, min(int(limit), 5000))
    sql = f"SELECT {id_col}::text, {title_col}, {data_col}, {updated_col} FROM {table_name} WHERE {data_col} IS NOT NULL"
    params: list[Any] = []

    if active_col:
        sql += f" AND ({active_col} = TRUE OR {active_col} IS NULL)"
    if query:
        sql += f" AND {title_col} ILIKE %s"
        params.append(f"%{query}%")
    sql += f" ORDER BY {updated_col} DESC NULLS LAST LIMIT %s"
    params.append(limit)

    try:
        with connections["fiches"].cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()
    except Exception as exc:
        return {"ok": False, "detail": f"Impossibile leggere DB fiches: {exc}"}

    created = 0
    refreshed = 0
    skipped_existing = 0
    invalid_ids = 0
    remapped_ids = 0
    invalid_payloads = 0
    examples: list[str] = []

    for fiche_id_raw, title, data, updated_at in rows:
        fiche_id, was_remapped = _normalize_fiche_id(fiche_id_raw)
        if not fiche_id:
            invalid_ids += 1
            continue
        if was_remapped:
            remapped_ids += 1

        payload = data
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                invalid_payloads += 1
                continue
        if not isinstance(payload, dict):
            invalid_payloads += 1
            continue

        payload = _enrich_payload_supplier_codes(payload)
        snapshot_hash = _snapshot_hash(payload)
        source_updated_at = None
        if updated_at:
            source_updated_at = updated_at if not isinstance(updated_at, str) else parse_datetime(updated_at)

        snapshot, was_created = RecipeSnapshot.objects.get_or_create(
            fiche_product_id=fiche_id,
            snapshot_hash=snapshot_hash,
            defaults={
                "title": str(title or payload.get("title") or "").strip(),
                "category": payload.get("category"),
                "portions": _to_decimal(payload.get("portions")),
                "source_updated_at": source_updated_at,
                "payload": payload,
            },
        )
        if was_created:
            created += 1
            if len(examples) < 5:
                examples.append(str(title or payload.get("title") or fiche_id))
        else:
            if refresh_existing:
                next_title = str(title or payload.get("title") or "").strip()
                next_category = payload.get("category")
                next_portions = _to_decimal(payload.get("portions"))
                update_fields: list[str] = []
                if snapshot.title != next_title:
                    snapshot.title = next_title
                    update_fields.append("title")
                if snapshot.category != next_category:
                    snapshot.category = next_category
                    update_fields.append("category")
                if snapshot.portions != next_portions:
                    snapshot.portions = next_portions
                    update_fields.append("portions")
                if snapshot.source_updated_at != source_updated_at:
                    snapshot.source_updated_at = source_updated_at
                    update_fields.append("source_updated_at")
                if snapshot.payload != payload:
                    snapshot.payload = payload
                    update_fields.append("payload")
                if update_fields:
                    snapshot.save(update_fields=update_fields)
                    refreshed += 1
                else:
                    skipped_existing += 1
            else:
                skipped_existing += 1

    return {
        "ok": True,
        "total_read": len(rows),
        "created": created,
        "refreshed": refreshed,
        "skipped_existing": skipped_existing,
        "invalid_ids": invalid_ids,
        "remapped_ids": remapped_ids,
        "invalid_payloads": invalid_payloads,
        "examples": examples,
    }
