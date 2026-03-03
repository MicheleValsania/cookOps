from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
import json
from datetime import datetime, time, timezone
from decimal import Decimal, InvalidOperation

from django.utils.dateparse import parse_date, parse_datetime

from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integration.api.v1.serializers import (
    ClaudeExtractSerializer,
    DocumentExtractionSerializer,
    ExtractionIngestSerializer,
    FicheCatalogImportSerializer,
    FicheSnapshotEnvelopeImportSerializer,
    FicheSnapshotImportSerializer,
    IntegrationDocumentSerializer,
)
from apps.integration.fiches_catalog import import_supplier_catalog_from_fiches
from apps.integration.fiches_snapshots import import_recipe_snapshots, import_recipe_snapshots_from_v11_envelope
from apps.integration.fiches_titles import fetch_recipe_titles
from apps.integration.import_batches import complete_batch, fail_batch, find_completed_batch, start_batch
from apps.integration.models import DocumentExtraction, IntegrationDocument
from apps.integration.services.claude_extractor import run_claude_extraction
from apps.purchasing.api.v1.serializers import GoodsReceiptSerializer, InvoiceSerializer


def _as_dict(value):
    return value if isinstance(value, dict) else {}


def _as_list(value):
    return value if isinstance(value, list) else []


def _pick_first(data: dict, *keys, default=None):
    for key in keys:
        value = data.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return default


def _normalize_decimal_text(value, places: int = 3):
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    normalized = raw.replace(" ", "").replace(",", ".")
    try:
        number = Decimal(normalized)
    except (InvalidOperation, ValueError):
        return None
    quant = Decimal(10) ** -places
    try:
        return str(number.quantize(quant))
    except InvalidOperation:
        return str(number)


def _normalize_unit(value):
    if value is None:
        return None
    normalized = (
        str(value)
        .strip()
        .lower()
        .replace(".", "")
        .replace("-", "")
        .replace("_", "")
    )
    mapping = {
        "kg": "kg",
        "kilogram": "kg",
        "kilograms": "kg",
        "g": "g",
        "gr": "g",
        "gram": "g",
        "grams": "g",
        "l": "l",
        "lt": "l",
        "liter": "l",
        "litre": "l",
        "liters": "l",
        "litres": "l",
        "ml": "ml",
        "milliliter": "ml",
        "millilitre": "ml",
        "cl": "cl",
        "centiliter": "cl",
        "centilitre": "cl",
        "pc": "pc",
        "pcs": "pc",
        "piece": "pc",
        "pieces": "pc",
        "un": "pc",
        "u": "pc",
        "ea": "pc",
        "unite": "pc",
        "unita": "pc",
        "pièce": "pc",
        "pièces": "pc",
    }
    return mapping.get(normalized, None)


