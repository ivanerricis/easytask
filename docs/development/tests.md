# Tests

EasyTask has unit tests, end-to-end tests and a manual checklist for releases.

## Unit tests

Vitest with Testing Library, in a jsdom environment. Test files are `src/**/*.test.ts(x)` and `scripts/**/*.test.mjs`.

```bash
npm test                # run once
npm run test:watch      # watch mode
npm run test:coverage   # with coverage
```

`test:coverage` fails if coverage drops below these thresholds (set in `vitest.config.ts`):

| Statements | Branches | Functions | Lines |
| --- | --- | --- | --- |
| 89% | 83% | 87% | 91% |

Never lower the thresholds to make a build pass: add the missing tests. `src/components/ui` (shadcn) and `src/main.tsx` are excluded from coverage.

### Shared test helpers

Common helpers live in `src/test`: `sonnerMock` and `toastMock` (`mocks.ts`) mock `sonner` and let you assert on the toasts, `makeUndoRecorderMock` and `undoModuleMock` (`mocks.ts`) replace the undo recorder, `flushAsync` (`ui-render.tsx`) waits for pending promises and effects, and `SplitHarness` (`split-harness.tsx`, with `split-fixtures.ts`) renders components inside a split layout with the pane providers. Use them instead of writing your own copies.

`src/i18n/unused-keys.test.ts` fails when a translation key is not used anywhere in the code.

## End-to-end tests

WebdriverIO with `tauri-driver`, run against the real debug app: WebView2 on Windows, WebKitGTK under xvfb on Linux.

```bash
npm run e2e                    # builds the debug app and runs every spec
E2E_SKIP_BUILD=1 npm run e2e   # reuses the existing debug binary
npm run e2e:typecheck
```

- The app uses a temporary data folder (`EASYTASK_DATA_DIR`), so your data is never touched.
- Specs run one at a time on the same data folder: use unique names and do not depend on the file order.
- Labels come from the locale files through `tr("key")`: never hard-code UI strings in a spec.
- On Windows, do not run from an elevated shell: WebView2 would not open its debug port. `e2e/run-as-basic-user.cmd` runs the suite with a limited token.

The specs in `e2e/specs` cover:

| Spec | Covers |
| --- | --- |
| `workspace-flow` | Workspace, folder, note, group, sections, tasks, trash, duplicates |
| `settings-and-shortcuts` | Language setting, shortcuts dialog |
| `layout` | Real geometry and styles, contrast in both themes |
| `features` | Move with undo and redo, trash, templates, appearance reset, confirmation dialogs |
| `audio` | The audio player |
| `automations` | Automations |
| `app-menu` | The application menu |
| `persistence` | Settings and data surviving a restart |

See [e2e/README.md](https://github.com/ivanerricis/easytask/blob/master/e2e/README.md) for the details.

## UI tour

```bash
npm run ui-tour
```

Walks through the main screens of the real app and takes screenshots, to review the UI. It is not part of the regular e2e run.

## Docs screenshots

```bash
npm run docs:screenshots
```

Runs the app with sample data and writes the images of this site to `docs/screenshots/<lang>/`. On Windows use a non-elevated terminal.

## Manual release checklist

Some things cannot be automated: native file dialogs, backup, import and export, the auto-updater, installers, media keys, portable mode and the single instance. Before each release, test the installed build by hand. In short:

- Installing over the previous version keeps data, settings and shortcuts.
- The update check, download and restart work.
- A backup can be restored on a clean data folder; a workspace can be exported and imported.
- Audio files can be added with the native picker; media keys drive the player.
- Portable mode, single instance, window position and theme survive a restart.
- Dark and light theme, a different accent color and 150% scaling look right, in Italian and English.
- Uninstalling leaves the data folder.

The full list is in [e2e/README.md](https://github.com/ivanerricis/easytask/blob/master/e2e/README.md).

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `master` and on pull requests:

| Job | What it checks |
| --- | --- |
| `versions` | `package.json`, `Cargo.toml` and `tauri.conf.json` have the same version |
| `frontend` | ESLint, `tsc -b`, e2e type-check, unit tests with coverage, build |
| `backend` | On Windows and Linux: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` |
| `audit` | `npm audit` (high and critical, production), `cargo audit`, `cargo deny`. Also runs weekly |
| `e2e` | End-to-end on Linux. Not blocking for now |

The Windows e2e run starts manually (`workflow_dispatch`): on the hosted runner the driver cannot attach to the app, while the suite passes on a Windows machine.
