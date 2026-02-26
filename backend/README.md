# CookOps

CookOps = **Cook Operations**: achats, stocks, BL/factures, ventes POS, rapprochements, reporting.

## Dossiers
- `docs/architecture.md` : architecture & principes.
- `docs/data-model.sql` : DDL PostgreSQL (MVP).
- `docs/openapi.v1.yaml` : squelette OpenAPI (MVP).
- `docs/contracts.md` : règles de compatibilité inter-app.

## Priorité MVP
1) Catalog (suppliers + supplier_products)
2) Import ventes POS (CSV/JSON)
3) Mapping POS → recipe/product
4) Report “théorique vs réel” (premier niveau)

## Next
- BL + lots + inventory snapshots
- Reconciliation BL ↔ lots ↔ factures
- Connecteurs (Lightspeed, Sage, Pennylane) via adapters
