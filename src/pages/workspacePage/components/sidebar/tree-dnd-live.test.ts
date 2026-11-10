import { describe, expect, it } from "vitest"
import type { Folder, Note } from "@/types/types"
import { flattenTree } from "./flat-tree"
import { computeDropTarget, type DropTarget, type DropZone, type TreeData, type TreeRef } from "./tree-dnd"
import {
    computeTreeShifts, holdTreeZone, indexRows, insertionIndex, isShiftingZone, rowsWithoutSource, sourceRange, toLiveRows,
    type LiveTreeRow,
} from "./tree-dnd-live"

const note = (id: number, folderID: number | null): Note => ({ id, name: `n${id}`, folderID }) as unknown as Note
const folder = (id: number, folderID: number | null, subfolders: Folder[] = [], notes: Note[] = []): Folder =>
    ({ id, name: `f${id}`, folderID, subfolders, notes }) as unknown as Folder

/** folder-1 { folder-2 { note-20 }, note-10 }, folder-3 {}, note-100 */
const tree: TreeData = {
    rootFolders: [folder(1, null, [folder(2, 1, [], [note(20, 2)])], [note(10, 1)]), folder(3, null)],
    rootNotes: [note(100, null)],
}
const rowsOf = (data: TreeData, collapsed: number[] = []) => toLiveRows(flattenTree(data, new Set(collapsed)))
const RS = 32

describe("sourceRange", () => {
    it("is the row alone for a note and a closed folder, the subtree for an open folder", () => {
        const rows = rowsOf(tree)
        expect(sourceRange(rows, "note-10")).toEqual({ start: 3, end: 3 })
        expect(sourceRange(rows, "folder-1")).toEqual({ start: 0, end: 3 })
        expect(sourceRange(rowsOf(tree, [1]), "folder-1")).toEqual({ start: 0, end: 0 })
        expect(sourceRange(rows, "note-999")).toBeNull()
    })
})

describe("insertionIndex", () => {
    const rest = (without: string) => {
        const rows = rowsOf(tree)
        return rowsWithoutSource(rows, sourceRange(rows, without)!)
    }

    it("puts a note before the n-th note of the folder, or at the end of its block", () => {
        // rest without note-100: f1, f2, n20, n10, f3
        expect(insertionIndex(rest("note-100"), "note", { folderId: 1, index: 0 })).toBe(3)
        expect(insertionIndex(rest("note-100"), "note", { folderId: 1, index: 1 })).toBe(4)
        expect(insertionIndex(rest("note-100"), "note", { folderId: 2, index: 0 })).toBe(2)
        expect(insertionIndex(rest("note-100"), "note", { folderId: null, index: 0 })).toBe(5)
    })

    it("puts a folder before the n-th folder, or after the last one (before the notes)", () => {
        // rest without folder-3: f1, f2, n20, n10, n100
        expect(insertionIndex(rest("folder-3"), "folder", { folderId: null, index: 0 })).toBe(0)
        expect(insertionIndex(rest("folder-3"), "folder", { folderId: null, index: 1 })).toBe(4)
        expect(insertionIndex(rest("folder-3"), "folder", { folderId: 1, index: 0 })).toBe(1)
        expect(insertionIndex(rest("folder-3"), "folder", { folderId: 1, index: 1 })).toBe(3)
    })

    it("tells nothing for a folder that is not among the rows", () => {
        expect(insertionIndex(rest("note-100"), "note", { folderId: 99, index: 0 })).toBeNull()
    })
})

