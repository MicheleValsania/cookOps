# Inventory Mobile Execution

## Goal

Add a fast inventory workflow where:

- `CookOps` remains the central source of truth for sites, supplier catalog, stock history, inventory sessions, and accounting-linked stock visibility
- `Traccia` acts as the mobile data-entry client for on-site counts
- `CookOps` frontend also exposes the same inventory structures and sessions for central supervision

This design fits the current operating model:

- invoices and delivery-note lines are centralized in `CookOps`
- stock is already reconstructed from purchasing documents
- inventory counting must happen per physical site, sector, and stock point

`compta centrale` remains an administrative/central site role, not a physical counting site.

## Operating Model

### Centralized in CookOps

- site master data
- supplier and supplier-product catalog
- stock summary and inventory movements
- inventory structure: sectors and stock points
- inventory sessions and counted lines
- final adjustments applied to stock
- exports and Drive archival of closed inventory sessions

### Executed from Traccia

- choose the physical site
- choose sector and stock point
- search products by code or name
- filter by category or supplier
- enter counted quantity quickly from mobile

## Inventory Structure

Hierarchy:

1. `Site`
2. `InventorySector`
3. `StockPoint`

Examples:

- Site: `Cannes Croisette`
- Sector: `Cuisine`, `Bar`, `Reserve seche`, `Chambre froide`
- Stock point: `Frigo 1`, `Congelateur 2`, `Etagere epices`, `Reserve boissons`

## Data Model

New inventory entities in `CookOps`:

### InventorySector

- belongs to a `Site`
- identifies a counting area
- ordered and activable/deactivable

### StockPoint

- belongs to a `Site`
- linked to one `InventorySector`
- identifies the exact physical storage point

### InventorySession

- belongs to a `Site`
- optionally scoped to one `InventorySector`
- stores status: `draft`, `in_progress`, `closed`, `cancelled`
- source defaults to `traccia_mobile`
- closes into stock adjustments

### InventoryCountLine

- belongs to one `InventorySession`
- optionally linked to one `StockPoint`
- linked to one `SupplierProduct`
- stores counted quantity, expected quantity snapshot, and delta snapshot

## Session Lifecycle

1. A session is created for a site and optional sector.
2. Count lines are added or updated while operators count products.
3. Each line stores:
   - counted quantity
   - current expected stock snapshot
   - delta at the moment of save
4. Closing the session creates `InventoryMovement` rows with:
   - `IN` when counted stock is above expected stock
   - `OUT` when counted stock is below expected stock
   - `ref_type = inventory_session_close`
   - `ref_id = session.id`

## API Phase 1

New `CookOps` API endpoints:

- `GET/POST /api/v1/inventory/sectors/`
- `PATCH /api/v1/inventory/sectors/{sector_id}/`
- `GET/POST /api/v1/inventory/stock-points/`
- `PATCH /api/v1/inventory/stock-points/{point_id}/`
- `GET /api/v1/inventory/products/`
- `GET/POST /api/v1/inventory/sessions/`
- `GET /api/v1/inventory/sessions/{session_id}/`
- `POST /api/v1/inventory/sessions/{session_id}/lines/bulk-upsert/`
- `POST /api/v1/inventory/sessions/{session_id}/close/`

Legacy endpoint kept during transition:

- `POST /api/v1/inventory/inventories/apply/`

## Product Search Rules

Inventory product search should support:

- supplier code exact or partial input
- product name partial input
- category filter
- supplier filter
- site-aware stock snapshot

Phase 1 keeps theoretical stock at `site + product + unit` level.

`StockPoint` is used to guide the operator and to preserve counting context, not to maintain a separate theoretical stock ledger yet.

## Frontend Scope

### CookOps frontend

- manage sectors and stock points
- create inventory sessions
- search products
- enter counted lines
- review and close sessions
- keep stock summary visible in parallel

### Traccia mobile

- consume the same inventory structures from `CookOps`
- provide a faster phone-first workflow later using the same central data model

## Backup Strategy

The business source of truth remains the `CookOps` database on Railway.

Google Drive is used for:

- inventory CSV/PDF archival
- optional photo evidence
- operational backup copies of generated documents

Drive is not the primary database backup layer.
