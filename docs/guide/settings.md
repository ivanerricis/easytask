# Settings

Open the settings from the app menu (**File > Settings…**). Options are grouped in seven categories. Changes apply at once and are saved automatically.

## Search the settings

Type in the search box (**Search…**) at the top left to find an option by its name or description. The search looks in all categories and shows only the matching rows. Accents do not matter.

Press `Esc`, click the X button or choose a category to clear the search.

## Reset buttons

- A row that differs from its default shows a small reset arrow next to it (accent color, text size, color intensity, each shortcut).
- **Reset all** at the top of a category puts the whole category back to its defaults. It is in Appearance, Audio and Shortcuts. Appearance and Shortcuts ask for confirmation first. Your data is never touched.

## Appearance

![Appearance settings with the gallery of the nine built-in themes, the custom themes and the accent color](../screenshots/en/settings-appearance-light.png){.light-only}
![Appearance settings with the gallery of the nine built-in themes, the custom themes and the accent color](../screenshots/en/settings-appearance-dark.png){.dark-only}

| Option | Choices | Default |
| --- | --- | --- |
| Theme | Light, Dark, Nord, Solarized Light, Solarized Dark, Dracula, Sepia, High contrast light, High contrast dark, and your own themes | Chosen by the system the first time |
| Accent color | Any color, or the accent of the theme | The accent of the theme |
| Language | System, Italiano, English | System |
| Font | Default, Inter, Lora (serif), JetBrains Mono (monospace), Atkinson Hyperlegible (high legibility), OpenDyslexic (for dyslexia) | Default |
| Text size | From 12 to 24 px, with the minus and plus buttons | 16 px |
| Size of folders and notes | Compact, Normal, Large | Normal |
| Color intensity | Slider from 25% to 175% | 100% |
| Animations | System, Off, Normal, Slow | System |

The theme gallery shows a preview of each theme; move between them with the arrow keys. See [Themes](./themes). If the accent color has little contrast with the background, EasyTask warns you and suggests a close color that is easier to see. The font and the text size change the whole app: **Text size** scales text, icons and spaces together, and you can also use `Ctrl`+`Plus`, `Ctrl`+`Minus` and `Ctrl`+`0` (back to 16 px). The fonts are bundled with the app, so they work offline. Color intensity changes folders, notes, groups, sections, the note background and the light background of colored tasks, not the color bar of the tasks. With **Animations** set to System, EasyTask follows the system setting.

## Notes and sections

![Settings of notes and sections](../screenshots/en/settings-notes-light.png)

| Option | Choices | Default |
| --- | --- | --- |
| **Progress bars**: Show progress bar in sections | On / Off | On |
| Show progress bar in groups | On / Off | On |
| **Counters**: Show number of sections | On / Off | On |
| Show number of tasks | On / Off | On |
| Show number of audio files, images and videos | On / Off | On |
| Show completed subtasks | On / Off | On |
| **Display**: Lines between groups | On / Off | Off |
| Show names of unnamed groups and sections | On / Off | Off |
| Colored task background | On / Off | On |
| Hide completed tasks | On / Off | Off |
| Completed tasks at the bottom | On / Off | Off |
| Collapsed groups (a narrow vertical strip, or a horizontal bar that keeps the width of the open group) | Vertical, Horizontal | Vertical |
| Task density | Compact, Normal, Roomy | Normal |
| **Behavior**: Rename by clicking the name | On / Off | On |
| Keep adding tasks (the field stays open after creating a task) | On / Off | On |
| Line to insert a task (a line with a + between two tasks; with Keep adding tasks the field moves under the new task) | On / Off | On |
| Tasks, sections, groups, notes, folders and tabs move aside while dragging (the others step aside to open the room where the dragged task, section, group, note, folder or tab would land; if off, only the drop indicator is shown) | On / Off | On |
| Position of new tasks | At the top, At the bottom | At the bottom |
| Spell check | On / Off | On |
| Confirm deleting only when there is content (notes, sections and groups: with it on, empty ones go straight to the trash with **Undo**, the others ask first; off never asks. Folders, workspaces, tasks and multiple selections always ask) | On / Off | On |
| **On startup**: Open at startup | Home page, Last workspace used, or one workspace of your list (under **Always open**) | Home page |
| Reopen notes at startup | On / Off | On |

## Audio

![Audio settings](../screenshots/en/settings-audio-light.png)

| Option | Choices | Default |
| --- | --- | --- |
| Default volume | Slider from 0% to 100% | 100% |
| Show the floating player | On / Off | On |
| Pin the player (it cannot be dragged while pinned) | On / Off | Off |
| Player size | Small, Normal, Large | Normal |
| Player transparency | Slider from 40% to 100% opacity | 100% |
| Repeat the track (it starts over when it ends) | On / Off | Off |
| Resume where you left off (each track restarts from where you left it) | On / Off | Off |
| Reset the audio player position | Button | |

When **Show the floating player** is off, audio files are not played. The playback speed chosen in the player is remembered too and has no row here. **Reset all** puts volume, visibility, pinning, size, transparency, speed, repeat and resume back to their defaults. See [Audio files](./audio).

## Shortcuts

Lists every shortcut you can change, grouped as in the shortcuts dialog. See [Keyboard shortcuts](./shortcuts#change-a-shortcut).

![Shortcut settings with the list of shortcuts and their Edit buttons](../screenshots/en/settings-shortcuts-light.png)

## Data

![Data settings: backups, export and import, data folder](../screenshots/en/settings-data-light.png)

| Section | Option | Choices | Default |
| --- | --- | --- | --- |
| Import / Export | Import workspace | Button | |
| Import / Export | Export current workspace | Button (only inside a workspace) | |
| Data folder | Open data folder | Button | |
| Backup | Back up now | Button | |
| Backup | Automatic backup | On / Off | On |
| Backup | Automatic backup frequency | Every day, Every week, Every month | Every day |
| Backup | Backups to keep | 1 to 100 | 5 |
| Backup | Open backups folder | Button | |
| Backup | Backup folder | **Choose…** or **Use the default** | Default (`backups` in the data folder) |
| Trash | Empty the trash automatically | Never, After 7 days, After 30 days, After 90 days | Never |
| History | Undoable actions | 25, 50, 100, 200, 500 | 50 |

Backups, restore and the data folder are explained in [Data and backups](./data-and-backups). The history limit is explained in [Undo and history](./undo-and-history).

## System

![System settings](../screenshots/en/settings-system-light.png)

| Option | What it does | Default |
| --- | --- | --- |
| Start with Windows | Opens EasyTask when you sign in to Windows | Off |
| Minimize to the notification area | Closing the window keeps EasyTask running in the notification area. Use **Quit** in the menu of its icon to exit. The icon menu also has **Open EasyTask** | Off |
| Remember window position and size | The window comes back where you left it at the next start. Not available in the portable version | On |
| Keep the window on top | EasyTask stays above the other windows; applies at once and is remembered at startup | Off |
| Hardware acceleration | Uses the graphics card to draw the app. Turn it off only if you see graphics problems (black screen, flicker). It applies at the next start: a message offers **Restart now**. When off, EasyTask starts with `--disable-gpu` | On |

## About

![About settings with the version of the app and the update check](../screenshots/en/settings-about-light.png)

Shows the version (also the Tauri version), the author, the repository, the documentation link and the path of the database. It also has **Check for updates** and the **Check at startup** switch (on by default). See [Updates](./updates).
