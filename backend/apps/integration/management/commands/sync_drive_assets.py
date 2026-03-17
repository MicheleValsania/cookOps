from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Site
from apps.integration.services.drive_importer import import_drive_assets_for_site


class Command(BaseCommand):
    help = "Importa nuovi documenti da Google Drive per uno o piu siti e avvia OCR automatico."

    def add_arguments(self, parser):
        parser.add_argument("--site", action="append", dest="sites", default=[], help="UUID sito. Ripetibile.")
        parser.add_argument("--all-sites", action="store_true", dest="all_sites", help="Processa tutti i siti attivi.")
        parser.add_argument("--limit", type=int, default=settings.DRIVE_IMPORT_WORKER_LIMIT)
        parser.add_argument("--document-type", default=settings.DRIVE_IMPORT_WORKER_DOCUMENT_TYPE)
        parser.add_argument("--folder-id", default="")
        parser.add_argument("--no-extract", action="store_true", dest="no_extract")

    def handle(self, *args, **options):
        site_ids = [str(item).strip() for item in options["sites"] if str(item).strip()]
        if options["all_sites"]:
            sites = list(Site.objects.filter(is_active=True).order_by("name"))
        elif site_ids:
            sites = list(Site.objects.filter(id__in=site_ids))
        elif settings.DRIVE_IMPORT_WORKER_SITE_IDS:
            sites = list(Site.objects.filter(id__in=settings.DRIVE_IMPORT_WORKER_SITE_IDS, is_active=True))
        else:
            raise CommandError("Provide --site, --all-sites, or DRIVE_IMPORT_WORKER_SITE_IDS.")

        if not sites:
            raise CommandError("No sites matched the requested scope.")

        total_created = 0
        total_extracted = 0
        total_errors = 0
        for site in sites:
            result = import_drive_assets_for_site(
                site=site,
                limit=max(1, min(int(options["limit"]), 500)),
                folder_id=str(options["folder_id"] or "").strip(),
                document_type=str(options["document_type"] or "label_capture").strip() or "label_capture",
                auto_extract=not bool(options["no_extract"]),
            )
            total_created += result.created_count
            total_extracted += result.extracted_count
            total_errors += result.error_count
            self.stdout.write(
                self.style.SUCCESS(
                    f"{site.code}: new={result.created_count} existing={result.skipped_existing} "
                    f"extracted={result.extracted_count} errors={result.error_count}"
                )
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. created={total_created} extracted={total_extracted} errors={total_errors}"
            )
        )
