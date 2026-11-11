import { describe, expect, it } from "vitest"
import { buildLiveSnapshot, computeLiveShifts, GROUPS_LIST, groupListKey, holdHalfZone, holdHalfZoneX, holdLiveZone, isInColumnGap, isInRowGap, makeShiftFreeMeasure, tabListKey, taskListKey, type LiveNodeInfo, type LivePending } from "./note-dnd-live"

/**
 * A tiny layout engine: a list is an array of rows, a row `[key, height, children?]`. Every row is a wrapper that is as tall as its
 * own line plus its children, the rows are drawn one under the other (like the wrappers of the tasks of a list).
 */
type Row = [key: string, height: number, children?: Row[]]

function layout(lists: { list: string, top: number, rows: Row[] }[]): LiveNodeInfo[] {
    const nodes: LiveNodeInfo[] = []
    const place = (list: string, parent: string | null, top: number, rows: Row[]): number => {
        let y = top
        for (const [key, height, children] of rows) {
            const index = nodes.length
            nodes.push({ key, list, parent, top: y, height })
            const inner = children ? place(`t-${key}`, key, y + height, children) : y + height
            nodes[index].height = inner - y
            y = inner
        }
        return y
    }
    for (const { list, top, rows } of lists) place(list, null, top, rows)
    return nodes
}

const rows = (prefix: string, count: number, height = 10): Row[] => Array.from({ length: count }, (_, i) => [`${prefix}${i}`, height])

const shiftsOf = (nodes: LiveNodeInfo[], dragged: string, pending: LivePending) =>
    Object.fromEntries(computeLiveShifts(buildLiveSnapshot(nodes), dragged, pending))

describe("taskListKey", () => {
    it("tells the top level list of a section from the subtasks of a task", () => {
        expect(taskListKey({ sectionId: 4, parentTaskId: null })).toBe("s-4")
        expect(taskListKey({ sectionId: 4, parentTaskId: 9 })).toBe("t-9")
    })
})

describe("buildLiveSnapshot", () => {
    it("groups the wrappers in lists and knows where the subtree of each one ends", () => {
        const nodes = layout([{ list: "s-1", top: 0, rows: [["a", 10, [["a1", 10], ["a2", 10, [["a2x", 10]]]]], ["b", 10]] }])
        const { items, lists } = buildLiveSnapshot(nodes)
        expect(lists.get("s-1")).toEqual(["a", "b"])
        expect(lists.get("t-a")).toEqual(["a1", "a2"])
        expect(items.get("a")).toMatchObject({ ord: 0, end: 3 })
        expect(items.get("a2")).toMatchObject({ ord: 2, end: 3 })
        expect(items.get("b")).toMatchObject({ ord: 4, end: 4 })
        expect(items.get("a")?.height).toBe(40)
    })

    it("ignores a parent that is not in the snapshot", () => {
        const { items } = buildLiveSnapshot([{ key: "x", list: "t-gone", parent: "gone", top: 0, height: 5 }])
        expect(items.get("x")?.end).toBe(0)
    })
})

