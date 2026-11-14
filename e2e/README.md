# End-to-end tests

WebdriverIO + `tauri-driver`, run against the real debug app (WebView2 on Windows, WebKitGTK under xvfb on Linux CI).

```
npm run e2e                 # builds the debug app and runs every spec
E2E_SKIP_BUILD=1 npm run e2e  # reuses the existing debug binary
npm run e2e:typecheck
```

- Windows: do not run from an elevated shell (WebView2 then does not open its debug port). `run-as-basic-user.cmd` runs the suite with a limited token.
- The app uses a temporary data folder (`EASYTASK_DATA_DIR`): real data is never touched.
- Specs run in separate sessions, one at a time, on the **same** data folder: use unique names and do not depend on the file order.
- Labels come from `src/i18n/locales` through `tr("key")`; never hard-code UI strings.

## What the e2e covers

| Spec | Covers |
| --- | --- |
| `workspace-flow` | workspace, folder, note, group, sections, tasks, move to another section, trash and restore, hide completed, duplicates, edit-mode geometry |
| `settings-and-shortcuts` | language setting, shortcuts dialog |
| `layout` | real geometry and computed styles (what jsdom cannot see): progress bars of the player, group width on compact/reopen, drag handles, WCAG contrast in both themes |
| `features` | move up/down with undo/redo, trash (restore, delete forever, empty), templates, appearance settings reset, shape of every confirmation dialog |
| `audio` | the audio player: play/pause/resume, skip, seek keys, speed, mute, row icon, missing file dialog |
| `export-zip` | the Rust commands behind the zip export/import (size estimate, archive with the linked files, extraction into the media folder, cleanup); the native pickers are not automatable |
| `persistence` | language, accent color, hide-completed and data survive an app restart. The theme is not checked: the driver does not share the webview profile between sessions (localStorage is lost), so it is on the manual list |
| `split-workspace` | split workspace: split button, empty right pane, "Open on the right/left" from the sidebar menu, one note per pane, drag of a tab between the two tab bars, close the split (closes the right tabs), Ctrl+\\. Persistence of the layout is not checked (it needs an app restart and the layout lives in settings.dat) |
| `ui-tour/` | screenshots tour (`npm run ui-tour`), not part of the regular run |
| `docs-shots/` | screenshots of the documentation site in English and Italian, light and dark (`npm run docs:screenshots`, writes `docs/screenshots/`), not part of the regular run |

## What the e2e cannot cover (manual checklist before each release)

Native file dialogs, backup/import/export, the auto-updater, installers, physical media keys, portable mode and the single-instance behaviour are not automatable. Before every release, on the **installed** build (Windows installer and, if shipped, Linux package):

- [ ] Install over the previous version: data, settings and shortcuts are kept.
- [ ] Automatic update: Settings > About > check for updates; the dialog shows the notes, download and restart work.
- [ ] Backup: create a backup, restore it on a clean data folder, everything is back.
- [ ] Export a workspace and import it again (file picker); an invalid file shows an error and changes nothing.
- [ ] Export with the linked files: the question shows the size, "Include the files" writes a `.easytask.zip` with a progress bar, importing it restores the audio, images and videos (copies in the `media` folder of the data folder); cancelling the names dialog of a zip import leaves no new file there.
- [ ] Audio: add files with the native picker (several at once), play one, "Update path" on a missing file with the picker.
- [ ] Media keys (play/pause, next/previous seek) and the system volume flyout drive the player and show the title.
- [ ] Portable mode: with the marker file next to the executable the data folder is next to it.
- [ ] Single instance: starting the app twice focuses the first window.
- [ ] Window controls, maximize/restore, and the window position/size are remembered after a restart.
- [ ] The theme choice survives a restart (not automatable, see `persistence`).
- [ ] Dark and light theme, a non-default accent color, and 150% display scaling look right on the main screens.
- [ ] System language Italian and English: no untranslated or truncated text on the dialogs touched by the release.
- [ ] Uninstall removes the app and leaves the data folder.
