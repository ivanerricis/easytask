import { useEffect, useMemo, useRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { announce } from "./note-announcer-store"
import { useTaskStepMover } from "../use-task-step-move"
import { TaskTabStopProvider, useTaskTabStopStore } from "./task-tab-stop"
import { TaskTreeContext } from "./task-tree-context"

/** The task rows are the tree items (the "+" lines and the fields of a new task are not). */
const ROWS = "[role='treeitem'][data-task-id]"

/** True when nothing useful has the focus (the row that had it is gone, or a menu that is closing still holds it). */
const focusIsLost = () => {
    const active = document.activeElement
    return !active || active === document.body || !active.isConnected || !!active.closest("[role='menu']")
}

/** Gives the focus to a row if the focus is lost, now and once more after the menu or dialog that held it has closed. */
function focusIfLost(tree: HTMLElement, id: number) {
    const run = () => {
        if (focusIsLost()) tree.querySelector<HTMLElement>(`[data-task-id="${id}"]`)?.focus({ preventScroll: true })
    }
    run()
    requestAnimationFrame(run)
}

function TaskTreeBody({ label, children }: { label: string, children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null)
    const store = useTaskTabStopStore()
    const move = useTaskStepMover()
    const { t } = useTranslation()
    const value = useMemo(() => ({
        move,
        announceMoved: (position: number, total: number) => announce(t("tasks.keyboard.moved", { position, total })),
        announceCannotMove: () => announce(t("tasks.keyboard.cannotMove")),
    }), [move, t])
    // The tasks on screen after the last render, to find the neighbour of one that has gone
    const snapshot = useRef<number[]>([])

    // The tab stop is always a task on screen: if the task that was the tab stop is gone (deleted, archived, moved elsewhere,
    // hidden because its parent was closed) the tab stop passes to its neighbour (the next one, else the previous), which
    // takes the focus when the focus was lost with it. Checked after every render of the list and after any change of its
    // rows (a parent closed from its own menu changes the rows without a new render of the list).
    useEffect(() => {
        const tree = ref.current
        if (!tree || !store) return
        const reconcile = () => {
            const ids = Array.from(tree.querySelectorAll<HTMLElement>(ROWS), item => Number(item.dataset.taskId))
            const inView = new Set(ids)
            const stop = store.getState()
            if (stop !== null && !inView.has(stop)) {
                const before = snapshot.current
                const at = before.indexOf(stop)
                const candidates = at < 0 ? [] : [...before.slice(at + 1), ...before.slice(0, at).reverse()]
                const next = candidates.find(id => inView.has(id)) ?? null
                store.set(next)
                if (next !== null) focusIfLost(tree, next)
            }
            snapshot.current = ids
        }
        reconcile()
        const observer = new MutationObserver(reconcile)
        observer.observe(tree, { childList: true, subtree: true })
        return () => observer.disconnect()
    }, [store])
    return (
        <TaskTreeContext.Provider value={value}>
            <div ref={ref} role="tree" aria-label={label} aria-multiselectable="true" className="flex flex-col w-full">
                {children}
            </div>
        </TaskTreeContext.Provider>
    )
}

/**
 * A list of tasks as an ARIA tree: one tab stop (the task that had the focus, else the first), arrows between the rows
 * (see useTaskRowKeys) and a focus that does not get lost when the focused task goes away. The subtasks of a task belong to
 * the same tree.
 */
export const TaskTree = ({ listKey, label, children }: { listKey: string, label: string, children: ReactNode }) => (
    <TaskTabStopProvider listKey={listKey}>
        <TaskTreeBody label={label}>{children}</TaskTreeBody>
    </TaskTabStopProvider>
)
