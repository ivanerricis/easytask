# Themes

A theme decides the colors of the whole app: background, text, cards, borders, highlights and the accent color. EasyTask has nine built-in themes and lets you create your own.

## Choose a theme

Open **Settings > Appearance**. The **Theme** gallery shows a preview of every theme: click one to use it, and use the arrows to move through the gallery. The theme in use is marked **In use**. You can also use the **View > Theme** menu, which lists the themes and has **Manage themes…** to open the settings.

![Theme gallery](../screenshots/en/themes-gallery.png)

There is no **System** choice any more. The first time you start EasyTask, the initial theme is picked from your system: Dark if the system is dark, High contrast if the system asks for more contrast, Light otherwise. After that, the theme you chose stays.

## Built-in themes

| Theme | Base |
| --- | --- |
| Light | Light |
| Dark | Dark |
| Nord | Dark |
| Solarized Light | Light |
| Solarized Dark | Dark |
| Dracula | Dark |
| Sepia | Light |
| High contrast light | Light |
| High contrast dark | Dark |

The two **High contrast** themes keep the contrast ratio of the text at 7:1 or more. They are made for people with low vision.

The background of the native window follows the theme too, so you do not see a white flash when the app starts.

## Accent color

Every theme has its own accent color. If you pick a color in **Accent color** it overrides the accent of the theme; **Use the accent of the theme** brings it back. The contrast warning works as before, see [Colors](./colors#contrast-warning).

## Custom themes

In **Settings > Appearance**, the **Custom themes** section lists your themes. You can have up to 50.

- **New theme** opens the editor.
- On each theme you can **Edit**, **Duplicate**, **Rename**, **Export** and **Delete**. If you delete the theme in use, the app goes back to the default theme.

### The editor

![Theme editor](../screenshots/en/themes-editor.png)

Give the theme a name, choose its **Base** (light or dark: it decides the native controls) and set 11 colors:

| Color | Used for |
| --- | --- |
| Background | The background of the app |
| Text | Main text |
| Cards and panels | Cards, dialogs and panels |
| Muted background | Quiet areas |
| Muted text | Secondary text |
| Highlight | Hovers and selections |
| Borders | Lines and borders |
| Input fields | Fields and controls |
| Error | Errors and destructive actions |
| Warning | Warnings |
| Accent | Buttons and highlights |

A preview shows the result while you edit. The **Contrast** box lists the pairs of colors that are hard to read. The warnings are only informative: you can always save the theme.

::: tip
Start from a built-in theme: duplicate it and change only the colors you want.
:::

### Export and import

**Export** saves a theme in a `.easytask-theme.json` file you can share. **Import…** reads one or more of these files at once; each file is checked on its own, so an invalid one does not stop the others. A file can be up to 64 KiB and must have valid hex colors; the id written in the file is ignored, so an imported theme never replaces one you already have.

### Backups

Custom themes are saved in the database, for all workspaces, so [backups](./data-and-backups) include them.

## Reset

**Reset all** in Appearance goes back to the theme picked from the system. Your custom themes are not deleted.
