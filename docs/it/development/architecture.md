# Architettura

Un breve giro di come è fatto EasyTask, per chi vuole modificare il codice.

## Tecnologie

- [Tauri 2](https://v2.tauri.app/): backend Rust, SQLite tramite `tauri-plugin-sql`.
- [React 19](https://react.dev/) e TypeScript, con build [Vite](https://vite.dev/).
- [Tailwind CSS](https://tailwindcss.com) e [shadcn/ui](https://ui.shadcn.com/) (Radix UI).
- [@dnd-kit](https://dndkit.com/) per il trascinamento.
- [i18next](https://www.i18next.com/) con react-i18next per le traduzioni.
- Vitest e Testing Library per i test unitari; WebdriverIO con `tauri-driver` per i test end-to-end.

## Struttura delle cartelle

| Cartella | Contenuto |
| --- | --- |
| `src/pages` | Le due schermate: `mainPage` (home) e `workspacePage` |
| `src/components` | Componenti condivisi; `ui/` contiene quelli shadcn/ui, `dialogs/` le finestre di dialogo |
| `src/contexts` | Context React per dati del workspace, tab, preferenze, scorciatoie, audio, automazioni e annulla |
| `src/hooks` | Hook riutilizzabili (per esempio `useItemMutations`, `useAfterMenuClose`) |
| `src/db` | Accesso a SQLite: connessione, schema, migrazioni, query, backup |
| `src/types` | Tipi TypeScript condivisi |
| `src/test` | Helper e mock dei test |
| `src/lib` | Logica pura: store delle preferenze, motore delle automazioni, updater, colori, temi (`lib/themes`: temi predefiniti, validazione, controlli di contrasto, variabili CSS), scorciatoie, import ed export dei workspace. `lib/tabs` contiene i reducer puri di tab e layout, senza dipendenze dai context |
| `src/i18n` | Configurazione di i18next e file delle lingue `it` e `en` |
| `src-tauri/src` | Il backend Rust (`lib.rs`, `paths.rs`, `settings.rs`, `window.rs`, `files.rs`, `audio.rs`, `db.rs`, `transfer_zip.rs`, `media_session.rs`) |
| `src-tauri/capabilities` | Permessi concessi al frontend |
| `e2e` | Test end-to-end, giro dell'interfaccia e screenshot della documentazione |
| `scripts` | Script per cambiare e controllare la versione |
| `.github` | Workflow di CI e azioni composite |

I test stanno accanto al codice che provano, come `*.test.ts(x)`.

## Flusso dei dati

Il frontend parla direttamente con SQLite. `src/db/dbManager.ts` apre il database con `Database.load` di `tauri-plugin-sql`, e le funzioni in `src/db/queries/` eseguono l'SQL (un file per entità: workspace, cartella, nota, gruppo, sezione, task, modello, automazione e così via; `transfer/` divide export, validazione e import dei workspace).

I context in `src/contexts` chiamano queste query e tengono i dati nello stato React. Molte modifiche vengono applicate prima allo stato e annullate se la query fallisce (`with-rollback.ts`, `note-optimistic.ts`). Le eliminazioni passano prima dal cestino e mantengono gli stessi id.

I contatori di versione del workspace (albero, cestino, modelli e così via) stanno in uno store esterno, non nello stato React: i componenti ne leggono uno con `useWorkspaceVersion(kind)`, così i componenti dell'albero non si ridisegnano quando cambia un altro contatore.

Piccoli helper condivisi evitano codice ripetuto: `createRequiredContextHook` (l'hook `useX` di un context che dà errore fuori dal suo provider), `createEmitter` e `createWindowEvent` (eventi tipizzati), `useOpenList` (finestre che caricano un elenco all'apertura), `useStoredSwitch` (un interruttore delle impostazioni legato a una preferenza), `useNewTaskField` (il campo del nuovo task) e `useItemMutations` / `useAfterMenuClose` (azioni sugli elementi e menu).

Il lato Rust si occupa di ciò che il browser non può fare: decide la cartella dati, esegue più istruzioni SQL in un'unica transazione, legge i tasti multimediali e configura plugin, icona nell'area di notifica e updater.

## Cartella dati

Il backend sceglie la cartella dati in quest'ordine:

1. `EASYTASK_DATA_DIR`, se impostata.
2. Una cartella `data` accanto all'eseguibile, se accanto c'è un file `portable.txt` (modalità portatile).
3. `Documents/EasyTask`.

## Migrazioni

`src/db/initDb.ts` applica le migrazioni in ordine e le traccia con `PRAGMA user_version`. La prima migrazione crea l'intero schema (`src/db/schema/initial.ts`): le migrazioni precedenti sono state riunite in essa.

Regole per una nuova migrazione: aggiungila in coda, non modificare mai una già applicata, e falla idempotente e solo additiva. Un database con una versione più alta di quella nota all'app viene rifiutato perché più recente, e prima di migrare un database esistente viene fatta una copia di sicurezza. La versione 12 aggiunge indici parziali sulle righe nel cestino e archiviate, la versione 13 il colore di sfondo delle note e dei template, la versione 14 la tabella dei temi personalizzati (globali, non per workspace).

## Impostazioni

Preferenze e scorciatoie sono salvate con `tauri-plugin-store` in `settings.dat`, dentro la cartella dati (`src/lib/store`). Le scritture sono ritardate e raggruppate (`save-soon.ts`). I tab aperti (il layout delle due aree, vedi sotto) e l'ultimo workspace stanno nello stesso store.

## Spazio di lavoro diviso

Lo spazio di lavoro può essere diviso in due aree affiancate (pane), ognuna con i suoi tab e la sua nota attiva.

- `src/lib/tabs/layout-reducer.ts` contiene `LayoutState { left, right, focused }` (`right` è `null` quando non è diviso) e avvolge il `tabsReducer` di area (`src/lib/tabs/tabs-reducer.ts`). Sono entrambi puri; `src/contexts/layout-reducer.ts` e `tabs-reducer.ts` li riesportano soltanto. Lo spostamento di un tab tra le aree è un'unica azione atomica.
- `TabsProvider` (`tabs-context.tsx`) è composto da pezzi più piccoli: `use-layout-persistence` (salvataggio e ripristino), `use-tab-stores` e `tab-ui-store` (store esterni), `use-tabs-values` (i valori del context) e `tabs-providers.tsx` (i provider annidati).
- `TabsProvider` espone gli hook di sempre (`useTabs`, `useActiveNote`) per l'area con il focus: `activeId` e `currentNote` sono quelli dell'area focalizzata, mentre `openIds` e `tabs` sono l'unione delle due aree. `PaneProvider` (`src/contexts/pane-provider.tsx`) sovrascrive i contesti dei tab e della nota attiva con i valori di una sola area, così i componenti dentro un'area funzionano come se ci fosse una sola nota.
- `ActiveNoteProvider` carica le note di entrambe le aree e tiene tre istanze delle azioni ottimistiche: area focalizzata, sinistra e destra.
- Una nota è aperta al massimo in un'area. Aprire una nota già aperta nell'altra area la attiva lì.
- Un solo `TabsDndProvider` avvolge le due barre di tab, così un tab si trascina dall'una all'altra.
- I gestori registrati con `useShortcut` e `useAppCommand` scattano solo nell'area con il focus, così una scorciatoia non scatta due volte.
- Il layout è salvato in `openTabs:<workspaceId>` come `{ version: 2, left, right, focused }`. Il vecchio formato `{ openIds, activeId }` si legge come area sinistra. All'avvio viene ripristinato solo se "riapri le note" è attivo.
- L'albero delle aree ha la stessa forma diviso o no, quindi aprire o chiudere la divisione non rimonta l'area sinistra. Mentre si trascina il divisore viene riscritta solo la variabile CSS `--split-ratio` del contenitore; la proporzione viene salvata alla fine del trascinamento.

## Traduzioni

I file delle lingue sono in `src/i18n/locales/it` e `src/i18n/locales/en`, divisi per area (`settings.ts`, `dialogs.ts`, `tasks.ts` e così via). I file italiani definiscono il tipo `Translation` e l'oggetto inglese è tipizzato con esso, quindi una chiave mancante in una lingua è un errore di compilazione. I componenti leggono le stringhe con `useTranslation`. La preferenza di lingua è `system`, `it` o `en`.

## Annulla

`src/contexts/undo` implementa annulla e ripeti. Ogni azione dell'utente è un `UndoCommand` con una `label` tradotta e due funzioni, `undo` e `redo`, che usano id stabili. Il provider tiene le pile e le azioni compaiono nella cronologia.

## Plugin Tauri e permessi

Il backend registra questi plugin: single-instance, window-state, dialog, fs, sql, store, opener, clipboard-manager, process, log, updater e autostart.

Il frontend può chiamare solo ciò che `src-tauri/capabilities/default.json` consente alla finestra `main`. Per esempio `fs` è limitato alle operazioni elencate, `opener` può aprire solo gli URL GitHub e della documentazione del progetto, e `sql` e `store` sono limitati ai comandi elencati. Se una funzione richiede un nuovo comando di un plugin, aggiungi il relativo permesso lì.
