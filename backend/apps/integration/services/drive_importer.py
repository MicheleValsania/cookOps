from __future__ import annotations

from dataclasses import dataclass

from django.core.files.base import ContentFile

from apps.core.models import Site
from apps.integration.models import IntegrationDocument
from apps.integration.services.claude_extractor import run_claude_extraction
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
    document.file.save(filename, ContentFile(binary), save=False)
    document.storage_path = document.file.name
    document.save()
    return document


def import_drive_assets_for_site(
    *,
    site: Site,
    limit: int = 80,
    folder_id: str = "",
    document_type: str = "label_capture",
    auto_extract: bool = True,
) -> DriveImportResult:
    client = DriveClient()
    if folder_id:
        client.folder_id = folder_id.strip()
    rows = client.list_folder_files(limit=limit)

    created: list[dict] = []
    errors: list[dict] = []
    skipped_existing = 0
    skipped_invalid = 0
    extracted_count = 0

    for row in rows if isinstance(rows, list) else []:
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
                extraction = run_claude_extraction(document)
                created_row["extraction_status"] = extraction.status
                if extraction.error_message:
                    created_row["extraction_error"] = extraction.error_message
                if extraction.status == "succeeded":
                    extracted_count += 1
            created.append(created_row)
        except DriveClientError as exc:
            errors.append({"drive_file_id": drive_file_id, "detail": exc.payload})

    return DriveImportResult(
        site=str(site.id),
        folder_id=client.folder_id,
        document_type=document_type,
        created_count=len(created),
        skipped_existing=skipped_existing,
        skipped_invalid=skipped_invalid,
        error_count=len(errors),
        extracted_count=extracted_count,
        created=created,
        errors=errors,
    )
