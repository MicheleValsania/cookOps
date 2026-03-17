import { useEffect, useState } from "react";

type TraceabilityQueueItem = {
  document_id: string;
  filename: string;
  document_type: "goods_receipt" | "invoice" | "label_capture";
  document_status: string;
  validation_status: string;
  validation_notes?: string;
  extraction?: {
    confidence?: string | null;
    status?: string | null;
    normalized_payload?: Record<string, unknown>;
  } | null;
};

type TraceabilityLifecycleEvent = {
  event_id: string;
  happened_at: string;
  event_type: string;
  product_label: string;
  qty_value: string;
  qty_unit: string;
  lot?: {
    internal_lot_code?: string | null;
    supplier_lot_code?: string | null;
  } | null;
};

type TraceabilityReconciliationOverview = {
  summary: {
    reconciled_events: number;
    goods_receipt_only_events: number;
    invoice_only_events: number;
    missing_events: number;
    documents_found_events: number;
  };
  results: Array<{
    event_id: string;
    happened_at: string;
    product_label: string;
    reconcile_status: "reconciled" | "documents_found" | "goods_receipt_only" | "invoice_only" | "missing";
    alerts: string[];
    lot?: {
      internal_lot_code?: string | null;
      supplier_lot_code?: string | null;
    } | null;
  }>;
} | null;

type TraceabilityImportSummary = {
  created_count: number;
  skipped_existing: number;
  skipped_invalid: number;
  error_count: number;
  extracted_count: number;
};

type Props = {
  siteId: string;
  isLoading: boolean;
  isSaving: boolean;
  queue: TraceabilityQueueItem[];
  lifecycleEvents: TraceabilityLifecycleEvent[];
  reconciliationOverview: TraceabilityReconciliationOverview;
  selectedQueueItem: TraceabilityQueueItem | null;
  selectedDocumentId: string;
  selectedDocumentUrl: string;
  selectedDocumentContentType?: string | null;
  setSelectedDocumentId: (value: string) => void;
  onImportAssets: () => void | Promise<void>;
  onRefresh: () => void;
  onExtractDocument: (documentId: string) => void | Promise<void>;
  onValidateDocument: (
    documentId: string,
    statusValue: "validated" | "rejected",
    correctedPayload?: Record<string, unknown>,
    notes?: string
  ) => void;
  onDeleteDocument: (documentId: string) => void | Promise<void>;
  onOpenReconciliation: () => void;
  importSummary: TraceabilityImportSummary | null;
  importStatus: string;
  t: (key: string) => string;
};

function pickField(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(payload[key] ?? "").trim();
    if (value) return value;
  }
  return "-";
}

function formatValidationStatus(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "validated") return "Confermato";
  if (normalized === "rejected") return "Rifiutato";
  if (normalized === "pending_review") return "Da validare";
  if (normalized === "failed") return "Fallito";
  return normalized || "-";
}