describe("computeLiveShifts: same list", () => {
    const nodes = layout([{ list: "s-1", top: 0, rows: rows("t", 5) }]) // t0..t4, 10 each

    it("moving down: the rows between the source and the place go up by the height of the source", () => {
        expect(shiftsOf(nodes, "t0", { over: "t3", zone: "after", list: "s-1" })).toEqual({ t1: -10, t2: -10, t3: -10 })
        expect(shiftsOf(nodes, "t0", { over: "t3", zone: "before", list: "s-1" })).toEqual({ t1: -10, t2: -10 })
        expect(shiftsOf(nodes, "t1", { over: "t4", zone: "after", list: "s-1" })).toEqual({ t2: -10, t3: -10, t4: -10 })
    })

    it("moving up: the rows between the place and the source go down", () => {
        expect(shiftsOf(nodes, "t4", { over: "t1", zone: "before", list: "s-1" })).toEqual({ t1: 10, t2: 10, t3: 10 })
        expect(shiftsOf(nodes, "t4", { over: "t1", zone: "after", list: "s-1" })).toEqual({ t2: 10, t3: 10 })
        expect(shiftsOf(nodes, "t3", { over: "t0", zone: "before", list: "s-1" })).toEqual({ t0: 10, t1: 10, t2: 10 })
    })

    it("a place that leaves the order as it is moves nothing", () => {
        expect(shiftsOf(nodes, "t2", { over: "t3", zone: "before", list: "s-1" })).toEqual({})
        expect(shiftsOf(nodes, "t2", { over: "t1", zone: "after", list: "s-1" })).toEqual({})
    })

    it("uses the height of the source, with the space between the rows", () => {
        const spaced = layout([{ list: "s-1", top: 0, rows: [["a", 20], ["b", 10], ["c", 10]] }])
        // the gap of 4px between the rows is part of the room of "a"
        spaced[1].top = 24
        spaced[2].top = 38
        expect(shiftsOf(spaced, "a", { over: "c", zone: "after", list: "s-1" })).toEqual({ b: -24, c: -24 })
    })

    it("the last row has no next one: its own height counts", () => {
        const list = layout([{ list: "s-1", top: 0, rows: [["a", 10], ["b", 30]] }])
        expect(shiftsOf(list, "b", { over: "a", zone: "before", list: "s-1" })).toEqual({ a: 30 })
    })

    it("a source with open subtasks moves by its whole height", () => {
        const tall = layout([{ list: "s-1", top: 0, rows: [["p", 10, [["p1", 10], ["p2", 10]]], ["x", 10], ["y", 10]] }])
        expect(shiftsOf(tall, "p", { over: "y", zone: "after", list: "s-1" })).toEqual({ x: -30, y: -30 })
    })

    it("follows the order drawn, not the order of the data (hide completed / completed last)", () => {
        // Drawn: d, b, a, c (the data order is a, b, c, d)
        const drawn = layout([{ list: "s-1", top: 0, rows: [["d", 10], ["b", 10], ["a", 10], ["c", 10]] }])
        expect(shiftsOf(drawn, "d", { over: "a", zone: "after", list: "s-1" })).toEqual({ b: -10, a: -10 })
        expect(shiftsOf(drawn, "c", { over: "b", zone: "before", list: "s-1" })).toEqual({ b: 10, a: 10 })
    })

    it("with one task hidden between two drawn ones the place is still relative to the drawn rows", () => {
        const drawn = layout([{ list: "s-1", top: 0, rows: [["a", 10], ["c", 10]] }])
        expect(shiftsOf(drawn, "a", { over: "c", zone: "after", list: "s-1" })).toEqual({ c: -10 })
    })
})

describe("computeLiveShifts: another list", () => {
    const nodes = layout([
        { list: "s-1", top: 0, rows: rows("a", 3) },
        { list: "s-2", top: 200, rows: rows("b", 3, 20) },
    ])

    it("closes the room in the source list and opens it in the destination list", () => {
        expect(shiftsOf(nodes, "a0", { over: "b1", zone: "before", list: "s-2" })).toEqual({ a1: -10, a2: -10, b1: 10, b2: 10 })
        expect(shiftsOf(nodes, "a1", { over: "b0", zone: "after", list: "s-2" })).toEqual({ a2: -10, b1: 10, b2: 10 })
    })

    it("at the end of the destination list only the source list moves", () => {
        expect(shiftsOf(nodes, "a0", { over: "b2", zone: "after", list: "s-2" })).toEqual({ a1: -10, a2: -10 })
    })

    it("the last row of the source list leaves nothing to close", () => {
        expect(shiftsOf(nodes, "a2", { over: "b0", zone: "before", list: "s-2" })).toEqual({ b0: 10, b1: 10, b2: 10 })
    })

    it("works the other way round (the destination is drawn before the source)", () => {
        expect(shiftsOf(nodes, "b1", { over: "a1", zone: "before", list: "s-1" })).toEqual({ a1: 20, a2: 20, b2: -20 })
    })

    it("does not touch a third list", () => {
        const three = layout([
            { list: "s-1", top: 0, rows: rows("a", 2) },
            { list: "s-2", top: 100, rows: rows("b", 2) },
            { list: "s-3", top: 200, rows: rows("c", 2) },
        ])
        expect(shiftsOf(three, "a0", { over: "b0", zone: "before", list: "s-2" })).toEqual({ a1: -10, b0: 10, b1: 10 })
    })
})

