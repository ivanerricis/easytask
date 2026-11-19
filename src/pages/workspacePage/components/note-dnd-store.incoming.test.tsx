import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NO_HOVER, NoteDndStoreContext, createNoteDndStore, useNoteDrop } from "./note-dnd-state"
import { clearZones, hitTest, measureZones } from "./note-dnd-hit"

/** What the other note of the split view tells this one while a drag with Ctrl is over it: the dragged kind and the target. */
describe("a drag that comes from the other note", () => {
    afterEach(() => { clearZones(); document.body.innerHTML = "" })

    it("wakes the droppables that depend on the dragged kind, and the ones of the hover only when it is theirs", () => {
        const store = createNoteDndStore()
        const wrapper = ({ children }: { children: ReactNode }) => <NoteDndStoreContext.Provider value={store}>{children}</NoteDndStoreContext.Provider>
        const slot = renderHook(() => useNoteDrop("new-group", 2), { wrapper })
        expect(slot.result.current.active).toBeNull()
        act(() => store.set({ incoming: { kind: "section", id: 10 } }))
        expect(slot.result.current.active).toEqual({ kind: "section" })
        act(() => store.set({ hover: { overKey: "new-group-2", zone: "inside" } }))
        expect(slot.result.current.zone).toBe("inside")
        act(() => store.set({ incoming: null, hover: NO_HOVER }))
        expect(slot.result.current.active).toBeNull()
        expect(slot.result.current.zone).toBeNull()
    })

    it("a task row does not depend on the dragged kind (it is never woken by it)", () => {
        const store = createNoteDndStore()
        const listener = vi.fn()
        store.subscribeActive(listener)
        store.set({ remote: true })
        expect(listener).not.toHaveBeenCalled()
        store.set({ incoming: { kind: "task", id: 1 } })
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it("registers its droppables under its owner, so the hit test can tell the notes apart", () => {
        const store = createNoteDndStore()
        const other = createNoteDndStore()
        const wrapperOf = (value: typeof store) => ({ children }: { children: ReactNode }) => <NoteDndStoreContext.Provider value={value}>{children}</NoteDndStoreContext.Provider>
        const a = renderHook(() => useNoteDrop("new-group", 0), { wrapper: wrapperOf(store) })
        const b = renderHook(() => useNoteDrop("new-group", 0), { wrapper: wrapperOf(other) })
        const nodeA = document.createElement("div")
        const nodeB = document.createElement("div")
        nodeA.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 }) as DOMRect
        nodeB.getBoundingClientRect = () => ({ left: 20, top: 0, width: 10, height: 10, right: 30, bottom: 10 }) as DOMRect
        document.body.append(nodeA, nodeB)
        a.result.current.setNodeRef(nodeA)
        b.result.current.setNodeRef(nodeB)
        measureZones("section")
        expect(hitTest({ x: 5, y: 5 }, { owner: store.owner, cross: true })?.owner).toBe(store.owner)
        expect(hitTest({ x: 25, y: 5 }, { owner: store.owner, cross: true })?.owner).toBe(other.owner)
        a.result.current.setNodeRef(null)
        b.result.current.setNodeRef(null)
    })
})
