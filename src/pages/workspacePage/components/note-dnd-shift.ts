import { buildLiveSnapshot, GROUPS_LIST, groupListKey, tabListKey, type LiveNodeInfo, type LiveSlot, type LiveSnapshot } from "./note-dnd-live"

/**
 * The visual side of the "live drag" of the tasks, the sections, the groups and the open tabs: a registry of the outer wrapper of every task, section, group and tab and the code that moves them with
 * `style.transform`, in `requestAnimationFrame`, without React (no state, no re-render per pointer move) and without touching the
 * order of the data. Module level on purpose: there is one note drag at a time and the rows only hand over their ref.
 * @category Note DnD
 */

/** Duration of the shift of a row, in ms. */
export const SHIFT_DURATION = 150

/**
 * Attributes the wrappers carry so the layout (lists and parents) can be read back from the DOM. Written with these literal names by
 * the task wrapper (Task.tsx) and the section wrapper (Section.tsx, GroupTasks.tsx: `sectionWrap` = its id, `group` = the id of its group) and the column of a group (GroupContainer.tsx: `groupWrap` = its id) and the tab wrapper (NoteList.tsx: `tab` = the id of its note, `tabBar` = the pane of its bar).
 */
export const SHIFT_ATTR = { task: "data-task-wrap", section: "data-task-section", sectionWrap: "data-section-wrap", group: "data-section-group", groupWrap: "data-group-wrap", tab: "data-tab-wrap", tabBar: "data-tab-bar" } as const

/** The axis a drag moves the wrappers on: the tasks and the sections step aside vertically, the groups (columns) and the tabs horizontally. */
export type ShiftAxis = "x" | "y"

const nodes = new Map<string, HTMLElement>()
/** What is applied now, by node. */
const applied = new Map<HTMLElement, number>()
let target: ReadonlyMap<string, number> = new Map()
/** The axis of the shifts in `target` and in `applied` (one drag at a time, one axis). */
let axis: ShiftAxis = "y"
let hiddenKey: string | null = null
let hiddenNode: HTMLElement | null = null
let frame = 0
let cleanup: ReturnType<typeof setTimeout> | null = null

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** Key of the wrapper of a task in the registry (the same as the droppable key of its row, see noteKey). */
export const taskNodeKey = (taskId: number): string => `task-${taskId}`

/** Key of the wrapper of a section in the registry (the same as the droppable key of its card, see noteKey). */
export const sectionNodeKey = (sectionId: number): string => `section-${sectionId}`

/** Key of the wrapper of a group (the column) in the registry (the same as the droppable key of the group, see noteKey). */
export const groupNodeKey = (groupId: number): string => `group-${groupId}`

/** Key of the wrapper of a tab in the registry: the note id is only unique inside a pane when the workspace is split. */
export const tabNodeKey = (pane: number, noteId: number): string => `tab-${pane}-${noteId}`

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
        node.style.transform = axis === "x" ? `translate(${dy}px, 0)` : `translate(0, ${dy}px)`
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
    writeSlot(animate)
}

/** Attribute of the skeleton drawn in the room that opens (tests, e2e). */
export const LIVE_SLOT_ATTR = "data-live-slot"

/** Where a list sits at rest (when the drag started): its container and the cross axis of its rows, to place the skeleton in it. */
type RestList = { container: HTMLElement, start: number, cross: number, crossSize: number, scroll: number, crossScroll: number }
let restLists = new Map<string, RestList>()
let targetSlot: LiveSlot | null = null
let slotNode: HTMLElement | null = null
/**
 * The skeletons, one per list, put in their container right after the drag started and kept (hidden) for the length of the drag:
 * putting a box in a list is a layout of the whole list, so it is not done in the frame the target changes. Shown with its attribute,
 * hidden without (the attribute is what the tests and the e2e count).
 */
const pool = new Map<HTMLElement, { node: HTMLElement, width: number, height: number }>()
/**
 * The containers that were made the frame of the skeleton (`position: relative`) for the length of the drag, with the inline `position`
 * they had. Like the skeletons, it is done before the target changes: a change of the position of a container in the middle of the
 * drag is a layout of the whole list in the frame the target changes.
 */
