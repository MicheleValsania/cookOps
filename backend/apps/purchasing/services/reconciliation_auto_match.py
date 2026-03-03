from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction

from apps.purchasing.models import GoodsReceiptLine, Invoice, InvoiceGoodsReceiptMatch, InvoiceLine


def _norm_text(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _qty_ratio_delta(inv_qty: Decimal, gr_qty: Decimal) -> Decimal:
    if inv_qty <= 0 or gr_qty <= 0:
        return Decimal("999")
    top = inv_qty if inv_qty >= gr_qty else gr_qty
    low = gr_qty if inv_qty >= gr_qty else inv_qty
    return (top - low) / low


def _line_fingerprint(line: InvoiceLine | GoodsReceiptLine) -> str:
    supplier_product_id = ""
    if getattr(line, "supplier_product_id", None):
        supplier_product_id = str(line.supplier_product_id)
    raw_name = _norm_text(getattr(line, "raw_product_name", ""))
    qty_unit = str(getattr(line, "qty_unit", "") or "").strip().lower()
    return f"{supplier_product_id}|{raw_name}|{qty_unit}"


def _match_score(inv_line: InvoiceLine, gr_line: GoodsReceiptLine, qty_tolerance_ratio: Decimal) -> tuple[int, str]:
    score = 0
    reasons: list[str] = []

    if inv_line.supplier_product_id and inv_line.supplier_product_id == gr_line.supplier_product_id:
        score += 70
        reasons.append("supplier_product_exact")

    inv_name = _norm_text(inv_line.raw_product_name)
    gr_name = _norm_text(gr_line.raw_product_name)
    if inv_name and gr_name:
        if inv_name == gr_name:
            score += 25
            reasons.append("name_exact")
        elif inv_name in gr_name or gr_name in inv_name:
            score += 15
            reasons.append("name_partial")

    if inv_line.qty_unit == gr_line.qty_unit:
        score += 10
        reasons.append("unit_exact")

    delta = _qty_ratio_delta(inv_line.qty_value, gr_line.qty_value)
    if delta <= qty_tolerance_ratio:
        score += 15
        reasons.append("qty_within_tolerance")
    elif delta <= (qty_tolerance_ratio * Decimal("2")):
        score += 5
        reasons.append("qty_near_tolerance")

    return score, ",".join(reasons)


@dataclass
class AutoMatchResult:
    created_matches: int
    linked_invoice_lines: int
    warnings: list[str]
    match_ids: list[str]


@transaction.atomic
def auto_match_invoice_lines(invoice: Invoice, qty_tolerance_ratio: Decimal = Decimal("0.05")) -> AutoMatchResult:
    warnings: list[str] = []
    created_matches = 0
    linked_invoice_lines = 0
    match_ids: list[str] = []

    invoice_lines = list(
        invoice.lines.select_related("supplier_product")
        .prefetch_related("reconciliation_matches")
        .all()
    )
    receipt_candidates = list(
        GoodsReceiptLine.objects.select_related("receipt", "supplier_product")
        .filter(
            receipt__site_id=invoice.site_id,
            receipt__supplier_id=invoice.supplier_id,
            qty_unit__in={line.qty_unit for line in invoice_lines},
        )
        .order_by("-receipt__received_at")
    )
    used_receipt_line_ids: set[str] = set()

    for inv_line in invoice_lines:
        if inv_line.reconciliation_matches.exists():
            continue

        best_line: GoodsReceiptLine | None = None
        best_score = -1
        best_reason = ""

        inv_fp = _line_fingerprint(inv_line)
        for gr_line in receipt_candidates:
            if str(gr_line.id) in used_receipt_line_ids:
                continue
            if gr_line.qty_unit != inv_line.qty_unit:
                continue
            score, reason = _match_score(inv_line, gr_line, qty_tolerance_ratio)
            if score > best_score:
                best_score = score
                best_line = gr_line
                best_reason = reason
            elif score == best_score and best_line is not None:
                if _line_fingerprint(gr_line) == inv_fp and _line_fingerprint(best_line) != inv_fp:
                    best_line = gr_line
                    best_reason = reason

        if not best_line or best_score < 60:
            continue

        qty_delta = _qty_ratio_delta(inv_line.qty_value, best_line.qty_value)
        is_partial = qty_delta > qty_tolerance_ratio
        status = "partial" if is_partial else "matched"
        metadata = {"source": "auto_match", "score": best_score, "reason": best_reason}

        sensitive = bool(getattr(best_line.supplier_product, "traceability_flag", False))
        missing_traceability = sensitive and (not best_line.supplier_lot_code or not best_line.dlc_date)
        if missing_traceability:
            status = "partial"
            metadata["traceability_warning"] = "missing_supplier_lot_or_dlc"
            warnings.append(
                f"Traceability warning on GR line {best_line.id}: supplier_lot_code/dlc_date missing for sensitive product."
            )

        match = InvoiceGoodsReceiptMatch.objects.create(
            invoice_line=inv_line,
            goods_receipt_line=best_line,
            status=status,
            matched_qty_value=min(inv_line.qty_value, best_line.qty_value),
            matched_amount=inv_line.line_total,
            note="Auto match generated by reconciliation service.",
            metadata=metadata,
        )
        created_matches += 1
        match_ids.append(str(match.id))
        used_receipt_line_ids.add(str(best_line.id))

        if not inv_line.goods_receipt_line_id and status == "matched":
            inv_line.goods_receipt_line = best_line
            inv_line.save(update_fields=["goods_receipt_line", "updated_at"])
            linked_invoice_lines += 1

    return AutoMatchResult(
        created_matches=created_matches,
        linked_invoice_lines=linked_invoice_lines,
        warnings=warnings,
        match_ids=match_ids,
    )
