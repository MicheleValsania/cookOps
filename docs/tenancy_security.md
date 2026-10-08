# CookOps: accesso e percorso multi-tenant

## Stato attuale

CookOps dispone del contenitore `Organization`, delle appartenenze con ruolo e della relazione tra organizzazione, siti e fornitori.

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

## Isolamento gia applicato

- elenco, creazione, modifica ed eliminazione dei siti;
- elenco, creazione e modifica dei fornitori e dei loro prodotti;
- sincronizzazione menu e calcolo ingredienti per sito;
- autenticazione associata all'organizzazione ChefSide France.

## Vincolo di rilascio multi-tenant

La presenza delle tabelle tenant non rende ancora CookOps vendibile a piu clienti. Prima di creare una seconda organizzazione reale occorre:

1. applicare il filtro organizzazione a inventari, acquisti, POS, documenti, tracciabilita, HACCP e pulizie;
2. aggiungere test negativi per lettura, modifica ed eliminazione tra due organizzazioni;
3. separare definitivamente password utente e token tecnici di Traccia;
4. introdurre utenti nominativi, inviti, ruoli e recupero credenziali;
5. eseguire backup e prova di ripristino prima della migrazione di produzione.

Fino al completamento di questi punti, l'amministrazione non deve creare tenant aggiuntivi.
