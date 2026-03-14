# Documentation Cleanup Notes

## Current role of CookOps docs

CookOps documentation should become the primary written source for:
- central traceability flow
- HACCP central governance
- Drive import and OCR validation flow
- Traccia integration boundaries

## Docs to keep visible

| File | Status | Action |
|---|---|---|
| `docs/central_traceability_flow.md` | keep | New core document for central governance. |
| `docs/haccp_alignment.md` | keep | Keep as technical alignment note between apps. |
| `docs/traccia_api_haccp_v1.md` | keep | Keep as the backend integration contract. |
| `docs/traccia_implementation_checklist.md` | keep | Keep as delivery checklist until cleanup is complete. |
| `docs/traccia_postman_payloads.md` | keep | Keep as operator/dev verification appendix. |
| `docs/contracts.md` | rewrite | Simplify and align to the current real flows only. |
| `docs/architecture.md` | rewrite | Recenter on CookOps as central operations platform. |

## Docs to simplify later

| File | Status | Action |
|---|---|---|
| `docs/frontend-roadmap.md` | rewrite | Update after the HACCP and traceability central flows stabilize. |
| `docs/internal-products.md` | inspect | Keep only if still aligned with the product scope. |
| `docs/openapi.v1.yaml` | inspect | Verify against current implemented API surface. |

## Practical next steps

1. Merge overlapping traceability notes into one central narrative.
2. Keep adapter/API docs technical and short.
3. Move obsolete exploratory notes to an archive folder later.
4. Keep CookOps docs focused on governance, validation and central workflows.
