import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getApiBase, getDefaultApiKey, setDefaultApiKey } from "./api/client";
import { HaccpWorkspace } from "./components/HaccpWorkspace";
import { TraceabilityWorkspace } from "./components/TraceabilityWorkspace";
import { getInitialLang, LANG_STORAGE_KEY, t as translate, type Lang } from "./i18n";

const FICHES_RECETTES_URL = (import.meta.env.VITE_FICHES_RECETTES_URL ?? "").toString().trim();
const LANDING_FICHES_FALLBACK = "https://fiches-recettes.netlify.app";
const LANDING_SKIP_STORAGE_KEY = "cookops_landing_skip_v1";

type NavKey =
  | "dashboard"
  | "inventario"
  | "inventari"
  | "acquisti"
  | "fornitori"
  | "ricette"
  | "comande"
  | "riconciliazioni"
  | "tracciabilita"
  | "haccp"
  | "report";

type DocumentItem = {
  id: string;
  filename: string;
  document_type: "goods_receipt" | "invoice" | "label_capture";
  status: string;
  site: string;
  content_type?: string | null;
  file_size?: number | string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown> | null;
  file?: string | null;
  storage_path?: string | null;
  latest_extraction?: {
    id?: string | null;
    extractor_name?: string | null;
    extractor_version?: string | null;
    status?: string | null;
    raw_payload?: Record<string, unknown> | null;
    normalized_payload?: Record<string, unknown> | null;
    confidence?: string | null;
    error_message?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  } | null;
};

type SupplierItem = {
  id: string;
  name: string;
  vat_number: string | null;
  metadata?: Record<string, unknown> | null;
};

type InvoiceRecord = {
  id: string;
  site: string;
  supplier: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  lines: Array<{
    id: string;
    goods_receipt_line?: string | null;
    supplier_product?: string | null;
    supplier_code?: string | null;
    raw_product_name?: string | null;
    qty_value: string;
    qty_unit: string;
    unit_price?: string | null;
    line_total?: string | null;
    vat_rate?: string | null;
    note?: string | null;
  }>;
};

type SiteItem = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type InventoryMovementItem = {
  id: string;
  movement_type: "IN" | "OUT" | "ADJUST" | "TRANSFER";
  qty_value: string;
  qty_unit: string;
  happened_at: string;
  ref_type?: string | null;
  ref_id?: string | null;
  supplier_product_name?: string | null;
  supplier_code?: string | null;
  raw_product_name?: string | null;
};

type StockSummaryItem = {
  product_key: string;
  product_label: string;
  product_name?: string | null;
  supplier_code?: string | null;
  supplier_name?: string | null;
  product_category?: string | null;
  qty_unit: string;
  total_in: string;
  total_out: string;
  in_from_docs?: string;
  in_from_invoice_fallback?: string;
  out_from_inventory?: string;
  out_other?: string;
  current_stock: string;
  last_movement_at?: string | null;
};

type HaccpOcrQueueItem = {
  document_id: string;
  filename: string;
  document_type: "goods_receipt" | "invoice" | "label_capture";
  document_status: string;
  validation_status: string;
  validation_notes?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
  extraction?: {
    id?: string | null;
    status?: string | null;
    confidence?: string | null;
    normalized_payload?: Record<string, unknown>;
    created_at?: string | null;
  } | null;
};

type HaccpLifecycleEvent = {
  event_id: string;
  event_type: string;
  happened_at: string;
  qty_value: string;
  qty_unit: string;
  product_label: string;
  supplier_code?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
  lot?: {
    id?: string | null;
    internal_lot_code?: string | null;
    supplier_lot_code?: string | null;
    status?: string | null;
    dlc_date?: string | null;
  } | null;
};

type HaccpScheduleItem = {
  id: string;
  site: string;
  task_type: "label_print" | "temperature_register" | "cleaning";
  title: string;
  area?: string | null;
  sector?: string | null;
  sector_code?: string | null;
  sector_label?: string | null;
  cold_point?: string | null;
  cold_point_code?: string | null;
  cold_point_label?: string | null;
  equipment_type?: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER" | "" | null;
  starts_at: string;
  ends_at?: string | null;
  status: "planned" | "done" | "skipped" | "cancelled";
  metadata?: Record<string, unknown> | null;
};

type CleaningCategory = {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

type CleaningProcedure = {
  id: string;
  category?: string | null;
  name: string;
  steps?: string[];
  notes?: string | null;
  is_active?: boolean;
};

type CleaningElementArea = {
  id?: string;
  sector_id: string;
  sector_name: string;
  sort_order?: number;
  is_active?: boolean;
};

type CleaningElement = {
  id: string;
  site: string;
  name: string;
  category?: string | null;
  procedure?: string | null;
  is_global?: boolean;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  areas: CleaningElementArea[];
};

type CleaningPlan = {
  id: string;
  site: string;
  element: string;
  sector_id?: string | null;
  sector_name?: string | null;
  cadence: string;
  due_time: string;
  start_date: string;
  timezone?: string | null;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
};

type HaccpTemperatureReadingItem = {
  id: string;
  register_id?: string | null;
  register_name?: string | null;
  cold_point_id?: string | null;
  cold_point_name?: string | null;
  sector_id?: string | null;
  sector_name?: string | null;
  device_type?: string | null;
  device_label?: string | null;
  reference_temperature_celsius?: string | null;
  temperature_celsius?: string | null;
  unit?: string | null;
  observed_at?: string | null;
  source?: string | null;
  confidence?: string | null;
  created_at?: string | null;
};

type HaccpLabelProfile = {
  id: string;
  site: string;
  name: string;
  category?: string | null;
  template_type: "PREPARATION" | "RAW_MATERIAL" | "TRANSFORMATION";
  shelf_life_value?: number | null;
  shelf_life_unit?: "hours" | "days" | "months" | null;
  packaging?: string | null;
  storage_hint?: string | null;
  allergens_text?: string | null;
  is_active?: boolean;
};

type HaccpLabelSession = {
  id: string;
  site: string;
  profile_id: string;
  profile_name?: string | null;
  planned_schedule_id?: string | null;
  source_lot_code?: string | null;
  quantity: number;
  status: "planned" | "done" | "cancelled";
  created_at?: string | null;
};

type HaccpSectorItem = {
  id: string;
  internal_id?: string | null;
  external_id?: string | null;
  external_code?: string | null;
  name: string;
  sort_order?: number;
  is_active?: boolean;
};

type HaccpColdPointItem = {
  id: string;
  internal_id?: string | null;
  external_id?: string | null;
  external_code?: string | null;
  sector?: string | null;
  sector_code?: string | null;
  sector_label?: string | null;
  name: string;
  cold_point_label?: string | null;
  equipment_type?: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER" | "" | null;
  sort_order?: number;
  is_active?: boolean;
};

type HaccpReconciliationRow = {
  site_id?: string | null;
  site_name?: string | null;
  event_id: string;
  event_type: string;
  source_document_id?: string | null;
  source_document_filename?: string | null;
  happened_at: string;
  product_label: string;
  supplier_code?: string | null;
  qty_value: string;
  qty_unit: string;
  reconcile_status: "reconciled" | "documents_found" | "goods_receipt_only" | "invoice_only" | "missing";
  lot?: {
    internal_lot_code?: string | null;
    supplier_lot_code?: string | null;
    status?: string | null;
    dlc_date?: string | null;
  } | null;
  goods_receipts: Array<{
    id: string;
    delivery_note_number: string;
    received_at?: string | null;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    invoice_date?: string | null;
  }>;
  matches: Array<{
    id: string;
    status: string;
  }>;
  alerts: string[];
};

type HaccpReconciliationOverview = {
  summary: {
    lifecycle_events: number;
    goods_receipt_lines: number;
    invoice_lines: number;
    matches: number;
    reconciled_events: number;
    goods_receipt_only_events: number;
    invoice_only_events: number;
    missing_events: number;
    documents_found_events: number;
    label_tasks_planned: number;
    label_tasks_done: number;
  };
  label_schedule_summary: {
    planned: number;
    done: number;
    skipped: number;
    cancelled: number;
  };
  results: HaccpReconciliationRow[];
};

type TraceabilityReconciliationDecision = {
  id: string;
  site: string;
  event_id: string;
  decision_status: "review_required" | "ignored" | "matched";
  notes?: string | null;
  linked_document?: string | null;
  linked_match?: string | null;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type HaccpViewKey =
  | "reports"
  | "validation"
  | "temperature"
  | "labels"
  | "lifecycle"
  | "anomalies"
  | "cleaning";

type EntryScheduleMode = "permanent" | "date_specific" | "recurring_weekly";

type MenuSpaceType = "recipes" | "supplier_products" | "mixed";

type MenuEntry = {
  id: string;
  title: string;
  item_kind: "recipe" | "product";
  section: string;
  recipe_category?: string;
  fiche_product_id?: string | null;
  expected_qty?: string;
  valid_from: string;
  valid_to: string;
  schedule_mode: EntryScheduleMode;
  weekdays: number[];
};

type MenuSpace = {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  type: MenuSpaceType;
  schedule_mode: EntryScheduleMode;
  sections: string[];
  entries: MenuEntry[];
};

const NAV_ITEMS: Array<{ key: NavKey; labelKey: string; helpKey: string }> = [
  { key: "dashboard", labelKey: "nav.dashboard", helpKey: "nav.dashboardHelp" },
  { key: "inventario", labelKey: "nav.inventory", helpKey: "nav.inventoryHelp" },
  { key: "inventari", labelKey: "nav.inventories", helpKey: "nav.inventoriesHelp" },
  { key: "acquisti", labelKey: "nav.purchases", helpKey: "nav.purchasesHelp" },
  { key: "fornitori", labelKey: "nav.suppliers", helpKey: "nav.suppliersHelp" },
  { key: "ricette", labelKey: "nav.recipes", helpKey: "nav.recipesHelp" },
  { key: "comande", labelKey: "nav.orders", helpKey: "nav.ordersHelp" },
  { key: "riconciliazioni", labelKey: "nav.reconciliations", helpKey: "nav.reconciliationsHelp" },
  { key: "tracciabilita", labelKey: "nav.traceability", helpKey: "nav.traceabilityHelp" },
  { key: "haccp", labelKey: "nav.haccp", helpKey: "nav.haccpHelp" },
  { key: "report", labelKey: "nav.reports", helpKey: "nav.reportsHelp" },
];

const MENU_SPACES_STORAGE_KEY = "cookops_menu_spaces_v1";
const MENU_SPACES_CACHE_STORAGE_KEY = "cookops_menu_spaces_cache_v1";
const MENU_ADVANCED_STORAGE_KEY = "cookops_menu_advanced_v1";
const SELECTED_SITE_STORAGE_KEY = "cookops_selected_site_v1";
const REPORT_FILTERS_STORAGE_KEY = "cookops_report_filters_v1";
const TRACEABILITY_RECONCILIATION_HASH = "#traceability-reconciliation";

function parseTraceabilityReconciliationHash(rawHash: string) {
  const hash = String(rawHash || "");
  if (!hash.startsWith(TRACEABILITY_RECONCILIATION_HASH)) {
    return { active: false, siteId: "" };
  }
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) {
    return { active: true, siteId: "" };
  }
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return {
    active: true,
    siteId: String(params.get("site") || "").trim(),
  };
}

const FICHE_RECIPE_SUGGESTIONS = [
  "Focaccia Bresaola",
  "Burger Classic",
  "Pizza Margherita",
  "Insalata Caesar",
  "Tagliere Salumi",
  "Pasta Arrabbiata",
  "Tiramisu",
];

type RecipeTitleSuggestion = {
  fiche_product_id: string;
  title: string;
  portions?: string | number | null;
  category?: string | null;
};

type MenuSuggestion = {
  key: string;
  value: string;
  fiche_product_id: string | null;
};

type ChecklistView = "supplier" | "recipe" | "sector";
type QuantityMode = "with_qty" | "ingredients_only";
type IntakeStage = "idle" | "uploading" | "extracting" | "review" | "ingesting";
type InvoiceIngestMode = "invoice_with_transport" | "invoice_direct" | "invoice_after_delivery";

const DEFAULT_MENU_SPACES: MenuSpace[] = [
  {
    id: "carta-principale",
    label: "Carta principale",
    enabled: true,
    order: 1,
    type: "recipes",
    schedule_mode: "permanent",
    sections: ["Antipasti", "Pizze", "Burger"],
    entries: [],
  },
  {
    id: "menu-giorno",
    label: "Menu del giorno",
    enabled: true,
    order: 2,
    type: "mixed",
    schedule_mode: "date_specific",
    sections: ["Speciali", "Fuori menu"],
    entries: [],
  },
  {
    id: "suggestioni",
    label: "Suggestioni",
    enabled: true,
    order: 3,
    type: "mixed",
    schedule_mode: "recurring_weekly",
    sections: ["Suggeriti oggi"],
    entries: [],
  },
];

function inferScheduleModeFromSpaceId(spaceId: string): EntryScheduleMode {
  if (spaceId.startsWith("carta")) return "permanent";
  if (spaceId === "suggestioni") return "recurring_weekly";
  return "date_specific";
}

function getMenuSpacesCacheContextKey(siteId: string, serviceDate: string): string {
  return `${siteId}::${serviceDate}`;
}

function getHaccpLocalSchedulesContextKey(siteId: string): string {
  return siteId;
}

function readMenuSpacesCache(): Record<string, MenuSpace[]> {
  const raw = localStorage.getItem(MENU_SPACES_CACHE_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, MenuSpace[]>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeMenuSpacesCache(cache: Record<string, MenuSpace[]>) {
  localStorage.setItem(MENU_SPACES_CACHE_STORAGE_KEY, JSON.stringify(cache));
}


function normalizeWeekdays(rawValue: unknown): number[] {
  if (!Array.isArray(rawValue)) return [];
  const normalized = new Set<number>();
  rawValue.forEach((item) => {
    const parsed = Number(item);
    if (!Number.isInteger(parsed)) return;
    if (parsed >= 0 && parsed <= 6) normalized.add(parsed);
    if (parsed >= 1 && parsed <= 7) normalized.add(parsed - 1);
  });
  return Array.from(normalized).sort((a, b) => a - b);
}

function listIsoDatesBetween(startIso: string, endIso: string): string[] {
  if (!startIso || !endIso) return [];
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function asNumber(value: unknown): number {
  const n = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatDisplayNumber(lang: Lang, value: unknown, maxFractionDigits = 3): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "0";
  const parsed = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(parsed)) return raw;
  return new Intl.NumberFormat(lang, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(parsed);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => asRecord(item)) : [];
}

function findBestInvoiceLineMatch(
  lines: Array<Record<string, unknown>>,
  row: HaccpReconciliationRow
): {
  line: Record<string, unknown> | null;
  qtyValue: number;
  qtyUnit: string;
  lineLabel: string;
  lineLot: string;
  score: number;
} {
  const productKey = normalizeDocumentToken(row.product_label);
  const lotKey = normalizeDocumentToken(row.lot?.supplier_lot_code || row.lot?.internal_lot_code);
  let best: {
    line: Record<string, unknown> | null;
    qtyValue: number;
    qtyUnit: string;
    lineLabel: string;
    lineLot: string;
    score: number;
  } = {
    line: null,
    qtyValue: 0,
    qtyUnit: "",
    lineLabel: "",
    lineLot: "",
    score: -1,
  };
  lines.forEach((line) => {
    const lineLabel = String(line.raw_product_name ?? line.description ?? line.name ?? line.product_name ?? "").trim();
    const lineLot = String(line.supplier_lot_code ?? line.lot ?? "").trim();
    const lineLabelKey = normalizeDocumentToken(lineLabel);
    const lineLotKey = normalizeDocumentToken(lineLot);
    let score = 0;
    if (lotKey && lineLotKey && lotKey === lineLotKey) score += 6;
    if (productKey && lineLabelKey && (lineLabelKey.includes(productKey) || productKey.includes(lineLabelKey))) score += 4;
    const qtyUnit = String(line.qty_unit ?? line.unit ?? "").trim().toLowerCase();
    if (qtyUnit && row.qty_unit && qtyUnit === String(row.qty_unit).trim().toLowerCase()) score += 1;
    if (score > best.score) {
      best = {
        line,
        qtyValue: asNumber(line.qty_value ?? line.quantity ?? "0"),
        qtyUnit,
        lineLabel,
        lineLot,
        score,
      };
    }
  });
  return best;
}

function normalizeDocumentToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDocumentDateToken(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const isoLike = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoLike)) return isoLike;
  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
  return normalizeDocumentToken(raw);
}

function describeValidationError(body: Record<string, unknown> | null) {
  if (!body || typeof body !== "object") return "";
  const detail = String(body.detail ?? "").trim();
  const fieldErrors = body.field_errors as Record<string, unknown> | undefined;
  if (fieldErrors && typeof fieldErrors === "object") {
    const parts = Object.entries(fieldErrors).map(([field, messages]) => {
      if (Array.isArray(messages)) {
        const rendered = messages.map((msg) =>
          typeof msg === "string" ? msg : JSON.stringify(msg)
        );
        return `${field}: ${rendered.join(", ")}`;
      }
      return `${field}: ${typeof messages === "string" ? messages : JSON.stringify(messages)}`;
    });
    if (parts.length > 0) {
      return detail ? `${detail} (${parts.join(" | ")})` : parts.join(" | ");
    }
  }
  return detail;
}

function normalizeReferenceToken(value: unknown): string {
  return normalizeDocumentToken(value).replace(/[^a-z0-9]/g, "");
}

function extractInvoiceReferenceFromPayload(payload: Record<string, unknown>): string {
  const direct = String(payload.invoice_number ?? payload.invoice_reference ?? "").trim();
  if (direct) return direct;
  const notes = String(payload.notes ?? payload.note ?? "").trim();
  if (!notes) return "";
  const match = notes.match(/\b(?:facture|invoice)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]*)/i);
  return match?.[1] ?? "";
}

function getDocumentDuplicateKey(doc: DocumentItem): string {
  const metadata = asRecord(doc.metadata);
  const extraction = asRecord(doc.latest_extraction ?? {});
  const payload = asRecord(extraction.normalized_payload);
  const driveFileId = normalizeDocumentToken(metadata.drive_file_id);
  if (driveFileId) {
    return `${doc.site}|${doc.document_type}|drive:${driveFileId}`;
  }

  const supplier = normalizeDocumentToken(payload.supplier_name ?? payload.supplier ?? payload.vendor_name);
  const number = normalizeDocumentToken(payload.document_number ?? payload.invoice_number ?? payload.delivery_note_number);
  const date = normalizeDocumentDateToken(payload.document_date ?? payload.invoice_date ?? payload.received_at);
  const total = normalizeDocumentToken(payload.total_amount ?? payload.total ?? payload.total_ht);
  if (supplier && number) {
    return `${doc.site}|${doc.document_type}|doc:${supplier}|${number}|${date}|${total}`;
  }

  const filename = normalizeDocumentToken(doc.filename);
  const fileSize = normalizeDocumentToken(doc.file_size);
  if (filename && fileSize) {
    return `${doc.site}|${doc.document_type}|file:${filename}|${fileSize}`;
  }
  return "";
}

