# CookOps — Documentation de développement (v0.1)

Dernière mise à jour : 2026-02-26

CookOps est le **hub opérationnel** (achats, stocks, réceptions BL, factures, ventes POS, rapprochements) qui s’intègre avec :
- **Fiches** (`fiches-recettes`) : authoring recettes + food-cost théorique.
- **Traccia** : lots, lifecycle, OCR étiquettes, alert DLC.

## 1) Principes d’architecture

### 1.1 Un owner par donnée
- **Fiches** : recettes, ingrédients, allergènes “recette”, profils stockage “base”, label hints.
- **CookOps** : catalogue fournisseurs (SKU/EAN), prix, achats, BL, factures, stocks réels, ventes POS, reporting.
- **Traccia** : acquisition (photo/OCR), création & mise à jour lots, événements lifecycle, impressions étiquettes.

### 1.2 Pas de DB partagée
Toutes les intégrations passent par **API versionnées** ou **enveloppes JSON versionnées**.

### 1.3 IDs stables
- UUID pour entités internes.
- `supplier_id` et `supplier_product_id` stables pour matching deterministic avec Fiches.
- `fiche_product_id` (UUID) identifie une recette/produit “vendable”.

### 1.4 Snapshot immuable
Quand CookOps consomme des fiches pour calculs/forecast, il stocke un **snapshot** (hash, version, date) pour audit.

---

## 2) Modules CookOps

### 2.1 Catalog
- Suppliers
- SupplierProducts
- PriceLists (optionnel au départ)
- Product metadata (EAN, SKU, UoM, allergènes “produit”, traceability flags)

### 2.2 Purchasing
- Purchase Orders (optionnel MVP)
- Goods Receipts (BL)
- Invoices
- Reconciliation (BL ↔ facture ↔ lots)

### 2.3 Inventory
- Lots
- Stock Movements
- Stock Snapshots (inventaires)
- Transformations (dérivés / reconditionnement)

### 2.4 POS
- Import ventes (CSV d’abord)
- Mapping articles POS ↔ recipe/product/category
- Sales events (agrégés journalier)

### 2.5 Accounting
- Exports (CSV) vers Sage/Pennylane
- Journal lines + TVA (phase 3/4)

### 2.6 Integration
- **Fiches ⇄ CookOps** : sync fournisseurs/produits + snapshots recettes
- **Traccia ⇄ CookOps** : lots, events, reconciliation

---

## 3) Flux d’intégration (officiel)

### 3.1 Fiches → CookOps (lecture)
Objectif : analyses, explosion besoins, forecast & calcul théorique vs réel.
- Source : API Fiches et/ou export JSON v1.1.
- CookOps stocke un snapshot :
  - `recipe_snapshot_hash`
  - `source_updated_at`

### 3.2 CookOps → Fiches (écriture ciblée)
Objectif : rendre le food-cost deterministic dans Fiches.
- CookOps pousse `suppliers` et `supplier_products` vers Fiches.
- Les ingrédients dans Fiches doivent contenir `supplierId` + `supplierProductId`.

### 3.3 Traccia ⇄ CookOps
Objectif : lots, lifecycle, alert & rapprochements.
- Traccia crée/maj lots + events dans CookOps.
- CookOps fournit : catalogue, BL/factures, règles et états de rapprochement.

---

## 4) MVP “simple mais scalable”

### 4.1 MVP1 (priorité)
1. Catalog (suppliers + supplier_products)
2. Import POS CSV (sales daily)
3. Mapping POS → recipe/product
4. Report marge théorique (Fiches) vs ventes (POS)

### 4.2 MVP2
1. BL (GoodsReceipt) + lignes
2. Lots basiques + mouvements
3. Inventaire manuel (snapshot)

### 4.3 MVP3
1. Reconciliation BL ↔ lots ↔ factures
2. Connecteur Traccia complet (events)

### 4.4 MVP4
1. Exports compta (Sage/Pennylane)

---

## 5) Règles de compatibilité / versioning

- API : `/api/v1/...`
- Enveloppes : `schema_version` obligatoire
- Breaking change : version majeure
- Ajout de champs : minor/patch

---

## 6) Conventions techniques

- Dates : ISO 8601 UTC (`...Z`)
- Quantités : `{ value: number, unit: "kg|g|l|ml|cl|pc" }`
- Idempotency : header `Idempotency-Key` sur endpoints bulk.
- Audit : toute importation crée un `integration_import_batch`.

---

## 7) Sécurité (à intégrer tôt, sans complexité)
- Token auth (API key par site) + RBAC minimal.
- Logs d’audit sur endpoints integration.
