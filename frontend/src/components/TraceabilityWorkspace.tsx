import { useState } from "react";

type TraceabilityQueueItem = {
  document_id: string;
  filename: string;
  document_type: "goods_receipt" | "invoice" | "label_capture";
  document_status: string;
  validation_status: string;
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
  onValidateDocument: (documentId: string, statusValue: "validated" | "rejected", correctedPayload?: Record<string, unknown>) => void;
  onDeleteDocument: (documentId: string) => void | Promise<void>;
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
    importSummary,
    importStatus,
    t,
  } = props;
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [editPayload, setEditPayload] = useState<Record<string, string>>({});

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
      <section className="panel">
        <div className="menu-space-header-row">
          <div>
            <h2>Area Tracciabilita</h2>
            <p className="muted">Foto Traccia, dati estratti e riconciliazione operativa in una vista dedicata.</p>
          </div>
          <div className="entry-actions no-print">
            <button type="button" onClick={() => void onImportAssets()} disabled={!siteId || isLoading || isSaving}>
              {isSaving ? t("action.loading") : "Importa da Drive"}
            </button>
            <button type="button" onClick={onRefresh} disabled={!siteId || isLoading}>
              {isLoading ? t("action.loading") : t("suppliers.refreshList")}
            </button>
          </div>
        </div>
        <p className="muted">Target: background worker centrale che osserva Drive, importa le nuove foto e aggiorna automaticamente l'estrazione.</p>
        <div className="grid-3">
          <article className="panel metric-card">
            <strong>{queue.length}</strong>
            <span>Foto disponibili</span>
          </article>
          <article className="panel metric-card">
            <strong>{extractedCount}</strong>
            <span>Dati estratti</span>
          </article>
          <article className="panel metric-card">
            <strong>{pendingCount}</strong>
            <span>Da validare</span>
          </article>
          <article className="panel metric-card">
            <strong>{failedCount}</strong>
            <span>OCR in errore</span>
          </article>
          <article className="panel metric-card">
            <strong>{reconciliationOverview?.summary.reconciled_events ?? 0}</strong>
            <span>Eventi riconciliati</span>
          </article>
          <article className="panel metric-card">
            <strong>{reconciliationOverview?.summary.missing_events ?? 0}</strong>
            <span>Eventi senza documenti</span>
          </article>
        </div>
        {importSummary ? (
          <div className="traceability-summary">
            <strong>Ultimo import</strong>
            <span>
              {importSummary.created_count} nuove, {importSummary.skipped_existing} gia presenti, {importSummary.extracted_count} estrazioni avviate,
              {" "}{importSummary.error_count} errori.
            </span>
          </div>
        ) : importStatus ? (
          <div className="traceability-summary">
            <strong>Stato</strong>
            <span>{importStatus}</span>
          </div>
        ) : null}
      </section>

      {!siteId ? (
        <section className="panel">
          <p className="muted">{t("validation.selectSite")}</p>
        </section>
      ) : (
        <>
          <div className="grid">
            <section className="panel">
              <div className="doc-preview__head">
                <h2>1. Foto e stato</h2>
              </div>
              <p className="muted">Elenco operativo delle foto importate con stato estrazione e validazione.</p>
              {queue.length === 0 ? (
                <p className="muted">Nessuna foto importata per il sito.</p>
              ) : (
                <div className="sheet-wrap">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Foto</th>
                        <th>Estratto</th>
                        <th>Validazione</th>
                        <th>Confidenza</th>
                        <th>Azione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.slice(0, 40).map((row) => (
                        <tr
                          key={row.document_id}
                          className={row.document_id === selectedDocumentId ? "traceability-row--active" : undefined}
                        >
                          <td>
                            <strong>{row.filename}</strong>
                            <div className="muted">{row.document_type}</div>
                          </td>
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
                <h2>2. Foto e dati estratti</h2>
                {selectedQueueItem ? (
                  <div className="entry-actions no-print">
                    <button type="button" onClick={() => void onExtractDocument(selectedQueueItem.document_id)}>Rilancia OCR</button>
                    {isImagePreview ? (
                      <button type="button" onClick={() => setIsZoomOpen(true)}>Zoom</button>
                    ) : null}
                    <button type="button" onClick={() => onValidateDocument(selectedQueueItem.document_id, "validated", buildCorrectedPayload())} disabled={!canConfirm}>Conferma</button>
                    <button type="button" className="warning-btn" onClick={() => onValidateDocument(selectedQueueItem.document_id, "rejected")} disabled={!canReject}>
                      Rifiuta
                    </button>
                    <button type="button" className="danger-btn" onClick={() => void onDeleteDocument(selectedQueueItem.document_id)}>Elimina</button>
                  </div>
                ) : null}
              </div>
              {!selectedQueueItem ? (
                <p className="muted">Seleziona una foto per visualizzare anteprima e campi estratti.</p>
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
                        <span>DLC / DDM</span>
                        <input value={readEditableField("dlc_date", ["dlc_date", "expiry_date", "best_before_date"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, dlc_date: e.target.value }))} />
                      </div>
                      <div>
                        <span>Peso</span>
                        <input value={readEditableField("weight_value", ["weight_value"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, weight_value: e.target.value }))} />
                      </div>
                      <div>
                        <span>UM peso</span>
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
                      <div>
                        <span>Stato OCR</span>
                        <b>{String(selectedQueueItem.extraction?.status || selectedQueueItem.document_status || "-")}</b>
                      </div>
                      <div>
                        <span>Validazione</span>
                        <b>{formatValidationStatus(selectedQueueItem.validation_status)}</b>
                      </div>
                      <div className="traceability-grid-span">
                        <span>Note estratte</span>
                        <textarea value={readEditableField("notes", ["notes"])} onChange={(e) => setEditPayload((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
                      </div>
                    </div>
                    <details>
                      <summary>Payload estratto</summary>
                      <pre>{JSON.stringify(payload, null, 2)}</pre>
                    </details>
                  </div>
                </>
              )}
            </section>
          </div>

          <div className="grid">
            <section className="panel">
              <div className="doc-preview__head">
                <h2>3. Riconciliazione</h2>
              </div>
              <p className="muted">Confronto rapido tra documenti trovati e movimenti operativi Traccia.</p>
              {!reconciliationOverview || reconciliationOverview.results.length === 0 ? (
                <p className="muted">Nessun dato di riconciliazione disponibile.</p>
              ) : (
                <div className="sheet-wrap">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Prodotto</th>
                        <th>Lotto</th>
                        <th>Stato</th>
                        <th>Alert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliationOverview.results.slice(0, 20).map((row) => (
                        <tr key={row.event_id}>
                          <td>{String(row.happened_at).replace("T", " ").slice(0, 19)}</td>
                          <td>{row.product_label}</td>
                          <td>{row.lot?.internal_lot_code || row.lot?.supplier_lot_code || "-"}</td>
                          <td>{row.reconcile_status}</td>
                          <td>{row.alerts.join(" ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="doc-preview__head">
                <h2>4. Ultimi eventi Traccia</h2>
              </div>
              <p className="muted">Vista sintetica degli eventi lifecycle più recenti associati alla tracciabilità.</p>
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
                        <th>Quantita</th>
                        <th>Lotto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lifecycleEvents.slice(0, 20).map((row) => (
                        <tr key={row.event_id}>
                          <td>{String(row.happened_at).replace("T", " ").slice(0, 19)}</td>
                          <td>{row.event_type}</td>
                          <td>{row.product_label}</td>
                          <td>{row.qty_value} {row.qty_unit}</td>
                          <td>{row.lot?.internal_lot_code || row.lot?.supplier_lot_code || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {isZoomOpen && selectedQueueItem && selectedDocumentUrl ? (
        <div className="modal-backdrop" onClick={() => setIsZoomOpen(false)}>
          <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setIsZoomOpen(false)}>
              X
            </button>
            <div className="doc-preview__head">
              <h2>Zoom foto</h2>
              <div className="entry-actions">
                <button type="button" onClick={() => setZoomLevel((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}>-</button>
                <button type="button" onClick={() => setZoomLevel(1)}>Reset</button>
                <button type="button" onClick={() => setZoomLevel((prev) => Math.min(3, Number((prev + 0.25).toFixed(2))))}>+</button>
              </div>
            </div>
            <p className="muted">Zoom: {Math.round(zoomLevel * 100)}%</p>
            <div className="traceability-zoom-frame">
              <img
                className="traceability-zoom-image"
                src={selectedDocumentUrl}
                alt={selectedQueueItem.filename}
                style={{ transform: `scale(${zoomLevel})` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
