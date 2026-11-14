import { reportError } from "@/lib/report-error"
import { store } from "./initStore"

// Lives apart from initStore so tests can replace the store with an in-memory one and still get the real debounce

const SAVE_DEBOUNCE_MS = 500

let saveTimer: ReturnType<typeof setTimeout> | null = null
let waiting: { resolve: () => void; reject: (e: unknown) => void }[] = []

const runSave = async (): Promise<void> => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    const callers = waiting
    waiting = []
    try {
        await store.save()
        callers.forEach(c => c.resolve())
    } catch (error) {
        callers.forEach(c => c.reject(error))
        throw error
    }
}

/**
 * Schedules a debounced save of the store to disk: values already `set` stay in memory immediately,
 * and a burst of changes (e.g. switching tabs) costs a single write.
 * @returns A promise that resolves when the save that covers this change is done.
 * @category Store
 */
export const saveStoreSoon = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        waiting.push({ resolve, reject })
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => { void runSave().catch(error => reportError(error)) }, SAVE_DEBOUNCE_MS)
    })

/**
 * Saves immediately any pending store change (call before the app closes).
 * @returns A promise that resolves when nothing is left to save.
 * @category Store
 */
export const flushStore = async (): Promise<void> => {
    if (saveTimer) await runSave()
}
