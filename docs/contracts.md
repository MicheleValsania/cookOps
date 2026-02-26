# Contrats & compatibilité (CookOps v0.1)

## 1) Fiches ⇄ CookOps
CookOps pousse dans Fiches des IDs stables `supplierId` / `supplierProductId` pour un food-cost déterministe.

Règles:
- Ne jamais recycler un `supplier_product_id`.
- Renommage = même ID, nouveau `name`.

## 2) Traccia ⇄ CookOps
Enveloppe JSON versionnée (`schema_version`) et quantités canoniques `{value, unit}`.

Règles:
- accepter champs inconnus (forward-compatible) et logguer
- rejeter payloads invalides (schema_version, qty non parseable pour produit sensible, etc.)

## 3) Versioning
- minor/patch = ajout de champs optionnels
- major = breaking change + nouvelle pipeline

## 4) Golden payload tests
Maintenir:
- valid.json
- warning.json
- invalid.json