describe("computeLiveShifts: subtasks", () => {
    it("a subtask moved inside its list shifts the sibling wrappers only", () => {
        const nodes = layout([{ list: "s-1", top: 0, rows: [["p", 10, rows("c", 3)], ["q", 10]] }])
        expect(shiftsOf(nodes, "c0", { over: "c2", zone: "after", list: "t-p" })).toEqual({ c1: -10, c2: -10 })
    })

    it("a subtask taken out of its parent shrinks the parent: the rows after the parent go up", () => {
        const nodes = layout([{ list: "s-1", top: 0, rows: [["p", 10, rows("c", 2)], ["q", 10], ["r", 10]] }])
        // c0 goes before r: q moves up by the room of c0, r (the place) stays since it is also pushed down by the room it opens
        expect(shiftsOf(nodes, "c0", { over: "r", zone: "before", list: "s-1" })).toEqual({ c1: -10, q: -10 })
    })

    it("a task dropped among the subtasks of a later task: that task closes up and its subtasks open the room", () => {
        const nodes = layout([{ list: "s-1", top: 0, rows: [["a", 10], ["p", 10, rows("c", 2)], ["q", 10]] }])
        // p goes up by 10 as a whole; its subtasks after the place are pushed down 10 relative to it (net 0); q: -10 + 10 = 0
        expect(shiftsOf(nodes, "a", { over: "c0", zone: "after", list: "t-p" })).toEqual({ p: -10, c1: 10 })
    })

    it("a task dropped among the subtasks of an earlier task: the subtasks open, the rows after the parent come down", () => {
        const nodes = layout([{ list: "s-1", top: 0, rows: [["p", 10, rows("c", 2)], ["q", 10], ["z", 10]] }])
        expect(shiftsOf(nodes, "z", { over: "c0", zone: "after", list: "t-p" })).toEqual({ c1: 10, q: 10 })
    })

    it("a source with subtasks moves them with it (they are never listed)", () => {
        const nodes = layout([{ list: "s-1", top: 0, rows: [["p", 10, rows("c", 2)], ["q", 10]] }])
        const result = shiftsOf(nodes, "p", { over: "q", zone: "after", list: "s-1" })
        expect(result).toEqual({ q: -30 })
        expect(result).not.toHaveProperty("c0")
    })

    it("does nothing over one of its own subtasks", () => {
        const nodes = layout([{ list: "s-1", top: 0, rows: [["p", 10, rows("c", 2)], ["q", 10]] }])
        expect(shiftsOf(nodes, "p", { over: "c1", zone: "after", list: "t-p" })).toEqual({})
    })

    it("a subtask moved to another section's subtasks: both parents change length", () => {
        const nodes = layout([
            { list: "s-1", top: 0, rows: [["p", 10, rows("c", 2)], ["q", 10]] },
            { list: "s-2", top: 100, rows: [["u", 10, rows("d", 2)], ["v", 10]] },
        ])
        expect(shiftsOf(nodes, "c0", { over: "d0", zone: "before", list: "t-u" })).toEqual({ c1: -10, q: -10, d0: 10, d1: 10, v: 10 })
    })
})

