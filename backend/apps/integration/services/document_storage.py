from __future__ import annotations

from django.conf import settings
from django.core.files.base import ContentFile

from apps.integration.models import IntegrationDocument
from apps.integration.services.drive_client import DriveClient, DriveClientError


def _metadata_copy(document: IntegrationDocument) -> dict:
    return document.metadata.copy() if isinstance(document.metadata, dict) else {}


def drive_storage_enabled() -> bool:
    return bool(
        settings.GOOGLE_DRIVE_UPLOAD_FOLDER_ID
        and settings.GOOGLE_DRIVE_OAUTH_CLIENT_ID
        and settings.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
        and settings.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN
    )


def resolve_drive_folder_id_for_document_type(document_type: str) -> str:
    normalized = str(document_type or "").strip()
    if normalized == "invoice":
        return settings.GOOGLE_DRIVE_INVOICES_FOLDER_ID or settings.GOOGLE_DRIVE_UPLOAD_FOLDER_ID
    if normalized == "goods_receipt":
        return settings.GOOGLE_DRIVE_GOODS_RECEIPTS_FOLDER_ID or settings.GOOGLE_DRIVE_UPLOAD_FOLDER_ID
    return settings.GOOGLE_DRIVE_LABELS_FOLDER_ID or settings.GOOGLE_DRIVE_UPLOAD_FOLDER_ID


def persist_document_binary(
    *,
    document: IntegrationDocument,
    filename: str,
    content_type: str,
    binary: bytes,
    metadata_updates: dict | None = None,
) -> IntegrationDocument:
    metadata = _metadata_copy(document)
    if isinstance(metadata_updates, dict):
        metadata.update(metadata_updates)

    if drive_storage_enabled():
        target_folder_id = resolve_drive_folder_id_for_document_type(document.document_type)
        client = DriveClient(folder_id=target_folder_id)
        uploaded = client.upload_file(filename=filename, binary=binary, content_type=content_type)
        metadata.update(
            {
                "storage_provider": "google_drive",
                "storage_drive_file_id": str(uploaded.get("id") or "").strip(),
                "storage_drive_link": str(uploaded.get("webViewLink") or "").strip(),
                "storage_drive_folder_id": target_folder_id,
                "storage_mime_type": content_type,
            }
        )
        document.metadata = metadata
        document.storage_path = f"gdrive://{metadata['storage_drive_file_id']}/{filename}"
        document.save(update_fields=["metadata", "storage_path", "updated_at"])
        return document

    document.file.save(filename, ContentFile(binary), save=False)
    document.storage_path = document.file.name
    document.metadata = metadata
    document.save(update_fields=["file", "storage_path", "metadata", "updated_at"])
    return document


def read_document_bytes(document: IntegrationDocument) -> tuple[bytes, str]:
    metadata = _metadata_copy(document)
    drive_file_id = str(metadata.get("storage_drive_file_id") or metadata.get("drive_file_id") or "").strip()
    if drive_file_id:
        client = DriveClient(
            folder_id=str(metadata.get("storage_drive_folder_id") or settings.GOOGLE_DRIVE_FOLDER_ID).strip()
            or resolve_drive_folder_id_for_document_type(document.document_type)
        )
        headers, binary = client.download_file(drive_file_id)
        content_type = (headers.get("Content-Type") or document.content_type or "application/octet-stream").strip()
        return binary, content_type

    if document.file:
        document.file.open("rb")
        try:
            return document.file.read(), (document.content_type or "application/octet-stream").strip()
        finally:
            document.file.close()

    return b"", (document.content_type or "application/octet-stream").strip()


def delete_document_binary(document: IntegrationDocument) -> None:
    metadata = _metadata_copy(document)
    drive_file_id = str(metadata.get("storage_drive_file_id") or "").strip()
    if drive_file_id:
        try:
            client = DriveClient(folder_id=str(metadata.get("storage_drive_folder_id") or settings.GOOGLE_DRIVE_UPLOAD_FOLDER_ID).strip())
            client.delete_file(drive_file_id)
        except DriveClientError:
            pass

    if document.file:
        document.file.delete(save=False)
