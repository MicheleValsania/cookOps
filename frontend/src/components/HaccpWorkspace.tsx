import type { FormEvent } from "react";

type HaccpOcrQueueItem = {
  document_id: string;
  filename: string;
  document_type: "goods_receipt" | "invoice";
  document_status: string;
  validation_status: string;
  extraction?: {
    confidence?: string | null;
    status?: string | null;
    normalized_payload?: Record<string, unknown>;
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
  lot?: {
    internal_lot_code?: string | null;
    supplier_lot_code?: string | null;
  } | null;
};

type HaccpScheduleItem = {
  id: string;
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
};

type HaccpSectorItem = {
  id: string;
  external_code?: string | null;
  name: string;
};

type HaccpColdPointItem = {
  id: string;
  external_code?: string | null;
  sector?: string | null;
  name: string;
  equipment_type?: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER" | "" | null;
};

type HaccpReconciliationOverview = {
  summary: {
    reconciled_events: number;
    goods_receipt_only_events: number;
    invoice_only_events: number;
    missing_events: number;
    documents_found_events: number;
  };
  label_schedule_summary: {
    planned: number;
  };
  results: Array<{
    event_id: string;
    happened_at: string;
    product_label: string;
    supplier_code?: string | null;
    qty_value: string;
    qty_unit: string;
    reconcile_status: "reconciled" | "documents_found" | "goods_receipt_only" | "invoice_only" | "missing";
    lot?: {
      internal_lot_code?: string | null;
      supplier_lot_code?: string | null;
    } | null;
    goods_receipts: Array<{ delivery_note_number: string }>;
    invoices: Array<{ invoice_number: string }>;
    matches: Array<{ id: string }>;
    alerts: string[];
  }>;
};

type HaccpViewKey =
  | "reports"
  | "validation"
  | "temperature"
  | "labels"
  | "lifecycle"
  | "anomalies"
  | "cleaning";

type HaccpAnomalyRow = {
  id: string;
  happened_at: string;
  source: string;
  category: string;
  detail: string;
  severity: string;
};

export const HACCP_VIEWS: Array<{ key: HaccpViewKey; label: string; desc: string }> = [
  { key: "reports", label: "Report", desc: "Tabelle operative live con stampa secondaria" },
  { key: "validation", label: "Convalida", desc: "Documento, OCR e dati estratti da controllare" },
  { key: "temperature", label: "Temperature", desc: "Programmazione per settore e punto freddo" },
  { key: "labels", label: "Etichette", desc: "Profili e sessioni di stampa" },
  { key: "lifecycle", label: "Lifecycle", desc: "Lotti e riconciliazione Traccia" },
  { key: "anomalies", label: "Anomalie", desc: "Non conformita e scostamenti" },
  { key: "cleaning", label: "Pulizie", desc: "Programmazione e convalida" },
];

type Props = {
  siteId: string;
  isHaccpLoading: boolean;
  isHaccpSaving: boolean;
  haccpView: HaccpViewKey;
  setHaccpView: (value: HaccpViewKey) => void;
  haccpOcrQueue: HaccpOcrQueueItem[];
  haccpLifecycleEvents: HaccpLifecycleEvent[];
  haccpSchedules: HaccpScheduleItem[];
  haccpReconciliationOverview: HaccpReconciliationOverview | null;
  selectedHaccpQueueItem: HaccpOcrQueueItem | null;
  selectedHaccpDocumentUrl: string;
  selectedHaccpDocumentId: string;
  setSelectedHaccpDocumentId: (value: string) => void;
  haccpAnomalyRows: HaccpAnomalyRow[];
  haccpSectors: HaccpSectorItem[];
  haccpColdPoints: HaccpColdPointItem[];
  newHaccpTitle: string;
  setNewHaccpTitle: (value: string) => void;
  newHaccpArea: string;
  setNewHaccpArea: (value: string) => void;
  selectedHaccpSectorId: string;
  setSelectedHaccpSectorId: (value: string) => void;
  selectedHaccpColdPointId: string;
  setSelectedHaccpColdPointId: (value: string) => void;
  newHaccpSectorName: string;
  setNewHaccpSectorName: (value: string) => void;
  newHaccpColdPointName: string;
  setNewHaccpColdPointName: (value: string) => void;
  newHaccpColdPointEquipmentType: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  setNewHaccpColdPointEquipmentType: (value: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER") => void;
  newHaccpStartsAt: string;
  setNewHaccpStartsAt: (value: string) => void;
  newHaccpEndsAt: string;
  setNewHaccpEndsAt: (value: string) => void;
  loadHaccpData: () => void;
  onValidateHaccpOcr: (documentId: string, statusValue: "validated" | "rejected") => void;
  onSetHaccpScheduleStatus: (scheduleId: string, statusValue: "planned" | "done" | "skipped" | "cancelled") => void;
  onDeleteHaccpSchedule: (scheduleId: string) => void;
  onCreateHaccpSector: (e: FormEvent) => void | Promise<void>;
  onCreateHaccpColdPoint: (e: FormEvent) => void | Promise<void>;
  onCreateHaccpSchedule: (
    e: FormEvent,
    forcedTaskType?: "label_print" | "temperature_register" | "cleaning"
  ) => void | Promise<void>;
  t: (key: string) => string;
};

export function HaccpWorkspace(props: Props) {
  const {
    siteId,
    isHaccpLoading,
    isHaccpSaving,
    haccpView,
    setHaccpView,
    haccpOcrQueue,
    haccpLifecycleEvents,
    haccpSchedules,
    haccpReconciliationOverview,
    selectedHaccpQueueItem,
    selectedHaccpDocumentUrl,
    selectedHaccpDocumentId,
    setSelectedHaccpDocumentId,
    haccpAnomalyRows,
    haccpSectors,
    haccpColdPoints,
    newHaccpTitle,
    setNewHaccpTitle,
    newHaccpArea,
    setNewHaccpArea,
    selectedHaccpSectorId,
    setSelectedHaccpSectorId,
    selectedHaccpColdPointId,
    setSelectedHaccpColdPointId,
    newHaccpSectorName,
    setNewHaccpSectorName,
    newHaccpColdPointName,
    setNewHaccpColdPointName,
    newHaccpColdPointEquipmentType,
    setNewHaccpColdPointEquipmentType,
    newHaccpStartsAt,
    setNewHaccpStartsAt,
    newHaccpEndsAt,
    setNewHaccpEndsAt,
    loadHaccpData,
    onValidateHaccpOcr,
    onSetHaccpScheduleStatus,
    onDeleteHaccpSchedule,
    onCreateHaccpSector,
    onCreateHaccpColdPoint,
    onCreateHaccpSchedule,
    t,
  } = props;

  return (
    <div className="grid grid-single">
      <section className="panel">
        <div className="menu-space-header-row">
          <div>
            <h2>Area HACCP</h2>
            <p className="muted">Pilotage HACCP centralise dans CookOps, execution et tracabilite dans Traccia.</p>
          </div>
          <div className="entry-actions no-print">
            <button type="button" onClick={loadHaccpData} disabled={!siteId || isHaccpLoading}>
              {isHaccpLoading ? t("action.loading") : t("suppliers.refreshList")}
            </button>
          </div>
        </div>
        <div className="space-tabs no-print">
          {HACCP_VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={haccpView === item.key ? "space-tab-btn space-tab-btn--active" : "space-tab-btn"}
              onClick={() => setHaccpView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="muted">{HACCP_VIEWS.find((item) => item.key === haccpView)?.desc}</p>
        <p className="muted">Structure cible: site -&gt; secteur -&gt; point froid, avec planning saisi ici et execute dans Traccia.</p>
      </section>

      {!siteId ? (
        <section className="panel">
          <p className="muted">{t("validation.selectSite")}</p>
        </section>
      ) : haccpView === "reports" ? (
        <div className="grid">
          <section className="panel">
            <div className="doc-preview__head">
              <h2>1. Report estrazione dati</h2>
              <button type="button" className="no-print" onClick={() => window.print()}>Stampa</button>
            </div>
            <p className="muted">Vue operative live delle estrazioni OCR e dello stato di convalida.</p>
            {haccpOcrQueue.length === 0 ? (
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
                  </tr>
                </thead>
                <tbody>
                  {haccpOcrQueue.slice(0, 25).map((row) => (
                    <tr key={row.document_id}>
                      <td>{row.filename}</td>
                      <td>{row.document_type}</td>
                      <td>{String(row.extraction?.status || row.document_status || "-")}</td>
                      <td>{row.validation_status}</td>
                      <td>{row.extraction?.confidence || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="panel">
            <div className="doc-preview__head">
              <h2>1. Report temperature</h2>
              <button type="button" className="no-print" onClick={() => window.print()}>Stampa</button>
            </div>
            <p className="muted">Vue operative live di programmazione e stato dei rilevamenti temperature.</p>
            {haccpSchedules.filter((item) => item.task_type === "temperature_register").length === 0 ? (
              <p className="muted">Nessun rilevamento temperature programmato.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Titolo</th>
                    <th>Area</th>
                    <th>Inizio</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {haccpSchedules
                    .filter((item) => item.task_type === "temperature_register")
                    .slice(0, 25)
                    .map((item) => (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td>{item.cold_point_label || item.sector_label || item.area || "-"}</td>
                        <td>{String(item.starts_at).replace("T", " ").slice(0, 16)}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      ) : haccpView === "validation" ? (
        <div className="grid">
          <section className="panel">
            <h2>2. Visualizzazione foto e dati estratti</h2>
            <p className="muted">Seleziona il documento da convalidare e confronta file originale con OCR e dati letti.</p>
            {haccpOcrQueue.length === 0 ? (
              <p className="muted">Nessun documento disponibile per la convalida.</p>
            ) : (
              <>
                <label>Documento HACCP</label>
                <select value={selectedHaccpQueueItem?.document_id ?? selectedHaccpDocumentId} onChange={(e) => setSelectedHaccpDocumentId(e.target.value)}>
                  {haccpOcrQueue.map((row) => (
                    <option key={row.document_id} value={row.document_id}>
                      {row.filename} [{row.validation_status}]
                    </option>
                  ))}
                </select>
                <table>
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Tipo</th>
                      <th>Estrazione</th>
                      <th>Validazione</th>
                      <th>Azione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {haccpOcrQueue.slice(0, 12).map((row) => (
                      <tr key={row.document_id}>
                        <td>{row.filename}</td>
                        <td>{row.document_type}</td>
                        <td>{String(row.extraction?.status || row.document_status || "-")}</td>
                        <td>{row.validation_status}</td>
                        <td>
                          <div className="entry-actions">
                            <button type="button" onClick={() => setSelectedHaccpDocumentId(row.document_id)}>Apri</button>
                            <button type="button" onClick={() => onValidateHaccpOcr(row.document_id, "validated")}>Conferma</button>
                            <button type="button" className="warning-btn" onClick={() => onValidateHaccpOcr(row.document_id, "rejected")}>Rifiuta</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Documento e dati estratti</h2>
            {!selectedHaccpQueueItem ? (
              <p className="muted">Seleziona un documento.</p>
            ) : (
              <>
                <div className="doc-preview__grid">
                  <div><span>Documento</span><b>{selectedHaccpQueueItem.filename}</b></div>
                  <div><span>Confidenza</span><b>{selectedHaccpQueueItem.extraction?.confidence || "-"}</b></div>
                  <div><span>Stato</span><b>{selectedHaccpQueueItem.validation_status}</b></div>
                  <div><span>Tipo</span><b>{selectedHaccpQueueItem.document_type}</b></div>
                </div>
                {selectedHaccpDocumentUrl ? (
                  <div className="doc-frame-wrap">
                    <object className="doc-frame" data={selectedHaccpDocumentUrl} type="application/pdf">
                      <p className="muted">
                        Anteprima non disponibile.
                        {" "}
                        <a href={selectedHaccpDocumentUrl} target="_blank" rel="noreferrer">Apri in nuova scheda</a>
                      </p>
                    </object>
                    <a className="doc-open-link" href={selectedHaccpDocumentUrl} target="_blank" rel="noreferrer">
                      Apri documento
                    </a>
                  </div>
                ) : (
                  <p className="muted">File originale non disponibile nel repository documenti locali.</p>
                )}
                <h4>Dati estratti</h4>
                <pre>{JSON.stringify(selectedHaccpQueueItem.extraction?.normalized_payload ?? {}, null, 2)}</pre>
              </>
            )}
          </section>
        </div>
      ) : haccpView === "temperature" ? (
        <div className="grid">
          <section className="panel">
            <h2>3. Programmazione rilevamento temperature</h2>
            <p className="muted">Programmazione misure per settore e punto freddo, allineata alla logica operativa Traccia.</p>
            <h4>Settori</h4>
            <ul className="clean-list">
              {haccpSectors.map((item) => (
                <li key={item.id}>
                  <button type="button" className={selectedHaccpSectorId === item.id ? "space-tab-btn space-tab-btn--active" : "space-tab-btn"} onClick={() => setSelectedHaccpSectorId(item.id)}>
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => void onCreateHaccpSector(e)}>
              <label>Nuovo settore</label>
              <input value={newHaccpSectorName} onChange={(e) => setNewHaccpSectorName(e.target.value)} placeholder="Es. Restaurant" />
              <button type="submit" disabled={isHaccpSaving}>{isHaccpSaving ? t("action.loading") : "Aggiungi settore"}</button>
            </form>
            <h4>Punti freddo</h4>
            <ul className="clean-list">
              {haccpColdPoints.map((item) => (
                <li key={item.id}>
                  {item.name}{item.equipment_type ? ` (${item.equipment_type})` : ""}
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => void onCreateHaccpColdPoint(e)}>
              <label>Nuovo punto freddo</label>
              <input value={newHaccpColdPointName} onChange={(e) => setNewHaccpColdPointName(e.target.value)} placeholder="Es. Frigo 1" />
              <label>Tipo attrezzatura</label>
              <select
                value={newHaccpColdPointEquipmentType}
                onChange={(e) => setNewHaccpColdPointEquipmentType(e.target.value as "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER")}
              >
                <option value="FRIDGE">FRIDGE</option>
                <option value="FREEZER">FREEZER</option>
                <option value="COLD_ROOM">COLD_ROOM</option>
                <option value="OTHER">OTHER</option>
              </select>
              <button type="submit" disabled={isHaccpSaving || !selectedHaccpSectorId}>
                {isHaccpSaving ? t("action.loading") : "Aggiungi punto freddo"}
              </button>
            </form>
            <ul className="clean-list">
              {haccpSchedules
                .filter((item) => item.task_type === "temperature_register")
                .slice(0, 12)
                .map((item) => (
                  <li key={item.id}>
                    {item.title} - {item.sector_label || "-"} / {item.cold_point_label || "-"} - {String(item.starts_at).replace("T", " ").slice(0, 16)} [{item.status}]
                    <span className="entry-actions">
                      <button type="button" onClick={() => onSetHaccpScheduleStatus(item.id, "done")}>Completa</button>
                      <button type="button" className="danger-btn" onClick={() => onDeleteHaccpSchedule(item.id)}>Elimina</button>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Nuovo rilevamento temperature</h2>
            <form onSubmit={(e) => void onCreateHaccpSchedule(e, "temperature_register")}>
              <label>Titolo</label>
              <input value={newHaccpTitle} onChange={(e) => setNewHaccpTitle(e.target.value)} placeholder="Es. Controllo celle mattino" />
              <label>Settore</label>
              <select value={selectedHaccpSectorId} onChange={(e) => setSelectedHaccpSectorId(e.target.value)}>
                {haccpSectors.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <label>Punto freddo</label>
              <select value={selectedHaccpColdPointId} onChange={(e) => setSelectedHaccpColdPointId(e.target.value)}>
                {haccpColdPoints.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.equipment_type ? ` (${item.equipment_type})` : ""}
                  </option>
                ))}
              </select>
              <label>Inizio</label>
              <input type="datetime-local" value={newHaccpStartsAt} onChange={(e) => setNewHaccpStartsAt(e.target.value)} />
              <label>Fine</label>
              <input type="datetime-local" value={newHaccpEndsAt} onChange={(e) => setNewHaccpEndsAt(e.target.value)} />
              <button type="submit" disabled={isHaccpSaving}>{isHaccpSaving ? t("action.loading") : "Pianifica rilevamento"}</button>
            </form>
          </section>
        </div>
      ) : haccpView === "labels" ? (
        <div className="grid">
          <section className="panel">
            <h2>4. Creazione etichette prodotti</h2>
            <p className="muted">Profili etichette e sessioni di stampa pilotate dal web, con esecuzione lato Traccia.</p>
            <ul className="clean-list">
              {haccpSchedules
                .filter((item) => item.task_type === "label_print")
                .slice(0, 12)
                .map((item) => (
                  <li key={item.id}>
                    {item.title} - {item.sector_label || item.area || "-"} - {String(item.starts_at).replace("T", " ").slice(0, 16)} [{item.status}]
                    <span className="entry-actions">
                      <button type="button" onClick={() => onSetHaccpScheduleStatus(item.id, "done")}>Completa</button>
                      <button type="button" className="danger-btn" onClick={() => onDeleteHaccpSchedule(item.id)}>Elimina</button>
                    </span>
                  </li>
                ))}
            </ul>
            <h4>Documenti validati</h4>
            <ul className="clean-list">
              {haccpOcrQueue.filter((item) => item.validation_status === "validated").slice(0, 10).map((item) => (
                <li key={item.document_id}>{item.filename}</li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Nuova sessione etichette</h2>
            <form onSubmit={(e) => void onCreateHaccpSchedule(e, "label_print")}>
              <label>Titolo</label>
              <input value={newHaccpTitle} onChange={(e) => setNewHaccpTitle(e.target.value)} placeholder="Es. Etichette preparazioni gastronomia" />
              <label>Settore</label>
              <select value={selectedHaccpSectorId} onChange={(e) => setSelectedHaccpSectorId(e.target.value)}>
                {haccpSectors.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <label>Inizio</label>
              <input type="datetime-local" value={newHaccpStartsAt} onChange={(e) => setNewHaccpStartsAt(e.target.value)} />
              <label>Fine</label>
              <input type="datetime-local" value={newHaccpEndsAt} onChange={(e) => setNewHaccpEndsAt(e.target.value)} />
              <button type="submit" disabled={isHaccpSaving}>{isHaccpSaving ? t("action.loading") : "Pianifica stampa etichette"}</button>
            </form>
          </section>
        </div>
      ) : haccpView === "lifecycle" ? (
        <div className="grid">
          <section className="panel">
            <h2>5. Gestione lifecycle</h2>
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
            {!haccpReconciliationOverview ? (
              <p className="muted">Overview di riconciliazione non disponibile.</p>
            ) : (
              <>
                <div className="grid-3">
                  <article className="panel metric-card">
                    <strong>{haccpReconciliationOverview.summary.reconciled_events}</strong>
                    <span>Eventi riconciliati</span>
                  </article>
                  <article className="panel metric-card">
                    <strong>{haccpReconciliationOverview.summary.documents_found_events}</strong>
                    <span>Documenti trovati da verificare</span>
                  </article>
                  <article className="panel metric-card">
                    <strong>{haccpReconciliationOverview.summary.missing_events}</strong>
                    <span>Eventi senza documenti</span>
                  </article>
                </div>
                {haccpReconciliationOverview.results.length === 0 ? (
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
                      {haccpReconciliationOverview.results.slice(0, 20).map((row) => (
                        <tr key={row.event_id}>
                          <td>{String(row.happened_at).replace("T", " ").slice(0, 19)}</td>
                          <td>
                            <strong>{row.product_label}</strong>
                            <br />
                            <span className="muted">{row.qty_value} {row.qty_unit}{row.supplier_code ? ` | ${row.supplier_code}` : ""}</span>
                          </td>
                          <td>{row.lot?.internal_lot_code || row.lot?.supplier_lot_code || "-"}</td>
                          <td>{row.goods_receipts.map((item) => item.delivery_note_number).join(", ") || "-"}</td>
                          <td>{row.invoices.map((item) => item.invoice_number).join(", ") || "-"}</td>
                          <td>{row.matches.length}</td>
                          <td><span className={`status-chip status-chip--${row.reconcile_status}`}>{row.reconcile_status}</span></td>
                          <td>{row.alerts.join(" ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>
        </div>
      ) : haccpView === "anomalies" ? (
        <div className="grid">
          <section className="panel">
            <h2>6. Registro anomalie</h2>
            <p className="muted">Prodotti non conformi, scostamenti lifecycle, temperature e attivita non validate.</p>
            {haccpAnomalyRows.length === 0 ? (
              <p className="muted">Nessuna anomalia aperta.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Fonte</th>
                    <th>Categoria</th>
                    <th>Dettaglio</th>
                    <th>Priorita</th>
                  </tr>
                </thead>
                <tbody>
                  {haccpAnomalyRows.slice(0, 30).map((item) => (
                    <tr key={item.id}>
                      <td>{String(item.happened_at).replace("T", " ").slice(0, 19) || "-"}</td>
                      <td>{item.source}</td>
                      <td>{item.category}</td>
                      <td>{item.detail}</td>
                      <td>{item.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="panel">
            <h2>Fonti monitorate</h2>
            <ul className="clean-list">
              <li>Documenti OCR rifiutati o da rivedere.</li>
              <li>Eventi lifecycle senza collegamento a bolla o fattura.</li>
              <li>Rilevamenti temperature pianificati ma non chiusi.</li>
              <li>Pulizie e sessioni etichette in ritardo.</li>
            </ul>
          </section>
        </div>
      ) : (
        <div className="grid">
          <section className="panel">
            <h2>7. Programmazione pulizie</h2>
            <p className="muted">{t("haccp.cleaningDesc")}</p>
            <ul className="clean-list">
              {haccpSchedules
                .filter((item) => item.task_type === "cleaning")
                .slice(0, 12)
                .map((item) => (
                  <li key={item.id}>
                    {item.title} - {String(item.starts_at).replace("T", " ").slice(0, 16)} [{item.status}]
                    <span className="entry-actions">
                      <button type="button" onClick={() => onSetHaccpScheduleStatus(item.id, "done")}>Convalida esecuzione</button>
                      <button type="button" className="danger-btn" onClick={() => onDeleteHaccpSchedule(item.id)}>Elimina</button>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Nuovo piano pulizie</h2>
            <form onSubmit={(e) => void onCreateHaccpSchedule(e, "cleaning")}>
              <label>Titolo</label>
              <input value={newHaccpTitle} onChange={(e) => setNewHaccpTitle(e.target.value)} placeholder="Es. Sanificazione banco salumi" />
              <label>Area / attrezzatura</label>
              <input value={newHaccpArea} onChange={(e) => setNewHaccpArea(e.target.value)} placeholder="Es. Banco frigo esposizione" />
              <label>Inizio</label>
              <input type="datetime-local" value={newHaccpStartsAt} onChange={(e) => setNewHaccpStartsAt(e.target.value)} />
              <label>Fine</label>
              <input type="datetime-local" value={newHaccpEndsAt} onChange={(e) => setNewHaccpEndsAt(e.target.value)} />
              <button type="submit" disabled={isHaccpSaving}>{isHaccpSaving ? t("action.loading") : "Pianifica pulizia"}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
