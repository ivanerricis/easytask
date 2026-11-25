import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { $, browser } from "@wdio/globals"
import { byLabel, byText, openContextMenu, sectionCard, topDialog, tr, treeRow, typeInto, waitForApp, toolButton } from "../helpers"
import {
    addGroup, addSection, addSubtask, addTask, applyAppearance, closeDialog, dialogEl, fillDialogName, goCategory, goHome,
    openNote, openSettings, openTaskMenu, openWs, pad, pickColor, recover, setPanel, setSidebar, setTab, settle, submitDialog,
    showTaskDetails, taskRowAction, waitDialogGone, waitHome, type Lang, type Theme,
} from "./tour-kit"

/**
 * Visual tour of the real app: seeds a few workspaces through the UI and saves PNG screenshots of every main screen
 * (theme x language x window size) and of the dialogs / menus / settings pages (light theme, Italian).
 * Output: e2e/output/ui-tour/*.png + index.md. Non-critical captures never abort the tour: a failed one is skipped and
 * listed at the end of index.md.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const OUT = path.join(root, "e2e", "output", "ui-tour")

type Entry = { file: string; title: string; desc: string; theme: Theme; lang: Lang; size: string }

const manifest: Entry[] = []
const skipped: string[] = []
let theme: Theme = "light"
let lang: Lang = "it"
let size = "1000x700"
let compactSuffix = ""
const started = Date.now()

const WS_MAIN = "Product Launch"
const WS_EMPTY = "Personal"
const WS_OLD = "Old workspace"
const WS_LONG = "Quarterly planning and cross-team roadmap workspace"
const NOTE_MAIN = "Roadmap"
const NOTE_B = "Weekly sync"
const NOTE_C = "Budget"
const NOTE_OLD = "Old draft"
const NOTE_LONG = "Minutes of the long term product strategy review meeting"
const FOLDER_A = "Planning"
const FOLDER_SUB = "Q4"
const FOLDER_B = "Research"
const GROUP_A = "Launch"
const GROUP_B = "Backlog"
const SEC_DESIGN = "Design"
const SEC_DEV = "Development"
const SEC_MKT = "Marketing"
const SEC_IDEAS = "Ideas"
const T_PALETTE = "Define the brand palette"
const T_MOCKUPS = "Create mockups"
const T_ICONS = "Review the icons"
const T_LOGIN = "Implement login"
const T_OAUTH = "Add OAuth providers"
const T_RESET = "Add password reset"
const T_CI = "Set up CI"
const T_BLOG = "Write the launch blog post"
const T_IDEA = "Dark mode for the website"
const T_TEMP = "Temporary task"

const shot = async (num: number, key: string, title: string, desc: string, wait = 400) => {
    await settle(wait)
    const file = `${pad(num)}-${key}-${theme}-${lang}${compactSuffix}.png`
    await browser.saveScreenshot(path.join(OUT, file))
    manifest.push({ file, title, desc, theme, lang, size })
    console.log(`[ui-tour] ${file}`)
}

/** Runs a non-critical capture: on failure it is noted, the UI is brought back to a neutral state and the tour goes on. */
const attempt = async (label: string, fn: () => Promise<void>) => {
    try {
        await fn()
    } catch (error) {
        const message = (error as Error).message.split("\n")[0]
        skipped.push(`${label}: ${message}`)
        console.log(`[ui-tour] SKIPPED ${label}: ${message}`)
        await recover()
    }
}

const setSize = async (width: number, height: number) => {
    await browser.setWindowSize(width, height)
    size = `${width}x${height}`
    await settle(800)
}

const setAppearance = async (nextTheme: Theme, nextLang: Lang) => {
    await applyAppearance(nextTheme, nextLang)
    theme = nextTheme
    lang = nextLang
}

/** Notes in the tour index when an overlay covers the rail toggle (it must stay visible and clickable). */
const checkToggleReachable = async (label: string, what: string) => {
    const toggle = byLabel(label)
    if (!(await toggle.isDisplayed()) || !(await toggle.isClickable())) skipped.push(`${what}: the rail toggle is covered by the overlay`)
}

