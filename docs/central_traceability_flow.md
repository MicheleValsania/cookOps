# Central Traceability Flow

## Target role of CookOps

CookOps is the central backoffice for traceability governance.

It is responsible for:
- Drive photo import
- OCR extraction and validation
- manual upload of delivery notes and invoices
- document reconciliation
- central lot creation
- HACCP planning
- label profile management
- structure governance for sites, sectors and cold points
- distribution of central lots to units

## Target role of Traccia

Traccia remains the local operational app for each point of sale.

It is responsible for:
- continuous camera capture
- local temperature execution
- local label execution
- local cleaning execution
- use of precompiled label profiles managed in CookOps
- insertion or confirmation of source lot in label workflows

## Current strategic choices

- All incoming traceability data enters as central.
- Invoices and delivery notes are uploaded manually in CookOps for now.
- Data extraction from immediate single-photo camera workflows is not a target flow.
- The standalone lifecycle section in Traccia is deprecated.
- Lifecycle logic stays operationally available inside the label workflow.

## Target central flow

1. Continuous camera captures images.
2. Traccia uploads the images to Drive and stores only a local asset reference.
3. Images are imported into CookOps from Drive.
4. OCR extraction runs centrally.
5. A central operator validates and corrects extracted data.
6. Delivery notes and invoices are attached manually.
7. CookOps creates the central lot.
8. Local units execute operations through Traccia.
