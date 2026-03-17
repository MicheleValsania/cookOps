# Traccia Implementation Checklist for CookOps HACCP Alignment

Last update: 2026-03-12

## Goal

This checklist turns the HACCP alignment contract into a concrete implementation plan for the Traccia repo.

Primary objective:

- keep Traccia strong on execution
- move planning/admin control to CookOps web
- avoid dual editing of sites, sectors, cold points, temperature planning, and label planning

Reference docs:

- [haccp_alignment.md](/c:/Users/user/chefside/cookOps/docs/haccp_alignment.md)
- [traccia_api_haccp_v1.md](/c:/Users/user/chefside/cookOps/docs/traccia_api_haccp_v1.md)
- [traccia_postman_payloads.md](/c:/Users/user/chefside/cookOps/docs/traccia_postman_payloads.md)

## Phase 1: Backend foundation

### 1. Site model alignment

- Add Traccia-side model mapping to CookOps site identity.
- Store `external_site_id` = CookOps UUID.
- Enforce uniqueness on `external_site_id`.
- Keep Traccia internal ID if the app already depends on it.

Done when:

- Traccia can upsert a site from CookOps without creating duplicates.

### 2. Sector model

- Add `Sector` entity linked to `site`.
- Fields:
  - `id`
  - `site`
  - `external_sector_id` optional
  - `code`
  - `label`
  - `sort_order`
  - `is_active`
- Enforce uniqueness on:
  - `site + code`

Done when:

- One site can contain multiple sectors.

### 3. Cold-point model

- Add `ColdPoint` entity linked to `sector` and `site`.
- Fields:
  - `id`
  - `site`
  - `sector`
  - `external_cold_point_id` optional
  - `code`
  - `label`
  - `equipment_type`
  - `sort_order`
  - `is_active`
- Allowed `equipment_type`:
  - `FRIDGE`
  - `FREEZER`
  - `COLD_ROOM`
  - `OTHER`
- Enforce uniqueness on:
  - `sector + code`

Done when:

- One sector can contain multiple cold points with typed equipment.

## Phase 2: Sync APIs from CookOps

### 4. Site sync endpoint

Implement:

- `POST /api/v1/haccp/sites/sync/`
- `GET /api/v1/haccp/sites/`

Rules:

- `external_site_id` from CookOps is the stable foreign key
- site label and active state are overwritten by CookOps

Done when:

- CookOps can push all current sites and Traccia reflects them deterministically.

### 5. Sector sync endpoint

Implement:

- `POST /api/v1/haccp/sectors/sync/`
- `GET /api/v1/haccp/sectors/?site=<site_uuid>`

Rules:

- payload is site-scoped
- `code` is stable inside site

Done when:

- CookOps can fully define the operational zoning of a site.

### 6. Cold-point sync endpoint

Implement:

- `POST /api/v1/haccp/cold-points/sync/`
- `GET /api/v1/haccp/cold-points/?site=<site_uuid>&sector=<sector_uuid_or_code>`

Rules:

- payload is site + sector scoped
- cold point remains stable by `code`

Done when:

- CookOps can fully define temperature measurement points.

## Phase 3: Schedule contract upgrade

### 7. Extend current schedule schema

Current schedule already supports:

- `site`
- `task_type`
- `title`
- `area`
- `starts_at`
- `ends_at`
- `status`

Add support for:

- `sector_code`
- `sector_label`
- `cold_point_code`
- `cold_point_label`
- `equipment_type`
- `metadata.source_app`

Important:

- keep `area` during migration
- do not break old mobile clients immediately

Done when:

- Traccia accepts semantic planning data from CookOps without losing compatibility.

### 8. Validation rules by task type

For `temperature_register`:

- require `sector_code`
- require `cold_point_code`
- require `equipment_type`

For `label_print`:

- allow `sector_code`
- `cold_point_code` optional

For `cleaning`:

- `sector_code` recommended
- `cold_point_code` optional

Done when:

- invalid planning payloads are rejected early and clearly.

### 9. PATCH/DELETE behavior

Ensure:

- `PATCH /api/v1/haccp/schedules/{id}/` supports status and semantic fields
- `DELETE /api/v1/haccp/schedules/{id}/` is stable

If Traccia prefers soft delete:

- map delete to `status = cancelled`

Done when:

- CookOps can safely manage schedule lifecycle from the web.

## Phase 4: Labels

### 10. Label profile model

Implement `LabelProfile` with fields:

- `site`
- `name`
- `template_type`
- `shelf_life_value`
- `shelf_life_unit`
- `packaging`
- `storage_hint`
- `allergens_text`
- `is_active`

Allowed `template_type`:

- `PREPARATION`
- `RAW_MATERIAL`
- `TRANSFORMATION`

Done when:

- profile configuration is no longer mixed into generic schedule data.

### 11. Label profile API

Implement:

- `GET /api/v1/haccp/label-profiles/?site=<site_uuid>`
- `POST /api/v1/haccp/label-profiles/`
- `PATCH /api/v1/haccp/label-profiles/{id}/`

Done when:

- CookOps can manage label profile configuration centrally.

### 12. Label session model

Implement `LabelSession` or equivalent with:

- `site`
- `profile_id`
- `planned_schedule_id` optional
- `source_lot_code` optional
- `quantity`
- `status`

Done when:

- printing can be tracked separately from profile setup.

### 13. Label session API

Implement:

- `GET /api/v1/haccp/label-sessions/?site=<site_uuid>`
- `POST /api/v1/haccp/label-sessions/`

Done when:

- CookOps can create print sessions and Traccia can execute them.

## Phase 5: OCR validation

### 14. Keep current OCR validation endpoint

Maintain:

- `POST /api/v1/haccp/ocr-results/{document_id}/validate/`

Ensure payload supports:

- `status`
- `notes`
- `corrected_payload`

Done when:

- CookOps can evolve from confirm/reject to edited-field validation without API redesign.

## Phase 6: Traccia UI reduction

### 15. Make planning/admin screens read-only or hidden

Once CookOps planning is live:

- hide site creation in Traccia UI
- hide sector creation in Traccia UI
- hide cold-point creation in Traccia UI
- hide temperature planning forms in Traccia UI
- hide label planning/profile admin in Traccia UI

Keep visible:

- execution screens
- task completion
- OCR review if still needed operationally
- lifecycle tracking

Done when:

- operators execute work in Traccia but do not own planning.

## Phase 7: Integration tests

### 16. Add API tests in Traccia

Minimum test set:

- site sync upsert
- sector sync upsert
- cold-point sync upsert
- schedule create with semantic fields
- schedule patch status
- schedule delete/cancel
- label profile CRUD
- label session create
- OCR validate with corrected payload

Done when:

- the CookOps integration contract is stable under CI.

## Phase 8: CookOps follow-up

These changes are not in Traccia, but Traccia backend should expect them next:

- CookOps replacing free-text `area` with selectors for sector/cold point
- CookOps report pages becoming live tables first, print second
- CookOps label UI splitting profile management from print sessions
- CookOps validation page becoming editable field-by-field

## Delivery order

Recommended order in Traccia repo:

1. models + migrations for site mapping, sector, cold point
2. sync endpoints
3. schedule schema extension
4. label profile/session models and APIs
5. UI restrictions in Traccia
6. tests

## Definition of done

Traccia is ready for the next CookOps integration step when:

- structure sync is implemented
- semantic schedule fields are accepted
- labels have profile/session APIs
- OCR validation accepts corrected payload
- Traccia planning UI is no longer the authoritative admin surface
