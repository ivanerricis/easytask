# Architecture

A short tour of how EasyTask is built, for someone who wants to change the code.

## Tech stack

- [Tauri 2](https://v2.tauri.app/): Rust backend, SQLite through `tauri-plugin-sql`.
- [React 19](https://react.dev/) and TypeScript, built with [Vite](https://vite.dev/).
- [Tailwind CSS](https://tailwindcss.com) and [shadcn/ui](https://ui.shadcn.com/) (Radix UI).
- [@dnd-kit](https://dndkit.com/) for drag and drop.
- [i18next](https://www.i18next.com/) with react-i18next for translations.
- Vitest and Testing Library for unit tests; WebdriverIO with `tauri-driver` for end-to-end tests.

## Folder layout

| Folder | Content |
| --- | --- |
| `src/pages` | The two screens: `mainPage` (home) and `workspacePage` |
| `src/components` | Shared components; `ui/` holds the shadcn/ui ones, `dialogs/` the dialogs |
| `src/contexts` | React contexts for workspace data, tabs, preferences, shortcuts, audio, automations and undo |
| `src/hooks` | Reusable hooks (for example `useItemMutations`, `useAfterMenuClose`) |
| `src/db` | SQLite access: connection, schema, migrations, queries, backups |
| `src/lib` | Plain logic: preferences store, automations engine, updater, colors, themes (`lib/themes`: built-in themes, validation, contrast checks, CSS variables), shortcuts, workspace import and export. `lib/tabs` holds the pure tab and layout reducers, with no dependency on contexts |
| `src/i18n` | i18next setup and the `it` and `en` locale files |
| `src-tauri/src` | The Rust backend (`lib.rs`, `media_session.rs`) |
| `src-tauri/capabilities` | Permissions granted to the frontend |
| `e2e` | End-to-end specs, UI tour and docs screenshots |
| `scripts` | Version bump and check scripts |

Tests sit next to the code they test, as `*.test.ts(x)`.

## Data flow

The frontend talks to SQLite directly. `src/db/dbManager.ts` opens the database with `Database.load` from `tauri-plugin-sql`, and the functions in `src/db/queries/` run the SQL (one file per entity: workspace, folder, note, group, section, task, template, automation and so on; `transfer/` splits workspace export, validation and import).

The contexts in `src/contexts` call those queries and keep the data in React state. Many changes are applied to the state first and rolled back if the query fails (`with-rollback.ts`, `note-optimistic.ts`). Deletes go to the trash first and keep their ids.

The workspace version counters (tree, trash, templates and so on) live in an external store, not in React state: components read one with `useWorkspaceVersion(kind)`, so tree consumers do not re-render when another counter changes.

Small shared helpers avoid repeated boilerplate: `createRequiredContextHook` (the `useX` hook of a context that throws outside its provider), `createEmitter` and `createWindowEvent` (typed events), `useOpenList` (dialogs that load a list when opened), `useStoredSwitch` (a settings switch backed by a preference), `useNewTaskField` (the new task input) and `useItemMutations` / `useAfterMenuClose` (item actions and menus).

The Rust side handles what the browser cannot do: it decides the data folder, runs several SQL statements in one transaction, reads media keys, and sets up the plugins, tray and updater.

## Data folder

The backend picks the data folder in this order:

1. `EASYTASK_DATA_DIR`, if set.
2. A `data` folder next to the executable, if a `portable.txt` file sits next to it (portable mode).
3. `Documents/EasyTask`.

## Migrations

`src/db/initDb.ts` applies the migrations in order and tracks them with `PRAGMA user_version`. The first migration creates the whole schema (`src/db/schema/initial.ts`): the older migrations were squashed into it.

Rules for a new migration: append it, never edit one that was already applied, and keep it idempotent and additive. A database with a higher version than the app knows is refused as newer, and a safety copy is taken before migrating an existing database. Version 12 adds partial indexes on the trashed and archived rows, version 13 the background color of the notes and of the templates, version 14 the table of the custom themes (global, not per workspace).

## Settings

Preferences and shortcuts are saved with `tauri-plugin-store` in `settings.dat`, inside the data folder (`src/lib/store`). Writes are debounced (`save-soon.ts`). The open tabs (the layout of the two areas, see below) and the last workspace are kept in the same store.

## Split workspace

The workspace can be split in two side-by-side areas (panes), each with its own tabs and active note.

- `src/lib/tabs/layout-reducer.ts` holds `LayoutState { left, right, focused }` (`right` is `null` when not split) and wraps the per-pane `tabsReducer` (`src/lib/tabs/tabs-reducer.ts`). Both are pure; `src/contexts/layout-reducer.ts` and `tabs-reducer.ts` just re-export them. Moving a tab between panes is one atomic action.
- `TabsProvider` (`tabs-context.tsx`) is built from smaller pieces: `use-layout-persistence` (save and restore), `use-tab-stores` and `tab-ui-store` (external stores), `use-tabs-values` (the context values) and `tabs-providers.tsx` (the nested providers).
- `TabsProvider` exposes the usual hooks (`useTabs`, `useActiveNote`) for the focused pane: `activeId` and `currentNote` are the focused pane's, while `openIds` and `tabs` are the union of both panes. `PaneProvider` (`src/contexts/pane-provider.tsx`) overrides the tabs and active-note contexts with the values of one pane, so the components inside a pane work as if there was a single note.
- `ActiveNoteProvider` loads the notes of both panes and keeps three instances of the optimistic actions: the focused pane, the left one and the right one.
- One note is open in at most one pane. Opening a note already open in the other pane activates it there.
- A single `TabsDndProvider` wraps both tab bars, so a tab can be dragged from one to the other.
- Handlers registered by `useShortcut` and `useAppCommand` run only in the focused pane, so a shortcut does not fire twice.
- The layout is saved in `openTabs:<workspaceId>` as `{ version: 2, left, right, focused }`. The old `{ openIds, activeId }` shape is read as the left pane. It is restored at startup only when "reopen notes" is on.
- The pane tree keeps the same shape whether split or not, so opening or closing the split does not remount the left pane. While the divider is dragged only the `--split-ratio` CSS variable of the container is rewritten; the ratio is saved when the drag ends.

## Translations

The locale files are in `src/i18n/locales/it` and `src/i18n/locales/en`, split by area (`settings.ts`, `dialogs.ts`, `tasks.ts` and so on). The Italian files define the `Translation` type, and the English object is typed with it, so a missing key in one language is a compile error. Components read strings with `useTranslation`. The language preference is `system`, `it` or `en`.

## Undo

`src/contexts/undo` implements undo and redo. Each user action is an `UndoCommand` with a translated `label` and two functions, `undo` and `redo`, that use stable ids. The provider keeps the stacks and the actions are listed in the history.

## Tauri plugins and capabilities

The backend registers these plugins: single-instance, window-state, dialog, fs, sql, store, opener, clipboard-manager, process, log, updater and autostart.

The frontend can only call what `src-tauri/capabilities/default.json` allows for the `main` window. For example, `fs` is limited to the listed operations, `opener` can only open the project's GitHub URLs, and `sql` and `store` are limited to the listed commands. If you add a feature that needs a new plugin command, add its permission there.
