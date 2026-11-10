# Audio files

You can attach audio files to a group and play them while you work, without leaving the note. EasyTask stores the path of each file, not a copy.

## Add audio files

1. Open the menu of a group.
2. Choose **Add audio files**.
3. Pick one or more files. Supported formats: `mp3`, `wav`, `ogg`, `m4a`, `aac`, `flac`, `opus` and `webm`.

![Context menu of a group with Add audio files, New section, Move task list up and down, Rename, Change color, Move left and right, Automations, Archive and Delete](../screenshots/en/group-menu-light.png)

The files appear as a list in the group. Click a file to play it. The icon of the file shows its state: playing, paused, ended or not loaded.

::: warning The file stays where it is
EasyTask keeps the path of the file. If you move, rename or delete the file on your computer, EasyTask can no longer find it. See [Missing files](#missing-files).
:::

Each file has a menu with **Rename**, **Show details**, **Update path** and **Delete**. **Delete** moves the reference to the [trash](./trash-and-archive); the file on your computer is not touched.

## The floating player

When you play a file, a small player opens over the note. Drag its top bar to move it. It remembers where you left it. The pin button on the left of the top bar locks the player in place until you unpin it.

| Control | What it does |
| --- | --- |
| Play / Pause | Starts or pauses the track |
| Restart from the beginning | Plays the track again from 0:00 |
| Back 15 seconds / Forward 15 seconds | Jumps in the track |
| Seek bar | Click or drag to move to a point. With the bar focused, the arrow keys move by 5 seconds and `Space` plays or pauses |
| Speed | Click to cycle through 0.75×, 1×, 1.25×, 1.5× and 2×. |
| Mute and volume | Mutes the sound, or sets the volume. Muting is not saved |
| X (Close the player) | Pauses the track and closes the player |

Click the file that is playing to pause it, and again to resume.

### Keyboard and media keys

- `Alt+P` plays or pauses the audio while the player is open. You can change it in **Settings > Shortcuts**.
- The media keys of your keyboard, and the media controls of the system (the volume flyout and the lock screen), show the title of the track and can play, pause and skip.

## Missing files

When you click a file that is no longer at its saved path, EasyTask shows **File not found** with the path it expected. You can:

- click **Update path** and pick the file in its new place
- click **Delete reference** to remove it from the group

You can also choose **Update path** from the menu of a file at any time, for example when you move your music folder.

## Audio settings

Open **Settings > Audio** to change how the player looks and behaves. The options are in the [Settings](./settings#audio) page. If the floating player is turned off, files do not play and EasyTask shows a message that tells you to enable it.

Audio paths are included when you export a workspace. When you import it on another computer, files that are not found there are skipped. See [Data and backups](./data-and-backups).
