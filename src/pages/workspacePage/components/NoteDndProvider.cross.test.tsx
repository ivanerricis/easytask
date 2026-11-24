import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NoteDataTree } from "@/types/types"
import { makeGroup, makeSection, makeTask } from "@/test/ui-fixtures"
import { NoteDndProvider } from "./NoteDndProvider"
import { createNoteDndStore, NO_HOVER } from "./note-dnd-state"
import { registerNoteOwner } from "./note-dnd-owner"
import { getVeilLiftedPane, setVeilLiftedPane } from "./note-dnd-veil"
import type { NoteOverRef } from "./note-dnd"
import type { Modifiers, PointerDragHandlers } from "./note-dnd-pointer"

/*
 * The drag that crosses to the other note of the split view, as the provider of the left pane sees it: the hit test says what is under
 * the pointer (and whose it is), Ctrl and Alt come from the pointer controller. Crossing needs Ctrl for the whole drag; the drop is
 * handed to the cross-note hook, as a copy when Alt is held at the release.
 */
let latest: PointerDragHandlers
let modifiers: Modifiers = { ctrl: false, alt: false }
vi.mock("./note-dnd-pointer", async importActual => ({
    ...await importActual<typeof import("./note-dnd-pointer")>(),
    createPointerDrag: () => ({
        press: () => undefined, getPointer: () => null, getModifiers: () => modifiers, isDragging: () => false, cancel: () => undefined,
        setHandlers: (next: PointerDragHandlers) => { latest = next },
    }),
}))

type Hit = { ref: NoteOverRef, rect: unknown, owner: string } | null
let hit: Hit = null
const hitTest = vi.fn((_pointer: unknown, scope?: { owner: string, cross: boolean }) => hit && (hit.owner === scope?.owner || scope?.cross) ? hit : null)
vi.mock("./note-dnd-hit", () => ({ measureZones: () => undefined, clearZones: () => undefined, hitTest: (...args: [unknown, { owner: string, cross: boolean }?]) => hitTest(...args), zoneRect: () => null, registerZone: () => undefined }))

const noteA = { groups: [makeGroup({ id: 1, position: 0, sections: [makeSection({ id: 10, groupID: 1, tasks: [makeTask({ id: 100, sectionID: 10 })] })] })] } as unknown as NoteDataTree
const noteB = {
    groups: [
        makeGroup({ id: 3, position: 0, sections: [makeSection({ id: 30, groupID: 3, tasks: [makeTask({ id: 300, sectionID: 30 })] })] }),
        makeGroup({ id: 4, position: 1, sections: [] }),
    ],
} as unknown as NoteDataTree
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: noteA }) }))
vi.mock("@/contexts/use-color-alpha", () => ({ useColorAlpha: () => ({ header: () => 0.5 }) }))
vi.mock("./NoteDragOverlay", () => ({ NoteDragOverlay: () => null }))
vi.mock("./tasks/note-announcer-store", () => ({ announce: vi.fn() }))
const dropAcross = vi.fn()
const dropTaskInEmptyNote = vi.fn()
/** The tree of the other note (note 2): a test can empty it. */
let remoteTree: NoteDataTree = noteB
vi.mock("./note-dnd-cross", () => ({ useCrossNoteMoves: () => ({ noteId: 1, getTree: (id: number) => id === 2 ? remoteTree : null, dropAcross, dropTaskInEmptyNote }) }))
const moveTaskTo = vi.fn()
vi.mock("./note-dnd-state", async importActual => ({
    ...await importActual<typeof import("./note-dnd-state")>(),
    useNoteMoves: () => ({ moveSectionTo: vi.fn(), moveTaskTo }),
    useGroupMoves: () => ({ moveGroupTo: vi.fn() }),
}))
const startScrollLock = vi.fn()
const lockUpdate = vi.fn()
vi.mock("./note-dnd-autoscroll", async importActual => ({
    ...await importActual<typeof import("./note-dnd-autoscroll")>(),
    startAutoScroll: () => () => undefined,
    startScrollLock: (...args: unknown[]) => { startScrollLock(...args); return { update: lockUpdate, stop: vi.fn() } },
}))

const other = createNoteDndStore()
let forgetOther: (() => void) | undefined

beforeEach(() => {
    modifiers = { ctrl: false, alt: false }
    hit = null
    hitTest.mockClear()
    dropAcross.mockReset()
    dropTaskInEmptyNote.mockReset()
    remoteTree = noteB
    setVeilLiftedPane(null)
    moveTaskTo.mockReset()
    lockUpdate.mockReset()
    startScrollLock.mockReset()
    other.set({ hover: NO_HOVER, incoming: null })
    forgetOther = registerNoteOwner(other.owner, 2, other, { pane: 1 })
})
afterEach(() => { forgetOther?.() })

