import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBase, getDefaultApiKey, setDefaultApiKey } from "./api/client";
import { getInitialLang, LANG_STORAGE_KEY, t as translate, type Lang } from "./i18n";

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
  { key: "acquisti", labelKey: "nav.purchases", helpKey: "nav.purchasesHelp" },
  { key: "fornitori", labelKey: "nav.suppliers", helpKey: "nav.suppliersHelp" },
  { key: "ricette", labelKey: "nav.recipes", helpKey: "nav.recipesHelp" },
  { key: "comande", labelKey: "nav.orders", helpKey: "nav.ordersHelp" },
  { key: "riconciliazioni", labelKey: "nav.reconciliations", helpKey: "nav.reconciliationsHelp" },
  { key: "report", labelKey: "nav.reports", helpKey: "nav.reportsHelp" },
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

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function App() {
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
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
  const [notice, setNotice] = useState(() => translate(getInitialLang(), "notice.ready"));

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
  const [isFichesSyncing, setIsFichesSyncing] = useState(false);
  const [isFichesJsonImporting, setIsFichesJsonImporting] = useState(false);
  const [fichesJsonFile, setFichesJsonFile] = useState<File | null>(null);

  const [salesDate, setSalesDate] = useState(getTodayIsoDate());
  const [posSourceId, setPosSourceId] = useState("");
  const [salesLines, setSalesLines] = useState('[{"pos_name":"Pizza Margherita","qty":12}]');

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

  const canUpload = useMemo(() => siteId.trim().length > 0 && uploadFile !== null, [siteId, uploadFile]);
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const errorWithDetail = (labelKey: string, detail: unknown) =>
    t("notice.errorWithDetail", { label: t(labelKey), detail: String(detail) });

  useEffect(() => {
    setDefaultApiKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    void loadSites();
  }, []);

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
  }, [isMenuEditorOpen, entryKind, entryTitle, recipeTitleSuggestions, editingEntryId, entryExpectedQty, entrySection]);

  useEffect(() => {
    if (entryKind === "product") {
      setEntryFicheProductId(null);
    }
  }, [entryKind]);

  useEffect(() => {
    if (!siteId || !serviceDate) return;
    void loadServiceMenuEntries(siteId, serviceDate);
  }, [siteId, serviceDate]);

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

  async function loadServiceMenuEntries(targetSiteId: string, targetServiceDate: string, withNotice = false) {
    try {
      const res = await apiFetch(
        `/servizio/menu-entries/sync?site=${encodeURIComponent(targetSiteId)}&date=${encodeURIComponent(targetServiceDate)}`
      );
      const body = await res.json();
      if (!res.ok) {
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
      setMenuSpaces(nextSpaces);
      ensureActiveSpaceStillValid(nextSpaces);
      return true;
    } catch {
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
      if (!siteId && data.length > 0) {
        setSiteId(data[0].id);
      }
      if (data.length === 0) {
        setNotice(t("notice.noActiveSites"));
        return;
      }
      setNotice(t("notice.sitesLoaded", { count: data.length }));
    } catch {
      setNotice(t("error.apiConnectionSites"));
    }
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

  async function onSyncFichesSnapshots() {
    if (isFichesSyncing) return;
    setIsFichesSyncing(true);
    try {
      const idempotencyKey = `fiches-auto-${new Date().toISOString()}`;
      const res = await apiFetch("/integration/fiches/snapshots/import/", {
        method: "POST",
        body: JSON.stringify({ query: "", limit: 5000, idempotency_key: idempotencyKey }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(errorWithDetail("error.fichesSync", body.detail ?? JSON.stringify(body)));
        return;
      }
      setNotice(
        t("notice.fichesSynced", {
          read: body.total_read ?? 0,
          created: body.created ?? 0,
          unchanged: body.skipped_existing ?? 0,
        })
      );
      await loadRecipeTitleSuggestions("");
    } catch {
      setNotice(t("error.fichesSyncConnection"));
    } finally {
      setIsFichesSyncing(false);
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
        body: JSON.stringify({ envelope, idempotency_key: idempotencyKey }),
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

  async function loadDocuments() {
    const res = await apiFetch("/integration/documents/");
    const body = await res.json();
    if (!res.ok) {
      setNotice(errorWithDetail("error.documentsLoad", body.detail ?? JSON.stringify(body)));
      return;
    }
    const data = body as DocumentItem[];
    setDocuments(data);
    if (data.length > 0) {
      setSelectedDocId((prev) => prev || data[0].id);
      setSelectedDocType(data[0].document_type);
    }
    setNotice(t("notice.documentsLoaded", { count: data.length }));
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
      setNotice(errorWithDetail("error.documentUpload", body.detail ?? JSON.stringify(body)));
      return;
    }
    setNotice(t("notice.documentUploaded", { name: body.filename }));
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
      setNotice(errorWithDetail("error.ingest", body.detail ?? JSON.stringify(body)));
      return;
    }
    setNotice(t("notice.documentIngested", { id: body.id }));
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

  function onSubmitMenuEntry(e: FormEvent) {
    e.preventDefault();
    const title = entryTitle.trim();
    const qtyValue = Number.parseFloat(entryExpectedQty);
    if (!editingSpace || !title) {
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
    const matchedRecipe = recipeTitleSuggestions.find(
      (item) => item.title.trim().toLowerCase() === title.toLowerCase()
    );
    const inferredCategory = String(matchedRecipe?.category ?? "").trim();
    const nextEntry: MenuEntry = {
      id: editingEntryId ?? crypto.randomUUID(),
      title,
      item_kind: entryKind,
      fiche_product_id: entryKind === "recipe" ? entryFicheProductId ?? null : null,
      expected_qty: qtyValue.toFixed(3),
      section: entrySection.trim(),
      recipe_category: entryKind === "recipe" ? (inferredCategory || entrySection.trim()) : "",
      valid_from: entryValidFrom,
      valid_to: entryValidTo,
      schedule_mode: entryScheduleMode,
      weekdays: [...entryWeekdays].sort((a, b) => a - b),
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
    setEntryExpectedQty("0");
    setEntrySection("");
    setEntryValidFrom("");
    setEntryValidTo("");
    setEntryScheduleMode(editingSpace.schedule_mode ?? inferScheduleModeFromSpaceId(editingSpace.id));
    setEntryWeekdays([]);
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

      const allowedSpaces = new Set(selectedComandaSpaces);
      const allowedSections = new Set(selectedComandaSections);
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
        const passSpace = allowedSpaces.size === 0 || allowedSpaces.has(rowSpace);
        const passSection =
          allowedSections.size === 0 ||
          (ingredientSections.size === 0
            ? allowedSections.has(t("label.noSection"))
            : Array.from(ingredientSections).some((section) => allowedSections.has(section)));
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
    const loaded = await loadServiceMenuEntries(siteId, comandaDateFrom);
    if (!loaded) {
      setNotice(t("error.menuReloadBeforeChecklist"));
      return;
    }
    await loadIngredientsChecklist(ingredientsView);
  }

  const vociCartaTotali = useMemo(
    () => menuSpaces.reduce((acc, space) => acc + space.entries.length, 0),
    [menuSpaces]
  );

  const activeSite = sites.find((site) => site.id === siteId);
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
      const cells = [String(row.ingredient ?? "-"), String(row.supplier_code ?? "-")];
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
      const cells = [String(row.ingredient ?? "-"), String(row.supplier ?? "-"), String(row.supplier_code ?? "-")];
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
          String(item.supplier_code ?? "-"),
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

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <button
            type="button"
            className="nav-menu-btn"
            onClick={() => setIsSidebarOpenMobile((prev) => !prev)}
            aria-label={t("app.menuToggle")}
          >
            Menu
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
          <select className="nav-site-select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">{t("app.selectSite")}</option>
            {sites.filter((site) => site.is_active).map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <button type="button" className="nav-gear-btn" onClick={() => setIsSettingsOpen(true)} aria-label={t("app.settings")}>
            Cfg
          </button>
        </div>
      </header>

      <div className={`app-layout ${isSidebarCollapsed ? "app-layout--collapsed" : ""}`}>
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
        </aside>

        <main className="content">
          {nav !== "ricette" && nav !== "comande" ? (
            <section className="panel page-head">
              <h2>{t(NAV_ITEMS.find((item) => item.key === nav)?.labelKey ?? "")}</h2>
              <p>{t("app.pageHead", { site: activeSite?.name ?? t("app.siteNotSelected"), api: getApiBase() })}</p>
            </section>
          ) : null}

          {nav === "dashboard" && (
            <section className="grid grid-3">
              <article className="panel metric-card"><strong>{sites.filter((s) => s.is_active).length}</strong><span>{t("dashboard.activeSites")}</span></article>
              <article className="panel metric-card"><strong>{documents.length}</strong><span>{t("dashboard.importedDocs")}</span></article>
              <article className="panel metric-card"><strong>{vociCartaTotali}</strong><span>{t("dashboard.activeMenuItems")}</span></article>
              <article className="panel"><h3>{t("dashboard.urgencies")}</h3><ul className="clean-list"><li>{t("dashboard.urgency.docs")}</li><li>{t("dashboard.urgency.lots")}</li><li>{t("dashboard.urgency.pos")}</li></ul></article>
              <article className="panel"><h3>{t("dashboard.foodCost")}</h3><p className="muted">{t("dashboard.foodCostDesc")}</p></article>
              <article className="panel"><h3>{t("dashboard.recoStatus")}</h3><p className="muted">{t("dashboard.recoStatusDesc")}</p></article>
            </section>
          )}

          {nav === "ricette" && (
            <div className="grid grid-single">
              <section className="panel menu-space-panel">
                <h2>{t("recipes.menuSpaces")}</h2>
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
                              {entry.item_kind === "recipe" ? ` | ${t("recipes.targetPortions")} ${entry.expected_qty ?? "0"}` : ""}
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
                                {row.supplier_code ? ` [${String(row.supplier_code)}]` : ""}
                                {quantityMode === "with_qty" ? ` - ${String(row.qty_total ?? "-")} ${String(row.unit ?? "-")}` : ""}
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
                                {row.supplier_code ? ` [${String(row.supplier_code)}]` : ""}
                                {quantityMode === "with_qty" ? ` - ${String(row.qty_total ?? "-")} ${String(row.unit ?? "-")}` : ""}
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
                              {quantityMode === "with_qty" ? ` | ${t("recipes.targetPortions")} ${String(row.expected_qty ?? "0")}` : ""}
                            </p>
                            <ul className="clean-list">
                              {Array.isArray(row.ingredients)
                                ? row.ingredients.map((ing, ingIdx) => {
                                    const item = ing as Record<string, unknown>;
                                    return (
                                      <li key={`${group.title}-${rowIdx}-${ingIdx}`}>
                                        {String(item.ingredient ?? "-")} ({String(item.supplier ?? "-")})
                                        {item.supplier_code ? ` [${String(item.supplier_code)}]` : ""}
                                        {quantityMode === "with_qty"
                                          ? ` - ${String(item.qty_total ?? "-")} ${String(item.unit ?? "-")}`
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
                <h2>{t("suppliers.manage")}</h2>
                <form onSubmit={onCreateSupplier}>
                  <label>{t("suppliers.newSupplier")}</label>
                  <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder={t("suppliers.namePlaceholder")} />
                  <button type="submit">{t("suppliers.addSupplier")}</button>
                </form>
                <button type="button" onClick={loadSuppliers}>{t("suppliers.refreshList")}</button>
                <hr />
                <h3>Fiches-recettes</h3>
                <p className="muted">{t("suppliers.fichesSyncDesc")}</p>
                <button type="button" onClick={onSyncFichesSnapshots} disabled={isFichesSyncing}>
                  {isFichesSyncing ? t("suppliers.fichesSyncLoading") : t("suppliers.fichesSync")}
                </button>
                <p className="muted">{t("suppliers.fichesImportDesc")}</p>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => setFichesJsonFile(e.target.files?.[0] ?? null)}
                />
                <button type="button" onClick={onImportFichesJsonEnvelope} disabled={isFichesJsonImporting || !fichesJsonFile}>
                  {isFichesJsonImporting ? t("suppliers.fichesImportLoading") : t("suppliers.fichesImport")}
                </button>
              </section>
              <section className="panel">
                <h2>{t("suppliers.list")}</h2>
                <ul className="clean-list">
                  {suppliers.map((s) => (
                    <li key={s.id}>{s.name}{s.vat_number ? ` - ${t("suppliers.vat")} ${s.vat_number}` : ""}</li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {nav === "acquisti" && (
            <div className="grid">
              <section className="panel">
                <h2>{t("purchases.step1Title")}</h2>
                <form onSubmit={onUploadDocument}>
                  <label>{t("purchases.documentType")}</label>
                  <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value as "goods_receipt" | "invoice")}>
                    <option value="goods_receipt">{t("purchases.deliveryNote")}</option>
                    <option value="invoice">{t("purchases.invoice")}</option>
                  </select>
                  <label>{t("purchases.file")}</label>
                  <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                  <button disabled={!canUpload} type="submit">{t("purchases.uploadDocument")}</button>
                </form>
                <button type="button" onClick={loadDocuments}>{t("purchases.refreshDocuments")}</button>
              </section>

              <section className="panel">
                <h2>{t("purchases.step2Title")}</h2>
                <label>{t("purchases.document")}</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedDocId(id);
                    const doc = documents.find((d) => d.id === id);
                    if (doc) setSelectedDocType(doc.document_type);
                  }}
                >
                  <option value="">{t("action.select")}</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.filename} ({d.document_type})</option>
                  ))}
                </select>
                <label>{t("purchases.readDataJson")}</label>
                <textarea rows={10} value={normalizedPayload} onChange={(e) => setNormalizedPayload(e.target.value)} />
                <button type="button" onClick={onCreateExtraction}>{t("purchases.confirmOcrData")}</button>
              </section>

              <section className="panel">
                <h2>{t("purchases.step3Title")}</h2>
                <label>{t("purchases.extractionId")}</label>
                <input value={selectedExtractionId} onChange={(e) => setSelectedExtractionId(e.target.value)} />
                <label>{t("purchases.destination")}</label>
                <select value={selectedDocType} onChange={(e) => setSelectedDocType(e.target.value as "goods_receipt" | "invoice")}>
                  <option value="goods_receipt">{t("purchases.deliveryNotesPlural")}</option>
                  <option value="invoice">{t("purchases.invoicesPlural")}</option>
                </select>
                <button type="button" onClick={onIngestExtraction}>{t("purchases.registerDocument")}</button>
              </section>
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
              </section>
            </div>
          )}

          {nav === "inventario" && (
            <div className="grid">
              <section className="panel">
                <h2>{t("inventory.stockLots")}</h2>
                <ul className="clean-list">
                  <li>{t("inventory.item1")}</li>
                  <li>{t("inventory.item2")}</li>
                  <li>{t("inventory.item3")}</li>
                </ul>
              </section>
              <section className="panel">
                <h2>{t("inventory.alerts")}</h2>
                <p className="muted">{t("inventory.alertsDesc")}</p>
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
          <div className="modal-card modal-card--narrow" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setIsMenuEditorOpen(false)}>
              {t("action.close")}
            </button>
            <h2>{t("menuEditor.editSpace", { space: editingSpace.label })}</h2>
            <form onSubmit={onSubmitMenuEntry}>
              <label>{t("menuEditor.title")}</label>
              <input list="menu-entry-suggestions" value={entryTitle} onChange={(e) => setEntryTitle(e.target.value)} placeholder={t("menuEditor.titlePlaceholder")} />
              <datalist id="menu-entry-suggestions">
                {menuSuggestions.map((suggestion) => (
                  <option key={suggestion.key} value={suggestion.value} />
                ))}
              </datalist>
              <label>{t("menuEditor.entryType")}</label>
              <select value={entryKind} onChange={(e) => setEntryKind(e.target.value as "recipe" | "product")}>
                <option value="recipe">{t("menuEditor.entryTypeRecipe")}</option>
                <option value="product">{t("menuEditor.entryTypeProduct")}</option>
              </select>
              {entryKind === "recipe" ? (
                <p className="muted">
                  {t("menuEditor.linkedRecipe")}: {entryFicheProductId ?? t("menuEditor.notMapped")}
                  {" | "}
                  {t("menuEditor.fichePortions")}:{" "}
                  {(
                    recipeTitleSuggestions.find(
                      (item) => item.title.trim().toLowerCase() === entryTitle.trim().toLowerCase()
                    )?.portions ?? "-"
                  ).toString()}
                </p>
              ) : null}
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









