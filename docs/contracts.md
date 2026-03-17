# Contracts and Compatibility (CookOps v0.1)

## 1) Fiches <-> CookOps

CookOps pushes stable `supplierId` / `supplierProductId` into Fiches for deterministic food cost.

Rules:

- never recycle a `supplier_product_id`
- rename = same ID, new `name`
- Fiches export to CookOps uses JSON envelope `export_version: "1.1"` with `source_app: "fiches-recettes"`
- snapshot import endpoint in CookOps:
  - `POST /api/v1/integration/fiches/snapshots/import-envelope/`
  - hash rule: SHA-256 on canonical payload
  - unchanged hash => ignore snapshot
  - changed hash => create a new snapshot and keep history

## 2) Traccia <-> CookOps

Shared payloads must use a versioned contract (`schema_version`) and canonical quantities.

Rules:

- accept unknown optional fields for forward compatibility and log them
- reject invalid payloads when contract-critical fields are broken
- use CookOps as planning/admin source of truth
- use Traccia as execution/traceability source of truth

For the current HACCP alignment, see:

- [haccp_alignment.md](/c:/Users/user/chefside/cookOps/docs/haccp_alignment.md)
- [traccia_api_haccp_v1.md](/c:/Users/user/chefside/cookOps/docs/traccia_api_haccp_v1.md)

Key direction:

- sites are created and governed from CookOps web
- sectors and cold points must be modeled explicitly in Traccia
- temperature and label planning should be authored in CookOps, executed in Traccia
- Traccia planning UI should become hidden or read-only once CookOps planning is complete

## 3) Versioning

- minor/patch = add optional fields
- major = breaking change + new integration pipeline

## 4) Golden Payload Tests

Maintain at least:

- `valid.json`
- `warning.json`
- `invalid.json`
