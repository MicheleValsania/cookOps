from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any


def _to_decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def extract_ingredients(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates: list[Any] = []
    if isinstance(payload.get("ingredients"), list):
        candidates = payload.get("ingredients") or []
    elif isinstance(payload.get("data"), dict) and isinstance(payload["data"].get("ingredients"), list):
        candidates = payload["data"]["ingredients"]
    elif isinstance(payload.get("recipe"), dict) and isinstance(payload["recipe"].get("ingredients"), list):
        candidates = payload["recipe"]["ingredients"]

    result: list[dict[str, Any]] = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        name = (
            item.get("name")
            or item.get("title")
            or item.get("ingredient")
            or item.get("product_name")
            or ""
        )
        if not name:
            continue
        qty = (
            item.get("quantity")
            or item.get("qty")
            or item.get("amount")
            or item.get("value")
            or 0
        )
        unit = item.get("unit") or item.get("uom") or item.get("qty_unit") or "pc"
        supplier = item.get("supplier") or item.get("supplier_name") or item.get("vendor") or ""
        result.append(
            {
                "name": str(name).strip(),
                "qty": _to_decimal(qty),
                "unit": str(unit).strip(),
                "supplier": str(supplier).strip(),
            }
        )
    return result