def _normalize_date_text(value):
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    parsed_dt = parse_datetime(raw)
    if parsed_dt:
        return parsed_dt.date().isoformat()
    parsed_date = parse_date(raw)
    if parsed_date:
        return parsed_date.isoformat()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _normalize_datetime_text(value):
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    parsed_dt = parse_datetime(raw)
    if parsed_dt:
        if parsed_dt.tzinfo is None:
            parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
        return parsed_dt.isoformat().replace("+00:00", "Z")
    parsed_date = parse_date(raw)
    if parsed_date:
        return datetime.combine(parsed_date, time.min, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            parsed = datetime.strptime(raw, fmt).date()
            return datetime.combine(parsed, time.min, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    return None


def _normalize_lines(lines, target: str):
    normalized = []
    for raw in _as_list(lines):
        line = _as_dict(raw)
        row = {
            "supplier_product": _pick_first(line, "supplier_product", "supplier_product_id"),
            "raw_product_name": _pick_first(
                line, "raw_product_name", "description", "name", "product_name", "ingredient"
            ),
            "qty_value": _normalize_decimal_text(
                _pick_first(line, "qty_value", "quantity", "qty", "qte", "qta"),
                places=3,
            ),
            "qty_unit": _normalize_unit(_pick_first(line, "qty_unit", "unit", "uom", "um", "unit_of_measure")),
            "unit_price": _normalize_decimal_text(
                _pick_first(line, "unit_price", "price", "unit_cost", "prix_unitaire"),
                places=4,
            ),
        }

        if row["raw_product_name"] and row["qty_value"] is None:
            row["qty_value"] = "1.000"
        if row["raw_product_name"] and row["qty_unit"] is None:
            row["qty_unit"] = "pc"

        if target == "goods_receipt":
            row["supplier_lot_code"] = _pick_first(line, "supplier_lot_code", "lot", "lot_code", "batch")
            row["dlc_date"] = _normalize_date_text(_pick_first(line, "dlc_date", "dlm_date", "expiry_date", "use_by_date"))
        else:
            row["line_total"] = _normalize_decimal_text(
                _pick_first(line, "line_total", "total", "line_amount", "montant_ligne"),
                places=4,
            )
            row["vat_rate"] = _normalize_decimal_text(
                _pick_first(line, "vat_rate", "vat", "tva", "tax_rate"),
                places=2,
            )
            row["note"] = _pick_first(line, "note", "line_note")

        if row.get("qty_value") and row.get("qty_unit"):
            cleaned = {k: v for k, v in row.items() if v not in (None, "")}
            normalized.append(cleaned)
    return normalized


def _build_metadata(payload: dict, target: str):
    metadata = _as_dict(payload.get("metadata")).copy()
    metadata.setdefault("source", "claude")
    keys_to_keep = [
        "supplier_name",
        "supplier_vat",
        "currency",
        "total_amount",
        "total_ht",
        "vat_amount",
        "vat_rate",
        "payment_terms",
        "document_number",
        "invoice_number",
        "delivery_note_number",
        "invoice_date",
        "due_date",
        "document_date",
        "received_at",
    ]
    for key in keys_to_keep:
        value = payload.get(key)
        if value not in (None, ""):
            metadata[key] = value
    metadata["document_kind"] = target
    return metadata


def _normalize_payload_for_ingest(payload: dict, target: str, document: IntegrationDocument):
    source = _as_dict(payload)
    site_id = _pick_first(source, "site", default=str(document.site_id))
    supplier_id = _pick_first(source, "supplier")
    lines = _normalize_lines(source.get("lines"), target)

    if target == "goods_receipt":
        delivery_note_number = _pick_first(source, "delivery_note_number", "document_number", "invoice_number")
        if not delivery_note_number:
            delivery_note_number = f"BL-{str(document.id)[:8]}"
        received_at = _normalize_datetime_text(_pick_first(source, "received_at", "document_date", "invoice_date"))
        if not received_at:
            received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return {
            "site": site_id,
            "supplier": supplier_id,
            "delivery_note_number": str(delivery_note_number),
            "received_at": received_at,
            "metadata": _build_metadata(source, target),
            "lines": lines,
        }

    invoice_number = _pick_first(source, "invoice_number", "document_number", "delivery_note_number")
    if not invoice_number:
        invoice_number = f"INV-{str(document.id)[:8]}"
    invoice_date = _normalize_date_text(_pick_first(source, "invoice_date", "document_date", "received_at"))
    if not invoice_date:
        invoice_date = datetime.now(timezone.utc).date().isoformat()
    due_date = _normalize_date_text(_pick_first(source, "due_date", "payment_due_date"))
    normalized = {
        "site": site_id,
        "supplier": supplier_id,
        "invoice_number": str(invoice_number),
        "invoice_date": invoice_date,
        "metadata": _build_metadata(source, target),
        "lines": lines,
    }
    if due_date:
        normalized["due_date"] = due_date
    return normalized


class IntegrationDocumentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = IntegrationDocument.objects.all()
    serializer_class = IntegrationDocumentSerializer
    parser_classes = (MultiPartParser, FormParser)


class DocumentExtractionViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentExtractionSerializer
    queryset = DocumentExtraction.objects.all()

    def get_document(self) -> IntegrationDocument:
        return get_object_or_404(IntegrationDocument, pk=self.kwargs["document_id"])

    def perform_create(self, serializer):
        serializer.save(document=self.get_document())


class DocumentIngestViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = IntegrationDocument.objects.all()
    serializer_class = ExtractionIngestSerializer

    def get_document(self) -> IntegrationDocument:
        return get_object_or_404(IntegrationDocument, pk=self.kwargs["document_id"])

    def create(self, request, *args, **kwargs):
        document = self.get_document()
        serializer = self.get_serializer(data=request.data, context={"document": document})
        serializer.is_valid(raise_exception=True)

        idempotency_key = serializer.validated_data["idempotency_key"]
        extraction = serializer.validated_data["extraction"]
        target = serializer.validated_data["target"]

        source = "ocr"
        import_type = target

        existing = find_completed_batch(source, import_type, idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        payload = _normalize_payload_for_ingest(extraction.normalized_payload, target, document)
        batch = start_batch(
            source,
            import_type,
            idempotency_key,
            {
                "document_id": str(document.id),
                "extraction_id": str(extraction.id),
                "payload": payload,
                "raw_payload": extraction.normalized_payload,
            },
        )

        import_serializer_class = GoodsReceiptSerializer if target == "goods_receipt" else InvoiceSerializer
        try:
            import_serializer = import_serializer_class(data=payload)
            import_serializer.is_valid(raise_exception=True)
            instance = import_serializer.save()
            data = import_serializer_class(instance).data
            complete_batch(batch, status.HTTP_201_CREATED, data)
            return Response(data, status=status.HTTP_201_CREATED)
        except ValidationError as exc:
            fail_batch(batch, status.HTTP_400_BAD_REQUEST, exc.detail)
            raise
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


class DocumentClaudeExtractView(APIView):
    def post(self, request, document_id):
        document = get_object_or_404(IntegrationDocument, pk=document_id)
        serializer = ClaudeExtractSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        idempotency_key = (
            serializer.validated_data.get("idempotency_key")
            or request.headers.get("Idempotency-Key", "")
            or f"claude-extract:{document.id}"
        )
        source = "claude"
        import_type = "document_extraction"
        existing = find_completed_batch(source, import_type, idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(
            source,
            import_type,
            idempotency_key,
            {
                "document_id": str(document.id),
                "document_type": document.document_type,
                "filename": document.filename,
            },
        )

        try:
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
            if result.status == "succeeded":
                document.status = "extracted"
            else:
                document.status = "failed"
            document.save(update_fields=["status", "updated_at"])
            payload = DocumentExtractionSerializer(extraction).data
            if result.status == "succeeded":
                complete_batch(batch, status.HTTP_201_CREATED, payload)
                return Response(payload, status=status.HTTP_201_CREATED)
            fail_batch(
                batch,
                status.HTTP_400_BAD_REQUEST,
                {
                    "detail": result.error_message or "Claude extraction failed.",
                    "extraction": payload,
                },
            )
            return Response(
                {"detail": result.error_message or "Claude extraction failed.", "extraction": payload},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


class FicheRecipeTitleListView(APIView):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        try:
            limit = int(request.query_params.get("limit", 30))
        except ValueError:
            limit = 30

        titles = fetch_recipe_titles(query=query, limit=limit)
        return Response({"results": titles})


class FicheSnapshotImportView(APIView):
    def post(self, request):
        serializer = FicheSnapshotImportSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        query = serializer.validated_data.get("query", "")
        limit = serializer.validated_data.get("limit", 500)
        idempotency_key = (
            serializer.validated_data.get("idempotency_key")
            or request.headers.get("Idempotency-Key", "")
            or f"fiches-snapshots:{query}:{limit}"
        )

        existing = find_completed_batch("fiches", "recipe_snapshot", idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(
            "fiches",
            "recipe_snapshot",
            idempotency_key,
            {"query": query, "limit": limit},
        )
        try:
            result = import_recipe_snapshots(query=query, limit=limit)
            if not result.get("ok"):
                fail_batch(batch, status.HTTP_400_BAD_REQUEST, {"detail": result.get("detail", "Import failed")})
                return Response({"detail": result.get("detail", "Import failed")}, status=status.HTTP_400_BAD_REQUEST)
            complete_batch(batch, status.HTTP_201_CREATED, result)
            return Response(result, status=status.HTTP_201_CREATED)
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


class FicheSnapshotEnvelopeImportView(APIView):
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def post(self, request):
        serializer = FicheSnapshotEnvelopeImportSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        envelope = serializer.validated_data.get("envelope")
        upload_file = request.FILES.get("file")
        if envelope is None and upload_file is not None:
            try:
                envelope = json.loads(upload_file.read().decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return Response({"detail": "Invalid JSON file."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(envelope, dict):
            return Response({"detail": "Provide 'envelope' JSON or upload 'file'."}, status=status.HTTP_400_BAD_REQUEST)

        exported_at = str(envelope.get("exported_at") or "").strip()
        fiches_count = len(envelope.get("fiches") or []) if isinstance(envelope.get("fiches"), list) else 0
        idempotency_key = (
            serializer.validated_data.get("idempotency_key")
            or request.headers.get("Idempotency-Key", "")
            or f"fiches-snapshots-envelope:{exported_at}:{fiches_count}"
        )

        existing = find_completed_batch("fiches", "recipe_snapshot_envelope", idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(
            "fiches",
            "recipe_snapshot_envelope",
            idempotency_key,
            {"exported_at": exported_at, "fiches_count": fiches_count},
        )
        try:
            result = import_recipe_snapshots_from_v11_envelope(envelope)
            if not result.get("ok"):
                fail_batch(batch, status.HTTP_400_BAD_REQUEST, {"detail": result.get("detail", "Import failed")})
                return Response({"detail": result.get("detail", "Import failed")}, status=status.HTTP_400_BAD_REQUEST)
            complete_batch(batch, status.HTTP_201_CREATED, result)
            return Response(result, status=status.HTTP_201_CREATED)
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


class FicheCatalogImportView(APIView):
    def post(self, request):
        serializer = FicheCatalogImportSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        idempotency_key = (
            serializer.validated_data.get("idempotency_key")
            or request.headers.get("Idempotency-Key", "")
            or "fiches-catalog"
        )
        existing = find_completed_batch("fiches", "supplier_catalog", idempotency_key)
        if existing:
            result = existing.result or {}
            return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(
            "fiches",
            "supplier_catalog",
            idempotency_key,
            {},
        )
        try:
            result = import_supplier_catalog_from_fiches()
            if not result.get("ok"):
                fail_batch(batch, status.HTTP_400_BAD_REQUEST, {"detail": result.get("detail", "Import failed")})
                return Response({"detail": result.get("detail", "Import failed")}, status=status.HTTP_400_BAD_REQUEST)
            complete_batch(batch, status.HTTP_201_CREATED, result)
            return Response(result, status=status.HTTP_201_CREATED)
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise
