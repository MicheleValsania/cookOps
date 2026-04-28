from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
import json
import re
import uuid
from datetime import datetime, time, timezone as dt_timezone
from decimal import Decimal, InvalidOperation

from django.http import Http404, HttpResponse
from django.db import IntegrityError
from django.utils import timezone as dj_timezone
from django.utils.dateparse import parse_date, parse_datetime

from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Supplier, SupplierProduct
from apps.core.models import Site
from apps.integration.api.v1.serializers import (
    ClaudeExtractSerializer,
    DocumentReviewSerializer,
    DriveAssetImportSerializer,
    DocumentExtractionSerializer,
    ExtractionIngestSerializer,
    FicheCatalogImportSerializer,
    FicheSnapshotEnvelopeImportSerializer,
    FicheSnapshotImportSerializer,
    IntegrationDocumentSerializer,
    TraceabilityReconciliationDecisionSerializer,
    TracciaAssetImportSerializer,
)
from apps.integration.fiches_catalog import import_supplier_catalog_from_fiches
from apps.integration.fiches_snapshots import import_recipe_snapshots, import_recipe_snapshots_from_v11_envelope
from apps.integration.fiches_titles import fetch_recipe_titles
from apps.integration.import_batches import complete_batch, fail_batch, find_completed_batch, start_batch
from apps.integration.models import (
    DocumentExtraction,
    DocumentSource,
    DocumentStatus,
    DocumentType,
    IntegrationDocument,
    TraceabilityReconciliationDecision,
)
from apps.integration.services.claude_extractor import run_claude_extraction
from apps.integration.services.document_storage import delete_document_binary, drive_storage_enabled, persist_document_binary, read_document_bytes
from apps.integration.services.drive_client import DriveClient, DriveClientError
from apps.integration.services.drive_importer import import_drive_assets_for_site
from apps.integration.services.traccia_client import TracciaClient, TracciaClientError
from apps.inventory.models import InventoryMovement, Lot, LotStatus, MovementType, SourceType
from apps.purchasing.api.v1.serializers import GoodsReceiptSerializer, InvoiceSerializer
from apps.purchasing.models import GoodsReceipt, Invoice
from apps.purchasing.services.reconciliation_auto_match import auto_match_invoice_lines

PACKAGING_PREFIX_RE = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl)\b", re.IGNORECASE)


def _as_dict(value):
    return value if isinstance(value, dict) else {}


def _as_list(value):
    return value if isinstance(value, list) else []

def _safe_uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except Exception:
        return None


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


def _document_type_from_traccia_asset(asset_type: str) -> str:
    normalized = str(asset_type or "").strip().upper()
    if normalized == "INVOICE":
        return DocumentType.INVOICE
    if normalized == "DELIVERY_NOTE":
        return DocumentType.GOODS_RECEIPT
    return DocumentType.LABEL_CAPTURE


def _document_exists_for_drive_file(site: Site, drive_file_id: str) -> bool:
    return IntegrationDocument.objects.filter(
        site=site,
        source=DocumentSource.DRIVE,
        metadata__drive_file_id=drive_file_id,
    ).exists()


