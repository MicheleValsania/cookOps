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


def import_recipe_snapshots(query: str = "", limit: int = 500) -> dict[str, Any]:
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
    skipped_existing = 0
    invalid_ids = 0
    invalid_payloads = 0
    examples: list[str] = []

    for fiche_id_raw, title, data, updated_at in rows:
        try:
            fiche_id = uuid.UUID(str(fiche_id_raw))
        except (ValueError, TypeError):
            invalid_ids += 1
            continue

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

        snapshot_hash = _snapshot_hash(payload)
        source_updated_at = None
        if updated_at:
            source_updated_at = updated_at if not isinstance(updated_at, str) else parse_datetime(updated_at)

        _, was_created = RecipeSnapshot.objects.get_or_create(
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
            skipped_existing += 1

    return {
        "ok": True,
        "total_read": len(rows),
        "created": created,
        "skipped_existing": skipped_existing,
        "invalid_ids": invalid_ids,
        "invalid_payloads": invalid_payloads,
        "examples": examples,
    }
