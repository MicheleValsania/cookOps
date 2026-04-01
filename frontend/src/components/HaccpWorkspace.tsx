import { useState } from "react";
import type { FormEvent } from "react";

type HaccpOcrQueueItem = {
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

type HaccpLabelProfile = {
  id: string;
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
  external_code?: string | null;
  name: string;
};

type HaccpColdPointItem = {
  id: string;
  internal_id?: string | null;
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

type HaccpTemperatureReadingItem = {
  id: string;
  register_name?: string | null;
  cold_point_name?: string | null;
  sector_name?: string | null;
  device_type?: string | null;
  device_label?: string | null;
  reference_temperature_celsius?: string | null;
  temperature_celsius?: string | null;
  unit?: string | null;
  observed_at?: string | null;
  source?: string | null;
  confidence?: string | null;
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

export const HACCP_VIEWS: Array<{ key: HaccpViewKey; labelKey: string; descKey: string }> = [
  { key: "temperature", labelKey: "haccp.view.temperature", descKey: "haccp.view.temperatureDesc" },
  { key: "labels", labelKey: "haccp.view.labels", descKey: "haccp.view.labelsDesc" },
  { key: "cleaning", labelKey: "haccp.view.cleaning", descKey: "haccp.view.cleaningDesc" },
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
  haccpLabelProfiles: HaccpLabelProfile[];
  haccpLabelSessions: HaccpLabelSession[];
  haccpTemperatureReadings: HaccpTemperatureReadingItem[];
  haccpReconciliationOverview: HaccpReconciliationOverview | null;
  selectedHaccpQueueItem: HaccpOcrQueueItem | null;
  selectedHaccpDocumentUrl: string;
  selectedHaccpDocumentId: string;
  setSelectedHaccpDocumentId: (value: string) => void;
  haccpAnomalyRows: HaccpAnomalyRow[];
  haccpSectors: HaccpSectorItem[];
  haccpColdPoints: HaccpColdPointItem[];
  cleaningCategories: CleaningCategory[];
  cleaningProcedures: CleaningProcedure[];
  cleaningElements: CleaningElement[];
  cleaningPlans: CleaningPlan[];
  isCleaningLoading: boolean;
  newCleaningCategoryName: string;
  setNewCleaningCategoryName: (value: string) => void;
  newCleaningCategoryDescription: string;
  setNewCleaningCategoryDescription: (value: string) => void;
  newCleaningProcedureName: string;
  setNewCleaningProcedureName: (value: string) => void;
  newCleaningProcedureCategory: string;
  setNewCleaningProcedureCategory: (value: string) => void;
  newCleaningProcedureSteps: string;
  setNewCleaningProcedureSteps: (value: string) => void;
  newCleaningProcedureNotes: string;
  setNewCleaningProcedureNotes: (value: string) => void;
  newCleaningElementName: string;
  setNewCleaningElementName: (value: string) => void;
  newCleaningElementCategory: string;
  setNewCleaningElementCategory: (value: string) => void;
  newCleaningElementProcedure: string;
  setNewCleaningElementProcedure: (value: string) => void;
  newCleaningElementIsGlobal: boolean;
  setNewCleaningElementIsGlobal: (value: boolean) => void;
  newCleaningElementAreaIds: string[];
  setNewCleaningElementAreaIds: (value: string[]) => void;
  newCleaningCadence: string;
  setNewCleaningCadence: (value: string) => void;
  newCleaningDueTime: string;
  setNewCleaningDueTime: (value: string) => void;
  newCleaningStartDate: string;
  setNewCleaningStartDate: (value: string) => void;
  newCleaningPlanElementId: string;
  setNewCleaningPlanElementId: (value: string) => void;
  newCleaningPlanAreaIds: string[];
  setNewCleaningPlanAreaIds: (value: string[]) => void;
  editingCleaningPlanId: string;
  onCreateCleaningCategory: (e: FormEvent) => void | Promise<void>;
  onCreateCleaningProcedure: (e: FormEvent) => void | Promise<void>;
  onCreateCleaningElement: (e: FormEvent) => void | Promise<void>;
  onCreateCleaningPlan: (e: FormEvent) => void | Promise<void>;
  onCompleteCleaningSchedules: (scheduleIds: string[]) => void | Promise<void>;
  onEditCleaningPlan: (planId: string) => void;
  onToggleCleaningPlanActive: (planId: string, nextActive: boolean) => void | Promise<void>;
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
  editingHaccpSectorId: string;
  newHaccpColdPointName: string;
  setNewHaccpColdPointName: (value: string) => void;
  newHaccpColdPointEquipmentType: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  setNewHaccpColdPointEquipmentType: (value: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER") => void;
  editingHaccpColdPointId: string;
  newHaccpStartsAt: string;
  setNewHaccpStartsAt: (value: string) => void;
  newHaccpEndsAt: string;
  setNewHaccpEndsAt: (value: string) => void;
  newLabelProfileName: string;
  setNewLabelProfileName: (value: string) => void;
  newLabelProfileCategory: string;
  setNewLabelProfileCategory: (value: string) => void;
  editingLabelProfileId: string;
  newLabelTemplateType: HaccpLabelProfile["template_type"];
  setNewLabelTemplateType: (value: HaccpLabelProfile["template_type"]) => void;
  newLabelShelfLifeValue: string;
  setNewLabelShelfLifeValue: (value: string) => void;
  newLabelShelfLifeUnit: NonNullable<HaccpLabelProfile["shelf_life_unit"]>;
  setNewLabelShelfLifeUnit: (value: NonNullable<HaccpLabelProfile["shelf_life_unit"]>) => void;
  newLabelPackaging: string;
  setNewLabelPackaging: (value: string) => void;
  newLabelStorageHint: string;
  setNewLabelStorageHint: (value: string) => void;
  newLabelAllergensText: string;
  setNewLabelAllergensText: (value: string) => void;
  selectedLabelProfileId: string;
  setSelectedLabelProfileId: (value: string) => void;
  selectedLabelPlannedScheduleId: string;
  setSelectedLabelPlannedScheduleId: (value: string) => void;
  newLabelSessionQuantity: string;
  setNewLabelSessionQuantity: (value: string) => void;
  newLabelSessionSourceLotCode: string;
  setNewLabelSessionSourceLotCode: (value: string) => void;
  loadHaccpData: () => void;
  onExtractHaccpDocument: (documentId: string) => void | Promise<void>;
  onValidateHaccpOcr: (documentId: string, statusValue: "validated" | "rejected") => void;
  onSetHaccpScheduleStatus: (scheduleId: string, statusValue: "planned" | "done" | "skipped" | "cancelled") => void;
  onDeleteHaccpSchedule: (scheduleId: string) => void;
  onCreateHaccpSector: (e: FormEvent) => void | Promise<void>;
  onEditHaccpSector: (sectorId: string) => void;
  onDeleteHaccpSector: (sectorId: string) => void | Promise<void>;
  onCreateHaccpColdPoint: (e: FormEvent) => void | Promise<void>;
  onEditHaccpColdPoint: (pointId: string) => void;
  onDeleteHaccpColdPoint: (pointId: string) => void | Promise<void>;
  onCreateHaccpSchedule: (
    e: FormEvent,
    forcedTaskType?: "label_print" | "temperature_register" | "cleaning"
  ) => void | Promise<void>;
  onCreateHaccpLabelProfile: (e: FormEvent) => void | Promise<void>;
  onEditHaccpLabelProfile: (profileId: string) => void;
  onDeleteHaccpLabelProfile: (profileId: string) => void | Promise<void>;
  onCreateHaccpLabelSession: (e: FormEvent) => void | Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
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
    haccpLabelProfiles,
    haccpLabelSessions,
    haccpTemperatureReadings,
    haccpReconciliationOverview,
    selectedHaccpQueueItem,
    selectedHaccpDocumentUrl,
    selectedHaccpDocumentId,
    setSelectedHaccpDocumentId,
    haccpAnomalyRows,
    haccpSectors,
    haccpColdPoints,
    cleaningCategories,
    cleaningProcedures,
    cleaningElements,
    cleaningPlans,
    isCleaningLoading,
    newCleaningCategoryName,
    setNewCleaningCategoryName,
    newCleaningCategoryDescription,
    setNewCleaningCategoryDescription,
    newCleaningProcedureName,
    setNewCleaningProcedureName,
    newCleaningProcedureCategory,
    setNewCleaningProcedureCategory,
    newCleaningProcedureSteps,
    setNewCleaningProcedureSteps,
    newCleaningProcedureNotes,
    setNewCleaningProcedureNotes,
    newCleaningElementName,
    setNewCleaningElementName,
    newCleaningElementCategory,
    setNewCleaningElementCategory,
    newCleaningElementProcedure,
    setNewCleaningElementProcedure,
    newCleaningElementIsGlobal,
    setNewCleaningElementIsGlobal,
    newCleaningElementAreaIds,
    setNewCleaningElementAreaIds,
    newCleaningCadence,
    setNewCleaningCadence,
    newCleaningDueTime,
    setNewCleaningDueTime,
    newCleaningStartDate,
    setNewCleaningStartDate,
    newCleaningPlanElementId,
    setNewCleaningPlanElementId,
    newCleaningPlanAreaIds,
    setNewCleaningPlanAreaIds,
    editingCleaningPlanId,
    onCreateCleaningCategory,
    onCreateCleaningProcedure,
    onCreateCleaningElement,
    onCreateCleaningPlan,
    onCompleteCleaningSchedules,
    onEditCleaningPlan,
    onToggleCleaningPlanActive,
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
    editingHaccpSectorId,
    newHaccpColdPointName,
    setNewHaccpColdPointName,
    newHaccpColdPointEquipmentType,
    setNewHaccpColdPointEquipmentType,
    editingHaccpColdPointId,
    newHaccpStartsAt,
    setNewHaccpStartsAt,
    newHaccpEndsAt,
    setNewHaccpEndsAt,
    newLabelProfileName,
    setNewLabelProfileName,
    newLabelProfileCategory,
    setNewLabelProfileCategory,
    editingLabelProfileId,
    newLabelTemplateType,
    setNewLabelTemplateType,
    newLabelShelfLifeValue,
    setNewLabelShelfLifeValue,
    newLabelShelfLifeUnit,
    setNewLabelShelfLifeUnit,
    newLabelPackaging,
    setNewLabelPackaging,
    newLabelStorageHint,
    setNewLabelStorageHint,
    newLabelAllergensText,
    setNewLabelAllergensText,
    selectedLabelProfileId,
    setSelectedLabelProfileId,
    selectedLabelPlannedScheduleId,
    setSelectedLabelPlannedScheduleId,
    newLabelSessionQuantity,
    setNewLabelSessionQuantity,
    newLabelSessionSourceLotCode,
    setNewLabelSessionSourceLotCode,
    loadHaccpData,
    onExtractHaccpDocument,
    onValidateHaccpOcr,
    onSetHaccpScheduleStatus,
    onDeleteHaccpSchedule,
    onCreateHaccpSector,
    onEditHaccpSector,
    onDeleteHaccpSector,
    onCreateHaccpColdPoint,
    onEditHaccpColdPoint,
    onDeleteHaccpColdPoint,
    onCreateHaccpSchedule,
    onCreateHaccpLabelProfile,
    onEditHaccpLabelProfile,
    onDeleteHaccpLabelProfile,
    onCreateHaccpLabelSession,
    t,
  } = props;
  const [showCleaningFuture, setShowCleaningFuture] = useState(false);
  const now = new Date();
  const cleaningSchedules = haccpSchedules.filter((item) => item.task_type === "cleaning");
  const cleaningPlanned = cleaningSchedules.filter((item) => {
    if (item.status !== "planned") return false;
    if (showCleaningFuture) return true;
    const startsAt = new Date(item.starts_at);
    if (Number.isNaN(startsAt.getTime())) return false;
    return startsAt <= now;
  });
  const cleaningAfterUsePlans = cleaningPlans.filter((plan) => plan.cadence === "after_use");
  const availableAreas = haccpSectors;
  const cleaningBySector = cleaningPlanned.reduce<Record<string, HaccpScheduleItem[]>>((acc, item) => {
    const meta = (item.metadata || {}) as Record<string, unknown>;
    const areaLabel = String(item.sector_label || item.area || meta.cleaning_sector_name || "-");
    if (!acc[areaLabel]) acc[areaLabel] = [];
    acc[areaLabel].push(item);
    return acc;
  }, {});
  const cleaningSectorRows = Object.entries(cleaningBySector)
    .map(([areaLabel, items]) => ({ areaLabel, items }))
    .sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));
  const labelProfileGroups = haccpLabelProfiles.reduce<Record<string, HaccpLabelProfile[]>>((acc, item) => {
    const key = (item.category || "").trim() || "Senza categoria";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const labelProfileCategories = Object.keys(labelProfileGroups).sort((a, b) => a.localeCompare(b));
  const labelCategoryOptions = ["Carni", "Pesci", "Formaggi", "Salse", "Pasticceria", "Verdure", "Base", "Altro"];
  const ocrReportRows = haccpOcrQueue.map((row) => {
    const payload = (row.extraction?.normalized_payload ?? {}) as Record<string, unknown>;
    return {
      row,
      supplier: String(payload.supplier_name ?? payload.supplier ?? payload.vendor_name ?? "").trim() || "-",
      documentNumber: String(payload.document_number ?? payload.invoice_number ?? payload.receipt_number ?? payload.reference ?? "").trim() || "-",
      lotCode: String(payload.supplier_lot_code ?? payload.lot_code ?? payload.lot ?? "").trim() || "-",
      totalAmount: String(payload.total_amount ?? payload.total_ttc ?? payload.total ?? payload.amount_total ?? "").trim() || "-",
    };
  });

  return (
    <div className="grid grid-single">
      <section className="panel">
        <div className="menu-space-header-row">
          <div>
            <h2>Area HACCP</h2>
            <p className="muted">Programmazione HACCP centralizzata in CookOps, con esecuzione locale in Traccia.</p>
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
              {t(item.labelKey)}
            </button>
          ))}
        </div>
        <p className="muted">
          {(() => {
            const item = HACCP_VIEWS.find((entry) => entry.key === haccpView);
            return item ? t(item.descKey) : "";
          })()}
        </p>
        <p className="muted">La gestione foto, OCR e dati estratti e stata spostata nella sezione Tracciabilita.</p>
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
            <p className="muted">Vue operative live delle foto importate da Traccia, delle estrazioni centrali e del loro stato.</p>
            {haccpOcrQueue.length === 0 ? (
              <p className="muted">Nessun documento label_capture importato per il sito.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Fornitore</th>
                    <th>Numero</th>
                    <th>Lotto</th>
                    <th>Totale</th>
                    <th>Validazione</th>
                    <th>Confidenza</th>
                  </tr>
                </thead>
                <tbody>
                  {ocrReportRows.slice(0, 40).map(({ row, supplier, documentNumber, lotCode, totalAmount }) => (
                    <tr key={row.document_id}>
                      <td>
                        <strong>{row.filename}</strong>
                        <div className="muted">{row.document_type}</div>
                      </td>
                      <td>{supplier}</td>
                      <td>{documentNumber}</td>
                      <td>{lotCode}</td>
                      <td>{totalAmount}</td>
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
            <p className="muted">Vue operative live delle letture temperatura registrate in Traccia.</p>
            {haccpTemperatureReadings.length === 0 ? (
              <p className="muted">Nessuna lettura temperatura trovata per il sito.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Settore</th>
                    <th>Punto freddo</th>
                    <th>Temperatura</th>
                    <th>Riferimento</th>
                    <th>Rilevata il</th>
                    <th>Sorgente</th>
                  </tr>
                </thead>
                <tbody>
                  {haccpTemperatureReadings.slice(0, 40).map((item) => (
                      <tr key={item.id}>
                        <td>{item.sector_name || "-"}</td>
                        <td>{item.cold_point_name || item.register_name || "-"}</td>
                        <td>{item.temperature_celsius ?? "-"} {item.unit || "C"}</td>
                        <td>{item.reference_temperature_celsius ?? "-"}</td>
                        <td>{String(item.observed_at || "").replace("T", " ").slice(0, 16)}</td>
                        <td>{item.source || item.device_type || "-"}</td>
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
            <p className="muted">Seleziona il documento importato da Traccia, lancia OCR centrale e confronta file originale con dati estratti.</p>
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
                       <th>Stato review</th>
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
                             <button type="button" onClick={() => void onExtractHaccpDocument(row.document_id)}>Lancer OCR</button>
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
                  <span className="inline-icon-actions">
                    <button type="button" className="icon-action-btn" title="Modifica settore" aria-label="Modifica settore" onClick={() => onEditHaccpSector(item.id)}>✎</button>
                    <button type="button" className="icon-action-btn icon-action-btn--danger" title="Elimina settore" aria-label="Elimina settore" onClick={() => void onDeleteHaccpSector(item.id)}>✕</button>
                  </span>
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => void onCreateHaccpSector(e)}>
              <label>{editingHaccpSectorId ? "Modifica settore" : "Nuovo settore"}</label>
              <input value={newHaccpSectorName} onChange={(e) => setNewHaccpSectorName(e.target.value)} placeholder="Es. Restaurant" />
              <button type="submit" disabled={isHaccpSaving}>{isHaccpSaving ? t("action.loading") : editingHaccpSectorId ? "Salva settore" : "Aggiungi settore"}</button>
            </form>
            <h4>Punti freddo</h4>
            <ul className="clean-list">
              {haccpColdPoints.map((item) => (
                <li key={item.id}>
                  {item.name}{item.equipment_type ? ` (${item.equipment_type})` : ""}
                  <span className="inline-icon-actions">
                    <button type="button" className="icon-action-btn" title="Modifica punto freddo" aria-label="Modifica punto freddo" onClick={() => onEditHaccpColdPoint(item.id)}>✎</button>
                    <button type="button" className="icon-action-btn icon-action-btn--danger" title="Elimina punto freddo" aria-label="Elimina punto freddo" onClick={() => void onDeleteHaccpColdPoint(item.id)}>✕</button>
                  </span>
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => void onCreateHaccpColdPoint(e)}>
              <label>{editingHaccpColdPointId ? "Modifica punto freddo" : "Nuovo punto freddo"}</label>
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
                {isHaccpSaving ? t("action.loading") : editingHaccpColdPointId ? "Salva punto freddo" : "Aggiungi punto freddo"}
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
            <h2>4. Profili etichette</h2>
            <p className="muted">Configurazione centralizzata dei template etichetta, indipendente dalla singola stampa.</p>
            {labelProfileCategories.length === 0 ? (
              <p className="muted">Nessun profilo etichetta disponibile.</p>
            ) : (
              labelProfileCategories.map((category) => (
                <div key={category} style={{ marginBottom: 16 }}>
                  <h4>{category}</h4>
                  <ul className="clean-list">
                    {labelProfileGroups[category].map((item) => (
                      <li key={item.id}>
                        <strong>{item.name}</strong> - {item.template_type} - shelf life {item.shelf_life_value ?? "-"} {item.shelf_life_unit ?? ""}
                        {item.storage_hint ? ` - ${item.storage_hint}` : ""} [{item.is_active === false ? "inactive" : "active"}]
                        <span className="inline-icon-actions">
                          <button
                            type="button"
                            className="icon-action-btn"
                            title="Modifica"
                            aria-label="Modifica"
                            onClick={() => onEditHaccpLabelProfile(item.id)}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="icon-action-btn icon-action-btn--danger"
                            title="Elimina"
                            aria-label="Elimina"
                            onClick={() => void onDeleteHaccpLabelProfile(item.id)}
                          >
                            ✕
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            <h4>Documenti validati</h4>
            <ul className="clean-list">
              {haccpOcrQueue.filter((item) => item.validation_status === "validated").slice(0, 10).map((item) => (
                <li key={item.document_id}>{item.filename}</li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>{editingLabelProfileId ? "Modifica profilo etichetta" : "Nuovo profilo etichetta"}</h2>
            <form onSubmit={(e) => void onCreateHaccpLabelProfile(e)}>
              <label>Nome profilo</label>
              <input value={newLabelProfileName} onChange={(e) => setNewLabelProfileName(e.target.value)} placeholder="Es. Supreme poulet" />
              <label>Categoria</label>
              <select value={newLabelProfileCategory} onChange={(e) => setNewLabelProfileCategory(e.target.value)}>
                {labelCategoryOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <label>Template</label>
              <select value={newLabelTemplateType} onChange={(e) => setNewLabelTemplateType(e.target.value as HaccpLabelProfile["template_type"])}>
                <option value="PREPARATION">Preparation</option>
                <option value="RAW_MATERIAL">Raw material</option>
                <option value="TRANSFORMATION">Transformation</option>
              </select>
              <label>Shelf life</label>
              <div className="row-inline">
                <input value={newLabelShelfLifeValue} onChange={(e) => setNewLabelShelfLifeValue(e.target.value)} inputMode="numeric" placeholder="3" />
                <select value={newLabelShelfLifeUnit} onChange={(e) => setNewLabelShelfLifeUnit(e.target.value as NonNullable<HaccpLabelProfile["shelf_life_unit"]>)}>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                  <option value="months">months</option>
                </select>
              </div>
              <label>Packaging</label>
              <input value={newLabelPackaging} onChange={(e) => setNewLabelPackaging(e.target.value)} placeholder="Es. sotto vuoto" />
              <label>Storage hint</label>
              <input value={newLabelStorageHint} onChange={(e) => setNewLabelStorageHint(e.target.value)} placeholder="Es. 0/+3 C" />
              <label>Allergens text</label>
              <input value={newLabelAllergensText} onChange={(e) => setNewLabelAllergensText(e.target.value)} placeholder="Es. Poisson, lait" />
              <button type="submit" disabled={isHaccpSaving}>{isHaccpSaving ? t("action.loading") : editingLabelProfileId ? "Salva modifiche profilo" : "Crea profilo etichetta"}</button>
            </form>
          </section>
          <section className="panel">
            <h2>Sessioni di stampa</h2>
            <p className="muted">Pianificazione operativa delle stampe da eseguire in Traccia.</p>
            <ul className="clean-list">
              {haccpLabelSessions.slice(0, 12).map((item) => (
                <li key={item.id}>
                  {item.profile_name || item.profile_id} - qty {item.quantity}
                  {item.source_lot_code ? ` - lotto ${item.source_lot_code}` : ""}
                  {item.created_at ? ` - ${String(item.created_at).replace("T", " ").slice(0, 16)}` : ""}
                  [{item.status}]
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Nuova sessione etichette</h2>
            <form onSubmit={(e) => void onCreateHaccpLabelSession(e)}>
              <label>Profilo</label>
              <select value={selectedLabelProfileId} onChange={(e) => setSelectedLabelProfileId(e.target.value)}>
                {haccpLabelProfiles.map((item) => (
                  <option key={item.id} value={item.id}>{item.category ? `${item.category} - ` : ""}{item.name}</option>
                ))}
              </select>
              <label>Schedule collegato (opzionale)</label>
              <select value={selectedLabelPlannedScheduleId} onChange={(e) => setSelectedLabelPlannedScheduleId(e.target.value)}>
                <option value="">Nessuno</option>
                {haccpSchedules
                  .filter((item) => item.task_type === "label_print")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} - {String(item.starts_at).replace("T", " ").slice(0, 16)}
                    </option>
                  ))}
              </select>
              <label>Quantita</label>
              <input value={newLabelSessionQuantity} onChange={(e) => setNewLabelSessionQuantity(e.target.value)} inputMode="numeric" placeholder="12" />
              <label>Codice lotto sorgente</label>
              <input value={newLabelSessionSourceLotCode} onChange={(e) => setNewLabelSessionSourceLotCode(e.target.value)} placeholder="Es. LOT-20260312-01" />
              <button type="submit" disabled={isHaccpSaving}>{isHaccpSaving ? t("action.loading") : "Pianifica sessione etichette"}</button>
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
            <h2>{t("cleaning.setupTitle")}</h2>
            <p className="muted">{t("cleaning.setupDesc")}</p>
            <h4>{t("cleaning.areasTitle")}</h4>
            <ul className="clean-list">
              {availableAreas.length === 0 ? (
                <li className="muted">{t("cleaning.noAreas")}</li>
              ) : (
                availableAreas.map((area) => (
                  <li key={area.id}>{area.name}</li>
                ))
              )}
            </ul>
            <h4>{t("cleaning.elementsTitle")}</h4>
            <ul className="clean-list">
              {cleaningElements.length === 0 ? (
                <li className="muted">{t("cleaning.noElements")}</li>
              ) : (
                cleaningElements.map((element) => (
                  <li key={element.id}>
                    <strong>{element.name}</strong>
                    {element.category ? ` ? ${cleaningCategories.find((cat) => cat.id === element.category)?.name ?? ""}` : ""}
                    {element.procedure ? ` ? ${cleaningProcedures.find((proc) => proc.id === element.procedure)?.name ?? ""}` : ""}
                    <div className="muted">
                      {t("cleaning.elementAreas")}: {element.areas.map((area) => area.sector_name).join(", ") || "-"}
                    </div>
                  </li>
                ))
              )}
            </ul>
            <h4>{t("cleaning.newElementTitle")}</h4>
            <form onSubmit={(e) => void onCreateCleaningElement(e)}>
              <label>{t("cleaning.elementName")}</label>
              <input
                value={newCleaningElementName}
                onChange={(e) => setNewCleaningElementName(e.target.value)}
                placeholder={t("cleaning.elementNamePlaceholder")}
              />
              <label>{t("cleaning.elementCategory")}</label>
              <select value={newCleaningElementCategory} onChange={(e) => setNewCleaningElementCategory(e.target.value)}>
                <option value="">{t("cleaning.noneOption")}</option>
                {cleaningCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <label>{t("cleaning.elementProcedure")}</label>
              <select value={newCleaningElementProcedure} onChange={(e) => setNewCleaningElementProcedure(e.target.value)}>
                <option value="">{t("cleaning.noneOption")}</option>
                {cleaningProcedures.map((proc) => (
                  <option key={proc.id} value={proc.id}>{proc.name}</option>
                ))}
              </select>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={newCleaningElementIsGlobal}
                  onChange={(e) => setNewCleaningElementIsGlobal(e.target.checked)}
                />
                {t("cleaning.elementGlobal")}
              </label>
              <label>{t("cleaning.elementAreas")}</label>
              <div className="inline-options">
                {availableAreas.map((area) => {
                  const checked = newCleaningElementAreaIds.includes(area.id);
                  return (
                    <label key={area.id} className="inline-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? newCleaningElementAreaIds.filter((id) => id !== area.id)
                            : [...newCleaningElementAreaIds, area.id];
                          setNewCleaningElementAreaIds(next);
                        }}
                      />
                      {area.name}
                    </label>
                  );
                })}
              </div>
              <button type="submit" disabled={isHaccpSaving || isCleaningLoading}>{isHaccpSaving ? t("action.loading") : t("cleaning.createElement")}</button>
            </form>
            <h4>{t("cleaning.categoryTitle")}</h4>
            <form onSubmit={(e) => void onCreateCleaningCategory(e)}>
              <label>{t("cleaning.categoryName")}</label>
              <input
                value={newCleaningCategoryName}
                onChange={(e) => setNewCleaningCategoryName(e.target.value)}
                placeholder={t("cleaning.categoryNamePlaceholder")}
              />
              <label>{t("cleaning.categoryDesc")}</label>
              <input
                value={newCleaningCategoryDescription}
                onChange={(e) => setNewCleaningCategoryDescription(e.target.value)}
                placeholder={t("cleaning.categoryDescPlaceholder")}
              />
              <button type="submit" disabled={isHaccpSaving || isCleaningLoading}>{isHaccpSaving ? t("action.loading") : t("cleaning.createCategory")}</button>
            </form>
            <h4>{t("cleaning.procedureTitle")}</h4>
            <form onSubmit={(e) => void onCreateCleaningProcedure(e)}>
              <label>{t("cleaning.procedureName")}</label>
              <input
                value={newCleaningProcedureName}
                onChange={(e) => setNewCleaningProcedureName(e.target.value)}
                placeholder={t("cleaning.procedureNamePlaceholder")}
              />
              <label>{t("cleaning.procedureCategory")}</label>
              <select value={newCleaningProcedureCategory} onChange={(e) => setNewCleaningProcedureCategory(e.target.value)}>
                <option value="">{t("cleaning.noneOption")}</option>
                {cleaningCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <label>{t("cleaning.procedureSteps")}</label>
              <textarea value={newCleaningProcedureSteps} onChange={(e) => setNewCleaningProcedureSteps(e.target.value)} rows={4} placeholder={t("cleaning.procedureStepsPlaceholder")} />
              <label>{t("cleaning.procedureNotes")}</label>
              <input
                value={newCleaningProcedureNotes}
                onChange={(e) => setNewCleaningProcedureNotes(e.target.value)}
                placeholder={t("cleaning.procedureNotesPlaceholder")}
              />
              <button type="submit" disabled={isHaccpSaving || isCleaningLoading}>{isHaccpSaving ? t("action.loading") : t("cleaning.createProcedure")}</button>
            </form>
          </section>
          <section className="panel">
            <h2>{t("cleaning.planTitle")}</h2>
            <p className="muted">{t("cleaning.planDesc")}</p>
            <form onSubmit={(e) => void onCreateCleaningPlan(e)}>
              <label>{t("cleaning.planElement")}</label>
              <select value={newCleaningPlanElementId} onChange={(e) => setNewCleaningPlanElementId(e.target.value)}>
                <option value="">{t("cleaning.selectElement")}</option>
                {cleaningElements.map((element) => (
                  <option key={element.id} value={element.id}>{element.name}</option>
                ))}
              </select>
              <label>{t("cleaning.cadence")}</label>
              <select value={newCleaningCadence} onChange={(e) => setNewCleaningCadence(e.target.value)}>
                <option value="after_use">{t("cleaning.cadence.after_use")}</option>
                <option value="end_of_service">{t("cleaning.cadence.end_of_service")}</option>
                <option value="daily">{t("cleaning.cadence.daily")}</option>
                <option value="twice_weekly">{t("cleaning.cadence.twice_weekly")}</option>
                <option value="weekly">{t("cleaning.cadence.weekly")}</option>
                <option value="fortnightly">{t("cleaning.cadence.fortnightly")}</option>
                <option value="monthly">{t("cleaning.cadence.monthly")}</option>
                <option value="quarterly">{t("cleaning.cadence.quarterly")}</option>
                <option value="semiannual">{t("cleaning.cadence.semiannual")}</option>
                <option value="annual">{t("cleaning.cadence.annual")}</option>
              </select>
              <label>{t("cleaning.planAreas")}</label>
              <div className="inline-options">
                {availableAreas.map((area) => {
                  const checked = newCleaningPlanAreaIds.includes(area.id);
                  return (
                    <label key={area.id} className="inline-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? newCleaningPlanAreaIds.filter((id) => id !== area.id)
                            : [...newCleaningPlanAreaIds, area.id];
                          setNewCleaningPlanAreaIds(next);
                        }}
                      />
                      {area.name}
                    </label>
                  );
                })}
              </div>
              <label>{t("cleaning.planStartDate")}</label>
              <input type="date" value={newCleaningStartDate} onChange={(e) => setNewCleaningStartDate(e.target.value)} />
              <label>{t("cleaning.planDueTime")}</label>
              <input type="time" value={newCleaningDueTime} onChange={(e) => setNewCleaningDueTime(e.target.value)} />
              <button type="submit" disabled={isHaccpSaving || isCleaningLoading}>
                {isHaccpSaving ? t("action.loading") : editingCleaningPlanId ? t("cleaning.updatePlan") : t("cleaning.createPlan")}
              </button>
            </form>
            <h4>{t("cleaning.planListTitle")}</h4>
            {cleaningPlans.length === 0 ? (
              <p className="muted">{t("cleaning.noPlans")}</p>
            ) : (
              <ul className="clean-list">
                {cleaningPlans.map((plan) => {
                  const element = cleaningElements.find((item) => item.id === plan.element);
                  return (
                    <li key={plan.id}>
                      <strong>{element?.name || plan.element}</strong> - {plan.sector_name || "-"} · {t(`cleaning.cadence.${plan.cadence}`)} · {plan.due_time}
                      <div className="muted">
                        {plan.is_active ? t("cleaning.planActive") : t("cleaning.planInactive")}
                      </div>
                      <div className="entry-actions">
                        <button type="button" onClick={() => onEditCleaningPlan(plan.id)}>
                          {t("action.edit")}
                        </button>
                        <button type="button" onClick={() => void onToggleCleaningPlanActive(plan.id, !plan.is_active)}>
                          {plan.is_active ? t("cleaning.deactivatePlan") : t("cleaning.activatePlan")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <h4>{t("cleaning.groupValidateTitle")}</h4>
            <label className="inline-check" style={{ marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={showCleaningFuture}
                onChange={(event) => setShowCleaningFuture(event.target.checked)}
              />
              {t("cleaning.showFuture")}
            </label>
            {cleaningPlanned.length === 0 ? (
              <p className="muted">{t("cleaning.noPending")}</p>
            ) : (
              <>
                <div className="entry-actions" style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => void onCompleteCleaningSchedules(cleaningPlanned.map((item) => item.id))}
                  >
                    {t("cleaning.confirmSite")}
                  </button>
                </div>
                {cleaningSectorRows.map((group) => (
                  <div key={group.areaLabel} style={{ marginBottom: 16 }}>
                    <strong>{group.areaLabel}</strong>
                    <div className="muted">{t("cleaning.pendingCount", { count: group.items.length })}</div>
                    <button
                      type="button"
                      onClick={() => void onCompleteCleaningSchedules(group.items.map((item) => item.id))}
                    >
                      {t("cleaning.confirmSection")}
                    </button>
                  </div>
                ))}
              </>
            )}
            <h4>{t("cleaning.afterUseTitle")}</h4>
            {cleaningAfterUsePlans.length === 0 ? (
              <p className="muted">{t("cleaning.noAfterUse")}</p>
            ) : (
              <ul className="clean-list">
                {cleaningAfterUsePlans.map((plan) => {
                  const element = cleaningElements.find((item) => item.id === plan.element);
                  return (
                    <li key={plan.id}>
                      {element?.name || plan.element} ? {plan.sector_name || "-"}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
