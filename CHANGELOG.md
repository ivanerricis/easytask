# Changelog

All notable changes to EasyTask are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.24.0] - 2026-11-14

### Added

- Tags on tasks: give a task one or more colored tags from its menu, the multi-selection menu or the details panel; tags are per workspace, can be renamed, recolored and deleted, follow undo and redo, travel with exports, templates and duplicates, and automations can add or remove them.
- Images and videos in groups: add them from the group menu, see them stacked with a thumbnail under the audio files, and open them in a full-window viewer with zoom, video controls and the arrow keys to move to the next one. A format that can't be played offers to open the file with the default app.
- Audio, image and video rows show a mark when their file has been moved or deleted, so you can fix the path.
- Exports can include the linked files: the app asks first, with the estimated size, and writes a single .zip with a progress bar; importing a .zip copies the files into the app's data folder.
- A setting in Settings > Notes chooses how a closed group looks: a narrow vertical strip (default) or a horizontal bar that keeps its width.
- A "?" button in the title bar shows the keyboard shortcuts.

### Changed

- The left sidebar has a single row of buttons, without dividers; the button that added audio files to the first group is gone (add them from each group's menu).
- Dates follow the language of the app (in Italian DD/MM/YYYY).
- Dragging tasks, sections and groups in big notes is lighter at the start and at the drop.
- Automatic backups also run while the app is hidden in the tray.
- Some error messages are now translated instead of showing technical text.

### Fixed

- If the safety copy before a database update fails, the app asks whether to go on or exit instead of updating without a copy, and each database update is applied all at once or not at all.
- The app no longer gives the window access to its data folder (database and settings) through the file protocol; linked audio and media files are allowed one by one.
- Settings that fail to save on close are retried and reported instead of being lost silently.

## [0.23.0] - 2026-11-13

### Added

- While you drag a task, a section, a group, a note or folder of the sidebar, or a tab, the room that opens shows an outline of where it will land.

### Changed

- New look of the notes: each group is a panel tinted with its color (gray without one) with a band at the top, and a closed group becomes a narrow strip with its name written vertically; sections are cards tinted with their color; the progress of groups and sections is a ring that fills up and shows a check at 100%; the rows of the tasks have no lines between them and subtasks are marked with a short dash; "New task" in a section and a "+" for a new section in the header of the group show up when you hover them. The look follows the theme, the high contrast ones included.
- Toasts in the style of the app, with the type shown by a colored strip and icon, and the close button inside on the right.
- While a workspace loads you see its shape (sidebar, tabs, note) instead of a spinner, and the loading screens no longer flash on a fast load.
- The search in the title bar and the button to go back home are a little lower.

### Fixed

- The line under the active tab of the right panel (Details, History) now lies on the border of the bar.
- A quick click that slips a little (for example on the close button of a tab) could leave the window stuck with the drag cursor, ignoring every click; this could also happen in the sidebar and inside a note.

## [0.22.0] - 2026-11-11

### Added

- Live drag of sections: while you drag a section the others step aside to open the room where it would land, in the same group or in another one, and the dragged section collapses. The insertion line of the sections is not shown during the drag.
- Live drag of groups: while you drag a group by its header the other groups step sideways to open the room where it would land, and the dragged group collapses. The vertical insertion line of the groups is not shown during the drag.
- Live drag of the sidebar: while you drag a note or a folder (with its open subfolders and notes) the other rows step aside to open the room where it would land and close the one it leaves, instead of showing a line; dropping in the middle of a folder still highlights it, and the line comes back with the setting off and for a drag of several selected items or with the keyboard. The setting is now **Tasks, sections, groups, notes, folders and tabs move aside while dragging**: turn it off to get only the drop indicator.
- Live drag of the open tabs: while you drag a tab, in one bar or between the two bars of the split view, the other tabs step sideways to open the room where it would land and close the one it leaves, and the tab follows the pointer instead of showing a line. The line comes back with the setting off and over an empty bar.

### Changed

- Dragging is much smoother in big notes: the note is no longer redrawn as a whole during a drag and after a drop, so the stops of about a second are gone.
- The match counter of the search is now shown inside the search field, without the empty space beside it.
- The repository is now called `easytask`, so the address of the documentation site changed to `https://ivanerricis.github.io/easytask/`.

### Fixed

- Search: the current match now has a visible ring in every theme, and it also shows with the forced colors of Windows (high contrast mode).
- Undo: pressing Ctrl+Z right after coloring several selected tasks (or folders and notes) could do nothing; the step to undo is now always ready.
- Dragging a note or a folder in the sidebar, or a tab outside the bars of the split view, now shows the "not allowed" cursor over places where it cannot be dropped.
- Dragging a tab to the right end of a single bar no longer makes a useless horizontal scrollbar appear.
- Dragging an item of a note in a split view: only the row of the groups and the lists of the groups scroll by themselves near the edges, so the other pane and the page no longer scroll up and down.
- The active tab of the right panel (Details, History) has one underline instead of two.

## [0.21.0] - 2026-11-08

### Added

- Themes: nine built-in themes (Light, Dark, Nord, Solarized Light, Solarized Dark, Dracula, Sepia, and two high contrast ones, with a text contrast ratio of at least 7:1, made for people with low vision). You choose from a gallery with previews in Settings > Appearance, or from the **View > Theme** menu, which also has **Manage themes…**. The native window background follows the theme, so there is no white flash at startup.
- Custom themes: create, duplicate, rename and delete your own themes (up to 50). The editor has 11 colors and a live preview; contrast warnings are only informative and never block saving. Themes are saved in the database (version 14, global and not per workspace), so backups include them, and can be exported to and imported from `.easytask-theme.json` files (up to 64 KiB, valid hex colors only; the id in the file is ignored).
- Each theme has its own accent color. The **Accent color** setting overrides it, and **Use the accent of the theme** brings it back. The contrast warning is unchanged.

### Changed

- The **System** choice for the theme is replaced: the first time, EasyTask picks the initial theme from the system (dark if the system is dark, high contrast if the system asks for more contrast), and after that the theme you chose stays. **Reset all** in Appearance goes back to the theme picked from the system.

## [0.20.0] - 2026-11-08

### Added

- Live drag of tasks: while you drag a task the others step aside to open the room where it would land, and the dragged task collapses, as on Trello. The insertion line is not shown during the drag. Sections, groups and the sidebar behave as before. You can turn it off in Settings > Notes and sections (**Tasks move aside while dragging**): the drop indicator is then the only feedback.

### Changed

- The update check at startup now runs 2 seconds after the start instead of 3.

## [0.19.0] - 2026-11-07

### Added

- Background color of a note: right click on the empty space of a note and choose **Note background** to pick a color from the same palette used elsewhere (or **No color** to remove it). The color is a light layer over the note area, can be undone, and is copied by duplicating the note, by templates (create, refresh, new note from a template, template editor) and by export and import (files exported before this version still import). The database moves to version 13, and a safety copy is taken before migrating, as for any migration.
- After an update, the first start on the new version opens a **What's new** tab with the release notes, in the language of the app (like in VS Code). The tab is not a note: nothing is saved in the workspace, and it is not reopened at the next start. A first installation opens nothing.

### Changed

- The release notes are no longer shown in Settings > About or in the update dialog at startup: they open in the What's new tab after the update.
- Dependencies updated, including the archive library used by the updater, which fixes a published security advisory (RUSTSEC-2026-0429).

## [0.18.0] - 2026-10-29

### Added

- Split view: the **Split into two areas** button on the right of the path bar (or Ctrl+\) shows two notes side by side. Each area has its own tabs and its own open note, and **Close the split** closes the tabs of the right area. A note is open in one area at a time, the divider between the areas can be dragged (or moved with the arrow keys, double click for 50%), and the split and its tabs are reopened at the next start when "Reopen notes at startup" is on.
- You can drag a tab from one tab bar to the other (or into the empty bar) to move the note to the other area.
- New entries "Open on the right" and "Open on the left" in the menu of a note and of its tab: the first one creates the split if needed.
- New shortcuts: Ctrl+\ splits the workspace or closes the split, Ctrl+Alt+→ (also Ctrl+Alt+←) moves the active note to the other area, and Ctrl+Alt+\ moves the focus to the other area. They can be changed in Settings > Shortcuts (except Ctrl+Alt+←).

### Changed

- Emptying the trash and opening large workspaces are faster (new database indexes: the database moves to version 12, and a safety copy is taken before migrating, as for any migration).
- Fewer redraws while dragging the divider between the two areas, moving tasks, switching tabs and changing settings, so the app feels smoother.
- Importing a workspace with many audio files checks them in batches.
- The audio settings, the audio player and the update dialog look and work the same; the update dialog now also waits for open confirmation dialogs.

### Fixed

- The System theme now follows the operating system's light/dark change while the app is open.
- A file with a corrupt tag can no longer close the app while its audio metadata is read (the release build no longer aborts on a panic).
- Preferences, tabs and other settings are written with a single delayed save, so no setting is lost when you close the app right after a change.
- The links to the project's issues and comparison pages in the release notes now open.
- The add task and add section forms no longer react to clicks while they are closed, and an extra `undefined` style class on the sidebar is gone.

## [0.17.0] - 2026-10-28

### Added

- New setting "Text size" (Settings > Appearance): a size in px from 12 to 24 (16 is the normal one) that makes the whole app bigger or smaller (text, icons and spaces). Change it with the - and + buttons, or with Ctrl+Plus, Ctrl+Minus and Ctrl+0 (back to normal).
- New setting "Font" (Settings > Appearance): the default one, or Inter, Lora, JetBrains Mono, Atkinson Hyperlegible or OpenDyslexic, which come with the app and are loaded only when chosen.
- New setting "Open at startup" (Settings > Notes): the home page, the last workspace used, or always a workspace you choose. It replaces the switch "Reopen the last workspace at startup": whoever had it on keeps the last workspace.
- New setting "Hardware acceleration" (Settings > System, on by default): turn it off if you see graphics problems; it applies at the next start and offers to restart now.
- Audio: new settings "Pin the player", "Repeat the track" and "Resume where you left off" (the last two are off by default, the position of each track is remembered), and the playback speed you choose in the player is remembered.

### Changed

- The language is chosen from a menu, and the select, input and text fields use the same background as the outline buttons.
- In the settings the reset button of a row comes before its control, so the controls end at the right edge of every row (also in the shortcuts page). In a narrow window the control goes under the text instead of squeezing it.
- All the scrollbars share one style (9px). The scrollbar of a group sits under its header, and the "New task" button of the tasks directly in a group stays at the bottom while the list scrolls.
- The "+" between two tasks is also centered above the first task, and has more room around its icon.
- The release pipeline runs its checks next to the builds and builds the portable zip in the Windows job, so a release is faster.

## [0.16.0] - 2026-10-28

### Added

- Select tasks with the keyboard: Shift+Up/Down/Home/End extend the selection and Ctrl+Space (Cmd+Space on macOS) adds or removes the focused task. The details panel does not change while you select, and a screen reader announces when the selection drops to one task or none.
- New setting "Completed tasks at the bottom" (Settings > Notes): in every list (sections, tasks directly in a group, subtasks) the completed tasks are shown after the open ones. Display only: the saved order does not change.
- New setting "Confirm deleting only when there is content" (Settings > Notes, on by default): an empty note, section or group goes straight to the trash with "Undo", and with the setting off none of them asks. Folders, workspaces, tasks and multiple selections always ask.
- New setting "Remember window position and size" (on by default, not available in the portable version): the window comes back where you left it at the next start.
- New setting "Keep the window on top": it applies at once and is remembered at the next start.

### Changed

- The fields for adding a task, a subtask or a task between two others no longer have the add and close buttons: press Enter to add and Esc to cancel (a hint is read by screen readers).
- Dragging a task that is part of a multiple selection moves only that task, clears the selection and says so to screen readers. While a dragged item is over no valid target the cursor shows "not allowed".
- Names (workspaces, folders, notes, groups, sections, templates, automations) are limited to 120 characters.
- Accessibility and readability: the vertical scrollbar is wider and darker, the border of the destructive button has more contrast, the selected color shows a check, the breadcrumb is announced in the language of the app, the group and section names say "press Enter to rename", the switch of an automation has a neutral name, the editor of the automations announces the current step, and the descriptions of rules and rows are larger.
- The error pages show a translated message with the technical details folded away and can copy them. Trash, archive and template lists announce their loading and respect reduced motion; the footer of the trash has "Close" on the left and "Empty trash" on the right.
- Template dialogs select the prefilled name when they open, and the errors of the import and note-from-template forms are linked to their fields for screen readers. The template picker no longer says "No results" while loading or after an error.
- The update dialog no longer watches the whole page while it waits for another dialog.

### Fixed

- The floating music player no longer flashes at its old position for a frame when you release it after dragging.
- A section without tasks keeps the space of the collapse arrow, so its title no longer shifts; the description icon of a task is no longer a hidden button that can take the focus; the "New group" label in the drop area is centered and more readable.
- The error of the delete dialog is linked to its confirm button for screen readers.

## [0.15.0] - 2026-10-28

### Added

- Edit a template like a normal note: "Edit" in the templates dialog opens it in a "Template" tab. Changes are saved on their own, undo and redo work as in any note, and if the app closes the tab comes back at the next start (when "Reopen notes" is on) or the changes are saved into the template. The "⋯" menu of a template has "Duplicate" and "Refresh from another note"; "Refresh from the note" stays off while the editor is open.
- A thin line with a "+" appears between two tasks when the mouse is over it (also above the first task, between subtasks and among the tasks of a group): a click opens the field of a new task in that place. With "Keep adding tasks" on, the field moves under the new task. Undo removes it in one step. Settings > Notes: "Line to insert a task" (on by default).
- The tasks can be used with the keyboard: Tab enters a list in one stop, Up and Down, Home and End move between the tasks of the same list, Right and Left open and close the subtasks (or go to the first child or the parent), Space completes, Enter renames, Shift+F10 or the Menu key opens the menu, and Alt+Up and Alt+Down move the task and say its new position to screen readers. The shortcuts have a new "Tasks" category.
- Selected tasks are marked with a dashed outline and a hidden "selected" text for screen readers, not only with a color, and a counter ("3 selected") shows when two or more are selected.
- A "+" button in the path bar, the first on the left, creates a new group (same as `Alt+N`); it replaces the dashed box after the groups.

### Changed

- When the window gets smaller and the note would be narrower than 420 px, the sidebars close on their own (the right one first, then the left one) and they are not reopened by themselves.
- Audio files of a group never scroll: the list shows every file above the sections.
- Small improvements from the UI review: names for screen readers, a thicker focus ring, the resize handle of the sidebars, the search field of the notes, the details panel and the error page.
- The database is upgraded to version 11 when the app starts (a backup is made first, and it is automatic): the notes being edited as templates are kept in the same table as the notes. Modification dates do not change; an older version of the app cannot open the upgraded database.
## [0.14.0] - 2026-10-27

### Added

- The list of the tasks created directly in a group can sit anywhere among its sections, not only on top. Move it with "Move task list up" and "Move task list down" in the menu of the group; a section can step over it with "Move up" and "Move down" or by dragging, and a line shows whether it lands above or below the list. The "New task" button of the group adds to the list where it is. Undo and redo work, and after the update everything stays as it was (list on top).
- Templates and export files save the position of the list of the group tasks.
- Open and closed groups and sections are remembered: they stay as you left them when you restart the app. Everything is open after the update. The search still opens what hides a match, but only while it is open.
- "Collapse subtasks" and "Expand subtasks" in the menu of a task that has subtasks: the subtasks are hidden and the task shows the count of the completed ones (also with that option off). Adding a subtask to a collapsed task expands it. The state is remembered like the one of groups and sections.
- The tree of the left sidebar can be used with the keyboard: Up and Down move between rows, Right and Left open and close folders (or go to the first child or the parent), Home and End jump to the first and last row, and Tab enters and leaves the tree in one stop. The active tab scrolls into view, and a closed folder that holds the open note shows a dot.

### Changed

- Confirmations and deletions run once even when you press Enter or click twice; the buttons wait while the action is running.
- The toasts with an action ("Undo", "Show") stay for 8 seconds instead of 3.
- Bigger click areas for the small buttons (audio player, window buttons, tabs, path bar, search) and the close button of the dialogs has full contrast.
- A click outside the field of a new task or a new section no longer discards what you typed; the list of audio files of a group scrolls after a few files; the drop lines and rings of the drag are no longer cut off, and the width handle of a group no longer covers its scrollbar.
- The workspace picker tells apart two workspaces with the same name.

- The database is upgraded to version 9 when the app starts (a backup is made first, and it is automatic): the list and the sections of a group share one order. Modification dates do not change; an older version of the app cannot open the upgraded database.
- The database is upgraded to version 10 when the app starts (a backup is made first, and it is automatic): groups, sections and tasks remember whether they are open or closed. Modification dates do not change, and opening or closing something does not change them either; an older version of the app cannot open the upgraded database.

## [0.13.0] - 2026-10-27

### Added

- Path bar above the groups showing `Folder › Subfolder › Note`. Click a segment to show it in the left sidebar: the sidebar opens, the folders above it expand and the row is scrolled into view and selected.
- Search in a note: the search button in the path bar (or `Ctrl+F`) opens a field that highlights the matches in tasks, subtasks, sections and groups, with an "N of M" counter. `Enter` and `Shift+Enter` move between the matches, which open the collapsed groups and sections that hold them, and `Esc` closes the search.
- Tasks can be created directly in a group, without a section: the dashed "New task" button under the tasks of the group adds one, and they can be moved to and from the sections (drag and drop, "Move to…"). A new section is created from the menu of the group ("New section").
- Groups can be resized: drag the right edge of a group, or use the arrows, Home and End on the focused edge, and double-click it to go back to the automatic width. The width is saved with the note, and the completion bar of the group hides when the group is narrower than 320 px.
- Select several tasks with `Ctrl/Cmd+click` and `Shift+click` (`Esc` clears the selection), then delete, archive, color or move them together from the right-click menu. Each action is a single step of the undo.
- Automations can use the tasks created directly in a group as the place a rule starts from and as the destination of a move ("Group X, direct tasks").
- Settings > Notes: "Keep adding tasks" (on by default). After creating a task the field stays open for the next one; `Esc` or `Enter` on an empty field closes it.
- A pin on the floating audio player locks it in place, so it cannot be moved by mistake.
- Right-click on the empty area of a note: new group, and show or hide the completed tasks.

### Changed

- The note search shortcut is now `Ctrl+K` (it was `Ctrl+O`); `Ctrl+F` searches inside the open note. Both can be changed in Settings > Shortcuts.
- The button that hides the completed tasks moved from the tab of the note to the path bar. Its shortcut, `Ctrl+Shift+H`, is the same.
- The button at the bottom of a group adds a task; sections are created from the menu of the group.
- The horizontal scrollbar of the groups is taller and easier to grab.
- A task no longer shows a "Show details" button when you hover it; the entry is still in its menu.
- Export files have a new format (version 2): files exported by older versions are not accepted anymore. The database is upgraded to a new version when the app starts (a backup is made first); an older version of the app cannot open it.
- The summaries of the trash and of the archive no longer count the hidden section that holds the direct tasks of a group, and a task directly in a group shows "Note X › Group Y".

### Fixed

- The "…" button of groups, sections and audio files is centered vertically in its row.
- When a group is widened, its completion bar, counters and "…" button stay on the right edge of the header.
- Opening the field of a new task in a group of automatic width no longer adds a horizontal scrollbar, and its add and cancel buttons share the row instead of stretching.
- A menu opened while a task is being created no longer closes when the new task field takes the focus back.

## [0.12.0] - 2026-10-23

### Added

- Documentation site in English and Italian: [ivanerricis.github.io/easytask](https://ivanerricis.github.io/easytask/). Open it from Help > Documentation, with `F1` (the shortcut can be changed in Settings > Shortcuts) or from Settings > About. It opens in the language of the app.

### Changed

- The button next to the search bar that goes back to the home page is an arrow instead of a house.

### Fixed

- The last tab of the open notes has its right border again when it is not the active one.
- The placeholder of the search box in Settings is no longer cut off.

## [0.11.0] - 2026-10-22

### Added

- Settings: a search box finds an option by its name. Esc, the X button or choosing a category clears it.
- Settings > System (new): start EasyTask with Windows, and close it to the notification area. When this option is on, closing the window hides it and the icon in the notification area opens it again or quits. Both options are off by default.
- Settings > Data: the trash can empty itself of items deleted more than a chosen number of days ago (checked when the app starts). The automatic backup has a frequency and can be saved in a folder of your choice.
- Settings > Notes: new tasks can be added at the top or at the bottom, the task list has a density setting, and the spell check can be turned off.

### Changed

- Faster with large notes and workspaces: dragging tasks, sections and sidebar items, switching notes and tabs, playing audio and exporting a workspace do much less work.
- Settings are laid out as cards in a wider dialog.
- Sidebar rows no longer show the folder and note icons.

### Fixed

- "No color" removes the color of folders and notes in the sidebar again.
- The tooltip of a sidebar row no longer comes back after its right-click menu closes.
- Ctrl, Alt or Shift with the arrow keys no longer switch notes from the tab bar.
- Long error messages in the delete dialogs wrap instead of overflowing.
- Security: `rustls-webpki` 0.103.16 and `webpki-root-certs` 1.0.10 fix two certificate advisories (RUSTSEC-2026-0382 and 0383).


## [0.10.1] - 2026-10-16

### Fixed

- App icon: it is back on a dark rounded tile with a larger symbol. The transparent version showed white shapes that disappeared on light backgrounds (light taskbar, file explorer, installer), leaving only the orange pill.
- Security: `rustls` is updated to 0.23.46, which fixes four advisories in its TLS handling (RUSTSEC-2026-0346, 0347, 0348 and 0349).

### Changed

- Updated the dependencies: the Tauri plugins and the other Rust crates, the npm packages, the GitHub Actions and the audio tag reader (`lofty` 0.25). Tags and the year of the audio files are read as before.


## [0.10.0] - 2026-10-13

### Added

- Automations: four "state" triggers (a section or a group has no open tasks / has at least one open task) that set a color. Two rules are enough to turn a group or a section green when nothing is left to do and red otherwise. They apply silently, with no notification and no undo entry, and are re-evaluated whenever the tasks of the note change and when the rules are saved.
- Automations: an empty-state screen with an example and a single "New automation" button.

### Changed

- Palette: six colors (Yellow, Cyan, Lime, Pink, Lavender, Beige) are darker so the text stays readable in both themes; colors already assigned do not change. The swatches are squares, and a test guards the contrast.
- Automations: the sentence of a rule names its color, lists are joined with "and", the steps are checked, Enter moves forward, and the notification shows a short title with one line per rule.
- Update dialog and Settings share the same parts: focus on "Update now", release notes you can scroll with the keyboard and with links, progress and a hint.
- Menus of sections, groups and tasks are reordered with separators; the color submenu has "No color" instead of "Delete"; "Move to…" is polished.
- Buttons for creating things have a "+" and are filled when a list is empty. The checkboxes of subtasks are aligned with the text of their parent, and the audio player and Settings > Audio are aligned.

### Fixed

- Text context menu: wrong position, undo and redo, read-only and number or email fields; the text of a task keeps the task menu.
- The "When" selector of the automation editor no longer cuts its text.

### Notes

- Going back to an older version ignores the new state rules without errors.

## [0.9.1] - 2026-10-13

### Added

- Right click on the empty space of the sidebar tree: a menu to create a note or a folder in the root of the workspace, create a note from a template, import, and collapse or expand all the folders.
- Settings > Appearance > Animations: a new "System" value, now the default, that follows the animation setting of the operating system (in Windows: Settings > Accessibility > Visual effects > Animation effects) and changes with it. Whoever chose a speed before keeps it.

### Changed

- Folders open and close with a sliding animation, and their arrow turns smoothly (it follows the animation setting).
- Sidebar: the rows have no border until they are hovered; the open or selected note has an accent border all around, and a collapsed folder that holds the open note a fainter one. The icon of a note sits under the icon of its folder, and the buttons at the top are grouped (create, files, view) by dividers.
- Settings > Appearance > Animations: a shorter description.

### Fixed

- Dragging groups, sections and tasks in a note, and notes and folders in the sidebar, is smooth also with hundreds of tasks: only the row concerned is redrawn when the pointer changes target (in a note with 213 tasks, the frames of a drag went from up to 100 ms to 17 ms).
- The focus ring of the last item of a folder was cut at the bottom.

## [0.9.0] - 2026-10-12

### Added

- An empty note shows a "New group" button in the middle, besides the shortcut hints.
- Settings > About: a button copies the path of the database.
- Settings > Appearance: the colors under Color intensity are labeled "Preview".

### Changed

- Confirmations of actions that cannot be undone (empty the trash, delete permanently, restore or delete a backup, delete or discard an automation) have a solid red button. The other red buttons have a more visible border.
- The note search (Ctrl+O) lists the notes first: Enter right after opening it no longer undoes the last action.
- Settings: the reset button of a row is always on the right of its control and only shows when the value was changed, so the controls line up. In Italian, "Ripristina" is used for backups, trash and archive only; resetting a setting is now "Reimposta".
- Settings > Data: the backups are listed in a box, with a clock icon to restore them and the unit next to the number to keep.
- The focus ring of buttons and fields uses the accent color.
- The shortcuts dialog scrolls inside, with a fade at the bottom while there is more below.
- Templates: a clearer icon for "Update from note", Delete set apart from the other buttons, and the dialog is only as tall as its list.
- The color button of the new folder and new note dialogs shows a palette icon until a color is chosen.
- The selected task has an accent bar on its left; the templates count in the sidebar is a neutral badge; the note menu is split into groups.
- Home: square buttons, the recent workspaces box is only as tall as its content, and long names and dates are truncated.
- The audio player is moved by its header, which only holds the close button; the title has its own row.
- While a section is dragged, the "New group" column itself is the drop area.
- Success messages disappear after 3 seconds; errors stay for 8.

### Fixed

- Narrow window: the sidebar and the side panel no longer cover the button that hides them.
- The Details tab no longer cuts the task description: the Audio part takes only the space it needs.
- A group name no longer shrinks to "…" next to the progress bar and the counts.
- Settings > About: the database path wraps only after a folder separator.

## [0.8.1] - 2026-10-12

### Changed

- The tabs of the open notes are narrower, and only the open note shows its close button (the others on hover).
- While an item is dragged the pointer is a closed hand everywhere, and a dragged folder, note, group, section or task is slightly tilted.
- The sliders in Settings (color intensity, size and opacity of the audio player) follow the pointer smoothly and apply the value when released.
- Settings > Appearance: the preview of the size of folders and notes was removed.

### Fixed

- Windows: the media controls of the system (volume flyout, lock screen) show EasyTask instead of "Unknown app" while the audio player plays. The previous/next buttons there skip back and forward by 15 seconds.
- The horizontal guide line of a subtask was 1px below the center of its checkbox.

## [0.8.0] - 2026-10-09

### Added

- Rename in place: Rename in the menu of a workspace, folder, note, group or section turns its name into a text field with the whole name selected (Enter saves, Esc cancels). Audio files and templates keep the dialog.
- Sections can have no name, like groups. A group or section without a name shows no text in its header, and Settings > Notes can show its default name (e.g. Group 1) in gray instead.
- Settings > Notes: rename a group, section or task with a click on its name (on by default; when off, Enter still renames) and color the background of a colored task, besides its side bar (on by default).
- Settings > Appearance: animation speed (None, Normal, Slow). Normal, the default, is faster than the animations of the previous versions, which are now Slow.
- Choosing an accent color with too little contrast with the background shows a warning and proposes a close color that can be read.
- Before a database upgrade a copy of the database is kept apart from the automatic backups (the last 10), and is listed in Settings > Backups.
- Loading placeholders (skeletons) for the notes, the home page, the trash, the archive and the templates when the data takes a moment to arrive.

### Changed

- Groups and sections are created like tasks: a single text field, Enter creates, Esc or a click outside cancels (the + and X buttons are gone). The "New group" and "New section" buttons have a dashed border and a label.
- Dialog buttons stay at the bottom of the dialog. In Settings, Trash and Archive the side list of categories takes the whole height of the dialog, and the close button no longer covers "Reset all". "Empty trash" sits next to "Close".
- Trash, Archive, Templates, Settings and the other dialogs open at once (the first opening waited about half a second), and Trash and Archive no longer animate their layout when they open.
- Tooltips are closer to their element, open at once when moving to a neighbouring button, and in the dark theme they are gray with a border instead of white.
- The theme menu in Settings has icons.

### Fixed

- Typing in a text field no longer shows the clear button (X) of the system.

## [0.7.0] - 2026-10-09

### Added

- Automations for the tasks of a note: rules like "when a task is completed in Doing, move it to Done". They react when a task is completed, reopened, created, moved into a section, or when all its subtasks are completed, and they can move the task, mark it completed or to do, add or remove its priority, color it or complete its subtasks. They are managed from the note and section menus (Automations…); every run shows a toast and is undone like any other action. Groups too: when all the tasks of a group are completed, the group can be archived, colored or moved to the top or the bottom of the note, also from the group menu. Rules are kept when a note is duplicated, exported or imported.
- A text menu in the title bar (File, Edit, View, Help), also reachable with Alt or F10, with an icon on every entry.
- The color of the open note can be changed from the Details panel, like the one of a task.
- Tasks can be archived from their menu, with their subtasks: they leave the note without going to the trash, and the Archive has a Tasks tab to restore them (their archived parent tasks come back too).
- Importing a workspace, a note or a folder first shows the names it will get (a free name is proposed) and lets you change them.
- Keyboard: the item menus (…) work with the arrow keys, the note tabs are navigated with the arrows and can be moved left or right from their menu, and the task menu has Rename.

### Changed

- The default accent is a deeper orange, so the text on buttons is white. A color chosen by the user keeps the automatic black or white text.
- The keyboard focus is visible everywhere, click targets are larger, and selects, tabs, toggles and sliders look and behave the same across the app (settings, trash, archive, right panel, audio player).
- While a task is dragged, the section that will receive it is outlined as a whole. The "Add task" button is just a "+". The marker of the selected category in the settings is on the left, and the settings categories never scroll horizontally.
- The compact sidebar opens as a panel over the content and closes with Esc.
- Export workspace left the left sidebar: it is in File and in Settings > Data.
- Long names no longer widen dialogs, groups or tabs: they are truncated or wrap.
- Clearer and consistent wording: "New note", "Collapse", error messages, dates, and "…" everywhere.
- The update check starts 3 seconds after startup.
- The database is upgraded on the first start (a safety copy is taken first).

### Fixed

- Deleting a workspace from the home removes it from the list at once (it stayed there until the page was reloaded).
- Dialogs taller than the window scroll instead of being cut off.
- Toasts follow the theme of the app instead of the one of the system.
- Trash, Archive, Templates and New note from template work from the menu also with the left sidebar closed.
- The workspace grid of the home page no longer scrolls sideways.
- Screen readers: task checkboxes, progress bars, the sidebar tree and the note tabs have proper names and roles.

## [0.6.0] - 2026-10-07

### Added

- A color palette in the creation dialogs: the "Add color" button of the new workspace, folder and note dialogs is now a "+" button next to the name that opens the same palette of the menus (with "Pick another color" for any other color).
- Trash and Archive are divided in tabs by kind of item (folders, notes, groups, sections...), each with its own count and a message when a kind is empty.
- A confirmation toast when an item is moved to the trash.

### Changed

- Folders, notes, groups, sections and tasks are dragged from the whole row or header: the grip handles are gone. The preview shown while dragging has the color of the item.
- A tab can be dropped at either end of the tab bar.
- The close button of the toasts is inside the toast, on the right.
- Automatic backups keep 5 copies by default (it was 7). The value chosen in Settings is not changed.

## [0.5.0] - 2026-10-06

### Added

- Archive: folders, notes, groups and sections can be archived from their menu (or several at once from the multiple selection of the left sidebar). An archived item disappears from the note and the sidebar, with everything inside it, without going to the trash. The "Archive" button next to the Trash lists the archived items divided by kind (folders, notes, groups, sections): from there they can be restored or moved to the trash. Archiving and restoring can be undone, and archived items are kept by the workspace export and import.
- Information about audio files: the Details tab of the right sidebar is split in two, and the lower half shows the audio file that is playing, or the one chosen with "Information" in its menu: cover, title, artist, album and the other tags, duration, format and codec, bitrate, sample rate, bit depth, channels, size and modification date.

### Fixed

- The audio player no longer starts partly outside the window: its position is computed from its real size (it was taken as much shorter than it is).
- "Color content" of a folder can be undone.
- The name of an imported workspace that clashes with an existing one gets the suffix in the language of the app ("(imported)"; it was always "(importato)"), and the errors of the backups and of the import are translated.
- Editing a note with many tasks is lighter: a change to a task no longer redraws every task that has subtasks.

### Changed

- A section without tasks no longer shows its progress bar ("100 %"), as already happens for groups.

## [0.4.0] - 2026-10-06

### Fixed

- Opening a note with many tasks no longer freezes the app: every task text was sized by a script that forced a layout per task (a note with 400 tasks took half a minute, one with 3000 never finished). The webview now sizes the text boxes itself (`field-sizing: content`), and a note with 250 tasks opens in under a second.
- The volume slider of the audio player is smooth: while it is dragged only the player updates, and the volume preference (which re-rendered the whole app and was written to disk on every step) is saved once on release.
- The tree lines of deeply nested subtasks: the line of a subtask that is not the last of its level was hidden when one of its ancestors was the last, so the lines looked broken.
- The description field of the right sidebar has a fixed minimum height.
- One rule for the text on the accent color (buttons, selected options, the tick): the dark or white `--primary-foreground`, also as the light theme starts, before it is computed from the accent.
- Opening a sidebar no longer shows its content squeezed (text in vertical) for a moment: the content keeps its final width while the panel slides open.
- The text of primary buttons (and of other things on the accent color) is dark or white as the accent requires: it was always white, 1.8:1 on the default orange.
- The border of an empty checkbox and of text fields reaches 3:1 in the dark theme (it was 2.8:1).
- Ctrl+Z right after "Move up/down" (or a drag) undoes it: it used to do nothing until the move was saved.
- The modification date of a workspace is updated by any change inside it (add, edit, move, delete or restore of folders, notes, groups, sections, tasks, audio files): it only changed when the workspace itself was renamed or recolored. The start page lists the workspaces by that date.
- Esc works in the fields that create a new task, group or section (it closes them and drops the text), and after Esc the title of a section is no longer saved when the field loses focus. The rename and task description dialogs forget what was typed when they are closed with Esc.
- In the compact size of the sidebar the note and folder rows no longer show scroll bars.
- "Empty the trash" closes the trash dialog when it succeeds.
- Completed tasks that are hidden no longer take their open subtasks with them: a completed task with an open subtask stays visible until everything under it is done.
- The accent color picker no longer lags: while the color is dragged only the preview changes; the preference is stored once, when the picker rests.
- The note search (Ctrl+O) shows the whole path of a note: a note in a subfolder showed only the last folder.
- The buttons in the header of the left sidebar wrap onto a second row when the sidebar is narrow, instead of disappearing.
- Errors of the delete, trash and rename dialogs and of the inline editing of tasks, groups and sections are shown next to the field instead of in a toast.

### Added

- The color bar on the left of a task is twice as wide (4 px instead of 2).
- A button in the header of the left sidebar to create a note from a template: choose the template (with a search box), then the name and folder of the note. The sidebar can no longer be narrower than 224 px (it was 200) so that the six header buttons fit.
- The release notes in the update dialog and in Settings > About are shown in the language of the app (English or Italian). They come from `CHANGELOG.md` and the new `CHANGELOG.it.md`, which the release checks require for every version.
- Export and import of notes and folders. "Export" is in the menu of every note and folder (a folder with everything in it). "Import" is a button in the header of the left sidebar (it imports into the root of the workspace) and "Import here" is in the menu of a folder. The file has the format of a workspace export; names that clash are renamed, missing audio files are skipped, and the import can be undone.
- Multiple selection in the left sidebar: Ctrl+click (Cmd on macOS) adds or removes an item, Shift+click selects a range, Esc clears it. For several items at once: delete, move (by dragging or from the menu), change color and export, each as a single step of the history.
- The note open in the active tab is highlighted in the sidebar (and a collapsed folder that holds it is marked), and the active tab has side borders and a line under the other tabs, so it opens onto the note.
- Sort of the workspaces on the start page: last edit, creation date or name, ascending or descending; the choice is remembered.
- The number of audio files of a group in its header (Settings > Notes), and lines between the groups of a note (off by default).
- A limit for the history of undoable actions (25 to 500, default 50) in Settings > Data.
- Shortcuts to move between the open notes: Ctrl+PageDown / Ctrl+PageUp (can be changed) and Ctrl+Tab / Ctrl+Shift+Tab.
- A button to reset the accent color, next to the picker.
- A backup of the database is taken before it is migrated to a new version of the schema (the copy is in the backups folder; if it fails the app starts anyway).

### Changed

- The default accent color is a stronger orange (#f97316): the pale one was hard to see on a light background.
- Settings: the buttons of the shortcuts are icons only, the Data page has sections (import and export, data folder, backup, history) and so does the Notes page.
- The header of the left sidebar, the note tabs and the tabs of the right panel have the same height, and the tree lines of the sidebar are centered under the folder arrows and a little more visible.

## [0.3.0] - 2026-10-02

### Added

- "Move up" / "Move down" in the menu of tasks, subtasks and sections ("Move left" / "Move right" for groups): a keyboard- and pointer-friendly alternative to dragging. Completed tasks that are hidden are jumped over, and the move can be undone.
- Template dialog: a "New template" button to create a template from any note of the workspace (a search box lists the notes with their folder), as an alternative to the menu of the note.
- Audio player: a restart button, a mute button, a playback speed button (0.75x to 2x), `Alt+P` to play or pause from anywhere in the workspace (it can be changed in Settings > Shortcuts), and the title and state shown to the system (media controls of Windows).
- Audio player: buttons to go back and forward by 15 seconds (the seek keys of the system use the same step), and the transport controls on a row of their own.
- Audio files of a group show what they are doing: bars while playing, pause, a stop square when the track ended.
- "Reset all" for the Appearance page (theme, accent color, language, size of folders and notes, color intensity), with a confirmation.

### Changed

- Clicking the audio file that is loaded pauses or resumes it instead of starting it over (the new restart button does that).
- All the confirmations (move to the trash, delete for good, empty the trash, restore or delete a backup, overwrite a template, reset the shortcuts or the appearance, "file not found") are one dialog with the same look: close button, "Cancel" on the left and the action, with an icon, on the right. The title and the button are red only when data is lost. The main buttons of the other dialogs (new folder, note, workspace, rename...) have an icon too.
- The description of a task is an icon next to the subtask counter (and the first icon of the toolbar that shows when the pointer is over the task) instead of a lone icon on a line of its own under the task.
- The window buttons use the text color instead of the accent (unreadable on the light theme), the maximize button becomes "restore" while the window is maximized, closing turns red on hover, and they have tooltips.
- Audio player: the title has a row of its own (two lines at most, the whole name in the tooltip), the handle is the same as the groups, and tracks longer than an hour show hours.
- In the audio player the arrows move the seek bar by 5 seconds (it was 0.1) and Space plays or pauses; the position is read out in words.
- The "Reset all" button of the Settings sections (Appearance, Audio, Shortcuts) is always in the same place: the title row of the section, on the right.
- The Settings dialog is taller (720px, at most 85% of the window).
- Subtasks hang from tree guide lines under the checkbox of their parent (no more stepped separators), with a slightly smaller checkbox, and a task with subtasks shows how many are done (e.g. `1/3`).
- Settings > Notes has a switch to show or hide the number of completed subtasks of a task.
- The subtask guide lines are easier to see (contrast about 2:1, was 1.3:1) and the counter of a task with all subtasks done uses the normal text color instead of the accent color, which was unreadable on the light theme.
- Group names are always shown in full on one line: the group grows to fit the name instead of truncating it.
- New versions are announced in a dialog at startup (what's new, "Update now", "Later", "Skip this version") instead of a toast that disappeared after 15 seconds.

### Fixed

- Text and icons on the accent color (orange buttons, selected options, the check of a completed task) are dark or white depending on the accent, so they stay readable: white on the default orange gave 1.8:1 on the light theme.
- The drag handle of tasks and subtasks is centered on the checkbox and the first line of text, and the horizontal tick of the tree lines fades while the handle is shown instead of running through it.
- Collapsing a group and opening it again no longer makes it shrink for a moment (and the groups next to it jump): the list of its audio files appears at once instead of a moment later.
- The filled part of the sliders (audio player seek bar, volume and the sliders of the Settings) could stop short of the left edge on wide sliders: near the end of a track the first part of the bar was empty.
- Borders of checkboxes, text fields and the track of switches reach about 3:1 contrast on both themes. On the light theme the `--input` color was written in an invalid way, so these borders turned black and the track of an off switch was transparent.
- An empty group no longer shrinks and clips its header.
- Collapsing a group no longer changes its width (it keeps the width it had while open).
- Reloading the page of a workspace (development builds) restores the workspace from the URL instead of leaving a blank screen.
- Development and test builds (and any run with `EASYTASK_DATA_DIR`) can start while the installed app is open: the single-instance lock only applies to release builds on the default data folder.

## [0.2.0] - 2026-10-01

### Added

- Hide completed tasks (`Ctrl+Shift+H`).
- Duplicate notes and sections.
- Warning in Settings > Data when the data folder is synced by OneDrive, which can cause "database is locked" errors or conflicted copies.

### Fixed

- Backup restore: the backup is validated first and swapped in atomically, so a bad file can no longer leave the database half restored.
- Undo/redo no longer acts on a new item that reused the id of an item permanently deleted from the trash (the history is cleared after a purge).
- The sidebar no longer stays out of date when a reload overlaps another change (e.g. undoing a move), and a failed note delete reopens its tab.
- Double submit in the create dialogs (a fast double click or double Enter created two items).
- Keyboard shortcuts and preferences are validated when read, so invalid stored values fall back to the defaults.
- Workspace import fixes or rejects invalid files up front (empty titles, duplicate names, empty colors, non-audio files, size limits) instead of failing halfway with a generic error.
- Deleting an item that is already in the trash again keeps its original deletion time.
- `Escape` while editing a task now cancels the edit.
- Creating a sub-task under a parent deleted in the meantime now shows an error instead of failing silently, and two backups in the same second no longer fail.

### Security

- Stricter Content Security Policy (`object-src`, `base-uri`, `form-action` and `frame-ancestors` are locked down; the dev server is only allowed in development builds).
- Single instance: launching EasyTask a second time focuses the running window instead of opening a second one on the same database.
- All GitHub Actions are pinned to commit SHAs and the release workflow uses least-privilege permissions.
- Portable mode no longer writes outside its folder (no window-state file in the user profile and no settings fallback in the app data folder).
- `EASYTASK_DATA_DIR` must be an absolute path.
- A native error dialog explains why the app cannot start when the data folder cannot be created.

## [0.1.0] - 2026-10-01

First public release.

[Unreleased]: https://github.com/ivanerricis/easytask/compare/v0.24.0...HEAD
[0.24.0]: https://github.com/ivanerricis/easytask/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/ivanerricis/easytask/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/ivanerricis/easytask/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/ivanerricis/easytask/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/ivanerricis/easytask/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/ivanerricis/easytask/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/ivanerricis/easytask/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/ivanerricis/easytask/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/ivanerricis/easytask/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/ivanerricis/easytask/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/ivanerricis/easytask/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/ivanerricis/easytask/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/ivanerricis/easytask/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/ivanerricis/easytask/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/ivanerricis/easytask/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/ivanerricis/easytask/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/ivanerricis/easytask/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/ivanerricis/easytask/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/ivanerricis/easytask/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/ivanerricis/easytask/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ivanerricis/easytask/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ivanerricis/easytask/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ivanerricis/easytask/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ivanerricis/easytask/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ivanerricis/easytask/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ivanerricis/easytask/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ivanerricis/easytask/releases/tag/v0.1.0
