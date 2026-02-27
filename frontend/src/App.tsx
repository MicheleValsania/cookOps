import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBase, getDefaultApiKey, setDefaultApiKey } from "./api/client";

type NavKey =
  | "dashboard"
  | "inventario"
  | "acquisti"
  | "fornitori"
  | "ricette"
  | "riconciliazioni"
  | "report";

type DocumentItem = {
  id: string;
  filename: string;
  document_type: "goods_receipt" | "invoice";
  status: string;
  site: string;
};

type SupplierItem = {
  id: string;
  name: string;
  vat_number: string | null;
};

type SiteItem = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type ServicePlanRow = {
  id: string;
  ricetta: string;
  puntoVendita: string;
  settore: string;
  coperti: number;
  fornitore: string;
};

const NAV_ITEMS: Array<{ key: NavKey; label: string; help: string }> = [
  { key: "dashboard", label: "Dashboard", help: "KPI e urgenze" },
  { key: "inventario", label: "Inventario", help: "Giacenze, lotti, alert" },
  { key: "acquisti", label: "Acquisti", help: "Bolle, fatture, ingest" },
  { key: "fornitori", label: "Fornitori e listini", help: "Anagrafica fornitori" },
  { key: "ricette", label: "Ricette e carte", help: "Carta fissa e menu giorno" },
  { key: "riconciliazioni", label: "Riconciliazioni", help: "Bolle e fatture" },
  { key: "report", label: "Report", help: "Vendite POS e scostamenti" },
];