export function TraceabilityWorkspace(props: Props) {
  const {
    siteId,
    isLoading,
    isSaving,
    queue,
    lifecycleEvents,
    reconciliationOverview,
    selectedQueueItem,
    selectedDocumentId,
    selectedDocumentUrl,
    selectedDocumentContentType,
    setSelectedDocumentId,
    onImportAssets,
    onRefresh,
    onExtractDocument,
    onValidateDocument,
    onDeleteDocument,
    onOpenReconciliation,
    importSummary,
    importStatus,
    t,
  } = props;
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [editPayload, setEditPayload] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState("");

  const extractedCount = queue.filter((item) => String(item.extraction?.status || "").trim() === "succeeded").length;
  const pendingCount = queue.filter((item) => {
    const status = String(item.validation_status || "").trim().toLowerCase();
    return status === "pending" || status === "pending_review";
  }).length;
  const failedCount = queue.filter((item) => String(item.extraction?.status || "").trim() === "failed").length;
  const payload = (selectedQueueItem?.extraction?.normalized_payload ?? {}) as Record<string, unknown>;
  const isImagePreview =
    String(selectedDocumentContentType || "").toLowerCase().startsWith("image/")
    || /\.(png|jpe?g|gif|webp)$/i.test(String(selectedQueueItem?.filename || ""));
  const canConfirm = selectedQueueItem?.validation_status !== "validated";
  const canReject = selectedQueueItem?.validation_status !== "rejected";

  useEffect(() => {
    setEditPayload({});
    setReviewNotes(String(selectedQueueItem?.validation_notes ?? ""));
  }, [selectedQueueItem?.document_id]);

  function readEditableField(key: string, fallbackKeys: string[]) {
    const localValue = String(editPayload[key] ?? "").trim();
    if (localValue) return localValue;
    return pickField(payload, fallbackKeys) === "-" ? "" : pickField(payload, fallbackKeys);
  }

  function buildCorrectedPayload() {
    return {
      ...payload,
      product_guess: readEditableField("product_guess", ["product_guess", "product_name", "label"]) || null,
      supplier_name: readEditableField("supplier_name", ["supplier_name", "supplier", "vendor_name"]) || null,
      origin_lot_code: readEditableField("origin_lot_code", ["origin_lot_code", "source_lot_code", "lot_origin"]) || null,
      supplier_lot_code: readEditableField("supplier_lot_code", ["supplier_lot_code", "lot_code", "lot"]) || null,
      production_date: readEditableField("production_date", ["production_date", "manufactured_at", "packed_at"]) || null,
      dlc_date: readEditableField("dlc_date", ["dlc_date", "expiry_date", "best_before_date"]) || null,
      weight_value: readEditableField("weight_value", ["weight_value"]) || null,
      weight_unit: readEditableField("weight_unit", ["weight_unit"]) || null,
      packaging: readEditableField("packaging", ["packaging"]) || null,
      storage_hint: readEditableField("storage_hint", ["storage_hint", "storage"]) || null,
      notes: readEditableField("notes", ["notes"]) || null,
    };
  }

  return (
    <div className="grid grid-single">
      {!siteId ? (
        <section className="panel">
          <p className="muted">{t("validation.selectSite")}</p>
        </section>
      ) : (
        <>
          <section className="panel traceability-toolbar-panel">
            <div className="traceability-toolbar">
              <div className="entry-actions no-print">
                <button type="button" onClick={() => void onImportAssets()} disabled={!siteId || isLoading || isSaving}>
                  {isSaving ? t("action.loading") : "Importa da Drive"}
                </button>
                <button type="button" onClick={onRefresh} disabled={!siteId || isLoading}>
                  {isLoading ? t("action.loading") : t("suppliers.refreshList")}
                </button>
                <button type="button" onClick={onOpenReconciliation} disabled={!siteId}>
                  Apri riconciliazione
                </button>
              </div>
            </div>
          </section>

          <div className="grid">
            <section className="panel">
              <div className="doc-preview__head">
                <h2>Foto</h2>
              </div>
              {queue.length === 0 ? (
                <p className="muted">Nessuna foto importata per il sito.</p>
              ) : (
                <div className="sheet-wrap">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Foto</th>
                        <th>OCR</th>
                        <th>Validazione</th>
                        <th>Conf.</th>
                        <th>Azione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.slice(0, 40).map((row) => (
                        <tr
                          key={row.document_id}
                          className={row.document_id === selectedDocumentId ? "traceability-row--active" : undefined}
                        >
                          <td><strong>{row.filename}</strong></td>
                          <td>{String(row.extraction?.status || row.document_status || "-")}</td>
                          <td>{formatValidationStatus(row.validation_status)}</td>
                          <td>{row.extraction?.confidence || "-"}</td>
                          <td>
                            <div className="entry-actions">
                              <button type="button" onClick={() => setSelectedDocumentId(row.document_id)}>Apri</button>
                              <button type="button" onClick={() => void onExtractDocument(row.document_id)}>Estrai</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="doc-preview__head">
                <h2>Dettaglio</h2>
                {selectedQueueItem ? (
                  <div className="entry-actions no-print">
                    <button type="button" onClick={() => void onExtractDocument(selectedQueueItem.document_id)}>Rilancia OCR</button>
                    {isImagePreview ? <button type="button" onClick={() => setIsZoomOpen(true)}>Zoom</button> : null}
                    <button type="button" onClick={() => onValidateDocument(selectedQueueItem.document_id, "validated", buildCorrectedPayload(), reviewNotes)} disabled={!canConfirm}>Conferma</button>
                    <button type="button" className="warning-btn" onClick={() => onValidateDocument(selectedQueueItem.document_id, "rejected", undefined, reviewNotes)} disabled={!canReject}>Rifiuta</button>
                    <button type="button" className="danger-btn" onClick={() => void onDeleteDocument(selectedQueueItem.document_id)}>Elimina</button>
                  </div>
                ) : null}
              </div>
              {!selectedQueueItem ? (
                <p className="muted">Seleziona una foto.</p>
              ) : (
                <>
                  <div className="traceability-preview">
                    {selectedDocumentUrl ? (
                      isImagePreview ? (
                        <img className="traceability-image" src={selectedDocumentUrl} alt={selectedQueueItem.filename} />
                      ) : (
                        <iframe className="doc-frame" src={selectedDocumentUrl} title={selectedQueueItem.filename} />
                      )
                    ) : (
                      <p className="muted">Anteprima non disponibile.</p>
                    )}
                  </div>
                  <div className="doc-preview">
                    <div className="doc-preview__grid">
                      <div>
                        <span>Prodotto</span>
                        <input value={readEditableField("product_guess", ["product_guess", "product_name", "label"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, product_guess: e.target.value }))} />
                      </div>
                      <div>
                        <span>Fornitore</span>
                        <input value={readEditableField("supplier_name", ["supplier_name", "supplier", "vendor_name"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, supplier_name: e.target.value }))} />
                      </div>
                      <div>
                        <span>Lotto origine</span>
                        <input value={readEditableField("origin_lot_code", ["origin_lot_code", "source_lot_code", "lot_origin"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, origin_lot_code: e.target.value }))} />
                      </div>
                      <div>
                        <span>Lotto fornitore</span>
                        <input value={readEditableField("supplier_lot_code", ["supplier_lot_code", "lot_code", "lot"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, supplier_lot_code: e.target.value }))} />
                      </div>
                      <div>
                        <span>Produzione</span>
                        <input value={readEditableField("production_date", ["production_date", "manufactured_at", "packed_at"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, production_date: e.target.value }))} />
                      </div>
                      <div>
                        <span>DLC</span>
                        <input value={readEditableField("dlc_date", ["dlc_date", "expiry_date", "best_before_date"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, dlc_date: e.target.value }))} />
                      </div>
                      <div>
                        <span>Peso</span>
                        <input value={readEditableField("weight_value", ["weight_value"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, weight_value: e.target.value }))} />
                      </div>
                      <div>
                        <span>UM</span>
                        <input value={readEditableField("weight_unit", ["weight_unit"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, weight_unit: e.target.value }))} />
                      </div>
                      <div>
                        <span>Packaging</span>
                        <input value={readEditableField("packaging", ["packaging"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, packaging: e.target.value }))} />
                      </div>
                      <div>
                        <span>Conservazione</span>
                        <input value={readEditableField("storage_hint", ["storage_hint", "storage"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, storage_hint: e.target.value }))} />
                      </div>
                      <div className="traceability-grid-span">
                        <span>Note review</span>
                        <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>

          <div className="grid">
            <section className="panel">
              <div className="doc-preview__head">
                <h2>Riconciliazione</h2>
                <div className="entry-actions no-print">
                  <button type="button" onClick={onOpenReconciliation}>Apri pagina</button>
                </div>
              </div>
              <div className="traceability-compact-summary">
                <span><strong>{reconciliationOverview?.summary.reconciled_events ?? 0}</strong> riconciliati</span>
                <span><strong>{reconciliationOverview?.summary.documents_found_events ?? 0}</strong> da confermare</span>
                <span><strong>{reconciliationOverview?.summary.missing_events ?? 0}</strong> mancanti</span>
              </div>
            </section>

            <section className="panel">
              <div className="doc-preview__head">
                <h2>Eventi</h2>
              </div>
              {lifecycleEvents.length === 0 ? (
                <p className="muted">Nessun evento disponibile.</p>
              ) : (
                <div className="sheet-wrap">
                  <table className="sheet-table">
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
                      {lifecycleEvents.slice(0, 20).map((event) => (
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
                </div>
              )}
            </section>
          </div>

          <section className="panel traceability-status-panel">
            <div className="traceability-compact-summary">
              <span><strong>{queue.length}</strong> foto</span>
              <span><strong>{extractedCount}</strong> estratte</span>
              <span><strong>{pendingCount}</strong> da validare</span>
              <span><strong>{failedCount}</strong> in errore</span>
              {importSummary ? (
                <span>
                  <strong>{importSummary.created_count}</strong> nuove,
                  {" "}{importSummary.skipped_existing} gia presenti,
                  {" "}{importSummary.extracted_count} OCR
                </span>
              ) : importStatus ? (
                <span>{importStatus}</span>
              ) : null}
            </div>
          </section>
        </>
      )}

      {isZoomOpen && selectedDocumentUrl ? (
        <div className="image-zoom-modal" role="dialog" aria-modal="true">
          <div className="image-zoom-toolbar">
            <button type="button" onClick={() => setZoomLevel((value) => Math.max(1, value - 0.25))}>-</button>
            <button type="button" onClick={() => setZoomLevel(1)}>Reset</button>
            <button type="button" onClick={() => setZoomLevel((value) => Math.min(3, value + 0.25))}>+</button>
            <button type="button" className="danger-btn" onClick={() => setIsZoomOpen(false)}>Chiudi</button>
          </div>
          <div className="image-zoom-canvas">
            <img
              className="traceability-image traceability-image--zoomed"
              src={selectedDocumentUrl}
              alt={selectedQueueItem?.filename || "Zoom"}
              style={{ transform: `scale(${zoomLevel})` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
