import base64
import json
import os
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
    line_base = {
        "supplier_product": None,
        "raw_product_name": "string",
        "qty_value": "0.000",
        "qty_unit": "kg|g|l|ml|cl|pc",
        "unit_price": None,
    }
    if document_type == DocumentType.GOODS_RECEIPT:
        line_base.update({"supplier_lot_code": None, "dlc_date": None})
        return {
            "site": "uuid",
            "supplier": "uuid",
            "delivery_note_number": "string",
            "received_at": "YYYY-MM-DDTHH:MM:SSZ",
            "metadata": {},
            "lines": [line_base],
        }
    line_base.update({"line_total": None, "vat_rate": None, "note": None})
    return {
        "site": "uuid",
        "supplier": "uuid",
        "invoice_number": "string",
        "invoice_date": "YYYY-MM-DD",
        "due_date": None,
        "metadata": {},
        "lines": [line_base],
    }


def _extract_json_blob(text: str) -> dict[str, Any]:
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        parsed = json.loads(text[start : end + 1])
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
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
    schema_hint = _build_schema_hint(document.document_type)
    prompt = (
        "Extract a single JSON object from this document. "
        "Do not include markdown or additional text. "
        f"Target schema: {json.dumps(schema_hint)}"
    )
    content_type = (document.content_type or "application/pdf").strip().lower()
    encoded = base64.b64encode(file_bytes).decode("ascii")
    client = Anthropic(api_key=api_key)

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
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