describe("computeLiveShifts: nothing moves", () => {
    const nodes = layout([{ list: "s-1", top: 0, rows: rows("t", 3) }])

    it("for the inside zones, no zone, or the same row", () => {
        for (const zone of ["inside", "inside-start", null] as const)
            expect(shiftsOf(nodes, "t0", { over: "t2", zone, list: "s-1" })).toEqual({})
        expect(shiftsOf(nodes, "t0", { over: "t0", zone: "after", list: "s-1" })).toEqual({})
    })

    it("for rows that are not in the snapshot", () => {
        expect(shiftsOf(nodes, "gone", { over: "t1", zone: "after", list: "s-1" })).toEqual({})
        expect(shiftsOf(nodes, "t0", { over: "gone", zone: "after", list: "s-1" })).toEqual({})
    })

    it("when the list of the target is not the one of the row it is over", () => {
        expect(shiftsOf(nodes, "t0", { over: "t2", zone: "after", list: "s-9" })).toEqual({})
    })

    it("when the source has no height", () => {
        const flat = layout([{ list: "s-1", top: 0, rows: [["a", 0], ["b", 10]] }])
        expect(shiftsOf(flat, "a", { over: "b", zone: "after", list: "s-1" })).toEqual({})
    })
})

describe("makeShiftFreeMeasure", () => {
    const rect = { top: 100, bottom: 130, left: 5, right: 55, width: 50, height: 30 }
    const element = {} as HTMLElement

    it("takes the shift away from the top and the bottom only", () => {
        const measure = makeShiftFreeMeasure(() => rect, (_, axis) => axis === "y" ? -10 : 0)
        expect(measure(element)).toEqual({ ...rect, top: 110, bottom: 140 })
    })

    it("takes the horizontal shift away from the left and the right side", () => {
        const measure = makeShiftFreeMeasure(() => rect, (_, axis) => axis === "x" ? 20 : 0)
        expect(measure(element)).toEqual({ ...rect, left: -15, right: 35 })
    })

    it("returns the same rect when nothing is shifted", () => {
        const measure = makeShiftFreeMeasure(() => rect, () => 0)
        expect(measure(element)).toBe(rect)
    })

    it("asks the shift of the element it measures", () => {
        const asked: HTMLElement[] = []
        makeShiftFreeMeasure(() => rect, el => { asked.push(el); return 0 })(element)
        expect(asked).toEqual([element, element]) // one per axis
    })
})

describe("holdLiveZone", () => {
    const rect = { top: 100, height: 40 } // borders at y=110 and y=130, margin 1.6 px
    it("takes the real zone for a new task or when nothing changed", () => {
        expect(holdLiveZone(null, "inside", rect, 120)).toBe("inside")
        expect(holdLiveZone("inside", "inside", rect, 120)).toBe("inside")
    })
    it("keeps inside until the pointer is well past the border", () => {
        expect(holdLiveZone("inside", "before", rect, 109)).toBe("inside")
        expect(holdLiveZone("inside", "before", rect, 105)).toBe("before")
        expect(holdLiveZone("inside", "after", rect, 131)).toBe("inside")
        expect(holdLiveZone("inside", "after", rect, 133)).toBe("after")
    })
    it("keeps before / after a few px into the inside zone", () => {
        expect(holdLiveZone("before", "inside", rect, 111)).toBe("before")
        expect(holdLiveZone("before", "inside", rect, 113)).toBe("inside")
        expect(holdLiveZone("after", "inside", rect, 129)).toBe("after")
        expect(holdLiveZone("after", "inside", rect, 127)).toBe("inside")
        expect(holdLiveZone("inside-start", "inside", rect, 129)).toBe("inside-start")
    })
    it("on a 34 px row the preview already follows the real zone at 27 px from the top", () => {
        const row = { top: 0, height: 34 } // lower border at 25.5, margin 1.36
        expect(holdLiveZone("inside", "after", row, 27)).toBe("after")
        expect(holdLiveZone("inside", "after", row, 26)).toBe("inside")
    })
})

