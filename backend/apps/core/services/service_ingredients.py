from __future__ import annotations

import re
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


QTY_WITH_UNIT_PATTERN = re.compile(r"^\s*([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]+)?\s*$")


def _parse_qty_and_unit(raw_qty: Any) -> tuple[Decimal, str | None]:
    if raw_qty is None:
        return Decimal("0"), None
    if isinstance(raw_qty, (int, float, Decimal)):
        return _to_decimal(raw_qty), None
    text = str(raw_qty).strip()
    if not text:
        return Decimal("0"), None
    match = QTY_WITH_UNIT_PATTERN.match(text)
    if match:
        qty = _to_decimal(match.group(1).replace(",", "."))
        unit = (match.group(2) or "").strip() or None
        return qty, unit
    return _to_decimal(text), None


def normalize_qty_unit(qty: Decimal, unit: str | None) -> tuple[Decimal, str]:
    normalized_unit = (unit or "pc").strip().lower()
    piece_aliases = {"pc", "pz", "piece", "pieces", "unit", "unite", "unites"}
    if normalized_unit in {"kg"}:
        return qty, "kg"
    if normalized_unit in {"g"}:
        return qty / Decimal("1000"), "kg"
    if normalized_unit in {"l"}:
        return qty, "l"
    if normalized_unit in {"ml"}:
        return qty / Decimal("1000"), "l"
    if normalized_unit in {"cl"}:
        return qty / Decimal("100"), "l"
    if normalized_unit in piece_aliases:
        return qty, "pc"
    return qty, normalized_unit


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
        parsed_qty, parsed_unit = _parse_qty_and_unit(qty)
        unit = item.get("unit") or item.get("uom") or item.get("qty_unit") or parsed_unit or "pc"
        supplier = item.get("supplier") or item.get("supplier_name") or item.get("vendor") or ""
        supplier_code = (
            item.get("supplier_code")
            or item.get("supplier_sku")
            or item.get("vendor_code")
            or item.get("article_code")
            or item.get("code")
            or ""
        )
        result.append(
            {
                "name": str(name).strip(),
                "qty": parsed_qty,
                "unit": str(unit).strip(),
                "supplier": str(supplier).strip(),
                "supplier_code": str(supplier_code).strip(),
            }
        )
    return result
