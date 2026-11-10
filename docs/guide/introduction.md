# Introduction

EasyTask is a desktop to-do list built around workspaces, inspired by tools like Notion, Obsidian and Trello. Everything is stored locally on your computer.

![An open note with colored groups and sections and its tasks, the folder tree on the left, the tabs on top and the details panel on the right](../screenshots/en/workspace-light.png){.light-only}
![An open note with colored groups and sections and its tasks, the folder tree on the left, the tabs on top and the details panel on the right](../screenshots/en/workspace-dark.png){.dark-only}

## Structure

Each workspace holds folders and notes. A note holds groups, groups hold sections, sections hold tasks, and tasks can hold sub-tasks.

```text
Workspace
 ├── Folders (nestable)
 │    └── Notes
 └── Notes
      └── Groups
           └── Sections
                └── Tasks
                     └── Sub-tasks (nestable)
```

Folders and sub-tasks nest without limit. Groups and sections can be left without a name.

## Main features

- **Workspaces** with their own folders and notes. See [Workspaces](./workspaces) and [Folders and notes](./folders-and-notes).
- **Groups, sections, tasks and sub-tasks**, with rename in place and drag and drop. See [Groups, sections and tasks](./groups-sections-tasks).
- **Colors** on any element. See [Colors](./colors).
- **Automations**: per-note rules that act on tasks and groups when something happens. See [Automations](./automations).
- **Templates**: save a note as a template and create new notes from it. See [Templates](./templates).
- **Trash and archive**: restore what you deleted, or hide what you do not need now. See [Trash and archive](./trash-and-archive).
- **Undo and redo** with a history of your actions. See [Undo and history](./undo-and-history).
- **Audio**: attach audio files to a note and play them in the app. See [Audio](./audio).
- **Search notes** and **customizable keyboard shortcuts**. See [Keyboard shortcuts](./shortcuts).
- **Split view**: two notes side by side, each with its own tabs. See [Folders and notes](./folders-and-notes#split-into-two-areas).
- **Note background**: a color behind the whole note. See [Colors](./colors#note-background).
- **Export and import** a workspace as an `.easytask.json` file.
- **Italian and English** interface, nine built-in themes (including high contrast) and your own custom themes. See [Themes](./themes).
- **Updates** with signed releases. See [Updates](./updates).

### Settings

The settings dialog has a search box, so you can find an option by its name. Among the options:

- start EasyTask with the system and close it to the notification area (**System**);
- empty the trash automatically after a number of days, choose how often the automatic backup runs and in which folder it is saved (**Data**);
- choose whether new tasks go at the top or at the bottom, the density of the task list, and turn the spell check on or off (**Notes and sections**).

See [Settings](./settings).

## Platforms

| Platform | Notes |
| --- | --- |
| Windows 10/11 (64-bit) | Installer or portable zip |
| Linux | `.deb` and `.AppImage` |

macOS builds are not provided. See [Install](./install).

## Where your data is

Data stays in a local folder, in a SQLite database, with automatic backups. See [Data and backups](./data-and-backups).

## Next

[Install](./install) the app, then follow [Getting started](./getting-started).
