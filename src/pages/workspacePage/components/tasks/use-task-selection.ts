import { createContext, useContext, useSyncExternalStore } from "react"
import type { ManyItemRef } from "@/contexts/undo/commands"
import type { SelectionStore } from "../sidebar/selection"
import { taskKey } from "./task-selection"

export const TaskSelectionContext = createContext<SelectionStore | null>(null)

/** The task selection store (null outside a TaskSelectionProvider: rows then behave as without multi-selection). */
export const useTaskSelectionStore = () => useContext(TaskSelectionContext)

const NEVER = () => () => {}

/** Whether a task is part of the multi-selection; only the rows whose state changes re-render. */
export function useIsTaskMultiSelected(id: number): boolean {
    const store = useTaskSelectionStore()
    const key = taskKey(id)
    return useSyncExternalStore(store?.subscribe ?? NEVER, () => store?.has(key) ?? false)
}

/** Whether a task is selected together with at least another one: its menu then acts on the whole selection. */
export function useIsInTaskMultiSelection(id: number): boolean {
    const store = useTaskSelectionStore()
    const key = taskKey(id)
    return useSyncExternalStore(store?.subscribe ?? NEVER, () => !!store && store.has(key) && store.getSelected().size >= 2)
}

const EMPTY: ReadonlySet<string> = new Set()

/** The selected task keys (a new set on every change). */
export function useSelectedTaskKeys(): ReadonlySet<string> {
    const store = useTaskSelectionStore()
    return useSyncExternalStore(store?.subscribe ?? NEVER, () => store?.getSelected() ?? EMPTY)
}

/** Whether any task is selected (a boolean, so the subscriber re-renders only when the selection starts or ends). */
export function useHasTaskSelection(): boolean {
    const store = useTaskSelectionStore()
    return useSyncExternalStore(store?.subscribe ?? NEVER, () => (store?.getSelected().size ?? 0) > 0)
}

export type TaskSelectionActions = {
    /** The tasks the actions apply to: the selected ones without those under another selected task, in tree order. */
    getTargets: () => ManyItemRef[]
    /** Opens the confirmation to move the selection to the trash. */
    requestDelete: () => void
    /** Archives the selection (no confirmation) in one undo step, then clears the selection. */
    archiveSelection: () => Promise<void>
    /** Sets (or, with null, removes) the color of every selected task, subtasks included; one undo step. */
    applyColor: (color: string | null) => Promise<void>
    /** Opens the dialog of the tags of every selected task (subtasks of a selected task included when they are selected too). */
    requestTags: () => void
    /** Moves the selection to the end of a section, in the order of the tasks; one undo step. */
    moveTo: (sectionId: number) => Promise<void>
}

export const TaskSelectionActionsContext = createContext<TaskSelectionActions | null>(null)

/** The actions on the task multi-selection (null outside a TaskSelectionActionsProvider). */
export const useTaskSelectionActions = () => useContext(TaskSelectionActionsContext)
