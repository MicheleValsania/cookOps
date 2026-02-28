import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBase, getDefaultApiKey, setDefaultApiKey } from "./api/client";

type NavKey =
  | "dashboard"
  | "inventario"
  | "acquisti"
  | "fornitori"
  | "ricette"
  | "comande"
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

type MenuSpaceType = "recipes" | "supplier_products" | "mixed";

type MenuEntry = {
  id: string;
  title: string;
  item_kind: "recipe" | "product";
  section: string;
  fiche_product_id?: string | null;
  expected_qty?: string;
  valid_from: string;
  valid_to: string;
};

type MenuSpace = {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  type: MenuSpaceType;
  sections: string[];
  entries: MenuEntry[];
};

const NAV_ITEMS: Array<{ key: NavKey; label: string; help: string }> = [
  { key: "dashboard", label: "Dashboard", help: "KPI e urgenze" },
  { key: "inventario", label: "Inventario", help: "Giacenze, lotti, alert" },
  { key: "acquisti", label: "Acquisti", help: "Bolle, fatture, ingest" },
  { key: "fornitori", label: "Fornitori e listini", help: "Anagrafica fornitori" },
  { key: "ricette", label: "Ricette e carte", help: "Carta fissa e menu giorno" },
  { key: "comande", label: "Comande", help: "Liste ingredienti e ordini" },
  { key: "riconciliazioni", label: "Riconciliazioni", help: "Bolle e fatture" },
  { key: "report", label: "Report", help: "Vendite POS e scostamenti" },
];

const MENU_SPACES_STORAGE_KEY = "cookops_menu_spaces_v1";
const MENU_ADVANCED_STORAGE_KEY = "cookops_menu_advanced_v1";

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
};

type MenuSuggestion = {
  key: string;
  value: string;
  fiche_product_id: string | null;
};

const DEFAULT_MENU_SPACES: MenuSpace[] = [
  {
    id: "carta-principale",
    label: "Carta principale",
    enabled: true,
    order: 1,
    type: "recipes",
    sections: ["Antipasti", "Pizze", "Burger"],
    entries: [],
  },
  {
    id: "menu-giorno",
    label: "Menu del giorno",
    enabled: true,
    order: 2,
    type: "mixed",
    sections: ["Speciali", "Fuori menu"],
    entries: [],
  },
  {
    id: "suggestioni",
    label: "Suggestioni",
    enabled: true,
    order: 3,
    type: "mixed",
    sections: ["Suggeriti oggi"],
    entries: [],
  },
];