describe("groupListKey", () => {
    it("is the list of the sections of a group", () => {
        expect(groupListKey(7)).toBe("g-7")
    })
})

describe("computeLiveShifts: sections", () => {
    // Group 1 has A (40), B (100), C (60); group 2 has X (80), Y (20). 4px between the sections (like the gap of a group)
    const spaced = (list: string, top: number, heights: [string, number][]): LiveNodeInfo[] => {
        let y = top
        return heights.map(([key, height]) => { const node = { key, list, parent: null, top: y, height }; y += height + 4; return node })
    }
    const nodes = [
        ...spaced("g-1", 0, [["A", 40], ["B", 100], ["C", 60]]),
        ...spaced("g-2", 0, [["X", 80], ["Y", 20]]),
    ]
    const at = (over: string | null, zone: "before" | "after" | null, list: string): LivePending => ({ over, zone, list })

    it("same group, going down: the sections it passes go up by its room (height + gap), the others stay", () => {
        expect(shiftsOf(nodes, "A", at("C", "after", "g-1"))).toEqual({ B: -44, C: -44 })
        expect(shiftsOf(nodes, "A", at("C", "before", "g-1"))).toEqual({ B: -44 })
    })

    it("same group, going up: the sections between the place and the source go down", () => {
        expect(shiftsOf(nodes, "C", at("A", "before", "g-1"))).toEqual({ A: 64, B: 64 })
        expect(shiftsOf(nodes, "C", at("A", "after", "g-1"))).toEqual({ B: 64 })
    })

    it("the room is the one of the dragged section even when the others have another height", () => {
        expect(shiftsOf(nodes, "A", at("B", "after", "g-1"))).toEqual({ B: -44 })
        expect(shiftsOf(nodes, "B", at("A", "before", "g-1"))).toEqual({ A: 104 })
    })

    it("a place that leaves the order as it is moves nothing", () => {
        expect(shiftsOf(nodes, "B", at("C", "before", "g-1"))).toEqual({})
        expect(shiftsOf(nodes, "B", at("A", "after", "g-1"))).toEqual({})
    })

    it("another group: closes the room in the source group, opens it in the destination group", () => {
        expect(shiftsOf(nodes, "A", at("Y", "before", "g-2"))).toEqual({ B: -44, C: -44, Y: 44 })
        expect(shiftsOf(nodes, "B", at("X", "before", "g-2"))).toEqual({ C: -104, X: 104, Y: 104 })
    })

    it("the last position of another group opens nothing (no row follows the place)", () => {
        expect(shiftsOf(nodes, "A", at("Y", "after", "g-2"))).toEqual({ B: -44, C: -44 })
        expect(shiftsOf(nodes, "A", at(null, null, "g-2"))).toEqual({ B: -44, C: -44 })
    })

    it("the end of a group: the sections after the source close, the ones before stay", () => {
        expect(shiftsOf(nodes, "A", at(null, null, "g-1"))).toEqual({ B: -44, C: -44 })
        expect(shiftsOf(nodes, "C", at(null, null, "g-1"))).toEqual({})
    })

    it("a group without rows (collapsed or empty) is a place too: only the source group closes", () => {
        expect(shiftsOf(nodes, "B", at(null, null, "g-9"))).toEqual({ C: -104 })
    })

    it("the last section of its group leaves nothing to close", () => {
        expect(shiftsOf(nodes, "Y", at("X", "before", "g-2"))).toEqual({ X: 24 }) // its height plus the gap before it, which closes with it
        expect(shiftsOf(nodes, "C", at("X", "before", "g-2"))).toEqual({ X: 64, Y: 64 })
    })

    it("does not move the tasks of a section: only the wrapper of the section is in the list", () => {
        const withTasks = [...nodes, { key: "t1", list: "s-1", parent: null, top: 10, height: 10 }]
        expect(Object.keys(shiftsOf(withTasks, "A", at("C", "after", "g-1")))).toEqual(["B", "C"])
    })

    it("a place in the wrong list, or under the section itself, moves nothing", () => {
        expect(shiftsOf(nodes, "A", at("Y", "before", "g-1"))).toEqual({})
        expect(shiftsOf(nodes, "A", at("A", "after", "g-1"))).toEqual({})
        expect(shiftsOf(nodes, "A", at("Y", null, "g-2"))).toEqual({})
    })

    it("follows the order drawn: the list of the direct tasks is a row among the sections", () => {
        const drawn = spaced("g-1", 0, [["A", 40], ["list", 50], ["B", 30]])
        expect(shiftsOf(drawn, "A", at("B", "before", "g-1"))).toEqual({ list: -44 })
        expect(shiftsOf(drawn, "B", at("list", "before", "g-1"))).toEqual({ list: 34 })
    })
})

