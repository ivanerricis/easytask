import { useSyncExternalStore } from "react"
import { usePane } from "@/contexts/use-layout"

/**
 * Which pane of the split view the item of a cross-note drag (Ctrl held) is over: the veil of the unfocused pane is lifted while it is
 * the destination of the drag. Module level and outside React state on purpose: the provider writes it on every pointer move and
 * the store tells its subscribers only when the pane changes, so only the two veils (note and tab bar) of the panes involved re-render.
 * @category Note DnD
 */

let liftedPane: number | null = null
const listeners = new Set<() => void>()

/** The pane whose veil is lifted (null: none). Called by the drag provider; a repeated value does nothing. */
export function setVeilLiftedPane(pane: number | null): void {
    if (liftedPane === pane) return
    liftedPane = pane
    listeners.forEach(listener => listener())
}

/** The pane whose veil is lifted now. */
export const getVeilLiftedPane = (): number | null => liftedPane

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

/** Whether the veil of the pane the component is drawn in is lifted by a drag over it (a selector per pane: nothing else re-renders). */
export function useVeilLifted(): boolean {
    const pane = usePane()?.pane
    return useSyncExternalStore(subscribe, () => pane !== undefined && liftedPane === pane)
}
