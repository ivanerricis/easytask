import { describe, expect, it, vi } from "vitest"
import type { NoteDataTree } from "@/types/types"
import { makeGroup, makeSection } from "@/test/ui-fixtures"
import { patchTagOnSections, sectionTagCoverage } from "./task-tags"

const tree = (): NoteDataTree => ({ groups: [makeGroup({ sections: [makeSection({ id: 1 }), makeSection({ id: 2, tagIDs: [7, 8] })] })] })

describe("tags of the sections in the cached note", () => {
    const access = (current: NoteDataTree) => {
        const rollback = vi.fn()
        return { rollback, note: { getNoteTree: () => current, patchTask: vi.fn(() => rollback), patchGroup: vi.fn(() => rollback), patchSection: vi.fn(() => rollback) } }
    }

    it("gives the tag only to the sections that lack it and reports them", () => {
        const { note, rollback } = access(tree())
        const result = patchTagOnSections(note, 7, [1, 2, 99], true)
        expect(result.changed).toEqual([1])
        expect(note.patchSection).toHaveBeenCalledTimes(1)
        expect(note.patchSection).toHaveBeenCalledWith(1, { tagIDs: [7] })
        result.rollback()
        expect(rollback).toHaveBeenCalledTimes(1)
    })

    it("takes the tag away from the sections that have it", () => {
        const { note } = access(tree())
        expect(patchTagOnSections(note, 7, [1, 2], false).changed).toEqual([2])
        expect(note.patchSection).toHaveBeenCalledWith(2, { tagIDs: [8] })
    })

    it("does nothing without a note", () => {
        const { note } = access(tree())
        expect(patchTagOnSections({ ...note, getNoteTree: () => null }, 7, [1], true).changed).toEqual([])
    })

    it("counts how many of the sections found have a tag", () => {
        expect(sectionTagCoverage(tree(), [1, 2, 99], 7)).toEqual({ with: 1, total: 2 })
        expect(sectionTagCoverage(null, [1], 7)).toEqual({ with: 0, total: 0 })
    })
})