function App() {
  const [nav, setNav] = useState<NavKey>("dashboard");
  const [apiKey, setApiKey] = useState(getDefaultApiKey());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [includeInactiveSites, setIncludeInactiveSites] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteCode, setNewSiteCode] = useState("");
  const [notice, setNotice] = useState("Pronto.");

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<"goods_receipt" | "invoice">("goods_receipt");
  const [selectedExtractionId, setSelectedExtractionId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState<"goods_receipt" | "invoice">("goods_receipt");

  const [normalizedPayload, setNormalizedPayload] = useState(`{\n  "site": "",\n  "supplier": "",\n  "delivery_note_number": "BL-001",\n  "received_at": "2026-02-27T10:00:00Z",\n  "metadata": {"source": "ocr"},\n  "lines": [{"raw_product_name": "Tomato", "qty_value": "3.000", "qty_unit": "kg"}]\n}`);

  const [recoInvoiceLine, setRecoInvoiceLine] = useState("");
  const [recoGoodsReceiptLine, setRecoGoodsReceiptLine] = useState("");

  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [newSupplierName, setNewSupplierName] = useState("");

  const [salesDate, setSalesDate] = useState("2026-02-27");
  const [posSourceId, setPosSourceId] = useState("");
  const [salesLines, setSalesLines] = useState('[{"pos_name":"Pizza Margherita","qty":12}]');

  const [serviceDate, setServiceDate] = useState("2026-02-27");
  const [serviceRows, setServiceRows] = useState<ServicePlanRow[]>([
    {
      id: crypto.randomUUID(),
      ricetta: "Focaccia Bresaola",
      puntoVendita: "Sala principale",
      settore: "Panini",
      coperti: 30,
      fornitore: "AEM",
    },
  ]);

  const canUpload = useMemo(() => siteId.trim().length > 0 && uploadFile !== null, [siteId, uploadFile]);

  useEffect(() => {
    setDefaultApiKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    void loadSites(includeInactiveSites);
  }, [includeInactiveSites]);

  function buildSiteCode(raw: string) {
    return raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  async function loadSites(includeInactive = false) {
    try {
      const suffix = includeInactive ? "?include_inactive=1" : "";
      const res = await apiFetch(`/sites/${suffix}`);
      const body = await res.json();
      if (!res.ok) {
        setNotice(`Errore punti vendita: ${body.detail ?? JSON.stringify(body)}`);
        return;
      }
      const data = body as SiteItem[];
      setSites(data);
      if (!siteId && data.length > 0) {
        setSiteId(data[0].id);
      }
      if (data.length === 0) {
        setNotice("Nessun punto vendita attivo trovato. Apri Parametri per crearne uno.");
        return;
      }
      setNotice(`Punti vendita caricati: ${data.length}`);
    } catch {
      setNotice("Connessione API fallita su /sites. Controlla runserver, CORS e X-API-Key.");
    }
  }

  async function onCreateSite(e: FormEvent) {
    e.preventDefault();
    const name = newSiteName.trim();
    if (!name) {
      setNotice("Inserisci il nome del punto vendita.");
      return;
    }
    const code = buildSiteCode(newSiteCode.trim() || name);
    if (!code) {
      setNotice("Codice punto vendita non valido.");
      return;
    }

    try {
      const res = await apiFetch("/sites/", {
        method: "POST",
        body: JSON.stringify({ name, code }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(`Creazione punto vendita KO: ${body.detail ?? JSON.stringify(body)}`);
        return;
      }
      setNewSiteName("");
      setNewSiteCode("");
      setNotice(`Punto vendita creato: ${body.name}`);
      await loadSites(includeInactiveSites);
    } catch {
      setNotice("Creazione punto vendita fallita per errore di connessione/API.");
    }
  }

  async function onDisableSite(targetSiteId: string) {
    const res = await apiFetch(`/sites/${targetSiteId}/`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setNotice(`Disattivazione KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    if (siteId === targetSiteId) {
      setSiteId("");
    }
    setNotice("Punto vendita disattivato.");
    await loadSites(includeInactiveSites);
  }

  async function onReactivateSite(targetSiteId: string) {
    const res = await apiFetch(`/sites/${targetSiteId}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(`Riattivazione KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setNotice(`Punto vendita riattivato: ${body.name}`);
    if (!siteId) {
      setSiteId(body.id);
    }
    await loadSites(includeInactiveSites);
  }

  async function loadSuppliers() {
    const res = await apiFetch("/suppliers/");
    const body = await res.json();
    if (!res.ok) {
      setNotice(`Errore fornitori: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setSuppliers(body as SupplierItem[]);
    setNotice(`Fornitori aggiornati: ${(body as SupplierItem[]).length}`);
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
      setNotice(`Creazione fornitore KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setNewSupplierName("");
    setNotice(`Fornitore creato: ${body.name}`);
    await loadSuppliers();
  }

  async function loadDocuments() {
    const res = await apiFetch("/integration/documents/");
    const body = await res.json();
    if (!res.ok) {
      setNotice(`Errore caricamento documenti: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    const data = body as DocumentItem[];
    setDocuments(data);
    if (data.length > 0) {
      setSelectedDocId((prev) => prev || data[0].id);
      setSelectedDocType(data[0].document_type);
    }
    setNotice(`Documenti caricati: ${data.length}`);
  }

  async function onUploadDocument(e: FormEvent) {
    e.preventDefault();
    if (!canUpload || !uploadFile) return;

    const form = new FormData();
    form.append("site", siteId);
    form.append("document_type", uploadDocType);
    form.append("source", "upload");
    form.append("file", uploadFile);

    const res = await apiFetch("/integration/documents/", { method: "POST", body: form }, false);
    const body = await res.json();
    if (!res.ok) {
      setNotice(`Upload KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setNotice(`Documento caricato: ${body.filename}`);
    setUploadFile(null);
    await loadDocuments();
  }

  async function onCreateExtraction(e: FormEvent) {
    e.preventDefault();
    if (!selectedDocId) return;

    let normalized: unknown;
    try {
      normalized = JSON.parse(normalizedPayload);
    } catch {
      setNotice("JSON estrazione non valido.");
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
      setNotice(`Estrazione KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setSelectedExtractionId(body.id);
    setNotice(`Estrazione salvata: ${body.id}`);
  }

  async function onIngestExtraction(e: FormEvent) {
    e.preventDefault();
    if (!selectedDocId || !selectedExtractionId) return;

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
      setNotice(`Ingest KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setNotice(`Documento registrato a sistema: ${body.id}`);
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
      setNotice(`Riconciliazione KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setNotice(`Riconciliazione creata: ${body.id}`);
  }

  async function onImportPos(e: FormEvent) {
    e.preventDefault();
    let lines: unknown;
    try {
      lines = JSON.parse(salesLines);
    } catch {
      setNotice("JSON righe vendita non valido.");
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
      setNotice(`Import POS KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setNotice(`Vendite importate: ${body.id}`);
  }

  function addServiceRow() {
    setServiceRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ricetta: "",
        puntoVendita: "",
        settore: "",
        coperti: 0,
        fornitore: "",
      },
    ]);
  }

  function updateServiceRow(id: string, patch: Partial<ServicePlanRow>) {
    setServiceRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const ordiniPerFornitore = useMemo(() => {
    const map = new Map<string, number>();
    serviceRows.forEach((r) => {
      if (!r.fornitore) return;
      map.set(r.fornitore, (map.get(r.fornitore) ?? 0) + r.coperti);
    });
    return Array.from(map.entries()).map(([fornitore, coperti]) => ({ fornitore, coperti }));
  }, [serviceRows]);

  const ordiniPerSettore = useMemo(() => {
    const map = new Map<string, number>();
    serviceRows.forEach((r) => {
      if (!r.settore) return;
      map.set(r.settore, (map.get(r.settore) ?? 0) + r.coperti);
    });
    return Array.from(map.entries()).map(([settore, coperti]) => ({ settore, coperti }));
  }, [serviceRows]);

  const totaleCoperti = useMemo(
    () => serviceRows.reduce((sum, row) => sum + (Number.isFinite(row.coperti) ? row.coperti : 0), 0),
    [serviceRows]
  );

  const activeSite = sites.find((site) => site.id === siteId);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo-image" src="/chefside-logo.svg" alt="Chef Side" />
          <p className="brand-sub">CookOps - Operativita quotidiana ristorante</p>
        </div>
        <div className="header-actions">
          <select className="nav-site-select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Seleziona punto vendita</option>
            {sites.filter((site) => site.is_active).map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <button type="button" className="nav-gear-btn" onClick={() => setIsSettingsOpen(true)} aria-label="Parametri">
            ⚙
          </button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-title">Menu operativo</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`side-btn ${nav === item.key ? "side-btn--active" : ""}`}
              onClick={() => setNav(item.key)}
            >
              <span>{item.label}</span>
              <small>{item.help}</small>
            </button>
          ))}
        </aside>

        <main className="content">
          <section className="panel page-head">
            <h2>{NAV_ITEMS.find((item) => item.key === nav)?.label}</h2>
            <p>
              Punto vendita: <strong>{activeSite?.name ?? "non selezionato"}</strong> | API: {getApiBase()}
            </p>
          </section>

          {nav === "dashboard" && (
            <section className="grid grid-3">
              <article className="panel metric-card"><strong>{sites.filter((s) => s.is_active).length}</strong><span>Punti vendita attivi</span></article>
              <article className="panel metric-card"><strong>{documents.length}</strong><span>Documenti importati</span></article>
              <article className="panel metric-card"><strong>{totaleCoperti}</strong><span>Coperti pianificati</span></article>
              <article className="panel"><h3>Urgenze</h3><ul className="clean-list"><li>Controlla documenti in attesa ingest</li><li>Verifica lotti con DLC ravvicinata</li><li>Conferma import POS giornaliero</li></ul></article>
              <article className="panel"><h3>Food cost</h3><p className="muted">Confronto teorico vs consuntivo disponibile nel modulo Report.</p></article>
              <article className="panel"><h3>Stato riconciliazioni</h3><p className="muted">Usa la sezione Riconciliazioni per abbinare bolle e fatture.</p></article>
            </section>
          )}

          {nav === "ricette" && (
            <div className="grid">
              <section className="panel">
                <h2>Pianificazione carta e menu del giorno</h2>
                <label>Data servizio</label>
                <input value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} type="date" />
                {serviceRows.map((row) => (
                  <div className="row-grid" key={row.id}>
                    <input placeholder="Ricetta (nome fiches-recettes)" value={row.ricetta} onChange={(e) => updateServiceRow(row.id, { ricetta: e.target.value })} />
                    <input placeholder="Punto vendita" value={row.puntoVendita} onChange={(e) => updateServiceRow(row.id, { puntoVendita: e.target.value })} />
                    <input placeholder="Settore" value={row.settore} onChange={(e) => updateServiceRow(row.id, { settore: e.target.value })} />
                    <input type="number" placeholder="Coperti" value={row.coperti} onChange={(e) => updateServiceRow(row.id, { coperti: Number(e.target.value) })} />
                    <input placeholder="Fornitore" value={row.fornitore} onChange={(e) => updateServiceRow(row.id, { fornitore: e.target.value })} />
                  </div>
                ))}
                <button type="button" onClick={addServiceRow}>Aggiungi ricetta</button>
              </section>

              <section className="panel">
                <h2>Liste comande</h2>
                <h3>Per fornitore</h3>
                <ul className="clean-list">
                  {ordiniPerFornitore.map((r) => (
                    <li key={r.fornitore}>{r.fornitore}: {r.coperti} coperti previsti</li>
                  ))}
                </ul>
                <h3>Per settore</h3>
                <ul className="clean-list">
                  {ordiniPerSettore.map((r) => (
                    <li key={r.settore}>{r.settore}: {r.coperti} coperti previsti</li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {nav === "fornitori" && (
            <div className="grid">
              <section className="panel">
                <h2>Gestione fornitori</h2>
                <form onSubmit={onCreateSupplier}>
                  <label>Nuovo fornitore</label>
                  <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Nome fornitore" />
                  <button type="submit">Aggiungi fornitore</button>
                </form>
                <button type="button" onClick={loadSuppliers}>Aggiorna elenco</button>
              </section>
              <section className="panel">
                <h2>Elenco fornitori</h2>
                <ul className="clean-list">
                  {suppliers.map((s) => (
                    <li key={s.id}>{s.name}{s.vat_number ? ` - P.IVA ${s.vat_number}` : ""}</li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {nav === "acquisti" && (
            <div className="grid">
              <section className="panel">
                <h2>1) Carica bolla o fattura</h2>
                <form onSubmit={onUploadDocument}>
                  <label>Tipo documento</label>
                  <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value as "goods_receipt" | "invoice")}>
                    <option value="goods_receipt">Bolla di consegna</option>
                    <option value="invoice">Fattura</option>
                  </select>
                  <label>File</label>
                  <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                  <button disabled={!canUpload} type="submit">Carica documento</button>
                </form>
                <button type="button" onClick={loadDocuments}>Aggiorna documenti</button>
              </section>

              <section className="panel">
                <h2>2) Controlla estrazione OCR</h2>
                <label>Documento</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedDocId(id);
                    const doc = documents.find((d) => d.id === id);
                    if (doc) setSelectedDocType(doc.document_type);
                  }}
                >
                  <option value="">Seleziona</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.filename} ({d.document_type})</option>
                  ))}
                </select>
                <label>Dati letti (JSON)</label>
                <textarea rows={10} value={normalizedPayload} onChange={(e) => setNormalizedPayload(e.target.value)} />
                <button type="button" onClick={onCreateExtraction}>Conferma dati OCR</button>
              </section>

              <section className="panel">
                <h2>3) Registra in CookOps</h2>
                <label>ID estrazione</label>
                <input value={selectedExtractionId} onChange={(e) => setSelectedExtractionId(e.target.value)} />
                <label>Destinazione</label>
                <select value={selectedDocType} onChange={(e) => setSelectedDocType(e.target.value as "goods_receipt" | "invoice")}>
                  <option value="goods_receipt">Bolle</option>
                  <option value="invoice">Fatture</option>
                </select>
                <button type="button" onClick={onIngestExtraction}>Registra documento</button>
              </section>
            </div>
          )}

          {nav === "riconciliazioni" && (
            <div className="grid">
              <section className="panel">
                <h2>Riconciliazione manuale bolle/fatture</h2>
                <form onSubmit={onCreateReconciliation}>
                  <label>Riga fattura (UUID)</label>
                  <input value={recoInvoiceLine} onChange={(e) => setRecoInvoiceLine(e.target.value)} />
                  <label>Riga bolla (UUID)</label>
                  <input value={recoGoodsReceiptLine} onChange={(e) => setRecoGoodsReceiptLine(e.target.value)} />
                  <button type="submit">Collega fattura e bolla</button>
                </form>
              </section>
              <section className="panel">
                <h2>Stato</h2>
                <p className="muted">Step successivo: matching assistito con suggerimenti automatici e semafori.</p>
              </section>
            </div>
          )}

          {nav === "inventario" && (
            <div className="grid">
              <section className="panel">
                <h2>Giacenze e lotti</h2>
                <ul className="clean-list">
                  <li>Giacenze per punto vendita e settore</li>
                  <li>Scadenze DLC</li>
                  <li>Rettifiche manuali tracciate</li>
                </ul>
              </section>
              <section className="panel">
                <h2>Allerte</h2>
                <p className="muted">In arrivo: sottoscorta, DLC ravvicinate e lotti bloccati.</p>
              </section>
            </div>
          )}

          {nav === "report" && (
            <div className="grid">
              <section className="panel">
                <h2>Import giornaliero POS</h2>
                <form onSubmit={onImportPos}>
                  <label>Data vendite</label>
                  <input type="date" value={salesDate} onChange={(e) => setSalesDate(e.target.value)} />
                  <label>ID sorgente POS</label>
                  <input value={posSourceId} onChange={(e) => setPosSourceId(e.target.value)} placeholder="UUID sorgente POS" />
                  <label>Righe vendite (JSON)</label>
                  <textarea value={salesLines} onChange={(e) => setSalesLines(e.target.value)} rows={8} />
                  <button type="submit">Importa vendite</button>
                </form>
              </section>
              <section className="panel">
                <h2>Analisi</h2>
                <p className="muted">In arrivo: food cost teorico vs consuntivo, scostamenti e export CSV/PDF.</p>
              </section>
            </div>
          )}
        </main>
      </div>

      {isSettingsOpen ? (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>
              Chiudi
            </button>
            <h2>Parametri</h2>
            <label>Chiave API (X-API-Key)</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <label className="checkline">
              <input type="checkbox" checked={includeInactiveSites} onChange={(e) => setIncludeInactiveSites(e.target.checked)} />
              Mostra anche i punti vendita disattivati
            </label>
            <button type="button" onClick={() => loadSites(includeInactiveSites)}>Aggiorna punti vendita</button>
            <div className="site-admin-grid">
              <form onSubmit={onCreateSite}>
                <h3>Nuovo punto vendita</h3>
                <label>Nome</label>
                <input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder="Es. Paillotte Beach" />
                <label>Codice</label>
                <input value={newSiteCode} onChange={(e) => setNewSiteCode(e.target.value)} placeholder="Opzionale (auto dal nome)" />
                <button type="submit">Crea punto vendita</button>
              </form>
              <section>
                <h3>Punti vendita disponibili</h3>
                <ul className="clean-list">
                  {sites.map((site) => (
                    <li key={site.id}>
                      {site.name} ({site.code})
                      {!site.is_active ? " - disattivato" : ""}
                      {site.is_active ? (
                        <button type="button" className="danger-btn" onClick={() => onDisableSite(site.id)}>
                          Disattiva
                        </button>
                      ) : (
                        <button type="button" className="success-btn" onClick={() => onReactivateSite(site.id)}>
                          Riattiva
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="notice">{notice}</footer>
    </div>
  );
}

export default App;
