import { isDisplaced, shiftNodesOf, shiftOf } from "./note-dnd-shift"
import type { NoteDragKind, NoteOverKind, NoteOverRef } from "./note-dnd"
import { ownerKey } from "./note-dnd-owner"

/**
 * Hit test of the note drag, owned by the app instead of dnd-kit: the drop zones (tasks, sections, groups, the slots of a new group) are
 * NOT dnd-kit droppables. dnd-kit re-renders every draggable and droppable of the note whenever its `over` changes, measures every
 * droppable (Rect + getScrollableAncestors) at the start and observes each one with a ResizeObserver. Here a zone is just a node in a
 * Map, measured with one getBoundingClientRect each at the start of the drag, and hit-tested on every pointer move. What scrolls
 * (autoscroll, the wheel) is taken into account by the scroll position of the scrollable ancestors of the zones; a change of size of the
 * lists measures everything again. Module level on purpose (one note drag at a time), like note-dnd-shift.
 * @category Note DnD
 */

type Zone = { kind: NoteOverKind, id: number, accepts: readonly NoteDragKind[], node: HTMLElement, owner: string }

/** A measured zone: its rect when it was measured (viewport coordinates) and the scrollable ancestors it moves with. */
type Measured = { ref: NoteOverRef, owner: string, node: HTMLElement, area: number, left: number, top: number, width: number, height: number, scrollers: HTMLElement[] }

/** The edges of a zone, in the viewport coordinates of the moment of the hit test (the scroll since the measure is added up). */
export type HitRect = { top: number, bottom: number, left: number, right: number, width: number, height: number }
export type Hit = {
    ref: NoteOverRef
    rect: HitRect
    /** The drag provider (note) the zone belongs to: the other pane of a split view has another one. */
    owner: string
}

/** What a hit test may return: with `cross` false only the zones of `owner` (the note the drag started in) count. */
export type HitScope = { owner: string, cross: boolean }

const zones = new Map<string, Zone>()
let measured: Measured[] = []
let measuredKind: NoteDragKind | null = null
/** Scroll position of the scrollable ancestors when the zones were measured. */
let scrollAtMeasure = new Map<HTMLElement, { left: number, top: number }>()
/** A change of size happened: the zones are measured again before the next hit test. */
let stale = false
let observer: ResizeObserver | null = null
let observing = false
let onWindowResize: (() => void) | null = null
/** The frame a call to `onResize` waits for (0: none), so a burst of changes calls it once. */
let resizeFrame = 0

/**
 * Registers (or, with a null node, forgets) a drop zone of the note of `owner` (see note-dnd-owner: the zones of two notes never
 * share a key). A ref callback: cheap, it triggers no render.
 */
export function registerZone(key: string, kind: NoteOverKind, id: number, accepts: readonly NoteDragKind[], node: HTMLElement | null, owner = ""): void {
    const full = ownerKey(owner, key)
    if (node) zones.set(full, { kind, id, accepts, node, owner })
    else zones.delete(full)
}

/** The lists whose size changes can move the zones (the row of the groups and the lists of a group); the rows are not observed. */
const LISTS = '[data-testid="group-scroll"], [data-group-list]'

const markStale = () => { stale = true }

/** Measures the zones that accept `kind`, at their resting place (a shift still applied by a drop that has not settled is taken out). */
function measure(kind: NoteDragKind): void {
    const shifted = isDisplaced()
    // The scrollable ancestors, found once per element going up (an element scrolls when its content is bigger than it)
    const chains = new Map<HTMLElement, HTMLElement[]>()
    const chainOf = (element: HTMLElement | null): HTMLElement[] => {
        if (!element) return []
        const known = chains.get(element)
        if (known) return known
        const up = chainOf(element.parentElement)
        const chain = element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth ? [element, ...up] : up
        chains.set(element, chain)
        return chain
    }
    const baseline = new Map<HTMLElement, { left: number, top: number }>()
    const next: Measured[] = []
    for (const zone of zones.values()) {
        const { node } = zone
        if (!zone.accepts.includes(kind) || !node.isConnected) continue
        const rect = node.getBoundingClientRect()
        const scrollers = chainOf(node.parentElement)
        for (const scroller of scrollers) if (!baseline.has(scroller)) baseline.set(scroller, { left: scroller.scrollLeft, top: scroller.scrollTop })
        const left = rect.left - (shifted ? shiftOf(node, "x") : 0)
        const top = rect.top - (shifted ? shiftOf(node, "y") : 0)
        next.push({ ref: { kind: zone.kind, id: zone.id }, owner: zone.owner, node, area: rect.width * rect.height, left, top, width: rect.width, height: rect.height, scrollers })
    }
    measured = next
    measuredKind = kind
    scrollAtMeasure = baseline
    stale = false
}