/** Makes sure the active note is the given one (the app may or may not reopen the notes of the last visit). */
const ensureNote = async (name: string) => {
    await openNote(name)
}

/* ------------------------------------------------------------------ the main screens (repeated per theme / language / size) */

/** Starts and ends on the home page. */
const captureMain = async (compact: boolean) => {
    const sfx = `${theme}/${lang}/${size}`
    await attempt(`home ${sfx}`, async () => {
        await waitHome()
        await shot(2, "home-grid", "Home with workspaces (grid view)", "Start page: welcome title, create/import buttons and the recent workspaces as a grid, with view toggle and trash button.")
    })
    await attempt(`workspace ${sfx}`, async () => {
        await openWs(WS_MAIN)
        await ensureNote(NOTE_MAIN)
        if (compact) {
            await setSidebar(false)
            await setPanel(false)
            await shot(5, "workspace-note", "Workspace with an open note", "Open note with groups, sections and tasks, both sidebars closed (compact window: they are overlays).")
            await setSidebar(true)
            await checkToggleReachable(await tr("sidebar.toggle"), `left overlay ${sfx}`)
            await shot(9, "sidebar-overlay", "Left sidebar as an overlay", "Compact window: the folders/notes sidebar floats over the note with a dimmed backdrop; the rail toggle stays visible.")
            await setSidebar(false)
            await setPanel(true)
            await checkToggleReachable(await tr("rightPanel.toggle"), `right overlay ${sfx}`)
            await shot(10, "details-overlay-note", "Right panel as an overlay (no selection)", "Compact window: the details panel (note details) floats over the note; the rail toggle stays visible.")
        } else {
            await setSidebar(true)
            await setPanel(true)
            await setTab("details")
            await shot(5, "workspace-note-details", "Workspace: note + details of the note (no task selected)", "Left sidebar with folder tree and footer, the open note with its groups/sections/tasks, right panel on the Details tab showing the note details.")
        }
        await showTaskDetails(T_LOGIN)
        await settle(600)
        await shot(6, compact ? "details-overlay-task" : "workspace-task-details", "Details of the selected task", "A task is selected (highlighted row) and the Details tab shows its path, status, priority, color, description and subtasks.")
        await setTab("history")
        await shot(7, compact ? "history-overlay" : "workspace-history", "History tab", "Right panel on the History tab: undo/redo buttons and the list of the actions performed in the session.")
        await setTab("details")
        if (compact) await setPanel(false)
        await goHome()
    })
    await attempt(`settings ${sfx}`, async () => {
        await openSettings()
        await goCategory("appearance")
        await shot(8, "settings-appearance", "Settings: Appearance", "Settings dialog on the Appearance page: theme, accent color, language and sidebar item size.")
        await closeDialog()
    })
}

/** Settings pages that are also captured in dark/en (long paths, backup lists). */
const captureSettingsExtra = async () => {
    await attempt(`settings-extra ${theme}/${lang}`, async () => {
        await openSettings()
        for (const [num, id] of [[64, "data"], [65, "about"]] as const) {
            await attempt(`settings-${id} ${theme}/${lang}`, async () => {
                await goCategory(id)
                await shot(num, `settings-${id}`, `Settings: ${id}`, `Settings dialog, page "${id}", in the ${theme} theme and ${lang === "it" ? "Italian" : "English"}.`)
            })
        }
        await closeDialog()
    })
}

/* ------------------------------------------------------------------ the tour */

