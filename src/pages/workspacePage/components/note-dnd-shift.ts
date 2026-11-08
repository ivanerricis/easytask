import { buildLiveSnapshot, type LiveNodeInfo, type LiveSnapshot } from "./note-dnd-live"

/**
 * The visual side of the "live drag" of the tasks: a registry of the outer wrapper of every task and the code that moves them with
 * `style.transform`, in `requestAnimationFrame`, without React (no state, no re-render per pointer move) and without touching the
 * order of the data. Module level on purpose: there is one note drag at a time and the rows only hand over their ref.
 * @category Note DnD
 */

/** Duration of the shift of a row, in ms. */
export const SHIFT_DURATION = 150

/** Attributes the wrapper carries so the layout (lists and parents) can be read back from the DOM. */
/** Written by the task wrapper (Task.tsx) with these literal names. */
export const SHIFT_ATTR = { task: "data-task-wrap", section: "data-task-section" } as const

const nodes = new Map<string, HTMLElement>()
/** What is applied now, by node. */
const applied = new Map<HTMLElement, number>()
let target: ReadonlyMap<string, number> = new Map()
let hiddenKey: string | null = null
let hiddenNode: HTMLElement | null = null
let frame = 0
let cleanup: ReturnType<typeof setTimeout> | null = null

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** Key of the wrapper of a task in the registry (the same as the droppable key of its row, see noteKey). */
export const taskNodeKey = (taskId: number): string => `task-${taskId}`

/** Registers (or, with null, forgets) the wrapper of a task. A ref callback: it must be the same function while the key is. */
export function registerShiftNode(key: string, node: HTMLElement | null): void {
    if (node) {
        nodes.set(key, node)
        return
    }
    const old = nodes.get(key)
    nodes.delete(key)
    if (old) applied.delete(old)
    if (old && old === hiddenNode) hiddenNode = null
}

const write = (animate: boolean) => {
    const transition = animate ? `transform ${SHIFT_DURATION}ms ease-out` : "none"
    const wanted = new Map<HTMLElement, number>()
    for (const [key, dy] of target) {
        const node = nodes.get(key)
        if (node && dy !== 0) wanted.set(node, dy)
    }
    for (const node of [...applied.keys()]) {
        if (wanted.has(node)) continue
        node.style.transition = transition
        node.style.transform = ""
        applied.delete(node)
        // Once the way back is over the transition is not needed: the next layout change must not animate
        if (animate) scheduleCleanup(node)
        else node.style.transition = ""
    }
    for (const [node, dy] of wanted) {
        if (applied.get(node) === dy) continue
        node.style.transition = transition
        node.style.transform = `translate3d(0, ${dy}px, 0)`
        applied.set(node, dy)
    }

    // The dragged task fades out / in with the same duration as the shifts, so going back to the indicator (the pointer enters the
    // "inside" zone) does not pop: its room reopens by the same glide of the other rows
    const hidden = hiddenKey ? nodes.get(hiddenKey) ?? null : null
    /** Transition of a node that fades: its own shift (if any) plus the opacity. */
    const fading = (node: HTMLElement) => `${applied.has(node) ? `transform ${SHIFT_DURATION}ms ease-out, ` : ""}opacity ${SHIFT_DURATION}ms ease-out`
    if (hiddenNode && hiddenNode !== hidden) {
        const old = hiddenNode
        if (animate) {
            old.style.transition = fading(old)
            scheduleCleanup(old)
        } else old.style.transition = ""
        old.style.opacity = ""
    }
    if (hidden && hidden !== hiddenNode) {
        if (animate) hidden.style.transition = fading(hidden)
        hidden.style.opacity = "0"
    }
    hiddenNode = hidden
}

const leaving = new Set<HTMLElement>()
function scheduleCleanup(node: HTMLElement) {
    leaving.add(node)
    if (cleanup) clearTimeout(cleanup)
    cleanup = setTimeout(() => {
        cleanup = null
        for (const item of leaving) if (!applied.has(item) && item !== hiddenNode) item.style.transition = ""
        leaving.clear()
    }, SHIFT_DURATION + 50)
}

/**
 * Moves the wrappers by `shifts` (key -> dy); the ones that are not in it go back. The write happens in the next animation frame
 * (a later call before that replaces this one). `hidden` is the wrapper to hide (the dragged task whose room is closed).
 */
export function applyShifts(shifts: ReadonlyMap<string, number>, hidden: string | null = null): void {
    target = shifts
    hiddenKey = hidden
    if (frame) return
    frame = requestAnimationFrame(() => {
        frame = 0
        write(!reducedMotion())
    })
}

/** Puts every wrapper back at once; with `animate` they glide back (not with reduced motion). */
export function clearShifts(animate: boolean): void {
    if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
    }
    target = new Map()
    hiddenKey = null
    write(animate && !reducedMotion())
}

/** Whether something is moved (or about to be). */
export const hasShifts = (): boolean => applied.size > 0 || hiddenKey !== null || [...target.values()].some(dy => dy !== 0)

/** The vertical offset of a node right now (an animation in progress included), from its inline transform. */
const currentOffset = (node: HTMLElement, wanted: number): number => {
    const value = (typeof getComputedStyle === "function" ? getComputedStyle(node).transform : "") || node.style.transform
    const matrix = /^matrix\(([^)]*)\)$/.exec(value)
    if (matrix) return parseFloat(matrix[1].split(",")[5]) || 0
    const matrix3d = /^matrix3d\(([^)]*)\)$/.exec(value)
    if (matrix3d) return parseFloat(matrix3d[1].split(",")[13]) || 0
    const translate = /^translate3d\(\s*[^,]+,\s*(-?[\d.]+)px/.exec(value)
    return translate ? parseFloat(translate[1]) : wanted
}

/** The shift applied to an element: the one of its own wrapper and of the wrappers of its ancestors (the subtasks ride on them). */
export function shiftOf(element: HTMLElement): number {
    let total = 0
    for (const [node, dy] of applied) if (node.contains(element)) total += currentOffset(node, dy)
    return total
}

/** Reads the layout of the registered wrappers (call it before anything is shifted: the snapshot must be of the resting layout). */
export function readLiveSnapshot(): LiveSnapshot {
    const sorted = [...nodes.values()]
        .filter(node => node.isConnected)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    const infos: LiveNodeInfo[] = sorted.map(node => {
        const parentNode = node.parentElement?.closest<HTMLElement>(`[${SHIFT_ATTR.task}]`)
        const parentId = parentNode?.getAttribute(SHIFT_ATTR.task)
        const rect = node.getBoundingClientRect()
        return {
            key: `task-${node.getAttribute(SHIFT_ATTR.task)}`,
            list: parentId ? `t-${parentId}` : `s-${node.getAttribute(SHIFT_ATTR.section)}`,
            parent: parentId ? `task-${parentId}` : null,
            top: rect.top,
            height: rect.height,
        }
    })
    return buildLiveSnapshot(infos)
}
