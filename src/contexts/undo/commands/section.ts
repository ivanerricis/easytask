import { withRollback } from "../../with-rollback"
import type { UndoCommand } from "../stack"
import { makeLabel, type UndoHelpers } from "./helpers"
import type { SectionPlace } from "./types"

/** The commands that move sections and the list of the direct tasks of a group. */
export function sectionCommands(h: UndoHelpers) {
    const { workspace, note, reloadNote, removeItem } = h

    const moveSectionTo = async (sectionId: number, groupId: number, index: number, beforeList?: boolean) => {
        // The flag is only passed when set, so the calls without it stay what they were
        const flag = beforeList ? [true] as const : [] as const
        await withRollback(note.applySectionMove(sectionId, groupId, index, ...flag), () => workspace.moveSection(sectionId, groupId, index, ...flag))
    }

    /** Moves the list of the direct tasks of a group; nothing is written when it already is there. */
    const moveListTo = async (groupId: number, index: number) => {
        const group = note.getNoteTree()?.groups.find(candidate => candidate.id === groupId)
        if (group && (group.defaultIndex ?? 0) === index) return
        await withRollback(note.applyDirectSectionMove(groupId, index), () => workspace.moveDirectSection(groupId, index))
    }

    /** Moves a section back to the place it had, and the list of its group next to it where it was. */
    const putSectionBack = async (sectionId: number, from: SectionPlace) => {
        await moveSectionTo(sectionId, from.groupId, from.index)
        if (from.listIndex !== undefined) await moveListTo(from.groupId, from.listIndex)
    }

    return {
        /** Move of a section into another group (or elsewhere in its group). */
        sectionMove: (sectionId: number, name: string, from: SectionPlace, to: SectionPlace): UndoCommand => ({
            label: makeLabel("move", "section", name),
            undo: () => putSectionBack(sectionId, from),
            redo: () => moveSectionTo(sectionId, to.groupId, to.index, to.beforeList),
        }),

        /** Move of the list of the direct tasks of a group among its sections (`from` and `to` count the sections before the list). */
        directMove: (groupId: number, name: string, from: number, to: number): UndoCommand => ({
            label: makeLabel("moveDirect", "section_group", name),
            undo: () => moveListTo(groupId, from),
            redo: () => moveListTo(groupId, to),
        }),

        /**
         * Move of a section into a group that the move itself created (`newGroupId`): undone by moving the section back
         * and trashing the empty group, redone by restoring the same group and moving the section into it.
         */
        sectionMoveToNewGroup: (sectionId: number, name: string, newGroupId: number, from: SectionPlace): UndoCommand => ({
            label: makeLabel("move", "section", name),
            undo: async () => {
                await putSectionBack(sectionId, from)
                await removeItem("section_group", newGroupId)
            },
            redo: async () => {
                await workspace.restoreItem("section_group", newGroupId)
                await workspace.moveSection(sectionId, newGroupId, 0)
                await reloadNote()
            },
        }),
    }
}
