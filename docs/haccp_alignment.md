# HACCP Alignment: CookOps <-> Traccia

Last update: 2026-03-11

## Goal

Use CookOps web as the single planning surface for HACCP, while Traccia remains the execution backend for:

- OCR extraction and validation
- temperature readings and task completion
- label execution and print lifecycle
- lot lifecycle and traceability

This keeps planning/admin centralized in CookOps and reduces operator-facing complexity in Traccia.

## Ownership

`CookOps` is the source of truth for:

- site creation and activation
- organizational structure used for planning
- HACCP planning for temperatures, labels, cleaning
- permissions for who can program activities

`Traccia` is the source of truth for:

- OCR queue and OCR validation state
- lifecycle events
- execution status of planned HACCP tasks
- measured/observed field data

## Shared model

The current `site` concept already exists in CookOps and must become the top-level routing key for Traccia as well.

Recommended structure:

1. `site`
2. `sector`
3. `cold_point`

Definitions:

- `site`: business unit or logistics unit visible in CookOps
- `sector`: operational zone inside a site, for example `restaurant`, `production`, `bar`, `central_storage`
- `cold_point`: physical controlled equipment/room inside a sector, for example `frigo1`, `freezer_a`, `cold_room_main`

Important rule:

- sectors are not equivalent to CookOps sites
- central cold rooms shared by multiple outlets should be modeled as their own CookOps site, then subdivided into sectors/cold points

This is the cleanest way to handle central cells serving multiple points of sale without overloading the meaning of a site.

## Planning objects

CookOps should plan the following task families:

- `temperature_register`
- `label_print`
- `cleaning`

Each planned item should progressively converge toward this payload:

```json
{
  "site": "uuid",
  "task_type": "temperature_register",
  "title": "Controle frigo viande matin",
  "sector_code": "restaurant",
  "sector_label": "Restaurant",
  "cold_point_code": "frigo_viande_1",
  "cold_point_label": "Frigo viande 1",
  "equipment_type": "FRIDGE",
  "starts_at": "2026-03-11T07:00:00Z",
  "ends_at": "2026-03-11T07:15:00Z",
  "status": "planned",
  "recurrence_rule": {}
}
```

Notes:

- `sector_*` and `cold_point_*` should be optional for non-temperature tasks, but supported by the schema
- `equipment_type` is mainly useful for temperature planning
- `title` remains useful for operator readability, but should not be the only semantic field

## Recovering existing Traccia logic

From the current Traccia mobile flows already used in operations:

### Temperature

The existing logic is richer than the current CookOps web form and includes:

- sector selection
- cold-point list by sector
- cold-point creation with typed equipment:
  - `FRIDGE`
  - `FREEZER`
  - `COLD_ROOM`
  - `OTHER`

CookOps should absorb this same planning model instead of reducing everything to a free-text `area`.

### Labels

The existing Traccia flow includes:

- site context
- label profile creation
- template type selection:
  - `PREPARATION`
  - `RAW_MATERIAL`
  - `TRANSFORMATION`
- shelf life value + unit
- packaging
- conservation
- allergens text

CookOps should manage profile configuration and label sessions, while Traccia should execute/print.

## UI direction

### CookOps web

CookOps becomes the admin/planning UI:

- create and manage sites
- manage sectors and cold points
- plan temperature tasks
- manage label profiles and label sessions
- manage cleaning plans
- review OCR validation and lifecycle anomalies

### Traccia UI

Traccia should be simplified:

- execution-oriented screens stay visible
- planning/admin screens become hidden or read-only
- site/sector/cold-point structures are consumed from CookOps sync

This avoids dual entry and accidental changes outside the central workflow.

## Reconciliation scope

Traceability reconciliation should be treated as a central workflow, not as a strictly local site screen.

Recommended behavior:

- users can enter reconciliation from any site context
- the originating site is used only as the initial filter
- the reconciliation page itself must be able to switch to:
  - the originating site
  - another single site
  - all sites

This keeps day-to-day access simple for unit users while preserving a single central place to reconcile:

- traceability photos
- lifecycle events
- delivery notes
- invoices
- lots

Rule:

- operational traceability work stays site-based
- reconciliation works on a central dataset with an optional site filter

## Sync strategy

Recommended rollout:

1. CookOps creates/updates `site`
2. CookOps syncs site structure to Traccia:
   - sites
   - sectors
   - cold points
3. CookOps creates/updates HACCP planning in Traccia
4. Traccia returns execution state, validation state, lifecycle data
5. CookOps displays operational reports and reconciliation views

## Constraints for current codebase

Current frontend/backend already support:

- site selection in CookOps
- HACCP proxy calls through CookOps backend
- schedule create/update/delete
- OCR validation
- lifecycle and reconciliation overview

Current gaps:

- no explicit `sector` / `cold_point` fields in CookOps HACCP schedule payload
- label logic still modeled as generic `label_print` schedule instead of profile/session structure
- validation UI is read-only + confirm/reject, not editable field-by-field
- reports are still presented as printable views rather than live operational tables

## Next implementation steps

1. Extend the Traccia API contract to expose and accept:
   - site registry
   - sector registry
   - cold-point registry
2. Update CookOps HACCP schedule payload to carry:
   - `sector_code`
   - `cold_point_code`
   - `equipment_type`
3. Replace free-text planning forms in CookOps with:
   - sector picker
   - cold-point picker
   - typed equipment setup
4. Split label planning into:
   - profile management
   - print sessions
5. Rework HACCP report pages as live tables first, print second
6. Turn Traccia planning screens into hidden/read-only operator views

Related API spec:

- [traccia_api_haccp_v1.md](/c:/Users/user/chefside/cookOps/docs/traccia_api_haccp_v1.md)
- [traccia_implementation_checklist.md](/c:/Users/user/chefside/cookOps/docs/traccia_implementation_checklist.md)
