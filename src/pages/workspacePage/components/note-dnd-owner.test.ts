// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearZones, hitTest, measureZones, registerZone } from "./note-dnd-hit"
import { ACCEPTS } from "./note-dnd"
import type { NoteOverKind } from "./note-dnd"
import { clearShifts, hasShifts, applyShifts, readLiveSnapshot, registerShiftNode, shiftNodesOf, SHIFT_ATTR } from "./note-dnd-shift"
import { getNoteOwner, newOwnerId, otherOwners, ownerKey, ownerOfKey, registerNoteOwner, stripOwner } from "./note-dnd-owner"
import { createNoteDndStore } from "./note-dnd-state"

/**
 * The two notes of a split view share the registries of the drag. What each one registers carries the id of its drag provider, so the
 * "new group" slots (same index in both notes), or the same note open in both panes, never overwrite each other, and Ctrl decides
 * whether the zones of the other note count for a hit.
 */

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", undefined)
    vi.stubGlobal("requestAnimationFrame", () => 1)
    vi.stubGlobal("cancelAnimationFrame", () => undefined)
})

const registered: { key: string, owner: string }[] = []

const zone = (owner: string, kind: NoteOverKind, id: number, box: { left: number, top: number, width: number, height: number }) => {
    const node = document.createElement("div")
    node.getBoundingClientRect = () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top }) as DOMRect
    document.body.appendChild(node)
    registerZone(`${kind}-${id}`, kind, id, ACCEPTS[kind], node, owner)
    registered.push({ key: `${kind}-${id}`, owner })
    return node
}

afterEach(() => {
    for (const { key, owner } of registered.splice(0)) registerZone(key, "task", 0, [], null, owner)
    clearZones()
    clearShifts(false)
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
})

describe("keys of the owners", () => {
    it("prefixes a key with its owner, and leaves it alone without one", () => {
        expect(ownerKey("n3", "task-5")).toBe("n3~task-5")
        expect(ownerKey("", "task-5")).toBe("task-5")
        expect(stripOwner("n3~task-5")).toBe("task-5")
        expect(stripOwner("task-5")).toBe("task-5")
        expect(ownerOfKey("n3~task-5")).toBe("n3")
        expect(ownerOfKey("task-5")).toBe("")
    })

    it("gives every drag provider its own id", () => {
        expect(newOwnerId()).not.toBe(newOwnerId())
        expect(createNoteDndStore().owner).not.toBe(createNoteDndStore().owner)
    })

    it("knows the note and the store of every registered owner, and the others", () => {
        const a = createNoteDndStore()
        const b = createNoteDndStore()
        const forgetA = registerNoteOwner(a.owner, 1, a)
        const forgetB = registerNoteOwner(b.owner, 2, b)
        expect(getNoteOwner(a.owner)?.noteId).toBe(1)
        expect(otherOwners(a.owner).map(info => info.noteId)).toEqual([2])
        forgetB()
        expect(getNoteOwner(b.owner)).toBeUndefined()
        expect(otherOwners(a.owner)).toEqual([])
        forgetA()
    })

    it("an old registration cannot forget a newer one of the same owner", () => {
        const store = createNoteDndStore()
        const forgetOld = registerNoteOwner(store.owner, 1, store)
        const forgetNew = registerNoteOwner(store.owner, 2, store)
        forgetOld()
        expect(getNoteOwner(store.owner)?.noteId).toBe(2)
        forgetNew()
    })
})