describe("computeTreeShifts", () => {
    it("moves nothing when the place is where the item already is", () => {
        const rows = rowsOf(tree)
        expect(computeTreeShifts(rows, indexRows(rows), "note-10", 3, RS)).toBeNull()
        expect(computeTreeShifts(rows, indexRows(rows), "note-nope", 1, RS)).toBeNull()
    })

    it("closes the room of the source and opens the one of the place", () => {
        const rows = rowsOf(tree) // f1, f2, n20, n10, f3, n100
        const shifts = computeTreeShifts(rows, indexRows(rows), "folder-3", 1, RS)!
        // folder-3 goes right after folder-1: the rows between its place and its old place step down by its room
        expect(rows.map(row => shifts.dyOf(row.key))).toEqual([0, RS, RS, RS, 0, 0])
        expect(shifts.isHidden("folder-3")).toBe(true)
        expect(shifts.isHidden("folder-2")).toBe(false)
    })

    it("a dragged open folder takes its subtree with it: the room is as tall as all its rows, and they are hidden", () => {
        const rows = rowsOf(tree)
        const shifts = computeTreeShifts(rows, indexRows(rows), "folder-1", 2, RS)! // the end (rest: f3, n100)
        expect(rows.map(row => shifts.dyOf(row.key))).toEqual([0, 0, 0, 0, -4 * RS, -4 * RS])
        expect(["folder-1", "folder-2", "note-20", "note-10"].every(key => shifts.isHidden(key))).toBe(true)
        expect(shifts.isHidden("folder-3")).toBe(false)
    })

    it("a key that is not in the list does not move", () => {
        const rows = rowsOf(tree)
        const shifts = computeTreeShifts(rows, indexRows(rows), "folder-3", 1, RS)!
        expect(shifts.dyOf("note-404")).toBe(0)
        expect(shifts.isHidden("note-404")).toBe(false)
    })
})

describe("isShiftingZone", () => {
    it("opens a room for before, after and the first place of an open folder, not for inside", () => {
        expect(["before", "after", "inside-start"].every(zone => isShiftingZone(zone as DropZone))).toBe(true)
        expect(isShiftingZone("inside")).toBe(false)
        expect(isShiftingZone(null)).toBe(false)
    })
})

describe("holdTreeZone", () => {
    const rect = { top: 100, height: 28 }
    it("a note keeps its half within the margin of the middle", () => {
        expect(holdTreeZone("note", "before", "after", rect, 114.5)).toBe("before")
        expect(holdTreeZone("note", "before", "after", rect, 120)).toBe("after")
        expect(holdTreeZone("note", null, "after", rect, 114.5)).toBe("after")
    })
    it("a folder keeps its zone within the margin of the borders (25% / 75%)", () => {
        expect(holdTreeZone("folder", "before", "inside", rect, 107.5)).toBe("before")
        expect(holdTreeZone("folder", "before", "inside", rect, 112)).toBe("inside")
        expect(holdTreeZone("folder", "inside", "after", rect, 121.5)).toBe("inside")
    })
})

// -- Every drop the user can make: the rows shown at the end of the drag are the ones of the tree after the move ------------------

/** A small deterministic generator (mulberry32). */
const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const makeTree = (seed: number): TreeData => {
    const next = random(seed)
    let id = 0
    const build = (parent: number | null, depth: number): { folders: Folder[], notes: Note[] } => {
        const folders: Folder[] = []
        const notes: Note[] = []
        const folderCount = depth >= 3 ? 0 : Math.floor(next() * 3)
        for (let i = 0; i < folderCount; i++) {
            const fid = ++id
            const inner = build(fid, depth + 1)
            folders.push(folder(fid, parent, inner.folders, inner.notes))
        }
        for (let i = Math.floor(next() * 3); i > 0; i--) notes.push(note(++id, parent))
        return { folders, notes }
    }
    const root = build(null, 0)
    return { rootFolders: root.folders, rootNotes: root.notes }
}

