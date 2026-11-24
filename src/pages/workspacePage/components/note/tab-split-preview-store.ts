import type { ScreenRect } from "./tab-reorder"

/**
 * The area of the preview of the split view while a tab of the single bar is dragged over the right half of the note: a tiny module
 * level store written by the tabs' drag (see TabsDndProvider) only when it enters or leaves the half, so a pointer move re-renders nothing.
 * @category Panes
 */

let area: ScreenRect | null = null
const listeners = new Set<() => void>()

/** Shows the preview over `next` (null: hides it). */
export function setSplitPreview(next: ScreenRect | null): void {
    if (area === next) return
    area = next
    listeners.forEach(listener => listener())
}

/** Subscription and snapshot for `useSyncExternalStore`. */
export const subscribeSplitPreview = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}
export const getSplitPreview = (): ScreenRect | null => area