const frames = new Map<HTMLElement, string>()

/** Makes `container` the frame of the skeleton if it is not positioned, and puts its skeleton in (hidden). */
const frameOf = (container: HTMLElement) => {
    if (!frames.has(container) && getComputedStyle(container).position === "static") {
        frames.set(container, container.style.position)
        container.style.position = "relative"
    }
    return pool.get(container) ?? makeSlot(container)
}

/** How many lists get their frame and skeleton in one animation frame (each one is a layout of the list). */
const LISTS_PER_FRAME = 4

let prepareTimer: ReturnType<typeof setTimeout> | null = null
let prepareFrame = 0

/**
 * Frames and skeletons of every list, once the frame that started the drag is on screen (not in it: that frame has enough to do), a
 * few lists per frame (all of them in one frame are one long frame of the layout of every list), the list of the dragged item first and then
 * the others by their distance from it in the document. If a target changes before a list was prepared, `writeSlot` does it for it.
 */
const prepareSlots = (near: HTMLElement | null) => {
    if (prepareFrame) cancelAnimationFrame(prepareFrame)
    if (prepareTimer !== null) clearTimeout(prepareTimer)
    prepareTimer = null
    prepareFrame = requestAnimationFrame(() => {
        prepareFrame = 0
        prepareTimer = setTimeout(() => {
            prepareTimer = null
            const all = [...restLists.values()].map(rest => rest.container)
            const source = near ? all.findIndex(container => container.contains(near)) : -1
            const queue = all
                .map((container, index) => ({ container, distance: source < 0 ? index : Math.abs(index - source) }))
                .sort((a, b) => a.distance - b.distance)
                .map(item => item.container)
            const next = () => {
                prepareFrame = 0
                let done = 0
                for (let container = queue.shift(); container && done < LISTS_PER_FRAME; container = done < LISTS_PER_FRAME ? queue.shift() : undefined) {
                    if (!container.isConnected || pool.has(container)) continue
                    frameOf(container)
                    done++
                }
                if (queue.length > 0) prepareFrame = requestAnimationFrame(next)
            }
            next()
        }, 0)
    })
}

const releaseFrames = () => {
    if (prepareFrame) cancelAnimationFrame(prepareFrame)
    if (prepareTimer !== null) clearTimeout(prepareTimer)
    prepareFrame = 0
    prepareTimer = null
    for (const [container, position] of frames) container.style.position = position
    frames.clear()
    for (const { node } of pool.values()) node.remove()
    pool.clear()
    slotNode = null
}

const makeSlot = (container: HTMLElement) => {
    const node = document.createElement("div")
    node.setAttribute("aria-hidden", "true")
    node.className = "live-drag-slot"
    node.style.cssText = "left:0;top:0;width:0;height:0;opacity:0;animation:none;transform:translate(0px, 0px)"
    container.appendChild(node)
    const entry = { node, width: 0, height: 0 }
    pool.set(container, entry)
    return entry
}

const hideSlot = () => {
    if (!slotNode) return
    slotNode.removeAttribute(LIVE_SLOT_ATTR)
    slotNode.style.transition = "none"
    slotNode.style.opacity = "0"
    slotNode.style.transform = "translate(0px, 0px)"
    slotNode = null
}

/**
 * Shows the skeleton in the room of `targetSlot`, inside the container of its list (so it scrolls and is clipped with the list, and
 * rides on the shift of a parent task), in content coordinates of the layout at rest. Hidden when there is no room to show.
 * It is placed with a transform (the size is written only when it changes), so that moving it from one room to the next does not lay
 * the list out again.
 */
