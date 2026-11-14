# Data and backups

EasyTask keeps everything on your computer. This page tells you where, how it is backed up automatically, and how to restore or move your data.

## Where your data is

| Mode | Location |
| --- | --- |
| Installed | `Documents/EasyTask` |
| Portable | `data` folder next to `EasyTask.exe` |
| Custom | The folder in the `EASYTASK_DATA_DIR` environment variable |

Portable mode is on while a file named `portable.txt` sits next to `EasyTask.exe`. `EASYTASK_DATA_DIR` must be an absolute path and wins over the other two. It is mostly used by the tests.

The folder contains:

| What | Where |
| --- | --- |
| Database (workspaces, folders, notes, tasks) | `easytask.db` |
| Settings | `settings.dat` |
| Backups | `backups/` |
| Copies made before a database update | `backups/pre-migration/` |
| Logs | `logs/` |

To open the folder, go to **Settings > Data > Data folder > Open data folder** and click **Open**.

![Data settings: backups, export and import, data folder](../screenshots/en/settings-data-light.png)

::: warning OneDrive
If the data folder is synced by OneDrive, **Settings > Data** shows a warning. Syncing can cause "database is locked" errors or conflicting copies of the database. Exclude the folder from OneDrive or use portable mode.
:::

Audio files, images and videos are not stored here. EasyTask keeps only their path. See [Audio files](./audio).

## Automatic backups

EasyTask makes a backup of the database when it starts. The options are in **Settings > Data > Backup**:

| Option | Default |
| --- | --- |
| **Automatic backup** | On |
| **Automatic backup frequency**: every day, every week or every month | Every day |
| **Backups to keep** (1 to 100) | 5 |
| **Backup folder** | `backups` in the data folder |

The frequency decides when a backup is due. "Every day" makes one if none was taken today. "Every week" and "Every month" make one if none was taken in the last 7 or 30 days.

When there are more backups than **Backups to keep**, the oldest are deleted. A failed automatic backup is only written to the log; it never stops the app.

### Choose another folder

Click **Choose…** next to **Backup folder** and pick a folder, for example on another disk or a cloud folder. Click **Use the default** to go back to `backups`. The backup list and **Restore** work on the folder in use.

The copies made before a database update always stay in `backups/pre-migration/` in the data folder.

## Back up now

Click **Back up** next to **Back up now**. EasyTask saves a consistent copy of the database in the backup folder and shows "Backup created". A manual backup counts toward **Backups to keep** like the automatic ones.

Each backup is a file named `easytask-YYYYMMDD-HHmmss.db`. You can copy it anywhere. **Open backups folder** shows the files in the file manager.

## Restore a backup

The **Available backups** list shows every backup with its date and size.

1. Open **Settings > Data > Backup**.
2. In the list, click the restore button of the backup you want.
3. Read the message and click **Restore and restart**.

EasyTask checks that the file is a valid EasyTask database, saves a copy of the current data, replaces the database with the backup and restarts. The safety copy appears in the list marked **(before restore)**. Only the latest one is kept.

::: warning Changes after the backup are lost
Everything you did after the backup was made is not in it. If you are not sure, restore, check, and go back to the **(before restore)** copy if needed.
:::

To delete a backup, click the trash button next to it and confirm.

A backup contains the database only. Your settings and your audio files, images and videos are not part of it.

## Copies before a database update

When a new version of EasyTask has to change the structure of the database, it saves a copy first in `backups/pre-migration/`, named after the two versions, such as `easytask-pre-migration-v6-to-v7.db`.

These copies do not follow **Backups to keep**: EasyTask keeps at most 10 and deletes the oldest. They are listed under **Copies made before a database update** in **Settings > Data > Backup**. You can delete them by hand when you no longer need them.

## Export and import a workspace

Export saves one workspace to a single file you can keep, share or open on another computer.

- **Export**: open the workspace, then use **Settings > Data > Import / Export > Export current workspace** (or **File > Export workspace…**). If the notes link audio, image or video files, EasyTask asks whether to include them: you get a `<name>.easytask.zip` with the files, or a `<name>.easytask.json` with only their paths.
- **Import**: use **Settings > Data > Import / Export > Import workspace** and pick the `.easytask.json` or `.easytask.zip` file. EasyTask creates a new workspace. Nothing already in your app is changed.

The file holds folders, notes with their content (groups, sections and tasks, including the tasks you created directly in a group, and the width of each group), templates and the audio, image and video files linked to the groups (their paths, or the files themselves in a `.easytask.zip`). Items in the trash are not exported.

The export file has a format version (now 3). EasyTask only imports files of the current version: a file exported by an older version of the app, before images and videos could be linked to a group, is rejected.

If an audio file is not found on the computer where you import, it is skipped and EasyTask tells you how many.

## Move to another computer

You have two ways.

**Export and import** keeps one workspace at a time and works between installed and portable versions.

1. On the old computer, export each workspace.
2. On the new computer, install EasyTask and import the files.
3. Copy your audio files and use **Update path** where needed. See [Audio files](./audio#missing-files).

**Copy the data folder** moves everything, including settings and backups.

1. Close EasyTask on the old computer.
2. Copy the data folder (see [Where your data is](#where-your-data-is)) to the same place on the new computer. For the portable version, copy the whole folder with `EasyTask.exe`, `portable.txt` and `data`.
3. Start EasyTask on the new computer.

Use the same or a newer version of EasyTask on the new computer. A backup made by a newer version cannot be restored in an older one.
