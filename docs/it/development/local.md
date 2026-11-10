# Sviluppo in locale

Come avviare EasyTask dal codice sorgente, costruire gli installer e lavorare su questo sito di documentazione.

## Prerequisiti

- [Node.js](https://nodejs.org/) LTS. La CI usa la versione 24.
- [Rust](https://www.rust-lang.org/tools/install) (1.77.2 o più recente), installato con `rustup`.
- Su Windows: gli strumenti di compilazione C++ MSVC e WebView2.
- Su Linux: i pacchetti WebKitGTK. Su Ubuntu 24.04 la CI li installa con:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

Per gli altri sistemi vedi i [prerequisiti di Tauri](https://v2.tauri.app/start/prerequisites/).

## Scaricare il codice e avviarlo

```bash
git clone https://github.com/ivanerricis/easytask
cd easytask
npm install
npm run tauri:dev
```

Il primo avvio compila il backend Rust e richiede qualche minuto. Quelli successivi sono veloci e il frontend si ricarica mentre modifichi i file.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run tauri:dev` | Avvia l'app desktop in sviluppo |
| `npm run dev` | Avvia solo il frontend Vite (senza backend Tauri) |
| `npm run build` | Controllo dei tipi (`tsc -b`) e build del frontend |
| `npm run tauri:build` | Costruisce gli installer (NSIS, deb, AppImage) |
| `npm test` | Test unitari (Vitest) |
| `npm run test:watch` | Test unitari in modalità watch |
| `npm run test:coverage` | Test unitari con report di copertura |
| `npm run lint` | ESLint |
| `npm run e2e` | Test end-to-end |
| `npm run e2e:typecheck` | Controllo dei tipi del codice e2e |
| `npm run ui-tour` | Giro con screenshot di tutta l'interfaccia |
| `npm run docs:screenshots` | Rigenera gli screenshot usati da questo sito |
| `npm run release:bump` | Aggiorna la versione in tutti i file |
| `npm run release:check` | Controlla che i file di versione coincidano |

## Usare una cartella dati separata

Di default l'app salva i dati in `Documents/EasyTask`. Durante lo sviluppo puoi indicare un'altra cartella con la variabile d'ambiente `EASYTASK_DATA_DIR`. Il percorso deve essere assoluto.

::: code-group
```powershell [Windows (PowerShell)]
$env:EASYTASK_DATA_DIR = "C:\temp\easytask-dev"
npm run tauri:dev
```
```bash [Linux / macOS]
EASYTASK_DATA_DIR=/tmp/easytask-dev npm run tauri:dev
```
:::

Anche i test e2e usano questa variabile, quindi non toccano mai i tuoi dati reali.

## Costruire gli installer

```bash
npm run tauri:build
```

I formati sono NSIS (Windows), deb e AppImage (Linux). Le release ufficiali sono costruite da un workflow separato: vedi [Contribuire](./contributing#release).

## Questo sito di documentazione

Il sito usa VitePress e si trova in `docs/`.

```bash
cd docs
npm install
npm run dev
```

Le pagine sono file Markdown: quelle in inglese in `docs/guide` e `docs/development`, quelle in italiano in `docs/it/...` con gli stessi nomi. Modifica sempre entrambe le lingue.

Gli screenshot sono generati dall'app vera. Dalla radice del repository esegui:

```bash
npm run docs:screenshots
```

Vengono scritti in `docs/screenshots/<lingua>/`.

::: warning
Su Windows esegui questo comando da un terminale senza privilegi di amministratore. Da un terminale elevato WebView2 non apre la porta di debug e l'esecuzione fallisce.
:::