describe("UI tour", () => {
    before(async () => {
        fs.rmSync(OUT, { recursive: true, force: true })
        fs.mkdirSync(OUT, { recursive: true })
        await waitForApp()
        await byLabel(await tr("settings.title")).waitForDisplayed({ timeout: 30_000 })
        await setSize(1000, 700)
        await setAppearance("light", "it")
        await waitHome()
    })

    it("home without workspaces and the creation of the workspaces", async () => {
        await attempt("home-empty", async () => {
            await shot(1, "home-empty", "Home without workspaces", "Empty state of the start page: no workspace found.")
        })

        await attempt("create-workspace-dialog", async () => {
            await byText(await tr("home.createWorkspace.open")).click()
            const dialog = $('[role="dialog"]')
            await dialog.waitForDisplayed()
            await typeInto(dialog.$('input[name="name"]'), WS_MAIN)
            await byLabel(await tr("common.addColor")).click()
            await shot(20, "home-create-workspace-dialog", "Create workspace dialog", "Dialog to create a workspace: name field with the "+" button of the optional color (palette open).")
            await browser.keys("Escape")
            await dialog.$('button[type="submit"]').click()
            await waitDialogGone()
        })
        // If the dialog attempt failed half way, make sure the workspace exists anyway
        if (!(await byLabel(await tr("home.workspace.open", { name: WS_MAIN })).isExisting())) {
            await byText(await tr("home.createWorkspace.open")).click()
            await typeInto($('[role="dialog"] input[name="name"]'), WS_MAIN)
            await $('[role="dialog"] button[type="submit"]').click()
            await waitDialogGone()
        }
        for (const name of [WS_EMPTY, WS_OLD, WS_LONG]) {
            await byText(await tr("home.createWorkspace.open")).click()
            await typeInto($('[role="dialog"] input[name="name"]'), name)
            await $('[role="dialog"] button[type="submit"]').click()
            await waitDialogGone()
        }
        await byLabel(await tr("home.workspace.open", { name: WS_OLD })).waitForDisplayed()
        await attempt("home-long-name", async () => {
            await $("h1").moveTo()
            await shot(55, "home-long-name-grid", "Home with a very long workspace name (grid)", "The workspace card with a 50+ character name: the name and the date lines are truncated, nothing overflows.")
            await byLabel(await tr("home.viewList")).click()
            await $("h1").moveTo()
            await shot(56, "home-long-name-list", "Home with a very long workspace name (list)", "The list row with a 50+ character name: the name truncates before the date.")
            await byLabel(await tr("home.viewGrid")).click()
            await $("h1").moveTo()
            await settle(300)
        })
    })

    it("workspace menus, dialogs and the home trash", async () => {
        await attempt("home-workspace-menu", async () => {
            const menu = await openContextMenu(byLabel(await tr("home.workspace.open", { name: WS_MAIN })))
            await shot(21, "home-workspace-menu", "Workspace context menu", "Right click on a workspace card: rename, change color, export, delete.")
            await pickColor(menu, "#4363d8", async () => {
                await shot(22, "home-workspace-color-menu", "Workspace color palette", "The 'Change color' submenu with the palette of 15 colors.")
            })
        })
        await recover()
        await attempt("home-rename-inline", async () => {
            const menu = await openContextMenu(byLabel(await tr("home.workspace.open", { name: WS_OLD })))
            await byText(await tr("common.rename"), menu).click()
            await byLabel(await tr("common.name")).waitForDisplayed({ timeoutMsg: "the inline rename input did not appear" })
            await shot(23, "home-rename-inline", "Inline rename (workspace)", "Renaming a workspace in place: its name becomes an input (Enter confirms, Esc cancels).")
            await browser.keys("Escape")
            await settle(300)
        })
        await attempt("home-delete-dialog", async () => {
            const menu = await openContextMenu(byLabel(await tr("home.workspace.open", { name: WS_OLD })))
            await byText(await tr("common.delete"), menu).click()
            const confirm = await topDialog()
            await confirm.waitForDisplayed()
            await shot(24, "home-delete-dialog", "Delete confirmation dialog", "Confirmation asking to move the item to the trash.")
            await byText(await tr("dialogs.delete.confirm"), confirm).click()
            await waitDialogGone()
        })
        await attempt("home-trash-dialog", async () => {
            await byLabel(await tr("trash.title")).click()
            await dialogEl().waitForDisplayed()
            await shot(25, "home-trash-dialog", "Workspace trash dialog", "Trash of the home page with the deleted workspace and the restore / delete permanently buttons.")
            await closeDialog()
        })
        await attempt("home-list-tooltip", async () => {
            await byLabel(await tr("home.viewList")).moveTo()
            await shot(26, "home-tooltip-view-toggle", "Tooltip of the view toggle", "Hover on the grid/list toggle: tooltip.", 1200)
            await byLabel(await tr("home.viewList")).click()
            await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
            await $("h1").moveTo()
            await shot(3, "home-list", "Home with workspaces (list view)", "The recent workspaces shown as a list.")
            await byLabel(await tr("home.viewGrid")).click()
            await $("h1").moveTo()
            await settle(300)
        })
    })

    it("empty workspace", async () => {
        await attempt("workspace-empty", async () => {
            await openWs(WS_EMPTY)
            await setSidebar(true)
            await shot(4, "workspace-empty", "Empty workspace", "A workspace with no folders and no notes: empty sidebar tree and 'no open notes' placeholder.")
            await byLabel(await tr("sidebar.toggle")).moveTo()
            await shot(51, "workspace-tooltip-sidebar-toggle", "Tooltip of the sidebar toggle", "Hover on the sidebar button: tooltip with the shortcut.", 1200)
            await $("main").moveTo({ xOffset: 300, yOffset: 200 })
            await goHome()
        })
        if (!(await $(`h2=${await tr("home.recent")}`).isDisplayed())) await goHome()
    })

    it("seeds the main workspace: folders, notes and the sidebar dialogs", async () => {
        await openWs(WS_MAIN)
        await setSidebar(true)

        // Top level folder through the sidebar dialog
        await byLabel(await tr("sidebar.addFolder")).click()
        await fillDialogName(FOLDER_A)
        await attempt("sidebar-new-folder-dialog", async () => {
            await shot(30, "sidebar-new-folder-dialog", "New folder dialog", "Dialog opened by the 'New folder' sidebar button.")
        })
        await submitDialog()
        await byLabel(await tr("sidebar.addFolder")).click()
        await fillDialogName(FOLDER_B)
        await submitDialog()
        await treeRow(FOLDER_A).waitForDisplayed()

        // Root note
        await byLabel(await tr("sidebar.addNote")).click()
        await fillDialogName(NOTE_MAIN)
        await attempt("sidebar-new-note-dialog", async () => {
            await shot(31, "sidebar-new-note-dialog", "New note dialog", "Dialog opened by the 'New note' sidebar button.")
        })
        await submitDialog()
        await byLabel(await tr("sidebar.addNote")).click()
        await fillDialogName(NOTE_OLD)
        await submitDialog()
        await byLabel(await tr("sidebar.addNote")).click()
        await fillDialogName(NOTE_LONG)
        await submitDialog()
        await attempt("sidebar-long-name", async () => {
            await treeRow(NOTE_LONG).waitForDisplayed()
            await shot(57, "sidebar-long-name", "Sidebar with a very long note name", "A note with a 50+ character name in the tree: the name is truncated and the row keeps its badges/menu button.")
        })

        // Folder context menu, nested folder and notes inside folders
        await attempt("folder-menu", async () => {
            const menu = await openContextMenu(treeRow(FOLDER_A))
            await shot(32, "folder-menu", "Folder context menu", "Right click on a folder: new note, new folder, rename, change color, color content, delete.")
            await byText(await tr("menu.newFolder"), menu).click()
            await fillDialogName(FOLDER_SUB)
            await shot(33, "folder-new-subfolder-dialog", "New subfolder dialog", "Dialog opened from the folder menu to create a nested folder.")
            await submitDialog()
        })
        await recover()
        await treeRow(FOLDER_SUB).waitForDisplayed()
        for (const [folder, note] of [[FOLDER_A, NOTE_B], [FOLDER_SUB, NOTE_C]] as const) {
            const menu = await openContextMenu(treeRow(folder))
            await byText(await tr("menu.newNote"), menu).click()
            await fillDialogName(note)
            await submitDialog()
            await treeRow(note).waitForDisplayed()
        }
        await attempt("folder-color", async () => {
            const menu = await openContextMenu(treeRow(FOLDER_B))
            await pickColor(menu, "#f58231")
        })
        await recover()

        // Note menu, rename / delete dialogs, template creation
        await attempt("note-menu", async () => {
            const menu = await openContextMenu(treeRow(NOTE_OLD))
            await shot(34, "note-menu", "Note context menu", "Right click on a note in the tree: open, rename, change color, create template, delete.")
            await byText(await tr("common.rename"), menu).click()
            await byLabel(await tr("common.name")).waitForDisplayed({ timeoutMsg: "the inline rename input did not appear" })
            await shot(35, "rename-inline", "Inline rename (note)", "Renaming a note in place: the name in the tree becomes an input (Enter confirms, Esc cancels).")
            await browser.keys("Escape")
            await settle(300)
        })
        await recover()
        await attempt("delete-dialog", async () => {
            const menu = await openContextMenu(treeRow(NOTE_OLD))
            await byText(await tr("common.delete"), menu).click()
            const confirm = await topDialog()
            await confirm.waitForDisplayed()
            await shot(36, "delete-dialog", "Delete confirmation (note)", "Confirmation to move a note to the trash.")
            await byText(await tr("dialogs.delete.confirm"), confirm).click()
            await waitDialogGone()
        })
        await recover()
        await attempt("create-template", async () => {
            const menu = await openContextMenu(treeRow(NOTE_B))
            await byText(await tr("menu.createTemplate"), menu).click()
            const dialog = $('[role="dialog"]')
            await dialog.waitForDisplayed()
            await typeInto(dialog.$('input[name="name"]'), "Meeting template")
            await shot(37, "create-template-dialog", "Create template dialog", "Dialog to save the content of a note as a reusable template.")
            await dialog.$('button[type="submit"]').click()
            await waitDialogGone()
        })
        await recover()
    })

    it("seeds the Roadmap note: groups, sections and tasks", async () => {
        await openNote(NOTE_B)
        await attempt("note-empty", async () => {
            await shot(41, "note-empty-state", "Empty note", "A note without groups: empty state with the hints on how to add a group and the shortcuts.")
        })
        await openNote(NOTE_MAIN)

        await addGroup(GROUP_A)
        await addSection(SEC_DESIGN)
        await addSection(SEC_DEV)
        await addSection(SEC_MKT)
        await addGroup(GROUP_B)
        await addSection(SEC_IDEAS)

        await addTask(SEC_DESIGN, T_PALETTE)
        await addTask(SEC_DESIGN, T_MOCKUPS)
        await addTask(SEC_DESIGN, T_ICONS)
        await addTask(SEC_DEV, T_LOGIN)
        await addTask(SEC_DEV, T_CI)
        await addTask(SEC_MKT, T_BLOG)
        await addTask(SEC_IDEAS, T_IDEA)
        await addTask(SEC_IDEAS, T_TEMP)
        await addSubtask(T_LOGIN, T_OAUTH)
        await addSubtask(T_LOGIN, T_RESET)

        // Completed tasks
        await taskRowAction(T_PALETTE, '[role="checkbox"]')
        await taskRowAction(T_RESET, '[role="checkbox"]')
        await settle(300)

        // Task menu: priority, description, color, move
        await attempt("task-menu", async () => {
            const menu = await openTaskMenu(T_MOCKUPS)
            await shot(42, "task-menu", "Task menu", "The '...' menu of a task: details, add subtask, description, priority, color, move to, delete.")
            await byText(await tr("tasks.menu.addPriority"), menu).click()
            await settle(400)
        })
        await recover()
        await attempt("task-color", async () => {
            const menu = await openTaskMenu(T_ICONS)
            await pickColor(menu, "#911eb4", async () => {
                await shot(43, "task-color-submenu", "Task color palette", "Color palette of the task menu.")
            })
        })
        await recover()
        await attempt("task-description", async () => {
            const menu = await openTaskMenu(T_LOGIN)
            await byText(await tr("tasks.menu.addDescription"), menu).click()
            const dialog = $('[role="dialog"]')
            await dialog.waitForDisplayed()
            await dialog.$("textarea").setValue("Let users sign in with email and password, or with OAuth providers.\nRemember the session across restarts.")
            await shot(44, "task-description-dialog", "Task description dialog", "Dialog to write the description of a task.")
            await byText(await tr("common.save"), dialog).click()
            await waitDialogGone()
        })
        await recover()
        await attempt("task-subtask-input", async () => {
            await taskRowAction(T_CI, `button[aria-label="${await tr("tasks.addSubtask")}"]`)
            await byLabel(await tr("tasks.newSubtask")).waitForDisplayed()
            await shot(49, "task-subtask-input", "Inline new subtask input", "The inline field that appears under a task when adding a subtask (with the Enter / Esc hint).")
            await browser.keys("Escape")
        })
        await recover()

        // Group and section: menus and colors
        await attempt("group-menu", async () => {
            const menu = await openContextMenu(byText(GROUP_A))
            await shot(45, "group-menu", "Group context menu", "Right click on a group header: rename, change color, add audio files, delete.")
            await pickColor(menu, "#3cb44b", async () => {
                await shot(46, "group-color-submenu", "Group color palette", "Color palette of the group menu.")
            })
        })
        await recover()
        await attempt("section-menu", async () => {
            const header = sectionCard(SEC_DESIGN).$(`button[title=${JSON.stringify(SEC_DESIGN)}]`)
            const menu = await openContextMenu(header)
            await shot(47, "section-menu", "Section context menu", "Right click on a section header: rename, change color, delete.")
            await pickColor(menu, "#ffe119", async () => {
                await shot(48, "section-color-submenu", "Section color palette", "Color palette of the section menu.")
            })
        })
        await recover()

        // Trash content for the workspace trash dialog
        await attempt("delete-task", async () => {
            const menu = await openTaskMenu(T_TEMP)
            await byText(await tr("common.delete"), menu).click()
            const confirm = await topDialog()
            await byText(await tr("dialogs.delete.confirm"), confirm).click()
            await waitDialogGone()
        })
        await recover()
        await settle(500)
        await attempt("note-search", async () => {
            await browser.keys(["Control", "k"])
            await dialogEl().waitForDisplayed()
            await shot(52, "note-search-palette", "Note search palette", "Command palette (Ctrl+K) to search a note.")
            await closeDialog()
        })
        await recover()
    })

    it("workspace dialogs: trash, templates, shortcuts, note from template", async () => {
        const footerButton = (key: string) => toolButton(key)
        await attempt("workspace-trash", async () => {
            await (await footerButton("trash.title")).click()
            await dialogEl().waitForDisplayed()
            await shot(40, "workspace-trash-dialog", "Workspace trash dialog", "Trash of a workspace listing the deleted note and task, grouped by type, with restore / delete permanently.")
            await closeDialog()
        })
        await attempt("templates-dialog", async () => {
            await (await footerButton("dialogs.templates.title")).click()
            await dialogEl().waitForDisplayed()
            await shot(38, "templates-dialog", "Templates dialog (short list)", "Dialog with a single saved template: the dialog adapts to the short list; create note / update from note / rename / delete actions.")
            await attempt("note-from-template", async () => {
                await byLabel(await tr("dialogs.templates.createNoteFrom", { name: "Meeting template" })).click()
                await settle(500)
                await shot(53, "note-from-template-dialog", "Create note from template dialog", "Dialog to create a note from a template: name and destination.")
                await browser.keys("Escape")
            })
            await recover()
        })
        await recover()
        await attempt("add-note-with-template", async () => {
            await byLabel(await tr("sidebar.addNote")).click()
            await dialogEl().waitForDisplayed()
            await shot(39, "sidebar-new-note-with-template", "New note dialog with template choice", "Once a template exists the new note dialog offers a 'From template' selector.")
            await closeDialog()
        })
        await attempt("shortcuts-dialog", async () => {
            await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
            await browser.keys("?")
            await dialogEl().waitForDisplayed()
            await shot(50, "shortcuts-dialog", "Keyboard shortcuts dialog", "All the keyboard shortcuts grouped by category.")
            await closeDialog()
        })
        await attempt("workspace-tooltip-settings", async () => {
            await byLabel(await tr("settings.title")).moveTo()
            await shot(54, "workspace-tooltip-settings", "Tooltip of the settings button", "Hover on the settings button in the sidebar: tooltip.", 1200)
            await $("main").moveTo({ xOffset: 400, yOffset: 300 })
        })
        await goHome()
    })

    it("settings: every category", async () => {
        await openSettings()
        const categories: [number, string, string][] = [
            [60, "appearance", "Theme, accent color, language and the size of folders and notes."],
            [61, "notes", "Switches for progress bars, counters and what to reopen at startup."],
            [62, "audio", "Audio player options (reset of the player position)."],
            [63, "shortcuts", "List of the shortcuts with edit / reset buttons."],
            [64, "data", "Import, export, data folder and the backup section (with the list of backups)."],
            [65, "about", "Application information, version, links and the update check."],
        ]
        for (const [num, id, desc] of categories) {
            await attempt(`settings-${id}`, async () => {
                await goCategory(id)
                if (id === "data") {
                    await byText(await tr("settings.data.backup.now.button")).click()
                    await settle(1200)
                }
                await shot(num, `settings-${id}`, `Settings: ${id}`, `Settings dialog, page "${id}". ${desc}`)
            })
        }
        await closeDialog()
    })

    it("main screens for every theme and language (1000x700)", async () => {
        for (const [t, l] of [["light", "it"], ["light", "en"], ["dark", "it"], ["dark", "en"]] as const) {
            await setAppearance(t, l)
            await captureMain(false)
            if (t === "dark" && l === "en") await captureSettingsExtra()
        }
    })

    it("main screens in the compact window (800x600)", async () => {
        await setSize(800, 600)
        compactSuffix = "-compact"
        for (const [t, l] of [["light", "it"], ["dark", "en"]] as const) {
            await setAppearance(t, l)
            await captureMain(true)
        }
        // The home page empty state is not repeated: only the populated home matters in the small window
        compactSuffix = ""
        await setSize(1000, 700)
    })

    after(async () => {
        const seconds = Math.round((Date.now() - started) / 1000)
        const lines: string[] = [
            "# EasyTask UI tour",
            "",
            `Generated ${new Date().toISOString()} in ${seconds} s. ${manifest.length} screenshots.`,
            "",
            "Naming: `NN-screen-theme-lang[-compact].png`. Main screens (02, 05-08, 09-10 in compact) are repeated for light/dark x it/en at 1000x700 and, with the `-compact` suffix, at 800x600 (light-it and dark-en). All the other screens are captured only in light theme, Italian, 1000x700.",
            "",
            "| File | Screen | Theme | Lang | Window | What you are looking at |",
            "| --- | --- | --- | --- | --- | --- |",
            ...[...manifest].sort((a, b) => a.file.localeCompare(b.file)).map(
                (e) => `| ${e.file} | ${e.title} | ${e.theme} | ${e.lang} | ${e.size} | ${e.desc} |`,
            ),
            "",
            "## Skipped",
            "",
            ...(skipped.length ? skipped.map((s) => `- ${s}`) : ["Nothing skipped."]),
            "",
        ]
        fs.writeFileSync(path.join(OUT, "index.md"), lines.join("\n"))
        console.log(`\n[ui-tour] ${manifest.length} screenshots in ${OUT} (${seconds} s)`)
        for (const e of [...manifest].sort((a, b) => a.file.localeCompare(b.file))) console.log(`  ${e.file}  - ${e.title}`)
        if (skipped.length) console.log(`[ui-tour] skipped:\n${skipped.map((s) => `  - ${s}`).join("\n")}`)
    })
})
