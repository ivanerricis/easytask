# Test

EasyTask ha test unitari, test end-to-end e una lista di controlli manuali per le release.

## Test unitari

Vitest con Testing Library, in ambiente jsdom. I file di test sono `src/**/*.test.ts(x)` e `scripts/**/*.test.mjs`.

```bash
npm test                # esegue una volta
npm run test:watch      # modalità watch
npm run test:coverage   # con copertura
```

`test:coverage` fallisce se la copertura scende sotto queste soglie (definite in `vitest.config.ts`):

| Statement | Branch | Funzioni | Righe |
| --- | --- | --- | --- |
| 89% | 83% | 87% | 91% |

Non abbassare mai le soglie per far passare una build: aggiungi i test mancanti. `src/components/ui` (shadcn) e `src/main.tsx` sono esclusi dalla copertura.

### Helper di test condivisi

Gli helper comuni stanno in `src/test`: `sonnerMock` e `toastMock` (`mocks.ts`) simulano `sonner` e permettono di verificare i toast, `makeUndoRecorderMock` e `undoModuleMock` (`mocks.ts`) sostituiscono il registratore dell'undo, `flushAsync` (`ui-render.tsx`) aspetta promise ed effetti in sospeso, e `SplitHarness` (`split-harness.tsx`, con `split-fixtures.ts`) mostra i componenti dentro un layout diviso con i provider delle aree. Usali invece di scrivere copie tue.

`src/i18n/unused-keys.test.ts` fallisce quando una chiave di traduzione non è usata in nessun punto del codice.

## Test end-to-end

WebdriverIO con `tauri-driver`, eseguiti sull'app debug vera: WebView2 su Windows, WebKitGTK sotto xvfb su Linux.

```bash
npm run e2e                    # costruisce l'app debug ed esegue tutti gli spec
E2E_SKIP_BUILD=1 npm run e2e   # riusa il binario debug esistente
npm run e2e:typecheck
```

- L'app usa una cartella dati temporanea (`EASYTASK_DATA_DIR`), quindi i tuoi dati non vengono toccati.
- Gli spec girano uno alla volta sulla stessa cartella dati: usa nomi univoci e non dipendere dall'ordine dei file.
- Le etichette arrivano dai file delle lingue tramite `tr("chiave")`: non scrivere mai testi dell'interfaccia a mano in uno spec.
- Su Windows non eseguirli da una shell con privilegi di amministratore: WebView2 non aprirebbe la porta di debug. `e2e/run-as-basic-user.cmd` esegue la suite con un token limitato.

Gli spec in `e2e/specs` (un file per area) comprendono:

| Spec | Copre |
| --- | --- |
| `workspace-flow` | Workspace, cartella, nota, gruppo, sezioni, task, cestino, duplicati |
| `settings-and-shortcuts` | Impostazione della lingua, finestra delle scorciatoie |
| `layout` | Geometria e stili reali, layout del lettore audio, contrasto WCAG |
| `features` | Sposta con annulla e ripeti, cestino, modelli, ripristino dell'aspetto, finestre di conferma |
| `audio` | Il lettore audio |
| `automations` | Le automazioni |
| `app-menu` | Il menu dell'applicazione |
| `persistence` | Impostazioni e dati che sopravvivono al riavvio |
| `collapsed-state` | Stato aperto e chiuso di gruppi, sezioni e sottotask |
| `drop-feedback` | Feedback del trascinamento ai bordi di un gruppo |
| `free-order` | Ordine libero di task e sezioni in un gruppo |
| `group-tasks` | Task direttamente in un gruppo |
| `group-width` | Larghezza dei gruppi |
| `live-drag` | Trascinamento in tempo reale di task e sezioni |
| `note-background` | Sfondo della nota |
| `note-search` | Ricerca in una nota |
| `path-bar` | Barra del percorso |
| `sidebar-keyboard` | Navigazione da tastiera dell'albero nella barra laterale |
| `split-workspace` | Workspace diviso in due aree |
| `task-insert-line` | Linea per inserire un task tra due altri |
| `task-keyboard` | Navigazione da tastiera nella lista dei task |
| `task-multiselect` | Selezione multipla dei task |
| `template-editor` | Editor dei template |
| `themes` | Temi: galleria, editor, importazione ed esportazione |
| `whats-new` | Il tab Novità |

Per i dettagli vedi [e2e/README.md](https://github.com/ivanerricis/easytask/blob/master/e2e/README.md).

## Giro dell'interfaccia

```bash
npm run ui-tour
```

Attraversa le schermate principali dell'app vera e scatta screenshot, per rivedere l'interfaccia. Non fa parte dell'esecuzione e2e normale.

## Screenshot della documentazione

```bash
npm run docs:screenshots
```

Avvia l'app con dati di esempio e scrive le immagini di questo sito in `docs/screenshots/<lingua>/`. Su Windows usa un terminale senza privilegi di amministratore.

## Controlli manuali prima della release

Alcune cose non si possono automatizzare: finestre native di scelta file, backup, import ed export, aggiornamento automatico, installer, tasti multimediali, modalità portatile e istanza singola. Prima di ogni release prova a mano la build installata. In breve:

- Installare sopra la versione precedente mantiene dati, impostazioni e scorciatoie.
- Controllo aggiornamenti, download e riavvio funzionano.
- Un backup si ripristina su una cartella dati pulita; un workspace si esporta e si reimporta.
- I file audio si aggiungono con il selettore nativo; i tasti multimediali comandano il lettore.
- Modalità portatile, istanza singola, posizione della finestra e tema sopravvivono al riavvio.
- Un tema chiaro, uno scuro e uno ad alto contrasto, un tema personalizzato, un altro colore principale e una scala del 150% sono corretti, in italiano e in inglese.
- La disinstallazione lascia la cartella dati.

La lista completa è in [e2e/README.md](https://github.com/ivanerricis/easytask/blob/master/e2e/README.md).

## Integrazione continua

`.github/workflows/ci.yml` gira sui push su `master` e sulle pull request:

| Job | Cosa controlla |
| --- | --- |
| `versions` | `package.json`, `Cargo.toml` e `tauri.conf.json` hanno la stessa versione |
| `frontend` | ESLint, `tsc -b`, tipi degli e2e, test unitari con copertura, build |
| `backend` | Su Windows e Linux: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` |
| `audit` | `npm audit` (alto e critico, produzione), `cargo audit`, `cargo deny`. Gira anche ogni settimana |
| `e2e` | End-to-end su Linux. Per ora non bloccante |

Il workflow `Docs` (`docs.yml`) costruisce questo sito a ogni pull request che tocca `docs/` e lo pubblica su GitHub Pages da `master`.

L'esecuzione e2e su Windows parte a mano (`workflow_dispatch`): sul runner ospitato il driver non riesce ad agganciarsi all'app, mentre la suite passa su un computer Windows.
