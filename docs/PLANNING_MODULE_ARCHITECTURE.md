# PLANNING MODULE — ARCHITECTURE SPECIFICATION v1.0

**Document fondativo per sviluppo Planning Module in CookOps**  
**Date:** 2026-03-20  
**Status:** Architecture Definition  
**Owner:** Chef Executive Les Tournels

---

## 📋 TABLE DES MATIÈRES

1. [Vision & Objectifs](#1-vision--objectifs)
2. [Sources de données](#2-sources-de-données)
3. [Architecture technique](#3-architecture-technique)
4. [Modèle de données](#4-modèle-de-données)
5. [Intégrations](#5-intégrations)
6. [Interface utilisateur](#6-interface-utilisateur)
7. [Flux opérationnels](#7-flux-opérationnels)
8. [Roadmap MVP](#8-roadmap-mvp)
9. [Évolutions futures](#9-évolutions-futures)

---

## 1. VISION & OBJECTIFS

### 1.1 Vision

Le Planning Module est le **système de gouvernance opérationnelle** qui transforme la planification théorique (Fiches + Carte) en exécution réelle (Mise en Place quotidienne).

**Position dans l'écosystème:**

```
FICHES              COOKOPS PLANNING           TRACCIA
(Recettes)    →     (Gouvernance)        →     (Exécution)
                           ↕
                        COMBO
                      (Staff)
```

### 1.2 Objectifs MVP

1. **Centraliser** toute la planification mise en place hebdomadaire
2. **Visualiser** calendrier prep avec contraintes staff
3. **Générer** checklist quotidiennes PDF/MD
4. **Tracker** statut préparations (planned/done)
5. **Intégrer** données staff Combo + recettes Fiches

### 1.3 Périmètre fonctionnel

**IN SCOPE (MVP):**
- CRUD Préparations (base de données master)
- Calendrier hebdomadaire visuel (grid)
- Import CSV staff Combo
- Lien manuel Preparation → Fiche(s)
- Export PDF/MD checklist quotidiennes
- Status tracking basic (planned/in_progress/done/skipped)
- Multi-site support (Tournels + JDP dès le départ)

**OUT OF SCOPE (Phase 2+):**
- Calcul automatique fabbisogno da menu planning
- Constraint validation automatique (staff/temps)
- Drag & drop interface
- Intégration Traccia auto-complete
- Machine learning suggestions
- Mobile app brigata

---

## 2. SOURCES DE DONNÉES

### 2.1 COMBO (Staff Planning)

**Source actuelle:**
- Export PDF hebdomadaire (voir annexe exemple JDP semaine 12)
- Email automatique au personnel

**Données nécessaires:**
| Donnée | Format actuel | Format cible CookOps |
|--------|---------------|---------------------|
| Nom employé | Michele VALSANIA | `staff_member.full_name` |
| Téléphone | +33 6 58 28 82 84 | `staff_member.phone` |
| Horaires jour | 09h - 17h (30 mn) | `shift.start_time`, `shift.end_time`, `shift.break_minutes` |
| Repos hebdo | Repos hebdomadaire: jour | `shift.day_off` |

**Intégration MVP:**

```typescript
// Option 1: Import CSV manuel hebdomadaire
POST /api/v1/planning/staff/import-combo-csv
Content-Type: multipart/form-data
{
  file: combo_semaine_12.csv,
  site_id: "uuid-tournels",
  week_start: "2026-03-16"
}

// Structure CSV attendue:
// full_name,phone,monday,tuesday,wednesday,thursday,friday,saturday,sunday
// "Michele VALSANIA","+33658288284","09:00-17:00","09:00-17:00","09:00-17:00","09:00-17:00","09:00-17:00","OFF","OFF"
```

**Évolution future:**
- Vérifier si Combo expose API REST
- Si oui: sync automatique hebdomadaire
- Sinon: garder import CSV manuel

**Données dérivées:**

```typescript
// Calcul capacité productive journalière
StaffCapacity {
  site_id: UUID
  date: date
  total_staff: number         // 9 personnes
  total_hours: number         // 9 × 7.5h = 67.5h
  available_hours: number     // 67.5h - breaks - meetings
  skill_distribution: {
    chef_de_partie: 2,
    commis: 5,
    patissier: 1,
    plongeur: 1
  }
}
```

**Rôles et sections brigade:**

| Nom | Rôle principal | Section principale | Section secondaire (remplacement) |
|-----|---------------|-------------------|----------------------------------|
| Michele VALSANIA | Chef Executive | Supervision | Toutes |
| Leo ORTEGA | Chef de Partie | Pâtes & Risotto | Viandes & Poissons |
| Benjamin CAPET | Chef de Partie | Viandes & Poissons | Garde Manger |
| Mathieu CATONNET | Commis | Garde Manger | Pâtes |
| Mariana MATEICKOVA | Commis | Snack Bar | - |
| Jérôme HERKT | Commis | Pâtisserie | - |
| Nino MONTENAT | Commis | Prep générales | - |
| Luka TAORMINA | Commis | Prep générales | - |
| Ludovic LECOSTOËC | Plongeur | Plonge | - |

**Modèle data rôles:**

```typescript
StaffMember {
  id: UUID
  full_name: string
  phone: string
  role: "CHEF_EXECUTIVE" | "CHEF_DE_PARTIE" | "COMMIS" | "PATISSIER" | "PLONGEUR"
  main_section: "SUPERVISION" | "PATES_RISOTTO" | "VIANDES_POISSONS" | "GARDE_MANGER" | "SNACK" | "PATISSERIE" | "PREP_GENERALES" | "PLONGE"
  backup_section?: string  // section secondaire pour remplacements
  site_id: UUID
  active: boolean
}
```

---

### 2.2 FICHES-RECETTES (Recettes)

**Source:**
- API Fiches existante
- Export JSON envelope v1.1

**Données nécessaires:**

| Donnée Fiches | Usage Planning | Exemple |
|--------------|---------------|---------|
| `fiche_id` (UUID) | Link Preparation → Recipe | `abc-123...` |
| `title` | Affichage prep liée | "Linguine Bolognese" |
| `ingredients[]` | Calcul fabbisogno (Phase 2) | `[{name: "Bolognaise", qty: 180g}]` |
| `portions` | Scaling calcul (Phase 2) | `1` |
| `cooking_time` | Contrainte planning | "15 min" |
| `prep_time` | Contrainte planning | "10 min" |
| `storage_profile` | Validation DLC | `{temp: "0-3°C", dlc: 3}` |

**Intégration MVP:**

```typescript
// Read-only: CookOps lit snapshots Fiches
GET /api/products  // API Fiches existante

// CookOps stocke snapshot local pour audit
RecipeSnapshot {
  fiche_id: UUID           // ID stable Fiches
  title: string
  snapshot_hash: string    // SHA-256 du payload complet
  snapshot_version: string // version Fiches au moment capture
  snapshot_date: timestamp
  snapshot_data: JSONB     // payload complet Fiches (audit)
}
```

**Pas d'écriture Fiches depuis Planning** (séparation claire des responsabilités).

---

### 2.3 CARTE & MENU (Menu Planning)

**Responsabilité:** CookOps (section "Carte et Recettes")

**Données structure:**

```typescript
MenuPlanning {
  id: UUID
  site_id: UUID              // Les Tournels | JDP
  service_date: date         // 2026-03-20
  service_type: "RESTAURANT" | "SNACK" | "BOTH"
  status: "DRAFT" | "CONFIRMED" | "ARCHIVED"
  
  planned_dishes: [
    {
      fiche_id: UUID         // link vers Fiches
      dish_name: string      // cache pour affichage
      category: string       // entrée, plat, dessert
      expected_portions: number  // 40 portions
      menu_type: "CARTE" | "MENU_DU_JOUR" | "SUGGESTION"
      notes?: string
    }
  ]
  
  expected_covers: {
    lunch: number           // 120 couverts
    dinner: number          // 80 couverts
    total: number           // 200
  }
  
  created_at: timestamp
  updated_at: timestamp
  created_by: UUID          // user_id
}
```

**Flux de données:**

```
1. Chef confirme menu semaine dans CookOps "Carte et Recettes"
   → MenuPlanning entries créées

2. Planning Module lit MenuPlanning
   → Affiche "Couverts prévus" dans header planning
   → Phase 2: calcule fabbisogno automatique prep
```

**MVP:** Affichage read-only couverts prévus  
**Phase 2:** Calcul automatique suggestions prep basé sur menu

---

### 2.4 INVENTAIRE & VENTES (Future)

**Out of scope MVP**

Préparation architecture pour Phase 3:

```typescript
// Future endpoint
GET /api/v1/inventory/stock-level?product_id=uuid&site_id=uuid
→ { available_qty: 8, unit: "kg", location: "congélateur" }

// Future endpoint  
GET /api/v1/pos/sales-history?fiche_id=uuid&period=last_30_days
→ { avg_daily: 12, trend: "+15%", peak_day: "saturday" }
```

**Usage futur:**
- Planning suggère prep basé sur stock réel
- "Bolognaise: 8kg dispo → suggère prep 7kg (atteindre 15kg stock)"
- Machine learning sur ventes passées

---

## 3. ARCHITECTURE TECHNIQUE

### 3.1 Position dans CookOps

```
cookops/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── catalog/
│   │   │   ├── purchasing/
│   │   │   ├── inventory/
│   │   │   ├── pos/
│   │   │   ├── integration/
│   │   │   └── planning/         ← NOUVEAU MODULE
│   │   │       ├── models/
│   │   │       │   ├── preparation.model.ts
│   │   │       │   ├── preparation-schedule.model.ts
│   │   │       │   ├── preparation-category.model.ts
│   │   │       │   ├── staff-member.model.ts
│   │   │       │   ├── staff-shift.model.ts
│   │   │       │   └── recipe-snapshot.model.ts
│   │   │       ├── routes/
│   │   │       │   └── planning.routes.ts
│   │   │       ├── services/
│   │   │       │   ├── planning.service.ts
│   │   │       │   ├── preparation.service.ts
│   │   │       │   ├── schedule.service.ts
│   │   │       │   ├── export.service.ts
│   │   │       │   └── validation.service.ts
│   │   │       ├── controllers/
│   │   │       │   └── planning.controller.ts
│   │   │       └── validators/
│   │   │           └── planning.validators.ts
│   │   └── schemas/
│   │       └── planning/
│   │           ├── preparation.schema.json
│   │           └── schedule.schema.json
│   └── docs/
│       └── planning/
│           └── PLANNING_MODULE_ARCHITECTURE.md  ← CE DOCUMENT
├── frontend/
│   └── src/
│       ├── pages/
│       │   └── Planning/            ← NOUVEAU SCREEN
│       │       ├── PlanningCalendar.tsx
│       │       ├── PreparationsList.tsx
│       │       ├── StaffView.tsx
│       │       └── ExportPanel.tsx
│       └── components/
│           └── planning/
│               ├── PreparationCard.tsx
│               ├── ScheduleCell.tsx
│               └── StaffBadge.tsx
```

### 3.2 Stack technique

**Backend:**
- Node.js + Express + TypeScript (cohérence CookOps)
- PostgreSQL (base existante CookOps)
- Migrations: node-pg-migrate ou TypeORM

**Frontend:**
- React + TypeScript
- UI Library: même que reste CookOps (Ant Design? Material-UI? à confirmer)
- State management: Context API ou Redux (selon existant)
- Calendar grid: react-big-calendar ou custom table

**Export:**
- PDF: pdfkit ou puppeteer
- Markdown: template string manipulation

---

## 4. MODÈLE DE DONNÉES

### 4.1 Schema PostgreSQL

```sql
-- ============================================
-- PLANNING MODULE SCHEMA v1.0
-- ============================================

-- Enumérations
CREATE TYPE preparation_category AS ENUM (
  'SURGELES',           -- Surgélation hebdomadaire
  'ROTATION_2J',        -- Tous les 2 jours
  'ROTATION_3J',        -- Tous les 3 jours
  'J_MOINS_1',          -- Veille service
  'J_MATIN',            -- Jour même matin
  'J_SERVICE'           -- Pendant service
);

CREATE TYPE preparation_status AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'DONE',
  'SKIPPED'
);

CREATE TYPE staff_role AS ENUM (
  'CHEF_EXECUTIVE',
  'CHEF_DE_PARTIE',
  'COMMIS',
  'PATISSIER',
  'PLONGEUR'
);

CREATE TYPE kitchen_section AS ENUM (
  'SUPERVISION',
  'PATES_RISOTTO',
  'VIANDES_POISSONS',
  'GARDE_MANGER',
  'SNACK',
  'PATISSERIE',
  'PREP_GENERALES',
  'PLONGE'
);

-- ============================================
-- Table: preparations (master data)
-- ============================================
CREATE TABLE preparations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  name VARCHAR(255) NOT NULL,
  name_normalized VARCHAR(255) NOT NULL,  -- lowercase, no accents (search)
  category preparation_category NOT NULL,
  
  -- Quantités
  default_quantity_value DECIMAL(10,2),
  default_quantity_unit VARCHAR(20),      -- kg, L, pcs
  
  -- Timing
  prep_time_minutes INTEGER,              -- temps préparation
  cooking_time_minutes INTEGER,           -- temps cuisson
  cooling_time_minutes INTEGER,           -- temps refroidissement
  total_time_minutes INTEGER GENERATED ALWAYS AS 
    (COALESCE(prep_time_minutes,0) + COALESCE(cooking_time_minutes,0) + COALESCE(cooling_time_minutes,0)) STORED,
  
  -- Storage & HACCP
  storage_temp_min DECIMAL(4,1),          -- 0.0°C
  storage_temp_max DECIMAL(4,1),          -- 3.0°C
  dlc_days INTEGER,                       -- 3 jours
  dlc_hours INTEGER,                      -- ou 4 heures (guacamole)
  packaging VARCHAR(255),                 -- "Sachets SV 1kg"
  
  -- Flags critiques
  haccp_critical BOOLEAN DEFAULT false,   -- DLC ultra-courte
  traccia_required BOOLEAN DEFAULT false, -- Traçabilité obligatoire
  freezable BOOLEAN DEFAULT false,        -- Peut être surgelé
  
  -- Usage
  usage_dishes TEXT[],                    -- ["Linguine bolo", "Gnocchi carbonara"]
  notes TEXT,
  
  -- Metadata
  site_id UUID REFERENCES sites(id),      -- NULL = applicable tous sites
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Indexes
  CONSTRAINT unique_prep_name_per_site UNIQUE(name_normalized, site_id)
);

CREATE INDEX idx_prep_category ON preparations(category);
CREATE INDEX idx_prep_site ON preparations(site_id);
CREATE INDEX idx_prep_active ON preparations(active);
CREATE INDEX idx_prep_name_search ON preparations USING gin(to_tsvector('french', name));

-- ============================================
-- Table: preparation_fiche_links
-- ============================================
CREATE TABLE preparation_fiche_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  preparation_id UUID NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  fiche_id UUID NOT NULL,                 -- ID externe Fiches (pas FK)
  
  link_type VARCHAR(50) NOT NULL,         -- 'base' | 'component' | 'final_dish'
  usage_context TEXT,                     -- "Utilisé comme base sauce"
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_prep_fiche_link UNIQUE(preparation_id, fiche_id)
);

CREATE INDEX idx_prep_fiche_links_prep ON preparation_fiche_links(preparation_id);
CREATE INDEX idx_prep_fiche_links_fiche ON preparation_fiche_links(fiche_id);

-- ============================================
-- Table: recipe_snapshots (audit Fiches)
-- ============================================
CREATE TABLE recipe_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  fiche_id UUID NOT NULL,                 -- ID Fiches
  title VARCHAR(255) NOT NULL,
  
  -- Snapshot integrity
  snapshot_hash VARCHAR(64) NOT NULL,     -- SHA-256
  snapshot_version VARCHAR(20),           -- "1.1"
  snapshot_date TIMESTAMPTZ NOT NULL,
  snapshot_data JSONB NOT NULL,           -- payload complet Fiches
  
  -- Metadata
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES users(id),
  
  CONSTRAINT unique_snapshot_hash UNIQUE(fiche_id, snapshot_hash)
);

CREATE INDEX idx_snapshot_fiche ON recipe_snapshots(fiche_id);
CREATE INDEX idx_snapshot_date ON recipe_snapshots(snapshot_date DESC);

-- ============================================
-- Table: preparation_schedules (planning hebdo)
-- ============================================
CREATE TABLE preparation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Contexte
  site_id UUID NOT NULL REFERENCES sites(id),
  week_start DATE NOT NULL,               -- Lundi de la semaine
  week_number INTEGER NOT NULL,           -- Semaine ISO (1-53)
  year INTEGER NOT NULL,
  
  -- Metadata
  status VARCHAR(20) DEFAULT 'DRAFT',     -- DRAFT | CONFIRMED | ARCHIVED
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  CONSTRAINT unique_schedule_week UNIQUE(site_id, year, week_number)
);

CREATE INDEX idx_schedule_site_week ON preparation_schedules(site_id, week_start);

-- ============================================
-- Table: preparation_schedule_items
-- ============================================
CREATE TABLE preparation_schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  schedule_id UUID NOT NULL REFERENCES preparation_schedules(id) ON DELETE CASCADE,
  preparation_id UUID NOT NULL REFERENCES preparations(id),
  
  -- Planification
  scheduled_day DATE NOT NULL,            -- 2026-03-17
  scheduled_time TIME,                    -- 14:00
  
  -- Quantité prévue
  planned_quantity_value DECIMAL(10,2) NOT NULL,
  planned_quantity_unit VARCHAR(20) NOT NULL,
  
  -- Exécution
  status preparation_status DEFAULT 'PLANNED',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  
  -- Quantité réelle (si différente)
  actual_quantity_value DECIMAL(10,2),
  actual_quantity_unit VARCHAR(20),
  
  -- Notes exécution
  execution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_items_schedule ON preparation_schedule_items(schedule_id);
CREATE INDEX idx_schedule_items_prep ON preparation_schedule_items(preparation_id);
CREATE INDEX idx_schedule_items_day ON preparation_schedule_items(scheduled_day);
CREATE INDEX idx_schedule_items_status ON preparation_schedule_items(status);

-- ============================================
-- Table: staff_members
-- ============================================
CREATE TABLE staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  
  -- Rôle
  role staff_role NOT NULL,
  main_section kitchen_section NOT NULL,
  backup_section kitchen_section,        -- section remplacement
  
  -- Metadata
  site_id UUID NOT NULL REFERENCES sites(id),
  active BOOLEAN DEFAULT true,
  hired_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staff_site ON staff_members(site_id);
CREATE INDEX idx_staff_active ON staff_members(active);
CREATE INDEX idx_staff_role ON staff_members(role);

-- ============================================
-- Table: staff_shifts (horaires hebdo)
-- ============================================
CREATE TABLE staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id),
  
  -- Semaine
  week_start DATE NOT NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Horaires (JSON pour flexibilité)
  -- Structure: { "monday": {"start": "09:00", "end": "17:00", "break_minutes": 30, "off": false}, ... }
  schedule JSONB NOT NULL,
  
  -- Import source
  imported_from VARCHAR(50),              -- "combo" | "manual"
  import_batch_id UUID,                   -- pour grouper imports
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_staff_week UNIQUE(staff_member_id, year, week_number)
);

CREATE INDEX idx_shifts_staff ON staff_shifts(staff_member_id);
CREATE INDEX idx_shifts_week ON staff_shifts(week_start);
CREATE INDEX idx_shifts_site ON staff_shifts(site_id);

-- ============================================
-- Table: staff_import_batches (audit imports Combo)
-- ============================================
CREATE TABLE staff_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  site_id UUID NOT NULL REFERENCES sites(id),
  week_start DATE NOT NULL,
  
  source_file_name VARCHAR(255),
  source_format VARCHAR(20),              -- "csv" | "pdf"
  rows_imported INTEGER,
  
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES users(id),
  
  import_log JSONB                        -- erreurs, warnings
);

-- ============================================
-- Views utiles
-- ============================================

-- Vue: Planning complet semaine avec détails prep
CREATE VIEW v_weekly_planning AS
SELECT 
  psi.id as item_id,
  psi.schedule_id,
  ps.site_id,
  ps.week_start,
  ps.week_number,
  ps.year,
  psi.scheduled_day,
  psi.scheduled_time,
  psi.status,
  
  p.id as preparation_id,
  p.name as preparation_name,
  p.category,
  p.total_time_minutes,
  p.haccp_critical,
  p.traccia_required,
  
  psi.planned_quantity_value,
  psi.planned_quantity_unit,
  psi.actual_quantity_value,
  psi.actual_quantity_unit,
  
  psi.completed_at,
  psi.execution_notes
  
FROM preparation_schedule_items psi
JOIN preparation_schedules ps ON psi.schedule_id = ps.id
JOIN preparations p ON psi.preparation_id = p.id
ORDER BY psi.scheduled_day, psi.scheduled_time;

-- Vue: Capacité staff journalière
CREATE VIEW v_daily_staff_capacity AS
SELECT 
  ss.site_id,
  ss.week_start,
  d.day_name,
  d.day_date,
  
  COUNT(DISTINCT sm.id) as total_staff,
  SUM(
    CASE 
      WHEN (ss.schedule->d.day_name->>'off')::boolean = false 
      THEN EXTRACT(EPOCH FROM (
        (ss.schedule->d.day_name->>'end')::time - 
        (ss.schedule->d.day_name->>'start')::time
      )) / 3600 - (COALESCE((ss.schedule->d.day_name->>'break_minutes')::integer, 0) / 60.0)
      ELSE 0
    END
  ) as total_hours_available
  
FROM staff_shifts ss
JOIN staff_members sm ON ss.staff_member_id = sm.id
CROSS JOIN (
  SELECT 
    unnest(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) as day_name,
    generate_series(0, 6) as day_offset
) d
WHERE d.day_date = ss.week_start + d.day_offset
GROUP BY ss.site_id, ss.week_start, d.day_name, d.day_date;
```

### 4.2 Contraintes d'intégrité

**Business rules:**

1. **Une préparation ne peut être planifiée 2x le même jour**
   ```sql
   -- Trigger validation (optionnel si UI prevent)
   CREATE UNIQUE INDEX unique_prep_per_day 
   ON preparation_schedule_items(schedule_id, preparation_id, scheduled_day);
   ```

2. **DLC validation:** si `dlc_hours` existe, `scheduled_day` doit être J-même ou J-1 max

3. **Staff capacity warning:** total `total_time_minutes` des prep jour ≤ `total_hours_available` × 60

4. **HACCP critical:** si `haccp_critical = true` ET status ≠ 'DONE' à H-2 avant service → alert

---

## 5. INTÉGRATIONS

### 5.1 Intégration COMBO (Staff)

**Format import CSV attendu:**

```csv
full_name,phone,role,main_section,backup_section,monday,tuesday,wednesday,thursday,friday,saturday,sunday
"Michele VALSANIA","+33658288284","CHEF_EXECUTIVE","SUPERVISION","","09:00-17:00(30)","09:00-17:00(30)","09:00-17:00(30)","09:00-17:00(30)","09:00-17:00(30)","OFF","OFF"
"Leo ORTEGA","+33658288284","CHEF_DE_PARTIE","PATES_RISOTTO","VIANDES_POISSONS","08:15-17:00(30)","09:00-17:00(30)","09:00-17:00(30)","09:00-17:00(30)","09:00-17:00(30)","OFF","OFF"
```

**Logique parsing:**
- `monday` value = `"09:00-17:00(30)"` → `{start: "09:00", end: "17:00", break_minutes: 30}`
- `monday` value = `"OFF"` → `{off: true}`

**API endpoint:**

```typescript
POST /api/v1/planning/staff/import-combo
Content-Type: multipart/form-data

Request:
{
  file: File (CSV),
  site_id: UUID,
  week_start: "2026-03-16"
}

Response 200:
{
  batch_id: UUID,
  site_id: UUID,
  week_start: "2026-03-16",
  stats: {
    staff_imported: 9,
    shifts_created: 9,
    errors: 0,
    warnings: []
  }
}

Response 400:
{
  error: "Invalid CSV format",
  details: [
    { row: 3, field: "phone", message: "Invalid phone format" }
  ]
}
```

**Fréquence:** Import manuel 1x/semaine (dimanche soir pour semaine suivante)

**Évolution future:** 
- Auto-fetch API Combo si disponible
- Sync bidirectionnel (CookOps → Combo pour ajustements)

---

### 5.2 Intégration FICHES (Recettes)

**Lecture snapshots:**

```typescript
// Service: planning/services/fiches-sync.service.ts

async syncRecipeSnapshot(ficheId: UUID): Promise<RecipeSnapshot> {
  // 1. Fetch depuis API Fiches
  const ficheData = await fetch(`${FICHES_API_URL}/api/products/${ficheId}`);
  
  // 2. Calculer hash
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(ficheData))
    .digest('hex');
  
  // 3. Vérifier si snapshot existe déjà
  const existing = await RecipeSnapshot.findOne({
    where: { fiche_id: ficheId, snapshot_hash: hash }
  });
  
  if (existing) return existing;
  
  // 4. Créer nouveau snapshot
  return RecipeSnapshot.create({
    fiche_id: ficheId,
    title: ficheData.title,
    snapshot_hash: hash,
    snapshot_version: ficheData.version || '1.1',
    snapshot_date: new Date(),
    snapshot_data: ficheData
  });
}
```

**Usage dans Planning:**
- Quand chef lie Preparation → Fiche: snapshot automatique
- Affichage warning si fiche modifiée depuis snapshot
- Re-sync manuel possible

---

### 5.3 Intégration TRACCIA (Exécution)

**Phase 2+ (out of scope MVP)**

**Flux cible:**

```
CookOps Planning                    Traccia Mobile
      │                                  │
      │  1. Prep "Bolognaise" PLANNED   │
      ├─────────────────────────────────>│
      │                                  │
      │  2. Chef starts prep             │
      │<─────────────────────────────────┤
      │     status: IN_PROGRESS          │
      │                                  │
      │  3. Étiquette printed            │
      │<─────────────────────────────────┤
      │     lot_id, qty_actual           │
      │                                  │
      │  4. Auto-complete prep           │
      │     status: DONE                 │
      │     completed_at: NOW            │
```

**API contract (à définir Phase 2):**

```typescript
// Webhook Traccia → CookOps
POST /api/v1/planning/webhooks/traccia/label-printed
{
  event_type: "label_printed",
  preparation_schedule_item_id: UUID,
  lot_id: UUID,
  actual_quantity: { value: 14.8, unit: "kg" },
  printed_at: "2026-03-17T14:32:00Z",
  printed_by: UUID
}
```

---

## 6. INTERFACE UTILISATEUR

### 6.1 Navigation

**Menu vertical CookOps:**

```
CookOps
├── 🏠 Dashboard
├── 📦 Catalog
├── 🛒 Achats
├── 📊 Stock
├── 💰 Ventes
├── 📋 Planning          ← NOUVEAU
│   ├── Calendrier
│   ├── Préparations
│   ├── Staff
│   └── Export
├── 📄 Rapports
└── ⚙️ Paramètres
```

**Click "Planning" → Screen pleine page calendrier**

---

### 6.2 Layout Planning Screen

```
┌─────────────────────────────────────────────────────────────────┐
│ COOKOPS                                          [User] [Menu ☰] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📋 PLANNING MISE EN PLACE                                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
││  Site: [Les Tournels ▾]    Semaine: [<] 12 (16-22 Mars) [>]  ││
││  👥 Staff: 9 pers.    📊 Couverts: 450 Resto + 280 Snack      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
││  Filtres: [Toutes ▾] [Surgélés] [J-1] [J-matin] [HACCP ⚠️]   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ╔═══════════╤══════╤══════╤══════╤══════╤══════╤══════╤══════╗│
│  ║ PRÉPARATION│ LUN  │ MAR  │ MER  │ JEU  │ VEN  │ SAM  │ DIM  ║│
│  ║            │ 16   │ 17   │ 18   │ 19   │ 20   │ 21   │ 22   ║│
│  ╠═══════════╪══════╪══════╪══════╪══════╪══════╪══════╪══════╣│
│  ║ Bolognaise│ ✅   │      │      │      │      │      │      ║│
│  ║ 🧊 3h     │ 15kg │      │      │      │      │      │      ║│
│  ║           │ 9h   │      │      │      │      │      │      ║│
│  ╟───────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────╢│
│  ║ SV Poulet │ 📝   │      │      │      │ 📝   │      │      ║│
│  ║ ⚠️ 2h30   │ 30pc │      │      │      │ 30pc │      │      ║│
│  ║           │ 14h  │      │      │      │ 14h  │      │      ║│
│  ╟───────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────╢│
│  ║ Gazpacho  │      │ 📝   │      │ 📝   │      │ 📝   │      ║│
│  ║ 📅 45min  │      │ 6L   │      │ 6L   │      │ 8L   │      ║│
│  ║           │      │ 16h  │      │ 16h  │      │ 16h  │      ║│
│  ╚═══════════╧══════╧══════╧══════╧══════╧══════╧══════╧══════╝│
│                                                                   │
│  💡 Lundi: staff réduit (2 pers.) → Reporter Bolognaise à Mardi? │
│                                                                   │
│  [+ Ajouter préparation] [Générer checklist] [Export MD/PDF]    │
└─────────────────────────────────────────────────────────────────┘
```

**Légende symboles:**
- ✅ = DONE
- 📝 = PLANNED
- 🔄 = IN_PROGRESS
- ❌ = SKIPPED
- 🧊 = Surgélation
- ⚠️ = HACCP critical
- 📅 = J-1

---

### 6.3 Interactions cellule

**Click sur cellule (ex: "Bolognaise | LUN"):**

```
┌────────────────────────────────────┐
│ ÉDITION RAPIDE                     │
├────────────────────────────────────┤
│ Préparation: Bolognaise maison     │
│ Jour: Lundi 16 Mars                │
│                                    │
│ Quantité: [15] [kg ▾]             │
│ Heure: [09:00]                     │
│ Statut: [Planned ▾]               │
│                                    │
│ [Annuler] [Sauvegarder]           │
└────────────────────────────────────┘
```

**Click sur nom préparation → Side panel détails complets**

---

### 6.4 Side Panel Préparation

```
┌──────────────────────────────────────┐
│ BOLOGNAISE MAISON                    │
│ [Modifier] [Supprimer]               │
├──────────────────────────────────────┤
│                                      │
│ 📦 Catégorie: Surgélation            │
│ ⏱️ Temps total: 3h                   │
│   • Préparation: 30min               │
│   • Cuisson: 3h                      │
│   • Refroidissement: -               │
│                                      │
│ 📊 Quantité standard: 15 kg          │
│                                      │
│ ❄️ Stockage:                         │
│   • Température: 0-3°C (frigo)       │
│   • DLC: 3 jours                     │
│   • Conditionnement: Sachets SV 1kg  │
│   • Surgélation: ✅ Oui (3 mois)     │
│                                      │
│ ⚠️ HACCP:                            │
│   • Critique: Non                    │
│   • Traccia: Non obligatoire         │
│                                      │
│ 🍝 Utilisé dans:                     │
│   • Linguine Bolognese               │
│   • Gnocchi Carbonara                │
│                                      │
│ 📝 Notes:                            │
│   Refroidir rapidement après         │
│   cuisson. Étiqueter lot/date.       │
│                                      │
│ 🔗 Fiches liées: 2                   │
│   [Voir snapshots]                   │
└──────────────────────────────────────┘
```

---

### 6.5 Export Panel

```
┌─────────────────────────────────────────┐
│ EXPORT PLANNING                         │
├─────────────────────────────────────────┤
│                                         │
│ Format: ○ PDF  ● Markdown              │
│                                         │
│ Type:                                   │
│ ☑ Planning hebdomadaire complet        │
│ ☑ Checklist quotidiennes (7 fichiers)  │
│ ☐ Checklist par catégorie              │
│   ☐ Surgélés                            │
│   ☐ J-1                                 │
│   ☐ J-matin                             │
│                                         │
│ Options:                                │
│ ☑ Inclure timing                        │
│ ☑ Inclure notes HACCP                   │
│ ☐ Inclure capacité staff                │
│                                         │
│ [Annuler] [Générer export]             │
└─────────────────────────────────────────┘
```

---

## 7. FLUX OPÉRATIONNELS

### 7.1 Setup initial (une fois)

```
1. IMPORT PRÉPARATIONS
   ├─ CSV Excel actuel (ton planning optimisé)
   ├─ Parse categories (surgélés, J-1, J-matin...)
   ├─ Create Preparation records
   └─ Validate data integrity

2. LINK FICHES
   ├─ Pour chaque prep ayant fiche associée
   ├─ Search fiche par nom (fuzzy match)
   ├─ Create PreparationFicheLink
   └─ Snapshot fiche initiale

3. IMPORT STAFF
   ├─ CSV Combo semaine type
   ├─ Create StaffMember records
   └─ Assign roles & sections
```

### 7.2 Workflow hebdomadaire type

```
DIMANCHE (J-7)
├─ Chef importe CSV Combo semaine suivante
├─ CookOps crée StaffShifts records
├─ Système affiche capacité staff/jour
└─ Template planning pré-rempli (basé sur semaine précédente)

LUNDI-VENDREDI
├─ Chef ajuste quantités selon couverts prévus
├─ Brigata consulte checklist jour (PDF/screen)
├─ Brigata marque prep DONE au fur et à mesure
└─ CookOps track status real-time

SAMEDI (fin semaine)
├─ Chef review prep completed vs planned
├─ Export rapport hebdo (efficiency %)
└─ Archive schedule (status = ARCHIVED)
```

### 7.3 Ajustement dynamique

**Scénario: Couverts imprévus samedi**

```
Vendredi 16h:
├─ Réservations samedi passent de 80 → 120 couverts
├─ Chef ouvre Planning CookOps
├─ Ajuste menu planning (+40 couverts)
├─ Phase 2: système suggère "Bolognaise +5kg"
├─ MVP: chef ajuste manuellement prep Bolognaise
└─ Sauvegarde → Checklist samedi mise à jour
```

---

## 8. ROADMAP MVP

### 8.1 Phase 1: Fondations (Semaine 1-2)

**Backend:**
- [x] Schema PostgreSQL complet
- [ ] Models TypeScript (Preparation, Schedule, Staff)
- [ ] Migrations database
- [ ] CRUD API Preparations
  - `GET /api/v1/planning/preparations`
  - `POST /api/v1/planning/preparations`
  - `PUT /api/v1/planning/preparations/:id`
  - `DELETE /api/v1/planning/preparations/:id`

**Frontend:**
- [ ] Route `/planning`
- [ ] Layout page Planning
- [ ] Component PreparationsList (table simple)

**Deliverable:** CRUD Preparations fonctionnel

---

### 8.2 Phase 2: Import données (Semaine 3)

**Backend:**
- [ ] Service import CSV preparations (Excel actuel)
- [ ] Service import CSV Combo staff
- [ ] Validation CSV formats
- [ ] API import endpoints

**Frontend:**
- [ ] UI Upload CSV preparations
- [ ] UI Upload CSV staff
- [ ] Feedback import (success/errors)

**Deliverable:** Données initiales chargées (Tournels + JDP)

---

### 8.3 Phase 3: Calendrier (Semaine 4-5)

**Backend:**
- [ ] API Schedule CRUD
- [ ] API ScheduleItems CRUD
- [ ] Endpoint `GET /planning/calendar/:site_id/:week_start`

**Frontend:**
- [ ] Component PlanningCalendar (grid 7 jours)
- [ ] Render cellules prep avec status
- [ ] Inline edit cellule (qty, time, status)
- [ ] Symboles visuels (✅📝🔄❌)

**Deliverable:** Calendrier visual fonctionnel

---

### 8.4 Phase 4: Links & Snapshots (Semaine 6)

**Backend:**
- [ ] Service sync Fiches snapshots
- [ ] API PreparationFicheLinks CRUD
- [ ] Endpoint validation snapshot hash

**Frontend:**
- [ ] UI link Preparation → Fiche (dropdown search)
- [ ] Side panel détails prep
- [ ] Warning si fiche modifiée

**Deliverable:** Intégration Fiches complète

---

### 8.5 Phase 5: Export (Semaine 7)

**Backend:**
- [ ] Service export Markdown
- [ ] Service export PDF (puppeteer)
- [ ] Templates checklist quotidiennes

**Frontend:**
- [ ] Modal Export panel
- [ ] Options format/type export
- [ ] Download generated files

**Deliverable:** Export PDF/MD fonctionnel

---

### 8.6 Phase 6: Polish & Deploy (Semaine 8)

**Backend:**
- [ ] Tests unitaires services critiques
- [ ] Tests intégration API
- [ ] Documentation OpenAPI

**Frontend:**
- [ ] Responsive mobile (consultation)
- [ ] Loading states
- [ ] Error handling
- [ ] Documentation usage

**Deliverable:** MVP production-ready

---

**TOTAL MVP: ~8 semaines**

---

## 9. ÉVOLUTIONS FUTURES

### 9.1 Phase 2: Smart Planning (Post-MVP)

**Calcul automatique fabbisogno:**

```typescript
// Service: planning/services/demand-calculator.service.ts

async calculateDemand(
  menuPlanning: MenuPlanning,
  site_id: UUID
): Promise<PreparationDemand[]> {
  
  const demands: PreparationDemand[] = [];
  
  for (const dish of menuPlanning.planned_dishes) {
    // 1. Fetch fiche snapshot
    const snapshot = await getRecipeSnapshot(dish.fiche_id);
    
    // 2. Parse ingredients
    for (const ingredient of snapshot.snapshot_data.ingredients) {
      
      // 3. Check si ingredient = preparation interne
      const prep = await findPreparationByName(ingredient.name);
      
      if (prep) {
        // 4. Calculate qty needed
        const qtyPerPortion = parseQuantity(ingredient.quantity);
        const totalQty = qtyPerPortion * dish.expected_portions;
        
        // 5. Add buffer (20%)
        const qtyWithBuffer = totalQty * 1.2;
        
        demands.push({
          preparation_id: prep.id,
          preparation_name: prep.name,
          required_qty: totalQty,
          suggested_qty: qtyWithBuffer,
          unit: qtyPerPortion.unit,
          source_dishes: [dish.dish_name]
        });
      }
    }
  }
  
  // 6. Aggregate same preparations
  return aggregateDemands(demands);
}
```

**UI nouvelle:**
```
Planning Hebdo → Onglet "Suggestions"
┌────────────────────────────────────────┐
│ SUGGESTIONS BASÉES SUR MENU            │
├────────────────────────────────────────┤
│ ✨ Bolognaise                          │
│    Nécessaire: 12.6kg                  │
│    Suggéré: 15kg (+20% buffer)         │
│    Utilisé par: Linguine (45), Gnocchi │
│    [Ajouter au planning]               │
│                                        │
│ ✨ Pesto Basilic                       │
│    Nécessaire: 0.8L                    │
│    Suggéré: 1L                         │
│    Stock actuel: 2L ✅ Suffisant       │
└────────────────────────────────────────┘
```

---

### 9.2 Phase 3: Constraint Validation

**Validation automatique contraintes:**

```typescript
interface PlanningConstraint {
  type: 'STAFF_OVERLOAD' | 'DLC_EXPIRED' | 'TIME_CONFLICT' | 'HACCP_ALERT';
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  affected_items: UUID[];
  suggested_action?: string;
}

// Exemples:
[
  {
    type: 'STAFF_OVERLOAD',
    severity: 'WARNING',
    message: 'Lundi 16 Mars: 6h de prep planifiées, seulement 2 personnes disponibles',
    affected_items: ['prep-uuid-1', 'prep-uuid-2'],
    suggested_action: 'Reporter Bolognaise à Mardi ou augmenter staff'
  },
  {
    type: 'DLC_EXPIRED',
    severity: 'ERROR',
    message: 'Gazpacho DLC 3j mais planifié J-5 avant service',
    affected_items: ['prep-uuid-3'],
    suggested_action: 'Replanifier à J-2 maximum'
  }
]
```

---

### 9.3 Phase 4: Traccia Integration

**Auto-complete via étiquettes:**

```
Traccia (mobile)              CookOps (backend)
     │                              │
     │ 1. Scan QR prep schedule     │
     ├─────────────────────────────>│
     │                              │
     │ 2. Display prep details      │
     │<─────────────────────────────┤
     │                              │
     │ 3. Print étiquette           │
     │    (lot, DLC, qty)           │
     ├─────────────────────────────>│
     │                              │
     │ 4. CookOps auto-updates:     │
     │    - status = DONE           │
     │    - actual_qty = 14.8kg     │
     │    - completed_at = NOW      │
```

---

### 9.4 Phase 5: Machine Learning

**Predictive planning basé historique:**

```sql
-- Table historique ventes
CREATE TABLE sales_history (
  id UUID PRIMARY KEY,
  fiche_id UUID,
  site_id UUID,
  sale_date DATE,
  portions_sold INTEGER,
  day_of_week INTEGER,      -- 1-7
  weather VARCHAR(20),      -- sunny, rainy, cloudy
  is_holiday BOOLEAN,
  event_type VARCHAR(50)    -- concert, festival, normal
);

-- ML Model training data
SELECT 
  fiche_id,
  AVG(portions_sold) FILTER (WHERE day_of_week = 6) as avg_saturday,
  AVG(portions_sold) FILTER (WHERE weather = 'sunny') as avg_sunny,
  AVG(portions_sold) FILTER (WHERE is_holiday = true) as avg_holiday
FROM sales_history
GROUP BY fiche_id;
```

**Suggestion intelligente:**
```
Planning Samedi 22 Mars:
💡 ML Suggestion

Linguine Bolognese:
  • Historique samedi mars: 38 portions (±5)
  • Météo prévue: Beau temps (+15% terrasse)
  • Suggestion: 45 portions
  
  → Bolognaise nécessaire: 8.1kg
  → Suggestion prep: 10kg (vendredi 16h)
```

---

### 9.5 Phase 6: Mobile App Brigata

**App native ou PWA pour consultations terrain:**

```
Mobile Brigata App
├── Vue Checklist Jour
│   ├─ Mes prep du jour
│   ├─ Heure prévue
│   ├─ Quantité
│   └─ Status (marquer DONE)
│
├── Scanner QR prep
│   └─ Détails prep + timer
│
└── Notifications
    ├─ "Bolognaise à démarrer (9h)"
    └─ "DLC Gazpacho dans 2h ⚠️"
```

---

### 9.6 Phase 7: Multi-site Sync

**Templates planning partagés:**

```typescript
// Site A (Tournels) crée template "Été 2026"
Template {
  id: UUID,
  name: "Planning Été 2026 - Haute saison",
  created_by_site: "tournels-uuid",
  visibility: "PUBLIC",  // other sites can clone
  preparations: [...],
  schedule_pattern: {
    monday: [...],
    tuesday: [...],
    // ...
  }
}

// Site B (JDP) clone template
POST /api/v1/planning/templates/:id/clone
{
  target_site_id: "jdp-uuid",
  adjustments: {
    scale_quantities: 0.7,  // JDP = 70% capacité Tournels
    exclude_preparations: ["tajine_agneau"]  // pas au menu JDP
  }
}
```

---

## 10. ANNEXES

### 10.1 Exemple payload complet

**Preparation complète (JSON):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Bolognaise maison",
  "name_normalized": "bolognaise maison",
  "category": "SURGELES",
  "default_quantity": {
    "value": 15,
    "unit": "kg"
  },
  "timing": {
    "prep_minutes": 30,
    "cooking_minutes": 180,
    "cooling_minutes": 0,
    "total_minutes": 210
  },
  "storage": {
    "temp_min": 0,
    "temp_max": 3,
    "dlc_days": 3,
    "dlc_hours": null,
    "packaging": "Sachets SV 1kg",
    "freezable": true,
    "freeze_dlc_months": 3
  },
  "haccp": {
    "critical": false,
    "traccia_required": false
  },
  "usage_dishes": [
    "Linguine alla Bolognese",
    "Gnocchi Carbonara"
  ],
  "fiche_links": [
    {
      "fiche_id": "abc-123",
      "link_type": "base",
      "usage_context": "Sauce principale"
    }
  ],
  "notes": "Refroidir rapidement après cuisson. Étiqueter lot/date.",
  "site_id": "tournels-uuid",
  "active": true,
  "created_at": "2026-03-01T10:00:00Z",
  "updated_at": "2026-03-15T14:30:00Z"
}
```

---

### 10.2 Exemple export MD (checklist quotidienne)

**Fichier: `checklist_lundi_16_mars.md`**

```markdown
# CHECKLIST LUNDI 16 MARS 2026
**Site:** Les Tournels  
**Staff:** 9 personnes (Leo 08:15-17h, autres 09h-17h)  
**Couverts prévus:** 450 Restaurant + 280 Snack

---

## 🧊 SURGÉLATION

- [ ] **Bolognaise maison** — 15 kg
  - Timing: 3h (démarrer 9h)
  - Conditionnement: Sachets SV 1kg
  - DLC: 3j frigo / 3 mois surgélation
  - Note: Refroidir rapidement, étiqueter lot

---

## 📅 J-1 (pour mardi)

- [ ] **Suprême poulet SV** — 30 pcs
  - Timing: 2h30 (démarrer 14h)
  - Cuisson: 64°C sous-vide
  - ⚠️ HACCP: Traccia obligatoire
  - DLC: 7j

- [ ] **Tiramisu verrines** — 30 pcs
  - Timing: 1h (démarrer 16h)
  - Monter J-1, filmer
  - ⚠️ HACCP: Traccia obligatoire
  - DLC: 48h

---

## ☀️ J-MATIN

- [ ] **Lever filets daurade** — selon résa (8h)
  - ⚠️ HACCP: Traccia lot obligatoire
  - DLC: 24h

- [ ] **Portionner steaks smash** — selon besoin (8h30)
  - Bouler, filmer
  - ⚠️ HACCP: Traccia lot obligatoire
  - DLC: 24h

- [ ] **Sauce vierge** — 2 L (9h)
  - Ciseler, assembler
  - DLC: 2j

- [ ] **Guacamole maison** — 2 kg (9h)
  - ⚠️ DLC 4h max → Refaire à 14h
  
---

**💡 Note:** Lundi staff réduit (2 pers.) → Prioriser prep critiques

**Signature:** ________________  **Heure:** ______
```

---

### 10.3 Décisions architecturales clés

| Décision | Justification |
|----------|---------------|
| **PostgreSQL (pas MongoDB)** | Données structurées, relations fortes, ACID guarantees |
| **Snapshots Fiches** | Audit trail, indépendance des systèmes |
| **CSV import Combo** | MVP pragmatique, API future optional |
| **Statut tracking simple** | PLANNED/IN_PROGRESS/DONE/SKIPPED suffisant MVP |
| **Pas drag & drop MVP** | Complexité UI vs ROI faible Phase 1 |
| **Export MD + PDF** | MD pour versioning Git, PDF pour affichage |
| **Multi-site dès MVP** | Tournels + JDP = 2 sites from day 1 |
| **Preparation = entité propre** | Pas juste "recette instance", concept plus large |
| **Staff capacity view-only MVP** | Calcul automatique Phase 2, display info Phase 1 |

---

### 10.4 Glossaire

| Terme | Définition |
|-------|------------|
| **Preparation** | Tâche de mise en place (peut correspondre à 1 fiche, plusieurs, ou aucune) |
| **Fiche** | Recette/produit authoring dans Fiches app |
| **Schedule** | Planning hebdomadaire (1 par site/semaine) |
| **ScheduleItem** | Instance prep planifiée (jour, heure, qty) |
| **Snapshot** | Copie immuable fiche à un instant T |
| **DLC** | Date Limite Consommation |
| **HACCP** | Hazard Analysis Critical Control Points |
| **Traccia** | App mobile exécution HACCP |
| **Combo** | Logiciel planning personnel externe |
| **SV** | Sous-vide |

---

## 11. VALIDATION & SIGN-OFF

**Document validé par:**

- [ ] Chef Executive (Michele Valsania)
- [ ] Directeur Opérations
- [ ] Tech Lead CookOps

**Date validation:** _______________

**Prochaine étape:** Démarrage Phase 1 développement

---

**FIN DU DOCUMENT**

*Version 1.0 — 2026-03-20*
