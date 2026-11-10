# Troubleshooting

Common problems and how to solve them.

## Windows shows "Windows protected your PC"

The Windows files are not code-signed yet, so SmartScreen warns about them. Click **More info**, then **Run anyway**. Download EasyTask only from the [Releases page](https://github.com/ivanerricis/easytask/releases). See [Install](./install).

## The app does not start on Windows

EasyTask needs the Microsoft Edge WebView2 Runtime. It is already included in Windows 11 and recent Windows 10. If your Windows 10 does not have it, install the runtime from Microsoft and start the app again.

## "Database from an older, incompatible version"

At startup the app may stop with a message like "Database from an older, incompatible version: delete the file Documents/EasyTask/easytask.db and restart the app."

The database migrations were squashed into a single initial schema. A database file created before that change is not compatible, and the app does not touch it. To start over:

1. Close the app.
2. In the data folder, delete `easytask.db`. Delete `easytask.db-wal` and `easytask.db-shm` too if they exist.
3. Start the app again: a new empty database is created.

::: warning
This permanently deletes the data stored in the old database. Make a copy of the file first if you want to keep it.
:::

The path in the message is for the installed app. In portable mode the folder is `data` next to `EasyTask.exe`.

A similar message says the database was created by a newer version. In that case update EasyTask. See [Updates](./updates).

## Restore from a backup

1. Open **Settings > Data**.
2. Under **Available backups**, find the backup you want.
3. Click **Restore**, then **Restore and restart**.

The current data is replaced with the backup and the app restarts. A copy of the current data is saved first. If the backup was made by a newer version of the app, update EasyTask before restoring it. See [Data and backups](./data-and-backups).

## Logs

EasyTask writes log files to the `logs` folder inside the data folder. To open it, go to **Settings > Data** and click **Open** next to **Open data folder**, then open `logs`. Attach the relevant lines when you report a bug.

## The app is already running

EasyTask runs one instance at a time. If you start it a second time, the window of the first one is shown and focused. If you cannot see it, look in the notification area: with **Minimize to the notification area** on, closing the window keeps the app running there.

## Report a bug

Open an issue on [GitHub](https://github.com/ivanerricis/easytask/issues). Include your version (**Settings > About**), your system, the steps to reproduce and, if you can, the log.

## Report a security issue

Do not open a public issue. Report it privately through a GitHub security advisory, as described in [SECURITY.md](https://github.com/ivanerricis/easytask/blob/master/SECURITY.md). Only the latest released version receives security fixes, so update before reporting.
