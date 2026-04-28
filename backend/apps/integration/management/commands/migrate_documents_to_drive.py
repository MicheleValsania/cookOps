from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Site
from apps.integration.models import IntegrationDocument
from apps.integration.services.document_storage import drive_storage_enabled, persist_document_binary, read_document_bytes


class Command(BaseCommand):
    help = "Migra documenti esistenti dallo storage locale a Google Drive con report di audit."

    def add_arguments(self, parser):
        parser.add_argument("--site", action="append", dest="sites", default=[], help="UUID sito. Ripetibile.")
        parser.add_argument(
            "--document-type",
            action="append",
            dest="document_types",
            default=[],
            help="invoice | goods_receipt | label_capture. Ripetibile.",
        )
        parser.add_argument("--include-duplicates", action="store_true", dest="include_duplicates")
        parser.add_argument("--limit", type=int, default=0, help="Limita il numero di documenti processati.")
        parser.add_argument("--dry-run", action="store_true", dest="dry_run")

    def handle(self, *args, **options):
        if not drive_storage_enabled():
            raise CommandError("Google Drive storage is not enabled. Configure Drive OAuth and folder ids first.")

        site_ids = [str(item).strip() for item in options["sites"] if str(item).strip()]
        document_types = [str(item).strip() for item in options["document_types"] if str(item).strip()]
        if document_types:
            invalid = [item for item in document_types if item not in {"invoice", "goods_receipt", "label_capture"}]
            if invalid:
                raise CommandError(f"Invalid --document-type values: {', '.join(invalid)}")

        queryset = IntegrationDocument.objects.all().order_by("created_at")
        if site_ids:
            matched_sites = set(Site.objects.filter(id__in=site_ids).values_list("id", flat=True))
            missing = [item for item in site_ids if item not in {str(site_id) for site_id in matched_sites}]
            if missing:
                raise CommandError(f"Unknown site ids: {', '.join(missing)}")
            queryset = queryset.filter(site_id__in=site_ids)
        if document_types:
            queryset = queryset.filter(document_type__in=document_types)
        if not options["include_duplicates"]:
            queryset = queryset.exclude(status="archived_duplicate")

        total = 0
        already_on_drive = 0
        migrated = 0
        missing_binary = 0
        errors = 0

        limit = max(0, int(options["limit"] or 0))
        if limit:
            queryset = queryset[:limit]

        for document in queryset.iterator():
            total += 1
            metadata = document.metadata.copy() if isinstance(document.metadata, dict) else {}
            if str(metadata.get("storage_provider") or "").strip() == "google_drive" and str(metadata.get("storage_drive_file_id") or "").strip():
                already_on_drive += 1
                self.stdout.write(f"SKIP on_drive {document.id} {document.document_type} {document.filename}")
                continue

            file_bytes, content_type = read_document_bytes(document)
            if not file_bytes:
                missing_binary += 1
                self.stdout.write(self.style.WARNING(f"MISSING {document.id} {document.document_type} {document.filename}"))
                continue

            if options["dry_run"]:
                migrated += 1
                self.stdout.write(f"PLAN migrate {document.id} {document.document_type} {document.filename}")
                continue

            try:
                old_storage_path = str(document.storage_path or "").strip()
                persist_document_binary(
                    document=document,
                    filename=document.filename,
                    content_type=content_type,
                    binary=file_bytes,
                    metadata_updates={
                        "migrated_from_storage_path": old_storage_path,
                        "migrated_to_drive": True,
                    },
                )
                migrated += 1
                self.stdout.write(self.style.SUCCESS(f"MIGRATED {document.id} {document.document_type} {document.filename}"))
            except Exception as exc:
                errors += 1
                self.stdout.write(self.style.ERROR(f"ERROR {document.id} {document.document_type} {document.filename}: {exc}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. scanned={total} migrated={migrated} already_on_drive={already_on_drive} missing_binary={missing_binary} errors={errors}"
            )
        )
