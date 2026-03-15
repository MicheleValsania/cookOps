import base64
import json
import os
import re
from dataclasses import dataclass
from typing import Any

from apps.integration.models import DocumentType, IntegrationDocument


@dataclass
class ClaudeExtractionResult:
    status: str
    raw_payload: dict[str, Any]
    normalized_payload: dict[str, Any]
    confidence: float | None = None
    error_message: str = ""
    extractor_version: str = "claude-v1"


def _build_schema_hint(document_type: str) -> dict[str, Any]:
    if document_type == DocumentType.LABEL_CAPTURE:
        return {
            "site": "uuid|null",
            "product_guess": "string|null",
            "supplier_name": "string|null",
            "supplier_code": "string|null",
            "supplier_lot_code": "string|null",
            "origin_lot_code": "string|null",
            "dlc_date": "YYYY-MM-DD|null",
            "production_date": "YYYY-MM-DD|null",
            "packaging": "string|null",
            "storage_hint": "string|null",
            "allergens_text": "string|null",
            "weight_value": "string|null",
            "weight_unit": "kg|g|l|ml|cl|pc|null",
            "notes": "string|null",
            "metadata": {},
        }
    line_base = {
        "supplier_product": None,
        "supplier_code": None,
        "raw_product_name": "string",
        "description": None,
        "qty_value": "0.000",
        "qty_unit": "kg|g|l|ml|cl|pc",
        "unit_price": None,
        "line_total": None,
        "vat_rate": None,
        "supplier_lot_code": None,
        "dlc_date": None,
        "note": None,
    }
    if document_type == DocumentType.GOODS_RECEIPT:
        return {
            "site": "uuid",
            "supplier": "uuid",
            "supplier_name": "string",
            "supplier_vat": "string|null",
            "document_number": "string",
            "delivery_note_number": "string",
            "document_date": "YYYY-MM-DD|null",
            "received_at": "YYYY-MM-DDTHH:MM:SSZ",
            "currency": "EUR|USD|...|null",
            "total_amount": None,
            "total_ht": None,
            "vat_amount": None,
            "vat_rate": None,
            "metadata": {},
            "lines": [line_base],
        }
    return {
        "site": "uuid",
        "supplier": "uuid",
        "supplier_name": "string",
        "supplier_vat": "string|null",
        "document_number": "string",
        "invoice_number": "string",
        "delivery_note_number": "string|null",
        "document_date": "YYYY-MM-DD|null",
        "invoice_date": "YYYY-MM-DD",
        "due_date": None,
        "currency": "EUR|USD|...|null",
        "total_amount": None,
        "total_ht": None,
        "vat_amount": None,
        "vat_rate": None,
        "payment_terms": None,
        "metadata": {},
        "lines": [line_base],
    }


def _extract_json_blob(text: str) -> dict[str, Any]:
    if not text:
        return {}
    cleaned = text.strip()

    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass

    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fenced_match:
        fenced_payload = fenced_match.group(1).strip()
        try:
            parsed = json.loads(fenced_payload)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    candidates: list[str] = []
    stack = 0
    start_idx = -1
    for idx, ch in enumerate(cleaned):
        if ch == "{":
            if stack == 0:
                start_idx = idx
            stack += 1
        elif ch == "}":
            if stack > 0:
                stack -= 1
                if stack == 0 and start_idx >= 0:
                    candidates.append(cleaned[start_idx : idx + 1])
                    start_idx = -1

    for candidate in sorted(candidates, key=len, reverse=True):
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    return {}


def _read_document_bytes(document: IntegrationDocument) -> bytes:
    if not document.file:
        return b""
    document.file.open("rb")
    try:
        return document.file.read()
    finally:
        document.file.close()