function App() {
  const [nav, setNav] = useState<NavKey>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [apiKey, setApiKey] = useState(getDefaultApiKey());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteCode, setNewSiteCode] = useState("");
  const [siteToDelete, setSiteToDelete] = useState<SiteItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
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
  const [menuSpaces, setMenuSpaces] = useState<MenuSpace[]>(DEFAULT_MENU_SPACES);
  const [activeMenuSpaceId, setActiveMenuSpaceId] = useState(DEFAULT_MENU_SPACES[0].id);
  const [isMenuEditorOpen, setIsMenuEditorOpen] = useState(false);
  const [isMenuAdvancedMode, setIsMenuAdvancedMode] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState(DEFAULT_MENU_SPACES[0].id);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryTitle, setEntryTitle] = useState("");
  const [entryFicheProductId, setEntryFicheProductId] = useState<string | null>(null);
  const [entryKind, setEntryKind] = useState<"recipe" | "product">("recipe");
  const [entryExpectedQty, setEntryExpectedQty] = useState("1");
  const [entrySection, setEntrySection] = useState("");
  const [entryValidFrom, setEntryValidFrom] = useState("");
  const [entryValidTo, setEntryValidTo] = useState("");
  const [newSpaceLabel, setNewSpaceLabel] = useState("");
  const [newSpaceType, setNewSpaceType] = useState<MenuSpaceType>("recipes");
  const [newSectionName, setNewSectionName] = useState("");
  const [recipeTitleSuggestions, setRecipeTitleSuggestions] = useState<RecipeTitleSuggestion[]>(
    FICHE_RECIPE_SUGGESTIONS.map((title) => ({ fiche_product_id: "", title }))
  );
  const [supplierProductSuggestions, setSupplierProductSuggestions] = useState<string[]>([]);
  const [ingredientsView, setIngredientsView] = useState<"supplier" | "recipe">("supplier");
  const [ingredientsRows, setIngredientsRows] = useState<Array<Record<string, unknown>>>([]);
  const [ingredientWarnings, setIngredientWarnings] = useState<string[]>([]);
  const [isChecklistLoading, setIsChecklistLoading] = useState(false);

  const canUpload = useMemo(() => siteId.trim().length > 0 && uploadFile !== null, [siteId, uploadFile]);

  useEffect(() => {
    setDefaultApiKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    void loadSites();
  }, []);

  useEffect(() => {
    const storedSpaces = localStorage.getItem(MENU_SPACES_STORAGE_KEY);
    if (storedSpaces) {
      try {
        const parsed = JSON.parse(storedSpaces) as MenuSpace[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMenuSpaces(parsed);
          const firstEnabled = parsed
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
    localStorage.setItem(MENU_SPACES_STORAGE_KEY, JSON.stringify(menuSpaces));
  }, [menuSpaces]);

  useEffect(() => {
    localStorage.setItem(MENU_ADVANCED_STORAGE_KEY, isMenuAdvancedMode ? "1" : "0");
  }, [isMenuAdvancedMode]);

  useEffect(() => {
    if (!isMenuEditorOpen) return;
    if (entryKind === "product") return;
    const search = entryTitle.trim();
    void loadRecipeTitleSuggestions(search);
  }, [isMenuEditorOpen, entryKind, entryTitle]);

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
    const normalized = entryTitle.trim().toLowerCase();
    if (!normalized) {
      setEntryFicheProductId(null);
      return;
    }
    const match = recipeTitleSuggestions.find((item) => item.title.trim().toLowerCase() === normalized);
    if (match) {
      setEntryFicheProductId(match.fiche_product_id || null);
    }
  }, [isMenuEditorOpen, entryKind, entryTitle, recipeTitleSuggestions]);

  useEffect(() => {
    if (entryKind === "product") {
      setEntryFicheProductId(null);
    }
  }, [entryKind]);

  useEffect(() => {
    if (nav !== "ricette" || !siteId || !serviceDate) return;
    void loadServiceMenuEntries(siteId, serviceDate);
  }, [nav, siteId, serviceDate]);

  useEffect(() => {
    setIngredientsRows([]);
    setIngredientWarnings([]);
    if (!siteId) return;
    setMenuSpaces((prev) => prev.map((space) => ({ ...space, entries: [] })));
  }, [siteId]);

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

  async function loadRecipeTitleSuggestions(search = "") {
    try {
      const query = search ? `?q=${encodeURIComponent(search)}&limit=30` : "?limit=30";
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

  async function loadServiceMenuEntries(targetSiteId: string, targetServiceDate: string) {
    try {
      const res = await apiFetch(
        `/servizio/menu-entries/sync?site=${encodeURIComponent(targetSiteId)}&date=${encodeURIComponent(targetServiceDate)}`
      );
      const body = await res.json();
      if (!res.ok) {
        setNotice(`Caricamento carta KO: ${body.detail ?? JSON.stringify(body)}`);
        return;
      }
      const baseSpaces = (menuSpaces.length > 0 ? menuSpaces : DEFAULT_MENU_SPACES).map((space) => ({ ...space, entries: [] }));
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
          space.entries.push({
            id: item.id,
            title: item.title,
            item_kind: itemKind,
            section: item.section ?? "",
            fiche_product_id: item.fiche_product_id ?? null,
            expected_qty: item.expected_qty ?? "1",
            valid_from: validFrom,
            valid_to: validTo,
          });
        });
      const nextSpaces = Array.from(spaceMap.values()).sort((a, b) => a.order - b.order);
      setMenuSpaces(nextSpaces);
      ensureActiveSpaceStillValid(nextSpaces);
    } catch {
      setNotice("Errore caricamento carta da backend.");
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
    setEntryExpectedQty(entry?.expected_qty ?? "1");
    setEntrySection(entry?.section ?? space.sections[0] ?? "");
    setEntryValidFrom(entry?.valid_from ?? "");
    setEntryValidTo(entry?.valid_to ?? "");
    setEditingEntryId(entry?.id ?? null);
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
      setNotice("Inserisci il nome del nuovo spazio.");
      return;
    }
    const id = buildSiteCode(label).toLowerCase();
    if (!id) {
      setNotice("Nome spazio non valido.");
      return;
    }
    if (menuSpaces.some((space) => space.id === id)) {
      setNotice("Esiste già uno spazio con questo nome.");
      return;
    }
    const nextSpace: MenuSpace = {
      id,
      label,
      enabled: true,
      order: menuSpaces.length + 1,
      type: newSpaceType,
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
    setNotice(`Spazio creato: ${label}`);
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
      setNotice("Deve restare almeno uno spazio.");
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
      setNotice("Questa sezione esiste già.");
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
        const fieldError = body.code?.[0] ?? body.name?.[0];
        setNotice(`Creazione punto vendita KO: ${body.detail ?? fieldError ?? JSON.stringify(body)}`);
        return;
      }
      setNewSiteName("");
      setNewSiteCode("");
      setNotice(`Punto vendita creato: ${body.name}`);
      await loadSites();
    } catch {
      setNotice("Creazione punto vendita fallita per errore di connessione/API.");
    }
  }

  async function onDisableSite(targetSiteId: string) {
    if (!window.confirm("Disattivare questo punto vendita? Potrai riattivarlo in seguito.")) {
      return;
    }
    const res = await apiFetch(`/sites/${targetSiteId}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(`Disattivazione KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    if (siteId === targetSiteId) {
      setSiteId("");
    }
    setNotice("Punto vendita disattivato.");
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
      setNotice(`Eliminazione KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    if (siteId === siteToDelete.id) {
      setSiteId("");
    }
    setNotice(`Punto vendita eliminato definitivamente: ${siteToDelete.name}`);
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
      setNotice(`Riattivazione KO: ${body.detail ?? JSON.stringify(body)}`);
      return;
    }
    setNotice(`Punto vendita riattivato: ${body.name}`);
    if (!siteId) {
      setSiteId(body.id);
    }
    await loadSites();
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

  function onSubmitMenuEntry(e: FormEvent) {
    e.preventDefault();
    const title = entryTitle.trim();
    const qtyValue = Number.parseFloat(entryExpectedQty);
    if (!editingSpace || !title) {
      setNotice("Inserisci almeno il titolo.");
      return;
    }
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      setNotice("La quantita prevista deve essere maggiore di 0.");
      return;
    }
    const nextEntry: MenuEntry = {
      id: editingEntryId ?? crypto.randomUUID(),
      title,
      item_kind: entryKind,
      fiche_product_id: entryKind === "recipe" ? entryFicheProductId ?? null : null,
      expected_qty: qtyValue.toFixed(3),
      section: entrySection.trim(),
      valid_from: entryValidFrom,
      valid_to: entryValidTo,
    };
    setMenuSpaces((prev) => {
      const next = prev.map((space) => {
        if (space.id !== editingSpace.id) return space;
        if (editingEntryId) {
          return {
            ...space,
            entries: space.entries.map((entry) => (entry.id === editingEntryId ? nextEntry : entry)),
          };
        }
        return { ...space, entries: [...space.entries, nextEntry] };
      });
      void syncServiceMenuEntries(next, false);
      return next;
    });
    setIsMenuEditorOpen(false);
    setEditingEntryId(null);
    setEntryTitle("");
    setEntryFicheProductId(null);
    setEntryExpectedQty("1");
    setEntrySection("");
    setEntryValidFrom("");
    setEntryValidTo("");
    setNotice(editingEntryId ? "Elemento aggiornato." : "Elemento aggiunto.");
  }

  async function syncServiceMenuEntries(spacesToSync: MenuSpace[] = menuSpaces, withNotice = true) {
    if (!siteId) {
      if (withNotice) {
        setNotice("Seleziona un punto vendita prima di generare la checklist.");
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
          expected_qty: entry.expected_qty || "1",
          sort_order: index,
          is_active: true,
          metadata: {
            item_kind: entry.item_kind,
            valid_from: entry.valid_from || null,
            valid_to: entry.valid_to || null,
            source: "frontend",
          },
        }))
      );

    const res = await apiFetch("/servizio/menu-entries/sync", {
      method: "POST",
      body: JSON.stringify({
        site_id: siteId,
        service_date: serviceDate,
        entries,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      if (withNotice) {
        setNotice(`Sync carta KO: ${body.detail ?? JSON.stringify(body)}`);
      }
      return false;
    }
    if (withNotice) {
      setNotice("Carta salvata.");
    }
    return true;
  }

  async function loadIngredientsChecklist(view: "supplier" | "recipe") {
    if (!siteId) {
      setNotice("Seleziona un punto vendita.");
      return;
    }
    setIsChecklistLoading(true);
    try {
      const res = await apiFetch(
        `/servizio/ingredients?site=${encodeURIComponent(siteId)}&date=${encodeURIComponent(serviceDate)}&view=${view}`
      );
      const body = await res.json();
      if (!res.ok) {
        setNotice(`Checklist KO: ${body.detail ?? JSON.stringify(body)}`);
        setIngredientsRows([]);
        setIngredientWarnings([]);
        return;
      }
      setIngredientsRows(Array.isArray(body.rows) ? body.rows : []);
      setIngredientWarnings(Array.isArray(body.warnings) ? body.warnings : []);
      setNotice("Checklist ingredienti aggiornata.");
    } catch {
      setNotice("Errore di connessione durante il caricamento checklist.");
    } finally {
      setIsChecklistLoading(false);
    }
  }

  async function onGenerateChecklist() {
    const synced = await syncServiceMenuEntries();
    if (!synced) return;
    await loadIngredientsChecklist(ingredientsView);
  }

  const vociCartaTotali = useMemo(
    () => menuSpaces.reduce((acc, space) => acc + space.entries.length, 0),
    [menuSpaces]
  );

  const activeSite = sites.find((site) => site.id === siteId);
  const supplierOrderGroups = useMemo(() => {
    if (ingredientsView !== "supplier") return [];
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    ingredientsRows.forEach((row) => {
      const supplier = String(row.supplier ?? "Senza fornitore");
      if (!grouped.has(supplier)) {
        grouped.set(supplier, []);
      }
      grouped.get(supplier)!.push(row);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([supplier, rows]) => ({ supplier, rows }));
  }, [ingredientsRows, ingredientsView]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <button
            type="button"
            className="nav-menu-btn"
            onClick={() => setIsSidebarOpenMobile((prev) => !prev)}
            aria-label="Apri o chiudi menu"
          >
            ☰
          </button>
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

      <div className={`app-layout ${isSidebarCollapsed ? "app-layout--collapsed" : ""}`}>
        <aside className={`sidebar ${isSidebarCollapsed ? "sidebar--collapsed" : ""} ${isSidebarOpenMobile ? "sidebar--open-mobile" : ""}`}>
          <div className="sidebar-title">Menu operativo</div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            aria-label="Comprimi o espandi menu laterale"
          >
            {isSidebarCollapsed ? "»" : "«"}
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
              <span>{item.label}</span>
              <small>{item.help}</small>
            </button>
          ))}
        </aside>

        <main className="content">
          {nav !== "ricette" ? (
            <section className="panel page-head">
              <h2>{NAV_ITEMS.find((item) => item.key === nav)?.label}</h2>
              <p>
                Punto vendita: <strong>{activeSite?.name ?? "non selezionato"}</strong> | API: {getApiBase()}
              </p>
            </section>
          ) : null}

          {nav === "dashboard" && (
            <section className="grid grid-3">
              <article className="panel metric-card"><strong>{sites.filter((s) => s.is_active).length}</strong><span>Punti vendita attivi</span></article>
              <article className="panel metric-card"><strong>{documents.length}</strong><span>Documenti importati</span></article>
              <article className="panel metric-card"><strong>{vociCartaTotali}</strong><span>Voci carta attive</span></article>
              <article className="panel"><h3>Urgenze</h3><ul className="clean-list"><li>Controlla documenti in attesa ingest</li><li>Verifica lotti con DLC ravvicinata</li><li>Conferma import POS giornaliero</li></ul></article>
              <article className="panel"><h3>Food cost</h3><p className="muted">Confronto teorico vs consuntivo disponibile nel modulo Report.</p></article>
              <article className="panel"><h3>Stato riconciliazioni</h3><p className="muted">Usa la sezione Riconciliazioni per abbinare bolle e fatture.</p></article>
            </section>
          )}

          {nav === "ricette" && (
            <div className="grid grid-single">
              <section className="panel menu-space-panel">
                <h2>Spazi carta</h2>
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
                      <p className="muted">Tipo carta: {activeMenuSpace.type.replace("_", " ")}</p>
                      <button type="button" onClick={() => openMenuEditor(activeMenuSpace.id)}>Modifica</button>
                    </div>
                    <ul className="menu-entry-list">
                      {activeMenuSpace.entries.map((entry, idx) => (
                        <li key={entry.id} className="menu-entry-item">
                          <div>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.section || "Senza sezione"} | {entry.item_kind}
                              {entry.item_kind === "recipe" ? ` | Qta prevista ${entry.expected_qty ?? "1"}` : ""}
                              {entry.valid_from || entry.valid_to ? ` | ${entry.valid_from || "-"} -> ${entry.valid_to || "-"}` : ""}
                            </small>
                          </div>
                          <div className="entry-actions">
                            <button type="button" onClick={() => moveMenuEntry(activeMenuSpace.id, entry.id, "up")} disabled={idx === 0}>↑</button>
                            <button type="button" onClick={() => moveMenuEntry(activeMenuSpace.id, entry.id, "down")} disabled={idx === activeMenuSpace.entries.length - 1}>↓</button>
                            <button type="button" onClick={() => openMenuEditor(activeMenuSpace.id, entry)}>Sostituisci</button>
                            <button type="button" className="danger-btn" onClick={() => deleteMenuEntry(activeMenuSpace.id, entry.id)}>✕</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {activeMenuSpace.entries.length === 0 ? (
                      <p className="muted">Nessun elemento. Premi Modifica per aggiungere piatti, cocktail o prodotti.</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted">Nessuno spazio attivo. Attivalo nei Parametri avanzati.</p>
                )}
              </section>
            </div>
          )}

          {nav === "comande" && (
            <div className="grid grid-single">
              <section className="panel">
                <h2>Liste comande</h2>
                <p className="muted">
                  Genera il listino ingredienti per il punto vendita selezionato e il menu in corso.
                </p>
                <div className="grid grid-2">
                  <div>
                    <label>Data servizio</label>
                    <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
                  </div>
                  <div>
                    <label>Vista</label>
                    <select
                      value={ingredientsView}
                      onChange={(e) => {
                        const nextView = e.target.value as "supplier" | "recipe";
                        setIngredientsView(nextView);
                        if (ingredientsRows.length > 0) {
                          void loadIngredientsChecklist(nextView);
                        }
                      }}
                    >
                      <option value="supplier">Aggregata per fornitore</option>
                      <option value="recipe">Dettaglio per ricetta</option>
                    </select>
                  </div>
                </div>
                <div className="entry-actions">
                  <button type="button" onClick={onGenerateChecklist} disabled={isChecklistLoading}>
                    {isChecklistLoading ? "Caricamento..." : "Genera checklist"}
                  </button>
                  <button type="button" onClick={() => window.print()} disabled={ingredientsRows.length === 0}>
                    Stampa checklist
                  </button>
                  <button type="button" onClick={() => window.print()} disabled={ingredientsRows.length === 0}>
                    Genera PDF
                  </button>
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
                  <p className="muted">Nessun risultato ancora. Premi "Genera checklist".</p>
                ) : ingredientsView === "supplier" ? (
                  <div className="comande-sections">
                    <table>
                      <thead>
                        <tr>
                          <th>Fornitore</th>
                          <th>Ingrediente</th>
                          <th>Qta totale</th>
                          <th>UM</th>
                          <th>Rimanenza</th>
                          <th>Da ordinare</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ingredientsRows.map((row, idx) => (
                          <tr key={`${String(row.supplier)}-${String(row.ingredient)}-${idx}`}>
                            <td>{String(row.supplier ?? "-")}</td>
                            <td>{String(row.ingredient ?? "-")}</td>
                            <td>{String(row.qty_total ?? "-")}</td>
                            <td>{String(row.unit ?? "-")}</td>
                            <td>_____</td>
                            <td>_____</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="menu-entry-list">
                    {ingredientsRows.map((row, idx) => (
                      <article key={`${String(row.title)}-${idx}`} className="menu-entry-item">
                        <div>
                          <strong>{String(row.title ?? "-")}</strong>
                          <small>
                            {String(row.space ?? "-")} | {String(row.section ?? "Senza sezione")} | Qta prevista{" "}
                            {String(row.expected_qty ?? "1")}
                          </small>
                          <ul className="clean-list">
                            {Array.isArray(row.ingredients)
                              ? row.ingredients.map((ing, ingIdx) => {
                                  const item = ing as Record<string, unknown>;
                                  return (
                                    <li key={`${String(item.ingredient)}-${ingIdx}`}>
                                      {String(item.ingredient ?? "-")} - {String(item.qty_total ?? "-")}{" "}
                                      {String(item.unit ?? "-")} ({String(item.supplier ?? "Senza fornitore")})
                                    </li>
                                  );
                                })
                              : null}
                          </ul>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <section>
                  <h3>Ordini per fornitore</h3>
                  {ingredientsRows.length === 0 ? (
                    <p className="muted">Genera prima la checklist per visualizzare gli ordini.</p>
                  ) : ingredientsView !== "supplier" ? (
                    <div className="entry-actions">
                      <p className="muted">Questa vista richiede "Aggregata per fornitore".</p>
                      <button
                        type="button"
                        onClick={() => {
                          setIngredientsView("supplier");
                          void loadIngredientsChecklist("supplier");
                        }}
                      >
                        Passa a vista fornitore
                      </button>
                    </div>
                  ) : supplierOrderGroups.length === 0 ? (
                    <p className="muted">Nessun ordine per fornitore disponibile.</p>
                  ) : (
                    <div className="supplier-order-grid">
                      {supplierOrderGroups.map((group) => (
                        <article key={group.supplier} className="panel supplier-order-card">
                          <h4>{group.supplier}</h4>
                          <ul className="clean-list">
                            {group.rows.map((row, idx) => (
                              <li key={`${group.supplier}-${idx}`}>
                                {String(row.ingredient ?? "-")} - {String(row.qty_total ?? "-")} {String(row.unit ?? "-")}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
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
      {isSidebarOpenMobile ? <button type="button" className="sidebar-mobile-backdrop" onClick={() => setIsSidebarOpenMobile(false)} /> : null}

      {isSettingsOpen ? (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>
              Chiudi
            </button>
            <h2>Parametri</h2>
            <p className="params-note">{notice}</p>
            <label>Chiave API (X-API-Key)</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <button type="button" onClick={loadSites}>Aggiorna punti vendita</button>
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
                <ul className="site-list">
                  {sites.map((site) => (
                    <li key={site.id} className="site-row">
                      <div className="site-main">
                        <strong>{site.name}</strong>
                        <small>{site.code}</small>
                        <span className={`site-status ${site.is_active ? "site-status--active" : "site-status--inactive"}`}>
                          {site.is_active ? "attivo" : "disattivato"}
                        </span>
                      </div>
                      <div className="site-actions">
                        {site.is_active ? (
                          <button type="button" className="warning-btn" onClick={() => onDisableSite(site.id)}>
                            Disattiva
                          </button>
                        ) : (
                          <button type="button" className="success-btn" onClick={() => onReactivateSite(site.id)}>
                            Riattiva
                          </button>
                        )}
                        <button type="button" className="danger-btn" onClick={() => setSiteToDelete(site)}>
                          Elimina
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <hr />
            <h3>Parametri pagina Ricette e carte</h3>
            <label className="checkline">
              <input type="checkbox" checked={isMenuAdvancedMode} onChange={(e) => setIsMenuAdvancedMode(e.target.checked)} />
              Modalita avanzata spazi carta
            </label>
            {isMenuAdvancedMode ? (
              <div className="menu-advanced-grid">
                <section>
                  <h3>Spazi</h3>
                  {menuSpaces
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((space) => (
                      <div key={space.id} className="space-row">
                        <input value={space.label} onChange={(e) => updateMenuSpace(space.id, { label: e.target.value })} />
                        <select value={space.type} onChange={(e) => updateMenuSpace(space.id, { type: e.target.value as MenuSpaceType })}>
                          <option value="recipes">Ricette</option>
                          <option value="supplier_products">Prodotti fornitore</option>
                          <option value="mixed">Misto</option>
                        </select>
                        <label className="checkline">
                          <input type="checkbox" checked={space.enabled} onChange={(e) => updateMenuSpace(space.id, { enabled: e.target.checked })} />
                          Attivo
                        </label>
                        <button type="button" className="danger-btn" onClick={() => removeMenuSpace(space.id)}>Rimuovi</button>
                      </div>
                    ))}
                  <label>Nuovo spazio</label>
                  <input value={newSpaceLabel} onChange={(e) => setNewSpaceLabel(e.target.value)} placeholder="Es. Carta vini" />
                  <label>Tipo spazio</label>
                  <select value={newSpaceType} onChange={(e) => setNewSpaceType(e.target.value as MenuSpaceType)}>
                    <option value="recipes">Ricette</option>
                    <option value="supplier_products">Prodotti fornitore</option>
                    <option value="mixed">Misto</option>
                  </select>
                  <button type="button" onClick={addMenuSpace}>Aggiungi spazio</button>
                </section>
                <section>
                  <h3>Sezioni per spazio</h3>
                  <label>Spazio</label>
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
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                  <label>Nuova sezione</label>
                  <input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="Es. Antipasti" />
                  <button type="button" onClick={addMenuSection}>Aggiungi sezione</button>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isMenuEditorOpen && editingSpace ? (
        <div className="modal-backdrop" onClick={() => setIsMenuEditorOpen(false)}>
          <div className="modal-card modal-card--narrow" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setIsMenuEditorOpen(false)}>
              Chiudi
            </button>
            <h2>Modifica spazio: {editingSpace.label}</h2>
            <form onSubmit={onSubmitMenuEntry}>
              <label>Titolo</label>
              <input list="menu-entry-suggestions" value={entryTitle} onChange={(e) => setEntryTitle(e.target.value)} placeholder="Cerca ricetta/prodotto" />
              <datalist id="menu-entry-suggestions">
                {menuSuggestions.map((suggestion) => (
                  <option key={suggestion.key} value={suggestion.value} />
                ))}
              </datalist>
              <label>Tipo voce</label>
              <select value={entryKind} onChange={(e) => setEntryKind(e.target.value as "recipe" | "product")}>
                <option value="recipe">Ricetta</option>
                <option value="product">Prodotto</option>
              </select>
              {entryKind === "recipe" ? (
                <p className="muted">Ricetta collegata: {entryFicheProductId ?? "non mappata (titolo non trovato)"}</p>
              ) : null}
              <label>Quantita prevista</label>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={entryExpectedQty}
                onChange={(e) => setEntryExpectedQty(e.target.value)}
              />
              <label>Sezione</label>
              <select value={entrySection} onChange={(e) => setEntrySection(e.target.value)}>
                <option value="">Senza sezione</option>
                {editingSpace.sections.map((section) => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
              <div className="grid grid-2">
                <div>
                  <label>Valida dal</label>
                  <input type="date" value={entryValidFrom} onChange={(e) => setEntryValidFrom(e.target.value)} />
                </div>
                <div>
                  <label>Valida al</label>
                  <input type="date" value={entryValidTo} onChange={(e) => setEntryValidTo(e.target.value)} />
                </div>
              </div>
              <button type="submit">{editingEntryId ? "Salva sostituzione" : "Aggiungi voce"}</button>
            </form>
          </div>
        </div>
      ) : null}

      {siteToDelete ? (
        <div className="modal-backdrop" onClick={closeDeleteSiteDialog}>
          <div className="modal-card modal-card--narrow" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={closeDeleteSiteDialog}>
              Chiudi
            </button>
            <h2>Elimina punto vendita</h2>
            <p className="muted">
              Questa azione elimina definitivamente <strong>{siteToDelete.name}</strong>.
            </p>
            <p className="muted">Per confermare digita: <strong>ELIMINA DEFINITIVAMENTE</strong></p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="ELIMINA DEFINITIVAMENTE"
            />
            <button
              type="button"
              className="danger-btn"
              onClick={onHardDeleteSite}
              disabled={deleteConfirmText !== "ELIMINA DEFINITIVAMENTE"}
            >
              Elimina definitivamente
            </button>
          </div>
        </div>
      ) : null}

      <footer className="notice">{notice}</footer>
    </div>
  );
}

export default App;
