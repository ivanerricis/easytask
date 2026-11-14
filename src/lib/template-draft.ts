import type { TemplateDraft } from "@/db/queries/template-draft"
import type { Note } from "@/types/types"
import { reportError } from "@/lib/report-error"

/**
 * Save state of a template draft: `idle` (nothing changed since it was opened), `saving`, `saved` or `error`
 * (the last save failed: the draft stays dirty and is saved again at the next change, flush or retry).
 */
export type DraftSaveStatus = "idle" | "saving" | "saved" | "error"

type DraftAutosaverOptions = {
    /** Writes the current content of the draft `key` into its template. Resolves false when nothing needed to be written. */
    save: (key: number) => Promise<boolean | void>
    /** Resolves when the writes in flight to the draft have finished (a save must not read a half written note). */
    whenIdle?: () => Promise<void>
    /** Quiet time after the last change before saving, in milliseconds (default 800). */
    delay?: number
    /** A save that lasts less than this (default 250 ms) never shows the "saving" state, so a check that finds nothing to write does not flicker. */
    savingDelay?: number
}

type DraftAutosaver = {
    /** The draft `key` changed: a save is scheduled after the quiet time. */
    notify: (key: number) => void
    /** Saves the draft now if it is dirty, and waits for the save in progress. Resolves false when the draft is not saved. */
    flush: (key: number) => Promise<boolean>
    /** Like `flush` for every draft that is known. Resolves false when any is not saved. */
    flushAll: () => Promise<boolean>
    /** Tries again after an error. */
    retry: (key: number) => Promise<boolean>
    /** Forgets the draft (closed): cancels the timer and drops the state. Call `flush` first to keep the changes. */
    forget: (key: number) => void
    getStatus: (key: number) => DraftSaveStatus
    /** True while the draft has changes that are not saved. */
    isDirty: (key: number) => boolean
    subscribe: (listener: () => void) => () => void
    /** Cancels every pending timer (the provider is unmounted). */
    dispose: () => void
}

type DraftState = {
    status: DraftSaveStatus
    dirty: boolean
    timer: ReturnType<typeof setTimeout> | null
    /** The saves of a draft run one after the other. */
    queue: Promise<unknown>
}

export const DRAFT_SAVE_DELAY = 800
export const DRAFT_SAVING_SHOW_DELAY = 250

/**
 * Creates the autosaver of the template drafts: a debounced save per draft, serialized per draft, that skips the work
 * when nothing changed and keeps the draft dirty when a save fails (so a flush or the next change tries again).
 * @param options The save function and its timing.
 * @category Template drafts
 */
export function createDraftAutosaver({ save, whenIdle, delay = DRAFT_SAVE_DELAY, savingDelay = DRAFT_SAVING_SHOW_DELAY }: DraftAutosaverOptions): DraftAutosaver {
    const drafts = new Map<number, DraftState>()
    const listeners = new Set<() => void>()
    const emit = () => listeners.forEach(listener => listener())

    const stateOf = (key: number) => {
        let state = drafts.get(key)
        if (!state) {
            state = { status: "idle", dirty: false, timer: null, queue: Promise.resolve() }
            drafts.set(key, state)
        }
        return state
    }

    const setStatus = (state: DraftState, status: DraftSaveStatus) => {
        if (state.status === status) return
        state.status = status
        emit()
    }

    const clearTimer = (state: DraftState) => {
        if (state.timer === null) return
        clearTimeout(state.timer)
        state.timer = null
    }

    /** Appends a save to the queue of the draft. A draft that is not dirty any more (saved by an earlier run) is skipped. */
    const run = (key: number, state: DraftState): Promise<boolean> => {
        const next = state.queue.then(async () => {
            if (!state.dirty) return state.status !== "error"
            let showSaving: ReturnType<typeof setTimeout> | null = null
            try {
                await whenIdle?.()
                // Changes made while waiting are part of this save
                state.dirty = false
                const previous = state.status
                showSaving = setTimeout(() => setStatus(state, "saving"), savingDelay)
                const written = await save(key)
                clearTimeout(showSaving)
                // Nothing was written: an unchanged draft keeps its state. A change made during the save schedules its own run
                if (written === false && (previous === "idle" || previous === "saved")) setStatus(state, state.dirty ? "saving" : previous)
                else setStatus(state, state.dirty ? "saving" : "saved")
                return true
            } catch (error) {
                reportError(error)
                if (showSaving !== null) clearTimeout(showSaving)
                state.dirty = true
                setStatus(state, "error")
                return false
            }
        })
        state.queue = next
        return next
    }

    const flush = (key: number) => {
        const state = drafts.get(key)
        if (!state) return Promise.resolve(true)
        clearTimer(state)
        return run(key, state)
    }

    return {
        notify: key => {
            const state = stateOf(key)
            state.dirty = true
            clearTimer(state)
            state.timer = setTimeout(() => {
                state.timer = null
                void run(key, state)
            }, delay)
        },
        flush,
        flushAll: async () => {
            const results = await Promise.all([...drafts.keys()].map(flush))
            return results.every(Boolean)
        },
        retry: key => flush(key),
        forget: key => {
            const state = drafts.get(key)
            if (!state) return
            clearTimer(state)
            drafts.delete(key)
            emit()
        },
        dispose: () => drafts.forEach(clearTimer),
        getStatus: key => drafts.get(key)?.status ?? "idle",
        isDirty: key => drafts.get(key)?.dirty ?? false,
        subscribe: listener => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
        },
    }
}

/**
 * The note that stands for a draft in the list of the tabs (the tabs are derived from a list of notes): it has no
 * workspace and no folder, the name of the template and its color.
 * @param draft The draft.
 */
export function draftToNote(draft: TemplateDraft): Note {
    return {
        id: draft.noteId, workspaceID: null, folderID: null, name: draft.templateName, position: 0,
        creation_date: "", creation_time: "", edit_date: "", edit_time: "",
        color: draft.color ?? undefined, templateID: draft.templateId, groups: [],
    }
}