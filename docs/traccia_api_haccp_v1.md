# Traccia HACCP API v1 for CookOps Alignment

Last update: 2026-03-12

## Purpose

This document defines the minimum Traccia API surface needed so CookOps can become the single planning/admin UI for HACCP while Traccia remains the execution backend.

It is designed to be:

- compatible with the CookOps proxy layer already present
- progressive, so current `site + area` payloads can continue to work during migration
- aligned with the richer Traccia mobile logic already used for temperature and labels

## Design rules

- `site` is the top-level scope
- `sector` belongs to a `site`
- `cold_point` belongs to a `sector`
- CookOps creates and syncs structure
- Traccia executes and reports back status
- all dates use ISO 8601 UTC

## 1. Site registry

### `GET /api/v1/haccp/sites/`

Returns the list of HACCP-enabled sites known by Traccia.

Response:

```json
{
  "results": [
    {
      "id": "uuid",
      "external_site_id": "cookops-site-uuid",
      "code": "SNACK_BAR",
      "label": "snack bar",
      "is_active": true
    }
  ]
}
```

### `POST /api/v1/haccp/sites/sync/`

Upsert sites coming from CookOps.

Request:

```json
{
  "schema_version": "1.0",
  "sites": [
    {
      "external_site_id": "cookops-site-uuid",
      "code": "CENTRALE_FROID",
      "label": "celle centrali",
      "is_active": true
    }
  ]
}
```

Behavior:

- `external_site_id` is the CookOps site UUID
- if site exists, update label/status
- if not, create
- Traccia internal UUID may differ from `external_site_id`, but the mapping must be stable

## 2. Sector registry

### `GET /api/v1/haccp/sectors/?site=<site_uuid>`

Response:

```json
{
  "results": [
    {
      "id": "uuid",
      "site": "uuid",
      "external_sector_id": "optional-stable-id",
      "code": "restaurant",
      "label": "Restaurant",
      "sort_order": 1,
      "is_active": true
    }
  ]
}
```

### `POST /api/v1/haccp/sectors/sync/`

Request:

```json
{
  "schema_version": "1.0",
  "site": "uuid",
  "sectors": [
    {
      "external_sector_id": "optional-stable-id",
      "code": "restaurant",
      "label": "Restaurant",
      "sort_order": 1,
      "is_active": true
    }
  ]
}
```

## 3. Cold-point registry

### `GET /api/v1/haccp/cold-points/?site=<site_uuid>&sector=<sector_uuid_or_code>`

Response:

```json
{
  "results": [
    {
      "id": "uuid",
      "site": "uuid",
      "sector": "uuid",
      "external_cold_point_id": "optional-stable-id",
      "code": "frigo_viande_1",
      "label": "Frigo viande 1",
      "equipment_type": "FRIDGE",
      "sort_order": 1,
      "is_active": true
    }
  ]
}
```

### `POST /api/v1/haccp/cold-points/sync/`

Request:

```json
{
  "schema_version": "1.0",
  "site": "uuid",
  "sector": "uuid",
  "cold_points": [
    {
      "external_cold_point_id": "optional-stable-id",
      "code": "frigo_viande_1",
      "label": "Frigo viande 1",
      "equipment_type": "FRIDGE",
      "sort_order": 1,
      "is_active": true
    }
  ]
}
```

Allowed `equipment_type` values:

- `FRIDGE`
- `FREEZER`
- `COLD_ROOM`
- `OTHER`

## 4. HACCP schedule API

This extends the current Traccia schedule model used by CookOps.

### `GET /api/v1/haccp/schedules/?site=<site_uuid>&task_type=<task_type>`

Current endpoint can remain, but response must be enriched.

Response:

```json
{
  "results": [
    {
      "id": "uuid",
      "site": "uuid",
      "task_type": "temperature_register",
      "title": "Controle frigo viande matin",
      "area": "Restaurant / Frigo viande 1",
      "sector_code": "restaurant",
      "sector_label": "Restaurant",
      "cold_point_code": "frigo_viande_1",
      "cold_point_label": "Frigo viande 1",
      "equipment_type": "FRIDGE",
      "starts_at": "2026-03-12T07:00:00Z",
      "ends_at": "2026-03-12T07:15:00Z",
      "status": "planned",
      "recurrence_rule": {}
    }
  ]
}
```

Compatibility rule:

- `area` stays available during migration
- new semantic fields must be added without breaking existing clients

### `POST /api/v1/haccp/schedules/`

Request:

