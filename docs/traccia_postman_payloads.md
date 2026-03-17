# Traccia HACCP Test Payloads

Last update: 2026-03-12

This file contains ready-to-use example payloads for manual testing of the Traccia backend once the HACCP alignment endpoints are implemented.

Use them as:

- Postman request bodies
- `curl` JSON payloads
- golden fixtures for backend tests

Base assumptions:

- CookOps site UUIDs are used as the external source identifiers
- Traccia keeps its own internal IDs if needed
- all timestamps are UTC ISO 8601

## 1. Sync sites

Endpoint:

- `POST /api/v1/haccp/sites/sync/`

Payload:

```json
{
  "schema_version": "1.0",
  "sites": [
    {
      "external_site_id": "7baf3dc7-f4f7-4f70-9a41-e8198cdd8891",
      "code": "SNACK_BAR",
      "label": "snack bar",
      "is_active": true
    },
    {
      "external_site_id": "d1a30745-6c77-4da1-9f5d-e9dcb28ce2d4",
      "code": "CENTRALE_FROID",
      "label": "celle centrali",
      "is_active": true
    }
  ]
}
```

## 2. Sync sectors

Endpoint:

- `POST /api/v1/haccp/sectors/sync/`

Payload for `CENTRALE_FROID`:

```json
{
  "schema_version": "1.0",
  "site": "d1a30745-6c77-4da1-9f5d-e9dcb28ce2d4",
  "sectors": [
    {
      "external_sector_id": "centrale-prep-froide",
      "code": "prep_froide",
      "label": "Preparation froide",
      "sort_order": 1,
      "is_active": true
    },
    {
      "external_sector_id": "centrale-stock-froid",
      "code": "stock_froid",
      "label": "Stock froid",
      "sort_order": 2,
      "is_active": true
    }
  ]
}
```

## 3. Sync cold points

Endpoint:

- `POST /api/v1/haccp/cold-points/sync/`

Payload for sector `prep_froide`:

```json
{
  "schema_version": "1.0",
  "site": "d1a30745-6c77-4da1-9f5d-e9dcb28ce2d4",
  "sector": "centrale-prep-froide",
  "cold_points": [
    {
      "external_cold_point_id": "prep-frigo-1",
      "code": "frigo_prep_1",
      "label": "Frigo prep 1",
      "equipment_type": "FRIDGE",
      "sort_order": 1,
      "is_active": true
    },
    {
      "external_cold_point_id": "prep-cellule-1",
      "code": "cellule_1",
      "label": "Cellule 1",
      "equipment_type": "COLD_ROOM",
      "sort_order": 2,
      "is_active": true
    }
  ]
}
```

## 4. Create temperature schedule

Endpoint:

- `POST /api/v1/haccp/schedules/`

Payload:

```json
{
  "site": "d1a30745-6c77-4da1-9f5d-e9dcb28ce2d4",
  "task_type": "temperature_register",
  "title": "Controle prep froide matin",
  "area": "Preparation froide / Frigo prep 1",
  "sector_code": "prep_froide",
  "sector_label": "Preparation froide",
  "cold_point_code": "frigo_prep_1",
  "cold_point_label": "Frigo prep 1",
  "equipment_type": "FRIDGE",
  "starts_at": "2026-03-12T06:30:00Z",
  "ends_at": "2026-03-12T06:45:00Z",
  "status": "planned",
  "recurrence_rule": {
    "frequency": "daily"
  },
  "metadata": {
    "source_app": "cookops-web"
  }
}
```

## 5. Update schedule status

Endpoint:

- `PATCH /api/v1/haccp/schedules/{schedule_id}/`

Payload:

```json
{
  "status": "done"
}
```

## 6. Create cleaning schedule

Endpoint:

- `POST /api/v1/haccp/schedules/`

Payload:

```json
{
  "site": "7baf3dc7-f4f7-4f70-9a41-e8198cdd8891",
  "task_type": "cleaning",
  "title": "Sanificazione banco bar",
  "area": "Bar",
  "sector_code": "bar",
  "sector_label": "Bar",
  "starts_at": "2026-03-12T22:00:00Z",
  "ends_at": "2026-03-12T22:30:00Z",
  "status": "planned",
  "recurrence_rule": {
    "frequency": "daily"
  },
  "metadata": {
    "source_app": "cookops-web"
  }
}
```

## 7. Create label profile

Endpoint:

- `POST /api/v1/haccp/label-profiles/`

Payload:

```json
{
  "site": "7baf3dc7-f4f7-4f70-9a41-e8198cdd8891",
  "name": "Supreme poulet",
  "template_type": "PREPARATION",
  "shelf_life_value": 3,
  "shelf_life_unit": "days",
  "packaging": "sotto vuoto",
  "storage_hint": "0/+3 C",
  "allergens_text": ""
}
```

## 8. Create label print session

Endpoint:

- `POST /api/v1/haccp/label-sessions/`

Payload:

```json
{
  "site": "7baf3dc7-f4f7-4f70-9a41-e8198cdd8891",
  "profile_id": "ba77dff4-4b4b-4a29-b0fc-3c0b88c8f891",
  "planned_schedule_id": "2f777e6b-7f3c-4f71-b0f2-4706bd07a4d1",
  "source_lot_code": "",
  "quantity": 12,
  "status": "planned"
}
```

## 9. OCR validation with corrected payload

Endpoint:

- `POST /api/v1/haccp/ocr-results/{document_id}/validate/`

Payload:

```json
{
  "extraction_id": "cbebd8a5-d559-4620-a3af-7df9f1d42a63",
  "status": "validated",
  "notes": "Lotto e DLC corretti manualmente.",
  "corrected_payload": {
    "lot_code": "LOT-2026-0312-A",
    "production_date": "2026-03-12",
    "expiry_date": "2026-03-15",
    "allergens": [
      "gluten",
      "milk"
    ]
  }
}
```

## 10. Suggested manual test order

1. Sync sites
2. Sync sectors
3. Sync cold points
4. Create one temperature schedule
5. Read schedules back with `GET /api/v1/haccp/schedules/?site=...`
6. Patch schedule status to `done`
7. Create one label profile
8. Create one label session
9. Validate one OCR extraction with corrected payload

## 11. Expected acceptance signals

- site sync is idempotent
- sector and cold-point codes remain stable
- temperature schedules reject payloads missing `sector_code`, `cold_point_code`, or `equipment_type`
- label profile and session entities are separated
- OCR validation persists `corrected_payload`

