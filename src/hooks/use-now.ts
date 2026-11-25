import { useSyncExternalStore } from "react"

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let snapshot = Date.now()

function subscribe(listener: () => void) {
    listeners.add(listener)
    // One timer for the whole app (a row per due date would be many): it ticks once a minute while somebody listens
    timer ??= setInterval(() => { snapshot = Date.now(); listeners.forEach(notify => notify()) }, 60_000)
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer !== null) { clearInterval(timer); timer = null }
    }
}

/** The current time, refreshed every minute (so a due date turns overdue on screen without a reload). */
export function useNow(): Date {
    const now = useSyncExternalStore(subscribe, () => snapshot)
    return new Date(now)
}
