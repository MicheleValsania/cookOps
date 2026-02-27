import json

from django.utils import timezone

from apps.integration.models import IntegrationImportBatch


def normalize_payload(data):
    return json.loads(json.dumps(data, default=str))


def find_completed_batch(source: str, import_type: str, idempotency_key: str):
    if not idempotency_key:
        return None
    return (
        IntegrationImportBatch.objects.filter(
            source=source,
            import_type=import_type,
            idempotency_key=idempotency_key,
            status=IntegrationImportBatch.Status.COMPLETED,
        )
        .order_by("-started_at")
        .first()
    )


def start_batch(source: str, import_type: str, idempotency_key: str, payload):
    return IntegrationImportBatch.objects.create(
        source=source,
        import_type=import_type,
        idempotency_key=idempotency_key or None,
        status=IntegrationImportBatch.Status.STARTED,
        payload=normalize_payload(payload),
    )


def complete_batch(batch: IntegrationImportBatch, status_code: int, data):
    batch.status = IntegrationImportBatch.Status.COMPLETED
    batch.finished_at = timezone.now()
    batch.result = {
        "status_code": status_code,
        "data": normalize_payload(data),
    }
    batch.save(update_fields=["status", "finished_at", "result", "updated_at"])


def fail_batch(batch: IntegrationImportBatch, status_code: int, errors):
    batch.status = IntegrationImportBatch.Status.FAILED
    batch.finished_at = timezone.now()
    batch.result = {
        "status_code": status_code,
        "errors": normalize_payload(errors),
    }
    batch.save(update_fields=["status", "finished_at", "result", "updated_at"])