def _create_drive_document(*, site: Site, document_type: str, filename: str, content_type: str, binary: bytes, metadata: dict):
    document = IntegrationDocument.objects.create(
        site=site,
        document_type=document_type,
        source=DocumentSource.DRIVE,
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
            parsed_dt = parsed_dt.replace(tzinfo=dt_timezone.utc)
        return parsed_dt.isoformat().replace("+00:00", "Z")
    parsed_date = parse_date(raw)
    if parsed_date:
        return datetime.combine(parsed_date, time.min, tzinfo=dt_timezone.utc).isoformat().replace("+00:00", "Z")
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            parsed = datetime.strptime(raw, fmt).date()
            return datetime.combine(parsed, time.min, tzinfo=dt_timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    return None


def _normalize_product_category(value):
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    compact = "".join(ch for ch in raw if ch.isalnum())
    aliases = {
        "epicerie": "epicerie",
        "viande": "viande",
        "viandes": "viande",
        "poisson": "poissons",
        "poissons": "poissons",
        "legume": "legumes",
        "legumes": "legumes",
        "légume": "legumes",
        "légumes": "legumes",
        "bof": "bof",
        "beurreoeufsfromages": "bof",
        "beurreoeuffromage": "bof",
        "surgele": "surgeles",
        "surgeles": "surgeles",
        "surgelé": "surgeles",
        "surgelés": "surgeles",
        "boisson": "boissons",
        "boissons": "boissons",
        "entretien": "entretien",
        "emballage": "emballages",
        "emballages": "emballages",
    }
    return aliases.get(compact)


def _infer_packaging_from_name(raw_name: str):
    match = PACKAGING_PREFIX_RE.match(str(raw_name or "").strip())
    if not match:
        return None, None
    qty_raw, unit_raw = match.groups()
    qty_text = _normalize_decimal_text(qty_raw, places=3)
    unit = _normalize_unit(unit_raw)
    return qty_text, unit


def _preferred_uom_from_history(*, product: SupplierProduct | None, supplier_id: str | None, supplier_code: str, raw_name: str):
    if product and str(product.uom or "").strip():
        return str(product.uom).strip().lower()

    supplier_uuid = _safe_uuid(supplier_id)
    if not supplier_uuid:
        return None

    rules = _supplier_code_rules(supplier_id)
    normalized_code = _normalize_supplier_code(supplier_code, rules)

    if normalized_code:
        code_products = SupplierProduct.objects.filter(supplier_id=supplier_uuid).exclude(supplier_sku__isnull=True)
        for candidate in code_products:
            candidate_code = _normalize_supplier_code(str(candidate.supplier_sku or "").strip(), rules)
            if candidate_code == normalized_code and str(candidate.uom or "").strip():
                return str(candidate.uom).strip().lower()

    if raw_name:
        named_product = SupplierProduct.objects.filter(supplier_id=supplier_uuid, name__iexact=raw_name).first()
        if named_product and str(named_product.uom or "").strip():
            return str(named_product.uom).strip().lower()
    return None


def _canonicalize_line_with_product(line_obj, product: SupplierProduct | None, raw_name: str, category: str | None = None):
    inferred_pack_qty, inferred_uom = _infer_packaging_from_name(raw_name)
    update_fields: list[str] = []

    if product:
        product_update_fields: list[str] = []
        canonical_uom = str(product.uom or "").strip().lower() or None
        current_pack_qty = Decimal(str(product.pack_qty)) if product.pack_qty is not None else None
        product_metadata = product.metadata.copy() if isinstance(product.metadata, dict) else {}
        effective_category = str(category or product.category or "").strip().lower()
        variable_categories = {"viande", "poissons", "legumes"}
        is_standard_pack = inferred_pack_qty is not None and effective_category not in variable_categories

        if inferred_pack_qty is not None:
            inferred_pack_decimal = Decimal(str(inferred_pack_qty))
            if current_pack_qty != inferred_pack_decimal:
                product.pack_qty = inferred_pack_decimal
                current_pack_qty = inferred_pack_decimal
                product_update_fields.append("pack_qty")
            if inferred_uom and product_metadata.get("pack_uom") != inferred_uom:
                product_metadata["pack_uom"] = inferred_uom
                product.metadata = product_metadata
                product_update_fields.append("metadata")

        if is_standard_pack:
            if canonical_uom != "pc":
                product.uom = "pc"
                canonical_uom = "pc"
                product_update_fields.append("uom")
            line_unit = str(line_obj.qty_unit or "").strip().lower()
            pack_uom = str(product_metadata.get("pack_uom") or inferred_uom or "").strip().lower() or None
            line_qty = Decimal(str(line_obj.qty_value or "0"))
            if pack_uom and current_pack_qty is not None and line_unit == pack_uom and current_pack_qty:
                converted = line_qty / current_pack_qty
                if converted == converted.quantize(Decimal("1.000")):
                    line_obj.qty_value = converted.quantize(Decimal("1.000"))
                    line_obj.qty_unit = "pc"
                    update_fields.extend(["qty_value", "qty_unit"])
        else:
            if inferred_uom and not canonical_uom:
                product.uom = inferred_uom
                canonical_uom = inferred_uom
                product_update_fields.append("uom")
            if canonical_uom and canonical_uom != "pc" and str(line_obj.qty_unit or "").strip().lower() == "pc" and current_pack_qty is not None:
                line_obj.qty_value = Decimal(str(line_obj.qty_value or "0")) * current_pack_qty
                line_obj.qty_unit = canonical_uom
                update_fields.extend(["qty_value", "qty_unit"])

        deduped = []
        for field in product_update_fields:
            if field not in deduped:
                deduped.append(field)
        if deduped:
            product.save(update_fields=deduped + ["updated_at"])

    if update_fields:
        line_obj.save(update_fields=update_fields + ["updated_at"])


def _normalize_lines(lines, target: str):
    normalized = []
    for raw in _as_list(lines):
        line = _as_dict(raw)
        line_category = _normalize_product_category(_pick_first(line, "product_category", "category", "product_category_label"))
        supplier_code = _pick_first(line, "supplier_code", "supplier_sku", "code", "sku", "article_code")
        row = {
            # Never trust supplier_product ids coming from OCR/extracted payloads.
            # We only re-attach a catalog product later from the supplier_code.
            "supplier_product": None,
            "supplier_code": supplier_code,
            "raw_product_name": _pick_first(
                line, "raw_product_name", "description", "name", "product_name", "ingredient"
            ),
            "product_category": line_category,
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
            if row["product_category"] == "":
                row["product_category"] = None
            cleaned = {k: v for k, v in row.items() if v not in (None, "")}
            normalized.append(cleaned)
    return normalized


def _apply_supplier_product_categories(lines, supplier_id: str | None):
    if not supplier_id or not lines:
        return
    supplier_ids = []
    try:
        supplier_ids.append(uuid.UUID(str(supplier_id)))
    except Exception:
        return
    rules = _supplier_code_rules(supplier_id)
    codes = {
        _normalize_supplier_code(str(line.get("supplier_code") or "").strip(), rules)
        for line in lines
        if isinstance(line, dict) and str(line.get("supplier_code") or "").strip()
    }
    codes = {code for code in codes if code}
    if not codes:
        return
    products = SupplierProduct.objects.filter(supplier_id__in=supplier_ids)
    by_code = {
        _normalize_supplier_code(str(p.supplier_sku or "").strip(), rules): p
        for p in products
        if _normalize_supplier_code(str(p.supplier_sku or "").strip(), rules) in codes
    }
    for line in lines:
        if not isinstance(line, dict):
            continue
        if line.get("product_category"):
            continue
        code = _normalize_supplier_code(str(line.get("supplier_code") or "").strip(), rules)
        if not code:
            continue
        product = by_code.get(code)
        if not product or not product.category:
            continue
        line["product_category"] = product.category


def _supplier_code_rules(supplier_id: str | None):
    if not supplier_id:
        return {}
    supplier_uuid = _safe_uuid(supplier_id)
    if not supplier_uuid:
        return {}
    supplier = Supplier.objects.filter(id=supplier_uuid).only("metadata").first()
    if not supplier or not isinstance(supplier.metadata, dict):
        return {}
    rules = supplier.metadata.get("integration_rules")
    return rules if isinstance(rules, dict) else {}


def _apply_supplier_product_refs(lines, supplier_id: str | None):
    if not lines:
        return
    if not supplier_id:
        for line in lines:
            if isinstance(line, dict):
                line.pop("supplier_product", None)
        return
    supplier_uuid = _safe_uuid(supplier_id)
    if not supplier_uuid:
        for line in lines:
            if isinstance(line, dict):
                line.pop("supplier_product", None)
        return
    rules = _supplier_code_rules(supplier_id)
    codes = {
        _normalize_supplier_code(str(line.get("supplier_code") or "").strip(), rules)
        for line in lines
        if isinstance(line, dict) and str(line.get("supplier_code") or "").strip()
    }
    codes = {code for code in codes if code}
    product_ids = {
        _safe_uuid(line.get("supplier_product"))
        for line in lines
        if isinstance(line, dict) and line.get("supplier_product")
    }
    product_ids = {pid for pid in product_ids if pid}
    products = SupplierProduct.objects.filter(supplier_id=supplier_uuid)
    if codes:
        products = products.filter(supplier_sku__in=list(codes))
    by_code = {_normalize_supplier_code(str(p.supplier_sku or ""), rules): p for p in products}
    for line in lines:
        if not isinstance(line, dict):
            continue
        code = _normalize_supplier_code(str(line.get("supplier_code") or "").strip(), rules)
        if not code:
            line.pop("supplier_product", None)
            continue
        product = by_code.get(code)
        if product:
            line["supplier_product"] = str(product.id)
            continue
        line.pop("supplier_product", None)


def _resolve_supplier_product_by_line(*, supplier_id: str | None, supplier_code: str, raw_name: str, qty_unit: str | None):
    if not supplier_id:
        return None
    supplier_uuid = _safe_uuid(supplier_id)
    if not supplier_uuid:
        return None
    rules = _supplier_code_rules(supplier_id)
    normalized_code = _normalize_supplier_code(supplier_code, rules)
    if normalized_code:
        products = SupplierProduct.objects.filter(supplier_id=supplier_uuid)
        for product in products:
            product_code = _normalize_supplier_code(str(product.supplier_sku or "").strip(), rules)
            if product_code == normalized_code:
                return product
    if raw_name:
        product = SupplierProduct.objects.filter(supplier_id=supplier_uuid, name__iexact=raw_name).first()
        if product:
            return product
    return None


def _is_unique_constraint_duplicate(exc: ValidationError) -> bool:
    field_errors = exc.detail if isinstance(exc.detail, dict) else {}
    non_field = field_errors.get("non_field_errors") if isinstance(field_errors, dict) else None
    if not non_field:
        return False
    message = " ".join([str(item) for item in non_field]) if isinstance(non_field, list) else str(non_field)
    return "must make a unique set" in message


def _mark_document_duplicate(
    document: IntegrationDocument,
    *,
    target: str,
    duplicate_record_id: str,
    duplicate_key: str,
    flow_summary: dict,
    reason: str,
):
    metadata = document.metadata if isinstance(document.metadata, dict) else {}
    metadata["duplicate"] = {
        "target": target,
        "duplicate_of": duplicate_record_id,
        "duplicate_key": duplicate_key,
        "reason": reason,
    }
    metadata["ingest"] = {
        "status": "completed",
        "target": target,
        "record_id": duplicate_record_id,
        "duplicate_of": duplicate_record_id,
        "duplicate_key": duplicate_key,
        "duplicate_reason": reason,
        "at": datetime.now(dt_timezone.utc).isoformat().replace("+00:00", "Z"),
        **flow_summary,
    }
    document.metadata = metadata
    document.status = DocumentStatus.ARCHIVED_DUPLICATE
    document.save(update_fields=["metadata", "status", "updated_at"])


def _payload_suggests_credit_note(payload: dict, document: IntegrationDocument | None = None) -> bool:
    metadata = _as_dict(payload.get("metadata"))
    explicit_kind = str(metadata.get("document_kind") or payload.get("document_kind") or "").strip().lower()
    if explicit_kind in {"credit_note", "avoir"}:
        return True

    textual_hints = [
        payload.get("document_type_label"),
        payload.get("document_label"),
        payload.get("document_number"),
        payload.get("invoice_number"),
        payload.get("supplier_name"),
    ]
    if document is not None:
        textual_hints.extend([document.filename, document.storage_path])
    blob = " ".join(str(item or "").strip().lower() for item in textual_hints if item not in (None, ""))
    if "avoir" in blob or "credit note" in blob or "credit_note" in blob:
        return True

    amount_candidates = [
        _pick_first(payload, "total_amount", default=metadata.get("total_amount")),
        _pick_first(payload, "total_ht", default=metadata.get("total_ht")),
        _pick_first(payload, "vat_amount", default=metadata.get("vat_amount")),
    ]
    for value in amount_candidates:
        normalized = _normalize_decimal_text(value, places=2)
        if normalized is None:
            continue
        try:
            if Decimal(normalized) < 0:
                return True
        except (InvalidOperation, ValueError):
            continue

    line_signs = []
    for row in _as_list(payload.get("lines")):
        line = _as_dict(row)
        qty_value = _normalize_decimal_text(_pick_first(line, "qty_value", "quantity", "qty", "qte", "qta"), places=3)
        line_total = _normalize_decimal_text(_pick_first(line, "line_total", "total", "line_amount", "montant_ligne"), places=4)
        for candidate in (qty_value, line_total):
            if candidate is None:
                continue
            try:
                line_signs.append(Decimal(candidate))
            except (InvalidOperation, ValueError):
                continue

    return bool(line_signs) and all(value < 0 for value in line_signs)


def _infer_document_kind(payload: dict, target: str, document: IntegrationDocument | None = None) -> str:
    if target == "invoice" and _payload_suggests_credit_note(payload, document):
        return "credit_note"
    return target


def _build_metadata(payload: dict, target: str, document: IntegrationDocument | None = None):
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
    metadata["document_kind"] = _infer_document_kind(payload, target, document)
    return metadata


def _normalize_invoice_number(value):
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def _normalize_name_key(value):
    return " ".join(str(value or "").strip().upper().split())


def _invoice_line_signature_from_payload(lines):
    signature = []
    for row in _as_list(lines):
        supplier_code = _normalize_supplier_code(row.get("supplier_code"))
        raw_name = _normalize_name_key(row.get("raw_product_name") or row.get("description") or row.get("product_name"))
        qty_value = _normalize_decimal_text(row.get("qty_value") or row.get("quantity"))
        qty_unit = _normalize_unit(row.get("qty_unit") or row.get("unit")) or ""
        unit_price = _normalize_decimal_text(row.get("unit_price") or row.get("price"), places=4)
        line_total = _normalize_decimal_text(row.get("line_total") or row.get("total"), places=2)
        signature.append((supplier_code, raw_name, qty_value or "", qty_unit, unit_price or "", line_total or ""))
    return tuple(sorted(signature))


def _invoice_line_signature_from_instance(invoice: Invoice):
    signature = []
    for line in invoice.lines.all():
        signature.append((
            _normalize_supplier_code(line.supplier_code),
            _normalize_name_key(line.raw_product_name),
            _normalize_decimal_text(line.qty_value),
            _normalize_unit(line.qty_unit) or "",
            _normalize_decimal_text(line.unit_price, places=4),
            "",
        ))
    return tuple(sorted(signature))


def _invoice_amount_tokens(payload: dict):
    metadata = _as_dict(payload.get("metadata"))
    return {
        "total_amount": _normalize_decimal_text(_pick_first(payload, "total_amount", default=metadata.get("total_amount")), places=2),
        "total_ht": _normalize_decimal_text(_pick_first(payload, "total_ht", default=metadata.get("total_ht")), places=2),
        "vat_amount": _normalize_decimal_text(_pick_first(payload, "vat_amount", default=metadata.get("vat_amount")), places=2),
    }


def _invoice_amount_tokens_from_instance(invoice: Invoice):
    metadata = _as_dict(invoice.metadata)
    return {
        "total_amount": _normalize_decimal_text(metadata.get("total_amount"), places=2),
        "total_ht": _normalize_decimal_text(metadata.get("total_ht"), places=2),
        "vat_amount": _normalize_decimal_text(metadata.get("vat_amount"), places=2),
    }


def _find_existing_invoice_duplicate(*, document: IntegrationDocument, payload: dict):
    site_id = str(payload.get("site") or "").strip()
    supplier_id = str(payload.get("supplier") or "").strip()
    invoice_number = str(payload.get("invoice_number") or "").strip()
    if not site_id or not supplier_id:
        return None, None

    file_sha = str(_as_dict(document.metadata).get("file_sha256") or "").strip()
    if file_sha:
        existing_document = (
            IntegrationDocument.objects.filter(
                site_id=site_id,
                document_type=DocumentType.INVOICE,
                metadata__file_sha256=file_sha,
            )
            .exclude(pk=document.pk)
            .order_by("-created_at")
            .first()
        )
        if existing_document:
            ingest = _as_dict(_as_dict(existing_document.metadata).get("ingest"))
            existing_record_id = str(ingest.get("record_id") or "").strip()
            if existing_record_id:
                existing_invoice = Invoice.objects.prefetch_related("lines").filter(pk=existing_record_id).first()
                if existing_invoice:
                    return existing_invoice, "invoice_file_sha256"

    if invoice_number:
        normalized_invoice_number = _normalize_invoice_number(invoice_number)
        invoice_date = _normalize_date_text(payload.get("invoice_date"))
        amount_tokens = _invoice_amount_tokens(payload)
        candidates = Invoice.objects.prefetch_related("lines").filter(site_id=site_id, supplier_id=supplier_id)
        for candidate in candidates:
            if _normalize_invoice_number(candidate.invoice_number) == normalized_invoice_number:
                candidate_tokens = _invoice_amount_tokens_from_instance(candidate)
                shared_amount = any(
                    amount_tokens.get(key) and amount_tokens.get(key) == candidate_tokens.get(key)
                    for key in ("total_amount", "total_ht", "vat_amount")
                )
                same_date = bool(invoice_date and str(candidate.invoice_date) == invoice_date)
                if same_date or shared_amount:
                    return candidate, "invoice_number_normalized"

    invoice_date = _normalize_date_text(payload.get("invoice_date"))
    line_signature = _invoice_line_signature_from_payload(payload.get("lines") or [])
    amount_tokens = _invoice_amount_tokens(payload)
    if not invoice_date or not line_signature:
        return None, None

    candidates = Invoice.objects.prefetch_related("lines").filter(site_id=site_id, supplier_id=supplier_id, invoice_date=invoice_date)
    for candidate in candidates:
        candidate_tokens = _invoice_amount_tokens_from_instance(candidate)
        shared_amount = any(
            amount_tokens.get(key) and amount_tokens.get(key) == candidate_tokens.get(key)
            for key in ("total_amount", "total_ht", "vat_amount")
        )
        if not shared_amount:
            continue
        if _invoice_line_signature_from_instance(candidate) == line_signature:
            continue

    return None, None


def _clean_vat(value):
    if value is None:
        return ""
    return "".join(ch for ch in str(value).upper() if ch.isalnum())


def _normalize_supplier_code(value, rules: dict | None = None):
    if not value:
        return ""
    raw = "".join(ch for ch in str(value).upper() if ch.isalnum())
    prefixes = rules.get("strip_supplier_code_prefixes") if isinstance(rules, dict) else None
    if isinstance(prefixes, list):
        for prefix in prefixes:
            prefix_raw = "".join(ch for ch in str(prefix).upper() if ch.isalnum())
            if prefix_raw and raw.startswith(prefix_raw):
                trimmed = raw[len(prefix_raw):]
                if trimmed:
                    raw = trimmed
                break
    return raw


def _resolve_supplier_id(source: dict, supplier_id):
    if supplier_id:
        return supplier_id

    metadata = _as_dict(source.get("metadata"))
    supplier_name = str(_pick_first(source, "supplier_name", default=metadata.get("supplier_name")) or "").strip()
    supplier_vat_raw = _pick_first(source, "supplier_vat", default=metadata.get("supplier_vat"))
    supplier_vat = _clean_vat(supplier_vat_raw)

    if supplier_vat:
        for candidate in Supplier.objects.exclude(vat_number__isnull=True).exclude(vat_number=""):
            if _clean_vat(candidate.vat_number) == supplier_vat:
                return str(candidate.id)

    if supplier_name:
        existing = Supplier.objects.filter(name__iexact=supplier_name).first()
        if existing:
            if supplier_vat and not existing.vat_number:
                existing.vat_number = supplier_vat
                existing.save(update_fields=["vat_number", "updated_at"])
            return str(existing.id)

        try:
            created = Supplier.objects.create(
                name=supplier_name[:255],
                vat_number=(supplier_vat or None),
                metadata={"source": "claude_auto"},
            )
            return str(created.id)
        except IntegrityError:
            fallback = Supplier.objects.filter(name__iexact=supplier_name[:255]).first()
            if fallback:
                return str(fallback.id)

    return None


def _normalize_payload_for_ingest(payload: dict, target: str, document: IntegrationDocument):
    source = _as_dict(payload)
    site_id = _pick_first(source, "site", default=str(document.site_id))
    supplier_id = _resolve_supplier_id(source, _pick_first(source, "supplier"))
    lines = _normalize_lines(source.get("lines"), target)
    _apply_supplier_product_refs(lines, supplier_id)

    if target == "goods_receipt":
        delivery_note_number = _pick_first(source, "delivery_note_number", "document_number", "invoice_number")
        if not delivery_note_number:
            delivery_note_number = f"BL-{str(document.id)[:8]}"
        received_at = _normalize_datetime_text(_pick_first(source, "received_at", "document_date", "invoice_date"))
        if not received_at:
            received_at = datetime.now(dt_timezone.utc).isoformat().replace("+00:00", "Z")
        return {
            "site": site_id,
            "supplier": supplier_id,
            "delivery_note_number": str(delivery_note_number),
            "received_at": received_at,
            "metadata": _build_metadata(source, target, document),
            "lines": lines,
        }

    invoice_number = _pick_first(source, "invoice_number", "document_number", "delivery_note_number")
    if not invoice_number:
        invoice_number = f"INV-{str(document.id)[:8]}"
    invoice_date = _normalize_date_text(_pick_first(source, "invoice_date", "document_date", "received_at"))
    if not invoice_date:
        invoice_date = datetime.now(dt_timezone.utc).date().isoformat()
    due_date = _normalize_date_text(_pick_first(source, "due_date", "payment_due_date"))
    normalized = {
        "site": site_id,
        "supplier": supplier_id,
        "invoice_number": str(invoice_number),
        "invoice_date": invoice_date,
        "metadata": _build_metadata(source, target, document),
        "lines": lines,
    }
    if due_date:
        normalized["due_date"] = due_date
    return normalized


def _ensure_goods_receipt_stock_movements(receipt: GoodsReceipt):
    created = 0
    for line in receipt.lines.all():
        ref_id = str(line.id)
        if InventoryMovement.objects.filter(ref_type="goods_receipt_line", ref_id=ref_id).exists():
            continue
        InventoryMovement.objects.create(
            site=receipt.site,
            lot=None,
            supplier_product=line.supplier_product,
            supplier_code=line.supplier_code,
            raw_product_name=line.raw_product_name,
            movement_type=MovementType.IN,
            qty_value=line.qty_value,
            qty_unit=line.qty_unit,
            happened_at=receipt.received_at,
            ref_type="goods_receipt_line",
            ref_id=ref_id,
        )
        created += 1
    return {
        "flow_type": "delivery_note_to_stock",
        "created_stock_movements": created,
        "matched_invoice_lines": 0,
        "fallback_invoice_lines": 0,
    }


def _ensure_invoice_fallback_movements(invoice: Invoice):
    outcome = auto_match_invoice_lines(invoice, qty_tolerance_ratio=Decimal("0.0500"))
    created = 0
    negative_lines = 0
    for line in invoice.lines.all():
        if line.goods_receipt_line_id:
            continue
        ref_id = str(line.id)
        if InventoryMovement.objects.filter(ref_type="invoice_line_fallback", ref_id=ref_id).exists():
            continue
        happened_at = datetime.combine(invoice.invoice_date, time.min, tzinfo=dt_timezone.utc)
        movement_type = MovementType.OUT if line.qty_value < 0 else MovementType.IN
        if movement_type == MovementType.OUT:
            negative_lines += 1
        InventoryMovement.objects.create(
            site=invoice.site,
            lot=None,
            supplier_product=line.supplier_product,
            supplier_code=line.supplier_code,
            raw_product_name=line.raw_product_name,
            movement_type=movement_type,
            qty_value=abs(line.qty_value),
            qty_unit=line.qty_unit,
            happened_at=happened_at,
            ref_type="invoice_line_fallback",
            ref_id=ref_id,
        )
        created += 1
    if negative_lines and negative_lines == created:
        flow_type = "credit_note_direct_to_stock"
    elif negative_lines:
        flow_type = "invoice_mixed_adjustment"
    else:
        flow_type = "invoice_after_delivery_note" if outcome.created_matches > 0 else "invoice_direct_to_stock"
    return {
        "flow_type": flow_type,
        "created_stock_movements": created,
        "matched_invoice_lines": outcome.created_matches,
        "fallback_invoice_lines": created,
    }


def _delete_linked_ingest_record(instance: IntegrationDocument):
    metadata = _as_dict(instance.metadata)
    ingest = _as_dict(metadata.get("ingest"))
    target = str(ingest.get("target") or "").strip()
    record_id = str(ingest.get("record_id") or "").strip()
    if not target or not record_id:
        return

    if target == "invoice":
        invoice = Invoice.objects.prefetch_related("lines").filter(pk=record_id).first()
        if not invoice:
            return
        line_ids = [str(line.id) for line in invoice.lines.all()]
        if line_ids:
            InventoryMovement.objects.filter(ref_type="invoice_line_fallback", ref_id__in=line_ids).delete()
        invoice.delete()
        return

    if target == "goods_receipt":
        receipt = GoodsReceipt.objects.prefetch_related("lines").filter(pk=record_id).first()
        if not receipt:
            return
        line_ids = [str(line.id) for line in receipt.lines.all()]
        if line_ids:
            InventoryMovement.objects.filter(ref_type="goods_receipt_line", ref_id__in=line_ids).delete()
        receipt.delete()


def _sync_traceability_lot_allocation(decision: TraceabilityReconciliationDecision):
    _delete_traceability_lot_allocation(decision.event_id)
    if decision.decision_status != "matched":
        return

    metadata = _as_dict(decision.metadata)
    source_document_id = str(metadata.get("source_document_id") or "").strip()
    if not source_document_id:
        return
    source_document = IntegrationDocument.objects.filter(pk=source_document_id, site=decision.site).first()
    if not source_document:
        return
    extraction = source_document.extractions.order_by("-created_at").first()
    payload = _as_dict(extraction.normalized_payload if extraction else {})
    if not payload:
        return

    qty_text = _normalize_decimal_text(metadata.get("allocated_qty") or payload.get("weight_value") or payload.get("quantity"))
    qty_unit = _normalize_unit(metadata.get("allocated_unit") or payload.get("weight_unit") or payload.get("unit"))
    if not qty_text or not qty_unit:
        return

    internal_lot_code = str(
        metadata.get("internal_lot_code")
        or payload.get("origin_lot_code")
        or payload.get("source_lot_code")
        or payload.get("supplier_lot_code")
        or f"AUTO-{decision.event_id[-8:]}"
    ).strip()
    supplier_lot_code = str(
        metadata.get("supplier_lot_code")
        or payload.get("supplier_lot_code")
        or payload.get("lot_code")
        or ""
    ).strip() or None
    production_date = _normalize_date_text(metadata.get("production_date") or payload.get("production_date"))
    dlc_date = _normalize_date_text(metadata.get("dlc_date") or payload.get("dlc_date") or payload.get("expiry_date"))
    product_label = str(metadata.get("product_label") or payload.get("product_guess") or payload.get("product_name") or source_document.filename).strip()
    supplier_code = str(metadata.get("supplier_code") or payload.get("supplier_code") or "").strip() or None
    happened_at = _normalize_datetime_text(metadata.get("happened_at")) or dj_timezone.now().isoformat().replace("+00:00", "Z")

    lot, _created = Lot.objects.get_or_create(
        site=decision.site,
        internal_lot_code=internal_lot_code,
        defaults={
            "source_type": SourceType.SUPPLIER_PRODUCT,
            "supplier_lot_code": supplier_lot_code,
            "production_date": production_date,
            "dlc_date": dlc_date,
            "qty_value": Decimal(qty_text),
            "qty_unit": qty_unit,
            "status": LotStatus.ACTIVE,
            "metadata": {
                "source": "traceability_reconciliation",
                "source_document_id": str(source_document.id),
            },
        },
    )
    lot_changed = False
    if supplier_lot_code and lot.supplier_lot_code != supplier_lot_code:
        lot.supplier_lot_code = supplier_lot_code
        lot_changed = True
    if production_date and str(lot.production_date or "") != str(production_date):
        lot.production_date = production_date
        lot_changed = True
    if dlc_date and str(lot.dlc_date or "") != str(dlc_date):
        lot.dlc_date = dlc_date
        lot_changed = True
    if lot.qty_unit != qty_unit:
        lot.qty_unit = qty_unit
        lot_changed = True

    InventoryMovement.objects.create(
        site=decision.site,
        lot=lot,
        supplier_product=None,
        supplier_code=supplier_code,
        raw_product_name=product_label,
        movement_type=MovementType.IN,
        qty_value=Decimal(qty_text),
        qty_unit=qty_unit,
        happened_at=parse_datetime(happened_at) or dj_timezone.now(),
        ref_type="traceability_label_allocation",
        ref_id=decision.event_id,
    )

    current_qty = Decimal("0")
    for movement in lot.movements.all():
        movement_qty = Decimal(str(movement.qty_value or "0"))
        if movement.movement_type == MovementType.OUT:
            current_qty -= movement_qty
        else:
            current_qty += movement_qty
    if lot.qty_value != current_qty:
        lot.qty_value = current_qty
        lot_changed = True
    if lot_changed:
        lot.save(update_fields=["supplier_lot_code", "production_date", "dlc_date", "qty_value", "qty_unit"])


def _delete_traceability_lot_allocation(event_id: str):
    movements = list(InventoryMovement.objects.select_related("lot").filter(ref_type="traceability_label_allocation", ref_id=event_id))
    impacted_lots = [movement.lot for movement in movements if movement.lot_id]
    if movements:
        InventoryMovement.objects.filter(id__in=[movement.id for movement in movements]).delete()
    for lot in impacted_lots:
        if not lot:
            continue
        current_qty = Decimal("0")
        for movement in lot.movements.all():
            movement_qty = Decimal(str(movement.qty_value or "0"))
            if movement.movement_type == MovementType.OUT:
                current_qty -= movement_qty
            else:
                current_qty += movement_qty
        if lot.qty_value != current_qty:
            lot.qty_value = current_qty
            lot.save(update_fields=["qty_value"])


class IntegrationDocumentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = IntegrationDocument.objects.all()
    serializer_class = IntegrationDocumentSerializer
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        queryset = super().get_queryset()
        site_id = (self.request.query_params.get("site") or "").strip()
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        return queryset.order_by("-updated_at", "-created_at")

    def perform_create(self, serializer):
        instance = serializer.save()
        if not drive_storage_enabled():
            return
        metadata = instance.metadata.copy() if isinstance(instance.metadata, dict) else {}
        if metadata.get("storage_drive_file_id"):
            return
        if not instance.file:
            return
        instance.file.open("rb")
        try:
            binary = instance.file.read()
        finally:
            instance.file.close()
        persist_document_binary(
            document=instance,
            filename=instance.filename,
            content_type=instance.content_type or "application/octet-stream",
            binary=binary,
        )

    def perform_destroy(self, instance: IntegrationDocument):
        _delete_linked_ingest_record(instance)
        delete_document_binary(instance)
        instance.delete()


class DocumentFileView(APIView):
    def get(self, request, document_id):
        document = get_object_or_404(IntegrationDocument, pk=document_id)
        file_bytes, content_type = read_document_bytes(document)
        if not file_bytes:
            raise Http404("Document binary is not available.")
        response = HttpResponse(file_bytes, content_type=content_type or "application/octet-stream")
        response["Content-Disposition"] = f'inline; filename="{document.filename}"'
        return response


class TracciaAssetImportView(APIView):
    def post(self, request):
        serializer = TracciaAssetImportSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        site = get_object_or_404(Site, pk=serializer.validated_data["site"])
        limit = serializer.validated_data["limit"]
        asset_type = serializer.validated_data["asset_type"]
        idempotency_key = (
            serializer.validated_data.get("idempotency_key")
            or request.headers.get("Idempotency-Key", "")
        )

        if idempotency_key:
            existing = find_completed_batch("traccia", "asset_import", idempotency_key)
            if existing:
                result = existing.result or {}
                return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(
            "traccia",
            "asset_import",
            idempotency_key,
            {"site": str(site.id), "asset_type": asset_type, "limit": limit},
        )

        try:
            client = TracciaClient()
            _status_code, payload = client.request_json(
                "GET",
                "/api/v1/haccp/assets/",
                params={"site": str(site.id), "asset_type": asset_type, "limit": limit},
            )
            rows = payload.get("results") if isinstance(payload, dict) else []
            created = []
            skipped_existing = 0
            skipped_invalid = 0
            errors = []

            for row in rows if isinstance(rows, list) else []:
                if not isinstance(row, dict):
                    skipped_invalid += 1
                    continue
                drive_file_id = str(row.get("drive_file_id") or "").strip()
                asset_id = str(row.get("id") or "").strip()
                if not drive_file_id or not asset_id:
                    skipped_invalid += 1
                    continue
                if _document_exists_for_drive_file(site, drive_file_id):
                    skipped_existing += 1
                    continue

                try:
                    _download_status, headers, binary = client.request_bytes(
                        "GET",
                        f"/api/v1/haccp/assets/{asset_id}/download/",
                    )
                    content_type = (headers.get("Content-Type") or row.get("mime_type") or "application/octet-stream").strip()
                    filename = str(row.get("file_name") or f"{asset_id}.bin").strip() or f"{asset_id}.bin"
                    metadata = {
                        "traccia_asset_id": asset_id,
                        "drive_file_id": drive_file_id,
                        "drive_link": row.get("drive_link") or "",
                        "traccia_asset_type": row.get("asset_type") or asset_type,
                        "captured_at": row.get("captured_at"),
                        "uploaded_at": row.get("uploaded_at"),
                        "sha256": row.get("sha256") or "",
                        "mime_type": row.get("mime_type") or content_type,
                        "source_app": "traccia",
                    }
                    document = IntegrationDocument.objects.create(
                        site=site,
                        document_type=_document_type_from_traccia_asset(str(row.get("asset_type") or asset_type)),
                        source=DocumentSource.DRIVE,
                        filename=filename,
                        content_type=content_type,
                        file_size=len(binary),
                        status="uploaded",
                        metadata=metadata,
                    )
                    persist_document_binary(
                        document=document,
                        filename=filename,
                        content_type=content_type,
                        binary=binary,
                    )
                    created.append(
                        {
                            "document_id": str(document.id),
                            "asset_id": asset_id,
                            "drive_file_id": drive_file_id,
                            "filename": filename,
                        }
                    )
                except TracciaClientError as exc:
                    errors.append({"asset_id": asset_id, "detail": exc.payload})

            result = {
                "site": str(site.id),
                "asset_type": asset_type,
                "created_count": len(created),
                "skipped_existing": skipped_existing,
                "skipped_invalid": skipped_invalid,
                "error_count": len(errors),
                "created": created,
                "errors": errors,
            }
            complete_batch(batch, status.HTTP_201_CREATED, result)
            return Response(result, status=status.HTTP_201_CREATED)
        except TracciaClientError as exc:
            fail_batch(batch, exc.status_code, exc.payload)
            return Response(exc.payload, status=exc.status_code)
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


class DriveAssetImportView(APIView):
    def post(self, request):
        serializer = DriveAssetImportSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        site = get_object_or_404(Site, pk=serializer.validated_data["site"])
        limit = serializer.validated_data["limit"]
        folder_id = serializer.validated_data.get("folder_id", "").strip()
        document_type = serializer.validated_data["document_type"]
        idempotency_key = (
            serializer.validated_data.get("idempotency_key")
            or request.headers.get("Idempotency-Key", "")
        )

        if idempotency_key:
            existing = find_completed_batch("drive", "asset_import", idempotency_key)
            if existing:
                result = existing.result or {}
                return Response(result.get("data", {}), status=result.get("status_code", status.HTTP_200_OK))

        batch = start_batch(
            "drive",
            "asset_import",
            idempotency_key,
            {"site": str(site.id), "folder_id": folder_id, "limit": limit, "document_type": document_type},
        )

        try:
            result = import_drive_assets_for_site(
                site=site,
                limit=limit,
                folder_id=folder_id,
                document_type=document_type,
                auto_extract=True,
            ).as_dict()
            complete_batch(batch, status.HTTP_201_CREATED, result)
            return Response(result, status=status.HTTP_201_CREATED)
        except DriveClientError as exc:
            fail_batch(batch, exc.status_code, exc.payload)
            return Response(exc.payload, status=exc.status_code)
        except Exception as exc:
            fail_batch(batch, status.HTTP_500_INTERNAL_SERVER_ERROR, {"detail": str(exc)})
            raise


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
        if target == "invoice":
            existing_duplicate, duplicate_reason = _find_existing_invoice_duplicate(document=document, payload=payload)
            if existing_duplicate:
                flow_summary = _ensure_invoice_fallback_movements(existing_duplicate)
                duplicate_key = f"{payload.get('site')}:{payload.get('supplier')}:{str(payload.get('invoice_number') or '').strip() or duplicate_reason}"
                _mark_document_duplicate(
                    document,
                    target=target,
                    duplicate_record_id=str(existing_duplicate.id),
                    duplicate_key=duplicate_key,
                    flow_summary=flow_summary,
                    reason=duplicate_reason or "invoice_duplicate_detected",
                )
                data = InvoiceSerializer(existing_duplicate).data
                return Response(data, status=status.HTTP_200_OK)
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
            lines = payload.get("lines") or []
            supplier_id = str(payload.get("supplier") or "").strip()
            _apply_supplier_product_categories(lines, supplier_id)
            import_serializer = import_serializer_class(data=payload)
            import_serializer.is_valid(raise_exception=True)
            instance = import_serializer.save()
            created_lines = getattr(instance, "_created_lines", None)
            line_objects = list(created_lines) if created_lines is not None else list(instance.lines.order_by("id"))
            for line_payload, line_obj in zip(lines, line_objects):
                category = str(line_payload.get("product_category") or "").strip()
                supplier_code = str(line_payload.get("supplier_code") or line_obj.supplier_code or "").strip()
                raw_name = str(line_payload.get("raw_product_name") or line_obj.raw_product_name or "").strip()
                uom = str(line_obj.qty_unit or "").strip() or None
                expected_product = _resolve_supplier_product_by_line(
                    supplier_id=supplier_id,
                    supplier_code=supplier_code,
                    raw_name=raw_name,
                    qty_unit=uom,
                )
                preferred_uom = _preferred_uom_from_history(
                    product=expected_product,
                    supplier_id=supplier_id,
                    supplier_code=supplier_code,
                    raw_name=raw_name,
                )
                if preferred_uom and line_obj.qty_unit != preferred_uom:
                    line_obj.qty_unit = preferred_uom
                    line_obj.save(update_fields=["qty_unit", "updated_at"])
                    uom = preferred_uom
                if expected_product and line_obj.supplier_product_id != expected_product.id:
                    line_obj.supplier_product = expected_product
                    line_obj.save(update_fields=["supplier_product", "updated_at"])
                if expected_product and not str(line_obj.supplier_code or "").strip():
                    expected_code = str(expected_product.supplier_sku or "").strip()
                    if expected_code:
                        line_obj.supplier_code = expected_code
                        line_obj.save(update_fields=["supplier_code", "updated_at"])
                        supplier_code = expected_code
                if not line_obj.supplier_product_id and supplier_id and raw_name and uom:
                    product = SupplierProduct.objects.create(
                        supplier_id=supplier_id,
                        name=raw_name[:255],
                        supplier_sku=supplier_code or None,
                        uom=uom,
                        category=category or None,
                    )
                    line_obj.supplier_product = product
                    line_obj.save(update_fields=["supplier_product", "updated_at"])
                _canonicalize_line_with_product(line_obj, line_obj.supplier_product if line_obj.supplier_product_id else None, raw_name, category)
                if category and line_obj.supplier_product:
                    current_category = str(line_obj.supplier_product.category or "").strip()
                    if not current_category:
                        line_obj.supplier_product.category = category
                        line_obj.supplier_product.save(update_fields=["category", "updated_at"])
            flow_summary = {}
            if target == "goods_receipt":
                flow_summary = _ensure_goods_receipt_stock_movements(instance)
            else:
                flow_summary = _ensure_invoice_fallback_movements(instance)
            metadata = document.metadata if isinstance(document.metadata, dict) else {}
            metadata["ingest"] = {
                "status": "completed",
                "target": target,
                "record_id": str(getattr(instance, "id", "")),
                "at": datetime.now(dt_timezone.utc).isoformat().replace("+00:00", "Z"),
                **flow_summary,
            }
            document.metadata = metadata
            document.save(update_fields=["metadata", "updated_at"])
            data = import_serializer_class(instance).data
            complete_batch(batch, status.HTTP_201_CREATED, data)
            return Response(data, status=status.HTTP_201_CREATED)
        except ValidationError as exc:
            if _is_unique_constraint_duplicate(exc):
                site_id = str(payload.get("site") or "").strip()
                supplier_id = str(payload.get("supplier") or "").strip()
                if target == "invoice":
                    invoice_number = str(payload.get("invoice_number") or "").strip()
                    if site_id and supplier_id and invoice_number:
                        existing = (
                            Invoice.objects
                            .prefetch_related("lines")
                            .filter(site_id=site_id, supplier_id=supplier_id, invoice_number=invoice_number)
                            .first()
                        )
                        if existing:
                            flow_summary = _ensure_invoice_fallback_movements(existing)
                            duplicate_key = f"{site_id}:{supplier_id}:{invoice_number}"
                            _mark_document_duplicate(
                                document,
                                target=target,
                                duplicate_record_id=str(existing.id),
                                duplicate_key=duplicate_key,
                                flow_summary=flow_summary,
                                reason="invoice_unique_constraint",
                            )
                            data = import_serializer_class(existing).data
                            complete_batch(batch, status.HTTP_200_OK, data)
                            return Response(data, status=status.HTTP_200_OK)
                if target == "goods_receipt":
                    delivery_note_number = str(payload.get("delivery_note_number") or "").strip()
                    if site_id and supplier_id and delivery_note_number:
                        existing = (
                            GoodsReceipt.objects
                            .prefetch_related("lines")
                            .filter(site_id=site_id, supplier_id=supplier_id, delivery_note_number=delivery_note_number)
                            .first()
                        )
                        if existing:
                            flow_summary = _ensure_goods_receipt_stock_movements(existing)
                            duplicate_key = f"{site_id}:{supplier_id}:{delivery_note_number}"
                            _mark_document_duplicate(
                                document,
                                target=target,
                                duplicate_record_id=str(existing.id),
                                duplicate_key=duplicate_key,
                                flow_summary=flow_summary,
                                reason="goods_receipt_unique_constraint",
                            )
                            data = import_serializer_class(existing).data
                            complete_batch(batch, status.HTTP_200_OK, data)
                            return Response(data, status=status.HTTP_200_OK)
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


def _sync_validated_label_capture_to_traccia(document: IntegrationDocument):
    extraction = document.extractions.order_by("-created_at").first()
    payload = _as_dict(extraction.normalized_payload if extraction else {})
    qty_value = _pick_first(payload, "weight_value", "quantity", "qty_value")
    qty_unit = _pick_first(payload, "weight_unit", "unit", "qty_unit")
    category = _pick_first(payload, "product_category", "category", "product_category_label")
    supplier_name = _pick_first(payload, "supplier_name")
    supplier_lot_code = _pick_first(payload, "supplier_lot_code", "lot_code", "lot")
    internal_lot_code = _pick_first(payload, "origin_lot_code", "source_lot_code", "internal_lot_code")
    product_guess = _pick_first(payload, "product_guess", "product_name", "label") or document.filename
    client = TracciaClient()
    _, sync_payload = client.request_json(
        "POST",
        "/api/v1/haccp/traceability-validations/",
        data={
            "site": str(document.site_id),
            "source_document_id": str(document.id),
            "source_document_filename": document.filename,
            "supplier_name": str(supplier_name or "").strip(),
            "supplier_lot_code": str(supplier_lot_code or "").strip(),
            "internal_lot_code": str(internal_lot_code or "").strip(),
            "product_guess": str(product_guess or document.filename).strip(),
            "quantity_value": str(qty_value).strip() if qty_value not in (None, "") else None,
            "quantity_unit": str(qty_unit or "").strip(),
            "production_date": _pick_first(payload, "production_date"),
            "dlc_date": _pick_first(payload, "dlc_date", "expiry_date"),
            "category": str(category or "").strip(),
            "corrected_payload": payload,
        },
    )
    return sync_payload


class DocumentReviewView(APIView):
    def post(self, request, document_id):
        document = get_object_or_404(IntegrationDocument, pk=document_id)
        serializer = DocumentReviewSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        metadata = document.metadata.copy() if isinstance(document.metadata, dict) else {}
        metadata["review_status"] = serializer.validated_data["status"]
        metadata["review_notes"] = serializer.validated_data.get("notes", "")
        metadata["reviewed_at"] = dj_timezone.now().isoformat()
        document.metadata = metadata
        corrected_payload = serializer.validated_data.get("corrected_payload")
        if corrected_payload is not None:
            latest_extraction = document.extractions.order_by("-created_at").first()
            if latest_extraction:
                latest_extraction.normalized_payload = corrected_payload
                latest_extraction.save(update_fields=["normalized_payload", "updated_at"])
        if serializer.validated_data["status"] == "validated" and document.document_type == DocumentType.LABEL_CAPTURE:
            try:
                metadata["traccia_sync"] = _sync_validated_label_capture_to_traccia(document)
                metadata.pop("traccia_sync_error", None)
            except TracciaClientError as exc:
                metadata["traccia_sync_error"] = exc.payload
        document.save(update_fields=["metadata", "updated_at"])
        return Response(
            {
                "document_id": str(document.id),
                "review_status": metadata["review_status"],
                "review_notes": metadata["review_notes"],
                "reviewed_at": metadata["reviewed_at"],
                "corrected_payload": corrected_payload,
                "traccia_sync": metadata.get("traccia_sync"),
                "traccia_sync_error": metadata.get("traccia_sync_error"),
            },
            status=status.HTTP_200_OK,
        )


class TraceabilityReconciliationDecisionListCreateView(APIView):
    def get(self, request):
        queryset = TraceabilityReconciliationDecision.objects.select_related("site", "linked_document", "linked_match").all()
        site_id = (request.query_params.get("site") or "").strip()
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        serializer = TraceabilityReconciliationDecisionSerializer(queryset.order_by("-updated_at", "-created_at"), many=True)
        return Response({"results": serializer.data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = TraceabilityReconciliationDecisionSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        decision, _created = TraceabilityReconciliationDecision.objects.update_or_create(
            site=validated["site"],
            event_id=validated["event_id"],
            defaults={
                "decision_status": validated["decision_status"],
                "notes": validated.get("notes", ""),
                "linked_document": validated.get("linked_document"),
                "linked_match": validated.get("linked_match"),
                "metadata": validated.get("metadata", {}),
            },
        )
        _sync_traceability_lot_allocation(decision)
        return Response(TraceabilityReconciliationDecisionSerializer(decision).data, status=status.HTTP_200_OK)

    def delete(self, request):
        site_id = str(request.query_params.get("site") or "").strip()
        event_id = str(request.query_params.get("event_id") or "").strip()
        if not site_id or not event_id:
            return Response(
                {"detail": "site and event_id query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted, _ = TraceabilityReconciliationDecision.objects.filter(site_id=site_id, event_id=event_id).delete()
        if deleted == 0:
            return Response({"detail": "decision not found."}, status=status.HTTP_404_NOT_FOUND)
        _delete_traceability_lot_allocation(event_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        refresh_existing = serializer.validated_data.get("refresh_existing", False)
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
            result = import_recipe_snapshots(query=query, limit=limit, refresh_existing=refresh_existing)
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
        refresh_existing = serializer.validated_data.get("refresh_existing", False)
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
            result = import_recipe_snapshots_from_v11_envelope(envelope, refresh_existing=refresh_existing)
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
