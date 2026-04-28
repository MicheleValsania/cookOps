from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from apps.core.models import Site
from apps.integration.models import DocumentExtraction, DocumentStatus, IntegrationDocument
from apps.integration.services.claude_extractor import run_claude_extraction
from apps.integration.services.document_storage import persist_document_binary, resolve_drive_folder_id_for_document_type
from apps.integration.services.drive_client import DriveClient, DriveClientError


def _document_exists_for_drive_file(site: Site, drive_file_id: str) -> bool:
    return IntegrationDocument.objects.filter(
        site=site,
        source="drive",
        metadata__drive_file_id=drive_file_id,
    ).exists()


@dataclass
class DriveImportResult:
    site: str
    folder_id: str
    document_type: str
    scanned_count: int
    created_count: int
    skipped_existing: int
    skipped_invalid: int
    error_count: int
    extracted_count: int
    created: list[dict]
    errors: list[dict]

    def as_dict(self) -> dict:
        return {
            "site": self.site,
            "folder_id": self.folder_id,
            "document_type": self.document_type,
            "scanned_count": self.scanned_count,
            "created_count": self.created_count,
            "skipped_existing": self.skipped_existing,
            "skipped_invalid": self.skipped_invalid,
            "error_count": self.error_count,
            "extracted_count": self.extracted_count,
            "created": self.created,
            "errors": self.errors,
        }


def _create_drive_document(*, site: Site, document_type: str, filename: str, content_type: str, binary: bytes, metadata: dict):
    document = IntegrationDocument.objects.create(
        site=site,
        document_type=document_type,
        source="drive",
        filename=filename,
        content_type=content_type,
        file_size=len(binary),
        status="uploaded",
        metadata=metadata,
    )
    return persist_document_binary(
        document=document,
        filename=filename,
        content_type=content_type,
        binary=binary,
    )


def import_drive_assets_for_site(
    *,
    site: Site,
    limit: int = 80,
    folder_id: str = "",
    document_type: str = "label_capture",
    auto_extract: bool = True,
) -> DriveImportResult:
    effective_folder_id = folder_id.strip() or resolve_drive_folder_id_for_document_type(document_type)
    client = DriveClient(folder_id=effective_folder_id)
    scan_limit = max(limit, int(getattr(settings, "DRIVE_IMPORT_SCAN_LIMIT", 2000) or 2000))

    created: list[dict] = []
    errors: list[dict] = []
    skipped_existing = 0
    skipped_invalid = 0
    extracted_count = 0
    scanned_count = 0

    for row in client.iter_folder_files(limit=scan_limit):
        scanned_count += 1
        if not isinstance(row, dict):
            skipped_invalid += 1
            continue
        drive_file_id = str(row.get("id") or "").strip()
        if not drive_file_id:
            skipped_invalid += 1
            continue
        if _document_exists_for_drive_file(site, drive_file_id):
            skipped_existing += 1
            continue

        try:
            headers, binary = client.download_file(drive_file_id)
            content_type = (headers.get("Content-Type") or row.get("mimeType") or "application/octet-stream").strip()
            filename = str(row.get("name") or f"{drive_file_id}.bin").strip() or f"{drive_file_id}.bin"
            metadata = {
                "drive_file_id": drive_file_id,
                "drive_link": row.get("webViewLink") or "",
                "drive_folder_id": client.folder_id,
                "mime_type": row.get("mimeType") or content_type,
                "drive_created_at": row.get("createdTime"),
                "drive_modified_at": row.get("modifiedTime"),
                "source_app": "drive",
            }
            document = _create_drive_document(
                site=site,
                document_type=document_type,
                filename=filename,
                content_type=content_type,
                binary=binary,
                metadata=metadata,
            )
            created_row = {
                "document_id": str(document.id),
                "drive_file_id": drive_file_id,
                "filename": filename,
                "extraction_status": "skipped",
            }
            if auto_extract:
                result = run_claude_extraction(document)
                extraction = DocumentExtraction.objects.create(
                    document=document,
                    extractor_name="claude",
                    extractor_version=result.extractor_version,
                    status=result.status,
                    raw_payload=result.raw_payload,
                    normalized_payload=result.normalized_payload,
                    confidence=result.confidence,
                    error_message=result.error_message,
                )
                document.status = (
                    DocumentStatus.EXTRACTED
                    if result.status == "succeeded"
                    else DocumentStatus.FAILED
                )
                document.save(update_fields=["status", "updated_at"])
                created_row["extraction_id"] = str(extraction.id)
                created_row["extraction_status"] = extraction.status
                if extraction.error_message:
                    created_row["extraction_error"] = extraction.error_message
                if extraction.status == "succeeded":
                    extracted_count += 1
            created.append(created_row)
            if len(created) >= limit:
                break
        except DriveClientError as exc:
            errors.append({"drive_file_id": drive_file_id, "detail": exc.payload})

    return DriveImportResult(
        site=str(site.id),
        folder_id=client.folder_id,
        document_type=document_type,
        scanned_count=scanned_count,
        created_count=len(created),
        skipped_existing=skipped_existing,
        skipped_invalid=skipped_invalid,
        error_count=len(errors),
        extracted_count=extracted_count,
        created=created,
        errors=errors,
    )