const rect = { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }
const setup = () => render(<NoteDndProvider>{null}</NoteDndProvider>)
const start = (kind: "task" | "section" | "group", id: number) => act(() => latest.start({ kind, id }, { pointer: { x: 0, y: 0 }, press: { x: 0, y: 0 }, node: null }))
const move = (x = 5, y = 10) => act(() => latest.move({ x, y }))
const end = (mods: Modifiers) => act(async () => { latest.end(mods) })
const overOther = (ref: NoteOverRef) => { hit = { ref, rect, owner: other.owner } }

describe("crossing to the other note", () => {
    it("without Ctrl the zones of the other note are not targets: no hover there, no drop", async () => {
        setup()
        start("task", 100)
        overOther({ kind: "task", id: 300 })
        move()
        expect(hitTest).toHaveBeenLastCalledWith({ x: 5, y: 10 }, { owner: expect.any(String), cross: false })
        expect(other.getState().hover).toBe(NO_HOVER)
        expect(other.getState().incoming).toBeNull()
        await end({ ctrl: false, alt: false })
        expect(dropAcross).not.toHaveBeenCalled()
        expect(moveTaskTo).not.toHaveBeenCalled()
    })

    it("with Ctrl the target is in the other note: it shows the hover and the dragged kind there, and the drop goes to the hook", async () => {
        setup()
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "task", id: 300 })
        move(5, 2)
        expect(hitTest).toHaveBeenLastCalledWith({ x: 5, y: 2 }, { owner: expect.any(String), cross: true })
        expect(other.getState().hover).toMatchObject({ overKey: "task-300", targetSectionId: 30 })
        expect(other.getState().incoming).toEqual({ kind: "task", id: 100 })
        await end({ ctrl: true, alt: false })
        expect(dropAcross).toHaveBeenCalledWith({ kind: "task", id: 100, toNoteId: 2, target: { sectionId: 30, parentTaskId: null, index: 0 }, copy: false })
        expect(moveTaskTo).not.toHaveBeenCalled()
        // Nothing stays in the other note after the drop
        expect(other.getState().hover).toBe(NO_HOVER)
        expect(other.getState().incoming).toBeNull()
    })

    it("Alt at the release makes it a copy", async () => {
        setup()
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "section", id: 30 })
        move()
        await end({ ctrl: true, alt: true })
        expect(dropAcross).toHaveBeenCalledWith(expect.objectContaining({ kind: "task", toNoteId: 2, copy: true }))
    })

    it("releasing Ctrl mid drag takes the other note away again, and a release without Ctrl drops nothing", async () => {
        setup()
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "task", id: 300 })
        move()
        expect(other.getState().hover.overKey).toBe("task-300")
        modifiers = { ctrl: false, alt: false }
        move()
        expect(other.getState().hover).toBe(NO_HOVER)
        expect(other.getState().incoming).toBeNull()
        await end({ ctrl: false, alt: false })
        expect(dropAcross).not.toHaveBeenCalled()
    })

    it("a release with Ctrl up drops nothing even if the last move still had the other note", async () => {
        setup()
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "task", id: 300 })
        move()
        await end({ ctrl: false, alt: false })
        expect(dropAcross).not.toHaveBeenCalled()
    })

    it("locks the scroll of this note while Ctrl is held and another note is open, and unlocks it with Ctrl up", () => {
        setup()
        start("task", 100)
        move()
        expect(lockUpdate).toHaveBeenLastCalledWith(false)
        modifiers = { ctrl: true, alt: false }
        move()
        expect(lockUpdate).toHaveBeenLastCalledWith(true)
        modifiers = { ctrl: false, alt: false }
        move()
        expect(lockUpdate).toHaveBeenLastCalledWith(false)
    })

    it("does not lock anything when there is no other note", () => {
        forgetOther?.()
        forgetOther = undefined
        setup()
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        move()
        expect(lockUpdate).toHaveBeenLastCalledWith(false)
    })

    it("offers a dragged section to the other note while Ctrl is held (its new-group slots appear)", () => {
        setup()
        start("section", 10)
        modifiers = { ctrl: true, alt: false }
        move()
        expect(other.getState().incoming).toEqual({ kind: "section", id: 10 })
        modifiers = { ctrl: false, alt: false }
        move()
        expect(other.getState().incoming).toBeNull()
    })

    it("a section dropped on the slot of a new group of the other note asks for a group in THAT note", async () => {
        setup()
        start("section", 10)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "new-group", id: 1 })
        move()
        await end({ ctrl: true, alt: false })
        expect(dropAcross).toHaveBeenCalledWith({ kind: "section", id: 10, toNoteId: 2, target: { type: "new-group", index: 1 }, copy: false })
    })

    it("a group dropped on a column of the other note goes before it in the left half and after it in the right half", async () => {
        setup()
        start("group", 1)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "group", id: 4 })
        move(10, 10) // left half of a 100 px column
        await end({ ctrl: true, alt: false })
        expect(dropAcross).toHaveBeenLastCalledWith({ kind: "group", id: 1, toNoteId: 2, index: 1, copy: false })
        start("group", 1)
        modifiers = { ctrl: true, alt: false }
        move(90, 10)
        await end({ ctrl: true, alt: false })
        expect(dropAcross).toHaveBeenLastCalledWith({ kind: "group", id: 1, toNoteId: 2, index: 2, copy: false })
    })

    it("over a zone of this note nothing changes: the normal move", async () => {
        setup()
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        hit = { ref: { kind: "section", id: 10 }, rect, owner: "" }
        hitTest.mockImplementationOnce(() => null)
        move()
        await end({ ctrl: true, alt: false })
        expect(dropAcross).not.toHaveBeenCalled()
    })
})