/**
 * Measures the zones for a drag of `kind` and starts watching for a change of size: the lists, the zones that take part and the
 * wrappers that the live drag shifts (a row that grows or shrinks, e.g. an image that finishes loading or a text that wraps, moves
 * everything below it; the transforms of the shifts do not change a size, so they never trigger this). `onResize` is called, after the
 * zones were marked to be measured again, at most once per frame.
 */
export function measureZones(kind: NoteDragKind, onResize?: () => void): void {
    measure(kind)
    stopObserving()
    if (typeof ResizeObserver === "undefined") return
    observing = false
    const changed = () => {
        markStale()
        if (!onResize || resizeFrame) return
        resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; onResize() })
    }
    observer = new ResizeObserver(() => { if (observing) changed() }) // the first call is the one of observe()
    document.querySelectorAll(LISTS).forEach(list => observer?.observe(list))
    for (const zone of measured) observer.observe(zone.node)
    for (const node of shiftNodesOf(kind)) observer.observe(node)
    onWindowResize = changed
    window.addEventListener("resize", onWindowResize)
    // Lets the first (initial) notification pass before changes count
    requestAnimationFrame(() => { observing = true })
}

function stopObserving() {
    observer?.disconnect()
    observer = null
    if (onWindowResize) window.removeEventListener("resize", onWindowResize)
    onWindowResize = null
    if (resizeFrame) cancelAnimationFrame(resizeFrame)
    resizeFrame = 0
}

/** Forgets the measures (the end of the drag). */
export function clearZones(): void {
    stopObserving()
    measured = []
    measuredKind = null
    scrollAtMeasure = new Map()
    stale = false
}

/**
 * Where a zone is now (it may have scrolled since the hit that was kept): its rect in viewport coordinates, or null if it is not measured.
 * What keeps a place by the rect it was hit with (the few px of gap around it) must ask this, not use the old rect: with the pointer
 * still and the content scrolling under it, the old rect is where the zone was.
 */
export function zoneRect(kind: NoteOverKind, id: number, owner?: string): HitRect | null {
    const zone = measured.find(item => item.ref.kind === kind && item.ref.id === id && (owner === undefined || item.owner === owner))
    if (!zone) return null
    let left = zone.left
    let top = zone.top
    for (const scroller of zone.scrollers) {
        const start = scrollAtMeasure.get(scroller)
        if (start) { left += start.left - scroller.scrollLeft; top += start.top - scroller.scrollTop }
    }
    return { left, top, width: zone.width, height: zone.height, right: left + zone.width, bottom: top + zone.height }
}

/**
 * The zone under the pointer: the smallest one that contains it (a task row beats its section card, a section card beats its group), the
 * same rule the dnd-kit collision detection had. `pointer` is in viewport coordinates.
 * `scope`: the zones of another note (the other pane of the split view) are skipped unless it allows crossing (Ctrl held).
 */
export function hitTest(pointer: { x: number, y: number }, scope?: HitScope): Hit | null {
    if (stale && measuredKind) measure(measuredKind)
    const delta = new Map<HTMLElement, { x: number, y: number }>()
    for (const [scroller, start] of scrollAtMeasure) delta.set(scroller, { x: start.left - scroller.scrollLeft, y: start.top - scroller.scrollTop })
    let best: Measured | null = null
    let bestLeft = 0
    let bestTop = 0
    for (const zone of measured) {
        if (scope && !scope.cross && zone.owner !== scope.owner) continue
        let left = zone.left
        let top = zone.top
        for (const scroller of zone.scrollers) {
            const d = delta.get(scroller)
            if (d) { left += d.x; top += d.y }
        }
        if (pointer.x < left || pointer.x > left + zone.width || pointer.y < top || pointer.y > top + zone.height) continue
        if (best && zone.area >= best.area) continue
        best = zone
        bestLeft = left
        bestTop = top
    }
    if (!best) return null
    return { ref: best.ref, owner: best.owner, rect: { left: bestLeft, top: bestTop, width: best.width, height: best.height, right: bestLeft + best.width, bottom: bestTop + best.height } }
}
