# Pages

A page is a Markdown document in the sidebar. Use it for text that is not a list of tasks: meeting notes, a plan, a README. A page is stored as plain text, exactly as you type it, and can be shown formatted.

## Create a page

- Press `Ctrl+Shift+N`.
- Or use **New page** in the **File** menu, in the header of the sidebar, in the menu of a folder, or in the menu of the empty area of the tree.

A page lives in the tree like a note: you can put it in a folder, rename it, move it with drag and drop, open it in a tab or in the [split view](./folders-and-notes#split-into-two-areas), duplicate it, archive it, delete it (it goes to the [trash](./trash-and-archive)) and export it.

## Write and preview

A page opens as a text editor. Type in Markdown. The text is saved by itself shortly after you stop typing, and when you close the page.

To see the formatted page, click the **text / preview** button in the path bar above the page (**Show the formatted preview**, then **Show the Markdown text**). The choice is kept for each page and each area.

The preview supports:

- headings, **bold** and *italic*;
- bullet and numbered lists, quotes and horizontal rules;
- `inline code` and blocks of code;
- checklists (`- [ ]` and `- [x]`): click a box in the preview to tick it, and the text is changed for you;
- links written as `[text](address)` and plain addresses (`http`, `https` and `mailto`). Use `Ctrl`+click to open a link in the browser.

Raw HTML is never run: it is shown as text.

## Undo and redo

`Ctrl+Z` and `Ctrl+Y` work also inside the text. Each burst of typing, saved after a pause, is one step of the [history](./undo-and-history) called "Edit text of page". The steps survive the switch to the preview.

## Search

- `Ctrl+K` also finds the words inside the text of the pages. The pages that match are listed under **In the text of pages**, with a piece of the text.
- `Ctrl+F` (or the search button of the path bar) searches inside the open page, in the text and in the preview, with the counter and the next and previous buttons.

## Export

In the menu of a page, **Copy as Markdown** copies its text and **Export PDF** opens the print window of the system, where you can choose **Save as PDF**. The page is printed formatted, as in the preview.

## What a page does not have

The path bar of a page has the breadcrumb, the search, the split view and the text / preview button. Groups, tags, **Hide completed tasks**, [automations](./automations) and [templates](./templates) are only for notes.

An older version of EasyTask cannot open a database that has pages (see [Data and backups](./data-and-backups#older-versions-of-easytask)), and shows a page imported from a file as an empty note.
