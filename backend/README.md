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

## HACCP/Traccia integration (CookOps as gateway)
CookOps frontend stays single-app and calls only CookOps API.
CookOps backend proxies HACCP/Traccia calls server-to-server.

Environment variables (backend):
- `TRACCIA_API_BASE_URL` (example: `https://traccia.example.com`)
- `TRACCIA_API_KEY` (API key used by CookOps when calling Traccia)
- `TRACCIA_TIMEOUT_SECONDS` (default `12`)

Proxy endpoints exposed by CookOps:
- `GET /api/v1/haccp/traccia/ocr-queue/`
- `POST /api/v1/haccp/traccia/ocr-queue/{document_id}/validate/`
- `GET /api/v1/haccp/traccia/lifecycle/`
- `GET /api/v1/haccp/traccia/reconciliation-overview/`
- `GET/POST /api/v1/haccp/schedules/`
- `PATCH/DELETE /api/v1/haccp/schedules/{schedule_id}/`

## Import snapshots da Fiches (JSON v1.1)
- Endpoint: `POST /api/v1/integration/fiches/snapshots/import-envelope/`
- Header richiesto: `X-API-Key`
- Idempotenza consigliata: `Idempotency-Key`
- Formato supportato:
  - envelope `export_version: "1.1"`
  - `source_app: "fiches-recettes"`
  - array `fiches`

Esempio PowerShell:
```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "http://127.0.0.1:8000/api/v1/integration/fiches/snapshots/import-envelope/" `
  -Headers @{ "X-API-Key" = "dev-api-key"; "Idempotency-Key" = "fiches-2026-02-28-01" } `
  -ContentType "application/json" `
  -Body (@{ envelope = (Get-Content .\fiches-techniques.json -Raw | ConvertFrom-Json) } | ConvertTo-Json -Depth 100)
```