function recipeSuggestionKey(item: RecipeTitleSuggestion): string {
  const fiche = String(item.fiche_product_id || "").trim();
  if (fiche) return `fiche:${fiche}`;
  return `title:${String(item.title || "").trim().toLowerCase()}`;
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readReportFilters() {
  try {
    const raw = localStorage.getItem(REPORT_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeHaccpOcrQueueRows(body: unknown): HaccpOcrQueueItem[] {
  const results = Array.isArray(body) ? asArray(body) : asArray(asRecord(body).results);
  return results.map((row) => {
    const extraction = asRecord(row.extraction);
    return {
      document_id: String(row.document_id ?? row.id ?? row.ocr_result_id ?? ""),
      filename: String(row.filename ?? row.label ?? row.document_name ?? "N/A"),
      document_type: String(row.document_type ?? "goods_receipt") as "goods_receipt" | "invoice",
      document_status: String(row.document_status ?? row.status ?? "-"),
      validation_status: String(row.validation_status ?? row.validation_state ?? "pending"),
      validation_notes: String(row.validation_notes ?? ""),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
      extraction: {
        id: String(extraction.id ?? row.extraction_id ?? ""),
        status: String(extraction.status ?? row.extraction_status ?? row.status ?? ""),
        confidence: String(extraction.confidence ?? row.confidence ?? ""),
        normalized_payload: asRecord(extraction.normalized_payload ?? row.normalized_payload),
        created_at: String(extraction.created_at ?? ""),
      },
    };
  }).filter((row) => row.document_id.trim().length > 0);
}

function normalizeHaccpOcrQueueRowsFromDocuments(documents: DocumentItem[]): HaccpOcrQueueItem[] {
  return documents
    .filter((doc) => doc.document_type === "label_capture")
    .map((doc) => {
      const extraction = asRecord(doc.latest_extraction ?? {});
      const payload = asRecord(extraction.normalized_payload);
      const reviewStatus = String(asRecord(doc.metadata ?? {}).review_status ?? "").trim();
      const extractionStatus = String(extraction.status ?? "").trim();
      let validationStatus = reviewStatus || "pending";
      if (!reviewStatus) {
        if (extractionStatus === "succeeded") validationStatus = "pending_review";
        else if (extractionStatus === "failed") validationStatus = "failed";
        else if (extractionStatus) validationStatus = extractionStatus;
      }
      return {
        document_id: doc.id,
        filename: doc.filename,
        document_type: "label_capture",
        document_status: doc.status,
        validation_status: validationStatus,
        validation_notes: String(asRecord(doc.metadata ?? {}).review_notes ?? ""),
        reviewed_at: String(asRecord(doc.metadata ?? {}).reviewed_at ?? ""),
        created_at: String(doc.created_at ?? ""),
        updated_at: String(doc.updated_at ?? ""),
        extraction: {
          id: String(extraction.id ?? ""),
          status: extractionStatus,
          confidence: String(extraction.confidence ?? ""),
          normalized_payload: payload,
          created_at: String(extraction.created_at ?? ""),
        },
      };
    });
}

function normalizeHaccpLifecycleRows(body: unknown): HaccpLifecycleEvent[] {
  const results = Array.isArray(body) ? asArray(body) : asArray(asRecord(body).results);
  return results.map((row) => {
    const lot = asRecord(row.lot);
    return {
      event_id: String(row.event_id ?? row.id ?? ""),
      event_type: String(row.event_type ?? row.type ?? "movement"),
      happened_at: String(row.happened_at ?? row.created_at ?? ""),
      qty_value: String(row.qty_value ?? row.quantity ?? "0"),
      qty_unit: String(row.qty_unit ?? row.unit ?? "pc"),
      product_label: String(row.product_label ?? row.product_name ?? row.label ?? "-"),
      supplier_code: String(row.supplier_code ?? ""),
      ref_type: String(row.ref_type ?? ""),
      ref_id: String(row.ref_id ?? ""),
      lot: {
        id: String(lot.id ?? row.lot_id ?? ""),
        internal_lot_code: String(lot.internal_lot_code ?? lot.code ?? row.internal_lot_code ?? ""),
        supplier_lot_code: String(lot.supplier_lot_code ?? ""),
        status: String(lot.status ?? ""),
        dlc_date: String(lot.dlc_date ?? ""),
      },
    };
  }).filter((row) => row.event_id.trim().length > 0);
}

function normalizeHaccpScheduleRows(body: unknown): HaccpScheduleItem[] {
  const results = Array.isArray(body) ? asArray(body) : asArray(asRecord(body).results);
  return results.map((row) => ({
    id: String(row.id ?? ""),
    site: String(row.site ?? ""),
    task_type: String(row.task_type ?? "label_print") as "label_print" | "temperature_register" | "cleaning",
    title: String(row.title ?? row.name ?? "Task"),
    area: String(row.area ?? ""),
    sector: row.sector ? String(row.sector) : null,
    sector_code: row.sector_code ? String(row.sector_code) : null,
    sector_label: row.sector_label ? String(row.sector_label) : null,
    cold_point: row.cold_point ? String(row.cold_point) : null,
    cold_point_code: row.cold_point_code ? String(row.cold_point_code) : null,
    cold_point_label: row.cold_point_label ? String(row.cold_point_label) : null,
    equipment_type: row.equipment_type ? String(row.equipment_type) as HaccpScheduleItem["equipment_type"] : null,
    starts_at: String(row.starts_at ?? row.start_at ?? row.scheduled_for ?? ""),
    ends_at: String(row.ends_at ?? row.end_at ?? ""),
    status: String(row.status ?? "planned") as "planned" | "done" | "skipped" | "cancelled",
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
  })).filter((row) => row.id.trim().length > 0);
}

function normalizeHaccpLabelProfileRows(body: unknown): HaccpLabelProfile[] {
  const results = Array.isArray(body) ? asArray(body) : asArray(asRecord(body).results);
  return results
    .map((row) => ({
      id: String(row.id ?? ""),
      site: String(row.site ?? ""),
      name: String(row.name ?? ""),
      category: row.category ? String(row.category) : "",
      template_type: String(row.template_type ?? "PREPARATION") as HaccpLabelProfile["template_type"],
      shelf_life_value: row.shelf_life_value == null ? null : Number(row.shelf_life_value),
      shelf_life_unit: row.shelf_life_unit ? String(row.shelf_life_unit) as HaccpLabelProfile["shelf_life_unit"] : null,
      packaging: row.packaging ? String(row.packaging) : "",
      storage_hint: row.storage_hint ? String(row.storage_hint) : "",
      allergens_text: row.allergens_text ? String(row.allergens_text) : "",
      is_active: row.is_active !== false,
    }))
    .filter((row) => row.id.trim().length > 0 && row.name.trim().length > 0);
}

function normalizeHaccpLabelSessionRows(body: unknown, profiles: HaccpLabelProfile[]): HaccpLabelSession[] {
  const results = Array.isArray(body) ? asArray(body) : asArray(asRecord(body).results);
  const profileById = new Map(profiles.map((item) => [item.id, item]));
  return results
    .map((row) => {
      const profileId = String(row.profile_id ?? row.profile ?? "");
      const linkedProfile = profileById.get(profileId);
      return {
        id: String(row.id ?? ""),
        site: String(row.site ?? ""),
        profile_id: profileId,
        profile_name: String(row.profile_name ?? linkedProfile?.name ?? ""),
        planned_schedule_id: row.planned_schedule_id ? String(row.planned_schedule_id) : null,
        source_lot_code: row.source_lot_code ? String(row.source_lot_code) : "",
        quantity: Number(row.quantity ?? 0),
        status: String(row.status ?? "planned") as HaccpLabelSession["status"],
        created_at: row.created_at ? String(row.created_at) : "",
      };
    })
    .filter((row) => row.id.trim().length > 0 && row.profile_id.trim().length > 0);
}

function normalizeHaccpSectorRows(body: unknown): HaccpSectorItem[] {
  const results = Array.isArray(body) ? asArray(body) : asArray(asRecord(body).results);
  return results
    .map((row) => ({
      id: String(row.external_id ?? row.id ?? ""),
      internal_id: row.id ? String(row.id) : null,
      external_id: row.external_id ? String(row.external_id) : null,
      external_code: row.external_code ? String(row.external_code) : null,
      name: String(row.name ?? row.sector_label ?? ""),
      sort_order: Number(row.sort_order ?? 0),
      is_active: row.is_active !== false,
    }))
    .filter((row) => row.id.trim().length > 0 && row.name.trim().length > 0);
}

function normalizeHaccpColdPointRows(body: unknown): HaccpColdPointItem[] {
  const results = Array.isArray(body) ? asArray(body) : asArray(asRecord(body).results);
  return results
    .map((row) => ({
      id: String(row.external_id ?? row.id ?? ""),
      internal_id: row.id ? String(row.id) : null,
      external_id: row.external_id ? String(row.external_id) : null,
      external_code: row.external_code ? String(row.external_code) : null,
      sector: row.sector ? String(row.sector) : null,
      sector_code: row.sector_code ? String(row.sector_code) : null,
      sector_label: row.sector_label ? String(row.sector_label) : null,
      name: String(row.name ?? row.cold_point_label ?? ""),
      cold_point_label: row.cold_point_label ? String(row.cold_point_label) : null,
      equipment_type: row.equipment_type ? String(row.equipment_type) as HaccpColdPointItem["equipment_type"] : null,
      sort_order: Number(row.sort_order ?? 0),
      is_active: row.is_active !== false,
    }))
    .filter((row) => row.id.trim().length > 0 && row.name.trim().length > 0);
}

function normalizeHaccpTemperatureReadingRows(body: unknown): HaccpTemperatureReadingItem[] {
  const results = Array.isArray(body) ? asArray(body) : asArray(asRecord(body).results);
  return results
    .map((row) => ({
      id: String(row.id ?? ""),
      register_id: row.register_id ? String(row.register_id) : null,
      register_name: row.register_name ? String(row.register_name) : null,
      cold_point_id: row.cold_point_id ? String(row.cold_point_id) : null,
      cold_point_name: row.cold_point_name ? String(row.cold_point_name) : null,
      sector_id: row.sector_id ? String(row.sector_id) : null,
      sector_name: row.sector_name ? String(row.sector_name) : null,
      device_type: row.device_type ? String(row.device_type) : null,
      device_label: row.device_label ? String(row.device_label) : null,
      reference_temperature_celsius: row.reference_temperature_celsius != null ? String(row.reference_temperature_celsius) : null,
      temperature_celsius: row.temperature_celsius != null ? String(row.temperature_celsius) : null,
      unit: row.unit ? String(row.unit) : null,
      observed_at: row.observed_at ? String(row.observed_at) : null,
      source: row.source ? String(row.source) : null,
      confidence: row.confidence != null ? String(row.confidence) : null,
      created_at: row.created_at ? String(row.created_at) : null,
    }))
    .filter((row) => row.id.trim().length > 0);
}

function createClientUuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `haccp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeHaccpReconciliationOverview(body: unknown, context?: { siteId?: string; siteName?: string }): HaccpReconciliationOverview {
  const record = asRecord(body);
  const summary = asRecord(record.summary);
  const labelScheduleSummary = asRecord(record.label_schedule_summary);
  const results = asArray(record.results);
  return {
    summary: {
      lifecycle_events: Number(summary.lifecycle_events ?? 0),
      goods_receipt_lines: Number(summary.goods_receipt_lines ?? 0),
      invoice_lines: Number(summary.invoice_lines ?? 0),
      matches: Number(summary.matches ?? 0),
      reconciled_events: Number(summary.reconciled_events ?? 0),
      goods_receipt_only_events: Number(summary.goods_receipt_only_events ?? 0),
      invoice_only_events: Number(summary.invoice_only_events ?? 0),
      missing_events: Number(summary.missing_events ?? 0),
      documents_found_events: Number(summary.documents_found_events ?? 0),
      label_tasks_planned: Number(summary.label_tasks_planned ?? 0),
      label_tasks_done: Number(summary.label_tasks_done ?? 0),
    },
    label_schedule_summary: {
      planned: Number(labelScheduleSummary.planned ?? 0),
      done: Number(labelScheduleSummary.done ?? 0),
      skipped: Number(labelScheduleSummary.skipped ?? 0),
      cancelled: Number(labelScheduleSummary.cancelled ?? 0),
    },
    results: results.map((row) => {
      const lot = asRecord(row.lot);
      return {
        site_id: context?.siteId ?? "",
        site_name: context?.siteName ?? "",
        event_id: String(row.event_id ?? row.id ?? ""),
        event_type: String(row.event_type ?? row.type ?? "movement"),
        source_document_id: String(row.source_document_id ?? ""),
        source_document_filename: String(row.source_document_filename ?? ""),
        happened_at: String(row.happened_at ?? ""),
        product_label: String(row.product_label ?? row.product_name ?? row.label ?? "-"),
        supplier_code: String(row.supplier_code ?? ""),
        qty_value: String(row.qty_value ?? "0"),
        qty_unit: String(row.qty_unit ?? ""),
        reconcile_status: String(row.reconcile_status ?? "missing") as HaccpReconciliationRow["reconcile_status"],
        lot: {
          internal_lot_code: String(lot.internal_lot_code ?? ""),
          supplier_lot_code: String(lot.supplier_lot_code ?? ""),
          status: String(lot.status ?? ""),
          dlc_date: String(lot.dlc_date ?? ""),
        },
        goods_receipts: asArray(row.goods_receipts).map((item) => {
          const value = asRecord(item);
          return {
            id: String(value.id ?? ""),
            delivery_note_number: String(value.delivery_note_number ?? "-"),
            received_at: String(value.received_at ?? ""),
          };
        }),
        invoices: asArray(row.invoices).map((item) => {
          const value = asRecord(item);
          return {
            id: String(value.id ?? ""),
            invoice_number: String(value.invoice_number ?? "-"),
            invoice_date: String(value.invoice_date ?? ""),
          };
        }),
        matches: asArray(row.matches).map((item) => {
          const value = asRecord(item);
          return {
            id: String(value.id ?? ""),
            status: String(value.status ?? "-"),
          };
        }),
        alerts: asArray(row.alerts).map((item) => String(item ?? "")).filter((item) => item.trim().length > 0),
      };
    }).filter((row) => row.event_id.trim().length > 0),
  };
}

function App() {
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const [isLandingDismissed, setIsLandingDismissed] = useState(
    () => localStorage.getItem(LANDING_SKIP_STORAGE_KEY) === "true"
  );
  const [isLandingSkipChecked, setIsLandingSkipChecked] = useState(false);
  const [nav, setNav] = useState<NavKey>("dashboard");
  const [isTraceabilityReconciliationPage, setIsTraceabilityReconciliationPage] = useState(
    () => parseTraceabilityReconciliationHash(window.location.hash).active
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [apiKey, setApiKey] = useState(getDefaultApiKey());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [siteId, setSiteId] = useState(() => localStorage.getItem(SELECTED_SITE_STORAGE_KEY) ?? "");
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteCode, setNewSiteCode] = useState("");
  const [siteToDelete, setSiteToDelete] = useState<SiteItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [notice, setNotice] = useState(() => translate(getInitialLang(), "notice.ready"));

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<"goods_receipt" | "invoice" | "label_capture">("goods_receipt");
  const [selectedExtractionId, setSelectedExtractionId] = useState("");
  const [isDeletingDocumentId, setIsDeletingDocumentId] = useState("");
  const [isClaudeExtracting, setIsClaudeExtracting] = useState(false);
  const [intakeStage, setIntakeStage] = useState<IntakeStage>("idle");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState<"goods_receipt" | "invoice">("goods_receipt");
  const [invoiceIngestMode] = useState<InvoiceIngestMode>("invoice_direct");
  const [originalDocumentBlobUrl, setOriginalDocumentBlobUrl] = useState("");
  const [isOriginalDocumentLoading, setIsOriginalDocumentLoading] = useState(false);

  const [normalizedPayload, setNormalizedPayload] = useState(`{\n  "site": "",\n  "supplier": "",\n  "delivery_note_number": "BL-001",\n  "received_at": "2026-02-27T10:00:00Z",\n  "metadata": {"source": "ocr"},\n  "lines": [{"raw_product_name": "Tomato", "qty_value": "3.000", "qty_unit": "kg"}]\n}`);

  const [recoInvoiceLine, setRecoInvoiceLine] = useState("");
  const [recoGoodsReceiptLine, setRecoGoodsReceiptLine] = useState("");
  const [autoMatchInvoiceId, setAutoMatchInvoiceId] = useState("");
  const [isAutoMatching, setIsAutoMatching] = useState(false);

  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [registeredInvoices, setRegisteredInvoices] = useState<InvoiceRecord[]>([]);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [supplierSearchText, setSupplierSearchText] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierRulePrefixesInput, setSupplierRulePrefixesInput] = useState("");
  const [supplierRuleExampleInput, setSupplierRuleExampleInput] = useState("P 35302");
  const [newSupplierProductSupplierId, setNewSupplierProductSupplierId] = useState("");
  const [newSupplierProductName, setNewSupplierProductName] = useState("");
  const [newSupplierProductSku, setNewSupplierProductSku] = useState("");
  const [newSupplierProductUom, setNewSupplierProductUom] = useState("kg");
  const [newSupplierProductPackQty, setNewSupplierProductPackQty] = useState("");
  const [newSupplierProductCategory, setNewSupplierProductCategory] = useState("");
  const [supplierProducts, setSupplierProducts] = useState<Array<Record<string, unknown>>>([]);
  const [isSupplierProductsLoading, setIsSupplierProductsLoading] = useState(false);
  const [fichesSyncStatus, setFichesSyncStatus] = useState("");
  const [isFichesSyncing, setIsFichesSyncing] = useState(false);
  const [isFichesJsonImporting, setIsFichesJsonImporting] = useState(false);
  const [fichesJsonFile, setFichesJsonFile] = useState<File | null>(null);
  const [refreshFichesSnapshots, setRefreshFichesSnapshots] = useState(true);

  const [salesDate, setSalesDate] = useState(getTodayIsoDate());
  const [posSourceId, setPosSourceId] = useState("");
  const [salesLines, setSalesLines] = useState('[{"pos_name":"Pizza Margherita","qty":12}]');
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovementItem[]>([]);
  const [stockSummaryRows, setStockSummaryRows] = useState<StockSummaryItem[]>([]);
  const [isInventoryLoading, setIsInventoryLoading] = useState(false);
  const [isApplyingInventory, setIsApplyingInventory] = useState(false);
  const [isRebuildingStock, setIsRebuildingStock] = useState(false);
  const [inventoryScope, setInventoryScope] = useState("total");
  const [inventoryLinesJson, setInventoryLinesJson] = useState('[{"supplier_code":"82233","raw_product_name":"LIEU NOIR VDK 2/4 A.N.E","qty_unit":"kg","qty_value":"40.000"}]');
  const [stockSearch, setStockSearch] = useState("");
  const [lastInventoryApplied, setLastInventoryApplied] = useState<Array<Record<string, unknown>>>([]);
  const [isBulkIngesting, setIsBulkIngesting] = useState<"goods_receipt" | "invoice" | null>(null);
  const [bulkIngestErrors, setBulkIngestErrors] = useState<Record<string, string[]>>({});
  const [lastIngestError, setLastIngestError] = useState("");
  const [haccpOcrQueue, setHaccpOcrQueue] = useState<HaccpOcrQueueItem[]>([]);
  const [haccpLifecycleEvents, setHaccpLifecycleEvents] = useState<HaccpLifecycleEvent[]>([]);
  const [haccpSchedules, setHaccpSchedules] = useState<HaccpScheduleItem[]>([]);
  const [cleaningCategories, setCleaningCategories] = useState<CleaningCategory[]>([]);
  const [cleaningProcedures, setCleaningProcedures] = useState<CleaningProcedure[]>([]);
  const [cleaningElements, setCleaningElements] = useState<CleaningElement[]>([]);
  const [cleaningPlans, setCleaningPlans] = useState<CleaningPlan[]>([]);
  const [isCleaningLoading, setIsCleaningLoading] = useState(false);
  const [newCleaningCategoryName, setNewCleaningCategoryName] = useState("");
  const [newCleaningCategoryDescription, setNewCleaningCategoryDescription] = useState("");
  const [newCleaningProcedureName, setNewCleaningProcedureName] = useState("");
  const [newCleaningProcedureCategory, setNewCleaningProcedureCategory] = useState("");
  const [newCleaningProcedureSteps, setNewCleaningProcedureSteps] = useState("");
  const [newCleaningProcedureNotes, setNewCleaningProcedureNotes] = useState("");
  const [newCleaningElementName, setNewCleaningElementName] = useState("");
  const [newCleaningElementCategory, setNewCleaningElementCategory] = useState("");
  const [newCleaningElementProcedure, setNewCleaningElementProcedure] = useState("");
  const [newCleaningElementIsGlobal, setNewCleaningElementIsGlobal] = useState(false);
  const [newCleaningElementAreaIds, setNewCleaningElementAreaIds] = useState<string[]>([]);
  const [newCleaningCadence, setNewCleaningCadence] = useState("daily");
  const [newCleaningDueTime, setNewCleaningDueTime] = useState("01:00");
  const [newCleaningStartDate, setNewCleaningStartDate] = useState(getTodayIsoDate());
  const [newCleaningPlanElementId, setNewCleaningPlanElementId] = useState("");
  const [newCleaningPlanAreaIds, setNewCleaningPlanAreaIds] = useState<string[]>([]);
  const [editingCleaningPlanId, setEditingCleaningPlanId] = useState("");
  const [haccpLabelProfiles, setHaccpLabelProfiles] = useState<HaccpLabelProfile[]>([]);
  const [haccpLabelSessions, setHaccpLabelSessions] = useState<HaccpLabelSession[]>([]);
  const [haccpSectors, setHaccpSectors] = useState<HaccpSectorItem[]>([]);
  const [haccpColdPoints, setHaccpColdPoints] = useState<HaccpColdPointItem[]>([]);
  const [haccpTemperatureReadings, setHaccpTemperatureReadings] = useState<HaccpTemperatureReadingItem[]>([]);
  const [haccpReconciliationOverview, setHaccpReconciliationOverview] = useState<HaccpReconciliationOverview | null>(null);
  const [isHaccpLoading, setIsHaccpLoading] = useState(false);
  const [isHaccpSaving, setIsHaccpSaving] = useState(false);
  const [haccpView, setHaccpView] = useState<HaccpViewKey>("temperature");
  const [selectedHaccpDocumentId, setSelectedHaccpDocumentId] = useState("");
  const [traceabilityImportStatus, setTraceabilityImportStatus] = useState("");
  const [reportDateFrom, setReportDateFrom] = useState(() => String(readReportFilters()?.date_from ?? getTodayIsoDate().slice(0, 8) + "01"));
  const [reportDateTo, setReportDateTo] = useState(() => String(readReportFilters()?.date_to ?? getTodayIsoDate()));
  const [reportReviewStatus, setReportReviewStatus] = useState(() => String(readReportFilters()?.review_status ?? "all"));
  const [reportSearch, setReportSearch] = useState(() => String(readReportFilters()?.search ?? ""));
  const [reportOnlyAnomalies, setReportOnlyAnomalies] = useState(() => Boolean(readReportFilters()?.only_anomalies ?? false));
  const [reportSupplierSearch, setReportSupplierSearch] = useState(() => String(readReportFilters()?.supplier_search ?? ""));
  const [reportProductSearch, setReportProductSearch] = useState(() => String(readReportFilters()?.product_search ?? ""));
  const [reportLotSearch, setReportLotSearch] = useState(() => String(readReportFilters()?.lot_search ?? ""));
  const [reconciliationInitialSiteId, setReconciliationInitialSiteId] = useState(
    () => parseTraceabilityReconciliationHash(window.location.hash).siteId || String(localStorage.getItem(SELECTED_SITE_STORAGE_KEY) ?? "")
  );
  const [centralReconciliationOverview, setCentralReconciliationOverview] = useState<HaccpReconciliationOverview | null>(null);
  const [isCentralReconciliationLoading, setIsCentralReconciliationLoading] = useState(false);
  const [reconciliationSearch, setReconciliationSearch] = useState("");
  const [reconciliationStatusFilter, setReconciliationStatusFilter] = useState("all");
  const [reconciliationOnlyAlerts, setReconciliationOnlyAlerts] = useState(false);
  const [reconciliationSiteFilter, setReconciliationSiteFilter] = useState(
    () => parseTraceabilityReconciliationHash(window.location.hash).siteId || ""
  );
  const [reconciliationSelections, setReconciliationSelections] = useState<Record<string, { goodsReceiptLineId: string; invoiceLineId: string }>>({});
  const [reconciliationDecisionNotes, setReconciliationDecisionNotes] = useState<Record<string, string>>({});
  const [reconciliationDecisions, setReconciliationDecisions] = useState<TraceabilityReconciliationDecision[]>([]);
  const [selectedReconciliationEventId, setSelectedReconciliationEventId] = useState("");
  const [lastTraceabilityImportSummary, setLastTraceabilityImportSummary] = useState<{
    created_count: number;
    skipped_existing: number;
    skipped_invalid: number;
    error_count: number;
    extracted_count: number;
  } | null>(null);
  const [newHaccpTaskType, setNewHaccpTaskType] = useState<"label_print" | "temperature_register" | "cleaning">("label_print");
  const [newHaccpTitle, setNewHaccpTitle] = useState("");
  const [newHaccpArea, setNewHaccpArea] = useState("");
  const [selectedHaccpSectorId, setSelectedHaccpSectorId] = useState("");
  const [selectedHaccpColdPointId, setSelectedHaccpColdPointId] = useState("");
  const [newHaccpSectorName, setNewHaccpSectorName] = useState("");
  const [editingHaccpSectorId, setEditingHaccpSectorId] = useState("");
  const [newHaccpColdPointName, setNewHaccpColdPointName] = useState("");
  const [newHaccpColdPointEquipmentType, setNewHaccpColdPointEquipmentType] = useState<"FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER">("FRIDGE");
  const [editingHaccpColdPointId, setEditingHaccpColdPointId] = useState("");
  const [newHaccpStartsAt, setNewHaccpStartsAt] = useState("");
  const [newHaccpEndsAt, setNewHaccpEndsAt] = useState("");
  const [newLabelProfileName, setNewLabelProfileName] = useState("");
  const [newLabelProfileCategory, setNewLabelProfileCategory] = useState("Carni");
  const [editingLabelProfileId, setEditingLabelProfileId] = useState("");
  const [newLabelTemplateType, setNewLabelTemplateType] = useState<HaccpLabelProfile["template_type"]>("PREPARATION");
  const [newLabelShelfLifeValue, setNewLabelShelfLifeValue] = useState("3");
  const [newLabelShelfLifeUnit, setNewLabelShelfLifeUnit] = useState<NonNullable<HaccpLabelProfile["shelf_life_unit"]>>("days");
  const [newLabelPackaging, setNewLabelPackaging] = useState("");
  const [newLabelStorageHint, setNewLabelStorageHint] = useState("");
  const [newLabelAllergensText, setNewLabelAllergensText] = useState("");
  const [selectedLabelProfileId, setSelectedLabelProfileId] = useState("");
  const [selectedLabelPlannedScheduleId, setSelectedLabelPlannedScheduleId] = useState("");
  const [newLabelSessionQuantity, setNewLabelSessionQuantity] = useState("12");
  const [newLabelSessionSourceLotCode, setNewLabelSessionSourceLotCode] = useState("");

  const [serviceDate, setServiceDate] = useState(getTodayIsoDate());
  const [comandaDateFrom, setComandaDateFrom] = useState(getTodayIsoDate());
  const [comandaDateTo, setComandaDateTo] = useState(getTodayIsoDate());
  const [menuSpaces, setMenuSpaces] = useState<MenuSpace[]>(DEFAULT_MENU_SPACES);
  const [activeMenuSpaceId, setActiveMenuSpaceId] = useState(DEFAULT_MENU_SPACES[0].id);
  const [isMenuEditorOpen, setIsMenuEditorOpen] = useState(false);
  const [isMenuAdvancedMode, setIsMenuAdvancedMode] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState(DEFAULT_MENU_SPACES[0].id);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryTitle, setEntryTitle] = useState("");
  const [entryFicheProductId, setEntryFicheProductId] = useState<string | null>(null);
  const [entryKind, setEntryKind] = useState<"recipe" | "product">("recipe");
  const [entryExpectedQty, setEntryExpectedQty] = useState("0");
  const [entrySection, setEntrySection] = useState("");
  const [entryValidFrom, setEntryValidFrom] = useState("");
  const [entryValidTo, setEntryValidTo] = useState("");
  const [entryScheduleMode, setEntryScheduleMode] = useState<EntryScheduleMode>("permanent");
  const [entryWeekdays, setEntryWeekdays] = useState<number[]>([]);
  const [newSpaceLabel, setNewSpaceLabel] = useState("");
  const [newSpaceType, setNewSpaceType] = useState<MenuSpaceType>("recipes");
  const [newSectionName, setNewSectionName] = useState("");
  const [recipeTitleSuggestions, setRecipeTitleSuggestions] = useState<RecipeTitleSuggestion[]>(
    FICHE_RECIPE_SUGGESTIONS.map((title) => ({ fiche_product_id: "", title }))
  );
  const [recipePickerSearch, setRecipePickerSearch] = useState("");
  const [selectedRecipeKeys, setSelectedRecipeKeys] = useState<string[]>([]);
  const [supplierProductSuggestions, setSupplierProductSuggestions] = useState<string[]>([]);
  const [ingredientsView, setIngredientsView] = useState<ChecklistView>("supplier");
  const [quantityMode, setQuantityMode] = useState<QuantityMode>("with_qty");
  const [ingredientsRows, setIngredientsRows] = useState<Array<Record<string, unknown>>>([]);
  const [ingredientWarnings, setIngredientWarnings] = useState<string[]>([]);
  const [selectedComandaSpaces, setSelectedComandaSpaces] = useState<string[]>([]);
  const [selectedComandaSections, setSelectedComandaSections] = useState<string[]>([]);
  const [recipeDerivedSections, setRecipeDerivedSections] = useState<string[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [sectorSearch, setSectorSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [isChecklistLoading, setIsChecklistLoading] = useState(false);
  const previousNavRef = useRef<NavKey>("dashboard");

  const canUpload = useMemo(() => siteId.trim().length > 0 && uploadFile !== null, [siteId, uploadFile]);
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const errorWithDetail = (labelKey: string, detail: unknown) =>
    t("notice.errorWithDetail", { label: t(labelKey), detail: String(detail) });

  const normalizedData = useMemo(() => {
    try {
      return asRecord(JSON.parse(normalizedPayload));
    } catch {
      return {};
    }
  }, [normalizedPayload]);
  const normalizedMeta = useMemo(() => asRecord(normalizedData.metadata), [normalizedData]);

  const previewLines = useMemo(() => asArray(normalizedData.lines), [normalizedData]);
  const filteredHaccpColdPoints = useMemo(
    () =>
      haccpColdPoints.filter((item) => {
        if (!selectedHaccpSectorId) return true;
        return item.sector === selectedHaccpSectorId;
      }),
    [haccpColdPoints, selectedHaccpSectorId]
  );
  const labelPlanningSchedules = useMemo(
    () => haccpSchedules.filter((item) => item.task_type === "label_print"),
    [haccpSchedules]
  );

  useEffect(() => {
    setDefaultApiKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    const syncHashState = () => {
      const parsed = parseTraceabilityReconciliationHash(window.location.hash);
      setIsTraceabilityReconciliationPage(parsed.active);
      if (parsed.siteId) {
        setReconciliationInitialSiteId(parsed.siteId);
        setReconciliationSiteFilter(parsed.siteId);
      }
    };
    syncHashState();
    window.addEventListener("hashchange", syncHashState);
    return () => window.removeEventListener("hashchange", syncHashState);
  }, []);

  useEffect(() => {
    if (siteId) {
      localStorage.setItem(SELECTED_SITE_STORAGE_KEY, siteId);
    } else {
      localStorage.removeItem(SELECTED_SITE_STORAGE_KEY);
    }
  }, [siteId]);

  useEffect(() => {
    localStorage.setItem(
      REPORT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        date_from: reportDateFrom,
        date_to: reportDateTo,
        review_status: reportReviewStatus,
        search: reportSearch,
        only_anomalies: reportOnlyAnomalies,
        supplier_search: reportSupplierSearch,
        product_search: reportProductSearch,
        lot_search: reportLotSearch,
      })
    );
  }, [reportDateFrom, reportDateTo, reportReviewStatus, reportSearch, reportOnlyAnomalies, reportSupplierSearch, reportProductSearch, reportLotSearch]);

  useEffect(() => {
    void loadSites();
  }, []);

  useEffect(() => {
    if (nav !== "acquisti") return;
    if (!selectedDocId) return;
    if (isClaudeExtracting) return;
    if (selectedExtractionId) return;
    void onExtractWithClaude(selectedDocId);
  }, [nav, selectedDocId]);

  useEffect(() => {
    if (nav !== "acquisti" && nav !== "haccp" && nav !== "tracciabilita" && nav !== "dashboard" && nav !== "report") return;
    if (!siteId) {
      setDocuments([]);
      return;
    }
    void loadDocuments();
  }, [nav, siteId]);

  useEffect(() => {
    if (nav !== "inventario" && nav !== "inventari") return;
    if (!siteId) return;
    void loadStockSummary();
  }, [nav, siteId]);

  useEffect(() => {
    if (nav !== "haccp" && nav !== "tracciabilita" && nav !== "dashboard" && nav !== "report") return;
    if (!siteId) return;
    void loadHaccpData();
  }, [nav, siteId]);

  useEffect(() => {
    if (!isTraceabilityReconciliationPage) return;
    if (sites.length === 0) return;
    void loadCentralTraceabilityReconciliation();
    void loadTraceabilityReconciliationDecisions();
    void loadRegisteredInvoices();
  }, [isTraceabilityReconciliationPage, sites]);

  useEffect(() => {
    const queue = normalizeHaccpOcrQueueRowsFromDocuments(documents);
    if (!queue.length) {
      setSelectedHaccpDocumentId("");
      return;
    }
    if (selectedHaccpDocumentId && queue.some((item) => item.document_id === selectedHaccpDocumentId)) {
      return;
    }
    setSelectedHaccpDocumentId(queue[0].document_id);
  }, [documents, selectedHaccpDocumentId]);

  useEffect(() => {
    if (!haccpSectors.length) {
      setSelectedHaccpSectorId("");
      return;
    }
    if (selectedHaccpSectorId && haccpSectors.some((item) => item.id === selectedHaccpSectorId)) {
      return;
    }
    setSelectedHaccpSectorId(haccpSectors[0].id);
  }, [haccpSectors, selectedHaccpSectorId]);

  useEffect(() => {
    void loadSupplierProductsForSupplier(newSupplierProductSupplierId);
  }, [newSupplierProductSupplierId]);

  useEffect(() => {
    if (!filteredHaccpColdPoints.length) {
      setSelectedHaccpColdPointId("");
      return;
    }
    if (selectedHaccpColdPointId && filteredHaccpColdPoints.some((item) => item.id === selectedHaccpColdPointId)) {
      return;
    }
    setSelectedHaccpColdPointId(filteredHaccpColdPoints[0].id);
  }, [filteredHaccpColdPoints, selectedHaccpColdPointId]);

  useEffect(() => {
    if (editingHaccpSectorId && !haccpSectors.some((item) => item.id === editingHaccpSectorId)) {
      resetHaccpSectorForm();
    }
  }, [editingHaccpSectorId, haccpSectors]);

  useEffect(() => {
    if (editingHaccpColdPointId && !haccpColdPoints.some((item) => item.id === editingHaccpColdPointId)) {
      resetHaccpColdPointForm();
    }
  }, [editingHaccpColdPointId, haccpColdPoints]);

  useEffect(() => {
    if (!haccpLabelProfiles.length) {
      setSelectedLabelProfileId("");
      return;
    }
    if (selectedLabelProfileId && haccpLabelProfiles.some((item) => item.id === selectedLabelProfileId)) {
      return;
    }
    setSelectedLabelProfileId(haccpLabelProfiles[0].id);
  }, [haccpLabelProfiles, selectedLabelProfileId]);

  useEffect(() => {
    if (!labelPlanningSchedules.length) {
      setSelectedLabelPlannedScheduleId("");
      return;
    }
    if (selectedLabelPlannedScheduleId && labelPlanningSchedules.some((item) => item.id === selectedLabelPlannedScheduleId)) {
      return;
    }
    setSelectedLabelPlannedScheduleId(labelPlanningSchedules[0].id);
  }, [labelPlanningSchedules, selectedLabelPlannedScheduleId]);

  useEffect(() => {
    const selected = documents.find((doc) => doc.id === selectedDocId) ?? null;
    const raw = String(selected?.file || selected?.storage_path || "").trim();
    let resolvedUrl = "";
    if (raw) {
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        resolvedUrl = raw;
      } else {
        const apiBase = getApiBase();
        const root = apiBase.replace(/\/api\/v1\/?$/, "");
        resolvedUrl = raw.startsWith("/") ? `${root}${raw}` : `${root}/media/${raw.replace(/^media\//, "")}`;
      }
    }

    if (!resolvedUrl) {
      setOriginalDocumentBlobUrl("");
      setIsOriginalDocumentLoading(false);
      return;
    }
    let active = true;
    let nextBlobUrl = "";
    setIsOriginalDocumentLoading(true);
    fetch(resolvedUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`preview_http_${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        nextBlobUrl = URL.createObjectURL(blob);
        setOriginalDocumentBlobUrl(nextBlobUrl);
      })
      .catch(() => {
        if (!active) return;
        setOriginalDocumentBlobUrl("");
      })
      .finally(() => {
        if (active) setIsOriginalDocumentLoading(false);
      });
    return () => {
      active = false;
      if (nextBlobUrl) URL.revokeObjectURL(nextBlobUrl);
    };
  }, [documents, selectedDocId]);

  useEffect(() => {
    const selected = documents.find((doc) => doc.id === selectedDocId) ?? null;
    const latest = selected?.latest_extraction;
    if (latest?.status === "succeeded") {
      if (latest.id) {
        setSelectedExtractionId(latest.id);
      }
      setNormalizedPayload(JSON.stringify(latest.normalized_payload ?? {}, null, 2));
      setIntakeStage("review");
    } else if (!latest) {
      setSelectedExtractionId("");
    }
  }, [documents, selectedDocId]);

  useEffect(() => {
    const storedSpaces = localStorage.getItem(MENU_SPACES_STORAGE_KEY);
    if (storedSpaces) {
      try {
        const parsed = JSON.parse(storedSpaces) as MenuSpace[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const structureOnly = parsed.map((space) => ({
            ...space,
            schedule_mode: space.schedule_mode ?? inferScheduleModeFromSpaceId(space.id),
            entries: [],
          }));
          setMenuSpaces(structureOnly);
          const firstEnabled = structureOnly
            .filter((space) => space.enabled)
            .sort((a, b) => a.order - b.order)[0];
          if (firstEnabled) {
            setActiveMenuSpaceId(firstEnabled.id);
            setEditingSpaceId(firstEnabled.id);
          }
        }
      } catch {
        setMenuSpaces(DEFAULT_MENU_SPACES);
      }
    }
    const storedAdvanced = localStorage.getItem(MENU_ADVANCED_STORAGE_KEY);
    if (storedAdvanced === "1") {
      setIsMenuAdvancedMode(true);
    }
  }, []);

  useEffect(() => {
    const structureOnly = menuSpaces.map((space) => ({ ...space, entries: [] }));
    localStorage.setItem(MENU_SPACES_STORAGE_KEY, JSON.stringify(structureOnly));
  }, [menuSpaces]);

  useEffect(() => {
    if (!siteId || !serviceDate) return;
    const cache = readMenuSpacesCache();
    cache[getMenuSpacesCacheContextKey(siteId, serviceDate)] = menuSpaces;
    writeMenuSpacesCache(cache);
  }, [menuSpaces, siteId, serviceDate]);

  useEffect(() => {
    localStorage.setItem(MENU_ADVANCED_STORAGE_KEY, isMenuAdvancedMode ? "1" : "0");
  }, [isMenuAdvancedMode]);

  useEffect(() => {
    if (!isMenuEditorOpen) return;
    if (entryKind === "product") return;
    const search = recipePickerSearch.trim();
    void loadRecipeTitleSuggestions(search);
  }, [isMenuEditorOpen, entryKind, recipePickerSearch]);

  useEffect(() => {
    if (!isMenuEditorOpen) return;
    const currentEditingSpace =
      menuSpaces.find((space) => space.id === editingSpaceId) ??
      menuSpaces.find((space) => space.id === activeMenuSpaceId) ??
      null;
    if (entryKind !== "product" && currentEditingSpace?.type === "recipes") return;
    const search = entryTitle.trim();
    void loadSupplierProductSuggestions(search);
  }, [isMenuEditorOpen, entryKind, entryTitle, menuSpaces, editingSpaceId, activeMenuSpaceId]);

  useEffect(() => {
    if (!isMenuEditorOpen || entryKind !== "recipe") return;
    if (selectedRecipeKeys.length === 0) {
      if (!editingEntryId) {
        setEntryTitle("");
      }
      setEntryFicheProductId(null);
      return;
    }
    const selectedSet = new Set(selectedRecipeKeys);
    const match = recipeTitleSuggestions.find((item) => selectedSet.has(recipeSuggestionKey(item)));
    if (match) {
      setEntryTitle(match.title ?? "");
      setEntryFicheProductId(match.fiche_product_id || null);
      if (!editingEntryId) {
        const portions = Number.parseFloat(String(match.portions ?? ""));
        const current = Number.parseFloat(entryExpectedQty);
        if (Number.isFinite(portions) && portions > 0 && (!Number.isFinite(current) || current <= 0)) {
          setEntryExpectedQty(portions.toString());
        }
        const category = String(match.category ?? "").trim();
        if (category && !entrySection.trim()) {
          setEntrySection(category);
        }
      }
    }
  }, [isMenuEditorOpen, entryKind, selectedRecipeKeys, recipeTitleSuggestions, editingEntryId, entryExpectedQty, entrySection]);

  useEffect(() => {
    if (entryKind === "product") {
      setEntryFicheProductId(null);
    }
  }, [entryKind]);

  useEffect(() => {
    if (nav !== "ricette") return;
    if (!siteId || !serviceDate) return;
    void loadServiceMenuEntries(siteId, serviceDate);
  }, [nav, siteId, serviceDate]);

  useEffect(() => {
    const previousNav = previousNavRef.current;
    if (previousNav === "comande" && nav !== "comande") {
      resetComandeState();
    }
    previousNavRef.current = nav;
  }, [nav]);

  useEffect(() => {
    setIngredientsRows([]);
    setIngredientWarnings([]);
    setRecipeDerivedSections([]);
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    if (ingredientsRows.length === 0) return;
    void loadIngredientsChecklist(ingredientsView);
  }, [ingredientsView, quantityMode]);

  function buildSiteCode(raw: string) {
    return raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  const sortedEnabledSpaces = useMemo(
    () => menuSpaces.filter((space) => space.enabled).sort((a, b) => a.order - b.order),
    [menuSpaces]
  );
  const availableComandaSpaces = useMemo(
    () => sortedEnabledSpaces.map((space) => ({ id: space.id, label: space.label })),
    [sortedEnabledSpaces]
  );
  const availableComandaSections = useMemo(() => {
    const found = new Set<string>();
    menuSpaces.forEach((space) => {
      space.entries.forEach((entry) => {
        const normalized = String(entry.recipe_category || entry.section || "").trim();
        if (normalized) {
          found.add(normalized);
        }
      });
    });
    recipeDerivedSections.forEach((section) => {
      const normalized = section.trim();
      if (normalized) found.add(normalized);
    });
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [menuSpaces, recipeDerivedSections]);

  const activeMenuSpace = useMemo(
    () => menuSpaces.find((space) => space.id === activeMenuSpaceId) ?? sortedEnabledSpaces[0] ?? null,
    [menuSpaces, activeMenuSpaceId, sortedEnabledSpaces]
  );

  const editingSpace = useMemo(
    () => menuSpaces.find((space) => space.id === editingSpaceId) ?? activeMenuSpace,
    [menuSpaces, editingSpaceId, activeMenuSpace]
  );

  const menuSuggestions = useMemo<MenuSuggestion[]>(() => {
    const recipeSuggestions: MenuSuggestion[] = recipeTitleSuggestions.map((item) => ({
      key: `${item.fiche_product_id || "snap"}:${item.title}`,
      value: item.title,
      fiche_product_id: item.fiche_product_id || null,
    }));
    const productSuggestions: MenuSuggestion[] = supplierProductSuggestions.map((title) => ({
      key: `product:${title}`,
      value: title,
      fiche_product_id: null,
    }));
    if (!editingSpace) return recipeSuggestions;
    if (editingSpace.type === "recipes") return recipeSuggestions;
    if (editingSpace.type === "supplier_products") return productSuggestions;
    return [...recipeSuggestions, ...productSuggestions];
  }, [editingSpace, recipeTitleSuggestions, supplierProductSuggestions]);

  useEffect(() => {
    if (availableComandaSpaces.length === 0) {
      setSelectedComandaSpaces([]);
      return;
    }
    setSelectedComandaSpaces((prev) => {
      const validIds = new Set(availableComandaSpaces.map((space) => space.id));
      if (prev.length === 0) {
        return availableComandaSpaces.map((space) => space.id);
      }
      const next = prev.filter((id) => validIds.has(id));
      return next.length > 0 ? next : availableComandaSpaces.map((space) => space.id);
    });
  }, [availableComandaSpaces]);

  useEffect(() => {
    if (availableComandaSections.length === 0) {
      setSelectedComandaSections([]);
      return;
    }
    setSelectedComandaSections((prev) => {
      const valid = new Set(availableComandaSections);
      if (prev.length === 0) {
        return [...availableComandaSections];
      }
      const next = prev.filter((section) => valid.has(section));
      return next.length > 0 ? next : [...availableComandaSections];
    });
  }, [availableComandaSections]);

  async function loadRecipeTitleSuggestions(search = "") {
    try {
      const limit = search ? 200 : 1000;
      const query = search ? `?q=${encodeURIComponent(search)}&limit=${limit}` : `?limit=${limit}`;
      const res = await apiFetch(`/integration/fiches/recipe-titles/${query}`);
      const body = await res.json();
      if (!res.ok) {
        setRecipeTitleSuggestions(FICHE_RECIPE_SUGGESTIONS.map((title) => ({ fiche_product_id: "", title })));
        return;
      }
      const titles = ((body.results ?? []) as Array<RecipeTitleSuggestion>)
        .map((item) => ({
          fiche_product_id: item.fiche_product_id ?? "",
          title: item.title?.trim() ?? "",
          portions: item.portions ?? null,
          category: item.category?.toString().trim() ?? "",
        }))
        .filter((item) => item.title.length > 0);
      setRecipeTitleSuggestions(
        titles.length > 0 ? titles : FICHE_RECIPE_SUGGESTIONS.map((title) => ({ fiche_product_id: "", title }))
      );
    } catch {
      setRecipeTitleSuggestions(FICHE_RECIPE_SUGGESTIONS.map((title) => ({ fiche_product_id: "", title })));
    }
  }

  async function loadSupplierProductSuggestions(search = "") {
    try {
      const query = search ? `?active=1&q=${encodeURIComponent(search)}` : "?active=1";
      const res = await apiFetch(`/supplier-products/${query}`);
      const body = await res.json();
      if (!res.ok) {
        setSupplierProductSuggestions([]);
        return;
      }
      const names = ((body ?? []) as Array<{ name?: string }>).map((item) => item.name?.trim() ?? "").filter(Boolean);
      setSupplierProductSuggestions([...new Set(names)]);
    } catch {
      setSupplierProductSuggestions([]);
    }
  }

  async function loadServiceMenuEntries(
    targetSiteId: string,
    targetServiceDate: string,
    withNotice = false,
    applyToState = true
  ) {
    if (!targetSiteId || !targetServiceDate) {
      if (withNotice) {
        setNotice(t("validation.selectSiteBeforeChecklist"));
      }
      return false;
    }
    try {
      const res = await apiFetch(
        `/servizio/menu-entries/sync?site=${encodeURIComponent(targetSiteId)}&date=${encodeURIComponent(targetServiceDate)}`
      );
      const body = await res.json();
      if (!res.ok) {
        const cached = readMenuSpacesCache()[getMenuSpacesCacheContextKey(targetSiteId, targetServiceDate)];
        if (Array.isArray(cached) && cached.length > 0) {
          if (applyToState) {
            setMenuSpaces(cached);
            ensureActiveSpaceStillValid(cached);
          }
          setNotice(t("notice.menuLoadedFromCache", { date: targetServiceDate }));
          return true;
        }
        if (withNotice) {
          setNotice(errorWithDetail("error.menuLoad", body.detail ?? JSON.stringify(body)));
        }
        return false;
      }
      const baseSpaces = (menuSpaces.length > 0 ? menuSpaces : DEFAULT_MENU_SPACES).map((space) => ({
        ...space,
        schedule_mode: space.schedule_mode ?? inferScheduleModeFromSpaceId(space.id),
        entries: [],
      }));
      const spaceMap = new Map<string, MenuSpace>(baseSpaces.map((space) => [space.id, space]));
      const entries = (body.entries ?? []) as Array<{
        id: string;
        space_key: string;
        section?: string | null;
        title: string;
        fiche_product_id?: string | null;
        expected_qty?: string;
        sort_order?: number;
        metadata?: Record<string, unknown>;
      }>;
      entries
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((item) => {
          const key = item.space_key;
          if (!spaceMap.has(key)) {
            const generated: MenuSpace = {
              id: key,
              label: key.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
              enabled: true,
              order: spaceMap.size + 1,
              type: "mixed",
              schedule_mode: inferScheduleModeFromSpaceId(key),
              sections: [],
              entries: [],
            };
            spaceMap.set(key, generated);
          }
          const space = spaceMap.get(key)!;
          const meta = item.metadata ?? {};
          const itemKind = meta.item_kind === "product" ? "product" : "recipe";
          const validFrom = typeof meta.valid_from === "string" ? meta.valid_from : "";
          const validTo = typeof meta.valid_to === "string" ? meta.valid_to : "";
          const recipeCategory = typeof meta.recipe_category === "string" ? meta.recipe_category : "";
          const scheduleModeRaw = String(meta.schedule_mode ?? "").trim().toLowerCase();
          const scheduleMode: EntryScheduleMode =
            scheduleModeRaw === "date_specific" || scheduleModeRaw === "recurring_weekly" || scheduleModeRaw === "permanent"
              ? (scheduleModeRaw as EntryScheduleMode)
              : (space.schedule_mode ?? inferScheduleModeFromSpaceId(space.id));
          const weekdays = normalizeWeekdays(meta.weekdays);
          space.entries.push({
            id: item.id,
            title: item.title,
            item_kind: itemKind,
            section: item.section ?? "",
            recipe_category: recipeCategory,
            fiche_product_id: item.fiche_product_id ?? null,
            expected_qty: item.expected_qty ?? "0",
            valid_from: validFrom,
            valid_to: validTo,
            schedule_mode: scheduleMode,
            weekdays,
          });
        });
      const nextSpaces = Array.from(spaceMap.values()).sort((a, b) => a.order - b.order);
      if (applyToState) {
        setMenuSpaces(nextSpaces);
        ensureActiveSpaceStillValid(nextSpaces);
      }
      const cache = readMenuSpacesCache();
      cache[getMenuSpacesCacheContextKey(targetSiteId, targetServiceDate)] = nextSpaces;
      writeMenuSpacesCache(cache);
      return true;
    } catch {
      const cached = readMenuSpacesCache()[getMenuSpacesCacheContextKey(targetSiteId, targetServiceDate)];
      if (Array.isArray(cached) && cached.length > 0) {
        if (applyToState) {
          setMenuSpaces(cached);
          ensureActiveSpaceStillValid(cached);
        }
        setNotice(t("notice.menuLoadedFromCache", { date: targetServiceDate }));
        return true;
      }
      if (withNotice) {
        setNotice(t("error.menuLoadBackend"));
      }
      return false;
    }
  }

  function ensureActiveSpaceStillValid(nextSpaces: MenuSpace[]) {
    const nextEnabled = nextSpaces.filter((space) => space.enabled).sort((a, b) => a.order - b.order);
    if (nextEnabled.length === 0) {
      setActiveMenuSpaceId("");
      return;
    }
    const stillExists = nextEnabled.some((space) => space.id === activeMenuSpaceId);
    if (!stillExists) {
      setActiveMenuSpaceId(nextEnabled[0].id);
    }
  }

  function openMenuEditor(spaceId: string, entry?: MenuEntry) {
    const space = menuSpaces.find((item) => item.id === spaceId);
    if (!space) return;
    setEditingSpaceId(space.id);
    setEntryTitle(entry?.title ?? "");
    setEntryFicheProductId(entry?.fiche_product_id ?? null);
    setEntryKind(entry?.item_kind ?? (space.type === "supplier_products" ? "product" : "recipe"));
    setEntryExpectedQty(entry?.expected_qty ?? "0");
    setEntrySection(entry?.section ?? entry?.recipe_category ?? "");
    setEntryValidFrom(entry?.valid_from ?? "");
    setEntryValidTo(entry?.valid_to ?? "");
    setEntryScheduleMode(entry?.schedule_mode ?? space.schedule_mode ?? inferScheduleModeFromSpaceId(space.id));
    setEntryWeekdays(entry?.weekdays ?? []);
    setEditingEntryId(entry?.id ?? null);
    setRecipePickerSearch(entry?.title ?? "");
    if (entry?.item_kind === "recipe" && entry?.title) {
      const selectedKey = entry.fiche_product_id
        ? `fiche:${String(entry.fiche_product_id).trim()}`
        : `title:${entry.title.trim().toLowerCase()}`;
      setSelectedRecipeKeys([selectedKey]);
    } else {
      setSelectedRecipeKeys([]);
    }
    setIsMenuEditorOpen(true);
  }

  function moveMenuEntry(spaceId: string, entryId: string, direction: "up" | "down") {
    setMenuSpaces((prev) =>
      {
        const next = prev.map((space) => {
          if (space.id !== spaceId) return space;
          const index = space.entries.findIndex((entry) => entry.id === entryId);
          if (index < 0) return space;
          const targetIndex = direction === "up" ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= space.entries.length) return space;
          const nextEntries = [...space.entries];
          const [current] = nextEntries.splice(index, 1);
          nextEntries.splice(targetIndex, 0, current);
          return { ...space, entries: nextEntries };
        });
        void syncServiceMenuEntries(next, false);
        return next;
      }
    );
  }

  function deleteMenuEntry(spaceId: string, entryId: string) {
    setMenuSpaces((prev) =>
      {
        const next = prev.map((space) =>
          space.id === spaceId ? { ...space, entries: space.entries.filter((entry) => entry.id !== entryId) } : space
        );
        void syncServiceMenuEntries(next, false);
        return next;
      }
    );
  }

  function addMenuSpace() {
    const label = newSpaceLabel.trim();
    if (!label) {
      setNotice(t("validation.spaceNameRequired"));
      return;
    }
    const id = buildSiteCode(label).toLowerCase();
    if (!id) {
      setNotice(t("validation.spaceNameInvalid"));
      return;
    }
    if (menuSpaces.some((space) => space.id === id)) {
      setNotice(t("validation.spaceExists"));
      return;
    }
    const nextSpace: MenuSpace = {
      id,
      label,
      enabled: true,
      order: menuSpaces.length + 1,
      type: newSpaceType,
      schedule_mode: newSpaceType === "recipes" ? "permanent" : "date_specific",
      sections: [],
      entries: [],
    };
    const nextSpaces = [...menuSpaces, nextSpace];
    setMenuSpaces(nextSpaces);
    void syncServiceMenuEntries(nextSpaces, false);
    setNewSpaceLabel("");
    setNewSpaceType("recipes");
    setActiveMenuSpaceId(nextSpace.id);
    setEditingSpaceId(nextSpace.id);
    setNotice(t("notice.spaceCreated", { label }));
  }

  function updateMenuSpace(spaceId: string, patch: Partial<MenuSpace>) {
    const nextSpaces = menuSpaces.map((space) => (space.id === spaceId ? { ...space, ...patch } : space));
    setMenuSpaces(nextSpaces);
    ensureActiveSpaceStillValid(nextSpaces);
    void syncServiceMenuEntries(nextSpaces, false);
  }

  function removeMenuSpace(spaceId: string) {
    const nextSpaces = menuSpaces.filter((space) => space.id !== spaceId);
    if (nextSpaces.length === 0) {
      setNotice(t("validation.keepAtLeastOneSpace"));
      return;
    }
    setMenuSpaces(nextSpaces);
    ensureActiveSpaceStillValid(nextSpaces);
    void syncServiceMenuEntries(nextSpaces, false);
  }

  function addMenuSection() {
    const section = newSectionName.trim();
    if (!section || !editingSpace) return;
    if (editingSpace.sections.includes(section)) {
      setNotice(t("validation.sectionExists"));
      return;
    }
    setMenuSpaces((prev) =>
      {
        const next = prev.map((space) =>
          space.id === editingSpace.id ? { ...space, sections: [...space.sections, section] } : space
        );
        void syncServiceMenuEntries(next, false);
        return next;
      }
    );
    setNewSectionName("");
  }

  async function loadSites() {
    try {
      const res = await apiFetch("/sites/?include_inactive=1");
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.sitesLoad", body.detail ?? JSON.stringify(body)));
        return;
      }
      const data = body as SiteItem[];
      setSites(data);
      const activeSites = data.filter((site) => site.is_active);
      const selectedIsActive = activeSites.some((site) => site.id === siteId);
      if (!selectedIsActive) {
        setSiteId(activeSites[0]?.id ?? "");
      }
      if (data.length === 0) {
        setSiteId("");
        setNotice(t("notice.noActiveSites"));
        return;
      }
      setNotice(t("notice.sitesLoaded", { count: data.length }));
    } catch {
      setNotice(t("error.apiConnectionSites"));
    }
  }

  async function ensureHaccpSiteSynced(targetSiteId?: string) {
    const resolvedSiteId = (targetSiteId || siteId || "").trim();
    if (!resolvedSiteId) {
      setNotice(t("validation.selectSite"));
      return false;
    }
    const site = sites.find((item) => item.id === resolvedSiteId);
    if (!site) {
      setNotice(`Sito non trovato nella sessione locale: ${resolvedSiteId}. Aggiorna l'elenco siti.`);
      return false;
    }
    const res = await apiFetch("/haccp/traccia/sites/sync/", {
      method: "POST",
      body: JSON.stringify({
        sites: [
          {
            external_id: resolvedSiteId,
            code: site.code,
            name: site.name,
            timezone: "Europe/Paris",
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setNotice(errorWithDetail("error.siteCreate", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
      return false;
    }
    return true;
  }

  async function onCreateSite(e: FormEvent) {
    e.preventDefault();
    const name = newSiteName.trim();
    if (!name) {
      setNotice(t("validation.siteNameRequired"));
      return;
    }
    const code = buildSiteCode(newSiteCode.trim() || name);
    if (!code) {
      setNotice(t("validation.siteCodeInvalid"));
      return;
    }

    try {
      const res = await apiFetch("/sites/", {
        method: "POST",
        body: JSON.stringify({ name, code }),
      });
      const body = await res.json();
      if (!res.ok) {
        const fieldError = body.code?.[0] ?? body.name?.[0];
        setNotice(errorWithDetail("error.siteCreate", body.detail ?? fieldError ?? JSON.stringify(body)));
        return;
      }
      setNewSiteName("");
      setNewSiteCode("");
      setNotice(t("notice.siteCreated", { name: body.name }));
      await loadSites();
    } catch {
      setNotice(t("error.siteCreateConnection"));
    }
  }

  async function onDisableSite(targetSiteId: string) {
    if (!window.confirm(t("confirm.disableSite"))) {
      return;
    }
    const res = await apiFetch(`/sites/${targetSiteId}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.siteDisable", body.detail ?? JSON.stringify(body)));
      return;
    }
    if (siteId === targetSiteId) {
      setSiteId("");
    }
    setNotice(t("notice.siteDisabled"));
    await loadSites();
  }

  async function onHardDeleteSite() {
    if (!siteToDelete) return;
    const res = await apiFetch(`/sites/${siteToDelete.id}/`, {
      method: "DELETE",
      body: JSON.stringify({ confirm_text: deleteConfirmText }),
    });
    if (!res.ok) {
      const body = await res.json();
      setNotice(errorWithDetail("error.siteDelete", body.detail ?? JSON.stringify(body)));
      return;
    }
    if (siteId === siteToDelete.id) {
      setSiteId("");
    }
    setNotice(t("notice.siteDeleted", { name: siteToDelete.name }));
    setSiteToDelete(null);
    setDeleteConfirmText("");
    await loadSites();
  }

  function closeDeleteSiteDialog() {
    setSiteToDelete(null);
    setDeleteConfirmText("");
  }

  async function onReactivateSite(targetSiteId: string) {
    const res = await apiFetch(`/sites/${targetSiteId}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.siteReactivate", body.detail ?? JSON.stringify(body)));
      return;
    }
    setNotice(t("notice.siteReactivated", { name: body.name }));
    if (!siteId) {
      setSiteId(body.id);
    }
    await loadSites();
  }

  async function loadSuppliers() {
    const res = await apiFetch("/suppliers/");
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.suppliersLoad", body.detail ?? JSON.stringify(body)));
      return;
    }
    setSuppliers(body as SupplierItem[]);
    setNotice(t("notice.suppliersUpdated", { count: (body as SupplierItem[]).length }));
  }

  async function onCreateSupplier(e: FormEvent) {
    e.preventDefault();
    if (!newSupplierName.trim()) return;

    const res = await apiFetch("/suppliers/", {
      method: "POST",
      body: JSON.stringify({ name: newSupplierName.trim(), metadata: { source: "front-office" } }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.supplierCreate", body.detail ?? JSON.stringify(body)));
      return;
    }
    setNewSupplierName("");
    setNotice(t("notice.supplierCreated", { name: body.name }));
    await loadSuppliers();
  }

  async function onSaveSupplierRules(e: FormEvent) {
    e.preventDefault();
    if (!selectedSupplier) {
      setNotice(t("suppliers.selectSupplierNotice"));
      return;
    }
    const existingMetadata = selectedSupplier.metadata && typeof selectedSupplier.metadata === "object"
      ? selectedSupplier.metadata
      : {};
    const existingRules = existingMetadata.integration_rules && typeof existingMetadata.integration_rules === "object"
      ? existingMetadata.integration_rules as Record<string, unknown>
      : {};
    const nextRules: Record<string, unknown> = { ...existingRules };
    if (normalizedSupplierRulePrefixes.length) {
      nextRules.strip_supplier_code_prefixes = normalizedSupplierRulePrefixes;
    } else {
      delete nextRules.strip_supplier_code_prefixes;
    }
    const nextMetadata: Record<string, unknown> = { ...existingMetadata };
    if (Object.keys(nextRules).length) {
      nextMetadata.integration_rules = nextRules;
    } else {
      delete nextMetadata.integration_rules;
    }
    const res = await apiFetch(`/suppliers/${encodeURIComponent(selectedSupplier.id)}/`, {
      method: "PATCH",
      body: JSON.stringify({ metadata: nextMetadata }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.supplierCreate", body.detail ?? JSON.stringify(body)));
      return;
    }
    setSuppliers((prev) => prev.map((supplier) => (supplier.id === body.id ? body as SupplierItem : supplier)));
    setNotice(t("suppliers.rulesSaved", { name: selectedSupplier.name }));
  }

  async function onCreateSupplierProduct(e: FormEvent) {
    e.preventDefault();
    const supplierId = newSupplierProductSupplierId.trim();
    const name = newSupplierProductName.trim();
    if (!supplierId) {
      setNotice(t("suppliers.selectSupplierNotice"));
      return;
    }
    if (!name) {
      setNotice(t("suppliers.enterProductName"));
      return;
    }
    const payload: Record<string, unknown> = {
      name,
      supplier_sku: newSupplierProductSku.trim() || null,
      uom: newSupplierProductUom,
      pack_qty: newSupplierProductPackQty.trim() || null,
      category: newSupplierProductCategory.trim() || null,
    };
    const res = await apiFetch(`/suppliers/${encodeURIComponent(supplierId)}/products/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.supplierCreate", body.detail ?? JSON.stringify(body)));
      return;
    }
    setNotice(t("suppliers.productCreated"));
    setNewSupplierProductSupplierId("");
    setNewSupplierProductName("");
    setNewSupplierProductSku("");
    setNewSupplierProductUom("kg");
    setNewSupplierProductPackQty("");
    setNewSupplierProductCategory("");
    await loadSupplierProductSuggestions();
    await loadSupplierProductsForSupplier(supplierId);
  }

  async function loadSupplierProductsForSupplier(supplierId: string) {
    if (!supplierId) {
      setSupplierProducts([]);
      return;
    }
    setIsSupplierProductsLoading(true);
    try {
      const res = await apiFetch(`/suppliers/${encodeURIComponent(supplierId)}/products/`);
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.suppliersLoad", body.detail ?? JSON.stringify(body)));
        return;
      }
      setSupplierProducts(Array.isArray(body) ? body : []);
    } catch {
      setNotice(t("error.documentsLoad"));
    } finally {
      setIsSupplierProductsLoading(false);
    }
  }

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearchText.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((supplier) => supplier.name.toLowerCase().includes(q));
  }, [suppliers, supplierSearchText]);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null,
    [suppliers, selectedSupplierId],
  );

  const normalizedSupplierRulePrefixes = useMemo(
    () =>
      supplierRulePrefixesInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [supplierRulePrefixesInput],
  );

  const normalizedSupplierRuleExample = useMemo(() => {
    let value = supplierRuleExampleInput.trim();
    for (const prefix of normalizedSupplierRulePrefixes) {
      if (value.toUpperCase().startsWith(prefix.toUpperCase())) {
        value = value.slice(prefix.length).trimStart();
      }
    }
    return value || "-";
  }, [normalizedSupplierRulePrefixes, supplierRuleExampleInput]);

  useEffect(() => {
    const metadata = selectedSupplier?.metadata;
    const integrationRules = metadata && typeof metadata === "object"
      ? (metadata.integration_rules as Record<string, unknown> | undefined)
      : undefined;
    const prefixes = Array.isArray(integrationRules?.strip_supplier_code_prefixes)
      ? integrationRules.strip_supplier_code_prefixes
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      : [];
    setSupplierRulePrefixesInput(prefixes.join(", "));
  }, [selectedSupplier]);

  async function onSyncFichesSnapshots() {
    if (isFichesSyncing) return;
    setIsFichesSyncing(true);
    setFichesSyncStatus(t("suppliers.fichesSyncRunning"));
    try {
      const idempotencyKey = `fiches-auto-${new Date().toISOString()}`;
      const res = await apiFetch("/integration/fiches/snapshots/import/", {
        method: "POST",
        body: JSON.stringify({
          query: "",
          limit: 5000,
          idempotency_key: idempotencyKey,
          refresh_existing: refreshFichesSnapshots,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const detail = body.detail ?? JSON.stringify(body);
        setNotice(errorWithDetail("error.fichesSync", detail));
        setFichesSyncStatus(t("suppliers.fichesSyncError", { detail }));
        return;
      }
      const statusMessage = t("notice.fichesSynced", {
        read: body.total_read ?? 0,
        created: body.created ?? 0,
        refreshed: body.refreshed ?? 0,
        unchanged: body.skipped_existing ?? 0,
      });
      setNotice(statusMessage);
      setFichesSyncStatus(statusMessage);
      await loadRecipeTitleSuggestions("");
    } catch {
      const msg = t("error.fichesSyncConnection");
      setNotice(msg);
      setFichesSyncStatus(msg);
    } finally {
      setIsFichesSyncing(false);
    }
  }

  async function loadRegisteredInvoices() {
    const activeSites = sites.filter((item) => item.is_active);
    if (activeSites.length === 0) {
      setRegisteredInvoices([]);
      return;
    }
    try {
      const responses = await Promise.all(
        activeSites.map(async (site) => {
          const res = await apiFetch(`/invoices/?site=${encodeURIComponent(site.id)}`);
          const body = await res.json();
          if (!res.ok) {
            throw new Error(body.detail ?? JSON.stringify(body));
          }
          return Array.isArray(body) ? (body as InvoiceRecord[]) : [];
        })
      );
      const deduped = new Map<string, InvoiceRecord>();
      responses.flat().forEach((invoice) => {
        deduped.set(invoice.id, invoice);
      });
      setRegisteredInvoices(Array.from(deduped.values()));
    } catch (error) {
      setNotice(errorWithDetail("error.documentsLoad", error instanceof Error ? error.message : "invoice load failed"));
    }
  }

  async function onImportFichesJsonEnvelope() {
    if (isFichesJsonImporting) return;
    if (!fichesJsonFile) {
      setNotice(t("validation.selectJsonFileFirst"));
      return;
    }
    setIsFichesJsonImporting(true);
    try {
      const text = await fichesJsonFile.text();
      let envelope: unknown;
      try {
        envelope = JSON.parse(text);
      } catch {
        setNotice(t("validation.invalidJsonFile"));
        return;
      }

      const idempotencyKey = `fiches-envelope-${new Date().toISOString()}`;
      const res = await apiFetch("/integration/fiches/snapshots/import-envelope/", {
        method: "POST",
        body: JSON.stringify({
          envelope,
          idempotency_key: idempotencyKey,
          refresh_existing: refreshFichesSnapshots,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.fichesImportJson", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(
        t("notice.fichesJsonImported", {
          read: body.total_read ?? 0,
          created: body.created ?? 0,
          refreshed: body.refreshed ?? 0,
          unchanged: body.skipped_existing ?? 0,
        })
      );
      setFichesJsonFile(null);
      await loadRecipeTitleSuggestions("");
    } catch {
      setNotice(t("error.fichesImportJsonConnection"));
    } finally {
      setIsFichesJsonImporting(false);
    }
  }

  async function loadDocuments(options?: { silent?: boolean }) {
    const siteParam = siteId ? `?site=${encodeURIComponent(siteId)}` : "";
    const res = await apiFetch(`/integration/documents/${siteParam}`);
    const body = await res.json();
    if (!res.ok) {
      if (!options?.silent) {
        setNotice(errorWithDetail("error.documentsLoad", body.detail ?? JSON.stringify(body)));
      }
      return;
    }
    const data = body as DocumentItem[];
    setDocuments(data);
    const intakeDocs = data.filter((doc) => doc.document_type === "goods_receipt" || doc.document_type === "invoice");
    if (intakeDocs.length > 0) {
      setSelectedDocId((prev) => {
        if (prev && intakeDocs.some((doc) => doc.id === prev)) return prev;
        return intakeDocs[0].id;
      });
      setSelectedDocType(intakeDocs[0].document_type);
    }
    if (!options?.silent) {
      setNotice(t("notice.documentsLoaded", { count: data.length }));
    }
  }

  function onUploadFileSelected(file: File | null) {
    setUploadFile(file);
    const name = (file?.name || "").toLowerCase();
    if (!name) return;
    if (name.includes("facture") || name.includes("invoice")) {
      setUploadDocType("invoice");
      return;
    }
    if (name.includes("bl") || name.includes("bon") || name.includes("livraison") || name.includes("ddt")) {
      setUploadDocType("goods_receipt");
    }
  }

  async function onUploadDocument(e: FormEvent) {
    e.preventDefault();
    if (!canUpload || !uploadFile) return;
    setIntakeStage("uploading");

    const form = new FormData();
    form.append("site", siteId);
    form.append("document_type", uploadDocType);
    form.append("source", "upload");
    form.append("file", uploadFile);

    const res = await apiFetch("/integration/documents/", { method: "POST", body: form }, false);
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.documentUpload", body.detail ?? JSON.stringify(body)));
      setIntakeStage("idle");
      return;
    }
    setNotice(t("notice.documentUploaded", { name: body.filename }));
    const uploadedId = String(body.id ?? "");
    const uploadedType = (body.document_type as "goods_receipt" | "invoice" | undefined) ?? uploadDocType;
    setUploadFile(null);
    await loadDocuments();
    if (uploadedId) {
      setSelectedDocId(uploadedId);
      setSelectedDocType(uploadedType);
      setSelectedExtractionId("");
      await onExtractWithClaude(uploadedId);
    } else {
      setIntakeStage("idle");
    }
  }

  async function onCreateExtraction(e?: FormEvent) {
    e?.preventDefault();
    if (!selectedDocId) return;

    let normalized: unknown;
    try {
      normalized = JSON.parse(normalizedPayload);
    } catch {
      setNotice(t("validation.invalidExtractionJson"));
      return;
    }

    const payload = {
      extractor_name: "manual-review",
      extractor_version: "0.1",
      status: "succeeded",
      raw_payload: { source: "manual" },
      normalized_payload: normalized,
      confidence: "99.00",
    };

    const res = await apiFetch(`/integration/documents/${selectedDocId}/extractions/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.extractionCreate", body.detail ?? JSON.stringify(body)));
      return;
    }
    setSelectedExtractionId(body.id);
    setNotice(t("notice.extractionSaved", { id: body.id }));
  }

  async function runClaudeExtraction(targetDocId: string, options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    if (!targetDocId) {
      if (!silent) {
        setNotice(t("validation.selectDocument"));
      }
      return { ok: false, extractionId: "" };
    }
    setIsClaudeExtracting(true);
    if (!silent) {
      setIntakeStage("extracting");
    }
    try {
      const res = await apiFetch(`/integration/documents/${targetDocId}/extract-claude/`, {
        method: "POST",
        body: JSON.stringify({ idempotency_key: `ui-claude-${targetDocId}-${Date.now()}` }),
      });
      const body = await res.json();
      if (!res.ok) {
        const extraction = body?.extraction;
        const detail = extraction?.error_message || body.detail || JSON.stringify(body);
        if (!silent) {
          setNotice(errorWithDetail("error.claudeExtract", detail));
          setIntakeStage("idle");
        }
        return { ok: false, extractionId: String(body?.id ?? "") };
      }
      if (body.status && String(body.status) !== "succeeded") {
        const detail = body.error_message || t("error.claudeExtract");
        if (!silent) {
          setNotice(errorWithDetail("error.claudeExtract", detail));
          setIntakeStage("idle");
        }
        return { ok: false, extractionId: String(body?.id ?? "") };
      }
      if (!silent && body.id) {
        setSelectedExtractionId(String(body.id));
      }
      if (!silent && body.normalized_payload && typeof body.normalized_payload === "object") {
        setNormalizedPayload(JSON.stringify(body.normalized_payload, null, 2));
      }
      if (!silent) {
        setIntakeStage("review");
        setNotice(t("notice.claudeExtractionSaved", { id: body.id ?? "-" }));
      }
      return { ok: Boolean(body.id), extractionId: String(body.id ?? "") };
    } catch {
      if (!silent) {
        setNotice(t("error.claudeExtractConnection"));
        setIntakeStage("idle");
      }
      return { ok: false, extractionId: "" };
    } finally {
      setIsClaudeExtracting(false);
    }
  }

  async function onExtractWithClaude(forcedDocId?: string) {
    const targetDocId = (forcedDocId || selectedDocId || "").trim();
    if (!targetDocId) {
      setNotice(t("validation.selectDocument"));
      return;
    }
    const result = await runClaudeExtraction(targetDocId);
    if (!result.ok && !result.extractionId) {
      return;
    }
    if (!result.extractionId) {
      setNotice(errorWithDetail("error.claudeExtract", "missing extraction id in response"));
      setIntakeStage("idle");
    }
  }

  async function onIngestExtraction(e?: FormEvent) {
    e?.preventDefault();
    if (!selectedDocId || !selectedExtractionId) return;
    setIntakeStage("ingesting");

    const payload = {
      extraction_id: selectedExtractionId,
      idempotency_key: `ui-ingest-${selectedExtractionId}`,
      target: selectedDocType,
    };

    const res = await apiFetch(`/integration/documents/${selectedDocId}/ingest/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      const detail = describeValidationError(body as Record<string, unknown>) || JSON.stringify(body);
      setNotice(errorWithDetail("error.ingest", detail));
      setLastIngestError(detail);
      setIntakeStage("review");
      return;
    }
    setLastIngestError("");
    if (selectedDocType === "invoice" && body.id) {
      setAutoMatchInvoiceId(String(body.id));
      if (invoiceIngestMode === "invoice_after_delivery") {
        const matched = await autoMatchInvoiceById(String(body.id), true);
        if (matched) {
          setNotice(t("notice.invoiceAfterDeliveryProcessed", { id: body.id }));
          setIntakeStage("review");
          return;
        }
      }
    }
    setIntakeStage("review");
    setNotice(t("notice.documentIngested", { id: body.id }));
    if (siteId && (selectedDocType === "invoice" || selectedDocType === "goods_receipt")) {
      await Promise.all([loadStockSummary(), loadInventoryMovements()]);
    }
  }

  function isDocumentIngested(doc: DocumentItem) {
    const ingest = asRecord(doc.metadata?.ingest);
    return String(ingest.status || "") === "completed";
  }

  async function onBulkIngestDocuments(targetType: "goods_receipt" | "invoice") {
    if (!siteId) return;
    setIsBulkIngesting(targetType);
    try {
      setBulkIngestErrors((prev) => ({ ...prev, [targetType]: [] }));
      const candidates = documents.filter(
        (doc) =>
          doc.site === siteId
          && doc.document_type === targetType
          && !isDocumentIngested(doc)
          && String(doc.latest_extraction?.status || "") === "succeeded"
          && String(doc.latest_extraction?.id || "").trim().length > 0
      );
      if (candidates.length === 0) {
        setNotice("Aucun document a enregistrer.");
        return;
      }
      let ingested = 0;
      const failures: string[] = [];
      for (const doc of candidates) {
        const extractionId = String(doc.latest_extraction?.id || "");
        if (!extractionId) continue;
        const res = await apiFetch(`/integration/documents/${doc.id}/ingest/`, {
          method: "POST",
          body: JSON.stringify({
            extraction_id: extractionId,
            idempotency_key: `ui-ingest-${extractionId}`,
            target: targetType,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          const detail = describeValidationError(body as Record<string, unknown>) || JSON.stringify(body);
          failures.push(`${doc.filename}: ${detail}`);
          continue;
        }
        ingested += 1;
      }
      if (failures.length > 0) {
        setBulkIngestErrors((prev) => ({ ...prev, [targetType]: failures }));
      }
      if (failures.length > 0) {
        const preview = failures.slice(0, 3).join(" | ");
        const more = failures.length > 3 ? ` (+${failures.length - 3} autres)` : "";
        setNotice(`Documents enregistres: ${ingested}/${candidates.length}. Erreurs: ${preview}${more}`);
      } else {
        setNotice(`Documents enregistres: ${ingested}/${candidates.length}.`);
      }
      await loadDocuments({ silent: true });
      if (siteId && ingested > 0) {
        await Promise.all([loadStockSummary(), loadInventoryMovements()]);
      }
    } catch {
      setNotice(t("error.ingest"));
    } finally {
      setIsBulkIngesting(null);
    }
  }

  async function onDeleteIntakeDocument(doc: DocumentItem) {
    if (!doc.id) return;
    const duplicateCount = getDocumentDuplicateCount(doc);
    const prompt = duplicateCount > 1
      ? `Supprimer ce doublon et les donnees derivees de ${doc.filename} ?`
      : `Supprimer ${doc.filename} et ses donnees derivees ?`;
    if (!window.confirm(prompt)) {
      return;
    }

    setIsDeletingDocumentId(doc.id);
    try {
      const res = await apiFetch(`/integration/documents/${doc.id}/`, { method: "DELETE" });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          detail = String(body.detail ?? JSON.stringify(body));
        } catch {
          // keep generic detail
        }
        setNotice(errorWithDetail("error.documentDelete", detail));
        return;
      }
      if (selectedDocId === doc.id) {
        setSelectedDocId("");
        setSelectedExtractionId("");
      }
      await loadDocuments();
      if (siteId) {
        await loadStockSummary();
        await loadInventoryMovements();
      }
      await loadCentralTraceabilityReconciliation();
      setNotice(`Document supprime: ${doc.filename}`);
    } catch {
      setNotice("Suppression du document impossible.");
    } finally {
      setIsDeletingDocumentId("");
    }
  }

  async function onCreateReconciliation(e: FormEvent) {
    e.preventDefault();
    if (!recoInvoiceLine || !recoGoodsReceiptLine) return;

    const payload = {
      invoice_line: recoInvoiceLine,
      goods_receipt_line: recoGoodsReceiptLine,
      status: "manual",
      note: "Abbinamento manuale front-office",
      metadata: { source: "frontend" },
    };

    const res = await apiFetch("/reconciliation/matches/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.reconciliationCreate", body.detail ?? JSON.stringify(body)));
      return;
    }
    setNotice(t("notice.reconciliationCreated", { id: body.id }));
  }

  async function onAutoMatchInvoice() {
    if (!autoMatchInvoiceId.trim()) {
      setNotice(t("validation.invoiceIdRequired"));
      return;
    }
    setIsAutoMatching(true);
    try {
      await autoMatchInvoiceById(autoMatchInvoiceId, false);
    } finally {
      setIsAutoMatching(false);
    }
  }

  async function autoMatchInvoiceById(invoiceId: string, silent = false): Promise<boolean> {
    try {
      const res = await apiFetch("/reconciliation/auto-match/", {
        method: "POST",
        body: JSON.stringify({
          invoice_id: invoiceId.trim(),
          qty_tolerance_ratio: "0.0500",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (!silent) {
          setNotice(errorWithDetail("error.reconciliationAutoMatch", body.detail ?? JSON.stringify(body)));
        }
        return false;
      }
      const warningsCount = Array.isArray(body.warnings) ? body.warnings.length : 0;
      if (!silent) {
        setNotice(
          t("notice.reconciliationAutoMatched", {
            matches: Number(body.created_matches ?? 0),
            linked: Number(body.linked_invoice_lines ?? 0),
            warnings: warningsCount,
          })
        );
      }
      return true;
    } catch {
      if (!silent) {
        setNotice(t("error.reconciliationAutoMatchConnection"));
      }
      return false;
    }
  }

  async function onImportPos(e: FormEvent) {
    e.preventDefault();
    let lines: unknown;
    try {
      lines = JSON.parse(salesLines);
    } catch {
      setNotice(t("validation.invalidSalesJson"));
      return;
    }

    const payload = {
      site_id: siteId,
      pos_source_id: posSourceId,
      sales_date: salesDate,
      lines,
    };

    const res = await apiFetch("/pos/import/daily/", {
      method: "POST",
      headers: { "Idempotency-Key": `ui-pos-${salesDate}-${Date.now()}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.posImport", body.detail ?? JSON.stringify(body)));
      return;
    }
    setNotice(t("notice.salesImported", { id: body.id }));
  }

  async function loadInventoryMovements() {
    if (!siteId) return;
    setIsInventoryLoading(true);
    try {
      const res = await apiFetch(`/inventory/movements/?site=${encodeURIComponent(siteId)}&limit=300`);
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.documentsLoad", body.detail ?? JSON.stringify(body)));
        return;
      }
      const rows = Array.isArray(body) ? (body as InventoryMovementItem[]) : [];
      setInventoryMovements(rows);
    } catch {
      setNotice(t("error.documentsLoad"));
    } finally {
      setIsInventoryLoading(false);
    }
  }

  async function loadStockSummary() {
    if (!siteId) return;
    setIsInventoryLoading(true);
    try {
      const res = await apiFetch(`/inventory/stock-summary/?site=${encodeURIComponent(siteId)}`);
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.documentsLoad", body.detail ?? JSON.stringify(body)));
        return;
      }
      const rows = Array.isArray(body?.results) ? (body.results as StockSummaryItem[]) : [];
      setStockSummaryRows(rows);
    } catch {
      setNotice(t("error.documentsLoad"));
    } finally {
      setIsInventoryLoading(false);
    }
  }

  async function rebuildStockFromPurchasing() {
    if (!siteId) return;
    setIsRebuildingStock(true);
    try {
      const res = await apiFetch("/inventory/rebuild-from-purchasing/", {
        method: "POST",
        body: JSON.stringify({ site: siteId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.documentsLoad", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(
        `Stock ricostruito. BL creati: ${body.created_goods_receipts}, fatture fallback: ${body.created_invoice_fallbacks}.`
      );
      await Promise.all([loadStockSummary(), loadInventoryMovements()]);
    } catch {
      setNotice(t("error.documentsLoad"));
    } finally {
      setIsRebuildingStock(false);
    }
  }

  async function loadHaccpData() {
    if (!siteId) return;
    setIsHaccpLoading(true);
    try {
      const synced = await ensureHaccpSiteSynced(siteId);
      if (!synced) return;
      const [ocrResult, lifecycleResult, schedulesResult, profilesResult, sessionsResult, overviewResult, sectorsResult, coldPointsResult, temperatureReadingsResult] = await Promise.allSettled([
        apiFetch(`/haccp/traccia/ocr-queue/?site=${encodeURIComponent(siteId)}&limit=80`),
        apiFetch(`/haccp/traccia/lifecycle/?site=${encodeURIComponent(siteId)}&limit=120`),
        apiFetch(`/haccp/schedules/?site=${encodeURIComponent(siteId)}`),
        apiFetch(`/haccp/label-profiles/?site=${encodeURIComponent(siteId)}`),
        apiFetch(`/haccp/label-sessions/?site=${encodeURIComponent(siteId)}`),
        apiFetch(`/haccp/traccia/reconciliation-overview/?site=${encodeURIComponent(siteId)}&limit=80`),
        apiFetch(`/haccp/traccia/sectors/?site=${encodeURIComponent(siteId)}`),
        apiFetch(`/haccp/traccia/cold-points/?site=${encodeURIComponent(siteId)}`),
        apiFetch(`/haccp/traccia/temperature-readings/?site=${encodeURIComponent(siteId)}&limit=120`),
      ]);

      async function readSettledJson(result: PromiseSettledResult<Response>) {
        if (result.status !== "fulfilled") {
          return { ok: false, body: null as unknown };
        }
        try {
          return { ok: result.value.ok, body: await result.value.json() };
        } catch {
          return { ok: result.value.ok, body: null as unknown };
        }
      }

      const [ocr, lifecycle, schedules, profiles, sessions, overview, sectors, coldPoints, temperatureReadings] = await Promise.all([
        readSettledJson(ocrResult),
        readSettledJson(lifecycleResult),
        readSettledJson(schedulesResult),
        readSettledJson(profilesResult),
        readSettledJson(sessionsResult),
        readSettledJson(overviewResult),
        readSettledJson(sectorsResult),
        readSettledJson(coldPointsResult),
        readSettledJson(temperatureReadingsResult),
      ]);

      if (ocr.ok && lifecycle.ok && schedules.ok && profiles.ok && sessions.ok && sectors.ok && coldPoints.ok && temperatureReadings.ok) {
        const normalizedProfiles = normalizeHaccpLabelProfileRows(profiles.body);
        setHaccpOcrQueue(normalizeHaccpOcrQueueRows(ocr.body));
        setHaccpLifecycleEvents(normalizeHaccpLifecycleRows(lifecycle.body));
        setHaccpSchedules(normalizeHaccpScheduleRows(schedules.body));
        setHaccpLabelProfiles(normalizedProfiles);
        setHaccpLabelSessions(normalizeHaccpLabelSessionRows(sessions.body, normalizedProfiles));
        setHaccpSectors(normalizeHaccpSectorRows(sectors.body));
        setHaccpColdPoints(normalizeHaccpColdPointRows(coldPoints.body));
        setHaccpTemperatureReadings(normalizeHaccpTemperatureReadingRows(temperatureReadings.body));
        setHaccpReconciliationOverview(overview.ok ? normalizeHaccpReconciliationOverview(overview.body) : null);
        await loadCleaningData();
        return;
      }

      if (!ocr.ok) {
        setNotice(errorWithDetail("error.documentsLoad", (ocr.body as Record<string, unknown> | null)?.detail ?? JSON.stringify(ocr.body)));
        return;
      }
      if (!lifecycle.ok) {
        setNotice(
          errorWithDetail("error.documentsLoad", (lifecycle.body as Record<string, unknown> | null)?.detail ?? JSON.stringify(lifecycle.body))
        );
        return;
      }
      if (!schedules.ok) {
        setNotice(
          errorWithDetail("error.documentsLoad", (schedules.body as Record<string, unknown> | null)?.detail ?? JSON.stringify(schedules.body))
        );
        return;
      }
      if (!profiles.ok) {
        setNotice(
          errorWithDetail("error.documentsLoad", (profiles.body as Record<string, unknown> | null)?.detail ?? JSON.stringify(profiles.body))
        );
        return;
      }
      if (!sessions.ok) {
        setNotice(
          errorWithDetail("error.documentsLoad", (sessions.body as Record<string, unknown> | null)?.detail ?? JSON.stringify(sessions.body))
        );
        return;
      }
      if (!sectors.ok) {
        setNotice(
          errorWithDetail("error.documentsLoad", (sectors.body as Record<string, unknown> | null)?.detail ?? JSON.stringify(sectors.body))
        );
        return;
      }
      if (!coldPoints.ok) {
        setNotice(
          errorWithDetail(
            "error.documentsLoad",
            (coldPoints.body as Record<string, unknown> | null)?.detail ?? JSON.stringify(coldPoints.body)
          )
        );
        return;
      }
      if (!temperatureReadings.ok) {
        setNotice(
          errorWithDetail(
            "error.documentsLoad",
            (temperatureReadings.body as Record<string, unknown> | null)?.detail ?? JSON.stringify(temperatureReadings.body)
          )
        );
      }
    } catch {
      setNotice(t("error.documentsLoad"));
    } finally {
      setIsHaccpLoading(false);
    }
  }
  async function loadCleaningData() {
    if (!siteId) return;
    setIsCleaningLoading(true);
    try {
      const [categoriesRes, proceduresRes, elementsRes, plansRes] = await Promise.all([
        apiFetch("/haccp/cleaning/categories/"),
        apiFetch("/haccp/cleaning/procedures/"),
        apiFetch(`/haccp/cleaning/elements/?site=${encodeURIComponent(siteId)}`),
        apiFetch(`/haccp/cleaning/plans/?site=${encodeURIComponent(siteId)}`),
      ]);
      const [categories, procedures, elements, plans] = await Promise.all([
        categoriesRes.json().catch(() => []),
        proceduresRes.json().catch(() => []),
        elementsRes.json().catch(() => []),
        plansRes.json().catch(() => []),
      ]);
      if (categoriesRes.ok) setCleaningCategories(categories as CleaningCategory[]);
      if (proceduresRes.ok) setCleaningProcedures(procedures as CleaningProcedure[]);
      if (elementsRes.ok) setCleaningElements(elements as CleaningElement[]);
      if (plansRes.ok) setCleaningPlans(plans as CleaningPlan[]);
    } catch {
      setNotice(t("error.documentsLoad"));
    } finally {
      setIsCleaningLoading(false);
    }
  }

  async function onCreateCleaningCategory(e: FormEvent) {
    e.preventDefault();
    const name = newCleaningCategoryName.trim();
    if (!name) return;
    const res = await apiFetch("/haccp/cleaning/categories/", {
      method: "POST",
      body: JSON.stringify({ name, description: newCleaningCategoryDescription.trim() || null, is_active: true }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setNotice(errorWithDetail("error.documentsLoad", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
      return;
    }
    setNewCleaningCategoryName("");
    setNewCleaningCategoryDescription("");
    await loadCleaningData();
  }

  async function onCreateCleaningProcedure(e: FormEvent) {
    e.preventDefault();
    const name = newCleaningProcedureName.trim();
    if (!name) return;
    const steps = newCleaningProcedureSteps
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean);
    const res = await apiFetch("/haccp/cleaning/procedures/", {
      method: "POST",
      body: JSON.stringify({
        name,
        category: newCleaningProcedureCategory || null,
        steps,
        notes: newCleaningProcedureNotes.trim() || null,
        is_active: true,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setNotice(errorWithDetail("error.documentsLoad", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
      return;
    }
    setNewCleaningProcedureName("");
    setNewCleaningProcedureCategory("");
    setNewCleaningProcedureSteps("");
    setNewCleaningProcedureNotes("");
    await loadCleaningData();
  }

  async function onCreateCleaningElement(e: FormEvent) {
    e.preventDefault();
    if (!siteId) return;
    const name = newCleaningElementName.trim();
    if (!name) return;
    const selectedAreas = (newCleaningElementAreaIds.length ? newCleaningElementAreaIds : []).map((sectorId, index) => {
      const sector = haccpSectors.find((item) => item.id === sectorId);
      return sector ? { sector_id: sector.id, sector_name: sector.name, sort_order: index } : null;
    }).filter(Boolean) as Array<{ sector_id: string; sector_name: string; sort_order: number }>;
    const res = await apiFetch("/haccp/cleaning/elements/", {
      method: "POST",
      body: JSON.stringify({
        site: siteId,
        name,
        category: newCleaningElementCategory || null,
        procedure: newCleaningElementProcedure || null,
        is_global: newCleaningElementIsGlobal,
        is_active: true,
        areas: selectedAreas,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setNotice(errorWithDetail("error.documentsLoad", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
      return;
    }
    setNewCleaningElementName("");
    setNewCleaningElementCategory("");
    setNewCleaningElementProcedure("");
    setNewCleaningElementIsGlobal(false);
    setNewCleaningElementAreaIds([]);
    await loadCleaningData();
  }

  async function onCreateCleaningPlan(e: FormEvent) {
    e.preventDefault();
    if (!siteId || !newCleaningPlanElementId) return;
    if (isCleaningLoading) return;
    setIsCleaningLoading(true);
    try {
    const element = cleaningElements.find((item) => item.id === newCleaningPlanElementId);
    if (!element) return;
    const areaIds = newCleaningPlanAreaIds.length ? newCleaningPlanAreaIds : element.areas.map((area) => area.sector_id);
    if (!areaIds.length && newCleaningCadence !== "after_use") {
      setNotice(t("validation.selectArea"));
      return;
    }
    for (const areaId of areaIds.length ? areaIds : [""]) {
      const area = haccpSectors.find((item) => item.id === areaId);
      if (editingCleaningPlanId) {
        const res = await apiFetch(`/haccp/cleaning/plans/${editingCleaningPlanId}/`, {
          method: "PATCH",
          body: JSON.stringify({
            element: element.id,
            sector_id: area ? area.id : null,
            sector_name: area ? area.name : null,
            cadence: newCleaningCadence,
            due_time: newCleaningDueTime,
            start_date: newCleaningStartDate,
            timezone: "Europe/Paris",
            is_active: true,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setNotice(errorWithDetail("error.documentsLoad", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
          return;
        }
        if (newCleaningCadence !== "after_use") {
          await apiFetch("/haccp/cleaning/plans/generate/", {
            method: "POST",
            body: JSON.stringify({ plan_id: (body as CleaningPlan).id, horizon_days: 14 }),
          });
        }
      } else {
        const existing = cleaningPlans.find((plan) => (
          plan.element === element.id
          && plan.cadence === newCleaningCadence
          && String(plan.sector_id || "") === String(area ? area.id : "")
        ));
        if (existing) {
          setNotice(t("cleaning.planAlreadyExists"));
          continue;
        }
        const res = await apiFetch("/haccp/cleaning/plans/", {
          method: "POST",
          body: JSON.stringify({
            site: siteId,
            element: element.id,
            sector_id: area ? area.id : null,
            sector_name: area ? area.name : null,
            cadence: newCleaningCadence,
            due_time: newCleaningDueTime,
            start_date: newCleaningStartDate,
            timezone: "Europe/Paris",
            is_active: true,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setNotice(errorWithDetail("error.documentsLoad", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
          return;
        }
        if (newCleaningCadence !== "after_use") {
          await apiFetch("/haccp/cleaning/plans/generate/", {
            method: "POST",
            body: JSON.stringify({ plan_id: (body as CleaningPlan).id, horizon_days: 14 }),
          });
        }
      }
    }
    setNewCleaningCadence("daily");
    setNewCleaningDueTime("01:00");
    setNewCleaningStartDate(getTodayIsoDate());
    setNewCleaningPlanAreaIds([]);
    setEditingCleaningPlanId("");
    await loadCleaningData();
    await loadHaccpData();
    } finally {
      setIsCleaningLoading(false);
    }
  }

  async function onCompleteCleaningSchedules(scheduleIds: string[]) {
    if (!scheduleIds.length) return;
    const res = await apiFetch("/haccp/cleaning/schedules/complete/", {
      method: "POST",
      body: JSON.stringify({ schedule_ids: scheduleIds }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setNotice(errorWithDetail("error.documentsLoad", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
      return;
    }
    await loadHaccpData();
  }

  function onEditCleaningPlan(planId: string) {
    const plan = cleaningPlans.find((item) => item.id === planId);
    if (!plan) return;
    setEditingCleaningPlanId(plan.id);
    setNewCleaningPlanElementId(plan.element);
    setNewCleaningCadence(plan.cadence);
    setNewCleaningDueTime(plan.due_time || "01:00");
    setNewCleaningStartDate(plan.start_date || getTodayIsoDate());
    setNewCleaningPlanAreaIds(plan.sector_id ? [String(plan.sector_id)] : []);
  }

  async function onToggleCleaningPlanActive(planId: string, nextActive: boolean) {
    const res = await apiFetch(`/haccp/cleaning/plans/${planId}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: nextActive }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setNotice(errorWithDetail("error.documentsLoad", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
      return;
    }
    await loadCleaningData();
  }


  async function loadCentralTraceabilityReconciliation() {
    if (sites.length === 0) return;
    setIsCentralReconciliationLoading(true);
    try {
      const activeSitesForReco = sites.filter((item) => item.is_active);
      const settled = await Promise.allSettled(
        activeSitesForReco.map(async (site) => {
          const synced = await ensureHaccpSiteSynced(site.id);
          if (!synced) {
            return null;
          }
          const res = await apiFetch(`/haccp/traccia/reconciliation-overview/?site=${encodeURIComponent(site.id)}&limit=80`);
          const body = await res.json();
          if (!res.ok) {
            return null;
          }
          return normalizeHaccpReconciliationOverview(body, { siteId: site.id, siteName: site.name });
        })
      );

      const overviews = settled
        .filter((item): item is PromiseFulfilledResult<HaccpReconciliationOverview | null> => item.status === "fulfilled")
        .map((item) => item.value)
        .filter((item): item is HaccpReconciliationOverview => Boolean(item));

      const merged: HaccpReconciliationOverview = {
        summary: {
          lifecycle_events: overviews.reduce((acc, item) => acc + item.summary.lifecycle_events, 0),
          goods_receipt_lines: overviews.reduce((acc, item) => acc + item.summary.goods_receipt_lines, 0),
          invoice_lines: overviews.reduce((acc, item) => acc + item.summary.invoice_lines, 0),
          matches: overviews.reduce((acc, item) => acc + item.summary.matches, 0),
          reconciled_events: overviews.reduce((acc, item) => acc + item.summary.reconciled_events, 0),
          goods_receipt_only_events: overviews.reduce((acc, item) => acc + item.summary.goods_receipt_only_events, 0),
          invoice_only_events: overviews.reduce((acc, item) => acc + item.summary.invoice_only_events, 0),
          missing_events: overviews.reduce((acc, item) => acc + item.summary.missing_events, 0),
          documents_found_events: overviews.reduce((acc, item) => acc + item.summary.documents_found_events, 0),
          label_tasks_planned: overviews.reduce((acc, item) => acc + item.summary.label_tasks_planned, 0),
          label_tasks_done: overviews.reduce((acc, item) => acc + item.summary.label_tasks_done, 0),
        },
        label_schedule_summary: {
          planned: overviews.reduce((acc, item) => acc + item.label_schedule_summary.planned, 0),
          done: overviews.reduce((acc, item) => acc + item.label_schedule_summary.done, 0),
          skipped: overviews.reduce((acc, item) => acc + item.label_schedule_summary.skipped, 0),
          cancelled: overviews.reduce((acc, item) => acc + item.label_schedule_summary.cancelled, 0),
        },
        results: overviews.flatMap((item) => item.results).sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at))),
      };
      setCentralReconciliationOverview(merged);
    } finally {
      setIsCentralReconciliationLoading(false);
    }
  }

  async function loadTraceabilityReconciliationDecisions() {
    try {
      const res = await apiFetch("/integration/reconciliation-decisions/");
      const body = await res.json();
      if (!res.ok) {
        return;
      }
      const rows = Array.isArray(body?.results) ? (body.results as TraceabilityReconciliationDecision[]) : [];
      setReconciliationDecisions(rows);
    } catch {
      // keep page usable even if decisions fail to load
    }
  }

  async function onImportHaccpAssets() {
    if (!siteId) {
      setNotice(t("validation.selectSite"));
      return;
    }
    setIsHaccpSaving(true);
    setTraceabilityImportStatus("Import da Drive in corso...");
    setNotice("Import da Drive avviato.");
    try {
      const res = await apiFetch("/integration/drive-assets/import/", {
        method: "POST",
        body: JSON.stringify({
          site: siteId,
          document_type: "label_capture",
          limit: 80,
          idempotency_key: `drive-assets-${siteId}-${Date.now()}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.documentsLoad", body.detail ?? JSON.stringify(body)));
        return;
      }
      const extractedCount = Number(body.extracted_count ?? 0);
      await loadDocuments();
      await loadHaccpData();
      const createdCount = Number(body.created_count ?? 0);
      const skippedExisting = Number(body.skipped_existing ?? 0);
      const skippedInvalid = Number(body.skipped_invalid ?? 0);
      const errorCount = Number(body.error_count ?? 0);
      setLastTraceabilityImportSummary({
        created_count: createdCount,
        skipped_existing: skippedExisting,
        skipped_invalid: skippedInvalid,
        error_count: errorCount,
        extracted_count: extractedCount,
      });
      if (createdCount === 0 && skippedExisting === 0 && skippedInvalid === 0 && errorCount === 0) {
        setTraceabilityImportStatus("Drive non ha restituito nessuna foto per questo sito.");
        setNotice("Import completato: nessuna foto trovata nella cartella Drive per il sito selezionato.");
        return;
      }
      setTraceabilityImportStatus(
        `Import completato: ${createdCount} nuove, ${skippedExisting} gia presenti, ${extractedCount} estrazioni avviate.`
      );
      setNotice(`Import termine: ${createdCount} nuove, ${skippedExisting} gia presenti, ${extractedCount} estrazioni avviate.`);
    } catch {
      setTraceabilityImportStatus("Errore durante l'import da Drive.");
      setNotice(t("error.documentsLoad"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  async function onExtractHaccpDocument(documentId: string) {
    if (!documentId) return;
    await onExtractWithClaude(documentId);
    await loadDocuments();
  }

  function resetHaccpSectorForm() {
    setEditingHaccpSectorId("");
    setNewHaccpSectorName("");
  }

  function resetHaccpColdPointForm() {
    setEditingHaccpColdPointId("");
    setNewHaccpColdPointName("");
    setNewHaccpColdPointEquipmentType("FRIDGE");
  }

  function onEditHaccpSector(sectorId: string) {
    const sector = haccpSectors.find((item) => item.id === sectorId);
    if (!sector) return;
    setSelectedHaccpSectorId(sector.id);
    setEditingHaccpSectorId(sector.id);
    setNewHaccpSectorName(sector.name);
  }

  async function onDeleteHaccpSector(sectorId: string) {
    const sector = haccpSectors.find((item) => item.id === sectorId);
    const targetId = sector?.internal_id || sectorId;
    if (!window.confirm("Eliminare questo settore e i relativi punti freddo?")) {
      return;
    }
    setIsHaccpSaving(true);
    try {
      const res = await apiFetch(`/haccp/traccia/sectors/${targetId}/`, { method: "DELETE" });
      const body = res.status === 204 ? {} : await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", (body as Record<string, unknown>).detail ?? JSON.stringify(body)));
        return;
      }
      if (editingHaccpSectorId === sectorId) {
        resetHaccpSectorForm();
      }
      if (selectedHaccpSectorId === sectorId) {
        setSelectedHaccpSectorId("");
        setSelectedHaccpColdPointId("");
      }
      setNotice("Settore HACCP eliminato.");
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteCreateConnection"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  async function onCreateHaccpSector(e: FormEvent) {
    e.preventDefault();
    if (!siteId) {
      setNotice(t("validation.selectSite"));
      return;
    }
    if (!newHaccpSectorName.trim()) {
      setNotice("Inserisci un settore.");
      return;
    }
    setIsHaccpSaving(true);
    const synced = await ensureHaccpSiteSynced(siteId);
    if (!synced) {
      setIsHaccpSaving(false);
      return;
    }
    try {
      const payload = {
        site: siteId,
        external_code: newHaccpSectorName.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 64),
        name: newHaccpSectorName.trim(),
        sort_order: haccpSectors.length + 1,
        is_active: true,
      };
      const editingSector = haccpSectors.find((item) => item.id === editingHaccpSectorId);
      const editTargetId = editingSector?.internal_id || editingHaccpSectorId;
      const res = await apiFetch(editingHaccpSectorId ? `/haccp/traccia/sectors/${editTargetId}/` : "/haccp/traccia/sectors/sync/", {
        method: editingHaccpSectorId ? "PATCH" : "POST",
        body: JSON.stringify(
          editingHaccpSectorId
            ? payload
            : {
                sectors: [
                  {
                    external_id: createClientUuid(),
                    ...payload,
                  },
                ],
              }
        ),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      const savedSectorId =
        editingHaccpSectorId ||
        String(
          (body as Record<string, unknown>).id ||
            ((body as { results?: Array<{ id?: string }> }).results?.[0]?.id ?? "")
        );
      setNotice(editingHaccpSectorId ? `Settore HACCP aggiornato: ${newHaccpSectorName.trim()}` : `Settore HACCP creato: ${newHaccpSectorName.trim()}`);
      resetHaccpSectorForm();
      await loadHaccpData();
      if (savedSectorId) {
        setSelectedHaccpSectorId(savedSectorId);
      }
    } catch {
      setNotice(t("error.siteCreateConnection"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  function onEditHaccpColdPoint(pointId: string) {
    const point = haccpColdPoints.find((item) => item.id === pointId);
    if (!point) return;
    if (point.sector) {
      setSelectedHaccpSectorId(point.sector);
    }
    setEditingHaccpColdPointId(point.id);
    setNewHaccpColdPointName(point.name);
    setNewHaccpColdPointEquipmentType((point.equipment_type || "FRIDGE") as "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER");
  }

  async function onDeleteHaccpColdPoint(pointId: string) {
    const point = haccpColdPoints.find((item) => item.id === pointId);
    const targetId = point?.internal_id || pointId;
    if (!window.confirm("Eliminare questo punto freddo?")) {
      return;
    }
    setIsHaccpSaving(true);
    try {
      const res = await apiFetch(`/haccp/traccia/cold-points/${targetId}/`, { method: "DELETE" });
      const body = res.status === 204 ? {} : await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", (body as Record<string, unknown>).detail ?? JSON.stringify(body)));
        return;
      }
      if (editingHaccpColdPointId === pointId) {
        resetHaccpColdPointForm();
      }
      if (selectedHaccpColdPointId === pointId) {
        setSelectedHaccpColdPointId("");
      }
      setNotice("Punto freddo eliminato.");
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteCreateConnection"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  async function onCreateHaccpColdPoint(e: FormEvent) {
    e.preventDefault();
    if (!siteId) {
      setNotice(t("validation.selectSite"));
      return;
    }
    if (!selectedHaccpSectorId) {
      setNotice("Seleziona prima un settore.");
      return;
    }
    if (!newHaccpColdPointName.trim()) {
      setNotice("Inserisci un punto freddo.");
      return;
    }
    setIsHaccpSaving(true);
    const synced = await ensureHaccpSiteSynced(siteId);
    if (!synced) {
      setIsHaccpSaving(false);
      return;
    }
    try {
      const payload = {
        site: siteId,
        sector: selectedHaccpSectorId,
        external_code: newHaccpColdPointName.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 64),
        name: newHaccpColdPointName.trim(),
        equipment_type: newHaccpColdPointEquipmentType,
        sort_order: filteredHaccpColdPoints.length + 1,
        is_active: true,
      };
      const editingPoint = haccpColdPoints.find((item) => item.id === editingHaccpColdPointId);
      const editTargetId = editingPoint?.internal_id || editingHaccpColdPointId;
      const res = await apiFetch(editingHaccpColdPointId ? `/haccp/traccia/cold-points/${editTargetId}/` : "/haccp/traccia/cold-points/sync/", {
        method: editingHaccpColdPointId ? "PATCH" : "POST",
        body: JSON.stringify(
          editingHaccpColdPointId
            ? payload
            : {
                cold_points: [
                  {
                    external_id: createClientUuid(),
                    ...payload,
                  },
                ],
              }
        ),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      const savedPointId =
        editingHaccpColdPointId ||
        String(
          (body as Record<string, unknown>).id ||
            ((body as { results?: Array<{ id?: string }> }).results?.[0]?.id ?? "")
        );
      setNotice(editingHaccpColdPointId ? `Punto freddo aggiornato: ${newHaccpColdPointName.trim()}` : `Punto freddo creato: ${newHaccpColdPointName.trim()}`);
      resetHaccpColdPointForm();
      await loadHaccpData();
      if (savedPointId) {
        setSelectedHaccpColdPointId(savedPointId);
      }
    } catch {
      setNotice(t("error.siteCreateConnection"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  async function onValidateHaccpOcr(
    documentId: string,
    statusValue: "validated" | "rejected",
    correctedPayload?: Record<string, unknown>,
    notes = ""
  ) {
    try {
      const res = await apiFetch(`/integration/documents/${documentId}/review/`, {
        method: "POST",
        body: JSON.stringify({
          status: statusValue,
          notes,
          corrected_payload: correctedPayload,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.extractionCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(`Validazione OCR aggiornata: ${statusValue}.`);
      await loadDocuments();
      await loadHaccpData();
    } catch {
      setNotice(t("error.extractionCreate"));
    }
  }

  async function onDeleteTraceabilityDocument(documentId: string) {
    if (!window.confirm("Eliminare definitivamente questa foto da CookOps?")) {
      return;
    }
    try {
      const res = await apiFetch(`/integration/documents/${documentId}/`, {
        method: "DELETE",
      }, false);
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        setNotice(errorWithDetail("error.siteDelete", (body as Record<string, unknown> | null)?.detail ?? JSON.stringify(body)));
        return;
      }
      if (selectedHaccpDocumentId === documentId) {
        setSelectedHaccpDocumentId("");
      }
      setNotice("Foto eliminata da CookOps.");
      await loadDocuments();
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteDelete"));
    }
  }

  async function onCreateHaccpSchedule(
    e: FormEvent,
    forcedTaskType?: "label_print" | "temperature_register" | "cleaning"
  ) {
    e.preventDefault();
    if (!siteId) {
      setNotice(t("validation.selectSite"));
      return;
    }
    if (!newHaccpTitle.trim()) {
      setNotice(t("validation.entryTitleRequired"));
      return;
    }
    if (!newHaccpStartsAt.trim()) {
      setNotice("Inserisci data/ora inizio.");
      return;
    }
    const startDate = new Date(newHaccpStartsAt);
    if (Number.isNaN(startDate.getTime())) {
      setNotice("Data inizio non valida.");
      return;
    }
    const startsAtIso = startDate.toISOString();
    let endsAtIso: string | null = null;
    if (newHaccpEndsAt.trim()) {
      const endDate = new Date(newHaccpEndsAt);
      if (Number.isNaN(endDate.getTime())) {
        setNotice("Data fine non valida.");
        return;
      }
      endsAtIso = endDate.toISOString();
    }
    setIsHaccpSaving(true);
    const synced = await ensureHaccpSiteSynced(siteId);
    if (!synced) {
      setIsHaccpSaving(false);
      return;
    }
    const taskType = forcedTaskType ?? newHaccpTaskType;
    const selectedSector = haccpSectors.find((item) => item.id === selectedHaccpSectorId) ?? null;
    const selectedColdPoint =
      taskType === "temperature_register"
        ? filteredHaccpColdPoints.find((item) => item.id === selectedHaccpColdPointId) ?? null
        : null;
    if ((taskType === "temperature_register" || taskType === "label_print") && !selectedSector) {
      setNotice("Seleziona un settore HACCP.");
      setIsHaccpSaving(false);
      return;
    }
    if (taskType === "temperature_register" && !selectedColdPoint) {
      setNotice("Seleziona un punto freddo.");
      setIsHaccpSaving(false);
      return;
    }
    const derivedArea = [selectedSector?.name || "", selectedColdPoint?.name || ""].filter(Boolean).join(" / ");
    try {
      const res = await apiFetch("/haccp/schedules/", {
        method: "POST",
        body: JSON.stringify({
          site: siteId,
          task_type: taskType,
          title: newHaccpTitle.trim(),
          area: derivedArea || newHaccpArea.trim() || null,
          sector: selectedSector?.id || null,
          sector_code: selectedSector?.external_code || "",
          sector_label: selectedSector?.name || "",
          cold_point: selectedColdPoint?.id || null,
          cold_point_code: selectedColdPoint?.external_code || "",
          cold_point_label: selectedColdPoint?.name || "",
          equipment_type: selectedColdPoint?.equipment_type || "",
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          status: "planned",
          recurrence_rule: {},
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(`Task HACCP creato: ${body.title}`);
      setNewHaccpTitle("");
      setNewHaccpArea("");
      setSelectedHaccpColdPointId("");
      setNewHaccpStartsAt("");
      setNewHaccpEndsAt("");
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteCreateConnection"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  async function onCreateHaccpLabelProfile(e: FormEvent) {
    e.preventDefault();
    if (!siteId) {
      setNotice(t("validation.selectSite"));
      return;
    }
    if (!newLabelProfileName.trim()) {
      setNotice("Inserisci il nome del profilo etichetta.");
      return;
    }
    const shelfLifeValue = newLabelShelfLifeValue.trim() ? Number(newLabelShelfLifeValue) : null;
    if (shelfLifeValue !== null && (!Number.isInteger(shelfLifeValue) || shelfLifeValue < 0)) {
      setNotice("Shelf life non valida.");
      return;
    }
    setIsHaccpSaving(true);
    const synced = await ensureHaccpSiteSynced(siteId);
    if (!synced) {
      setIsHaccpSaving(false);
      return;
    }
    try {
      const res = await apiFetch(editingLabelProfileId ? `/haccp/label-profiles/${editingLabelProfileId}/` : "/haccp/label-profiles/", {
        method: editingLabelProfileId ? "PATCH" : "POST",
        body: JSON.stringify({
          site: siteId,
          name: newLabelProfileName.trim(),
          category: newLabelProfileCategory.trim(),
          template_type: newLabelTemplateType,
          shelf_life_value: shelfLifeValue,
          shelf_life_unit: newLabelShelfLifeUnit,
          packaging: newLabelPackaging.trim(),
          storage_hint: newLabelStorageHint.trim(),
          allergens_text: newLabelAllergensText.trim(),
          is_active: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(editingLabelProfileId ? `Profilo etichetta aggiornato: ${body.name ?? newLabelProfileName.trim()}` : `Profilo etichetta creato: ${body.name ?? newLabelProfileName.trim()}`);
      setNewLabelProfileName("");
      setNewLabelProfileCategory("Carni");
      setEditingLabelProfileId("");
      setNewLabelTemplateType("PREPARATION");
      setNewLabelShelfLifeValue("3");
      setNewLabelShelfLifeUnit("days");
      setNewLabelPackaging("");
      setNewLabelStorageHint("");
      setNewLabelAllergensText("");
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteCreateConnection"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  function onEditHaccpLabelProfile(profileId: string) {
    const profile = haccpLabelProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    setEditingLabelProfileId(profile.id);
    setNewLabelProfileName(profile.name);
    setNewLabelProfileCategory((profile.category || "Carni").trim() || "Carni");
    setNewLabelTemplateType(profile.template_type);
    setNewLabelShelfLifeValue(profile.shelf_life_value == null ? "3" : String(profile.shelf_life_value));
    setNewLabelShelfLifeUnit(profile.shelf_life_unit || "days");
    setNewLabelPackaging(profile.packaging || "");
    setNewLabelStorageHint(profile.storage_hint || "");
    setNewLabelAllergensText(profile.allergens_text || "");
  }

  async function onDeleteHaccpLabelProfile(profileId: string) {
    if (!window.confirm("Eliminare questo profilo etichetta?")) {
      return;
    }
    setIsHaccpSaving(true);
    try {
      const res = await apiFetch(`/haccp/label-profiles/${profileId}/`, { method: "DELETE" });
      const body = res.status === 204 ? {} : await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", (body as Record<string, unknown>).detail ?? JSON.stringify(body)));
        return;
      }
      if (editingLabelProfileId === profileId) {
        setEditingLabelProfileId("");
        setNewLabelProfileName("");
        setNewLabelProfileCategory("Carni");
        setNewLabelTemplateType("PREPARATION");
        setNewLabelShelfLifeValue("3");
        setNewLabelShelfLifeUnit("days");
        setNewLabelPackaging("");
        setNewLabelStorageHint("");
        setNewLabelAllergensText("");
      }
      setNotice("Profilo etichetta eliminato.");
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteCreateConnection"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  async function onCreateHaccpLabelSession(e: FormEvent) {
    e.preventDefault();
    if (!siteId) {
      setNotice(t("validation.selectSite"));
      return;
    }
    if (!selectedLabelProfileId) {
      setNotice("Seleziona un profilo etichetta.");
      return;
    }
    const quantity = Number(newLabelSessionQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setNotice("Quantita etichette non valida.");
      return;
    }
    setIsHaccpSaving(true);
    const synced = await ensureHaccpSiteSynced(siteId);
    if (!synced) {
      setIsHaccpSaving(false);
      return;
    }
    try {
      const res = await apiFetch("/haccp/label-sessions/", {
        method: "POST",
        body: JSON.stringify({
          site: siteId,
          profile_id: selectedLabelProfileId,
          planned_schedule_id: selectedLabelPlannedScheduleId || null,
          source_lot_code: newLabelSessionSourceLotCode.trim(),
          quantity,
          status: "planned",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(`Sessione etichette creata: ${body.id ?? selectedLabelProfileId}`);
      setNewLabelSessionQuantity("12");
      setNewLabelSessionSourceLotCode("");
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteCreateConnection"));
    } finally {
      setIsHaccpSaving(false);
    }
  }

  async function onSetHaccpScheduleStatus(scheduleId: string, statusValue: "planned" | "done" | "skipped" | "cancelled") {
    if (!siteId) return;
    try {
      const res = await apiFetch(`/haccp/schedules/${scheduleId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusValue }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.siteCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(`Task HACCP aggiornato: ${body.title ?? scheduleId}`);
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteCreateConnection"));
    }
  }

  async function onDeleteHaccpSchedule(scheduleId: string) {
    if (!siteId) return;
    try {
      const res = await apiFetch(`/haccp/schedules/${scheduleId}/`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        setNotice(errorWithDetail("error.siteDelete", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice("Task HACCP eliminato.");
      await loadHaccpData();
    } catch {
      setNotice(t("error.siteDelete"));
    }
  }

  async function onApplyInventorySnapshot(e: FormEvent) {
    e.preventDefault();
    if (!siteId) return;
    let parsedLines: unknown;
    try {
      parsedLines = JSON.parse(inventoryLinesJson);
    } catch {
      setNotice(t("validation.invalidExtractionJson"));
      return;
    }
    if (!Array.isArray(parsedLines) || parsedLines.length === 0) {
      setNotice("Inventaire vide.");
      return;
    }
    setIsApplyingInventory(true);
    try {
      const res = await apiFetch("/inventory/inventories/apply/", {
        method: "POST",
        body: JSON.stringify({
          site: siteId,
          scope: inventoryScope,
          happened_at: new Date().toISOString(),
          lines: parsedLines,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.ingest", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(`Inventaire applique. Ajustements: ${Number(body.applied_count ?? 0)}.`);
      setLastInventoryApplied(Array.isArray(body.applied) ? (body.applied as Array<Record<string, unknown>>) : []);
      await loadStockSummary();
      await loadInventoryMovements();
    } catch {
      setNotice(t("error.ingest"));
    } finally {
      setIsApplyingInventory(false);
    }
  }

  function onSubmitMenuEntry(e: FormEvent) {
    e.preventDefault();
    const qtyValue = Number.parseFloat(entryExpectedQty);
    if (!editingSpace) {
      setNotice(t("validation.entryTitleRequired"));
      return;
    }
    if (entryKind === "product" && !entryTitle.trim()) {
      setNotice(t("validation.entryTitleRequired"));
      return;
    }
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      setNotice(t("validation.targetPortionsGtZero"));
      return;
    }
    if (entryScheduleMode === "recurring_weekly" && entryWeekdays.length === 0) {
      setNotice(t("validation.weeklyNeedsDay"));
      return;
    }
    const selectedSet = new Set(selectedRecipeKeys);
    const selectedRecipes =
      entryKind === "recipe"
        ? recipeTitleSuggestions
            .filter((item) => selectedSet.has(recipeSuggestionKey(item)))
            .filter((item) => String(item.title || "").trim().length > 0)
        : [];

    if (entryKind === "recipe" && selectedRecipes.length === 0 && !entryTitle.trim()) {
      setNotice(t("validation.entryTitleRequired"));
      return;
    }

    const fallbackTitle = entryTitle.trim();
    const selectedOrFallback =
      entryKind === "recipe" && selectedRecipes.length === 0
        ? [
            {
              fiche_product_id: entryFicheProductId ?? "",
              title: fallbackTitle,
              portions: null,
              category: entrySection.trim(),
            } as RecipeTitleSuggestion,
          ]
        : selectedRecipes;

    const entriesToApply: MenuEntry[] =
      entryKind === "recipe"
        ? selectedOrFallback.map((item) => {
            const inferredCategory = String(item.category ?? "").trim();
            return {
              id: editingEntryId && selectedOrFallback.length === 1 ? editingEntryId : crypto.randomUUID(),
              title: String(item.title || "").trim(),
              item_kind: "recipe",
              fiche_product_id: String(item.fiche_product_id || "").trim() || null,
              expected_qty: qtyValue.toFixed(3),
              section: entrySection.trim(),
              recipe_category: inferredCategory || entrySection.trim(),
              valid_from: entryValidFrom,
              valid_to: entryValidTo,
              schedule_mode: entryScheduleMode,
              weekdays: [...entryWeekdays].sort((a, b) => a - b),
            };
          })
        : [
            {
              id: editingEntryId ?? crypto.randomUUID(),
              title: fallbackTitle,
              item_kind: "product",
              fiche_product_id: null,
              expected_qty: qtyValue.toFixed(3),
              section: entrySection.trim(),
              recipe_category: "",
              valid_from: entryValidFrom,
              valid_to: entryValidTo,
              schedule_mode: entryScheduleMode,
              weekdays: [...entryWeekdays].sort((a, b) => a - b),
            },
          ];

    setMenuSpaces((prev) => {
      const next = prev.map((space) => {
        if (space.id !== editingSpace.id) return space;
        if (editingEntryId && entriesToApply.length === 1) {
          return {
            ...space,
            entries: space.entries.map((entry) => (entry.id === editingEntryId ? entriesToApply[0] : entry)),
          };
        }
        return { ...space, entries: [...space.entries, ...entriesToApply] };
      });
      void syncServiceMenuEntries(next, false);
      return next;
    });
    setIsMenuEditorOpen(false);
    setEditingEntryId(null);
    setEntryTitle("");
    setEntryFicheProductId(null);
    setEntryExpectedQty("0");
    setEntrySection("");
    setEntryValidFrom("");
    setEntryValidTo("");
    setEntryScheduleMode(editingSpace.schedule_mode ?? inferScheduleModeFromSpaceId(editingSpace.id));
    setEntryWeekdays([]);
    setRecipePickerSearch("");
    setSelectedRecipeKeys([]);
    setNotice(editingEntryId ? t("notice.entryUpdated") : t("notice.entryAdded"));
  }

  async function syncServiceMenuEntries(spacesToSync: MenuSpace[] = menuSpaces, withNotice = true) {
    if (!siteId) {
      if (withNotice) {
        setNotice(t("validation.selectSiteBeforeChecklist"));
      }
      return false;
    }
    const entries = spacesToSync
      .filter((space) => space.enabled)
      .sort((a, b) => a.order - b.order)
      .flatMap((space) =>
        space.entries.map((entry, index) => ({
          space_key: space.id,
          section: entry.section || "",
          title: entry.title,
          fiche_product_id: entry.item_kind === "recipe" ? entry.fiche_product_id ?? null : null,
          expected_qty: entry.expected_qty || "0",
          sort_order: index,
          is_active: true,
          metadata: {
            item_kind: entry.item_kind,
            valid_from: entry.valid_from || null,
            valid_to: entry.valid_to || null,
            recipe_category: entry.recipe_category || entry.section || null,
            schedule_mode: entry.schedule_mode ?? space.schedule_mode ?? inferScheduleModeFromSpaceId(space.id),
            weekdays:
              (entry.schedule_mode ?? space.schedule_mode ?? inferScheduleModeFromSpaceId(space.id)) === "recurring_weekly"
                ? normalizeWeekdays(entry.weekdays)
                : [],
            source: "frontend",
          },
        }))
      );

    const dedupedMap = new Map<string, (typeof entries)[number]>();
    entries.forEach((item) => {
      const metadata =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {};
      const scheduleMode = String(metadata.schedule_mode ?? "").trim().toLowerCase();
      const validFrom = String(metadata.valid_from ?? "").trim();
      const validTo = String(metadata.valid_to ?? "").trim();
      const weekdays = Array.isArray(metadata.weekdays)
        ? [...new Set(metadata.weekdays.map((value) => Number(value)).filter((value) => Number.isInteger(value)))].sort(
            (a, b) => a - b
          )
        : [];
      const signature = [
        String(item.space_key || "").trim().toLowerCase(),
        String(item.section || "").trim().toLowerCase(),
        String(item.title || "").trim().toLowerCase(),
        String(item.fiche_product_id || "").trim().toLowerCase(),
        scheduleMode,
        validFrom,
        validTo,
        weekdays.join(","),
      ].join("|");
      dedupedMap.set(signature, item);
    });
    const entriesPayload = Array.from(dedupedMap.values());

    const res = await apiFetch("/servizio/menu-entries/sync", {
      method: "POST",
      body: JSON.stringify({
        site_id: siteId,
        service_date: serviceDate,
        entries: entriesPayload,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      if (withNotice) {
        setNotice(errorWithDetail("error.menuSync", body.detail ?? JSON.stringify(body)));
      }
      return false;
    }
    if (withNotice) {
      setNotice(t("notice.menuSaved"));
    }
    return true;
  }

  async function loadIngredientsChecklist(view: ChecklistView) {
    if (!siteId) {
      setNotice(t("validation.selectSite"));
      return;
    }
    if (!comandaDateFrom || !comandaDateTo) {
      setNotice(t("validation.selectValidDateRange"));
      return;
    }
    const dates = listIsoDatesBetween(comandaDateFrom, comandaDateTo);
    if (dates.length === 0) {
      setNotice(t("validation.invalidDateRange"));
      return;
    }
    if (dates.length > 62) {
      setNotice(t("validation.dateRangeTooWide"));
      return;
    }
    setIsChecklistLoading(true);
    try {
      const warnings: string[] = [];
      const recipeRows: Array<Record<string, unknown>> = [];
      for (const day of dates) {
        const res = await apiFetch(
          `/servizio/ingredients?site=${encodeURIComponent(siteId)}&date=${encodeURIComponent(day)}&view=recipe`
        );
        const body = await res.json();
        if (!res.ok) {
          setNotice(errorWithDetail("error.checklistForDay", `${day}: ${body.detail ?? JSON.stringify(body)}`));
          setIngredientsRows([]);
          setIngredientWarnings([]);
          return;
        }
        const dayWarnings: unknown[] = Array.isArray(body.warnings) ? body.warnings : [];
        dayWarnings.forEach((warning: unknown) => warnings.push(`[${day}] ${String(warning)}`));
        const rows = Array.isArray(body.rows) ? body.rows : [];
        rows.forEach((row: unknown) => {
          const recipeRow = row as Record<string, unknown>;
          recipeRows.push({ ...recipeRow, service_date: day });
        });
      }

      const derivedSections = new Set<string>();
      recipeRows.forEach((row) => {
        const baseSection = String(row.section ?? row.recipe_category ?? "").trim();
        if (baseSection) derivedSections.add(baseSection);
        const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
        ingredients.forEach((raw) => {
          const ing = raw as Record<string, unknown>;
          const srcCategory = String(ing.source_recipe_category ?? "").trim();
          if (srcCategory) derivedSections.add(srcCategory);
        });
      });
      setRecipeDerivedSections(Array.from(derivedSections).sort((a, b) => a.localeCompare(b)));

      const selectedSpacesSet = new Set(selectedComandaSpaces);
      const selectedSectionsSet = new Set(selectedComandaSections);
      const filteredRecipeRows = recipeRows.filter((row) => {
        const rowSpace = String(row.space ?? "");
        const rowSection = String(row.section ?? row.recipe_category ?? "").trim();
        const ingredientSections = new Set<string>();
        if (rowSection) ingredientSections.add(rowSection);
        const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
        ingredients.forEach((raw) => {
          const ing = raw as Record<string, unknown>;
          const srcCategory = String(ing.source_recipe_category ?? "").trim();
          if (srcCategory) ingredientSections.add(srcCategory);
        });
        const passSpace = selectedComandaSpaces.length === 0 || selectedSpacesSet.has(rowSpace);
        const passSection =
          selectedComandaSections.length === 0 ||
          (ingredientSections.size === 0
            ? selectedSectionsSet.has(t("label.noSection"))
            : Array.from(ingredientSections).some((section) => selectedSectionsSet.has(section)));
        return passSpace && passSection;
      });

      let nextRows: Array<Record<string, unknown>> = [];
      if (view === "recipe") {
        nextRows = filteredRecipeRows.map((row) => {
          const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
          if (quantityMode === "with_qty") return row;
          const dedup = new Map<string, Record<string, unknown>>();
          ingredients.forEach((raw) => {
            const ing = raw as Record<string, unknown>;
            const ingredient = String(ing.ingredient ?? "").trim();
            const supplier = String(ing.supplier ?? "").trim();
            const supplierCode = String(ing.supplier_code ?? "").trim();
            const key = `${supplier}|${supplierCode}|${ingredient}`;
            if (!dedup.has(key)) {
              dedup.set(key, {
                ingredient,
                supplier,
                supplier_code: supplierCode,
                unit: "",
                qty_total: "",
                source_type: ing.source_type ?? "direct",
                source_recipe_title: ing.source_recipe_title ?? null,
              });
            }
          });
          return { ...row, ingredients: Array.from(dedup.values()) };
        });
      } else if (view === "supplier") {
        const aggregate = new Map<string, Record<string, unknown>>();
        filteredRecipeRows.forEach((row) => {
          const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
          ingredients.forEach((raw) => {
            const ing = raw as Record<string, unknown>;
            const supplier = String(ing.supplier ?? t("label.noSupplier"));
            const supplierCode = String(ing.supplier_code ?? "").trim();
            const ingredient = String(ing.ingredient ?? "");
            const unit = String(ing.unit ?? "");
            const sourceType = String(ing.source_type ?? "direct");
            const sourceRecipeTitle = String(ing.source_recipe_title ?? "");
            const key =
              quantityMode === "with_qty"
                ? `${supplier}|${supplierCode}|${ingredient}|${unit}|${sourceType}|${sourceRecipeTitle}`
                : `${supplier}|${supplierCode}|${ingredient}|${sourceType}|${sourceRecipeTitle}`;
            if (!aggregate.has(key)) {
              aggregate.set(key, {
                supplier,
                supplier_code: supplierCode,
                ingredient,
                unit: quantityMode === "with_qty" ? unit : "",
                qty_total: 0,
                source_type: sourceType,
                source_recipe_title: sourceRecipeTitle || null,
              });
            }
            if (quantityMode === "with_qty") {
              const current = aggregate.get(key)!;
              current.qty_total = asNumber(current.qty_total) + asNumber(ing.qty_total);
            }
          });
        });
        nextRows = Array.from(aggregate.values()).map((row) => ({
          ...row,
          qty_total: quantityMode === "with_qty" ? asNumber(row.qty_total).toFixed(3) : "",
        }));
      } else {
        const aggregate = new Map<string, Record<string, unknown>>();
        filteredRecipeRows.forEach((row) => {
          const section = String(row.section ?? row.recipe_category ?? "").trim() || t("label.noSection");
          const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
          ingredients.forEach((raw) => {
            const ing = raw as Record<string, unknown>;
            const ingredient = String(ing.ingredient ?? "");
            const supplier = String(ing.supplier ?? t("label.noSupplier"));
            const supplierCode = String(ing.supplier_code ?? "").trim();
            const nestedCategory = String(ing.source_recipe_category ?? "").trim();
            const unit = String(ing.unit ?? "");
            const sectorKey = nestedCategory || section;
            const key =
              quantityMode === "with_qty"
                ? `${sectorKey}|${ingredient}|${supplier}|${supplierCode}|${unit}`
                : `${sectorKey}|${ingredient}|${supplier}|${supplierCode}`;
            if (!aggregate.has(key)) {
              aggregate.set(key, {
                section: sectorKey,
                ingredient,
                supplier,
                supplier_code: supplierCode,
                unit: quantityMode === "with_qty" ? unit : "",
                qty_total: 0,
              });
            }
            if (quantityMode === "with_qty") {
              const current = aggregate.get(key)!;
              current.qty_total = asNumber(current.qty_total) + asNumber(ing.qty_total);
            }
          });
        });
        nextRows = Array.from(aggregate.values())
          .sort((a, b) => String(a.section ?? "").localeCompare(String(b.section ?? "")))
          .map((row) => ({
            ...row,
            qty_total: quantityMode === "with_qty" ? asNumber(row.qty_total).toFixed(3) : "",
          }));
      }

      setIngredientsRows(nextRows);
      setIngredientWarnings(warnings);
      setNotice(t("notice.checklistUpdated"));
    } catch {
      setNotice(t("error.checklistConnection"));
    } finally {
      setIsChecklistLoading(false);
    }
  }

  async function onGenerateChecklist() {
    if (!siteId) {
      setNotice(t("validation.selectSiteBeforeChecklist"));
      return;
    }
    const loaded = await loadServiceMenuEntries(siteId, comandaDateFrom, false, false);
    if (!loaded) {
      setNotice(t("error.menuReloadBeforeChecklist"));
      return;
    }
    await loadIngredientsChecklist(ingredientsView);
  }

  function resetComandeState() {
    const today = getTodayIsoDate();
    setComandaDateFrom(today);
    setComandaDateTo(today);
    setSelectedComandaSpaces([]);
    setSelectedComandaSections([]);
    setIngredientsRows([]);
    setIngredientWarnings([]);
    setRecipeDerivedSections([]);
    setSupplierSearch("");
    setSectorSearch("");
    setRecipeSearch("");
    setIngredientsView("supplier");
    setQuantityMode("with_qty");
    setIsChecklistLoading(false);
  }

  const vociCartaTotali = useMemo(
    () => menuSpaces.reduce((acc, space) => acc + space.entries.length, 0),
    [menuSpaces]
  );

  const activeSite = sites.find((site) => site.id === siteId);
  const getDocumentFileUrl = (doc: DocumentItem | null): string => {
    if (!doc) return "";
    const raw = String(doc.file || doc.storage_path || "").trim();
    if (!raw) return "";
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const apiBase = getApiBase();
    const root = apiBase.replace(/\/api\/v1\/?$/, "");
    if (raw.startsWith("/")) return `${root}${raw}`;
    return `${root}/media/${raw.replace(/^media\//, "")}`;
  };
  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedDocId) ?? null,
    [documents, selectedDocId]
  );
  const intakeDocuments = useMemo(
    () => documents.filter((doc) => doc.document_type === "goods_receipt" || doc.document_type === "invoice"),
    [documents]
  );
  const originalDocumentUrl = useMemo(() => getDocumentFileUrl(selectedDocument), [selectedDocument]);
  const haccpLabelCaptureQueue = useMemo(() => normalizeHaccpOcrQueueRowsFromDocuments(documents), [documents]);
  const selectedHaccpQueueItem = useMemo(
    () => haccpLabelCaptureQueue.find((item) => item.document_id === selectedHaccpDocumentId) ?? haccpLabelCaptureQueue[0] ?? null,
    [haccpLabelCaptureQueue, selectedHaccpDocumentId]
  );
  const selectedHaccpDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedHaccpQueueItem?.document_id) ?? null,
    [documents, selectedHaccpQueueItem]
  );
  const selectedHaccpDocumentUrl = useMemo(() => getDocumentFileUrl(selectedHaccpDocument), [selectedHaccpDocument]);
  const duplicateDocuments = useMemo(
    () => documents.filter((doc) => doc.status === "archived_duplicate"),
    [documents]
  );
  const archivedDeliveryNotes = useMemo(
    () => documents.filter((doc) => doc.document_type === "goods_receipt" && doc.status !== "archived_duplicate"),
    [documents]
  );
  const archivedInvoices = useMemo(
    () => documents.filter((doc) => doc.document_type === "invoice" && doc.status !== "archived_duplicate"),
    [documents]
  );
  const duplicateDeliveryNotes = useMemo(
    () => duplicateDocuments.filter((doc) => doc.document_type === "goods_receipt"),
    [duplicateDocuments]
  );
  const duplicateInvoices = useMemo(
    () => duplicateDocuments.filter((doc) => doc.document_type === "invoice"),
    [duplicateDocuments]
  );
  const documentDuplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    intakeDocuments.forEach((doc) => {
      const key = getDocumentDuplicateKey(doc);
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [intakeDocuments]);
  const getDocumentDuplicateCount = (doc: DocumentItem): number => {
    const key = getDocumentDuplicateKey(doc);
    return key ? documentDuplicateCounts.get(key) ?? 0 : 0;
  };
  const selectedDocumentDuplicateCount = useMemo(
    () => (selectedDocument ? getDocumentDuplicateCount(selectedDocument) : 0),
    [documentDuplicateCounts, selectedDocument]
  );
  const previewDocumentUrl = originalDocumentBlobUrl;
  const haccpAnomalyRows = useMemo(() => {
    const rows: Array<{ id: string; happened_at: string; source: string; category: string; detail: string; severity: string }> = [];
    haccpLabelCaptureQueue
      .filter((item) => item.validation_status === "rejected")
      .forEach((item) => {
        rows.push({
          id: `ocr-${item.document_id}`,
          happened_at: String(item.updated_at || item.created_at || ""),
          source: "Convalida OCR",
          category: "Documento respinto",
          detail: `${item.filename} richiede revisione manuale.`,
          severity: "high",
        });
      });

    (haccpReconciliationOverview?.results ?? [])
      .filter((item) => item.reconcile_status !== "reconciled" || item.alerts.length > 0)
      .forEach((item) => {
        rows.push({
          id: `reco-${item.event_id}`,
          happened_at: String(item.happened_at || ""),
          source: "Lifecycle / riconciliazione",
          category: item.reconcile_status,
          detail: item.alerts.join(" ") || `${item.product_label}: collegamento incompleto tra Traccia, bolle o fatture.`,
          severity: item.reconcile_status === "missing" ? "high" : "medium",
        });
      });

    const now = Date.now();
    haccpSchedules
      .filter((item) => item.status === "planned")
      .forEach((item) => {
        const startsAt = new Date(item.starts_at).getTime();
        if (Number.isNaN(startsAt) || startsAt > now) return;
        const category =
          item.task_type === "temperature_register"
            ? "Temperatura scaduta"
            : item.task_type === "cleaning"
              ? "Pulizia non validata"
              : "Etichetta non eseguita";
        rows.push({
          id: `schedule-${item.id}`,
          happened_at: String(item.starts_at || ""),
          source: "Programmazione HACCP",
          category,
          detail: `${item.title} non risulta completato.`,
          severity: item.task_type === "temperature_register" ? "high" : "medium",
        });
      });

    return rows.sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at)));
  }, [haccpLabelCaptureQueue, haccpReconciliationOverview, haccpSchedules]);
  const dashboardPendingReviewCount = useMemo(
    () => haccpLabelCaptureQueue.filter((item) => item.validation_status === "pending_review" || item.validation_status === "pending").length,
    [haccpLabelCaptureQueue]
  );
  const dashboardValidatedCount = useMemo(
    () => haccpLabelCaptureQueue.filter((item) => item.validation_status === "validated").length,
    [haccpLabelCaptureQueue]
  );
  const dashboardFailedOcrCount = useMemo(
    () => haccpLabelCaptureQueue.filter((item) => item.validation_status === "failed" || item.extraction?.status === "failed").length,
    [haccpLabelCaptureQueue]
  );
  const dashboardTemperatureAlertCount = useMemo(() => {
    return haccpTemperatureReadings.filter((item) => {
      const observed = Number.parseFloat(String(item.temperature_celsius ?? ""));
      const reference = Number.parseFloat(String(item.reference_temperature_celsius ?? ""));
      if (!Number.isFinite(observed) || !Number.isFinite(reference)) return false;
      return observed > reference;
    }).length;
  }, [haccpTemperatureReadings]);
  const traceabilityReportRows = useMemo(() => {
    const decisionByDocumentId = new Map<string, TraceabilityReconciliationDecision>();
    reconciliationDecisions.forEach((decision) => {
      const metadata = asRecord(decision.metadata);
      const sourceDocumentId = String(metadata.source_document_id ?? "").trim();
      if (!sourceDocumentId) return;
      decisionByDocumentId.set(sourceDocumentId, decision);
    });
    return haccpLabelCaptureQueue.map((row) => {
      const payload = asRecord(row.extraction?.normalized_payload ?? {});
      const decision = decisionByDocumentId.get(row.document_id);
      const decisionMetadata = asRecord(decision?.metadata);
      return {
        ...row,
        productGuess: String(payload.product_guess ?? payload.product_name ?? payload.label ?? "-"),
        supplierName: String(payload.supplier_name ?? payload.supplier ?? payload.vendor_name ?? "-"),
        originLotCode: String(payload.origin_lot_code ?? payload.source_lot_code ?? "-"),
        supplierLotCode: String(payload.supplier_lot_code ?? payload.lot_code ?? payload.lot ?? "-"),
        productionDate: String(payload.production_date ?? payload.manufactured_at ?? "-"),
        dlcDate: String(payload.dlc_date ?? payload.expiry_date ?? "-"),
        reviewNotes: String(row.validation_notes ?? "-") || "-",
        reviewedAt: String(row.reviewed_at ?? row.updated_at ?? ""),
        allocatedQty: String(decisionMetadata.allocated_qty ?? "-"),
        allocatedUnit: String(decisionMetadata.allocated_unit ?? "-"),
        linkedDocumentName: String(decisionMetadata.registered_invoice_number ?? decisionMetadata.linked_document_filename ?? "-"),
        allocationStatus: String(decision?.decision_status ?? ""),
      };
    });
  }, [haccpLabelCaptureQueue, reconciliationDecisions]);
  const temperatureReportRows = useMemo(() => {
    return haccpTemperatureReadings.map((row) => {
      const observed = Number.parseFloat(String(row.temperature_celsius ?? ""));
      const reference = Number.parseFloat(String(row.reference_temperature_celsius ?? ""));
      const isAlert = Number.isFinite(observed) && Number.isFinite(reference) ? observed > reference : false;
      return {
        ...row,
        isAlert,
      };
    });
  }, [haccpTemperatureReadings]);
  const filteredTraceabilityReportRows = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    const supplierQ = reportSupplierSearch.trim().toLowerCase();
    const productQ = reportProductSearch.trim().toLowerCase();
    const lotQ = reportLotSearch.trim().toLowerCase();
    return traceabilityReportRows.filter((row) => {
      const createdAt = String(row.created_at || "").slice(0, 10);
      if (reportDateFrom && createdAt && createdAt < reportDateFrom) return false;
      if (reportDateTo && createdAt && createdAt > reportDateTo) return false;
      if (reportReviewStatus !== "all" && row.validation_status !== reportReviewStatus) return false;
      if (reportOnlyAnomalies && row.validation_status !== "rejected" && row.validation_status !== "failed" && row.validation_status !== "pending_review") {
        return false;
      }
      if (supplierQ && !String(row.supplierName || "").toLowerCase().includes(supplierQ)) return false;
      if (productQ && !String(row.productGuess || "").toLowerCase().includes(productQ)) return false;
      if (
        lotQ
        && !String(row.originLotCode || "").toLowerCase().includes(lotQ)
        && !String(row.supplierLotCode || "").toLowerCase().includes(lotQ)
      ) {
        return false;
      }
      if (!q) return true;
      return [
        row.filename,
        row.productGuess,
        row.supplierName,
        row.originLotCode,
        row.supplierLotCode,
        row.dlcDate,
        row.reviewNotes,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [traceabilityReportRows, reportDateFrom, reportDateTo, reportReviewStatus, reportSearch, reportOnlyAnomalies, reportSupplierSearch, reportProductSearch, reportLotSearch]);
  const filteredTemperatureReportRows = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return temperatureReportRows.filter((row) => {
      const observedAt = String(row.observed_at || "").slice(0, 10);
      if (reportDateFrom && observedAt && observedAt < reportDateFrom) return false;
      if (reportDateTo && observedAt && observedAt > reportDateTo) return false;
      if ((reportReviewStatus === "alert_only" || reportOnlyAnomalies) && !row.isAlert) return false;
      if (!q) return true;
      return [
        row.sector_name,
        row.cold_point_name,
        row.register_name,
        row.source,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [temperatureReportRows, reportDateFrom, reportDateTo, reportReviewStatus, reportSearch, reportOnlyAnomalies]);
  const filteredReconciliationRows = useMemo(() => {
    const q = reconciliationSearch.trim().toLowerCase();
    return (centralReconciliationOverview?.results ?? []).filter((row) => {
      if (reconciliationSiteFilter && row.site_id !== reconciliationSiteFilter) return false;
      if (reconciliationStatusFilter !== "all" && row.reconcile_status !== reconciliationStatusFilter) return false;
      if (reconciliationOnlyAlerts && row.alerts.length === 0) return false;
      if (!q) return true;
      return [
        row.product_label,
        row.site_name,
        row.supplier_code,
        row.lot?.internal_lot_code,
        row.lot?.supplier_lot_code,
        row.goods_receipts.map((item) => item.delivery_note_number).join(" "),
        row.invoices.map((item) => item.invoice_number).join(" "),
        row.alerts.join(" "),
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [centralReconciliationOverview, reconciliationOnlyAlerts, reconciliationSearch, reconciliationSiteFilter, reconciliationStatusFilter]);
  const selectedReconciliationRow = useMemo(
    () => filteredReconciliationRows.find((row) => row.event_id === selectedReconciliationEventId) ?? filteredReconciliationRows[0] ?? null,
    [filteredReconciliationRows, selectedReconciliationEventId]
  );
  const selectedReconciliationSourceDocument = useMemo(() => {
    if (!selectedReconciliationRow?.source_document_id) return null;
    return documents.find((doc) => doc.id === selectedReconciliationRow.source_document_id) ?? null;
  }, [documents, selectedReconciliationRow]);
  const selectedReconciliationSourceDocumentUrl = useMemo(
    () => getDocumentFileUrl(selectedReconciliationSourceDocument),
    [selectedReconciliationSourceDocument]
  );
  const selectedReconciliationSourcePayload = useMemo(
    () => asRecord(selectedReconciliationSourceDocument?.latest_extraction?.normalized_payload ?? {}),
    [selectedReconciliationSourceDocument]
  );
  const selectedReconciliationInvoiceReference = useMemo(
    () => extractInvoiceReferenceFromPayload(selectedReconciliationSourcePayload),
    [selectedReconciliationSourcePayload]
  );
  useEffect(() => {
    if (!filteredReconciliationRows.length) {
      if (selectedReconciliationEventId) setSelectedReconciliationEventId("");
      return;
    }
    if (!selectedReconciliationEventId || !filteredReconciliationRows.some((row) => row.event_id === selectedReconciliationEventId)) {
      setSelectedReconciliationEventId(filteredReconciliationRows[0].event_id);
    }
  }, [filteredReconciliationRows, selectedReconciliationEventId]);
  const supplierOrderGroups = useMemo(() => {
    if (ingredientsView !== "supplier") return [] as Array<{ supplier: string; rows: Array<Record<string, unknown>> }>;
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    ingredientsRows.forEach((row) => {
      const supplier = String(row.supplier ?? t("label.noSupplier"));
      if (!grouped.has(supplier)) {
        grouped.set(supplier, []);
      }
      grouped.get(supplier)!.push(row);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([supplier, rows]) => ({ supplier, rows }));
  }, [ingredientsRows, ingredientsView]);

  const sectorChecklistGroups = useMemo(() => {
    if (ingredientsView !== "sector") return [] as Array<{ section: string; rows: Array<Record<string, unknown>> }>;
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    ingredientsRows.forEach((row) => {
      const section = String(row.section ?? t("label.noSection"));
      if (!grouped.has(section)) {
        grouped.set(section, []);
      }
      grouped.get(section)!.push(row);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([section, rows]) => ({ section, rows }));
  }, [ingredientsRows, ingredientsView]);

  const recipeChecklistGroups = useMemo(() => {
    if (ingredientsView !== "recipe") return [] as Array<{ title: string; rows: Array<Record<string, unknown>> }>;
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    ingredientsRows.forEach((row) => {
      const title = String(row.title ?? t("menuEditor.entryTypeRecipe"));
      if (!grouped.has(title)) {
        grouped.set(title, []);
      }
      grouped.get(title)!.push(row);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([title, rows]) => ({ title, rows }));
  }, [ingredientsRows, ingredientsView]);

  const filteredSupplierGroups = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return supplierOrderGroups;
    return supplierOrderGroups.filter((group) => {
      if (group.supplier.toLowerCase().includes(q)) return true;
      return group.rows.some((row) => {
        const ingredient = String(row.ingredient ?? "").toLowerCase();
        const code = String(row.supplier_code ?? "").toLowerCase();
        return ingredient.includes(q) || code.includes(q);
      });
    });
  }, [supplierOrderGroups, supplierSearch]);

  const filteredSectorGroups = useMemo(() => {
    const q = sectorSearch.trim().toLowerCase();
    if (!q) return sectorChecklistGroups;
    return sectorChecklistGroups.filter((group) => {
      if (group.section.toLowerCase().includes(q)) return true;
      return group.rows.some((row) => {
        const ingredient = String(row.ingredient ?? "").toLowerCase();
        const supplier = String(row.supplier ?? "").toLowerCase();
        return ingredient.includes(q) || supplier.includes(q);
      });
    });
  }, [sectorChecklistGroups, sectorSearch]);

  const filteredRecipeGroups = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    if (!q) return recipeChecklistGroups;
    return recipeChecklistGroups.filter((group) => {
      if (group.title.toLowerCase().includes(q)) return true;
      return group.rows.some((row) => {
        const category = String(row.recipe_category ?? row.section ?? "").toLowerCase();
        return category.includes(q);
      });
    });
  }, [recipeChecklistGroups, recipeSearch]);

  const filteredStockRows = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return stockSummaryRows;
    return stockSummaryRows.filter((row) => {
      return (
        String(row.product_label ?? "").toLowerCase().includes(q) ||
        String(row.product_key ?? "").toLowerCase().includes(q) ||
        String(row.qty_unit ?? "").toLowerCase().includes(q) ||
        String(row.product_name ?? "").toLowerCase().includes(q) ||
        String(row.supplier_name ?? "").toLowerCase().includes(q) ||
        String(row.product_category ?? "").toLowerCase().includes(q)
      );
    });
  }, [stockSummaryRows, stockSearch]);

  function renderSourceBadge(row: Record<string, unknown>) {
    const sourceType = String(row.source_type ?? "direct");
    const sourceRecipeTitle = String(row.source_recipe_title ?? "").trim();
    if (sourceType !== "derived_recipe") return null;
    return (
      <span className="origin-badge" title={t("orders.derivedFromInternalPrep")}>
        PR: {sourceRecipeTitle || t("orders.internalPrep")}
      </span>
    );
  }

  function getProductCode(row: Record<string, unknown>): string {
    const code = row.supplier_code ?? row.supplier_sku ?? row.code;
    return String(code ?? "").trim();
  }

  function flowLabelForDocument(doc: DocumentItem): string {
    const metadata = asRecord(doc.metadata);
    const ingest = asRecord(metadata.ingest);
    const flowType = String(ingest.flow_type ?? "");
    if (!flowType) {
      return doc.status === "extracted" ? "Extrait, en attente de validation" : "Upload/OCR en cours";
    }
    if (flowType === "delivery_note_to_stock") return "BL -> Extrait -> Valide -> Stock ajoute";
    if (flowType === "invoice_direct_to_stock") return "Facture immediate -> Extrait -> Valide -> Stock ajoute";
    if (flowType === "invoice_after_delivery_note") return "Facture differee -> Extrait -> Valide -> Rapprochee BL";
    return flowType;
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function printChecklistTable(title: string, headers: string[], rows: string[][]) {
    const siteLabel = activeSite?.name ?? t("app.selectSite");
    const dateLabel = comandaDateFrom === comandaDateTo ? comandaDateFrom : `${comandaDateFrom} -> ${comandaDateTo}`;
    const headerHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const rowsHtml = rows
      .map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; color: #111827; }
        h1 { font-size: 20px; margin: 0 0 6px; }
        p { margin: 0 0 10px; color: #475569; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; }
        th { background: #eef5df; }
      </style></head><body>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(siteLabel)} | ${escapeHtml(dateLabel)}</p>
      <table><thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody></table></body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      document.body.removeChild(iframe);
      setNotice(t("error.printOpen"));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1000);
  }

  function printSupplierOrderCard(group: { supplier: string; rows: Array<Record<string, unknown>> }) {
    const headers = [t("table.ingredient"), t("table.supplierCode")];
    if (quantityMode === "with_qty") {
      headers.push(t("table.qty"), t("table.unit"));
    }
    headers.push(t("table.remaining"), t("table.toOrder"));
    const rows = group.rows.map((row) => {
      const cells = [String(row.ingredient ?? "-"), getProductCode(row) || "NC"];
      if (quantityMode === "with_qty") {
        cells.push(String(row.qty_total ?? "-"), String(row.unit ?? "-"));
      }
      cells.push("_____", "_____");
      return cells;
    });
    printChecklistTable(`${t("orders.supplierOrderCard")}: ${group.supplier}`, headers, rows);
  }

  function printSectorOrderCard(group: { section: string; rows: Array<Record<string, unknown>> }) {
    const headers = [t("table.ingredient"), t("table.supplier"), t("table.supplierCode")];
    if (quantityMode === "with_qty") {
      headers.push(t("table.qty"), t("table.unit"));
    }
    headers.push(t("table.remaining"), t("table.toOrder"));
    const rows = group.rows.map((row) => {
      const cells = [String(row.ingredient ?? "-"), String(row.supplier ?? "-"), getProductCode(row) || "NC"];
      if (quantityMode === "with_qty") {
        cells.push(String(row.qty_total ?? "-"), String(row.unit ?? "-"));
      }
      cells.push("_____", "_____");
      return cells;
    });
    printChecklistTable(`${t("orders.sectorOrderCard")}: ${group.section}`, headers, rows);
  }

  function printRecipeOrderCard(group: { title: string; rows: Array<Record<string, unknown>> }) {
    const first = group.rows[0] ?? {};
    const headers = [t("table.ingredient"), t("table.supplier"), t("table.supplierCode")];
    if (quantityMode === "with_qty") {
      headers.push(t("table.qty"), t("table.unit"));
    }
    headers.push(t("table.remaining"), t("table.toOrder"));
    const rows: string[][] = [];
    group.rows.forEach((row) => {
      const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
      ingredients.forEach((ing) => {
        const item = ing as Record<string, unknown>;
        const cells = [
          String(item.ingredient ?? "-"),
          String(item.supplier ?? "-"),
          getProductCode(item) || "NC",
        ];
        if (quantityMode === "with_qty") {
          cells.push(String(item.qty_total ?? "-"), String(item.unit ?? "-"));
        }
        cells.push("_____", "_____");
        rows.push(cells);
      });
    });
    const label = `${group.title} | ${String(first.recipe_category ?? first.section ?? t("label.noCategory"))}`;
    printChecklistTable(`${t("orders.recipeChecklist")}: ${label}`, headers, rows);
  }

  function exportCsv(filename: string, headers: string[], rows: string[][]) {
    const escapeCell = (value: string) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(escapeCell).join(";"), ...rows.map((row) => row.map(escapeCell).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportPdfReport(title: string, headers: string[], rows: string[][]) {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) {
      setNotice("Impossibile aprire la finestra PDF dal browser.");
      return;
    }
    const escapeHtml = (value: string) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;");
    const headerHtml = headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("");
    const bodyHtml = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
      .join("");
    const printedAt = new Date().toLocaleString("it-IT");
    popup.document.write(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #eef5df; }
    .meta { display: flex; gap: 16px; margin-bottom: 16px; font-size: 12px; color: #475569; }
    .meta strong { display: block; font-size: 11px; text-transform: uppercase; color: #64748b; }
    @page { size: A4 landscape; margin: 12mm; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    <div><strong>Sito</strong>${escapeHtml(activeSite?.name ?? "-")}</div>
    <div><strong>Generato il</strong>${escapeHtml(printedAt)}</div>
    <div><strong>Filtri</strong>${escapeHtml(`${reportDateFrom || "all"} -> ${reportDateTo || "all"} / ${reportReviewStatus}`)}</div>
  </div>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml || `<tr><td colspan="${headers.length}">Nessun dato</td></tr>`}</tbody>
  </table>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function resetReportFilters() {
    setReportDateFrom(getTodayIsoDate().slice(0, 8) + "01");
    setReportDateTo(getTodayIsoDate());
    setReportReviewStatus("all");
    setReportSearch("");
    setReportOnlyAnomalies(false);
    setReportSupplierSearch("");
    setReportProductSearch("");
    setReportLotSearch("");
  }

  function renderReportStatusChip(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    const label =
      normalized === "validated"
        ? "Confermato"
        : normalized === "rejected"
          ? "Rifiutato"
          : normalized === "pending_review"
            ? "Da validare"
            : normalized === "failed"
              ? "Fallito"
              : normalized || "-";
    return <span className={`status-chip status-chip--report-${normalized || "neutral"}`}>{label}</span>;
  }

  function renderTemperatureStatusChip(isAlert: boolean) {
    return <span className={`status-chip ${isAlert ? "status-chip--report-alert" : "status-chip--report-ok"}`}>{isAlert ? "Fuori soglia" : "OK"}</span>;
  }

  function renderReconciliationStatusChip(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    const label =
      normalized === "reconciled"
        ? "Riconciliato"
        : normalized === "documents_found"
          ? "Da confermare"
          : normalized === "goods_receipt_only"
            ? "Solo bolla"
            : normalized === "invoice_only"
              ? "Solo fattura"
              : normalized === "missing"
                ? "Mancante"
                : normalized || "-";
    return <span className={`status-chip status-chip--${normalized || "neutral"}`}>{label}</span>;
  }

  function renderReconciliationDecisionChip(value?: string | null) {
    const normalized = String(value || "").trim().toLowerCase();
    const label =
      normalized === "matched"
        ? "Match confermato"
        : normalized === "review_required"
          ? "Da rivedere"
          : normalized === "ignored"
            ? "Ignorato"
            : "-";
    return <span className={`status-chip status-chip--decision-${normalized || "neutral"}`}>{label}</span>;
  }

  function openTraceabilityReconciliationWindow() {
    const suffix = siteId ? `?site=${encodeURIComponent(siteId)}` : "";
    const targetUrl = `${window.location.origin}${window.location.pathname}${TRACEABILITY_RECONCILIATION_HASH}${suffix}`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  function closeTraceabilityReconciliationPage() {
    window.location.hash = "";
    setIsTraceabilityReconciliationPage(false);
    setReconciliationSiteFilter(reconciliationInitialSiteId || "");
    setNav("tracciabilita");
  }

  function getReconciliationSelection(row: HaccpReconciliationRow) {
    const saved = reconciliationSelections[row.event_id];
    return {
      goodsReceiptLineId: saved?.goodsReceiptLineId || row.goods_receipts[0]?.id || "",
      invoiceLineId: saved?.invoiceLineId || row.invoices[0]?.id || "",
    };
  }

  function getReconciliationDecision(row: HaccpReconciliationRow) {
    return reconciliationDecisions.find((item) => item.site === row.site_id && item.event_id === row.event_id) ?? null;
  }

  function getReconciliationLinkedDocument(row: HaccpReconciliationRow): DocumentItem | null {
    const linkedDocumentId = getReconciliationDecision(row)?.linked_document;
    if (!linkedDocumentId) return null;
    return documents.find((doc) => doc.id === linkedDocumentId) ?? null;
  }

  function getEffectiveReconciliationStatus(row: HaccpReconciliationRow) {
    const decision = getReconciliationDecision(row);
    if (decision?.decision_status === "matched") {
      return "reconciled";
    }
    return row.reconcile_status;
  }

  function getReconciliationSourceDocument(row: HaccpReconciliationRow): DocumentItem | null {
    if (!row.source_document_id) return null;
    return documents.find((doc) => doc.id === row.source_document_id) ?? null;
  }

  function getInvoiceDocumentCandidates(row: HaccpReconciliationRow) {
    const productKey = normalizeDocumentToken(row.product_label);
    const lotKey = normalizeDocumentToken(row.lot?.supplier_lot_code || row.lot?.internal_lot_code);
    const sourcePayload = asRecord(getReconciliationSourceDocument(row)?.latest_extraction?.normalized_payload ?? {});
    const supplierKey = normalizeDocumentToken(sourcePayload.supplier_name ?? sourcePayload.supplier ?? "");
    const sourceInvoiceReference = normalizeReferenceToken(extractInvoiceReferenceFromPayload(sourcePayload));
    const siteInvoices = registeredInvoices.filter((invoice) => !row.site_id || invoice.site === row.site_id);
    const hasExactInvoiceReferenceMatch = Boolean(
      sourceInvoiceReference
      && siteInvoices.some(
        (invoice) =>
          normalizeReferenceToken(invoice.invoice_number)
          && normalizeReferenceToken(invoice.invoice_number) === sourceInvoiceReference
      )
    );
    const deduped = new Map<string, {
      invoice: InvoiceRecord;
      linkedDocument: DocumentItem | null;
      score: number;
      reasons: string[];
      hasMeaningfulMatch: boolean;
      passesInvoiceReferenceGate: boolean;
      lineQtyValue: number;
      lineQtyUnit: string;
      lineLabel: string;
      lineLot: string;
      alreadyAllocatedQty: number;
      remainingQty: number;
      canAllocate: boolean;
      invoiceNumber: string;
      supplierName: string;
      duplicateCount: number;
    }>();
    siteInvoices
      .map((invoice) => {
        const lines = invoice.lines.map((line) => asRecord(line));
        const bestLine = findBestInvoiceLineMatch(lines, row);
        let score = 0;
        const reasons: string[] = [];
        const supplierName = suppliers.find((item) => item.id === invoice.supplier)?.name || "";
        const invoiceSupplier = normalizeDocumentToken(supplierName || invoice.supplier);
        const supplierHit = Boolean(supplierKey && invoiceSupplier && supplierKey === invoiceSupplier);
        const invoiceReferenceHit = Boolean(
          sourceInvoiceReference
          && normalizeReferenceToken(invoice.invoice_number)
          && normalizeReferenceToken(invoice.invoice_number) === sourceInvoiceReference
        );
        if (invoiceReferenceHit) {
          score += 8;
          reasons.push("numero fattura");
        }
        if (supplierHit) {
          score += 4;
          reasons.push("fornitore");
        }
        const productHit = bestLine.score >= 4;
        if (productHit) {
          score += 3;
          reasons.push("prodotto");
        }
        const lotHit = Boolean(lotKey && bestLine.lineLot && normalizeDocumentToken(bestLine.lineLot) === lotKey);
        if (lotHit) {
          score += 5;
          reasons.push("lotto");
        }
        const dateDelta = Math.abs(
          new Date(String(invoice.invoice_date || 0)).getTime() - new Date(String(row.happened_at || 0)).getTime()
        );
        if (Number.isFinite(dateDelta) && dateDelta <= 1000 * 60 * 60 * 24 * 3) {
          score += 1;
          reasons.push("data vicina");
        }
        const linkedDocument = archivedInvoices.find((doc) => {
          if (row.site_id && doc.site !== row.site_id) return false;
          const payload = asRecord(doc.latest_extraction?.normalized_payload ?? {});
          return normalizeDocumentToken(payload.invoice_number ?? payload.document_number) === normalizeDocumentToken(invoice.invoice_number);
        }) ?? null;
        const existingAllocatedQty = reconciliationDecisions
          .filter((decision) => {
            const metadata = asRecord(decision.metadata);
            return (
              String(metadata.registered_invoice_id ?? "") === invoice.id
              && decision.decision_status === "matched"
              && String(metadata.linked_document_line_lot ?? "") === String(bestLine.lineLot || "")
              && String(metadata.linked_document_line_label ?? "") === String(bestLine.lineLabel || "")
            );
          })
          .reduce((sum, decision) => {
            const metadata = asRecord(decision.metadata);
            return sum + asNumber(metadata.allocated_qty ?? "0");
          }, 0);
        const remainingQty = Math.max(bestLine.qtyValue - existingAllocatedQty, 0);
        return {
          invoice,
          linkedDocument,
          score,
          reasons,
          hasMeaningfulMatch: invoiceReferenceHit || supplierHit || productHit || lotHit,
          passesInvoiceReferenceGate: !hasExactInvoiceReferenceMatch || invoiceReferenceHit,
          lineQtyValue: bestLine.qtyValue,
          lineQtyUnit: bestLine.qtyUnit,
          lineLabel: bestLine.lineLabel,
          lineLot: bestLine.lineLot,
          alreadyAllocatedQty: existingAllocatedQty,
          remainingQty,
          canAllocate: bestLine.qtyValue <= 0 || asNumber(row.qty_value) <= remainingQty + 0.0001,
          invoiceNumber: String(invoice.invoice_number ?? "").trim(),
          supplierName: String(supplierName).trim(),
        };
      })
      .filter((item) => item.hasMeaningfulMatch && item.passesInvoiceReferenceGate)
      .forEach((item) => {
        const dedupeKey = [
          item.invoice.site,
          normalizeDocumentToken(item.supplierName),
          normalizeDocumentToken(item.invoiceNumber),
          normalizeDocumentDateToken(item.invoice.invoice_date),
        ].join("|");
        const existing = deduped.get(dedupeKey);
        if (!existing) {
          deduped.set(dedupeKey, { ...item, duplicateCount: 1 });
          return;
        }
        const replace =
          item.score > existing.score
          || (item.score === existing.score && String(item.invoice.invoice_date || "").localeCompare(String(existing.invoice.invoice_date || "")) > 0);
        if (replace) {
          deduped.set(dedupeKey, { ...item, duplicateCount: existing.duplicateCount + 1 });
        } else {
          deduped.set(dedupeKey, { ...existing, duplicateCount: existing.duplicateCount + 1 });
        }
      });
    return Array.from(deduped.values())
      .sort((a, b) => b.score - a.score || String(b.invoice.invoice_date || "").localeCompare(String(a.invoice.invoice_date || "")));
  }

  async function saveReconciliationDecision(
    row: HaccpReconciliationRow,
    decisionStatus: "review_required" | "ignored" | "matched",
    options?: { linkedMatchId?: string | null; linkedDocumentId?: string | null; metadata?: Record<string, unknown> }
  ) {
    if (!row.site_id) {
      setNotice("Sito mancante sulla riga di riconciliazione.");
      return;
    }
    try {
      const res = await apiFetch("/integration/reconciliation-decisions/", {
        method: "POST",
        body: JSON.stringify({
          site: row.site_id,
          event_id: row.event_id,
          decision_status: decisionStatus,
          notes: reconciliationDecisionNotes[row.event_id] || "",
          linked_document: options?.linkedDocumentId || null,
          linked_match: options?.linkedMatchId || null,
          metadata: {
            source: "traceability_reconciliation_ui",
            source_document_id: row.source_document_id || null,
            product_label: row.product_label,
            supplier_code: row.supplier_code || "",
            supplier_lot_code: row.lot?.supplier_lot_code || "",
            internal_lot_code: row.lot?.internal_lot_code || "",
            dlc_date: row.lot?.dlc_date || "",
            allocated_qty: row.qty_value || "",
            allocated_unit: row.qty_unit || "",
            happened_at: row.happened_at || "",
            ...(options?.metadata ?? {}),
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.reconciliationCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      const savedDecision = body as TraceabilityReconciliationDecision;
      setReconciliationDecisions((prev) => {
        const next = prev.filter((item) => !(item.site === row.site_id && item.event_id === row.event_id));
        next.unshift(savedDecision);
        return next;
      });
      setNotice(`Decisione salvata: ${decisionStatus}.`);
      await loadCentralTraceabilityReconciliation();
    } catch {
      setNotice(t("error.reconciliationCreate"));
    }
  }

  async function onCreateCentralReconciliationMatch(row: HaccpReconciliationRow) {
    const selection = getReconciliationSelection(row);
    if (!selection.goodsReceiptLineId || !selection.invoiceLineId) {
      setNotice("Seleziona una riga bolla e una riga fattura.");
      return;
    }
    try {
      const res = await apiFetch("/reconciliation/matches/", {
        method: "POST",
        body: JSON.stringify({
          invoice_line: selection.invoiceLineId,
          goods_receipt_line: selection.goodsReceiptLineId,
          status: "manual",
          note: `Conferma manuale da riconciliazione tracciabilita per evento ${row.event_id}`,
          metadata: {
            source: "traceability_reconciliation",
            event_id: row.event_id,
            site_id: row.site_id || null,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.reconciliationCreate", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(`Match creato: ${body.id}`);
      await saveReconciliationDecision(row, "matched", { linkedMatchId: String(body.id || "") });
      await loadCentralTraceabilityReconciliation();
    } catch {
      setNotice(t("error.reconciliationCreate"));
    }
  }

  async function onLinkReconciliationRowToInvoiceDocument(
    row: HaccpReconciliationRow,
    candidate: ReturnType<typeof getInvoiceDocumentCandidates>[number]
  ) {
    if (!candidate.canAllocate) {
      setNotice(`Quantita residua insufficiente su ${candidate.invoice.invoice_number}.`);
      return;
    }
    await saveReconciliationDecision(row, "matched", {
      linkedDocumentId: candidate.linkedDocument?.id || null,
      metadata: {
        linked_document_type: "invoice",
        linked_document_filename: candidate.linkedDocument?.filename || candidate.invoice.invoice_number,
        registered_invoice_id: candidate.invoice.id,
        registered_invoice_number: candidate.invoice.invoice_number,
        linked_document_line_label: candidate.lineLabel,
        linked_document_line_lot: candidate.lineLot,
        linked_document_line_qty: candidate.lineQtyValue,
        linked_document_line_unit: candidate.lineQtyUnit,
      },
    });
    setNotice(`Etichetta collegata a ${candidate.invoice.invoice_number}.`);
  }

  async function onBulkLinkReconciliationRowsToInvoiceDocument(invoice: InvoiceRecord) {
    const candidateRows = filteredReconciliationRows.flatMap((row) => {
      if (row.reconcile_status === "reconciled") return [];
      const candidates = getInvoiceDocumentCandidates(row);
      const match = candidates.find((candidate) => candidate.invoice.id === invoice.id && candidate.canAllocate);
      return match ? [{ row, candidate: match }] : [];
    });
    if (candidateRows.length === 0) {
      setNotice("Nessuna etichetta compatibile con la fattura selezionata.");
      return;
    }
    for (const item of candidateRows) {
      await saveReconciliationDecision(item.row, "matched", {
        linkedDocumentId: item.candidate.linkedDocument?.id || null,
        metadata: {
          linked_document_type: "invoice",
          linked_document_filename: item.candidate.linkedDocument?.filename || invoice.invoice_number,
          registered_invoice_id: invoice.id,
          registered_invoice_number: invoice.invoice_number,
          linked_document_line_label: item.candidate.lineLabel,
          linked_document_line_lot: item.candidate.lineLot,
          linked_document_line_qty: item.candidate.lineQtyValue,
          linked_document_line_unit: item.candidate.lineQtyUnit,
          bulk_link: true,
        },
      });
    }
    setNotice(`Collegate ${candidateRows.length} etichette a ${invoice.invoice_number}.`);
  }

  async function clearReconciliationDecision(row: HaccpReconciliationRow) {
    if (!row.site_id) {
      setNotice("Sito mancante sulla riga di riconciliazione.");
      return;
    }
    try {
      const res = await apiFetch(
        `/integration/reconciliation-decisions/?site=${encodeURIComponent(row.site_id)}&event_id=${encodeURIComponent(row.event_id)}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 404) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          detail = String(body.detail ?? JSON.stringify(body));
        } catch {
          // keep generic detail
        }
        setNotice(errorWithDetail("error.reconciliationCreate", detail));
        return;
      }
      setReconciliationDecisionNotes((prev) => {
        const next = { ...prev };
        delete next[row.event_id];
        return next;
      });
      setReconciliationDecisions((prev) => prev.filter((item) => !(item.site === row.site_id && item.event_id === row.event_id)));
      setNotice("Decisione annullata.");
      await loadCentralTraceabilityReconciliation();
    } catch {
      setNotice(t("error.reconciliationCreate"));
    }
  }

  const landingFichesUrl = FICHES_RECETTES_URL || LANDING_FICHES_FALLBACK;
  const showLanding = !isLandingDismissed;
  const enterApp = () => {
    if (isLandingSkipChecked) {
      localStorage.setItem(LANDING_SKIP_STORAGE_KEY, "true");
    }
    setIsLandingDismissed(true);
  };

  return showLanding ? (
    <div className="landing-shell">
      <header className="landing-top">
        <div className="landing-brand">
          <img className="landing-logo" src="/chefside-logo.svg" alt="Chef Side" />
          <div>
            <p className="landing-kicker">Chefside</p>
            <p className="landing-subtitle">Accesso riservato</p>
          </div>
        </div>
        <span className="landing-badge">Private preview</span>
      </header>
      <main className="landing-main">
        <div className="landing-hero">
          <h1 className="landing-title">CookOps</h1>
          <p className="landing-lead">
            Workspace operativo per gestione menu, acquisti, inventario e tracciabilita.
          </p>
        </div>
        <div className="landing-actions">
          <button type="button" className="landing-primary-btn" onClick={enterApp}>
            Entra in CookOps
          </button>
          <a className="landing-secondary-btn" href={landingFichesUrl} target="_blank" rel="noreferrer">
            Apri Fiches Recettes
          </a>
        </div>
        <label className="landing-checkbox">
          <input
            type="checkbox"
            checked={isLandingSkipChecked}
            onChange={(e) => setIsLandingSkipChecked(e.target.checked)}
          />
          Non mostrare piu questa pagina
        </label>
      </main>
      <footer className="landing-footer">
        <span>chefside.fr</span>
        <span>Supporto interno</span>
      </footer>
    </div>
  ) : (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <button
            type="button"
            className="nav-menu-btn"
            onClick={() => setIsSidebarOpenMobile((prev) => !prev)}
            aria-label={t("app.menuToggle")}
          >
            {t("app.menuShort")}
          </button>
          <img className="brand-logo-image" src="/chefside-logo.svg" alt="Chef Side" />
          <p className="brand-sub">{t("app.brandSub")}</p>
        </div>
        <div className="header-actions">
          <select className="nav-lang-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("label.language")}>
            <option value="it">{t("lang.it")}</option>
            <option value="fr">{t("lang.fr")}</option>
            <option value="en">{t("lang.en")}</option>
          </select>
          <select className="nav-site-select" value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={isTraceabilityReconciliationPage}>
            <option value="">{t("app.selectSite")}</option>
            {sites.filter((site) => site.is_active).map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <button type="button" className="nav-gear-btn" onClick={() => setIsSettingsOpen(true)} aria-label={t("app.settings")}>
            {t("app.configShort")}
          </button>
        </div>
      </header>

      <div className={`app-layout ${isSidebarCollapsed ? "app-layout--collapsed" : ""} ${isTraceabilityReconciliationPage ? "app-layout--focus" : ""}`}>
        {!isTraceabilityReconciliationPage ? (
        <aside className={`sidebar ${isSidebarCollapsed ? "sidebar--collapsed" : ""} ${isSidebarOpenMobile ? "sidebar--open-mobile" : ""}`}>
          <div className="sidebar-title">{t("app.sidebarTitle")}</div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            aria-label={t("app.sidebarToggle")}
          >
            {isSidebarCollapsed ? ">>" : "<<"}
          </button>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`side-btn ${nav === item.key ? "side-btn--active" : ""}`}
              onClick={() => {
                setNav(item.key);
                setIsSidebarOpenMobile(false);
              }}
            >
              <span>{t(item.labelKey)}</span>
              <small>{t(item.helpKey)}</small>
            </button>
          ))}
          {FICHES_RECETTES_URL ? (
            <a
              className="side-btn side-btn--link"
              href={FICHES_RECETTES_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span>{t("app.fichesLinkTitle")}</span>
              <small>{t("app.fichesLinkDesc")}</small>
            </a>
          ) : null}
        </aside>
        ) : null}

        <main className="content">
          {isTraceabilityReconciliationPage ? (
            <div className="grid grid-single">
              <section className="panel">
                <div className="menu-space-header-row">
                  <div>
                    <h2>Riconciliazione tracciabilita</h2>
                    <p className="muted">
                      Vista centrale.
                      {reconciliationInitialSiteId ? ` Filtro iniziale: ${sites.find((item) => item.id === reconciliationInitialSiteId)?.name || reconciliationInitialSiteId}.` : ""}
                    </p>
                  </div>
                  <div className="entry-actions no-print">
                    <button type="button" onClick={loadCentralTraceabilityReconciliation} disabled={isCentralReconciliationLoading}>
                      {isCentralReconciliationLoading ? t("action.loading") : t("suppliers.refreshList")}
                    </button>
                    <button type="button" onClick={closeTraceabilityReconciliationPage}>Chiudi</button>
                  </div>
                </div>
              </section>

              {!centralReconciliationOverview || centralReconciliationOverview.results.length === 0 ? (
                <section className="panel">
                  <p className="muted">Nessun dato di riconciliazione disponibile.</p>
                </section>
              ) : (
                <>
                  <section className="panel">
                    <div className="traceability-compact-summary">
                      <span><strong>{filteredReconciliationRows.filter((row) => row.reconcile_status === "reconciled").length}</strong> riconciliati</span>
                      <span><strong>{filteredReconciliationRows.filter((row) => row.reconcile_status === "documents_found").length}</strong> da confermare</span>
                      <span><strong>{filteredReconciliationRows.filter((row) => row.reconcile_status === "goods_receipt_only").length}</strong> solo bolla</span>
                      <span><strong>{filteredReconciliationRows.filter((row) => row.reconcile_status === "invoice_only").length}</strong> solo fattura</span>
                      <span><strong>{filteredReconciliationRows.filter((row) => row.reconcile_status === "missing").length}</strong> mancanti</span>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="grid grid-2">
                      <div>
                        <label>Sito</label>
                        <select value={reconciliationSiteFilter} onChange={(e) => setReconciliationSiteFilter(e.target.value)}>
                          <option value="">Tutti i siti</option>
                          {sites.filter((item) => item.is_active).map((site) => (
                            <option key={site.id} value={site.id}>{site.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Ricerca</label>
                        <input
                          value={reconciliationSearch}
                          onChange={(e) => setReconciliationSearch(e.target.value)}
                          placeholder="Prodotto, lotto, bolla, fattura..."
                        />
                      </div>
                      <div>
                        <label>Stato</label>
                        <select value={reconciliationStatusFilter} onChange={(e) => setReconciliationStatusFilter(e.target.value)}>
                          <option value="all">Tutti</option>
                          <option value="reconciled">Riconciliati</option>
                          <option value="documents_found">Da confermare</option>
                          <option value="goods_receipt_only">Solo bolla</option>
                          <option value="invoice_only">Solo fattura</option>
                          <option value="missing">Mancanti</option>
                        </select>
                      </div>
                      <div className="checkline report-checkline">
                        <input
                          type="checkbox"
                          checked={reconciliationOnlyAlerts}
                          onChange={(e) => setReconciliationOnlyAlerts(e.target.checked)}
                        />
                        <span>Solo alert</span>
                      </div>
                    </div>
                  </section>
                  <section className="panel">
                    {filteredReconciliationRows.length === 0 ? (
                      <p className="muted">Nessuna riga per i filtri selezionati.</p>
                    ) : null}
                    <div className="sheet-wrap">
                      <table className="sheet-table">
                        <thead>
                          <tr>
                            <th>Sito</th>
                            <th>Data</th>
                            <th>Prodotto</th>
                            <th>Lotto</th>
                            <th>Documenti</th>
                            <th>Stato</th>
                            <th>Decisione</th>
                            <th>Azione</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredReconciliationRows.map((row) => (
                            <tr key={`${row.site_id || "central"}-${row.event_id}`}>
                              <td>{row.site_name || "-"}</td>
                              <td>{String(row.happened_at).replace("T", " ").slice(0, 19)}</td>
                              <td>
                                <strong>{row.product_label}</strong>
                                <div className="muted">{row.qty_value} {row.qty_unit}{row.supplier_code ? ` · ${row.supplier_code}` : ""}</div>
                              </td>
                              <td>{row.lot?.internal_lot_code || row.lot?.supplier_lot_code || "-"}</td>
                              <td>
                                {row.goods_receipts.length > 0 ? `BL ${row.goods_receipts.length}` : ""}
                                {row.goods_receipts.length > 0 && row.invoices.length > 0 ? " · " : ""}
                                {row.invoices.length > 0 ? `FAC ${row.invoices.length}` : ""}
                                {row.goods_receipts.length === 0 && row.invoices.length === 0 ? "-" : ""}
                              </td>
                              <td>{renderReconciliationStatusChip(getEffectiveReconciliationStatus(row))}</td>
                              <td>{renderReconciliationDecisionChip(getReconciliationDecision(row)?.decision_status)}</td>
                              <td>
                                <div className="entry-actions">
                                  <button type="button" onClick={() => setSelectedReconciliationEventId(row.event_id)}>
                                    Lavora
                                  </button>
                                </div>
                                <details>
                                  <summary>Apri</summary>
                                  <div className="reconciliation-detail">
                                    <div><strong>Bolle</strong> {row.goods_receipts.map((item) => item.delivery_note_number).join(", ") || "-"}</div>
                                    <div><strong>Fatture</strong> {row.invoices.map((item) => item.invoice_number).join(", ") || "-"}</div>
                                    <div><strong>Match</strong> {row.matches.length}</div>
                                    <div><strong>Alert</strong> {row.alerts.join(" ") || "-"}</div>
                                    <div><strong>Decisione</strong> {renderReconciliationDecisionChip(getReconciliationDecision(row)?.decision_status)}</div>
                                    <div>
                                      <label>Note</label>
                                      <textarea
                                        value={reconciliationDecisionNotes[row.event_id] ?? getReconciliationDecision(row)?.notes ?? ""}
                                        onChange={(e) =>
                                          setReconciliationDecisionNotes((prev) => ({
                                            ...prev,
                                            [row.event_id]: e.target.value,
                                          }))
                                        }
                                        rows={2}
                                      />
                                    </div>
                                    {row.matches.length === 0 && (row.goods_receipts.length > 0 || row.invoices.length > 0) ? (
                                      <div className="reconciliation-actions">
                                        <div>
                                          <label>Bolla</label>
                                          <select
                                            value={getReconciliationSelection(row).goodsReceiptLineId}
                                            onChange={(e) =>
                                              setReconciliationSelections((prev) => ({
                                                ...prev,
                                                [row.event_id]: {
                                                  goodsReceiptLineId: e.target.value,
                                                  invoiceLineId: prev[row.event_id]?.invoiceLineId || row.invoices[0]?.id || "",
                                                },
                                              }))
                                            }
                                          >
                                            <option value="">Seleziona</option>
                                            {row.goods_receipts.map((item) => (
                                              <option key={item.id} value={item.id}>{item.delivery_note_number}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label>Fattura</label>
                                          <select
                                            value={getReconciliationSelection(row).invoiceLineId}
                                            onChange={(e) =>
                                              setReconciliationSelections((prev) => ({
                                                ...prev,
                                                [row.event_id]: {
                                                  goodsReceiptLineId: prev[row.event_id]?.goodsReceiptLineId || row.goods_receipts[0]?.id || "",
                                                  invoiceLineId: e.target.value,
                                                },
                                              }))
                                            }
                                          >
                                            <option value="">Seleziona</option>
                                            {row.invoices.map((item) => (
                                              <option key={item.id} value={item.id}>{item.invoice_number}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="entry-actions">
                                          <button
                                            type="button"
                                            onClick={() => void onCreateCentralReconciliationMatch(row)}
                                            disabled={!getReconciliationSelection(row).goodsReceiptLineId || !getReconciliationSelection(row).invoiceLineId}
                                          >
                                            {row.goods_receipts.length === 1 && row.invoices.length === 1 ? "Conferma match" : "Collega manualmente"}
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                    <div className="reconciliation-actions reconciliation-actions--secondary">
                                      <div className="entry-actions">
                                        <button type="button" onClick={() => void saveReconciliationDecision(row, "review_required")}>
                                          Segna da rivedere
                                        </button>
                                      </div>
                                      <div className="entry-actions">
                                        <button type="button" className="warning-btn" onClick={() => void saveReconciliationDecision(row, "ignored")}>
                                          Ignora
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </details>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedReconciliationRow ? (
                      <div className="reconciliation-operate-panel">
                        <div className="reconciliation-operate-panel__main">
                          <div className="doc-preview__head">
                            <div>
                              <h3>{selectedReconciliationRow.product_label}</h3>
                              <p className="muted">
                                {selectedReconciliationRow.qty_value} {selectedReconciliationRow.qty_unit}
                                {selectedReconciliationRow.lot?.supplier_lot_code ? ` · Lotto ${selectedReconciliationRow.lot.supplier_lot_code}` : ""}
                                {selectedReconciliationRow.source_document_filename ? ` · ${selectedReconciliationRow.source_document_filename}` : ""}
                              </p>
                            </div>
                            <div className="reconciliation-sidepanel__chips">
                              {renderReconciliationStatusChip(getEffectiveReconciliationStatus(selectedReconciliationRow))}
                              {renderReconciliationDecisionChip(getReconciliationDecision(selectedReconciliationRow)?.decision_status)}
                            </div>
                          </div>
                          <div className="reconciliation-detail">
                            <div><strong>Alert</strong> {selectedReconciliationRow.alerts.join(" ") || "-"}</div>
                            <div><strong>Bolle candidate</strong> {selectedReconciliationRow.goods_receipts.map((item) => item.delivery_note_number).join(", ") || "-"}</div>
                            <div><strong>Fatture linee locali</strong> {selectedReconciliationRow.invoices.map((item) => item.invoice_number).join(", ") || "-"}</div>
                            <div><strong>Fattura collegata</strong> {getReconciliationLinkedDocument(selectedReconciliationRow)?.filename || "-"}</div>
                            <div><strong>Fattura letta da etichetta</strong> {selectedReconciliationInvoiceReference || "-"}</div>
                          </div>
                          <div>
                            <label>Note</label>
                            <textarea
                              value={reconciliationDecisionNotes[selectedReconciliationRow.event_id] ?? getReconciliationDecision(selectedReconciliationRow)?.notes ?? ""}
                              onChange={(e) =>
                                setReconciliationDecisionNotes((prev) => ({
                                  ...prev,
                                  [selectedReconciliationRow.event_id]: e.target.value,
                                }))
                              }
                              rows={2}
                            />
                          </div>
                          <div className="reconciliation-actions reconciliation-actions--secondary">
                            <div className="entry-actions">
                              <button type="button" onClick={() => void saveReconciliationDecision(selectedReconciliationRow, "review_required")}>
                                Segna da rivedere
                              </button>
                            </div>
                            <div className="entry-actions">
                              <button type="button" className="warning-btn" onClick={() => void saveReconciliationDecision(selectedReconciliationRow, "ignored")}>
                                Ignora
                              </button>
                            </div>
                            {getReconciliationDecision(selectedReconciliationRow) ? (
                              <div className="entry-actions">
                                <button type="button" onClick={() => void clearReconciliationDecision(selectedReconciliationRow)}>
                                  Annulla decisione
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {selectedReconciliationRow.matches.length === 0 && (selectedReconciliationRow.goods_receipts.length > 0 || selectedReconciliationRow.invoices.length > 0) ? (
                            <div className="reconciliation-candidate-list">
                              <h4>Match BL / fattura</h4>
                              <div className="reconciliation-actions">
                                <div>
                                  <label>Bolla</label>
                                  <select
                                    value={getReconciliationSelection(selectedReconciliationRow).goodsReceiptLineId}
                                    onChange={(e) =>
                                      setReconciliationSelections((prev) => ({
                                        ...prev,
                                        [selectedReconciliationRow.event_id]: {
                                          goodsReceiptLineId: e.target.value,
                                          invoiceLineId: prev[selectedReconciliationRow.event_id]?.invoiceLineId || selectedReconciliationRow.invoices[0]?.id || "",
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">Seleziona</option>
                                    {selectedReconciliationRow.goods_receipts.map((item) => (
                                      <option key={item.id} value={item.id}>{item.delivery_note_number}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label>Fattura</label>
                                  <select
                                    value={getReconciliationSelection(selectedReconciliationRow).invoiceLineId}
                                    onChange={(e) =>
                                      setReconciliationSelections((prev) => ({
                                        ...prev,
                                        [selectedReconciliationRow.event_id]: {
                                          goodsReceiptLineId: prev[selectedReconciliationRow.event_id]?.goodsReceiptLineId || selectedReconciliationRow.goods_receipts[0]?.id || "",
                                          invoiceLineId: e.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">Seleziona</option>
                                    {selectedReconciliationRow.invoices.map((item) => (
                                      <option key={item.id} value={item.id}>{item.invoice_number}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="entry-actions">
                                  <button
                                    type="button"
                                    onClick={() => void onCreateCentralReconciliationMatch(selectedReconciliationRow)}
                                    disabled={!getReconciliationSelection(selectedReconciliationRow).goodsReceiptLineId || !getReconciliationSelection(selectedReconciliationRow).invoiceLineId}
                                  >
                                    {selectedReconciliationRow.goods_receipts.length === 1 && selectedReconciliationRow.invoices.length === 1 ? "Conferma match" : "Collega manualmente"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <aside className="reconciliation-operate-panel__side">
                          {selectedReconciliationSourceDocumentUrl ? (
                            <div className="reconciliation-preview">
                              <div className="doc-preview__head">
                                <h4>Etichetta sorgente</h4>
                                <a className="doc-open-link" href={selectedReconciliationSourceDocumentUrl} target="_blank" rel="noreferrer">Apri foto</a>
                              </div>
                              <img
                                className="traceability-image traceability-image--compact"
                                src={selectedReconciliationSourceDocumentUrl}
                                alt={selectedReconciliationSourceDocument?.filename || selectedReconciliationRow.product_label}
                              />
                            </div>
                          ) : null}
                          <div className="reconciliation-candidate-list">
                            <div className="doc-preview__head">
                              <h4>Fatture candidate</h4>
                              <span className="muted">Collega l'etichetta direttamente alla fattura.</span>
                            </div>
                            {selectedReconciliationInvoiceReference && getInvoiceDocumentCandidates(selectedReconciliationRow).length > 0 ? (
                              <div className="muted">
                                Riferimento letto dall'etichetta: {selectedReconciliationInvoiceReference}.
                                {" "}
                                I candidati sotto sono proposti per lotto/prodotto/fornitore se non esiste un match esatto sul numero fattura.
                              </div>
                            ) : null}
                            {getInvoiceDocumentCandidates(selectedReconciliationRow).length === 0 ? (
                              <div className="reconciliation-warning">
                                {selectedReconciliationInvoiceReference
                                  ? `Nessuna fattura registrata compatibile con il riferimento letto sull'etichetta: ${selectedReconciliationInvoiceReference}.`
                                  : "Nessuna fattura candidata trovata."}
                              </div>
                            ) : (
                              getInvoiceDocumentCandidates(selectedReconciliationRow).map((candidate) => {
                                const { score, reasons } = candidate;
                                return (
                                <article key={candidate.invoice.id} className="reconciliation-candidate-card">
                                  <div className="reconciliation-candidate-card__head">
                                    <div>
                                      <strong>{candidate.invoice.invoice_number || "-"}</strong>
                                      <div className="muted">{String(candidate.invoice.invoice_date || "").slice(0, 10) || "-"}</div>
                                      <div className="muted">
                                        {candidate.linkedDocument?.filename || "fattura registrata"}
                                        {candidate.supplierName ? ` · ${candidate.supplierName}` : ""}
                                        {candidate.duplicateCount > 1 ? ` · doublon x${candidate.duplicateCount}` : ""}
                                      </div>
                                    </div>
                                    <span className="status-chip status-chip--documents_found">score {score}</span>
                                  </div>
                                  <div className="muted">Match: {reasons.join(", ") || "sito"}</div>
                                  <div className="muted">
                                    Riga: {candidate.lineLabel || "-"}
                                    {candidate.lineLot ? ` · Lotto ${candidate.lineLot}` : ""}
                                  </div>
                                  <div className="muted">
                                    Qta riga {candidate.lineQtyValue || 0} {candidate.lineQtyUnit || ""}
                                    {" · "}gia allocato {candidate.alreadyAllocatedQty || 0} {candidate.lineQtyUnit || ""}
                                    {" · "}residuo {candidate.remainingQty || 0} {candidate.lineQtyUnit || ""}
                                  </div>
                                  {!candidate.canAllocate ? (
                                    <div className="reconciliation-warning">
                                      Quantita etichetta superiore al residuo disponibile sulla riga fattura.
                                    </div>
                                  ) : null}
                                  <div className="entry-actions">
                                    <button
                                      type="button"
                                      onClick={() => void onLinkReconciliationRowToInvoiceDocument(selectedReconciliationRow, candidate)}
                                      disabled={!candidate.canAllocate}
                                    >
                                      Collega etichetta
                                    </button>
                                    <button type="button" onClick={() => void onBulkLinkReconciliationRowsToInvoiceDocument(candidate.invoice)}>
                                      Collega etichette simili
                                    </button>
                                  </div>
                                </article>
                                );
                              })
                            )}
                          </div>
                        </aside>
                      </div>
                    ) : null}
                  </section>
                </>
              )}
            </div>
          ) : nav !== "ricette" && nav !== "comande" && nav !== "acquisti" && nav !== "inventario" && nav !== "inventari" && nav !== "haccp" && nav !== "tracciabilita" && nav !== "fornitori" ? (
            <section className="panel page-head">
              <h2>{t(NAV_ITEMS.find((item) => item.key === nav)?.labelKey ?? "")}</h2>
              <p>{t("app.pageHead", { site: activeSite?.name ?? t("app.siteNotSelected"), api: getApiBase() })}</p>
            </section>
          ) : null}

          {!isTraceabilityReconciliationPage ? (
          <>
          {nav === "dashboard" && (
            <div className="grid grid-single">
              <section className="grid grid-3">
                <article className="panel metric-card"><strong>{sites.filter((s) => s.is_active).length}</strong><span>{t("dashboard.activeSites")}</span></article>
                <article className="panel metric-card"><strong>{documents.length}</strong><span>{t("dashboard.importedDocs")}</span></article>
                <article className="panel metric-card"><strong>{vociCartaTotali}</strong><span>{t("dashboard.activeMenuItems")}</span></article>
                <article className="panel metric-card"><strong>{dashboardPendingReviewCount}</strong><span>{t("dashboard.pendingPhotos")}</span></article>
                <article className="panel metric-card"><strong>{dashboardFailedOcrCount}</strong><span>{t("dashboard.ocrErrors")}</span></article>
                <article className="panel metric-card"><strong>{dashboardTemperatureAlertCount}</strong><span>{t("dashboard.temperatureAlerts")}</span></article>
              </section>
              <section className="grid">
                <article className="panel">
                  <div className="doc-preview__head">
                    <h3>{t("dashboard.traceabilityTitle")}</h3>
                    <button type="button" onClick={() => setNav("report")}>{t("dashboard.openReport")}</button>
                  </div>
                  <p className="muted">{t("dashboard.traceabilityDesc")}</p>
                  <ul className="clean-list">
                    <li>{t("dashboard.docsToValidate", { count: dashboardPendingReviewCount })}</li>
                    <li>{t("dashboard.docsValidated", { count: dashboardValidatedCount })}</li>
                    <li>{t("dashboard.ocrToRetry", { count: dashboardFailedOcrCount })}</li>
                  </ul>
                  <div className="entry-actions">
                    <button type="button" onClick={() => setNav("tracciabilita")}>{t("dashboard.goTraceability")}</button>
                    <button type="button" onClick={() => setNav("report")}>{t("dashboard.goReports")}</button>
                  </div>
                </article>
                <article className="panel">
                  <div className="doc-preview__head">
                    <h3>{t("dashboard.haccpTitle")}</h3>
                    <button type="button" onClick={() => setNav("haccp")}>{t("dashboard.openHaccp")}</button>
                  </div>
                  <p className="muted">{t("dashboard.haccpDesc")}</p>
                  <ul className="clean-list">
                    <li>{t("dashboard.temperatureReadings", { count: temperatureReportRows.length })}</li>
                    <li>{t("dashboard.temperatureAbove", { count: dashboardTemperatureAlertCount })}</li>
                    <li>{t("dashboard.anomaliesAggregated", { count: haccpAnomalyRows.length })}</li>
                  </ul>
                  <div className="entry-actions">
                    <button type="button" onClick={() => setNav("report")}>{t("dashboard.temperatureReport")}</button>
                    <button type="button" onClick={() => setNav("haccp")}>{t("dashboard.goHaccp")}</button>
                  </div>
                </article>
              </section>
            </div>
          )}

          {nav === "ricette" && (
            <div className="grid grid-single">
              <section className="panel menu-space-panel">
                <h2>{t("recipes.menuSpaces")}</h2>
                <div className="doc-preview__head">
                  <h3>{t("recipes.title")}</h3>
                  <div className="entry-actions">
                    <button type="button" onClick={onSyncFichesSnapshots} disabled={isFichesSyncing}>
                      {isFichesSyncing ? t("suppliers.fichesSyncLoading") : t("suppliers.fichesSync")}
                    </button>
                  </div>
                </div>
                <p className="muted">{t("suppliers.fichesSyncDesc")}</p>
                <label className="option-inline">
                  <input
                    type="checkbox"
                    checked={refreshFichesSnapshots}
                    onChange={(e) => setRefreshFichesSnapshots(e.target.checked)}
                  />
                  <span>{t("suppliers.fichesSyncRefresh")}</span>
                </label>
                {fichesSyncStatus ? <p className="muted">{fichesSyncStatus}</p> : null}
                <p className="muted">La sincronizzazione fornitori/prodotti verrà attivata dopo il modello di coordinazione.</p>
                <div className="grid grid-2">
                  <div>
                    <label>{t("recipes.serviceDate")}</label>
                    <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-tabs">
                  {sortedEnabledSpaces.map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      className={`space-tab-btn ${activeMenuSpace?.id === space.id ? "space-tab-btn--active" : ""}`}
                      onClick={() => setActiveMenuSpaceId(space.id)}
                    >
                      {space.label}
                    </button>
                  ))}
                </div>
                {activeMenuSpace ? (
                  <div>
                    <div className="menu-space-header-row">
                      <p className="muted">{t("label.typeMenu", { type: activeMenuSpace.type.replace("_", " ") })}</p>
                      <button type="button" onClick={() => openMenuEditor(activeMenuSpace.id)}>{t("action.edit")}</button>
                    </div>
                    <ul className="menu-entry-list">
                      {activeMenuSpace.entries.map((entry, idx) => (
                        <li key={entry.id} className="menu-entry-item">
                          <div>
                            <strong>{entry.title}</strong>
                            <small>
                              {(entry.recipe_category || entry.section || t("label.noSection"))} | {entry.item_kind}
                              {entry.item_kind === "recipe"
                                ? ` | ${t("recipes.targetPortions")} ${formatDisplayNumber(lang, entry.expected_qty ?? "0")}`
                                : ""}
                              {entry.valid_from || entry.valid_to ? ` | ${entry.valid_from || "-"} -> ${entry.valid_to || "-"}` : ""}
                            </small>
                          </div>
                          <div className="entry-actions">
                            <button type="button" onClick={() => moveMenuEntry(activeMenuSpace.id, entry.id, "up")} disabled={idx === 0}>{t("action.up")}</button>
                            <button type="button" onClick={() => moveMenuEntry(activeMenuSpace.id, entry.id, "down")} disabled={idx === activeMenuSpace.entries.length - 1}>{t("action.down")}</button>
                            <button type="button" onClick={() => openMenuEditor(activeMenuSpace.id, entry)}>{t("action.replace")}</button>
                            <button type="button" className="danger-btn" onClick={() => deleteMenuEntry(activeMenuSpace.id, entry.id)}>{t("action.delete")}</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {activeMenuSpace.entries.length === 0 ? (
                      <p className="muted">{t("recipes.noItems")}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted">{t("recipes.noActiveSpace")}</p>
                )}
              </section>
            </div>
          )}

          {nav === "comande" && (
            <div className="grid grid-single">
              <section className="panel">
                <h2>{t("orders.title")}</h2>
                <p className="muted">{t("orders.desc")}</p>
                <div className="grid grid-2">
                  <div>
                    <label>{t("orders.dateFrom")}</label>
                    <input type="date" value={comandaDateFrom} onChange={(e) => setComandaDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label>{t("orders.dateTo")}</label>
                    <input type="date" value={comandaDateTo} onChange={(e) => setComandaDateTo(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-2">
                  <div>
                    <label>{t("orders.includedMenus")}</label>
                    <table className="selection-table">
                      <thead>
                        <tr>
                          <th>{t("orders.include")}</th>
                          <th>{t("orders.menu")}</th>
                          <th>{t("orders.key")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {availableComandaSpaces.map((space) => (
                          <tr key={space.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedComandaSpaces.includes(space.id)}
                                onChange={(e) =>
                                  setSelectedComandaSpaces((prev) =>
                                    e.target.checked ? [...new Set([...prev, space.id])] : prev.filter((id) => id !== space.id)
                                  )
                                }
                              />
                            </td>
                            <td>{space.label}</td>
                            <td>{space.id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <label>{t("orders.categoriesSectors")}</label>
                    {availableComandaSections.length === 0 ? (
                      <p className="muted">{t("orders.noCategory")}</p>
                    ) : (
                      <table className="selection-table">
                        <thead>
                          <tr>
                              <th>{t("orders.include")}</th>
                              <th>{t("orders.sectorCategory")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {availableComandaSections.map((section) => (
                            <tr key={section}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedComandaSections.includes(section)}
                                  onChange={(e) =>
                                    setSelectedComandaSections((prev) =>
                                      e.target.checked ? [...new Set([...prev, section])] : prev.filter((item) => item !== section)
                                    )
                                  }
                                />
                              </td>
                              <td>{section}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
                <div className="checklist-mode-bar no-print">
                  <button
                    type="button"
                    className={ingredientsView === "supplier" ? "space-tab-btn space-tab-btn--active" : "space-tab-btn"}
                    onClick={() => setIngredientsView("supplier")}
                  >
                    {t("orders.viewSupplier")}
                  </button>
                  <button
                    type="button"
                    className={ingredientsView === "sector" ? "space-tab-btn space-tab-btn--active" : "space-tab-btn"}
                    onClick={() => setIngredientsView("sector")}
                  >
                    {t("orders.viewSector")}
                  </button>
                  <button
                    type="button"
                    className={ingredientsView === "recipe" ? "space-tab-btn space-tab-btn--active" : "space-tab-btn"}
                    onClick={() => setIngredientsView("recipe")}
                  >
                    {t("orders.viewRecipe")}
                  </button>
                </div>
                <div className="checklist-mode-bar no-print">
                  <button
                    type="button"
                    className={quantityMode === "with_qty" ? "space-tab-btn space-tab-btn--active" : "space-tab-btn"}
                    onClick={() => setQuantityMode("with_qty")}
                  >
                    {t("orders.qtySuggested")}
                  </button>
                  <button
                    type="button"
                    className={quantityMode === "ingredients_only" ? "space-tab-btn space-tab-btn--active" : "space-tab-btn"}
                    onClick={() => setQuantityMode("ingredients_only")}
                  >
                    {t("orders.ingredientsOnly")}
                  </button>
                </div>
                <div className="entry-actions">
                  <button type="button" onClick={onGenerateChecklist} disabled={isChecklistLoading}>
                    {isChecklistLoading ? t("action.loading") : t("action.generateChecklist")}
                  </button>
                </div>
                <div className="no-print">
                  {ingredientsView === "supplier" ? (
                    <>
                      <label>{t("orders.searchSupplier")}</label>
                      <input
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        placeholder={t("orders.searchSupplierPlaceholder")}
                      />
                    </>
                  ) : null}
                  {ingredientsView === "sector" ? (
                    <>
                      <label>{t("orders.searchSector")}</label>
                      <input
                        value={sectorSearch}
                        onChange={(e) => setSectorSearch(e.target.value)}
                        placeholder={t("orders.searchSectorPlaceholder")}
                      />
                    </>
                  ) : null}
                  {ingredientsView === "recipe" ? (
                    <>
                      <label>{t("orders.searchRecipe")}</label>
                      <input
                        value={recipeSearch}
                        onChange={(e) => setRecipeSearch(e.target.value)}
                        placeholder={t("orders.searchRecipePlaceholder")}
                      />
                    </>
                  ) : null}
                </div>
                {ingredientWarnings.length > 0 ? (
                  <ul className="clean-list">
                    {ingredientWarnings.map((warning) => (
                      <li key={warning} className="muted">
                        {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {ingredientsRows.length === 0 ? (
                  <p className="muted">{t("orders.noResultsYet")}</p>
                ) : ingredientsView === "supplier" ? (
                  filteredSupplierGroups.length === 0 ? (
                    <p className="muted">{t("orders.noSupplierCard")}</p>
                  ) : (
                    <div className="supplier-order-grid">
                      {filteredSupplierGroups.map((group) => (
                        <article key={group.supplier} className="panel supplier-order-card">
                          <div className="supplier-order-card__head">
                            <h4>{group.supplier}</h4>
                            <div className="supplier-order-card__actions no-print">
                              <button type="button" onClick={() => printSupplierOrderCard(group)}>{t("action.print")}</button>
                              <button type="button" onClick={() => printSupplierOrderCard(group)}>{t("action.pdf")}</button>
                            </div>
                          </div>
                          <ul className="clean-list">
                            {group.rows.map((row, idx) => (
                              <li key={`${group.supplier}-${idx}`}>
                                {String(row.ingredient ?? "-")}
                                {` · ${t("orders.productCodeLabel")}: ${getProductCode(row) || "NC"}`}
                                {quantityMode === "with_qty"
                                  ? ` - ${formatDisplayNumber(lang, row.qty_total ?? "-")} ${String(row.unit ?? "-")}`
                                  : ""}
                                {" "}
                                {renderSourceBadge(row)}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  )
                ) : ingredientsView === "sector" ? (
                  filteredSectorGroups.length === 0 ? (
                    <p className="muted">{t("orders.noSectorCard")}</p>
                  ) : (
                    <div className="supplier-order-grid">
                      {filteredSectorGroups.map((group) => (
                        <article key={group.section} className="panel supplier-order-card">
                          <div className="supplier-order-card__head">
                            <h4>{group.section}</h4>
                            <div className="supplier-order-card__actions no-print">
                              <button type="button" onClick={() => printSectorOrderCard(group)}>{t("action.print")}</button>
                              <button type="button" onClick={() => printSectorOrderCard(group)}>{t("action.pdf")}</button>
                            </div>
                          </div>
                          <ul className="clean-list">
                            {group.rows.map((row, idx) => (
                              <li key={`${group.section}-${idx}`}>
                                {String(row.ingredient ?? "-")} ({String(row.supplier ?? "-")})
                                {` · ${t("orders.productCodeLabel")}: ${getProductCode(row) || "NC"}`}
                                {quantityMode === "with_qty"
                                  ? ` - ${formatDisplayNumber(lang, row.qty_total ?? "-")} ${String(row.unit ?? "-")}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  )
                ) : filteredRecipeGroups.length === 0 ? (
                  <p className="muted">{t("orders.noRecipeCard")}</p>
                ) : (
                  <div className="supplier-order-grid">
                    {filteredRecipeGroups.map((group) => (
                      <article key={group.title} className="panel supplier-order-card">
                        <div className="supplier-order-card__head">
                          <h4>{group.title}</h4>
                          <div className="supplier-order-card__actions no-print">
                              <button type="button" onClick={() => printRecipeOrderCard(group)}>{t("action.print")}</button>
                              <button type="button" onClick={() => printRecipeOrderCard(group)}>{t("action.pdf")}</button>
                          </div>
                        </div>
                        {group.rows.map((row, rowIdx) => (
                          <div key={`${group.title}-${rowIdx}`}>
                            <p className="muted">
                              {String(row.service_date ?? "-")} | {String(row.recipe_category ?? row.section ?? t("label.noCategory"))}
                              {quantityMode === "with_qty"
                                ? ` | ${t("recipes.targetPortions")} ${formatDisplayNumber(lang, row.expected_qty ?? "0")}`
                                : ""}
                            </p>
                            <ul className="clean-list">
                              {Array.isArray(row.ingredients)
                                ? row.ingredients.map((ing, ingIdx) => {
                                    const item = ing as Record<string, unknown>;
                                    return (
                                      <li key={`${group.title}-${rowIdx}-${ingIdx}`}>
                                        {String(item.ingredient ?? "-")} ({String(item.supplier ?? "-")})
                                        {` · ${t("orders.productCodeLabel")}: ${getProductCode(item) || "NC"}`}
                                        {quantityMode === "with_qty"
                                          ? ` - ${formatDisplayNumber(lang, item.qty_total ?? "-")} ${String(item.unit ?? "-")}`
                                          : ""}
                                        {" "}
                                        {renderSourceBadge(item)}
                                      </li>
                                    );
                                  })
                                : null}
                            </ul>
                          </div>
                        ))}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {nav === "fornitori" && (
            <div className="grid">
              <section className="panel">
                <div className="library-header">
                  <div>
                    <h2 className="section-title">{t("suppliers.sectionTitle")}</h2>
                    <p className="muted">{t("suppliers.sectionDesc")}</p>
                  </div>
                  <div className="library-actions">
                    <input
                      className="input"
                      value={supplierSearchText}
                      onChange={(e) => setSupplierSearchText(e.target.value)}
                      placeholder={t("suppliers.searchPlaceholder")}
                    />
                    <button type="button" className="btn btn-outline" onClick={loadSuppliers}>
                      {t("suppliers.refreshList")}
                    </button>
                  </div>
                </div>
                <form className="supplier-add supplier-add--simple" onSubmit={onCreateSupplier}>
                  <input
                    className="input"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder={t("suppliers.namePlaceholder")}
                  />
                  <button type="submit" className="btn btn-primary">
                    {t("suppliers.addSupplier")}
                  </button>
                </form>
                <div className="supplier-list">
                  {filteredSuppliers.length === 0 ? (
                    <div className="library-empty">{t("suppliers.empty")}</div>
                  ) : (
                    filteredSuppliers.map((supplier) => (
                      <div key={supplier.id} className="supplier-card">
                        <button
                          className="supplier-card-content"
                          type="button"
                          onClick={() => {
                            setSelectedSupplierId(supplier.id);
                            setNewSupplierProductSupplierId(supplier.id);
                          }}
                        >
                          <div className="supplier-title">{supplier.name}</div>
                          <div className="supplier-meta">
                            {supplier.vat_number
                              ? t("suppliers.vatValue", { value: supplier.vat_number })
                              : t("suppliers.vatMissing")}
                          </div>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
              <section className="panel">
                <div className="library-header">
                  <div>
                    <h2 className="section-title">
                      {selectedSupplierId ? t("suppliers.detailTitle") : t("suppliers.selectSupplierTitle")}
                    </h2>
                    <p className="muted">
                      {selectedSupplierId ? t("suppliers.detailDesc") : t("suppliers.selectSupplierDesc")}
                    </p>
                  </div>
                  <div className="library-actions">
                    <button type="button" className="btn btn-outline" disabled>
                      {t("suppliers.syncPreview")}
                    </button>
                  </div>
                </div>
                {selectedSupplierId ? (
                  <>
                    <section className="panel" style={{ marginBottom: 16 }}>
                      <h3 className="section-title">{t("suppliers.rulesTitle")}</h3>
                      <p className="muted">{t("suppliers.rulesDesc")}</p>
                      <form onSubmit={onSaveSupplierRules}>
                        <label>{t("suppliers.ruleStripPrefixes")}</label>
                        <input
                          value={supplierRulePrefixesInput}
                          onChange={(e) => setSupplierRulePrefixesInput(e.target.value)}
                          placeholder={t("suppliers.ruleStripPrefixesPlaceholder")}
                        />
                        <div className="muted" style={{ marginTop: 6 }}>
                          {t("suppliers.ruleStripPrefixesHelp")}
                        </div>
                        <label style={{ marginTop: 12 }}>{t("suppliers.ruleExample")}</label>
                        <input
                          value={supplierRuleExampleInput}
                          onChange={(e) => setSupplierRuleExampleInput(e.target.value)}
                          placeholder="P 35302"
                        />
                        <div className="muted" style={{ marginTop: 6 }}>
                          {t("suppliers.rulePreview", {
                            input: supplierRuleExampleInput.trim() || "-",
                            output: normalizedSupplierRuleExample,
                          })}
                        </div>
                        <button type="submit">{t("suppliers.rulesSave")}</button>
                      </form>
                    </section>
                    <form onSubmit={onCreateSupplierProduct}>
                      <label>{t("suppliers.productFormSupplier")}</label>
                      <select value={newSupplierProductSupplierId} onChange={(e) => setNewSupplierProductSupplierId(e.target.value)}>
                        <option value="">{t("suppliers.selectSupplierOption")}</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                      <label>{t("suppliers.productFormName")}</label>
                      <input value={newSupplierProductName} onChange={(e) => setNewSupplierProductName(e.target.value)} />
                      <label>{t("suppliers.productFormSku")}</label>
                      <input value={newSupplierProductSku} onChange={(e) => setNewSupplierProductSku(e.target.value)} />
                      <label>{t("suppliers.productFormUom")}</label>
                      <select value={newSupplierProductUom} onChange={(e) => setNewSupplierProductUom(e.target.value)}>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="l">l</option>
                        <option value="ml">ml</option>
                        <option value="cl">cl</option>
                        <option value="pc">pc</option>
                      </select>
                      <label>{t("suppliers.productFormPackQty")}</label>
                      <input value={newSupplierProductPackQty} onChange={(e) => setNewSupplierProductPackQty(e.target.value)} placeholder={t("suppliers.productFormPackQtyPlaceholder")} />
                      <label>{t("suppliers.productFormCategory")}</label>
                      <input value={newSupplierProductCategory} onChange={(e) => setNewSupplierProductCategory(e.target.value)} />
                      <button type="submit">{t("suppliers.productFormCreate")}</button>
                    </form>
                    <div className="sheet-wrap">
                      <table className="sheet-table">
                        <thead>
                          <tr>
                            <th>{t("suppliers.tableProduct")}</th>
                            <th>{t("suppliers.tableSku")}</th>
                            <th>{t("suppliers.tableUom")}</th>
                            <th>{t("suppliers.tableCategory")}</th>
                            <th>{t("suppliers.tableActive")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isSupplierProductsLoading ? (
                            <tr>
                              <td colSpan={5}>{t("suppliers.loadingProducts")}</td>
                            </tr>
                          ) : supplierProducts.length === 0 ? (
                            <tr>
                              <td colSpan={5}>{t("suppliers.emptyProducts")}</td>
                            </tr>
                          ) : (
                            supplierProducts.map((item, idx) => (
                              <tr key={`sp-${idx}`}>
                                <td>{String(item.name ?? "-")}</td>
                                <td>{String(item.supplier_sku ?? "-")}</td>
                                <td>{String(item.uom ?? "-")}</td>
                                <td>{String(item.category ?? "-")}</td>
                                <td>{String(item.active ?? "-")}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="muted">{t("suppliers.selectSupplierHint")}</p>
                )}
              </section>
            </div>
          )}

          {nav === "acquisti" && (
            <div className="grid grid-single">
              <section className="panel">
                <div className="purchase-toolbar">
                  <form onSubmit={onUploadDocument} className="purchase-toolbar__form">
                    <label>{t("purchases.file")}</label>
                    <input type="file" accept=".pdf,image/*" onChange={(e) => onUploadFileSelected(e.target.files?.[0] ?? null)} />
                    <div className="doc-type-checks">
                      <label className="checkline">
                        <input
                          type="checkbox"
                          checked={uploadDocType === "invoice"}
                          onChange={() => setUploadDocType("invoice")}
                        />
                        {t("purchases.invoice")}
                      </label>
                      <label className="checkline">
                        <input
                          type="checkbox"
                          checked={uploadDocType === "goods_receipt"}
                          onChange={() => setUploadDocType("goods_receipt")}
                        />
                        {t("purchases.deliveryNote")}
                      </label>
                    </div>
                    <button disabled={!canUpload || isClaudeExtracting || intakeStage === "uploading"} type="submit">
                      {intakeStage === "uploading" || intakeStage === "extracting"
                        ? t("purchases.processing")
                        : t("purchases.uploadAndExtract")}
                    </button>
                  </form>
                  <div className="purchase-toolbar__doc">
                    <label>{t("purchases.document")}</label>
                    <select
                      value={selectedDocId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedDocId(id);
                        setSelectedExtractionId("");
                        const doc = intakeDocuments.find((d) => d.id === id);
                        if (doc) setSelectedDocType(doc.document_type);
                      }}
                    >
                      <option value="">{t("action.select")}</option>
                      {intakeDocuments.map((d) => (
                        <option key={d.id} value={d.id}>{d.filename} ({d.document_type})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <div className="grid grid-2">
                <section className="panel">
                  <h2>{t("purchases.originalDoc")}</h2>
                  {originalDocumentUrl ? (
                    <div className="doc-frame-wrap">
                      {isOriginalDocumentLoading ? <p className="muted doc-loading">{t("purchases.processing")}</p> : null}
                      {previewDocumentUrl ? (
                        <object className="doc-frame" data={previewDocumentUrl} type="application/pdf">
                          <p className="muted">
                            {t("purchases.previewFallback")}
                            {" "}
                            <a href={originalDocumentUrl} target="_blank" rel="noreferrer">{t("purchases.openNewTab")}</a>
                          </p>
                        </object>
                      ) : (
                        <p className="muted">{t("purchases.previewFallback")}</p>
                      )}
                      <a className="doc-open-link" href={originalDocumentUrl} target="_blank" rel="noreferrer">
                        {t("purchases.openNewTab")}
                      </a>
                    </div>
                  ) : (
                    <p className="muted">{t("purchases.selectDocToPreview")}</p>
                  )}
                </section>

                <section className="panel">
                  <div className="doc-preview__head">
                    <h2>{t("purchases.previewTitle")}</h2>
                    <button type="button" onClick={() => onExtractWithClaude()} disabled={!selectedDocId || isClaudeExtracting}>
                      {isClaudeExtracting ? t("purchases.extractClaudeLoading") : t("purchases.extractClaude")}
                    </button>
                  </div>
                  {selectedDocumentDuplicateCount > 1 ? (
                    <p className="duplicate-note">
                      Doublon detecte: {selectedDocumentDuplicateCount} documents semblent decrire la meme piece.
                    </p>
                  ) : null}
                  <div className="doc-preview__grid">
                    <div><span>{t("purchases.supplier")}</span><b>{String(normalizedData.supplier_name ?? normalizedData.supplier ?? normalizedMeta.supplier_name ?? "-")}</b></div>
                    <div><span>{t("purchases.documentNumber")}</span><b>{String(normalizedData.document_number ?? normalizedData.invoice_number ?? normalizedData.delivery_note_number ?? "-")}</b></div>
                    <div><span>{t("purchases.documentDate")}</span><b>{String(normalizedData.document_date ?? normalizedData.invoice_date ?? "-")}</b></div>
                    <div><span>{t("purchases.receivedAt")}</span><b>{String(normalizedData.received_at ?? "-")}</b></div>
                    <div><span>{t("purchases.total")}</span><b>{String(normalizedData.total_amount ?? normalizedData.total ?? normalizedMeta.total_amount ?? "-")}</b></div>
                    <div><span>{t("purchases.vat")}</span><b>{String(normalizedData.vat_amount ?? normalizedData.vat ?? normalizedMeta.vat_amount ?? "-")}</b></div>
                    <div><span>{t("purchases.currency")}</span><b>{String(normalizedData.currency ?? normalizedMeta.currency ?? "-")}</b></div>
                    <div><span>{t("purchases.totalNet")}</span><b>{String(normalizedData.total_ht ?? normalizedMeta.total_ht ?? "-")}</b></div>
                    <div><span>{t("purchases.dueDate")}</span><b>{String(normalizedData.due_date ?? normalizedMeta.due_date ?? "-")}</b></div>
                  </div>
                  <h4>{t("purchases.lines")}</h4>
                  {previewLines.length === 0 ? (
                    <p className="muted">{t("purchases.noLines")}</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>{t("table.supplierCode")}</th>
                          <th>{t("table.ingredient")}</th>
                          <th>{t("table.unit")}</th>
                          <th>{t("table.qty")}</th>
                          <th>{t("purchases.unitPrice")}</th>
                          <th>{t("purchases.lineTotal")}</th>
                          <th>{t("purchases.vat")}</th>
                          <th>Lot</th>
                          <th>DLC/DLM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewLines.map((line, idx) => (
                          <tr key={`line-${idx}`}>
                            <td>{String(line.supplier_code ?? line.supplier_sku ?? line.code ?? "-")}</td>
                            <td>{String(line.raw_product_name ?? line.description ?? line.name ?? line.product_name ?? "-")}</td>
                            <td>{String(line.qty_unit ?? line.unit ?? "-")}</td>
                            <td>{String(line.qty_value ?? line.quantity ?? "-")}</td>
                            <td>{String(line.unit_price ?? "-")}</td>
                            <td>{String(line.line_total ?? line.total ?? "-")}</td>
                            <td>{String(line.vat_rate ?? line.vat ?? "-")}</td>
                            <td>{String(line.supplier_lot_code ?? line.lot ?? "-")}</td>
                            <td>{String(line.dlc_date ?? line.expiry_date ?? "-")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="entry-actions no-print">
                    <button type="button" onClick={onIngestExtraction} disabled={!selectedExtractionId || intakeStage === "ingesting"}>
                      {t("purchases.registerDocument")}
                    </button>
                  </div>
                  {lastIngestError ? (
                    <p className="muted">Erreur enregistrement: {lastIngestError}</p>
                  ) : null}
                </section>
              </div>

              <div className="grid grid-2">
                <section className="panel">
                  <div className="doc-preview__head">
                    <h3>Bons de livraison archives</h3>
                    <div className="entry-actions">
                      <button
                        type="button"
                        onClick={() => void onBulkIngestDocuments("goods_receipt")}
                        disabled={!siteId || isBulkIngesting === "goods_receipt"}
                      >
                        {isBulkIngesting === "goods_receipt" ? t("purchases.processing") : "Enregistrer tous"}
                      </button>
                    </div>
                  </div>
                  {bulkIngestErrors.goods_receipt && bulkIngestErrors.goods_receipt.length > 0 ? (
                    <div className="reconciliation-warning">
                      {bulkIngestErrors.goods_receipt.slice(0, 5).join(" | ")}
                      {bulkIngestErrors.goods_receipt.length > 5 ? " (+ autres)" : ""}
                    </div>
                  ) : null}
                  {archivedDeliveryNotes.length === 0 ? (
                    <p className="muted">Aucun bon archive.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Date import</th>
                          <th>Document</th>
                          <th>Flux</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {archivedDeliveryNotes.map((doc) => {
                          const url = getDocumentFileUrl(doc);
                          const duplicateCount = getDocumentDuplicateCount(doc);
                          return (
                            <tr key={doc.id}>
                              <td>{String(doc.created_at ?? "").slice(0, 10) || "-"}</td>
                              <td>
                                <div className="doc-listing-cell">
                                  <span>{doc.filename}</span>
                                  {duplicateCount > 1 ? <span className="status-chip status-chip--duplicate">Doublon x{duplicateCount}</span> : null}
                                </div>
                              </td>
                              <td>{flowLabelForDocument(doc)}</td>
                              <td>
                                <div className="entry-actions">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedDocId(doc.id);
                                      setSelectedDocType(doc.document_type);
                                    }}
                                  >
                                    Ouvrir
                                  </button>
                                  {url ? (
                                    <a className="doc-open-link" href={url} target="_blank" rel="noreferrer">
                                      PDF
                                    </a>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="danger-btn"
                                    onClick={() => void onDeleteIntakeDocument(doc)}
                                    disabled={isDeletingDocumentId === doc.id}
                                  >
                                    {isDeletingDocumentId === doc.id ? "Suppression..." : "Supprimer"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </section>

                <section className="panel">
                  <div className="doc-preview__head">
                    <h3>Factures archives</h3>
                    <div className="entry-actions">
                      <button
                        type="button"
                        onClick={() => void onBulkIngestDocuments("invoice")}
                        disabled={!siteId || isBulkIngesting === "invoice"}
                      >
                        {isBulkIngesting === "invoice" ? t("purchases.processing") : "Enregistrer tous"}
                      </button>
                    </div>
                  </div>
                  {bulkIngestErrors.invoice && bulkIngestErrors.invoice.length > 0 ? (
                    <div className="reconciliation-warning">
                      {bulkIngestErrors.invoice.slice(0, 5).join(" | ")}
                      {bulkIngestErrors.invoice.length > 5 ? " (+ autres)" : ""}
                    </div>
                  ) : null}
                  {archivedInvoices.length === 0 ? (
                    <p className="muted">Aucune facture archivee.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Date import</th>
                          <th>Document</th>
                          <th>Flux</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {archivedInvoices.map((doc) => {
                          const url = getDocumentFileUrl(doc);
                          const duplicateCount = getDocumentDuplicateCount(doc);
                          return (
                            <tr key={doc.id}>
                              <td>{String(doc.created_at ?? "").slice(0, 10) || "-"}</td>
                              <td>
                                <div className="doc-listing-cell">
                                  <span>{doc.filename}</span>
                                  {duplicateCount > 1 ? <span className="status-chip status-chip--duplicate">Doublon x{duplicateCount}</span> : null}
                                </div>
                              </td>
                              <td>{flowLabelForDocument(doc)}</td>
                              <td>
                                <div className="entry-actions">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedDocId(doc.id);
                                      setSelectedDocType(doc.document_type);
                                    }}
                                  >
                                    Ouvrir
                                  </button>
                                  {url ? (
                                    <a className="doc-open-link" href={url} target="_blank" rel="noreferrer">
                                      PDF
                                    </a>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="danger-btn"
                                    onClick={() => void onDeleteIntakeDocument(doc)}
                                    disabled={isDeletingDocumentId === doc.id}
                                  >
                                    {isDeletingDocumentId === doc.id ? "Suppression..." : "Supprimer"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
              </div>
              <div className="grid grid-2">
                <section className="panel">
                  <div className="doc-preview__head">
                    <h3>Duplicati BL (archivio)</h3>
                  </div>
                  {duplicateDeliveryNotes.length === 0 ? (
                    <p className="muted">Aucun doublon BL.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Date import</th>
                          <th>Document</th>
                          <th>Duplicato di</th>
                          <th>Motivo</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicateDeliveryNotes.map((doc) => {
                          const url = getDocumentFileUrl(doc);
                          const meta = asRecord(doc.metadata);
                          const dup = asRecord(meta.duplicate);
                          const ingest = asRecord(meta.ingest);
                          const duplicateOf = String(dup.duplicate_of ?? ingest.duplicate_of ?? "-");
                          const reason = String(dup.reason ?? ingest.duplicate_reason ?? "-");
                          return (
                            <tr key={doc.id}>
                              <td>{String(doc.created_at ?? "").slice(0, 10) || "-"}</td>
                              <td>{doc.filename}</td>
                              <td>{duplicateOf || "-"}</td>
                              <td>{reason || "-"}</td>
                              <td>
                                <div className="entry-actions">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedDocId(doc.id);
                                      setSelectedDocType(doc.document_type);
                                    }}
                                  >
                                    Ouvrir
                                  </button>
                                  {url ? (
                                    <a className="doc-open-link" href={url} target="_blank" rel="noreferrer">
                                      PDF
                                    </a>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="danger-btn"
                                    onClick={() => void onDeleteIntakeDocument(doc)}
                                    disabled={isDeletingDocumentId === doc.id}
                                  >
                                    {isDeletingDocumentId === doc.id ? "Suppression..." : "Supprimer"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
                <section className="panel">
                  <div className="doc-preview__head">
                    <h3>Duplicati factures (archivio)</h3>
                  </div>
                  {duplicateInvoices.length === 0 ? (
                    <p className="muted">Aucun doublon facture.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Date import</th>
                          <th>Document</th>
                          <th>Duplicato di</th>
                          <th>Motivo</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicateInvoices.map((doc) => {
                          const url = getDocumentFileUrl(doc);
                          const meta = asRecord(doc.metadata);
                          const dup = asRecord(meta.duplicate);
                          const ingest = asRecord(meta.ingest);
                          const duplicateOf = String(dup.duplicate_of ?? ingest.duplicate_of ?? "-");
                          const reason = String(dup.reason ?? ingest.duplicate_reason ?? "-");
                          return (
                            <tr key={doc.id}>
                              <td>{String(doc.created_at ?? "").slice(0, 10) || "-"}</td>
                              <td>{doc.filename}</td>
                              <td>{duplicateOf || "-"}</td>
                              <td>{reason || "-"}</td>
                              <td>
                                <div className="entry-actions">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedDocId(doc.id);
                                      setSelectedDocType(doc.document_type);
                                    }}
                                  >
                                    Ouvrir
                                  </button>
                                  {url ? (
                                    <a className="doc-open-link" href={url} target="_blank" rel="noreferrer">
                                      PDF
                                    </a>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="danger-btn"
                                    onClick={() => void onDeleteIntakeDocument(doc)}
                                    disabled={isDeletingDocumentId === doc.id}
                                  >
                                    {isDeletingDocumentId === doc.id ? "Suppression..." : "Supprimer"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
              </div>
            </div>
          )}

          {nav === "riconciliazioni" && (
            <div className="grid">
              <section className="panel">
                <h2>{t("reco.manualTitle")}</h2>
                <form onSubmit={onCreateReconciliation}>
                  <label>{t("reco.invoiceLine")}</label>
                  <input value={recoInvoiceLine} onChange={(e) => setRecoInvoiceLine(e.target.value)} />
                  <label>{t("reco.goodsReceiptLine")}</label>
                  <input value={recoGoodsReceiptLine} onChange={(e) => setRecoGoodsReceiptLine(e.target.value)} />
                  <button type="submit">{t("reco.linkInvoiceAndNote")}</button>
                </form>
              </section>
              <section className="panel">
                <h2>{t("reco.status")}</h2>
                <p className="muted">{t("reco.nextStep")}</p>
                <hr />
                <h3>{t("reco.autoMatchTitle")}</h3>
                <label>{t("reco.invoiceId")}</label>
                <input value={autoMatchInvoiceId} onChange={(e) => setAutoMatchInvoiceId(e.target.value)} />
                <button type="button" onClick={onAutoMatchInvoice} disabled={isAutoMatching}>
                  {isAutoMatching ? t("reco.autoMatchLoading") : t("reco.autoMatchButton")}
                </button>
              </section>
            </div>
          )}

          {nav === "inventario" && (
            <section className="panel">
              <div className="doc-preview__head">
                <h2>Stock - resultats entrees/sorties</h2>
                <div className="entry-actions">
                  <button type="button" onClick={rebuildStockFromPurchasing} disabled={!siteId || isRebuildingStock}>
                    {isRebuildingStock ? t("purchases.processing") : "Ricostruisci stock da acquisti"}
                  </button>
                  <button type="button" onClick={loadStockSummary} disabled={!siteId || isInventoryLoading}>
                    {isInventoryLoading ? t("purchases.processing") : t("suppliers.refreshList")}
                  </button>
                </div>
              </div>
              <div className="sheet-toolbar">
                <input
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Rechercher par code fournisseur, produit, UM..."
                />
              </div>
              {filteredStockRows.length === 0 ? (
                <p className="muted">Aucun resultat de stock pour ce site.</p>
              ) : (
                <div className="sheet-wrap">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>Code fournisseur / Produit</th>
                      <th>Code fournisseur</th>
                      <th>Nom article</th>
                      <th>Fournisseur</th>
                      <th>Categorie produit</th>
                      <th>{t("table.unit")}</th>
                      <th>Entrees BL/Facture</th>
                      <th>Entrees fallback facture</th>
                      <th>Sorties inventaire</th>
                      <th>Sorties autres</th>
                      <th>Total entrees</th>
                      <th>Total sorties</th>
                      <th>Stock actuel</th>
                      <th>Dernier mouvement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStockRows.map((row) => (
                      <tr key={`${row.product_key}-${row.qty_unit}`}>
                        <td>{row.product_label}</td>
                        <td>{row.supplier_code || "-"}</td>
                        <td>{row.product_name || "-"}</td>
                        <td>{row.supplier_name || "-"}</td>
                        <td>{row.product_category || "-"}</td>
                        <td>{row.qty_unit}</td>
                        <td>{row.in_from_docs ?? "0.000"}</td>
                        <td>{row.in_from_invoice_fallback ?? "0.000"}</td>
                        <td>{row.out_from_inventory ?? "0.000"}</td>
                        <td>{row.out_other ?? "0.000"}</td>
                        <td>{row.total_in}</td>
                        <td>{row.total_out}</td>
                        <td>{row.current_stock}</td>
                        <td>{String(row.last_movement_at ?? "-").replace("T", " ").slice(0, 19)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </section>
          )}

          {nav === "inventari" && (
            <div className="grid">
              <section className="panel">
                <h2>Inventaires</h2>
                <form onSubmit={onApplyInventorySnapshot}>
                  <label>Portee inventaire</label>
                  <select value={inventoryScope} onChange={(e) => setInventoryScope(e.target.value)}>
                    <option value="total">Total site</option>
                    <option value="category">Par categorie</option>
                    <option value="sector">Par secteur</option>
                  </select>
                  <label>Lignes inventaire (JSON)</label>
                  <textarea value={inventoryLinesJson} onChange={(e) => setInventoryLinesJson(e.target.value)} rows={10} />
                  <button type="submit" disabled={!siteId || isApplyingInventory}>
                    {isApplyingInventory ? t("purchases.processing") : "Deposer inventaire"}
                  </button>
                </form>
                {lastInventoryApplied.length > 0 ? (
                  <div className="sheet-wrap">
                    <table className="sheet-table">
                      <thead>
                        <tr>
                          <th>Code / Produit</th>
                          <th>UM</th>
                          <th>Stock precedent</th>
                          <th>Inventaire depose</th>
                          <th>Delta</th>
                          <th>Mouvement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastInventoryApplied.map((row, idx) => (
                          <tr key={`inv-applied-${idx}`}>
                            <td>{String(row.product_key ?? "-")}</td>
                            <td>{String(row.qty_unit ?? "-")}</td>
                            <td>{String(row.current_qty ?? "-")}</td>
                            <td>{String(row.target_qty ?? "-")}</td>
                            <td>{String(row.delta ?? "-")}</td>
                            <td>{String(row.movement_type ?? "-")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
              <section className="panel">
                <h2>Derniers mouvements inventaire</h2>
                <button type="button" onClick={loadInventoryMovements} disabled={!siteId || isInventoryLoading}>
                  {isInventoryLoading ? t("purchases.processing") : t("suppliers.refreshList")}
                </button>
                {inventoryMovements.filter((m) => String(m.ref_type || "").includes("inventory")).length === 0 ? (
                  <p className="muted">Aucun ajustement inventaire.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Code</th>
                        <th>{t("table.ingredient")}</th>
                        <th>{t("table.qty")}</th>
                        <th>{t("table.unit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryMovements
                        .filter((m) => String(m.ref_type || "").includes("inventory"))
                        .slice(0, 50)
                        .map((m) => (
                          <tr key={m.id}>
                            <td>{String(m.happened_at ?? "-").replace("T", " ").slice(0, 19)}</td>
                            <td>{m.movement_type}</td>
                            <td>{m.supplier_code || "-"}</td>
                            <td>{m.raw_product_name || m.supplier_product_name || "-"}</td>
                            <td>{m.qty_value}</td>
                            <td>{m.qty_unit}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          )}

          {nav === "haccp" && (
            <HaccpWorkspace
              siteId={siteId}
              isHaccpLoading={isHaccpLoading}
              isHaccpSaving={isHaccpSaving}
              haccpView={haccpView}
              setHaccpView={setHaccpView}
              haccpOcrQueue={haccpLabelCaptureQueue}
              haccpLifecycleEvents={haccpLifecycleEvents}
              haccpSchedules={haccpSchedules}
              haccpLabelProfiles={haccpLabelProfiles}
              haccpLabelSessions={haccpLabelSessions}
              haccpTemperatureReadings={haccpTemperatureReadings}
              haccpReconciliationOverview={haccpReconciliationOverview}
              selectedHaccpQueueItem={selectedHaccpQueueItem}
              selectedHaccpDocumentUrl={selectedHaccpDocumentUrl}
              selectedHaccpDocumentId={selectedHaccpDocumentId}
              setSelectedHaccpDocumentId={setSelectedHaccpDocumentId}
              haccpAnomalyRows={haccpAnomalyRows}
              haccpSectors={haccpSectors}
              haccpColdPoints={filteredHaccpColdPoints}
              cleaningCategories={cleaningCategories}
              cleaningProcedures={cleaningProcedures}
              cleaningElements={cleaningElements}
              cleaningPlans={cleaningPlans}
              isCleaningLoading={isCleaningLoading}
              newCleaningCategoryName={newCleaningCategoryName}
              setNewCleaningCategoryName={setNewCleaningCategoryName}
              newCleaningCategoryDescription={newCleaningCategoryDescription}
              setNewCleaningCategoryDescription={setNewCleaningCategoryDescription}
              newCleaningProcedureName={newCleaningProcedureName}
              setNewCleaningProcedureName={setNewCleaningProcedureName}
              newCleaningProcedureCategory={newCleaningProcedureCategory}
              setNewCleaningProcedureCategory={setNewCleaningProcedureCategory}
              newCleaningProcedureSteps={newCleaningProcedureSteps}
              setNewCleaningProcedureSteps={setNewCleaningProcedureSteps}
              newCleaningProcedureNotes={newCleaningProcedureNotes}
              setNewCleaningProcedureNotes={setNewCleaningProcedureNotes}
              newCleaningElementName={newCleaningElementName}
              setNewCleaningElementName={setNewCleaningElementName}
              newCleaningElementCategory={newCleaningElementCategory}
              setNewCleaningElementCategory={setNewCleaningElementCategory}
              newCleaningElementProcedure={newCleaningElementProcedure}
              setNewCleaningElementProcedure={setNewCleaningElementProcedure}
              newCleaningElementIsGlobal={newCleaningElementIsGlobal}
              setNewCleaningElementIsGlobal={setNewCleaningElementIsGlobal}
              newCleaningElementAreaIds={newCleaningElementAreaIds}
              setNewCleaningElementAreaIds={setNewCleaningElementAreaIds}
              newCleaningCadence={newCleaningCadence}
              setNewCleaningCadence={setNewCleaningCadence}
              newCleaningDueTime={newCleaningDueTime}
              setNewCleaningDueTime={setNewCleaningDueTime}
              newCleaningStartDate={newCleaningStartDate}
              setNewCleaningStartDate={setNewCleaningStartDate}
              newCleaningPlanElementId={newCleaningPlanElementId}
              setNewCleaningPlanElementId={setNewCleaningPlanElementId}
              newCleaningPlanAreaIds={newCleaningPlanAreaIds}
              setNewCleaningPlanAreaIds={setNewCleaningPlanAreaIds}
              editingCleaningPlanId={editingCleaningPlanId}
              newHaccpTitle={newHaccpTitle}
              setNewHaccpTitle={setNewHaccpTitle}
              newHaccpArea={newHaccpArea}
              setNewHaccpArea={setNewHaccpArea}
              selectedHaccpSectorId={selectedHaccpSectorId}
              setSelectedHaccpSectorId={setSelectedHaccpSectorId}
              selectedHaccpColdPointId={selectedHaccpColdPointId}
              setSelectedHaccpColdPointId={setSelectedHaccpColdPointId}
              newHaccpSectorName={newHaccpSectorName}
              setNewHaccpSectorName={setNewHaccpSectorName}
              editingHaccpSectorId={editingHaccpSectorId}
              newHaccpColdPointName={newHaccpColdPointName}
              setNewHaccpColdPointName={setNewHaccpColdPointName}
              newHaccpColdPointEquipmentType={newHaccpColdPointEquipmentType}
              setNewHaccpColdPointEquipmentType={setNewHaccpColdPointEquipmentType}
              editingHaccpColdPointId={editingHaccpColdPointId}
              newHaccpStartsAt={newHaccpStartsAt}
              setNewHaccpStartsAt={setNewHaccpStartsAt}
              newHaccpEndsAt={newHaccpEndsAt}
              setNewHaccpEndsAt={setNewHaccpEndsAt}
              newLabelProfileName={newLabelProfileName}
              setNewLabelProfileName={setNewLabelProfileName}
              newLabelProfileCategory={newLabelProfileCategory}
              setNewLabelProfileCategory={setNewLabelProfileCategory}
              newLabelTemplateType={newLabelTemplateType}
              setNewLabelTemplateType={setNewLabelTemplateType}
              newLabelShelfLifeValue={newLabelShelfLifeValue}
              setNewLabelShelfLifeValue={setNewLabelShelfLifeValue}
              newLabelShelfLifeUnit={newLabelShelfLifeUnit}
              setNewLabelShelfLifeUnit={setNewLabelShelfLifeUnit}
              newLabelPackaging={newLabelPackaging}
              setNewLabelPackaging={setNewLabelPackaging}
              newLabelStorageHint={newLabelStorageHint}
              setNewLabelStorageHint={setNewLabelStorageHint}
              newLabelAllergensText={newLabelAllergensText}
              setNewLabelAllergensText={setNewLabelAllergensText}
              editingLabelProfileId={editingLabelProfileId}
              selectedLabelProfileId={selectedLabelProfileId}
              setSelectedLabelProfileId={setSelectedLabelProfileId}
              selectedLabelPlannedScheduleId={selectedLabelPlannedScheduleId}
              setSelectedLabelPlannedScheduleId={setSelectedLabelPlannedScheduleId}
              newLabelSessionQuantity={newLabelSessionQuantity}
              setNewLabelSessionQuantity={setNewLabelSessionQuantity}
              newLabelSessionSourceLotCode={newLabelSessionSourceLotCode}
              setNewLabelSessionSourceLotCode={setNewLabelSessionSourceLotCode}
              loadHaccpData={loadHaccpData}
              onExtractHaccpDocument={onExtractHaccpDocument}
              onValidateHaccpOcr={onValidateHaccpOcr}
              onSetHaccpScheduleStatus={onSetHaccpScheduleStatus}
              onDeleteHaccpSchedule={onDeleteHaccpSchedule}
              onCreateHaccpSector={onCreateHaccpSector}
              onEditHaccpSector={onEditHaccpSector}
              onDeleteHaccpSector={onDeleteHaccpSector}
              onCreateCleaningCategory={onCreateCleaningCategory}
              onCreateCleaningProcedure={onCreateCleaningProcedure}
              onCreateCleaningElement={onCreateCleaningElement}
              onCreateCleaningPlan={onCreateCleaningPlan}
              onCompleteCleaningSchedules={onCompleteCleaningSchedules}
              onEditCleaningPlan={onEditCleaningPlan}
              onToggleCleaningPlanActive={onToggleCleaningPlanActive}
              onCreateHaccpColdPoint={onCreateHaccpColdPoint}
              onEditHaccpColdPoint={onEditHaccpColdPoint}
              onDeleteHaccpColdPoint={onDeleteHaccpColdPoint}
              onCreateHaccpSchedule={onCreateHaccpSchedule}
              onCreateHaccpLabelProfile={onCreateHaccpLabelProfile}
              onEditHaccpLabelProfile={onEditHaccpLabelProfile}
              onDeleteHaccpLabelProfile={onDeleteHaccpLabelProfile}
              onCreateHaccpLabelSession={onCreateHaccpLabelSession}
              t={t}
            />
          )}

          {nav === "tracciabilita" && (
            <TraceabilityWorkspace
              siteId={siteId}
              isLoading={isHaccpLoading}
              isSaving={isHaccpSaving}
              queue={haccpLabelCaptureQueue}
              lifecycleEvents={haccpLifecycleEvents}
              reconciliationOverview={haccpReconciliationOverview}
              selectedQueueItem={selectedHaccpQueueItem}
              selectedDocumentId={selectedHaccpDocumentId}
              selectedDocumentUrl={selectedHaccpDocumentUrl}
              selectedDocumentContentType={selectedHaccpDocument?.content_type ?? null}
              setSelectedDocumentId={setSelectedHaccpDocumentId}
              onImportAssets={onImportHaccpAssets}
              onRefresh={loadHaccpData}
              onExtractDocument={onExtractHaccpDocument}
              onValidateDocument={onValidateHaccpOcr}
              onDeleteDocument={onDeleteTraceabilityDocument}
              onOpenReconciliation={openTraceabilityReconciliationWindow}
              importSummary={lastTraceabilityImportSummary}
              importStatus={traceabilityImportStatus}
              t={t}
            />
          )}

          {nav === "report" && (
            <div className="grid grid-single">
              <section className="panel">
                <div className="menu-space-header-row">
                  <div>
                    <h2>Area Report</h2>
                    <p className="muted">Report aggregati per tracciabilita e HACCP, orientati a controllo, stampa ed export.</p>
                  </div>
                  <div className="entry-actions no-print">
                    <button type="button" onClick={() => window.print()}>Stampa</button>
                    <button
                      type="button"
                      onClick={() =>
                        exportPdfReport(
                          "Report tracciabilita",
                          ["Foto", "Prodotto", "Fornitore", "Lotto origine", "Lotto fornitore", "Produzione", "DLC", "Qta allocata", "Documento collegato", "OCR", "Convalida", "Note review", "Revisionato il"],
                          filteredTraceabilityReportRows.map((row) => [
                            row.filename,
                            row.productGuess,
                            row.supplierName,
                            row.originLotCode,
                            row.supplierLotCode,
                            row.productionDate,
                            row.dlcDate,
                            row.allocatedQty !== "-" ? `${row.allocatedQty} ${row.allocatedUnit !== "-" ? row.allocatedUnit : ""}`.trim() : "-",
                            row.linkedDocumentName,
                            String(row.extraction?.status || row.document_status || "-"),
                            row.validation_status,
                            row.reviewNotes,
                            String(row.reviewedAt || "-").replace("T", " ").slice(0, 19),
                          ])
                        )
                      }
                    >
                      PDF tracciabilita
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        exportCsv(
                          `report-tracciabilita-${reportDateFrom || "all"}-${reportDateTo || "all"}.csv`,
                          ["Foto", "Prodotto", "Fornitore", "Lotto origine", "Lotto fornitore", "Produzione", "DLC", "Qta allocata", "Documento collegato", "OCR", "Convalida", "Note review", "Revisionato il"],
                          filteredTraceabilityReportRows.map((row) => [
                            row.filename,
                            row.productGuess,
                            row.supplierName,
                            row.originLotCode,
                            row.supplierLotCode,
                            row.productionDate,
                            row.dlcDate,
                            row.allocatedQty !== "-" ? `${row.allocatedQty} ${row.allocatedUnit !== "-" ? row.allocatedUnit : ""}`.trim() : "-",
                            row.linkedDocumentName,
                            String(row.extraction?.status || row.document_status || "-"),
                            row.validation_status,
                            row.reviewNotes,
                            String(row.reviewedAt || "-").replace("T", " ").slice(0, 19),
                          ])
                        )
                      }
                    >
                      Export tracciabilita
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        exportPdfReport(
                          "Report temperature",
                          ["Settore", "Punto freddo", "Temperatura", "Riferimento", "Rilevata il", "Sorgente", "Stato"],
                          filteredTemperatureReportRows.map((row) => [
                            row.sector_name || "-",
                            row.cold_point_name || row.register_name || "-",
                            `${row.temperature_celsius || "-"} ${row.unit || "C"}`,
                            row.reference_temperature_celsius || "-",
                            String(row.observed_at ?? "-").replace("T", " ").slice(0, 19),
                            row.source || "-",
                            row.isAlert ? "Fuori soglia" : "OK",
                          ])
                        )
                      }
                    >
                      PDF temperature
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        exportCsv(
                          `report-temperature-${reportDateFrom || "all"}-${reportDateTo || "all"}.csv`,
                          ["Settore", "Punto freddo", "Temperatura", "Riferimento", "Rilevata il", "Sorgente", "Stato"],
                          filteredTemperatureReportRows.map((row) => [
                            row.sector_name || "-",
                            row.cold_point_name || row.register_name || "-",
                            `${row.temperature_celsius || "-"} ${row.unit || "C"}`,
                            row.reference_temperature_celsius || "-",
                            String(row.observed_at ?? "-").replace("T", " ").slice(0, 19),
                            row.source || "-",
                            row.isAlert ? "Fuori soglia" : "OK",
                          ])
                        )
                      }
                    >
                      Export temperature
                    </button>
                    <button type="button" onClick={resetReportFilters}>Reset filtri</button>
                    <button type="button" onClick={() => setNav("dashboard")}>Dashboard</button>
                  </div>
                </div>
                <div className="grid grid-2">
                  <div>
                    <label>Data da</label>
                    <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label>Data a</label>
                    <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)} />
                  </div>
                  <div>
                    <label>Stato</label>
                    <select value={reportReviewStatus} onChange={(e) => setReportReviewStatus(e.target.value)}>
                      <option value="all">Tutti</option>
                      <option value="pending_review">Da validare</option>
                      <option value="validated">Confermati</option>
                      <option value="rejected">Rifiutati</option>
                      <option value="failed">OCR falliti</option>
                      <option value="alert_only">Solo alert temperature</option>
                    </select>
                  </div>
                  <div>
                    <label>Ricerca</label>
                    <input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Fornitore, lotto, prodotto..." />
                  </div>
                  <div>
                    <label>Filtro fornitore</label>
                    <input value={reportSupplierSearch} onChange={(e) => setReportSupplierSearch(e.target.value)} placeholder="Marée Provençale..." />
                  </div>
                  <div>
                    <label>Filtro prodotto</label>
                    <input value={reportProductSearch} onChange={(e) => setReportProductSearch(e.target.value)} placeholder="Dorade, filet..." />
                  </div>
                  <div>
                    <label>Filtro lotto</label>
                    <input value={reportLotSearch} onChange={(e) => setReportLotSearch(e.target.value)} placeholder="TOURN-2026-003..." />
                  </div>
                  <div className="checkline report-checkline">
                    <input type="checkbox" checked={reportOnlyAnomalies} onChange={(e) => setReportOnlyAnomalies(e.target.checked)} />
                    <span>Solo anomalie</span>
                  </div>
                </div>
              </section>

              <div className="grid">
                <section className="panel">
                  <div className="doc-preview__head">
                    <h2>1. Report tracciabilita</h2>
                  </div>
                  <p className="muted">Storico operativo delle foto importate, dei dati estratti e del loro stato di convalida.</p>
                  {filteredTraceabilityReportRows.length === 0 ? (
                    <p className="muted">Nessun documento tracciabilita disponibile.</p>
                  ) : (
                    <div className="sheet-wrap">
                      <table className="sheet-table">
                        <thead>
                          <tr>
                            <th>Foto</th>
                            <th>Prodotto</th>
                            <th>Fornitore</th>
                            <th>Lotto origine</th>
                            <th>Lotto fornitore</th>
                            <th>Produzione</th>
                            <th>DLC</th>
                            <th>Qta allocata</th>
                            <th>Documento collegato</th>
                            <th>OCR</th>
                            <th>Convalida</th>
                            <th>Note review</th>
                            <th>Revisionato il</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTraceabilityReportRows.slice(0, 80).map((row) => (
                            <tr key={row.document_id}>
                              <td>{row.filename}</td>
                              <td>{row.productGuess}</td>
                              <td>{row.supplierName}</td>
                              <td>{row.originLotCode}</td>
                              <td>{row.supplierLotCode}</td>
                              <td>{row.productionDate}</td>
                              <td>{row.dlcDate}</td>
                              <td>{row.allocatedQty !== "-" ? `${row.allocatedQty} ${row.allocatedUnit !== "-" ? row.allocatedUnit : ""}`.trim() : "-"}</td>
                              <td>{row.linkedDocumentName}</td>
                              <td>{String(row.extraction?.status || row.document_status || "-")}</td>
                              <td>{renderReportStatusChip(row.validation_status)}</td>
                              <td className="report-note-cell">{row.reviewNotes}</td>
                              <td>{String(row.reviewedAt || "-").replace("T", " ").slice(0, 19)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="panel">
                  <div className="doc-preview__head">
                    <h2>2. Report temperature</h2>
                  </div>
                  <p className="muted">Rilevazioni temperatura eseguite, con evidenza delle misure sopra il riferimento.</p>
                  {filteredTemperatureReportRows.length === 0 ? (
                    <p className="muted">Nessuna rilevazione temperatura disponibile.</p>
                  ) : (
                    <div className="sheet-wrap">
                      <table className="sheet-table">
                        <thead>
                          <tr>
                            <th>Settore</th>
                            <th>Punto freddo</th>
                            <th>Temperatura</th>
                            <th>Riferimento</th>
                            <th>Rilevata il</th>
                            <th>Sorgente</th>
                            <th>Stato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTemperatureReportRows.slice(0, 120).map((row) => (
                            <tr key={row.id}>
                              <td>{row.sector_name || "-"}</td>
                              <td>{row.cold_point_name || row.register_name || "-"}</td>
                              <td>{row.temperature_celsius || "-"} {row.unit || "C"}</td>
                              <td>{row.reference_temperature_celsius || "-"}</td>
                              <td>{String(row.observed_at ?? "-").replace("T", " ").slice(0, 19)}</td>
                              <td>{row.source || "-"}</td>
                              <td>{renderTemperatureStatusChip(row.isAlert)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {false && nav === "haccp" && (
            <div className="grid">
              <section className="panel">
                <h2>{t("haccp.tracciaDataTitle")}</h2>
                <p className="muted">{t("haccp.tracciaDataDesc")}</p>
                <div className="entry-actions no-print">
                  <button type="button" onClick={loadHaccpData} disabled={!siteId || isHaccpLoading}>
                    {isHaccpLoading ? t("action.loading") : t("suppliers.refreshList")}
                  </button>
                </div>
                {!siteId ? (
                  <p className="muted">{t("validation.selectSite")}</p>
                ) : haccpOcrQueue.length === 0 ? (
                  <p className="muted">Nessuna estrazione OCR trovata per il sito.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Documento</th>
                        <th>Tipo</th>
                        <th>Stato estrazione</th>
                        <th>Validazione</th>
                        <th>Confidenza</th>
                        <th>Azione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {haccpOcrQueue.slice(0, 20).map((row) => (
                        <tr key={row.document_id}>
                          <td>{row.filename}</td>
                          <td>{row.document_type}</td>
                          <td>{String(row.extraction?.status || row.document_status || "-")}</td>
                          <td>{row.validation_status}</td>
                          <td>{row.extraction?.confidence || "-"}</td>
                          <td>
                            <div className="entry-actions">
                              <button type="button" onClick={() => onValidateHaccpOcr(row.document_id, "validated")}>
                                Conferma
                              </button>
                              <button type="button" className="warning-btn" onClick={() => onValidateHaccpOcr(row.document_id, "rejected")}>
                                Rifiuta
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              <section className="panel">
                <h2>{t("haccp.lifecycleTitle")}</h2>
                <p className="muted">{t("haccp.lifecycleDesc")}</p>
                {haccpLifecycleEvents.length === 0 ? (
                  <p className="muted">Nessun evento lifecycle disponibile.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Evento</th>
                        <th>Prodotto</th>
                        <th>Qta</th>
                        <th>Lotto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {haccpLifecycleEvents.slice(0, 30).map((event) => (
                        <tr key={event.event_id}>
                          <td>{String(event.happened_at).replace("T", " ").slice(0, 19)}</td>
                          <td>{event.event_type}</td>
                          <td>{event.product_label}</td>
                          <td>{event.qty_value} {event.qty_unit}</td>
                          <td>{event.lot?.internal_lot_code || event.lot?.supplier_lot_code || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              <section className="panel">
                <h2>Traccia vs CookOps</h2>
                <p className="muted">Confronto tra lifecycle Traccia, programmazione etichette e documenti locali di acquisto.</p>
                {!siteId ? (
                  <p className="muted">{t("validation.selectSite")}</p>
                ) : !haccpReconciliationOverview ? (
                  <p className="muted">Overview di riconciliazione non disponibile.</p>
                ) : (
                  <>
                    <div className="grid-3">
                      <article className="panel metric-card">
                        <strong>{haccpReconciliationOverview!.summary.reconciled_events}</strong>
                        <span>Eventi riconciliati</span>
                      </article>
                      <article className="panel metric-card">
                        <strong>{haccpReconciliationOverview!.summary.documents_found_events}</strong>
                        <span>Documenti trovati da verificare</span>
                      </article>
                      <article className="panel metric-card">
                        <strong>{haccpReconciliationOverview!.summary.missing_events}</strong>
                        <span>Eventi senza documenti</span>
                      </article>
                      <article className="panel metric-card">
                        <strong>{haccpReconciliationOverview!.summary.goods_receipt_only_events}</strong>
                        <span>Solo bolle</span>
                      </article>
                      <article className="panel metric-card">
                        <strong>{haccpReconciliationOverview!.summary.invoice_only_events}</strong>
                        <span>Solo fatture</span>
                      </article>
                      <article className="panel metric-card">
                        <strong>{haccpReconciliationOverview!.label_schedule_summary.planned}</strong>
                        <span>Stampe etichette pianificate</span>
                      </article>
                    </div>
                    {haccpReconciliationOverview!.results.length === 0 ? (
                      <p className="muted">Nessun evento lifecycle da confrontare.</p>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Prodotto</th>
                            <th>Lotto</th>
                            <th>BL</th>
                            <th>Fatture</th>
                            <th>Match</th>
                            <th>Stato</th>
                            <th>Alert</th>
                          </tr>
                        </thead>
                        <tbody>
                          {haccpReconciliationOverview!.results.slice(0, 20).map((row) => (
                            <tr key={row.event_id}>
                              <td>{String(row.happened_at).replace("T", " ").slice(0, 19)}</td>
                              <td>
                                <strong>{row.product_label}</strong>
                                <br />
                                <span className="muted">{row.qty_value} {row.qty_unit}{row.supplier_code ? ` · ${row.supplier_code}` : ""}</span>
                              </td>
                              <td>{row.lot?.internal_lot_code || row.lot?.supplier_lot_code || "-"}</td>
                              <td>{row.goods_receipts.map((item) => item.delivery_note_number).join(", ") || "-"}</td>
                              <td>{row.invoices.map((item) => item.invoice_number).join(", ") || "-"}</td>
                              <td>{row.matches.length}</td>
                              <td>
                                <span className={`status-chip status-chip--${row.reconcile_status}`}>{row.reconcile_status}</span>
                              </td>
                              <td>{row.alerts.join(" ") || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </section>
              <section className="panel">
                <h2>{t("haccp.labelPrintTitle")}</h2>
                <p className="muted">{t("haccp.labelPrintDesc")}</p>
                <ul className="clean-list">
                  {haccpSchedules
                    .filter((item) => item.task_type === "label_print")
                    .slice(0, 8)
                    .map((item) => (
                      <li key={item.id}>
                        {item.title} - {String(item.starts_at).replace("T", " ").slice(0, 16)} [{item.status}]
                        <span className="entry-actions">
                          <button type="button" onClick={() => onSetHaccpScheduleStatus(item.id, "done")}>Completa</button>
                          <button type="button" className="danger-btn" onClick={() => onDeleteHaccpSchedule(item.id)}>Elimina</button>
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
              <section className="panel">
                <h2>{t("haccp.temperatureTitle")}</h2>
                <p className="muted">{t("haccp.temperatureDesc")}</p>
                <ul className="clean-list">
                  {haccpSchedules
                    .filter((item) => item.task_type === "temperature_register")
                    .slice(0, 8)
                    .map((item) => (
                      <li key={item.id}>
                        {item.title} - {String(item.starts_at).replace("T", " ").slice(0, 16)} [{item.status}]
                        <span className="entry-actions">
                          <button type="button" onClick={() => onSetHaccpScheduleStatus(item.id, "done")}>Completa</button>
                          <button type="button" className="danger-btn" onClick={() => onDeleteHaccpSchedule(item.id)}>Elimina</button>
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
              <section className="panel">
                <h2>{t("haccp.cleaningTitle")}</h2>
                <p className="muted">{t("haccp.cleaningDesc")}</p>
                <ul className="clean-list">
                  {haccpSchedules
                    .filter((item) => item.task_type === "cleaning")
                    .slice(0, 8)
                    .map((item) => (
                      <li key={item.id}>
                        {item.title} - {String(item.starts_at).replace("T", " ").slice(0, 16)} [{item.status}]
                        <span className="entry-actions">
                          <button type="button" onClick={() => onSetHaccpScheduleStatus(item.id, "done")}>Completa</button>
                          <button type="button" className="danger-btn" onClick={() => onDeleteHaccpSchedule(item.id)}>Elimina</button>
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
              <section className="panel">
                <h2>{t("haccp.nextStepsTitle")}</h2>
                <form onSubmit={onCreateHaccpSchedule}>
                  <label>Tipo task</label>
                  <select value={newHaccpTaskType} onChange={(e) => setNewHaccpTaskType(e.target.value as "label_print" | "temperature_register" | "cleaning")}>
                    <option value="label_print">Stampa etichette</option>
                    <option value="temperature_register">Registro temperature</option>
                    <option value="cleaning">Pulizie</option>
                  </select>
                  <label>Titolo</label>
                  <input value={newHaccpTitle} onChange={(e) => setNewHaccpTitle(e.target.value)} placeholder="Es. Giro frigo mattino" />
                  <label>Area</label>
                  <input value={newHaccpArea} onChange={(e) => setNewHaccpArea(e.target.value)} placeholder="Es. Cucina fredda" />
                  <label>Inizio</label>
                  <input type="datetime-local" value={newHaccpStartsAt} onChange={(e) => setNewHaccpStartsAt(e.target.value)} />
                  <label>Fine</label>
                  <input type="datetime-local" value={newHaccpEndsAt} onChange={(e) => setNewHaccpEndsAt(e.target.value)} />
                  <button type="submit" disabled={isHaccpSaving}>{isHaccpSaving ? t("action.loading") : "Crea task HACCP"}</button>
                </form>
              </section>
            </div>
          )}

          {nav === "report" && (
            <div className="grid">
              <section className="panel">
                <h2>{t("report.dailyPosImport")}</h2>
                <form onSubmit={onImportPos}>
                  <label>{t("report.salesDate")}</label>
                  <input type="date" value={salesDate} onChange={(e) => setSalesDate(e.target.value)} />
                  <label>{t("report.posSourceId")}</label>
                  <input value={posSourceId} onChange={(e) => setPosSourceId(e.target.value)} placeholder={t("report.posSourcePlaceholder")} />
                  <label>{t("report.salesLinesJson")}</label>
                  <textarea value={salesLines} onChange={(e) => setSalesLines(e.target.value)} rows={8} />
                  <button type="submit">{t("report.importSales")}</button>
                </form>
              </section>
              <section className="panel">
                <h2>{t("report.analysis")}</h2>
                <p className="muted">{t("report.analysisDesc")}</p>
              </section>
            </div>
          )}
          </>
          ) : null}
        </main>
      </div>
      {isSidebarOpenMobile ? <button type="button" className="sidebar-mobile-backdrop" onClick={() => setIsSidebarOpenMobile(false)} /> : null}

      {isSettingsOpen ? (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>
              {t("action.close")}
            </button>
            <h2>{t("settings.title")}</h2>
            <p className="params-note">{notice}</p>
            <label>{t("settings.apiKey")}</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <button type="button" onClick={loadSites}>{t("settings.refreshSites")}</button>
            <div className="site-admin-grid">
              <form onSubmit={onCreateSite}>
                <h3>{t("settings.newSite")}</h3>
                <label>{t("settings.name")}</label>
                <input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder={t("settings.siteNamePlaceholder")} />
                <label>{t("settings.code")}</label>
                <input value={newSiteCode} onChange={(e) => setNewSiteCode(e.target.value)} placeholder={t("settings.siteCodePlaceholder")} />
                <button type="submit">{t("settings.createSite")}</button>
              </form>
              <section>
                <h3>{t("settings.availableSites")}</h3>
                <ul className="site-list">
                  {sites.map((site) => (
                    <li key={site.id} className="site-row">
                      <div className="site-main">
                        <strong>{site.name}</strong>
                        <small>{site.code}</small>
                        <span className={`site-status ${site.is_active ? "site-status--active" : "site-status--inactive"}`}>
                          {site.is_active ? t("settings.active") : t("settings.disabled")}
                        </span>
                      </div>
                      <div className="site-actions">
                        {site.is_active ? (
                          <button type="button" className="warning-btn" onClick={() => onDisableSite(site.id)}>
                            {t("settings.disable")}
                          </button>
                        ) : (
                          <button type="button" className="success-btn" onClick={() => onReactivateSite(site.id)}>
                            {t("settings.reactivate")}
                          </button>
                        )}
                        <button type="button" className="danger-btn" onClick={() => setSiteToDelete(site)}>
                          {t("action.delete")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <hr />
            <h3>{t("settings.recipesPageSettings")}</h3>
            <label className="checkline">
              <input type="checkbox" checked={isMenuAdvancedMode} onChange={(e) => setIsMenuAdvancedMode(e.target.checked)} />
              {t("settings.advancedMenuSpaces")}
            </label>
            {isMenuAdvancedMode ? (
              <div className="menu-advanced-grid">
                <section>
                  <h3>{t("settings.spaces")}</h3>
                  {menuSpaces
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((space) => (
                      <div key={space.id} className="space-row">
                        <input value={space.label} onChange={(e) => updateMenuSpace(space.id, { label: e.target.value })} />
                        <select value={space.type} onChange={(e) => updateMenuSpace(space.id, { type: e.target.value as MenuSpaceType })}>
                          <option value="recipes">{t("settings.spaceTypeRecipes")}</option>
                          <option value="supplier_products">{t("settings.spaceTypeSupplierProducts")}</option>
                          <option value="mixed">{t("settings.spaceTypeMixed")}</option>
                        </select>
                        <select
                          value={space.schedule_mode}
                          onChange={(e) => updateMenuSpace(space.id, { schedule_mode: e.target.value as EntryScheduleMode })}
                        >
                          <option value="permanent">{t("settings.schedulePermanent")}</option>
                          <option value="date_specific">{t("settings.scheduleDate")}</option>
                          <option value="recurring_weekly">{t("settings.scheduleRecurring")}</option>
                        </select>
                        <label className="checkline">
                          <input type="checkbox" checked={space.enabled} onChange={(e) => updateMenuSpace(space.id, { enabled: e.target.checked })} />
                          {t("settings.activeShort")}
                        </label>
                        <button type="button" className="danger-btn" onClick={() => removeMenuSpace(space.id)}>{t("action.remove")}</button>
                      </div>
                    ))}
                  <label>{t("settings.newSpace")}</label>
                  <input value={newSpaceLabel} onChange={(e) => setNewSpaceLabel(e.target.value)} placeholder={t("settings.newSpacePlaceholder")} />
                  <label>{t("settings.spaceType")}</label>
                  <select value={newSpaceType} onChange={(e) => setNewSpaceType(e.target.value as MenuSpaceType)}>
                    <option value="recipes">{t("settings.spaceTypeRecipes")}</option>
                    <option value="supplier_products">{t("settings.spaceTypeSupplierProducts")}</option>
                    <option value="mixed">{t("settings.spaceTypeMixed")}</option>
                  </select>
                  <button type="button" onClick={addMenuSpace}>{t("settings.addSpace")}</button>
                </section>
                <section>
                  <h3>{t("settings.sectionsForSpace")}</h3>
                  <label>{t("settings.space")}</label>
                  <select value={editingSpaceId} onChange={(e) => setEditingSpaceId(e.target.value)}>
                    {menuSpaces.map((space) => (
                      <option key={space.id} value={space.id}>{space.label}</option>
                    ))}
                  </select>
                  <ul className="clean-list">
                    {editingSpace?.sections.map((section) => (
                      <li key={section}>
                        {section}
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() =>
                            setMenuSpaces((prev) =>
                              {
                                const next = prev.map((space) =>
                                  space.id === editingSpace.id
                                    ? { ...space, sections: space.sections.filter((current) => current !== section) }
                                    : space
                                );
                                void syncServiceMenuEntries(next, false);
                                return next;
                              }
                            )
                          }
                        >
                          {t("action.delete")}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <label>{t("settings.newSection")}</label>
                  <input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder={t("settings.newSectionPlaceholder")} />
                  <button type="button" onClick={addMenuSection}>{t("settings.addSection")}</button>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isMenuEditorOpen && editingSpace ? (
        <div className="modal-backdrop" onClick={() => setIsMenuEditorOpen(false)}>
          <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setIsMenuEditorOpen(false)}>
              {t("action.close")}
            </button>
            <h2>{t("menuEditor.editSpace", { space: editingSpace.label })}</h2>
            <form onSubmit={onSubmitMenuEntry}>
              <label>{t("menuEditor.entryType")}</label>
              <select value={entryKind} onChange={(e) => setEntryKind(e.target.value as "recipe" | "product")}>
                <option value="recipe">{t("menuEditor.entryTypeRecipe")}</option>
                <option value="product">{t("menuEditor.entryTypeProduct")}</option>
              </select>
              {entryKind === "recipe" ? (
                <div className="recipe-picker">
                  <label>{t("menuEditor.title")}</label>
                  <input
                    value={recipePickerSearch}
                    onChange={(e) => setRecipePickerSearch(e.target.value)}
                    placeholder={t("menuEditor.titlePlaceholder")}
                  />
                  <p className="muted">Snapshot selezionati: {selectedRecipeKeys.length}</p>
                  <div className="sheet-wrap recipe-picker-table-wrap">
                    <table className="sheet-table recipe-picker-table">
                      <thead>
                        <tr>
                          <th>{t("action.select")}</th>
                          <th>{t("menuEditor.title")}</th>
                          <th>{t("menuEditor.section")}</th>
                          <th>{t("menuEditor.fichePortions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipeTitleSuggestions.map((item) => {
                          const key = recipeSuggestionKey(item);
                          const checked = selectedRecipeKeys.includes(key);
                          const disabled = !String(item.fiche_product_id || "").trim();
                          return (
                            <tr key={key}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    const currentKey = recipeSuggestionKey(item);
                                    setSelectedRecipeKeys((prev) => {
                                      if (editingEntryId) {
                                        return e.target.checked ? [currentKey] : [];
                                      }
                                      if (e.target.checked) {
                                        return [...new Set([...prev, currentKey])];
                                      }
                                      return prev.filter((x) => x !== currentKey);
                                    });
                                  }}
                                />
                              </td>
                              <td>{item.title}</td>
                              <td>{String(item.category ?? "-") || "-"}</td>
                              <td>{String(item.portions ?? "-")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <>
                  <label>{t("menuEditor.title")}</label>
                  <input
                    list="menu-entry-suggestions"
                    value={entryTitle}
                    onChange={(e) => setEntryTitle(e.target.value)}
                    placeholder={t("menuEditor.titlePlaceholder")}
                  />
                  <datalist id="menu-entry-suggestions">
                    {menuSuggestions.map((suggestion) => (
                      <option key={suggestion.key} value={suggestion.value} />
                    ))}
                  </datalist>
                </>
              )}
              <label>{t("menuEditor.targetPortions")}</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={entryExpectedQty}
                onChange={(e) => setEntryExpectedQty(e.target.value)}
              />
              <label>{t("menuEditor.section")}</label>
              <select value={entrySection} onChange={(e) => setEntrySection(e.target.value)}>
                <option value="">{t("label.noSection")}</option>
                {entrySection && !editingSpace.sections.includes(entrySection) ? (
                  <option value={entrySection}>{entrySection}</option>
                ) : null}
                {editingSpace.sections.map((section) => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
              <label>{t("menuEditor.schedule")}</label>
              <select value={entryScheduleMode} onChange={(e) => setEntryScheduleMode(e.target.value as EntryScheduleMode)}>
                <option value="permanent">{t("menuEditor.schedulePermanent")}</option>
                <option value="date_specific">{t("menuEditor.scheduleDateRange")}</option>
                <option value="recurring_weekly">{t("menuEditor.scheduleWeekly")}</option>
              </select>
              {entryScheduleMode === "recurring_weekly" ? (
                <div>
                  <label>{t("menuEditor.weekdays")}</label>
                  <div className="checkline">
                    {[
                      { key: 0, label: t("weekday.mon") },
                      { key: 1, label: t("weekday.tue") },
                      { key: 2, label: t("weekday.wed") },
                      { key: 3, label: t("weekday.thu") },
                      { key: 4, label: t("weekday.fri") },
                      { key: 5, label: t("weekday.sat") },
                      { key: 6, label: t("weekday.sun") },
                    ].map((day) => (
                      <label key={day.key} className="checkline">
                        <input
                          type="checkbox"
                          checked={entryWeekdays.includes(day.key)}
                          onChange={(e) =>
                            setEntryWeekdays((prev) =>
                              e.target.checked ? [...new Set([...prev, day.key])].sort((a, b) => a - b) : prev.filter((x) => x !== day.key)
                            )
                          }
                        />
                        {day.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-2">
                <div>
                  <label>{t("menuEditor.validFrom")}</label>
                  <input type="date" value={entryValidFrom} onChange={(e) => setEntryValidFrom(e.target.value)} />
                </div>
                <div>
                  <label>{t("menuEditor.validTo")}</label>
                  <input type="date" value={entryValidTo} onChange={(e) => setEntryValidTo(e.target.value)} />
                </div>
              </div>
              <button type="submit">{editingEntryId ? t("menuEditor.saveReplacement") : t("menuEditor.addEntry")}</button>
            </form>
          </div>
        </div>
      ) : null}

      {siteToDelete ? (
        <div className="modal-backdrop" onClick={closeDeleteSiteDialog}>
          <div className="modal-card modal-card--narrow" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={closeDeleteSiteDialog}>
              {t("action.close")}
            </button>
            <h2>{t("deleteSite.title")}</h2>
            <p className="muted">
              {t("deleteSite.descStart")} <strong>{siteToDelete.name}</strong>.
            </p>
            <p className="muted">{t("deleteSite.confirmPrompt")} <strong>{t("deleteSite.confirmText")}</strong></p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={t("deleteSite.confirmText")}
            />
            <button
              type="button"
              className="danger-btn"
              onClick={onHardDeleteSite}
              disabled={deleteConfirmText !== t("deleteSite.confirmText")}
            >
              {t("deleteSite.deleteForever")}
            </button>
          </div>
        </div>
      ) : null}

      <footer className="notice">{notice}</footer>
    </div>
  );
}

export default App;









