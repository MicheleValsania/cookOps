import re

from django.conf import settings
from django.db import connections

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


def _normalize_title(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    # Some legacy fiches exports contain UTF-8 bytes interpreted as latin1.
    if "Ã" in text:
        try:
            fixed = text.encode("latin1").decode("utf-8")
            if fixed:
                return fixed
        except (UnicodeEncodeError, UnicodeDecodeError):
            return text
    return text


def fetch_recipe_titles(query: str = "", limit: int = 30) -> list[dict[str, str]]:
    limit = max(1, min(limit, 100))
    query = query.strip()

    if "fiches" in connections.databases:
        table_name = _safe_identifier(getattr(settings, "FICHES_RECIPE_TABLE", "public.recipes"), "public.recipes")
        id_col = _safe_identifier(getattr(settings, "FICHES_RECIPE_ID_COLUMN", "id"), "id")
        title_col = _safe_identifier(getattr(settings, "FICHES_RECIPE_TITLE_COLUMN", "title"), "title")
        active_col = _safe_optional_identifier(getattr(settings, "FICHES_RECIPE_ACTIVE_COLUMN", ""))
        sql = f"SELECT DISTINCT {id_col}::text, {title_col} FROM {table_name} WHERE {title_col} IS NOT NULL"
        params: list[object] = []

        if active_col:
            sql += f" AND ({active_col} = TRUE OR {active_col} IS NULL)"
        if query:
            sql += f" AND {title_col} ILIKE %s"
            params.append(f"%{query}%")

        sql += f" ORDER BY {title_col} ASC LIMIT %s"
        params.append(limit)

        try:
            with connections["fiches"].cursor() as cursor:
                cursor.execute(sql, params)
                return [
                    {"fiche_product_id": row[0], "title": _normalize_title(row[1])}
                    for row in cursor.fetchall()
                    if row[1]
                ]
        except Exception:
            # Fallback to local snapshots when fiches DB is unavailable in current env/test.
            pass

    queryset = RecipeSnapshot.objects.values("fiche_product_id", "title")
    if query:
        queryset = queryset.filter(title__icontains=query)
    titles = queryset.order_by("title").distinct()[:limit]
    return [
        {"fiche_product_id": str(item["fiche_product_id"]), "title": _normalize_title(item["title"])}
        for item in titles
        if item.get("title")
    ]
