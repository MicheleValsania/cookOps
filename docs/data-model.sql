-- CookOps — Data Model (PostgreSQL) v0.1
-- Focus: MVP Catalog + Inventory + Purchasing + POS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========
-- CATALOG
-- =========
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  vat_number TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE supplier_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  supplier_sku TEXT,
  ean TEXT,
  uom TEXT NOT NULL CHECK (uom IN ('kg','g','l','ml','cl','pc')),
  pack_qty NUMERIC,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  traceability_flag BOOLEAN NOT NULL DEFAULT FALSE,
  allergens JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, name)
);

CREATE TABLE price_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE price_list_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  price_list_id UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  supplier_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE RESTRICT,
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  unit TEXT NOT NULL CHECK (unit IN ('kg','g','l','ml','cl','pc')),
  pack_qty NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (price_list_id, supplier_product_id)
);

-- =========
-- RECIPE SNAPSHOTS (from Fiches)
-- =========
CREATE TABLE recipe_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiche_product_id UUID NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  portions NUMERIC,
  snapshot_hash TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fiche_product_id, snapshot_hash)
);

CREATE TABLE recipe_ingredient_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiche_product_id UUID NOT NULL,
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  qty_value NUMERIC NOT NULL CHECK (qty_value > 0),
  qty_unit TEXT NOT NULL CHECK (qty_unit IN ('kg','g','l','ml','cl','pc')),
  note TEXT,
  snapshot_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========
-- PURCHASING
-- =========
CREATE TABLE goods_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  delivery_note_number TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, supplier_id, delivery_note_number)
);

CREATE TABLE goods_receipt_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  raw_product_name TEXT,
  supplier_lot_code TEXT,
  dlc_date DATE,
  qty_value NUMERIC NOT NULL CHECK (qty_value > 0),
  qty_unit TEXT NOT NULL CHECK (qty_unit IN ('kg','g','l','ml','cl','pc')),
  unit_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  invoice_date DATE,
  total_amount NUMERIC,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','paid','cancelled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, supplier_id, invoice_number)
);

CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  raw_product_name TEXT,
  qty_value NUMERIC NOT NULL CHECK (qty_value > 0),
  qty_unit TEXT NOT NULL CHECK (qty_unit IN ('kg','g','l','ml','cl','pc')),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  vat_rate NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========
-- INVENTORY / LOTS
-- =========
CREATE TABLE lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('supplier_product','recipe')),
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  fiche_product_id UUID,
  recipe_snapshot_hash TEXT,
  supplier_lot_code TEXT,
  internal_lot_code TEXT NOT NULL,
  received_at TIMESTAMPTZ,
  production_date DATE,
  dlc_date DATE,
  qty_value NUMERIC NOT NULL CHECK (qty_value >= 0),
  qty_unit TEXT NOT NULL CHECK (qty_unit IN ('kg','g','l','ml','cl','pc')),
  storage_location TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','consumed','discarded','blocked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, internal_lot_code)
);

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES lots(id) ON DELETE SET NULL,
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('IN','OUT','ADJUST','TRANSFER')),
  qty_value NUMERIC NOT NULL CHECK (qty_value > 0),
  qty_unit TEXT NOT NULL CHECK (qty_unit IN ('kg','g','l','ml','cl','pc')),
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ref_type TEXT,
  ref_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  snapshot_date DATE NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, snapshot_date)
);

CREATE TABLE lot_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('RECEIVE','OPEN','REPACK','FREEZE','THAW','COOK','DISCARD','LABEL_PRINT')),
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========
-- POS
-- =========
CREATE TABLE pos_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  vendor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, name)
);

CREATE TABLE pos_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pos_source_id UUID NOT NULL REFERENCES pos_sources(id) ON DELETE CASCADE,
  pos_item_external_id TEXT,
  pos_name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pos_source_id, pos_item_external_id)
);

CREATE TABLE pos_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pos_item_id UUID NOT NULL REFERENCES pos_items(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('recipe','supplier_product','category')),
  target_id TEXT NOT NULL,
  portion_factor NUMERIC NOT NULL DEFAULT 1.0,
  loss_factor NUMERIC NOT NULL DEFAULT 0.0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sales_events_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  pos_source_id UUID NOT NULL REFERENCES pos_sources(id) ON DELETE RESTRICT,
  sales_date DATE NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, pos_source_id, sales_date)
);

-- =========
-- INTEGRATION AUDIT
-- =========
CREATE TABLE integration_import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_system TEXT NOT NULL,
  schema_version TEXT,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb
);