def _run_claude_extraction(document: IntegrationDocument, file_bytes: bytes) -> ClaudeExtractionResult:
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        return ClaudeExtractionResult(
            status="failed",
            raw_payload={},
            normalized_payload={},
            error_message="ANTHROPIC_API_KEY is not configured.",
        )

    try:
        from anthropic import Anthropic
    except Exception:
        return ClaudeExtractionResult(
            status="failed",
            raw_payload={},
            normalized_payload={},
            error_message="anthropic SDK not installed.",
        )

    model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest").strip()
    try:
        max_tokens = int((os.getenv("ANTHROPIC_MAX_TOKENS", "12000") or "12000").strip())
    except ValueError:
        max_tokens = 12000
    schema_hint = _build_schema_hint(document.document_type)
    if document.document_type == DocumentType.INVOICE:
        document_label = "invoice"
    elif document.document_type == DocumentType.GOODS_RECEIPT:
        document_label = "delivery note"
    else:
        document_label = "food traceability label"
    prompt = (
        "You are an OCR extraction engine for restaurant purchasing documents. "
        f"Extract data from this {document_label} and return exactly one JSON object. "
        "No markdown, no prose, no code fences, JSON only. "
        "Rules: keep decimal values as strings using dot separator; use null when not found; preserve line ordering; "
        "extract every visible line item with quantity and unit if present. "
        "Return compact JSON (single line) and omit optional fields that are null at line level. "
        "If supplier/site UUIDs are not present in the file, keep them as null. "
        f"Target schema: {json.dumps(schema_hint)}"
    )
    content_type = (document.content_type or "application/pdf").strip().lower()
    encoded = base64.b64encode(file_bytes).decode("ascii")
    client = Anthropic(api_key=api_key)

    try:
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": content_type,
                                "data": encoded,
                            },
                        },
                    ],
                }
            ],
        )
    except Exception as exc:
        return ClaudeExtractionResult(
            status="failed",
            raw_payload={"error": str(exc)},
            normalized_payload={},
            error_message=f"Claude API call failed: {exc}",
        )

    text_chunks: list[str] = []
    for block in getattr(response, "content", []) or []:
        block_type = getattr(block, "type", "")
        if block_type == "text":
            text_chunks.append(getattr(block, "text", ""))
    output_text = "\n".join(chunk for chunk in text_chunks if chunk)
    normalized = _extract_json_blob(output_text)
    if not normalized and output_text:
        repair_prompt = (
            "Rewrite the following content as one valid JSON object only. "
            "No markdown, no prose. Keep extracted values, drop broken/truncated trailing fragments, do not invent missing data.\n\n"
            f"Target schema: {json.dumps(schema_hint)}\n\n"
            f"CONTENT:\n{output_text}"
        )
        try:
            repair_response = client.messages.create(
                model=model,
                max_tokens=4096,
                temperature=0,
                messages=[{"role": "user", "content": [{"type": "text", "text": repair_prompt}]}],
            )
            repair_chunks: list[str] = []
            for block in getattr(repair_response, "content", []) or []:
                if getattr(block, "type", "") == "text":
                    repair_chunks.append(getattr(block, "text", ""))
            repaired_text = "\n".join(chunk for chunk in repair_chunks if chunk)
            repaired_json = _extract_json_blob(repaired_text)
            if repaired_json:
                normalized = repaired_json
                output_text = repaired_text
        except Exception:
            pass
    if not normalized:
        return ClaudeExtractionResult(
            status="failed",
            raw_payload={"response_text": output_text},
            normalized_payload={},
            error_message="Claude response did not contain a valid JSON object.",
        )
    return ClaudeExtractionResult(
        status="succeeded",
        raw_payload={"response_text": output_text},
        normalized_payload=normalized,
        confidence=None,
        extractor_version=model,
    )


def run_claude_extraction(document: IntegrationDocument) -> ClaudeExtractionResult:
    # Deterministic bypass for local tests/manual dry runs without external API calls.
    mock_payload = document.metadata.get("mock_claude_normalized_payload") if isinstance(document.metadata, dict) else None
    if isinstance(mock_payload, dict) and mock_payload:
        return ClaudeExtractionResult(
            status="succeeded",
            raw_payload={"source": "mock"},
            normalized_payload=mock_payload,
            confidence=99.0,
            extractor_version="mock",
        )

    file_bytes = _read_document_bytes(document)
    if not file_bytes:
        return ClaudeExtractionResult(
            status="failed",
            raw_payload={},
            normalized_payload={},
            error_message="Document file is missing or empty.",
        )
    return _run_claude_extraction(document, file_bytes)
