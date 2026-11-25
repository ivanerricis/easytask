import { createExternalStore } from "@/lib/external-store"

/** A task to bring on screen: its note (opened in a tab) selected, scrolled into view. */
export type OpenTaskTarget = { workspaceId: number, noteId: number, taskId: number }

/**
 * What is being opened: the target, whether the workspace of the task is open with its data loaded (`ready`) and whether its note
 * was already asked to open (so a split view opens it once).
 */
export type OpenTaskRequest = OpenTaskTarget & { ready: boolean, noteOpened: boolean }

/** The request in progress (null when none). It lives until the note shows the task, which then clears it. */
export const openTaskStore = createExternalStore<OpenTaskRequest | null>(null)

/** Asks the app to show a task: it switches to the workspace, opens the note in a tab, selects the task and scrolls to it. */
export function requestOpenTask(target: OpenTaskTarget): void {
    openTaskStore.set({ ...target, ready: false, noteOpened: false })
}

/** The workspace of the request is open and loaded: the note can be opened. */
export function markOpenTaskReady(): void {
    const request = openTaskStore.getState()
    if (request && !request.ready) openTaskStore.set({ ...request, ready: true })
}

/** Marks the note of the current request as opened; false when it already was (or there is no request). */
export function claimOpenNote(): boolean {
    const request = openTaskStore.getState()
    if (!request || request.noteOpened) return false
    openTaskStore.set({ ...request, noteOpened: true })
    return true
}

/** The request is done (or cannot be done): forgets it. */
export function finishOpenTask(): void {
    openTaskStore.set(null)
}