describe("drop zones of two notes", () => {
    it("the slots of a new group with the same index do not collide, and unmounting one does not remove the other", () => {
        zone("a", "new-group", 0, { left: 0, top: 0, width: 50, height: 50 })
        zone("b", "new-group", 0, { left: 100, top: 0, width: 50, height: 50 })
        measureZones("section")
        expect(hitTest({ x: 10, y: 10 })?.owner).toBe("a")
        expect(hitTest({ x: 110, y: 10 }, { owner: "a", cross: true })?.owner).toBe("b")
        registerZone("new-group-0", "new-group", 0, ACCEPTS["new-group"], null, "a")
        measureZones("section")
        expect(hitTest({ x: 110, y: 10 }, { owner: "a", cross: true })?.owner).toBe("b")
        expect(hitTest({ x: 10, y: 10 })).toBeNull()
    })

    it("without Ctrl only the zones of the note the drag started in count", () => {
        zone("a", "task", 1, { left: 0, top: 0, width: 100, height: 20 })
        zone("b", "task", 2, { left: 200, top: 0, width: 100, height: 20 })
        measureZones("task")
        const without = { owner: "a", cross: false }
        expect(hitTest({ x: 50, y: 10 }, without)?.ref).toEqual({ kind: "task", id: 1 })
        expect(hitTest({ x: 250, y: 10 }, without)).toBeNull()
    })

    it("with Ctrl the zones of the other note count and say which note they belong to", () => {
        zone("a", "task", 1, { left: 0, top: 0, width: 100, height: 20 })
        zone("b", "task", 2, { left: 200, top: 0, width: 100, height: 20 })
        measureZones("task")
        const hit = hitTest({ x: 250, y: 10 }, { owner: "a", cross: true })
        expect(hit?.ref).toEqual({ kind: "task", id: 2 })
        expect(hit?.owner).toBe("b")
        expect(hitTest({ x: 50, y: 10 }, { owner: "a", cross: true })?.owner).toBe("a")
    })

    it("releasing Ctrl makes the zones of the other note invalid again, with no new measure", () => {
        zone("b", "section", 9, { left: 200, top: 0, width: 100, height: 100 })
        measureZones("task")
        expect(hitTest({ x: 250, y: 50 }, { owner: "a", cross: true })?.ref).toEqual({ kind: "section", id: 9 })
        expect(hitTest({ x: 250, y: 50 }, { owner: "a", cross: false })).toBeNull()
    })

    it("a zone of the other note that is smaller still beats a bigger one of this note under it", () => {
        zone("a", "group", 1, { left: 0, top: 0, width: 500, height: 500 })
        zone("b", "task", 2, { left: 10, top: 10, width: 100, height: 20 })
        measureZones("task")
        expect(hitTest({ x: 20, y: 20 }, { owner: "a", cross: true })?.owner).toBe("b")
        expect(hitTest({ x: 20, y: 20 }, { owner: "a", cross: false })?.owner).toBe("a")
    })
})

describe("wrappers of two notes", () => {
    const wrapper = (id: number, parent: HTMLElement | null = null) => {
        const node = document.createElement("div")
        node.setAttribute(SHIFT_ATTR.task, String(id))
        node.setAttribute(SHIFT_ATTR.section, "10")
        node.getBoundingClientRect = () => ({ top: id * 20, height: 20, left: 0, width: 100 }) as DOMRect
        ;(parent ?? document.body).appendChild(node)
        return node
    }

    it("closing one pane of the same note leaves the wrappers of the other registered", () => {
        const left = wrapper(1)
        const right = wrapper(1)
        registerShiftNode("task-1", left, "a")
        registerShiftNode("task-1", right, "b")
        expect(shiftNodesOf("task")).toHaveLength(2)
        registerShiftNode("task-1", null, "a")
        expect(shiftNodesOf("task")).toEqual([right])
        registerShiftNode("task-1", null, "b")
        expect(shiftNodesOf("task")).toEqual([])
    })

    it("the snapshot keys the rows, their lists and parents by owner, so the same ids in two panes stay apart", () => {
        const left = wrapper(1)
        const leftChild = wrapper(2, left)
        const right = wrapper(1)
        registerShiftNode("task-1", left, "a")
        registerShiftNode("task-2", leftChild, "a")
        registerShiftNode("task-1", right, "b")
        const snapshot = readLiveSnapshot("task")
        expect([...snapshot.items.keys()].sort()).toEqual(["a~task-1", "a~task-2", "b~task-1"])
        expect(snapshot.items.get("a~task-2")?.parent).toBe("a~task-1")
        expect(snapshot.items.get("a~task-2")?.list).toBe("a~t-1")
        expect(snapshot.items.get("b~task-1")?.list).toBe("b~s-10")
        registerShiftNode("task-1", null, "a")
        registerShiftNode("task-2", null, "a")
        registerShiftNode("task-1", null, "b")
    })

    it("shifts the wrapper of the owner it is asked for, not the same key of the other pane", () => {
        const left = wrapper(1)
        const right = wrapper(1)
        registerShiftNode("task-1", left, "a")
        registerShiftNode("task-1", right, "b")
        applyShifts(new Map([["b~task-1", 20]]))
        expect(hasShifts()).toBe(true)
        registerShiftNode("task-1", null, "a")
        registerShiftNode("task-1", null, "b")
    })
})
