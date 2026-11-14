# Workspaces

A workspace is the top level of EasyTask: it holds your folders and notes. Use one workspace per project or area of your life. The home page lists them all.

![The home page with the Welcome back title, the New workspace and Import a workspace buttons and the recent workspaces as cards](../screenshots/en/home-light.png){.light-only}
![The home page with the Welcome back title, the New workspace and Import a workspace buttons and the recent workspaces as cards](../screenshots/en/home-dark.png){.dark-only}

## The home page

The home page shows **Welcome back!**, the two buttons **New workspace** and **Import a workspace**, and the list **Open a recent workspace**.

Above the list you find three buttons:

| Button            | What it does                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **View as list** / **View as grid** | Switches between cards and compact rows. EasyTask remembers your choice.         |
| **Sort**          | Sorts by **Last edited**, **Creation date** or **Name**, in either direction.                      |
| **Trash**         | Opens the workspaces you deleted. See [Trash and archive](./trash-and-archive).                    |

![The recent workspaces shown as a list of compact rows](../screenshots/en/home-list-light.png)

Click a workspace to open it. A card shows its name, a colored bar on the left (if you gave it a color) and the creation and modification dates.

::: tip
If you close the app while a workspace is open, EasyTask can reopen it at the next start. Choose it in **Settings > Notes and sections > Open at startup**: **Home page**, **Last workspace used** or **Always open** (a workspace you pick).
:::

## Create a workspace

1. Click **New workspace**, or press `Ctrl+N` on the home page.
2. Type a name in **Name**.
3. Optionally pick a color with the color button next to the name.
4. Click **Create workspace**.

![The New workspace dialog with a field for the name](../screenshots/en/create-workspace-dialog-light.png)

Workspace names are unique: if the name is already used, the dialog shows an error and you pick another one.

## Rename, color, export, delete

Click the menu button on a workspace (it appears when you point at the card), or right-click the card.

![Context menu of a workspace on the home page](../screenshots/en/home-workspace-menu-light.png)

| Entry             | What it does                                                                      |
| ----------------- | --------------------------------------------------------------------------------- |
| **Rename**        | The name becomes a text field in place. `Enter` saves, `Esc` cancels.             |
| **Change color**  | Sets or removes the colored bar of the card.                                      |
| **Export**        | Saves the workspace to a file. See below.                                         |
| **Delete**        | Asks for confirmation (**Move to trash**), then moves the workspace to the trash. |

Deleting does not destroy anything: you can restore the workspace from the home **Trash** until you empty it. Details in [Trash and archive](./trash-and-archive).

## Export a workspace

1. Open the menu of the workspace and choose **Export**. Inside a workspace you can also use **File > Export workspace…**.
2. If the notes link audio, image or video files that exist, EasyTask asks **Include the linked files (audio, images and videos)?** and shows how big they are. Choose **Paths only** for a small `<workspace name>.easytask.json` file, or **Include the files** for a single `<workspace name>.easytask.zip` that also holds the files.
3. Choose where to save.

The file contains the folders and notes of the workspace with their content (groups, sections, tasks), the automations of the notes and the templates. Items in the trash are left out. Use it to move a workspace to another computer or to keep a copy.

::: info
A `.easytask.json` file holds only the paths of the audio, image and video files, not the files themselves. A `.easytask.zip` holds the files too (a progress bar is shown while it is written); files that cannot be found on the computer are left out and the message at the end tells you how many.
:::

## Import a workspace

1. On the home page click **Import a workspace**.
2. Pick a `.easytask.json` or a `.easytask.zip` file.
3. EasyTask shows an **Import** dialog with the **Workspace name** to use. Check it, change it if you want, and click **Import**.

The proposed name is already free. If a workspace (also one in the trash) has the same name, EasyTask adds a suffix such as `Website redesign (imported)`, then `(imported 2)`, and so on. If you type a name that is taken, the dialog shows an error and stays open so you can change it.

When you import a `.easytask.zip`, EasyTask copies its files into the `media` folder of the [data folder](./data-and-backups) (nothing is overwritten) and the notes use those copies. If you cancel the import, the copies are deleted.

After the import a message tells you if some files were skipped. Audio, image and video files that cannot be found on the computer are skipped, everything else is imported.

Some limits:

- The file must be an EasyTask export, at most 50 MB (for a `.easytask.zip` the limit is for the data inside, not for the files).
- A file that holds only a note or a folder cannot be imported here: open a workspace and use **Import a note or folder** in the sidebar. See [Folders and notes](./folders-and-notes).

## The application menu

At the top of the window there is a text menu. On the home page it has fewer entries than inside a workspace.

![The application menu bar with File, Edit, View and Help](../screenshots/en/app-menu-light.png)

The screenshot shows the **File** menu inside a workspace.

| Menu        | Entries on the home page                                                              |
| ----------- | ------------------------------------------------------------------------------------- |
| **File**    | **New workspace…**, **Trash…**, **Settings…**, **Exit**                               |
| **View**    | **Theme**: the built-in themes and your own, and **Manage themes…**                   |
| **Help**    | **Documentation**, **Keyboard shortcuts…**, **Release notes**, **About and updates…** |

Press `Alt` alone or `F10` to move the focus to the menu and use it with the keyboard.