```json
{
  "site": "uuid",
  "task_type": "temperature_register",
  "title": "Controle frigo viande matin",
  "area": "Restaurant / Frigo viande 1",
  "sector_code": "restaurant",
  "sector_label": "Restaurant",
  "cold_point_code": "frigo_viande_1",
  "cold_point_label": "Frigo viande 1",
  "equipment_type": "FRIDGE",
  "starts_at": "2026-03-12T07:00:00Z",
  "ends_at": "2026-03-12T07:15:00Z",
  "status": "planned",
  "recurrence_rule": {},
  "metadata": {
    "source_app": "cookops-web"
  }
}
```

Validation rules:

- `site`, `task_type`, `title`, `starts_at` required
- `sector_code` required for `temperature_register`
- `cold_point_code` required for `temperature_register`
- `equipment_type` required for `temperature_register`
- `label_print` can omit `cold_point_code`
- `cleaning` can omit `cold_point_code` and use only `sector_code` if needed

### `PATCH /api/v1/haccp/schedules/{schedule_id}/`

Must support partial update of:

- `title`
- `starts_at`
- `ends_at`
- `status`
- `sector_code`
- `cold_point_code`
- `equipment_type`
- `metadata`

### `DELETE /api/v1/haccp/schedules/{schedule_id}/`

Hard delete is acceptable for now.

If Traccia prefers soft delete:

- return `status = "cancelled"`
- keep `DELETE` mapped to cancellation semantics

## 5. Label profiles

This is the second missing piece compared to the current mobile Traccia flow.

### `GET /api/v1/haccp/label-profiles/?site=<site_uuid>`

Response:

```json
{
  "results": [
    {
      "id": "uuid",
      "site": "uuid",
      "name": "Supreme poulet",
      "template_type": "PREPARATION",
      "shelf_life_value": 3,
      "shelf_life_unit": "days",
      "packaging": "sotto vuoto",
      "storage_hint": "0/+3 C",
      "allergens_text": "",
      "is_active": true
    }
  ]
}
```

### `POST /api/v1/haccp/label-profiles/`

Request:

```json
{
  "site": "uuid",
  "name": "Supreme poulet",
  "template_type": "PREPARATION",
  "shelf_life_value": 3,
  "shelf_life_unit": "days",
  "packaging": "sotto vuoto",
  "storage_hint": "0/+3 C",
  "allergens_text": ""
}
```

Allowed `template_type` values:

- `PREPARATION`
- `RAW_MATERIAL`
- `TRANSFORMATION`

Allowed `shelf_life_unit` values:

- `hours`
- `days`
- `months`

### `PATCH /api/v1/haccp/label-profiles/{profile_id}/`

Partial update of the profile fields.

## 6. Label print sessions

### `GET /api/v1/haccp/label-sessions/?site=<site_uuid>`

### `POST /api/v1/haccp/label-sessions/`

Request:

```json
{
  "site": "uuid",
  "profile_id": "uuid",
  "planned_schedule_id": "uuid",
  "source_lot_code": "optional",
  "quantity": 12,
  "status": "planned"
}
```

This separates:

- profile configuration
- print planning
- actual print execution

## 7. OCR validation

Current endpoint can remain:

- `POST /api/v1/haccp/ocr-results/{document_id}/validate/`

But Traccia should support:

- `status`
- `notes`
- `corrected_payload`

This is already aligned with the current CookOps proxy serializer.

## 8. Migration path

### Phase 1

- keep current schedule endpoint shape
- accept new optional fields:
  - `sector_code`
  - `sector_label`
  - `cold_point_code`
  - `cold_point_label`
  - `equipment_type`

### Phase 2

- add `sites/sync`, `sectors/sync`, `cold-points/sync`
- CookOps starts syncing structure before planning

### Phase 3

- add `label-profiles` and `label-sessions`
- CookOps replaces generic label planning UI with profile/session UX

### Phase 4

- Traccia planning/admin screens become hidden or read-only

## 9. Minimum acceptance checklist

Traccia is considered ready for CookOps alignment when:

- site registry exists and sync works
- sector registry exists and sync works
- cold-point registry exists and sync works
- schedules accept semantic planning fields
- OCR validation still works with corrected payload
- label profiles and label sessions exist
- all endpoints return stable IDs and consistent `site` scoping

Implementation plan:

- [traccia_implementation_checklist.md](/c:/Users/user/chefside/cookOps/docs/traccia_implementation_checklist.md)
- [traccia_postman_payloads.md](/c:/Users/user/chefside/cookOps/docs/traccia_postman_payloads.md)
