from __future__ import annotations

import logging
import os
import threading
import time

from django.conf import settings
from django.db import close_old_connections

from apps.core.models import Site
from apps.integration.services.drive_importer import import_drive_assets_for_site


logger = logging.getLogger(__name__)
_worker_thread: threading.Thread | None = None


def _resolve_worker_sites() -> list[Site]:
    if settings.DRIVE_IMPORT_WORKER_SITE_IDS:
        return list(Site.objects.filter(id__in=settings.DRIVE_IMPORT_WORKER_SITE_IDS, is_active=True))
    return list(Site.objects.filter(is_active=True))


def _worker_loop() -> None:
    interval = max(30, int(settings.DRIVE_IMPORT_WORKER_INTERVAL_SECONDS))
    while True:
        close_old_connections()
        try:
            for site in _resolve_worker_sites():
                result = import_drive_assets_for_site(
                    site=site,
                    limit=max(1, min(int(settings.DRIVE_IMPORT_WORKER_LIMIT), 500)),
                    document_type=settings.DRIVE_IMPORT_WORKER_DOCUMENT_TYPE,
                    auto_extract=bool(settings.DRIVE_IMPORT_WORKER_AUTO_EXTRACT),
                )
                if result.created_count or result.error_count:
                    logger.info(
                        "Drive worker site=%s created=%s skipped_existing=%s extracted=%s errors=%s",
                        site.id,
                        result.created_count,
                        result.skipped_existing,
                        result.extracted_count,
                        result.error_count,
                    )
        except Exception:
            logger.exception("Drive import worker cycle failed")
        time.sleep(interval)


def maybe_start_drive_import_worker() -> None:
    global _worker_thread
    if _worker_thread is not None or not settings.DRIVE_IMPORT_WORKER_ENABLED:
        return
    if os.environ.get("RUN_MAIN") != "true":
        return
    _worker_thread = threading.Thread(target=_worker_loop, name="drive-import-worker", daemon=True)
    _worker_thread.start()