describe("holdHalfZone", () => {
    const rect = { top: 100, height: 100 } // middle at 150, margin 3
    it("follows the real zone when there is nothing before, or it did not change", () => {
        expect(holdHalfZone(null, "after", rect, 140)).toBe("after")
        expect(holdHalfZone("before", "before", rect, 140)).toBe("before")
    })
    it("keeps the side a few px past the middle", () => {
        expect(holdHalfZone("before", "after", rect, 152)).toBe("before")
        expect(holdHalfZone("before", "after", rect, 154)).toBe("after")
        expect(holdHalfZone("after", "before", rect, 148)).toBe("after")
        expect(holdHalfZone("after", "before", rect, 146)).toBe("before")
    })
    it("does not hold a zone that is not a side", () => {
        expect(holdHalfZone("inside", "before", rect, 150)).toBe("before")
    })
})

describe("isInRowGap", () => {
    it("is true a little outside the row, false farther away", () => {
        const row = { top: 100, bottom: 200 }
        expect(isInRowGap(row, 96)).toBe(true)
        expect(isInRowGap(row, 207)).toBe(true)
        expect(isInRowGap(row, 150)).toBe(true)
        expect(isInRowGap(row, 90)).toBe(false)
        expect(isInRowGap(row, 215)).toBe(false)
    })
})

describe("groups (horizontal axis: top = left, height = width)", () => {
    // Three columns 100, 60 and 80 wide with 8px between them: g1 at 0, g2 at 108, g3 at 176
    const groups = () => buildLiveSnapshot(layout([{ list: GROUPS_LIST, top: 0, rows: [] }]).concat([
        { key: "group-1", list: GROUPS_LIST, parent: null, top: 0, height: 100 },
        { key: "group-2", list: GROUPS_LIST, parent: null, top: 108, height: 60 },
        { key: "group-3", list: GROUPS_LIST, parent: null, top: 176, height: 80 },
    ]))
    const pending = (over: string, zone: "before" | "after"): LivePending => ({ over, zone, list: GROUPS_LIST })

    it("moves the columns between the dragged one and the place by its width and the gap", () => {
        const shifts = computeLiveShifts(groups(), "group-1", pending("group-3", "after"))
        expect([...shifts]).toEqual([["group-2", -108], ["group-3", -108]])
    })

    it("opens the room before a column the dragged one jumps over, and closes the one it leaves", () => {
        const shifts = computeLiveShifts(groups(), "group-3", pending("group-1", "before"))
        // The last column has no next one: its width plus the gap before it
        expect([...shifts]).toEqual([["group-1", 88], ["group-2", 88]])
    })

    it("moves nothing for the place it already has", () => {
        expect(computeLiveShifts(groups(), "group-2", pending("group-3", "before")).size).toBe(0)
        expect(computeLiveShifts(groups(), "group-2", pending("group-2", "after")).size).toBe(0)
    })
})

