import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBase, getDefaultApiKey, setDefaultApiKey } from "./api/client";

type DocumentItem = {
  id: string;
  filename: string;
  document_type: "goods_receipt" | "invoice";
  status: string;
  site: string;
};

function App() {
  const [apiKey, setApiKey] = useState(getDefaultApiKey());
  const [siteId, setSiteId] = useState("");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<"goods_receipt" | "invoice">("goods_receipt");
  const [selectedExtractionId, setSelectedExtractionId] = useState("");
  const [notice, setNotice] = useState("Pronto.");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState<"goods_receipt" | "invoice">("goods_receipt");

  const [normalizedPayload, setNormalizedPayload] = useState(`{\n  "site": "",\n  "supplier": "",\n  "delivery_note_number": "BL-001",\n  "received_at": "2026-02-27T10:00:00Z",\n  "metadata": {"source": "ocr"},\n  "lines": [{"raw_product_name": "Tomato", "qty_value": "3.000", "qty_unit": "kg"}]\n}`);

  const [recoInvoiceLine, setRecoInvoiceLine] = useState("");
  const [recoGoodsReceiptLine, setRecoGoodsReceiptLine] = useState("");

  const canUpload = useMemo(() => siteId.trim().length > 0 && uploadFile !== null, [siteId, uploadFile]);

  useEffect(() => {
    setDefaultApiKey(apiKey);
  }, [apiKey]);

  async function loadDocuments() {
    const res = await apiFetch("/integration/documents/");
    if (!res.ok) {
      setNotice(`Errore caricamento documenti: ${res.status}`);
      return;
    }
    const data = (await res.json()) as DocumentItem[];
    setDocuments(data);
    if (data.length > 0) {
      setSelectedDocId((prev) => prev || data[0].id);
      setSelectedDocType(data[0].document_type);
    }
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
    setNotice(`Documento caricato: ${body.id}`);
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
      setNotice("JSON normalized_payload non valido.");
      return;
    }

    const payload = {
      extractor_name: "manual-review",
      extractor_version: "0.1",
      status: "succeeded",
      raw_payload: { source: "manual" },
      normalized_payload: normalized,
      confidence: "99.00"
    };

    const res = await apiFetch(`/integration/documents/${selectedDocId}/extractions/`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(`Extraction KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setSelectedExtractionId(body.id);
    setNotice(`Extraction creata: ${body.id}`);
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
    setNotice(`Ingest OK: record ${body.id}`);
  }

  async function onCreateReconciliation(e: FormEvent) {
    e.preventDefault();
    if (!recoInvoiceLine || !recoGoodsReceiptLine) return;

    const payload = {
      invoice_line: recoInvoiceLine,
      goods_receipt_line: recoGoodsReceiptLine,
      status: "manual",
      note: "Linked from UI",
      metadata: { source: "frontend" }
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

  return (
    <div className="shell">
      <header className="topbar">
        <h1>CookOps Console</h1>
        <span>{getApiBase()}</span>
      </header>

      <section className="panel settings">
        <h2>Connessione</h2>
        <label>API Key</label>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <label>Site UUID</label>
        <input value={siteId} onChange={(e) => setSiteId(e.target.value)} placeholder="site UUID" />
        <button onClick={loadDocuments}>Carica documenti</button>
      </section>

      <div className="grid">
        <section className="panel">
          <h2>1) Upload documento</h2>
          <form onSubmit={onUploadDocument}>
            <label>Tipo documento</label>
            <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value as "goods_receipt" | "invoice")}>
              <option value="goods_receipt">goods_receipt</option>
              <option value="invoice">invoice</option>
            </select>
            <label>File</label>
            <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            <button disabled={!canUpload} type="submit">Upload</button>
          </form>
        </section>

        <section className="panel">
          <h2>2) Extraction</h2>
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
          <label>normalized_payload (JSON)</label>
          <textarea rows={10} value={normalizedPayload} onChange={(e) => setNormalizedPayload(e.target.value)} />
          <button onClick={onCreateExtraction}>Crea extraction</button>
        </section>

        <section className="panel">
          <h2>3) Ingest OCR</h2>
          <label>Extraction UUID</label>
          <input value={selectedExtractionId} onChange={(e) => setSelectedExtractionId(e.target.value)} />
          <label>Target</label>
          <select value={selectedDocType} onChange={(e) => setSelectedDocType(e.target.value as "goods_receipt" | "invoice")}>
            <option value="goods_receipt">goods_receipt</option>
            <option value="invoice">invoice</option>
          </select>
          <button onClick={onIngestExtraction}>Ingest</button>
        </section>

        <section className="panel">
          <h2>4) Riconciliazione manuale</h2>
          <form onSubmit={onCreateReconciliation}>
            <label>InvoiceLine UUID</label>
            <input value={recoInvoiceLine} onChange={(e) => setRecoInvoiceLine(e.target.value)} />
            <label>GoodsReceiptLine UUID</label>
            <input value={recoGoodsReceiptLine} onChange={(e) => setRecoGoodsReceiptLine(e.target.value)} />
            <button type="submit">Crea match</button>
          </form>
        </section>
      </div>

      <footer className="notice">{notice}</footer>
    </div>
  );
}

export default App;
