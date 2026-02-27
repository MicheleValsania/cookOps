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


def fetch_recipe_titles(query: str = "", limit: int = 30) -> list[str]:
    limit = max(1, min(limit, 100))
    query = query.strip()

    if "fiches" in connections.databases:
        table_name = _safe_identifier(getattr(settings, "FICHES_RECIPE_TABLE", "public.recipes"), "public.recipes")
        title_col = _safe_identifier(getattr(settings, "FICHES_RECIPE_TITLE_COLUMN", "title"), "title")
        active_col = _safe_optional_identifier(getattr(settings, "FICHES_RECIPE_ACTIVE_COLUMN", ""))
        sql = f"SELECT DISTINCT {title_col} FROM {table_name} WHERE {title_col} IS NOT NULL"
        params: list[object] = []

        if active_col:
            sql += f" AND ({active_col} = TRUE OR {active_col} IS NULL)"
        if query:
            sql += f" AND {title_col} ILIKE %s"
            params.append(f"%{query}%")

        sql += f" ORDER BY {title_col} ASC LIMIT %s"
        params.append(limit)

        with connections["fiches"].cursor() as cursor:
            cursor.execute(sql, params)
            return [row[0] for row in cursor.fetchall() if row[0]]

    queryset = RecipeSnapshot.objects.values_list("title", flat=True)
    if query:
        queryset = queryset.filter(title__icontains=query)
    titles = queryset.order_by("title").distinct()[:limit]
    return [title for title in titles if title]