describe("the empty area of an empty other note", () => {
    const emptyNote = { groups: [] } as unknown as NoteDataTree

    it("a group dropped there with Ctrl goes to the hook as the first group", async () => {
        remoteTree = emptyNote
        setup()
        start("group", 1)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "new-group", id: 0 })
        move()
        expect(other.getState().hover).toMatchObject({ overKey: "new-group-0" })
        await end({ ctrl: true, alt: false })
        expect(dropAcross).toHaveBeenCalledWith({ kind: "group", id: 1, toNoteId: 2, index: 0, copy: false })
    })

    it("with Alt it is a copy", async () => {
        remoteTree = emptyNote
        setup()
        start("group", 1)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "new-group", id: 0 })
        move()
        await end({ ctrl: true, alt: true })
        expect(dropAcross).toHaveBeenCalledWith(expect.objectContaining({ kind: "group", index: 0, copy: true }))
    })

    it("a task dropped there asks the hook for a group that holds it", async () => {
        remoteTree = emptyNote
        setup()
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "new-group", id: 0 })
        move()
        await end({ ctrl: true, alt: false })
        expect(dropTaskInEmptyNote).toHaveBeenCalledWith({ id: 100, toNoteId: 2, copy: false })
        expect(dropAcross).not.toHaveBeenCalled()
    })

    it("a section dropped there still creates a group in that note", async () => {
        remoteTree = emptyNote
        setup()
        start("section", 10)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "new-group", id: 0 })
        move()
        await end({ ctrl: true, alt: false })
        expect(dropAcross).toHaveBeenCalledWith(expect.objectContaining({ kind: "section", toNoteId: 2, target: { type: "new-group", index: 0 } }))
    })

    it("a group over the slot of a note that has groups is not a target (the slots take sections only)", async () => {
        setup()
        start("group", 1)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "new-group", id: 0 })
        move()
        expect(other.getState().hover).toBe(NO_HOVER)
        await end({ ctrl: true, alt: false })
        expect(dropAcross).not.toHaveBeenCalled()
    })
})

describe("the veil of the pane the drag is over", () => {
    it("is lifted while Ctrl is held over the other pane, and put back with Ctrl up, on the drop and on a cancel", async () => {
        setup()
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        overOther({ kind: "task", id: 300 })
        move()
        expect(getVeilLiftedPane()).toBe(1)
        modifiers = { ctrl: false, alt: false }
        move()
        expect(getVeilLiftedPane()).toBeNull()
        modifiers = { ctrl: true, alt: false }
        move()
        expect(getVeilLiftedPane()).toBe(1)
        await end({ ctrl: true, alt: false })
        expect(getVeilLiftedPane()).toBeNull()
        start("task", 100)
        move()
        expect(getVeilLiftedPane()).toBe(1)
        act(() => latest.cancel())
        expect(getVeilLiftedPane()).toBeNull()
    })

    it("stays when the pointer is over the other pane's area but on none of its zones", () => {
        setup()
        const forget = registerNoteOwner(other.owner, 2, other, { pane: 1, bounds: () => ({ left: 100, right: 300, top: 0, bottom: 200 }) as DOMRect })
        start("task", 100)
        modifiers = { ctrl: true, alt: false }
        hit = null
        move(150, 50)
        expect(getVeilLiftedPane()).toBe(1)
        move(50, 50)
        expect(getVeilLiftedPane()).toBeNull()
        forget()
    })
})
