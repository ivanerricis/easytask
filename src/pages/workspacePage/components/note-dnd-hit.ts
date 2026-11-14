import { hasShifts, shiftOf } from "./note-dnd-shift"
import type { NoteDragKind, NoteOverKind, NoteOverRef } from "./note-dnd"

/**
 * Hit test of the note drag, owned by the app instead of dnd-kit: the drop zones (tasks, sections, groups, the slots of a new group) are
 * NOT dnd-kit droppables. dnd-kit re-renders every draggable and droppable of the note whenever its `over` changes, measures every
 * droppable (Rect + getScrollableAncestors) at the start and observes each one with a ResizeObserver. Here a zone is just a node in a
 * Map, measured with one getBoundingClientRect each at the start of the drag, and hit-tested on every pointer move. What scrolls
 * (autoscroll, the wheel) is taken into account by the scroll position of the scrollable ancestors of the zones; a change of size of the
 * lists measures everything again. Module level on purpose (one note drag at a time), like note-dnd-shift.
 * @category Note DnD
 */

type Zone = { kind: NoteOverKind, id: number, accepts: readonly NoteDragKind[], node: HTMLElement }

/** A measured zone: its rect when it was measured (viewport coordinates) and the scrollable ancestors it moves with. */
type Measured = { ref: NoteOverRef, area: number, left: number, top: number, width: number, height: number, scrollers: HTMLElement[] }

/** The edges of a zone, in the viewport coordinates of the moment of the hit test (the scroll since the measure is added up). */
export type HitRect = { top: number, bottom: number, left: number, right: number, width: number, height: number }
export type Hit = { ref: NoteOverRef, rect: HitRect }

const zones = new Map<string, Zone>()
let measured: Measured[] = []
let measuredKind: NoteDragKind | null = null
/** Scroll position of the scrollable ancestors when the zones were measured. */
let scrollAtMeasure = new Map<HTMLElement, { left: number, top: number }>()
/** A change of size happened: the zones are measured again before the next hit test. */
let stale = false
let observer: ResizeObserver | null = null
let observing = false

/** Registers (or, with a null node, forgets) a drop zone. A ref callback: cheap, it triggers no render. */
export function registerZone(key: string, kind: NoteOverKind, id: number, accepts: readonly NoteDragKind[], node: HTMLElement | null): void {
    if (node) zones.set(key, { kind, id, accepts, node })
    else zones.delete(key)
}

/** The lists whose size changes can move the zones (the row of the groups and the lists of a group); the rows are not observed. */
const LISTS = '[data-testid="group-scroll"], [data-group-list]'

const markStale = () => { stale = true }

/** Measures the zones that accept `kind`, at their resting place (a shift still applied by a drop that has not settled is taken out). */
function measure(kind: NoteDragKind): void {
    const shifted = hasShifts()
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
        next.push({ ref: { kind: zone.kind, id: zone.id }, area: rect.width * rect.height, left, top, width: rect.width, height: rect.height, scrollers })
    }
    measured = next
    measuredKind = kind
    scrollAtMeasure = baseline
    stale = false
}

/** Measures the zones for a drag of `kind` and starts watching the lists for a change of size. */
export function measureZones(kind: NoteDragKind): void {
    measure(kind)
    stopObserving()
    if (typeof ResizeObserver === "undefined") return
    observing = false
    observer = new ResizeObserver(() => { if (observing) markStale() }) // the first call is the one of observe()
    document.querySelectorAll(LISTS).forEach(list => observer?.observe(list))
    window.addEventListener("resize", markStale)
    // Lets the first (initial) notification pass before changes count
    requestAnimationFrame(() => { observing = true })
}

function stopObserving() {
    observer?.disconnect()
    observer = null
    window.removeEventListener("resize", markStale)
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
 * The zone under the pointer: the smallest one that contains it (a task row beats its section card, a section card beats its group), the
 * same rule the dnd-kit collision detection had. `pointer` is in viewport coordinates.
 */
export function hitTest(pointer: { x: number, y: number }): Hit | null {
    if (stale && measuredKind) measure(measuredKind)
    const delta = new Map<HTMLElement, { x: number, y: number }>()
    for (const [scroller, start] of scrollAtMeasure) delta.set(scroller, { x: start.left - scroller.scrollLeft, y: start.top - scroller.scrollTop })
    let best: Measured | null = null
    let bestLeft = 0
    let bestTop = 0
    for (const zone of measured) {
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
    return { ref: best.ref, rect: { left: bestLeft, top: bestTop, width: best.width, height: best.height, right: bestLeft + best.width, bottom: bestTop + best.height } }
}
