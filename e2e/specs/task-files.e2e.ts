import { $, browser, expect } from "@wdio/globals"
import {
    addTaskToSection, byLabel, byText, createFromSidebar, createWorkspace, domClick, menuButton, openMenuWithButton, openWorkspace, sectionCard, sql, tr, treeRow, typeInto,
    waitForApp,
    groupCard, newSectionInGroup,
} from "../helpers"

/**
 * Files attached to the tasks: added from the menu of a task (the native file dialog is answered by a stub of the IPC fetch),
 * counted by the paperclip on the row, listed in its popover (a file that does not exist is marked as missing), saved in the
 * database, removed, and brought back by one undo.
 */
const WORKSPACE = "Files Workspace"
const NOTE = "Files Note"
const GROUP = "Files Group"
const SECTION = "Files S1"
const TASK = "Files T1"
const FILES = ["/e2e-attachments/report.pdf", "/e2e-attachments/photo.png"]

const xpathString = (value: string) =>
    value.includes("'") ? `concat('${value.split("'").join(`', "'", '`)}')` : `'${value}'`

const rowOf = (text: string) => $(`//*[@role='treeitem'][@aria-label=${xpathString(text)}]`)

/**
 * Answers the open dialog of the dialog plugin with the given paths; every other command goes to the real backend.
 * `window.__TAURI_INTERNALS__.invoke` is read-only, so the command is caught one step below: Tauri sends it with a fetch to
 * `ipc://localhost/<command>` (`http://ipc.localhost/...` on Windows).
 */
const stubOpenDialog = async (paths: string[]) => {
    await browser.execute((answer: string[]) => {
        const w = window as unknown as { __e2eOpen?: string[], __e2eFetch?: typeof fetch }
        w.__e2eOpen = answer
        if (w.__e2eFetch) return
        const original = window.fetch.bind(window)
        w.__e2eFetch = original
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
            const url = decodeURIComponent(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
            if (url.includes("/plugin:dialog|open"))
                return Promise.resolve(new Response(JSON.stringify(w.__e2eOpen), { headers: { "Tauri-Response": "ok", "Content-Type": "application/json" } }))
            return original(input, init)
        }
    }, paths)
}

/** The number shown by the paperclip of the row (textContent: getText is unreliable on WebKitGTK); null without a paperclip. */
const badgeCount = async (text: string): Promise<string | null> => {
    const row = (await rowOf(text).getElement()) as unknown as HTMLElement
    return browser.execute((el: HTMLElement) => el.querySelector('[data-testid="task-files-badge"]')?.textContent?.trim() ?? null, row)
}

const savedFiles = async (): Promise<string[]> =>
    (await sql<{ path: string }[]>("select",
        "SELECT f.path FROM task_file f INNER JOIN task t ON t.id = f.taskID WHERE t.text = ? ORDER BY f.position, f.id", [TASK])).map(row => row.path)

const pressCtrl = async (key: string) => {
    await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
    await browser.keys(["Control", key])
}

describe("Files attached to the tasks", () => {
    before(async () => {
        await waitForApp()
    })

    it("creates a note with a group, a section and a task", async () => {
        await createWorkspace(WORKSPACE)
        await openWorkspace(WORKSPACE)
        await createFromSidebar("sidebar.addNote", "dialogs.addNote.submit", NOTE)
        await treeRow(NOTE).click()
        await byLabel(await tr("notes.closeCurrent")).waitForDisplayed()
        await byLabel(await tr("menu.newGroup")).click()
        await typeInto(byLabel(await tr("groups.nameLabel")), GROUP)
        await browser.keys("Enter")
        await byText(GROUP).waitForDisplayed({ timeoutMsg: "the group was not created" })
        await newSectionInGroup(groupCard(GROUP), SECTION)
        await addTaskToSection(sectionCard(SECTION), TASK)
        await rowOf(TASK).waitForDisplayed({ timeoutMsg: `task "${TASK}" not created` })
        expect(await badgeCount(TASK)).toBeNull()
    })

    it("attaches files from the menu of the task: the paperclip counts them and they are saved", async () => {
        await stubOpenDialog(FILES)
        await rowOf(TASK).moveTo()
        const menu = await openMenuWithButton(await menuButton(rowOf(TASK)))
        await domClick(byText(await tr("taskFiles.attach"), menu))
        await browser.waitUntil(async () => (await badgeCount(TASK)) === "2", { timeoutMsg: "the paperclip does not show 2 files" })
        await browser.waitUntil(async () => (await savedFiles()).join() === FILES.join(), { timeoutMsg: "the files were not saved for the task" })
    })

    it("lists the files in the popover of the paperclip, marking the ones that do not exist", async () => {
        const badge = rowOf(TASK).$('[data-testid="task-files-badge"]')
        await domClick(badge)
        const list = $('[data-testid="task-file"]')
        await list.waitForDisplayed({ timeoutMsg: "the list of the files did not open" })
        const names = await browser.execute(() => Array.from(document.querySelectorAll('[data-testid="task-file"]')).map(item => (item.textContent ?? "").trim()))
        expect(names).toEqual(["report.pdf", "photo.png"])
        await browser.waitUntil(
            () => browser.execute(() => document.querySelectorAll('[data-testid="task-file"][data-missing="true"]').length === 2),
            { timeoutMsg: "the files that do not exist are not marked as missing" })
    })

    it("removes a file from the list, and one Ctrl+Z brings it back", async () => {
        await domClick(byLabel(await tr("taskFiles.remove", { name: "report.pdf" })))
        await browser.waitUntil(async () => (await badgeCount(TASK)) === "1", { timeoutMsg: "the paperclip still counts 2 files" })
        await browser.waitUntil(async () => (await savedFiles()).join() === FILES[1], { timeoutMsg: "the file was not removed from the database" })

        await browser.keys("Escape")
        await pressCtrl("z")
        await browser.waitUntil(async () => (await badgeCount(TASK)) === "2", { timeoutMsg: "the file did not come back with the undo" })
        await browser.waitUntil(async () => (await savedFiles()).join() === FILES.join(), { timeoutMsg: "the file was not saved again by the undo" })
    })
})
