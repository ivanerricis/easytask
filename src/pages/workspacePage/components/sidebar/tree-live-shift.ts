import { SHIFT_DURATION } from "../note-dnd-shift"
import type { TreeShifts } from "./tree-dnd-live"

/**
 * The visual side of the "live drag" of the sidebar: a registry of the mounted rows and the code that moves them with
 * `style.transform` in `requestAnimationFrame`, without React (no state, no re-render per pointer move) and without touching the order
 * of the data. Module level on purpose: there is one tree drag at a time and the rows only hand over their ref.
 * The shifts are a function of the row key (see computeTreeShifts), not a list of nodes: with the virtualization a row that mounts
 * during the drag (autoscroll) is born with the shift it must have, and one that unmounts just forgets it.
 * @category Tree DnD
 */

type RowState = { dy: number, hidden: boolean }

const nodes = new Map<string, HTMLElement>()
/** What is applied to each node now. */
const applied = new Map<HTMLElement, RowState>()
let shifts: TreeShifts | null = null
let frame = 0
let cleanup: ReturnType<typeof setTimeout> | null = null
const leaving = new Set<HTMLElement>()

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** Attribute of the root of the tree while rows are shifted: the folders stop clipping their rows (see index.css). */
export const SHIFTING_ATTR = "data-tree-shifting"

/** Registers (or, with null, forgets) a row. A row that mounts while rows are shifted takes its shift at once, without gliding to it. */
export function registerTreeRow(key: string, node: HTMLElement | null): void {
    if (!node) {
        const old = nodes.get(key)
        nodes.delete(key)
        if (old) applied.delete(old)
        return
    }
    nodes.set(key, node)
    if (shifts) paint(key, node, "none")
}

/** Writes the state a row must have (the transition is the one given: none for a row that was just born). */
function paint(key: string, node: HTMLElement, transition: string): void {
    const dy = shifts?.dyOf(key) ?? 0
    const hidden = shifts?.isHidden(key) ?? false
    const old = applied.get(node) ?? { dy: 0, hidden: false }
    if (old.dy === dy && old.hidden === hidden) return
    node.style.transition = transition
    node.style.transform = dy !== 0 ? `translate3d(0, ${dy}px, 0)` : ""
    node.style.opacity = hidden ? "0" : ""
    if (dy === 0 && !hidden) {
        applied.delete(node)
        // Once the way back is over the transition is not needed: the next layout change must not animate
        if (transition !== "none") scheduleCleanup(node)
        else node.style.transition = ""
    } else applied.set(node, { dy, hidden })
}

function scheduleCleanup(node: HTMLElement) {
    leaving.add(node)
    if (cleanup) clearTimeout(cleanup)
    cleanup = setTimeout(() => {
        cleanup = null
        for (const item of leaving) if (!applied.has(item)) item.style.transition = ""
        leaving.clear()
    }, SHIFT_DURATION + 50)
}

const write = (animate: boolean) => {
    const transition = animate ? `transform ${SHIFT_DURATION}ms ease-out, opacity ${SHIFT_DURATION}ms ease-out` : "none"
    for (const [key, node] of nodes) paint(key, node, transition)
    // Rows that are no longer registered were dropped from `applied` already
    const root = nodes.values().next().value?.closest("[role=tree]") ?? null
    if (root) {
        if (applied.size > 0) root.setAttribute(SHIFTING_ATTR, "")
        // (after the way back, when the rows glide)
        else if (animate) setTimeout(() => { if (applied.size === 0) root.removeAttribute(SHIFTING_ATTR) }, SHIFT_DURATION + 50)
        else root.removeAttribute(SHIFTING_ATTR)
    }
}

/**
 * Moves the rows by `next` (null puts them back). The write happens in the next animation frame (a later call before that replaces
 * this one).
 */
export function applyTreeShifts(next: TreeShifts | null): void {
    shifts = next
    if (frame) return
    frame = requestAnimationFrame(() => {
        frame = 0
        write(!reducedMotion())
    })
}

/** Puts every row back at once; with `animate` they glide back (not with reduced motion). */
export function clearTreeShifts(animate: boolean): void {
    if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
    }
    shifts = null
    write(animate && !reducedMotion())
}

/** Whether something is moved (or about to be). */
export const hasTreeShifts = (): boolean => applied.size > 0 || shifts !== null

/** The offset of a node right now (an animation in progress included), from its computed transform. */
const currentOffset = (node: HTMLElement, wanted: number): number => {
    const value = (typeof getComputedStyle === "function" ? getComputedStyle(node).transform : "") || node.style.transform
    const matrix = /^matrix\(([^)]*)\)$/.exec(value)
    if (matrix) return parseFloat(matrix[1].split(",")[5]) || 0
    const matrix3d = /^matrix3d\(([^)]*)\)$/.exec(value)
    if (matrix3d) return parseFloat(matrix3d[1].split(",")[13]) || 0
    const translate = /^translate3d\(\s*[^,]+,\s*(-?[\d.]+)px/.exec(value)
    return translate ? parseFloat(translate[1]) : wanted
}

/** The vertical shift applied to a row right now (its droppable is measured at rest: see makeShiftFreeMeasure). */
export function treeShiftOf(element: HTMLElement, axis: "x" | "y" = "y"): number {
    if (axis !== "y") return 0
    const state = applied.get(element)
    return state ? currentOffset(element, state.dy) : 0
}
