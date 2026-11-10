# Groups, sections and tasks

The content of a note is organized in three levels. A note holds **groups**, shown side by side as columns. A group holds **sections**, stacked in the column. A section holds **tasks**, and a task can have **subtasks**, as deep as you need. A group can also hold tasks of its own, directly under its header, without any section. That list of tasks can sit anywhere among the sections of the group.

![Task details](../screenshots/en/task-details-light.png){.light-only}
![Task details](../screenshots/en/task-details-dark.png){.dark-only}

## Groups and sections

### Add them

- Click the **+** button (**New group**) at the left of the buttons in the bar above the note, or press `Alt+N`: a field opens at the end of the groups. Type a name and press `Enter`. `Esc` closes the field.
- Inside a group, open its menu (the menu button of the group, or a right-click on its header), choose **New section**, type a title and press `Enter`. The field opens at the end of the group.

The name is optional: press `Enter` on an empty field and the group or section is created without a name. EasyTask then shows **Group 1**, **Group 2**… or **Untitled section** in muted text. You can hide those labels with **Settings > Notes and sections > Show names of unnamed groups and sections**.

### Rename, color and manage

Click the name to rename it in place (`Enter` saves, `Esc` cancels), or open the menu of the group or section with its menu button or a right-click.

A right-click on the empty area of the note (outside any group, section or task) opens a small menu with **New group**, **Hide completed tasks** / **Show completed tasks** and **Note background** (see [Colors](./colors#note-background)).

![Group menu](../screenshots/en/group-menu-light.png)

| Entry                                  | Group | Section | What it does                                                    |
| -------------------------------------- | :---: | :-----: | --------------------------------------------------------------- |
| **Add audio files**                    | yes   |         | Adds audio files to the group. See [Audio files](./audio).      |
| **New section**                        | yes   |         | Opens the field for the title of a new section in the group.    |
| **Duplicate**                          |       | yes     | Copies the section, with its tasks, right after the original.   |
| **Rename**                             | yes   | yes     | Edits the name.                                                 |
| **Change color**                       | yes   | yes     | Sets or removes the color.                                      |
| **Move left**, **Move right**          | yes   |         | Moves the group one step in the row.                            |
| **Move up**, **Move down**             |       | yes     | Moves the section one step in its group, also past the list of the group tasks. |
| **Move task list up**, **Move task list down** | yes |   | Moves the list of the tasks of the group one step among its sections. |
| **Move to…**                           |       | yes     | Moves the section to the end of another group, or to a **New group**. |
| **Automations…**                       | yes   | yes     | Opens the automations of the note. See [Automations](./automations). |
| **Archive**                            | yes   | yes     | Hides it without deleting. See [Trash and archive](./trash-and-archive). |
| **Delete**                             | yes   | yes     | Moves it to the trash.                                          |

![Section menu](../screenshots/en/section-menu-light.png)

You can also move things by dragging:

- Drag a group by its header to reorder the groups.
- Drag a section onto another group, or between sections, to move it. While you drag, the other sections (and the list of the group tasks) step aside to open the room where it would land, in the same group or in another one, and the section you are dragging collapses. With **Tasks and sections move aside while dragging** off in **Settings > Notes and sections** a line shows where it lands instead. Drop it on the **New group** area at the edge to make it a group of its own.

The list of the group tasks follows the same order as the sections: by default it is at the top, and you can move it with **Move task list up** and **Move task list down** (also in the right-click menu of the group), which are disabled when the list is already at the end, and are not shown while the group has no sections. [Undo](./undo-and-history) brings it back.

### Collapse, counters and progress bars

Each group and section has a button to collapse it (**Collapse group**, **Collapse section**). A task that has subtasks has **Collapse subtasks** / **Expand subtasks** in its menu: while they are collapsed the subtasks are not drawn, and the task always shows its count of completed subtasks (even if **Show completed subtasks** is off). Adding a subtask to a collapsed task expands it first. Hidden subtasks still count in every progress bar and counter. What is open and what is closed is remembered between runs of the app; it is not part of undo/redo, templates or exports, and opening or closing something does not change the modification date of the workspace. The search opens what hides a match only while it is open. A group can show how many sections, tasks and audio files it holds. Groups and sections can also show a progress bar with the percentage of completed tasks (for a group, tasks and subtasks all count). Choose what to show in **Settings > Notes and sections**: **Show progress bar in sections**, **Show progress bar in groups**, **Show number of sections**, **Show number of tasks**, **Show number of audio files**. The option **Lines between groups** draws a thin guide between the columns.

### Resize a group

Drag the right edge of a group to make it wider or narrower. With the keyboard, focus the edge and use `Left` and `Right` (hold `Shift` for bigger steps), `Home` for the narrowest width and `End` for the widest. Double-click the edge to restore the automatic width. The progress bar of a group disappears when the group gets too narrow to show it.

## Tasks and subtasks

### Add a task

1. At the bottom of a section click the **+** button (**Add task**). To add a task to a group without a section, click the dashed **New task** button of the group: it sits right under the tasks of the group, wherever that list is among the sections, and the new task is created in that list.
2. Type the text in **New task…** and confirm with `Enter` (the field has no buttons). `Esc` closes it and discards the text.

Tasks of a group count in its progress bar and in its task count. Drag one into a section, or the other way round, or use **Move to…** (the group appears in the list as **Group tasks**). **Move up** and **Move down** of a task stay inside the same list.

New tasks go to the end of the section. To put them at the top, choose **At the top** in **Settings > Notes and sections > Position of new tasks**.

### Insert a task between two others

Move the mouse between two tasks (of a section, of a group, or two subtasks): a thin line with a **+** in the middle appears. Click the **+** and a field opens right there. Type the text and press `Enter` to insert the task at that point; `Esc` closes the field and discards the text. The line also sits above the first task, to insert before it.

![The line to insert a task](../screenshots/en/task-insert-field-light.png)

- Only one field is open at a time: clicking another **+** moves it.
- With **Keep adding tasks** on, the field moves under the new task so you can keep inserting in order; with it off, it closes after each task.
- When completed tasks are hidden, the line above the first visible task inserts before it, and the hidden ones stay where they are.
- The line is mouse only, and is not shown while you drag or with several tasks selected.
- Each insert is a single step in the [undo history](./undo-and-history).
- You can turn the lines off with **Settings > Notes and sections > Line to insert a task**.

### Add a subtask

Point at a task and click **Add subtask**, or choose it from the task menu. Type the text and press `Enter`: the field stays open for the next subtask. `Esc` closes it. Subtasks can have their own subtasks, with no limit. The task shows how many of its subtasks are done (for example `1/3`) if **Show completed subtasks** is on.

### Edit and complete

- Tick the checkbox to complete a task, untick it to reopen it.
- Click the text to edit it. `Enter` saves, `Esc` cancels. If you prefer to avoid accidental edits, turn off **Rename by clicking the name**: then use **Rename** in the menu or press `Enter` on the name.

### Priority, description and color

Open the menu of the task (menu button or right-click):

![Task menu](../screenshots/en/task-menu-light.png)

| Entry                                      | What it does                                                          |
| ------------------------------------------ | --------------------------------------------------------------------- |
| **Add subtask**                            | Adds a subtask.                                                       |
| **Add description** / **Remove description** | Opens a window where you write the **Description**. `Shift+Enter` adds a new line, `Ctrl+Enter` saves. |
| **Add priority** / **Remove priority**     | Marks the task as high priority. A flag appears on the task.          |
| **Rename**                                 | Edits the text.                                                       |
| **Change color**                           | Colors the task with a side bar (and a light background, if you want it). |
| **Move up**, **Move down**                 | Moves the task one step among its siblings.                           |
| **Move to…**                               | Moves the task to another section, or under another task as a subtask.|
| **Show details**                           | Selects the task in the details panel.                                |
| **Archive**, **Delete**                    | Hide it or move it to the trash, with its subtasks.                   |

![Task description](../screenshots/en/task-description-light.png)

A task with a description shows a small icon: click it to read the description. The look of the tasks is set by **Task density** (**Compact**, **Normal**, **Roomy**) and **Colored task background**.

### Move tasks

Drag a task by its row. While you drag, the other tasks step aside to open the room where it would land and the task you are dragging collapses, so you see the final order before you drop. Drop it:

- between two tasks, to reorder them;
- on the middle of a task, to make it a subtask of that task (the task shows a ring instead of opening a gap);
- on a section, to make it the last task of that section.

With **Tasks and sections move aside while dragging** off in **Settings > Notes and sections**, the tasks stay still and only the drop indicator is shown. **Move up**, **Move down** and **Move to…** in the menu do the same without dragging. With [Completed tasks at the bottom](#completed-tasks-at-the-bottom) on, a dropped task is placed where you drop it and the list is then shown with the completed tasks last.

### Use the keyboard

Every list of tasks is a tree for the keyboard and for screen readers: `Tab` enters the list on a single task (the last one that had the focus, or the first) and the next `Tab` leaves it, so you do not have to cross every task. Inside the list:

![The focus ring on a task](../screenshots/en/task-keyboard-light.png)

- `↑` and `↓` go to the previous and next visible task, `Home` and `End` to the first and last one. The arrows do not leave the section.
- `→` opens the subtasks of a task (if they are closed) and then goes to the first one; `←` closes them and then goes to the parent task.
- `Space` completes or reopens the task, `Enter` edits its text, `Shift+F10` (or the menu key) opens its menu.
- `Alt+↑` and `Alt+↓` move the task one step among its siblings, like **Move up** and **Move down** in the menu. The focus stays on the task and a screen reader announces "Moved to position N of M" (or that it cannot move any further).

The task that takes the focus becomes the selected one, as when you click it. When you delete, archive or move the focused task away, the focus passes to the next task (or the previous one) so you can go on. To select several tasks with the keyboard, see [Select several tasks](#select-several-tasks). All the keys are listed in [Keyboard shortcuts](./shortcuts#tasks-with-the-keyboard).

### Select several tasks

Hold **Ctrl** (**Cmd** on macOS) and click to add a task to the selection or remove it. Click a task with **Shift** to select every visible task between the last one you clicked and this one, across sections and groups. **Esc** clears the selection, and so does a plain click.

With the keyboard, focus a task and press **Shift+Down** or **Shift+Up** to extend the selection one task at a time (**Shift+End** and **Shift+Home** go to the last and first task of the list); going back toward the first task shrinks it again. **Ctrl+Space** (**Cmd+Space** on macOS) adds the focused task to the selection or removes it, so you can pick tasks that are not next to each other: move with the plain arrows, which keep the selection, and press it on each one. These keys do not change the task shown in the details panel. When the selection shrinks to one task or to none, a screen reader announces it; with two or more, it reads the counter.

Right click a selected task (or open its menu) to act on all of them at once: **Delete N tasks**, **Archive N tasks**, **Color** and **Move to…** (the end of a section, or the tasks directly in a group). A selected task stands for its subtasks too, so they are deleted, archived and moved with it. Each action is a single step in the [undo history](./undo-and-history). Dragging still moves one task at a time.

Selected tasks get a dashed outline (not only a tint) and are announced as "selected" by screen readers; with two or more selected, a counter such as "3 selected" appears at the bottom of the note.

![Selected tasks with the dashed outline and the counter](../screenshots/en/task-selection-light.png)

## Search in a note

Press `Ctrl+F` or click the magnifier in the path bar above the groups to open the search field. As you type, the matches are highlighted in the text of tasks and subtasks and in the names of sections and groups (not in task descriptions), ignoring case and accents, and the counter, inside the field, shows which one you are on, like "3 of 12", or "No results". **Enter** goes to the next match and **Shift+Enter** to the previous one; the current match is orange with a ring, scrolls into view and opens the collapsed group or section that contains it. Besides **Enter** and **Shift+Enter** you can use the **Next result** and **Previous result** buttons. Completed tasks that are hidden are not searched. **Esc** (or the close button) closes the field and clears the highlights.

## Hide completed tasks

Press `Ctrl+Shift+H`, use the eye button in the path bar above the groups, or choose **View > Hide completed tasks**. Completed tasks and their subtasks disappear, and each section tells you how many are hidden. A completed task that still has an open subtask stays visible, so open work is never lost. Nothing is deleted: press the shortcut again to see them. To start hidden, use **Settings > Notes and sections > Hide completed tasks**.

## Completed tasks at the bottom

Turn on **Settings > Notes and sections > Completed tasks at the bottom** to see the completed tasks after the open ones in every list: the tasks of a section, the tasks directly in a group and the subtasks of a task. It is only a view: each block keeps its order, the order saved in the note does not change and nothing is moved when you complete or reopen a task (it just changes place on screen). It works together with **Hide completed tasks**.

With it on, the task selection, the search and the keyboard follow the order you see. **Move up** and **Move down** (and `Alt+↑` / `Alt+↓`) move a task among the tasks of the same kind, and stop at the edge of the open tasks or of the completed ones. The **+** line above the first completed task adds a new task after the last open one, and there is no **+** line between completed tasks. When you drag a task, it is placed where you drop it, then the list is shown again with the completed tasks last.

## The details panel

The panel on the right has two tabs. Open or close it with `Ctrl+Shift+B` or **View > Details panel**.

**Details** shows:

- for a selected task (click it): its path, status, a switch for **High priority**, the **Color**, the **Description** (editable, with **Save** and **Cancel**), the progress of its subtasks and its dates;
- for the note, when no task is selected: the number of groups, sections and tasks, the overall progress, the color and the dates.

**History** lists the actions you can undo and redo. See [Undo and history](./undo-and-history).

## Small windows

Under 900 pixels of width, the sidebar and the details panel become overlays that start closed and cover the note while open. Open them with `Ctrl+B` and `Ctrl+Shift+B`.

## Spell check

EasyTask underlines misspelled words while you type. Turn it off with **Settings > Notes and sections > Spell check**.
