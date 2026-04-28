import os
import re

from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Site
from apps.integration.models import IntegrationDocument
from apps.integration.services.document_storage import drive_storage_enabled, resolve_drive_folder_id_for_document_type
from apps.integration.services.drive_client import DriveClient


_UNITLESS_DUPLICATE_SUFFIX_RE = re.compile(r"^(?P<stem>.+?)\((?P<index>\d+)\)(?P<ext>\.[^.]+)$")


def _normalize_filename(value: str) -> str:
    return str(value or "").strip().lower()


def _strip_duplicate_suffix(value: str) -> str:
    filename = str(value or "").strip()
    match = _UNITLESS_DUPLICATE_SUFFIX_RE.match(filename)
    if not match:
        return filename
    stem = match.group("stem")
    if not stem or stem[-1].isspace():
        return filename
    return f"{stem}{match.group('ext')}"


def _normalize_invoice_number(value: str) -> str:
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def _extract_document_invoice_number(document: IntegrationDocument) -> str:
    metadata = document.metadata.copy() if isinstance(document.metadata, dict) else {}
    for key in ("invoice_number", "document_number", "delivery_note_number"):
        candidate = str(metadata.get(key) or "").strip()
        if candidate:
            return candidate
    extraction = document.extractions.order_by("-created_at").first()
    if not extraction:
        return ""
    for payload_name in ("normalized_payload", "raw_payload"):
        payload = getattr(extraction, payload_name, None)
        if not isinstance(payload, dict):
            continue
        for key in ("invoice_number", "document_number", "delivery_note_number"):
            candidate = str(payload.get(key) or "").strip()
            if candidate:
                return candidate
    return ""


class Command(BaseCommand):
    help = "Riallinea documenti storici con PDF già presenti in Google Drive, senza ricaricare i binari."

    def add_arguments(self, parser):
        parser.add_argument("--site", action="append", dest="sites", default=[], help="UUID sito. Ripetibile.")
        parser.add_argument(
            "--document-type",
            action="append",
            dest="document_types",
            default=[],
            help="invoice | goods_receipt | label_capture. Ripetibile.",
        )
        parser.add_argument("--folder-id", default="", help="Folder id Drive esplicito. Di default usa quello del tipo documento.")
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

        limit = max(0, int(options["limit"] or 0))
        if limit:
            queryset = queryset[:limit]

        documents = list(queryset)
        if not documents:
            self.stdout.write("No documents matched the filters.")
            return

        folder_ids = {}
        for document in documents:
            folder_id = str(options["folder_id"] or "").strip() or resolve_drive_folder_id_for_document_type(document.document_type)
            if not folder_id:
                raise CommandError(f"No Google Drive folder configured for document type {document.document_type}.")
            folder_ids.setdefault(folder_id, []).append(document)

        scanned = 0
        relinked = 0
        already_on_drive = 0
        unmatched = 0
        ambiguous = 0

        for folder_id, batch in folder_ids.items():
            drive_files = DriveClient(folder_id=folder_id).list_folder_files(limit=1000)
            exact_map = {}
            stripped_map = {}
            invoice_map = {}

            for row in drive_files:
                title = str(row.get("name") or row.get("title") or "").strip()
                file_id = str(row.get("id") or "").strip()
                if not title or not file_id:
                    continue
                exact_key = _normalize_filename(title)
                exact_map.setdefault(exact_key, []).append(row)

                stripped_title = _strip_duplicate_suffix(title)
                if stripped_title != title:
                    stripped_key = _normalize_filename(stripped_title)
                    stripped_map.setdefault(stripped_key, []).append(row)

                invoice_key = _normalize_invoice_number(os.path.splitext(title)[0])
                if invoice_key:
                    invoice_map.setdefault(invoice_key, []).append(row)

            for document in batch:
                scanned += 1
                metadata = document.metadata.copy() if isinstance(document.metadata, dict) else {}
                if str(metadata.get("storage_provider") or "").strip() == "google_drive" and str(metadata.get("storage_drive_file_id") or "").strip():
                    already_on_drive += 1
                    self.stdout.write(f"SKIP on_drive {document.id} {document.document_type} {document.filename}")
                    continue

                matches = exact_map.get(_normalize_filename(document.filename), [])
                match_reason = "filename_exact"

                if not matches:
                    stripped_name = _strip_duplicate_suffix(document.filename)
                    if stripped_name != document.filename:
                        matches = exact_map.get(_normalize_filename(stripped_name), [])
                        match_reason = "filename_without_duplicate_suffix"

                if not matches:
                    matches = stripped_map.get(_normalize_filename(document.filename), [])
                    match_reason = "drive_filename_without_duplicate_suffix"

                if not matches:
                    invoice_number = _extract_document_invoice_number(document)
                    invoice_key = _normalize_invoice_number(invoice_number)
                    if invoice_key:
                        matches = invoice_map.get(invoice_key, [])
                        match_reason = "invoice_number"

                if not matches:
                    unmatched += 1
                    self.stdout.write(self.style.WARNING(f"UNMATCHED {document.id} {document.document_type} {document.filename}"))
                    continue

                unique_matches = {str(row.get('id') or '').strip(): row for row in matches if str(row.get('id') or '').strip()}
                if len(unique_matches) != 1:
                    ambiguous += 1
                    joined = ", ".join(sorted(str(item.get("name") or item.get("title") or "").strip() for item in unique_matches.values()))
                    self.stdout.write(self.style.WARNING(f"AMBIGUOUS {document.id} {document.document_type} {document.filename} -> {joined}"))
                    continue

                row = next(iter(unique_matches.values()))
                target_title = str(row.get("name") or row.get("title") or "").strip()
                target_id = str(row.get("id") or "").strip()
                target_link = str(row.get("webViewLink") or row.get("url") or "").strip()

                if options["dry_run"]:
                    relinked += 1
                    self.stdout.write(f"PLAN relink {document.id} {document.document_type} {document.filename} -> {target_title} [{match_reason}]")
                    continue

                metadata.update(
                    {
                        "storage_provider": "google_drive",
                        "storage_drive_file_id": target_id,
                        "storage_drive_link": target_link,
                        "storage_drive_folder_id": folder_id,
                        "storage_mime_type": str(row.get("mimeType") or row.get("mime_type") or document.content_type or "application/pdf").strip(),
                        "migrated_to_drive": True,
                        "migrated_from_storage_path": str(document.storage_path or "").strip(),
                        "relinked_from_drive": True,
                        "relinked_match_reason": match_reason,
                    }
                )
                document.metadata = metadata
                document.storage_path = f"gdrive://{target_id}/{target_title}"
                if not document.content_type:
                    document.content_type = "application/pdf"
                    document.save(update_fields=["metadata", "storage_path", "content_type", "updated_at"])
                else:
                    document.save(update_fields=["metadata", "storage_path", "updated_at"])
                relinked += 1
                self.stdout.write(self.style.SUCCESS(f"RELINKED {document.id} {document.document_type} {document.filename} -> {target_title} [{match_reason}]"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. scanned={scanned} relinked={relinked} already_on_drive={already_on_drive} unmatched={unmatched} ambiguous={ambiguous}"
            )
        )
