# Gestione Prodotti Interni (Preparazioni Annidate)

## Obiettivo
Gestire il caso in cui una ricetta usa una preparazione interna (es. `bouillon de poisson`) che ha una propria fiche tecnica.

In checklist ordini, la preparazione interna non deve rimanere "scatola chiusa": deve essere espansa negli ingredienti base (arrêtes, oignons, thym, ecc.).

## Comportamento Backend

Endpoint interessato:
- `GET /api/v1/servizio/ingredients?site=<uuid>&date=YYYY-MM-DD&view=supplier|recipe`

Logica:
1. Legge le voci carta (`ServiceMenuEntry`) per sede/data.
2. Applica filtro validita:
   - `metadata.valid_from` / `metadata.valid_to` (se presenti).
3. Per ogni voce ricetta trova la `RecipeSnapshot`.
4. Calcola moltiplicatore porzioni:
   - `multiplier = expected_qty / snapshot.portions` (se `portions > 0`)
   - fallback: `multiplier = expected_qty`
5. Estrae ingredienti dalla fiche.
6. Se un ingrediente ha titolo uguale a un'altra `RecipeSnapshot`, lo tratta come preparazione interna e lo espande ricorsivamente.
7. Protezioni:
   - rilevamento cicli
   - profondita massima di espansione
8. Normalizza unita:
   - `g -> kg`
   - `ml, cl -> l`
   - pezzi varianti -> `pc`

Campi aggiunti nelle righe ingredienti:
- `source_type`: `direct` oppure `derived_recipe`
- `source_recipe_title`: titolo della preparazione interna origine (se derivato)

## Comportamento Frontend

Schermata:
- `Comande` (`frontend/src/App.tsx`)

Visualizzazione:
- Nella tabella aggregata fornitore appare colonna `Origine`.
- Nella vista per ricetta appare badge per ogni ingrediente derivato.
- Badge usato:
  - `PR: <titolo preparazione>`
  - Tooltip: `Derivato da preparazione interna`

Stile:
- classe CSS `.origin-badge` in `frontend/src/styles.css`

## Cosa deve fare l'utente operativo

1. In `Ricette e carte`, impostare sempre la **Data servizio corretta**.
2. Impostare `Porzioni target` reali (mai lasciare valori predefiniti non voluti).
3. In `Comande`, generare checklist sulla stessa data.
4. Verificare i badge `PR:`:
   - indicano ingredienti derivati da una preparazione interna.
5. Stampare checklist con campi `Rimanenza` e `Da ordinare`.

## Buone pratiche consigliate

1. Standardizzare i titoli fiche:
   - usare un naming coerente (`bouillon de poisson` sempre uguale).
2. Evitare duplicati quasi identici:
   - differenze minime nel titolo impediscono match automatico.
3. Tenere aggiornata la fiche della preparazione base:
   - una modifica alla base impatta tutte le ricette che la usano.
4. Validare porzioni fiche:
   - se porzioni sono errate, tutto il fabbisogno risulta scalato male.

## Limiti attuali (versione corrente)

1. Il riconoscimento preparazione interna e basato su match titolo (case-insensitive).
2. Non esiste ancora un flag esplicito "ingrediente = preparazione interna" nella fiche.
3. In caso di naming ambiguo, puo avvenire un'espansione non desiderata.

## Evoluzione consigliata

1. Aggiungere in fiche un campo esplicito:
   - `ingredient_type: raw | internal_recipe`
   - `internal_recipe_fiche_product_id`
2. Salvare in CookOps una tabella di mapping esplicito tra ingredienti e fiche interne.
3. Aggiungere una schermata di controllo "Espansioni PR" con override manuale.
