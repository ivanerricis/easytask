import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react"
import { createExternalStore, useStoreSelector, type ExternalStore } from "@/lib/external-store"

/**
 * Roving tabindex of a task list: the id of the one task that is in the tab order (the last one that had the focus), the
 * others are reached with the arrows. In a store, so that moving the focus re-renders only the two rows concerned.
 */
type TaskTabStopStore = ExternalStore<number | null>
export const createTaskTabStopStore = (): TaskTabStopStore => createExternalStore<number | null>(null)

type TaskTabStopValue = { listKey: string, store: TaskTabStopStore }

/** Without a provider (a task rendered alone) the task is its own tab stop. */
const inertStore = createTaskTabStopStore()
const TaskTabStopContext = createContext<TaskTabStopValue | null>(null)

/** One per list: owns the store of its tab stop. */
export function TaskTabStopProvider({ listKey, children }: { listKey: string, children: ReactNode }) {
    const [store] = useState(createTaskTabStopStore)
    // A stable value: a new object per render would re-render every row of the list whenever the list does (a drop re-renders the two lists it touches)
    const value = useMemo(() => ({ listKey, store }), [listKey, store])
    return createElement(TaskTabStopContext.Provider, { value }, children)
}

/** The store of the enclosing list (null outside a provider), to move the tab stop when a row takes the focus. */
export const useTaskTabStopStore = (): TaskTabStopStore | null => useContext(TaskTabStopContext)?.store ?? null

/**
 * Whether the task is the tab stop of its list; a boolean, so a move re-renders only the two rows concerned. While no row
 * has taken the focus yet (or the one that had it is gone) the `fallback` row (the first of the list) is the tab stop.
 */
export function useIsTaskTabStop(listKey: string, taskId: number, fallback = false): boolean {
    const value = useContext(TaskTabStopContext)
    const inList = value !== null && value.listKey === listKey
    return useStoreSelector(inList ? value.store : inertStore, current => inList ? (current === null ? fallback : current === taskId) : true)
}