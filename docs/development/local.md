# Local development

How to run EasyTask from source, build the installers and work on this documentation site.

## Prerequisites

- [Node.js](https://nodejs.org/) LTS. CI uses version 24.
- [Rust](https://www.rust-lang.org/tools/install) (1.77.2 or newer), installed with `rustup`.
- On Windows: the MSVC C++ build tools and WebView2.
- On Linux: the WebKitGTK packages. On Ubuntu 24.04 CI installs them with:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for other systems.

## Get the code and run it

```bash
git clone https://github.com/ivanerricis/easytask
cd easytask
npm install
npm run tauri:dev
```

The first run compiles the Rust backend and takes a few minutes. Later runs are fast, and the frontend reloads as you edit.

## Commands

| Command | What it does |
| --- | --- |
| `npm run tauri:dev` | Run the desktop app in development |
| `npm run dev` | Start only the Vite frontend (no Tauri backend) |
| `npm run build` | Type-check (`tsc -b`) and build the frontend |
| `npm run tauri:build` | Build the installers (NSIS, deb, AppImage) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:coverage` | Unit tests with a coverage report |
| `npm run lint` | ESLint |
| `npm run e2e` | End-to-end tests |
| `npm run e2e:typecheck` | Type-check the e2e code |
| `npm run ui-tour` | Screenshot tour of the whole UI |
| `npm run docs:screenshots` | Regenerate the screenshots used by this site |
| `npm run release:bump` | Bump the version in all version files |
| `npm run release:check` | Check that the version files agree |

## Use a separate data folder

By default the app keeps its data in `Documents/EasyTask`. While developing you can point it somewhere else with the `EASYTASK_DATA_DIR` environment variable. The path must be absolute.

::: code-group
```powershell [Windows (PowerShell)]
$env:EASYTASK_DATA_DIR = "C:\temp\easytask-dev"
npm run tauri:dev
```
```bash [Linux / macOS]
EASYTASK_DATA_DIR=/tmp/easytask-dev npm run tauri:dev
```
:::

The e2e tests use this variable too, so they never touch your real data.

## Build the installers

```bash
npm run tauri:build
```

The targets are NSIS (Windows), deb and AppImage (Linux). Official releases are built by a separate workflow: see [Contributing](./contributing#releases).

## This documentation site

The site is built with VitePress and lives in `docs/`.

```bash
cd docs
npm install
npm run dev
```

The pages are Markdown files: English in `docs/guide` and `docs/development`, Italian in `docs/it/...` with the same file names. Change both languages together.

The screenshots are generated from the real app. From the repository root run:

```bash
npm run docs:screenshots
```

They are written to `docs/screenshots/<lang>/`.

::: warning
On Windows, run this command from a non-elevated terminal. From an elevated one WebView2 does not open its debug port and the run fails.
:::