function writeSlot(animate: boolean) {
    const rest = targetSlot ? restLists.get(targetSlot.list) : undefined
    if (!targetSlot || !rest || !rest.container.isConnected) {
        hideSlot()
        return
    }
    const { container } = rest
    const entry = pool.get(container) ?? frameOf(container)
    const fresh = slotNode !== entry.node
    if (fresh) hideSlot()
    slotNode = entry.node
    const along = targetSlot.start - rest.start + rest.scroll
    const across = rest.cross + rest.crossScroll
    const box = axis === "x"
        ? { left: along, top: across, width: targetSlot.size, height: rest.crossSize }
        : { left: across, top: along, width: rest.crossSize, height: targetSlot.size }
    const style = slotNode.style
    // A skeleton that was hidden fades in where the room opens; one that is there glides to the next room with the rows
    style.transition = !animate ? "none" : fresh ? `opacity ${SHIFT_DURATION}ms ease-out` : `transform ${SHIFT_DURATION}ms ease-out`
    style.transform = `translate(${box.left}px, ${box.top}px)`
    if (entry.width !== box.width) style.width = `${entry.width = box.width}px`
    if (entry.height !== box.height) style.height = `${entry.height = box.height}px`
    if (fresh) {
        slotNode.setAttribute(LIVE_SLOT_ATTR, "")
        style.opacity = "1"
    }
}

