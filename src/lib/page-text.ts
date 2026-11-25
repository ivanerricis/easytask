import i18n from "@/i18n"
import { getDBPageBody, updateDBPageBody } from "@/db/queries/note"
import { registerBeforeClose } from "./before-close"
import { getErrorMessage } from "./utils"
import { reportError } from "./report-error"

/** Quiet time after the last keystroke before the text is written. */
export const PAGE_SAVE_DELAY_MS = 600

/** What the editor of a page shows: nothing until the text is read, then the text. */
export type PageSnapshot = {
    status: "loading" | "ready" | "failed"
    text: string
}

type Entry = {
    snapshot: PageSnapshot
    /** Typed text not written yet. */
    dirty: boolean
    timer: ReturnType<typeof setTimeout> | null
    /** The write in progress (writes of a page never overlap). */
    writing: Promise<void> | null
    /** How many editors show the page (the entry is dropped when none is left and nothing is pending). */
    users: number
}

const LOADING: PageSnapshot = { status: "loading", text: "" }

const entries = new Map<number, Entry>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())

let closeRegistered = false

async function write(noteId: number, entry: Entry): Promise<void> {
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null }
    // A write in progress finishes first; the text typed meanwhile goes in the next one
    if (entry.writing) { await entry.writing }
    if (!entry.dirty) return
    entry.dirty = false
    const text = entry.snapshot.text
    entry.writing = updateDBPageBody(noteId, text).catch((error: unknown) => {
        // Kept as unsaved: the next change (or the next flush) tries again
        entry.dirty = true
        reportError(error, i18n.t("errors.page.save", { message: getErrorMessage(error) }))
    })
    await entry.writing
    entry.writing = null
    if (entry.dirty && !entry.timer && entry.users > 0) schedule(noteId, entry)
    drop(noteId, entry)
}

function schedule(noteId: number, entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => { void write(noteId, entry) }, PAGE_SAVE_DELAY_MS)
}

/** Forgets a page nobody shows and nothing waits to write: the next opening reads it again. */
function drop(noteId: number, entry: Entry) {
    if (entry.users === 0 && !entry.dirty && !entry.writing && entries.get(noteId) === entry) entries.delete(noteId)
}

/**
 * Starts showing the text of a page: it is read from the database once and shared by every editor of the page (both panes of
 * the split view). Call the returned function when the editor goes away.
 */
export function acquirePage(noteId: number): () => void {
    let entry = entries.get(noteId)
    if (!entry) {
        const created: Entry = { snapshot: LOADING, dirty: false, timer: null, writing: null, users: 0 }
        entry = created
        entries.set(noteId, created)
        getDBPageBody(noteId).then(text => {
            if (created.dirty) return
            created.snapshot = { status: "ready", text }
            emit()
        }, (error: unknown) => {
            created.snapshot = { status: "failed", text: "" }
            reportError(error, i18n.t("errors.page.load", { message: getErrorMessage(error) }))
            emit()
        })
    }
    entry.users++
    const acquired = entry
    let released = false
    return () => {
        if (released) return
        released = true
        acquired.users--
        drop(noteId, acquired)
    }
}

/** The current text of a page (a stable object until it changes). */
export const getPageSnapshot = (noteId: number | null): PageSnapshot =>
    (noteId === null ? undefined : entries.get(noteId)?.snapshot) ?? LOADING

export function subscribePages(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

/** Sets the text of a page (as typed) and writes it soon after the typing stops. Nothing happens until the text is read. */
export function editPageText(noteId: number, text: string): void {
    const entry = entries.get(noteId)
    if (!entry || entry.snapshot.status !== "ready" || entry.snapshot.text === text) return
    entry.snapshot = { status: "ready", text }
    entry.dirty = true
    if (!closeRegistered) {
        closeRegistered = true
        registerBeforeClose(flushAllPages)
    }
    schedule(noteId, entry)
    emit()
}

/** Writes the typed text of a page now (a page with nothing pending resolves at once). */
export async function flushPage(noteId: number): Promise<void> {
    const entry = entries.get(noteId)
    if (!entry) return
    if (entry.dirty) await write(noteId, entry)
    else if (entry.writing) await entry.writing
}

/** Writes every page with typed text that is not saved yet (app closing). */
export async function flushAllPages(): Promise<void> {
    await Promise.all([...entries.keys()].map(noteId => flushPage(noteId)))
}

/** Forgets everything (tests only). */
export function resetPageTexts(): void {
    for (const entry of entries.values()) if (entry.timer) clearTimeout(entry.timer)
    entries.clear()
    emit()
}
