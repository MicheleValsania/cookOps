# CookOps Frontend Roadmap

## 1. Obiettivo
Costruire un frontend professionale, scalabile e orientato a utenti operativi (chef, manager, magazzino), con navigazione chiara per area funzionale.

## 2. Principi UX
- Linguaggio ristorante, non tecnico.
- Ogni pagina deve rispondere a una domanda operativa precisa.
- Flussi complessi guidati (wizard/modal), non form lunghi in una sola vista.
- Stato sempre visibile: cosa e bloccato, cosa e da fare oggi, cosa e in errore.

## 3. Information Architecture (v1)
Header fisso:
- Brand
- Selettore punto vendita
- Selettore settore (step successivo)
- Utente/ruolo
- Parametri

Sidebar principale:
1. Dashboard
2. Inventario
- Giacenze
- Movimenti
- Allerte
3. Acquisti
- Bolle e fatture
- Carichi lotti
4. Fornitori e listini
- Fornitori
- Listini
5. Ricette e carte
- Carta fissa
- Menu del giorno
6. Riconciliazioni
- Bolle vs fatture
- Traccia vs CookOps
7. Report
8. Impostazioni

## 4. Stato attuale
Disponibile:
- Selezione punto vendita in header
- Modal Parametri con CRUD logico punti vendita (create, disattiva, riattiva)
- Sezioni operative base: Servizio, Fornitori, Bolle/Fatture, Magazzino, Vendite

Gap principali:
- Mancanza sidebar strutturata
- Mancanza dashboard KPI vera
- Flussi acquisti/riconciliazione ancora troppo tecnici
- Nessuna pagina report dedicata

## 5. Roadmap per fasi

### Fase 1 - Foundation UX (breve, priorita alta)
- Introdurre layout applicativo stabile: `AppLayout` (Header + Sidebar + Content).
- Portare le attuali tab in sidebar.
- Definire componenti base riusabili:
- `PageHeader`
- `KpiCard`
- `DataTable`
- `FilterBar`
- `StatusBadge`
- Uniformare messaggi errore/successo (toast + banner).

### Fase 2 - Dashboard operativa
- Widget KPI:
- valore stock
- prodotti sottoscorta
- DLC ravvicinate
- bolle/fatture da riconciliare
- food cost teorico vs consuntivo (placeholder dati reali)
- Lista "Azioni urgenti" con shortcut.

### Fase 3 - Acquisti e ricezione professionale
- Wizard guidato:
1) carica documento
2) verifica OCR
3) conferma ingest
4) riconciliazione
- Vista differenze quantita/prezzi con semafori.
- Storico batch import con stato.

### Fase 4 - Inventario
- Pagine separate:
- Giacenze
- Movimenti
- Lotto dettaglio
- Filtri per sito/settore/stato/DLC.
- Rettifiche manuali con conferma esplicita.

### Fase 5 - Fornitori e listini
- Anagrafica fornitori completa.
- Tabella prodotti fornitore.
- Storico variazioni prezzo.
- Impatto food cost per categoria.

### Fase 6 - Ricette e carte
- Carta fissa per punto vendita.
- Blocchi dinamici (menu del giorno, suggestione, pizza del giorno).
- Programmazione per data e fascia.
- Collegamento con fiches (nome ricetta, allergeni, porzioni).

### Fase 7 - Riconciliazioni e report
- Master-detail per matching manuale/automatico.
- Alert e scostamenti traccia vs teorico.
- Export CSV/PDF.

## 6. Requisiti tecnici frontend
- Router a pagine (`react-router-dom`).
- Stato server con query caching (consigliato: TanStack Query).
- Form complessi con validazione (consigliato: react-hook-form + zod).
- Tabelle con paginazione/filter/sort.
- Design tokens centralizzati in `styles.css` (poi migrazione a modulo design-system).

## 7. Contratti backend da consolidare
Da mantenere stabili nel breve:
- `GET/POST /api/v1/sites/`
- `PATCH/DELETE /api/v1/sites/{site_id}/`
- `GET/POST /api/v1/suppliers/`
- `GET/POST /api/v1/integration/documents/`
- `POST /api/v1/integration/documents/{id}/extractions/`
- `POST /api/v1/integration/documents/{id}/ingest/`
- `POST /api/v1/reconciliation/matches/`
- `POST /api/v1/pos/import/daily/`

Da introdurre per dashboard/report:
- endpoint KPI aggregati per sito/periodo
- endpoint alert inventario/DLC
- endpoint scostamenti teorico vs consuntivo

## 8. Piano operativo immediato (prossimi step)
1. Refactor layout con Sidebar + Router.
2. Nuova Dashboard con 6 KPI e lista urgenze.
3. Wizard Acquisti (4 step) al posto della pagina tecnica attuale.
4. Commit incrementali per modulo (`frontend: layout`, `frontend: dashboard`, `frontend: purchasing-wizard`).

## 9. Definition of Done (per ogni modulo)
- Navigazione chiara desktop + mobile.
- Error handling visibile e comprensibile.
- Nessuna azione critica senza conferma utente.
- Build frontend verde.
- Test minimi smoke per i flussi principali.