/** Measures where the lists of the wrappers are at rest (see `restLists`), on the axis the kind moves along. */
function readRestLists(sorted: HTMLElement[], listOf: string[], along: ShiftAxis, near: HTMLElement | null) {
    const next = new Map<string, RestList>()
    const shifted = isDisplaced()
    for (const [index, node] of sorted.entries()) {
        const list = listOf[index]
        if (next.has(list) || !node.parentElement) continue
        const container = node.parentElement
        // The container of a subtask list rides on the shift of its parent task: its place at rest is without it
        const moved = shifted ? shiftOf(container, along) : 0
        const box = container.getBoundingClientRect()
        const rect = node.getBoundingClientRect()
        next.set(list, along === "x"
            ? { container, start: box.left - moved + container.clientLeft, cross: rect.top - box.top - container.clientTop, crossSize: rect.height, scroll: container.scrollLeft, crossScroll: container.scrollTop }
            : { container, start: box.top - moved + container.clientTop, cross: rect.left - box.left - container.clientLeft, crossSize: rect.width, scroll: container.scrollTop, crossScroll: container.scrollLeft })
    }
    restLists = next
    prepareSlots(near)
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
 * Moves the wrappers by `shifts` (key -> distance along `along`); the ones that are not in it go back. The write happens in the next
 * animation frame (a later call before that replaces this one). `hidden` is the wrapper to hide (the dragged one whose room is closed).
 */
export function applyShifts(shifts: ReadonlyMap<string, number>, hidden: string | null = null, along: ShiftAxis = "y", slot: LiveSlot | null = null): void {
    target = shifts
    axis = along
    hiddenKey = hidden
    targetSlot = slot
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
    targetSlot = null
    write(animate && !reducedMotion())
    releaseFrames()
}

/** Whether something is moved (or about to be). */
export const hasShifts = (): boolean => applied.size > 0 || hiddenKey !== null || [...target.values()].some(dy => dy !== 0)

/**
 * Whether a node may be off its resting place on screen: shifted, or gliding back (it is not in `applied` any more but its transition
 * has not ended). What measures the layout needs this, `hasShifts` is about what the drop has to settle.
 */
export const isDisplaced = (): boolean => hasShifts() || leaving.size > 0

/** The offset of a node along the axis right now (an animation in progress included), from its inline transform. */
const currentOffset = (node: HTMLElement, wanted: number): number => {
    const value = (typeof getComputedStyle === "function" ? getComputedStyle(node).transform : "") || node.style.transform
    const matrix = /^matrix\(([^)]*)\)$/.exec(value)
    if (matrix) return parseFloat(matrix[1].split(",")[axis === "x" ? 4 : 5]) || 0
    const matrix3d = /^matrix3d\(([^)]*)\)$/.exec(value)
    if (matrix3d) return parseFloat(matrix3d[1].split(",")[axis === "x" ? 12 : 13]) || 0
    const translate = axis === "x"
        ? /^translate(?:3d)?\(\s*(-?[\d.]+)px/.exec(value)
        : /^translate(?:3d)?\(\s*[^,]+,\s*(-?[\d.]+)px/.exec(value)
    return translate ? parseFloat(translate[1]) : wanted
}

/**
 * The shift applied to an element along `along`: the one of its own wrapper and of the wrappers of its ancestors (the subtasks ride on
 * them). Zero for the other axis than the one the current drag moves on.
 */
export function shiftOf(element: HTMLElement, along: ShiftAxis = "y"): number {
    if (along !== axis) return 0
    let total = 0
    for (const [node, dy] of applied) if (node.contains(element)) total += currentOffset(node, dy)
    // A row gliding back is still off its place by what is left of the transition
    for (const node of leaving) if (!applied.has(node) && node.contains(element)) total += currentOffset(node, 0)
    return total
}

type ShiftKind = "task" | "section" | "group" | "tab"

const attributeOf = (kind: ShiftKind) => ({ task: SHIFT_ATTR.task, section: SHIFT_ATTR.sectionWrap, group: SHIFT_ATTR.groupWrap, tab: SHIFT_ATTR.tab }[kind])

/** The registered wrappers of the kind that is dragged (the ones the live drag can move), in no particular order. */
export function shiftNodesOf(kind: ShiftKind): HTMLElement[] {
    const attribute = attributeOf(kind)
    return [...nodes.values()].filter(node => node.isConnected && node.hasAttribute(attribute))
}

/**
 * Reads the layout of the registered wrappers of the kind that is dragged. Call it before anything is shifted, or later (a row changed
 * its size): the shifts applied right now are taken out, so the snapshot is always of the resting layout. Only the wrappers that can be
 * moved are read: a section drag does not touch the hundreds of tasks.
 */
export function readLiveSnapshot(kind: ShiftKind = "task", near: HTMLElement | null = null): LiveSnapshot {
    const shifted = isDisplaced()
    const along: ShiftAxis = kind === "tab" || kind === "group" ? "x" : "y"
    /** Where the node would be at rest: its rect minus the shift it and its ancestors carry (the one on screen, an animation in progress included, like the rect). */
    const resting = (node: HTMLElement, edge: number) => edge - (shifted ? shiftOf(node, along) : 0)
    const sorted = shiftNodesOf(kind)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    const infos: LiveNodeInfo[] = sorted.map(node => {
        const rect = node.getBoundingClientRect()
        // The tabs of a bar: one list per bar, laid out along the horizontal axis (left and width stand for top and height)
        if (kind === "tab") {
            const pane = Number(node.getAttribute(SHIFT_ATTR.tabBar))
            return {
                key: tabNodeKey(pane, Number(node.getAttribute(SHIFT_ATTR.tab))),
                list: tabListKey(pane),
                parent: null,
                top: resting(node, rect.left),
                height: rect.width,
            }
        }
        // The columns are laid out along the horizontal axis: left and width stand for top and height
        if (kind === "group") {
            return {
                key: groupNodeKey(Number(node.getAttribute(SHIFT_ATTR.groupWrap))),
                list: GROUPS_LIST,
                parent: null,
                top: resting(node, rect.left),
                height: rect.width,
            }
        }
        if (kind === "section") {
            return {
                key: sectionNodeKey(Number(node.getAttribute(SHIFT_ATTR.sectionWrap))),
                list: groupListKey(Number(node.getAttribute(SHIFT_ATTR.group))),
                parent: null,
                top: resting(node, rect.top),
                height: rect.height,
            }
        }
        const parentNode = node.parentElement?.closest<HTMLElement>(`[${SHIFT_ATTR.task}]`)
        const parentId = parentNode?.getAttribute(SHIFT_ATTR.task)
        return {
            key: `task-${node.getAttribute(SHIFT_ATTR.task)}`,
            list: parentId ? `t-${parentId}` : `s-${node.getAttribute(SHIFT_ATTR.section)}`,
            parent: parentId ? `task-${parentId}` : null,
            top: resting(node, rect.top),
            height: rect.height,
        }
    })
    readRestLists(sorted, infos.map(info => info.list), along, near)
    return buildLiveSnapshot(infos)
}
