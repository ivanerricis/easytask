import { shiftDurationMs } from "@/lib/animation-speed"
import { LIVE_SLOT_ATTR, SHIFT_DURATION } from "../note-dnd-shift"
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

/** Duration of the shifts of the drag in progress, from the speed of the animations of the app (0: no animation). Read when a drag starts. */
let duration = SHIFT_DURATION

/** Attribute of the root of the tree while rows are shifted: the folders stop clipping their rows (see index.css). */
export const SHIFTING_ATTR = "data-tree-shifting"

/** Attribute of the layer that moves a row (guides and item together): what the rows register, and what the droppable inside looks up. */
export const SHIFT_LAYER_ATTR = "data-tree-shift-layer"

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
    }, duration + 50)
}

const write = (animate: boolean) => {
    const transition = animate ? `transform ${duration}ms ease-out, opacity ${duration}ms ease-out` : "none"
    for (const [key, node] of nodes) paint(key, node, transition)
    // Rows that are no longer registered were dropped from `applied` already
    const root = nodes.values().next().value?.closest("[role=tree]") ?? null
    if (root) {
        if (applied.size > 0) root.setAttribute(SHIFTING_ATTR, "")
        // (after the way back, when the rows glide)
        else if (animate) setTimeout(() => { if (applied.size === 0) root.removeAttribute(SHIFTING_ATTR) }, duration + 50)
        else root.removeAttribute(SHIFTING_ATTR)
    }
    writeSlot(animate)
}

/**
 * Moves the rows by `next` (null puts them back). The write happens in the next animation frame (a later call before that replaces
 * this one).
 */
export function applyTreeShifts(next: TreeShifts | null, nextSlot: TreeSlot | null = null): void {
    // The first target of a drag (nothing moved yet): the speed of the animations may have changed since the last one
    if (next && !hasTreeShifts()) duration = shiftDurationMs(SHIFT_DURATION)
    shifts = next
    slot = next ? nextSlot : null
    if (frame) return
    frame = requestAnimationFrame(() => {
        frame = 0
        write(duration > 0)
    })
}

/** Puts every row back at once; with `animate` they glide back (not with the animations off). */
export function clearTreeShifts(animate: boolean): void {
    if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
    }
    shifts = null
    slot = null
    write(animate && duration > 0)
}

/**
 * The room that opens, in rows of the flat list: `index` of its first row, `count` of rows, `depth` of the place (its indent).
 * @category Tree DnD
 */
export type TreeSlot = { index: number, count: number, depth: number }

let slot: TreeSlot | null = null
/** Where the rows are at rest, measured when the drag starts (see readTreeRest). */
let rest: { root: HTMLElement, originY: number, rowSize: number, gap: number, indentPx: number, guidePx: number } | null = null
let slotNode: HTMLElement | null = null
let slotHost: { root: HTMLElement, position: string } | null = null

/**
 * Measures the layout at rest, before anything moves: the top of the first row of the flat list inside the tree (from any mounted row,
 * the rows have a fixed size), so the skeleton can be placed by row index even for rows that are not mounted.
 */
export function readTreeRest(indexOf: (key: string) => number | undefined, rowSize: number, gap: number, indentPx: number, guidePx: number): void {
    rest = null
    if (!hasTreeShifts()) duration = shiftDurationMs(SHIFT_DURATION)
    for (const [key, node] of nodes) {
        const index = indexOf(key)
        const root = node.closest<HTMLElement>("[role=tree]")
        if (index === undefined || !root || !node.isConnected) continue
        const box = root.getBoundingClientRect()
        const originY = node.getBoundingClientRect().top - index * rowSize - box.top - root.clientTop + root.scrollTop
        rest = { root, originY, rowSize, gap, indentPx, guidePx }
        return
    }
}

const releaseHost = () => {
    if (!slotHost) return
    slotHost.root.style.position = slotHost.position
    slotHost = null
}

/** Draws the skeleton in the room of `slot` (see the one of the note, LIVE_SLOT_ATTR), inside the tree, or removes it. */
function writeSlot(animate: boolean) {
    if (!slot || !rest || !rest.root.isConnected) {
        slotNode?.remove()
        slotNode = null
        releaseHost()
        return
    }
    const { root } = rest
    if (slotHost?.root !== root) {
        releaseHost()
        slotNode?.remove()
        slotNode = null
        slotHost = { root, position: root.style.position }
        if (getComputedStyle(root).position === "static") root.style.position = "relative"
    }
    const fresh = !slotNode
    if (!slotNode) {
        slotNode = document.createElement("div")
        slotNode.setAttribute(LIVE_SLOT_ATTR, "")
        slotNode.setAttribute("aria-hidden", "true")
        slotNode.className = "live-drag-slot"
        root.appendChild(slotNode)
    }
    const left = slot.depth * rest.indentPx
    const style = slotNode.style
    style.transition = animate && !fresh ? `top ${duration}ms ease-out, left ${duration}ms ease-out, height ${duration}ms ease-out` : "none"
    style.top = `${rest.originY + slot.index * rest.rowSize}px`
    style.left = `${left}px`
    style.width = `calc(100% - ${left}px)`
    style.height = `${slot.count * rest.rowSize - rest.gap}px`
    writeSlotGuides(slotNode, slot.depth, left, rest)
}

/**
 * The indent guides inside the skeleton (the rows carry theirs in their shift layer): one per level of the place, at the same x as the
 * ones of the rows, reaching up into the gap above and down into the one below so the lines run on without a break across the room.
 */
function writeSlotGuides(node: HTMLElement, depth: number, left: number, measures: { indentPx: number, guidePx: number, gap: number }) {
    while (node.children.length > depth) node.lastElementChild?.remove()
    while (node.children.length < depth) {
        const guide = document.createElement("span")
        guide.setAttribute("aria-hidden", "true")
        guide.setAttribute("data-testid", "tree-slot-guide")
        guide.className = "pointer-events-none absolute w-px bg-foreground/20"
        node.appendChild(guide)
    }
    // Relative to the padding box of the skeleton: its 1px border is not part of it
    for (let level = 0; level < depth; level++) {
        const style = (node.children[level] as HTMLElement).style
        style.left = `${level * measures.indentPx + measures.guidePx - left - 1}px`
        style.top = `${-measures.gap - 1}px`
        style.bottom = `${-measures.gap - 1}px`
    }
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
    // The droppable is the item inside the shift layer that moves: the shift is the one of its closest registered ancestor
    const layer = applied.has(element) ? element : element.closest<HTMLElement>(`[${SHIFT_LAYER_ATTR}]`)
    const state = layer ? applied.get(layer) : undefined
    return layer && state ? currentOffset(layer, state.dy) : 0
}
