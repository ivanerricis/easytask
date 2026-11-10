# Install

Download EasyTask from the [Releases page](https://github.com/ivanerricis/easytask/releases). Download the files only from there.

## Downloads

| Platform | File | Notes |
| --- | --- | --- |
| Windows | Installer (`EasyTask_<version>_x64-setup.exe`) | Installs the app. It can update itself. |
| Windows | `EasyTask_<version>_x64_portable.zip` | No installation: unzip and run `EasyTask.exe`. |
| Linux | `.deb` | Debian, Ubuntu and derivatives. |
| Linux | `.AppImage` | Already portable: make it executable and run it. |

macOS builds are not provided.

## Windows

The installer asks whether to install for the current user or for all users.

Requirements: 64-bit Windows 10 or 11 with the Microsoft Edge WebView2 Runtime. It is already included in Windows 11 and recent Windows 10. See [Troubleshooting](./troubleshooting) if the app does not start.

### SmartScreen

The Windows files (the installer and the portable `EasyTask.exe`) are not code-signed yet. The first time you run them, SmartScreen may show "Windows protected your PC". This does not mean the file is harmful: Windows only warns about programs from publishers it does not know.

To continue, click **More info**, then **Run anyway**.

### Portable version

The zip contains `EasyTask.exe`, `portable.txt` and a short readme.

- While `portable.txt` sits next to the exe, all data lives in the `data` folder beside it. You can keep the app on a USB drive.
- To update, close the app and replace `EasyTask.exe` with the new one. The `data` folder is kept.
- The portable app does not update itself: the update check shows a notice and a link to the Releases page. See [Updates](./updates).

## Linux

- `.deb`: install it with your package manager, for example `sudo apt install ./<file>.deb`.
- `.AppImage`: make it executable (`chmod +x`) and run it.

The exact file names are chosen at build time: check them on the Releases page.

## Uninstall

On Windows, remove EasyTask from the installed apps as usual. The uninstaller removes the app and leaves your data folder, so you keep your workspaces. To remove the data too, delete the folder by hand. See [Data and backups](./data-and-backups) for its location.

For the portable version, delete the folder that holds `EasyTask.exe` and `data`.