describe("holdHalfZoneX", () => {
    const rect = { left: 100, width: 200 } // middle at x=200, margin 3px
    it("keeps the side until the pointer is past the middle by the margin", () => {
        expect(holdHalfZoneX("before", "after", rect, 202)).toBe("before")
        expect(holdHalfZoneX("before", "after", rect, 204)).toBe("after")
        expect(holdHalfZoneX("after", "before", rect, 198)).toBe("after")
        expect(holdHalfZoneX("after", "before", rect, 196)).toBe("before")
    })
    it("takes the real zone for a new column", () => {
        expect(holdHalfZoneX(null, "after", rect, 201)).toBe("after")
    })
})

describe("isInColumnGap", () => {
    const rect = { left: 100, right: 200, top: 10, bottom: 300 }
    it("holds within the tolerance around the column, on both axes", () => {
        expect(isInColumnGap(rect, { x: 205, y: 100 })).toBe(true)
        expect(isInColumnGap(rect, { x: 95, y: 5 })).toBe(true)
    })
    it("lets go farther away", () => {
        expect(isInColumnGap(rect, { x: 209, y: 100 })).toBe(false)
        expect(isInColumnGap(rect, { x: 150, y: 320 })).toBe(false)
    })
})

describe("computeLiveShifts: tabs (horizontal axis, one list per bar)", () => {
    // Bar 0: a 100 wide, b 140, c 80 (no gap, the lines are inside the tabs); bar 1: x 100, y 120
    const tab = (key: string, list: string, left: number, width: number): LiveNodeInfo => ({ key, list, parent: null, top: left, height: width })
    const bar0 = tabListKey(0)
    const bar1 = tabListKey(1)
    const nodes = [tab("a", bar0, 0, 100), tab("b", bar0, 100, 140), tab("c", bar0, 240, 80), tab("x", bar1, 400, 100), tab("y", bar1, 500, 120)]

    it("a bar is one list: its key is b-<pane>", () => {
        expect(bar0).toBe("b-0")
        expect(bar1).toBe("b-1")
    })

    it("a tab dropped after a later one: the tabs in between move left by its width", () => {
        expect(shiftsOf(nodes, "a", { over: "c", zone: "after", list: bar0 })).toEqual({ b: -100, c: -100 })
    })

    it("a tab dropped before an earlier one: the room is the width of the dragged tab, whatever the others measure", () => {
        expect(shiftsOf(nodes, "b", { over: "a", zone: "before", list: bar0 })).toEqual({ a: 140 })
        expect(shiftsOf(nodes, "c", { over: "a", zone: "before", list: bar0 })).toEqual({ a: 80, b: 80 })
    })

    it("another bar: the tabs after the dragged one close the room, the tabs after the place open it", () => {
        expect(shiftsOf(nodes, "a", { over: "y", zone: "before", list: bar1 })).toEqual({ b: -100, c: -100, y: 100 })
        expect(shiftsOf(nodes, "b", { over: "x", zone: "before", list: bar1 })).toEqual({ c: -140, x: 140, y: 140 })
    })

    it("after the last tab of the other bar: nothing opens there, the source bar closes", () => {
        expect(shiftsOf(nodes, "a", { over: "y", zone: "after", list: bar1 })).toEqual({ b: -100, c: -100 })
        expect(shiftsOf(nodes, "a", { over: null, zone: null, list: bar1 })).toEqual({ b: -100, c: -100 })
    })

    it("over its own place nothing moves", () => {
        expect(shiftsOf(nodes, "b", { over: "a", zone: "after", list: bar0 })).toEqual({})
        expect(shiftsOf(nodes, "b", { over: "c", zone: "before", list: bar0 })).toEqual({})
        expect(shiftsOf(nodes, "b", { over: "b", zone: "before", list: bar0 })).toEqual({})
    })
})
