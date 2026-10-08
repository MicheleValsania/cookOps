# CookOps: accesso e percorso multi-tenant

## Stato attuale

CookOps dispone del contenitore `Organization`, delle appartenenze con ruolo e della relazione tra organizzazione e dati operativi.

La migrazione assegna tutti i dati storici esistenti a una sola organizzazione:

- nome: `ChefSide France`
- slug: `chefside-france`
- UUID stabile: `00000000-0000-4000-8000-000000000001`

Non esistono dati condivisi tra organizzazioni e non e ancora disponibile la registrazione di nuovi tenant. Questa limitazione e intenzionale: evita di introdurre clienti reali prima che tutti i moduli siano sottoposti ai test di isolamento.

## Accesso web

La landing di CookOps richiede la password e la invia una sola volta a `POST /api/v1/auth/login`. Il backend restituisce un token firmato con durata predefinita di otto ore.

- il token e conservato in `sessionStorage`;
- non viene salvata la password;
- il vecchio fallback `dev-api-key` e stato rimosso dal bundle frontend;
- alla scadenza della sessione l'utente torna alla pagina di accesso;
- le chiavi `X-API-Key` rimangono disponibili solo per Traccia e le integrazioni durante la transizione.

Il login applica un limite di cinque errori per indirizzo IP in quindici minuti. Il limite usa la cache Django locale ed e adatto all'attuale servizio Railway a singola istanza; prima di scalare orizzontalmente dovra passare a una cache condivisa.

## Portale multi-tenant

La pagina pubblica offre tre percorsi distinti:

- accesso personale con email e password;
- creazione su invito di una nuova organizzazione isolata;
- accesso storico ChefSide con la password operativa esistente.

La registrazione e disattivata in assenza di entrambe le variabili `COOKOPS_REGISTRATION_ENABLED=true` e `COOKOPS_REGISTRATION_INVITE_CODE`. Il codice non viene salvato nel frontend. Il nuovo proprietario riceve una membership `owner`; il token personale viene accettato solo finche utente, organizzazione e membership restano attivi.

## Isolamento applicato

- elenco, creazione, modifica ed eliminazione dei siti;
- elenco, creazione e modifica dei fornitori e dei loro prodotti;
- sincronizzazione menu e calcolo ingredienti per sito;
- acquisti, fatture, riconciliazioni e movimenti di magazzino;
- settori, punti stock, prodotti inventariabili, sessioni e righe inventario;
- importazioni POS e relative chiavi di idempotenza;
- documenti, estrazioni OCR, revisioni e decisioni di tracciabilita;
- categorie, procedure, elementi e piani di pulizia;
- snapshot ricette, collegamenti ingredienti e batch di importazione;
- autenticazione associata all'organizzazione ChefSide France.

Gli import diretti dal database/API Fiches configurato per ChefSide sono bloccati per le altre organizzazioni. Un futuro tenant potra importare un envelope proprio, ma la sincronizzazione automatica richiedera credenziali Fiches dedicate.

I proxy HACCP verificano che il sito richiesto appartenga all'organizzazione prima di contattare Traccia. La garanzia end-to-end sulle risorse remote richiede comunque che anche Traccia adotti lo stesso perimetro tenant.

## Vincolo di rilascio multi-tenant

La presenza delle tabelle tenant non rende ancora CookOps vendibile a piu clienti. Prima di creare una seconda organizzazione reale occorre:

1. applicare l'isolamento organizzazione anche a Traccia e alle sue risorse remote;
2. separare definitivamente password utente e token tecnici di Traccia;
3. introdurre utenti nominativi, inviti, ruoli e recupero credenziali;
4. configurare credenziali Fiches dedicate per ogni organizzazione;
5. completare test negativi end-to-end con CookOps, Traccia e Fiches;
6. eseguire una prova di ripristino del backup prima di accogliere il primo tenant reale.

Fino al completamento di questi punti, l'amministrazione non deve creare tenant aggiuntivi.