/** The tree after the move of `ref` to `target` (the semantics of moveTreeItem: the index is among the siblings of the same type). */
const applyMove = (data: TreeData, ref: TreeRef, target: DropTarget): TreeData => {
    let moved: Folder | Note | null = null
    const strip = <T extends Folder | Note>(items: T[], type: TreeRef["type"]): T[] =>
        items.filter(item => {
            if (type === ref.type && item.id === ref.id) { moved = item; return false }
            return true
        })
    const walk = (folders: Folder[]): Folder[] => folders.map(f => ({ ...f, subfolders: walk(strip(f.subfolders, "folder")), notes: strip(f.notes, "note") }))
    const stripped: TreeData = { rootFolders: walk(strip(data.rootFolders, "folder")), rootNotes: strip(data.rootNotes, "note") }
    const insert = <T,>(items: T[], item: T): T[] => [...items.slice(0, target.index), item, ...items.slice(target.index)]
    const into = (folders: Folder[]): Folder[] => folders.map(f => f.id === target.folderId
        ? { ...f, subfolders: ref.type === "folder" ? insert(f.subfolders, moved as unknown as Folder) : f.subfolders, notes: ref.type === "note" ? insert(f.notes, moved as unknown as Note) : f.notes }
        : { ...f, subfolders: into(f.subfolders) })
    if (target.folderId === null) {
        return ref.type === "folder"
            ? { ...stripped, rootFolders: insert(stripped.rootFolders, moved as unknown as Folder) }
            : { ...stripped, rootNotes: insert(stripped.rootNotes, moved as unknown as Note) }
    }
    return { ...stripped, rootFolders: into(stripped.rootFolders) }
}

describe("the room shown is the one of the real move", () => {
    const zonesFor = (row: LiveTreeRow, rows: LiveTreeRow[], index: number): DropZone[] => {
        if (row.kind === "note") return ["before", "after"]
        const hasChildren = rows[index + 1]?.depth > row.depth
        return hasChildren ? ["before", "inside-start", "after"] : ["before", "after"]
    }

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        it(`seed ${seed}: every row ends where the moved tree draws it`, () => {
            const data = makeTree(seed)
            const collapsedPool = [...listFolderIds(data)]
            const next = random(seed * 101)
            const collapsed = new Set(collapsedPool.filter(() => next() < 0.3))
            const flat = flattenTree(data, collapsed)
            const rows = toLiveRows(flat)
            const index = indexRows(rows)
            let checked = 0
            for (const source of rows) {
                const range = sourceRange(rows, source.key)!
                const rest = rowsWithoutSource(rows, range)
                const sourceRef: TreeRef = { type: source.kind, id: source.id }
                const overs: (TreeRef | null)[] = [null, ...rows.map(row => ({ type: row.kind, id: row.id }))]
                overs.forEach((over, k) => {
                    const row = k === 0 ? null : rows[k - 1]
                    const zones: DropZone[] = row ? zonesFor(row, rows, k - 1) : ["inside"]
                    for (const zone of zones) {
                        const target = computeDropTarget(data, sourceRef, over, zone)
                        if (!target) continue
                        const place = insertionIndex(rest, source.kind, target)
                        expect(place, `${source.key} over ${row?.key} ${zone}`).not.toBeNull()
                        const shifts = computeTreeShifts(rows, index, source.key, place!, RS)
                        const after = flattenTree(applyMove(data, sourceRef, target), collapsed)
                        const afterIndex = new Map(after.map((r, i) => [r.key, i]))
                        // The dragged item lands at the place, the rows it takes with it follow
                        expect(afterIndex.get(source.key), `${source.key} over ${row?.key} ${zone}`).toBe(place)
                        rows.forEach((r, i) => {
                            if (i >= range.start && i <= range.end) return
                            const visual = i * RS + (shifts?.dyOf(r.key) ?? 0)
                            expect(visual, `${r.key} when ${source.key} goes over ${row?.key} ${zone}`).toBe(afterIndex.get(r.key)! * RS)
                        })
                        checked++
                    }
                })
            }
            if (rows.length > 1) expect(checked).toBeGreaterThan(0)
        })
    }
})

function listFolderIds(data: TreeData): number[] {
    const ids: number[] = []
    const walk = (folders: Folder[]) => folders.forEach(f => { ids.push(f.id); walk(f.subfolders) })
    walk(data.rootFolders)
    return ids
}
