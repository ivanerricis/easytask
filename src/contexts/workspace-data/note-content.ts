import { useCallback, useMemo } from "react"
import type { Group } from "@/types/types"
import type { TaskOrder } from "@/lib/task-order"
import { createDBSection, createDBSectionInGroup } from "@/db/queries/section"
import { createDBGroup, updateDBGroupPositions, updateDBGroupWidth } from "@/db/queries/group"
import { moveDBDirectSection, moveDBSection, moveDBSectionToNewGroup } from "@/db/queries/move"
import { setDBSectionTaskOrder } from "@/db/queries/section"
import { setDBCollapsed, type CollapsibleKind } from "@/db/queries/collapsed"
import { duplicateDBSection } from "@/db/queries/duplicate"
import type { Runtime, WorkspaceActionsType } from "./types"

type NoteContentActions = Pick<WorkspaceActionsType,
    "createGroup" | "createSection" | "createSectionInGroup" | "updateGroupsPositions" | "setGroupWidth" | "setCollapsed" | "setSectionTaskOrder" | "moveSection" | "moveDirectSection" | "moveSectionToNewGroup" | "duplicateSection">

/**
 * Groups and sections of the open note. The creations resolve with the ids of the new rows (the callers build
 * the optimistic data with the active note actions), the moves do not reload anything.
 * @category WorkspaceData Context
 */
export function useNoteContentActions({ withLoading }: Runtime): NoteContentActions {
    const createGroup = useCallback((noteID: number, name: string) =>
        withLoading(() => createDBGroup(noteID, name)), [withLoading])

    const createSection = useCallback((noteID: number, title: string, position: number) =>
        withLoading(() => createDBSection(noteID, title, position)), [withLoading])

    const createSectionInGroup = useCallback((groupID: number, title: string) =>
        withLoading(() => createDBSectionInGroup(groupID, title)), [withLoading])

    /**
     * Update the positions of multiple groups in the workspace.
     * @param newGroups - The array of groups to update positions for.
     * @throws Will throw an error if the group positions cannot be updated.
     * @category Workspace Data Context
     */
    const updateGroupsPositions = useCallback((newGroups: Group[]) =>
        withLoading(() => updateDBGroupPositions(newGroups)), [withLoading])

    /**
     * Saves the width of a group (not an undo step, like the sidebar width). The caller applies it to the open note
     * first: `withRollback(patchGroup(id, { width }), () => setGroupWidth(id, width))`.
     * @param groupID - The ID of the group.
     * @param width - The width in pixels, or null for the automatic width.
     * @throws Will throw an error if the width cannot be saved (or is not greater than zero).
     * @category Workspace Data Context
     */
    const setGroupWidth = useCallback((groupID: number, width: number | null) =>
        withLoading(() => updateDBGroupWidth(groupID, width)), [withLoading])

    /**
     * Saves whether a group, a section or a task is closed (a state of the view, not an undo step). The caller applies it to
     * the open note first: `withRollback(patchGroup(id, { collapsed }), () => setCollapsed("group", id, collapsed))`.
     * @throws Will throw an error if the state cannot be saved.
     * @category Workspace Data Context
     */
    const setCollapsed = useCallback((kind: CollapsibleKind, id: number, collapsed: boolean) =>
        withLoading(() => setDBCollapsed(kind, id, collapsed)), [withLoading])

    /**
     * Saves how the tasks of a section are ordered on screen (a state of the view, not an undo step). The caller applies it to
     * the open note first: `withRollback(patchSection(id, { task_order }), () => setSectionTaskOrder(id, order))`.
     * @throws Will throw an error if the order cannot be saved.
     * @category Workspace Data Context
     */
    const setSectionTaskOrder = useCallback((sectionID: number, order: TaskOrder | null) =>
        withLoading(() => setDBSectionTaskOrder(sectionID, order)), [withLoading])

    /**
     * Moves a section to a group of the open note at the given index among its sections. The section keeps all
     * its tasks. A source group left empty is kept. It does NOT reload the data: the caller updates the active note.
     * @param sectionID - The ID of the section to move.
     * @param targetGroupID - The destination group ID (same note).
     * @param targetIndex - The index among the destination sections (clamped).
     * @param beforeList - A section moved exactly where the list of the direct tasks is goes right before it.
     * @throws Will throw an error if the move is invalid or the destination already has a section with the same title.
     * @category Workspace Data Context
     */
    const moveSection = useCallback((sectionID: number, targetGroupID: number, targetIndex: number, beforeList?: boolean) =>
        withLoading(() => moveDBSection(sectionID, targetGroupID, targetIndex, ...(beforeList ? [{ beforeList }] as const : [] as const))), [withLoading])

    /**
     * Moves the list of the direct tasks of a group among the sections of the group. It does NOT reload the data: the caller
     * updates the active note.
     * @param groupID - The ID of the group.
     * @param index - The number of sections that stay before the list (clamped; the number of sections or more = at the end).
     * @category Workspace Data Context
     */
    const moveDirectSection = useCallback((groupID: number, index: number) =>
        withLoading(() => moveDBDirectSection(groupID, index)), [withLoading])

    /**
     * Moves a section into a new group created at the given index among the groups of the open note.
     * It does NOT reload the data: the caller updates the active note with the returned group id.
     * @param sectionID - The ID of the section to move.
     * @param groupPosition - The index of the new group among the current groups (clamped).
     * @returns The IDs of the new group and of its default section.
     * @category Workspace Data Context
     */
    const moveSectionToNewGroup = useCallback((sectionID: number, groupPosition: number) =>
        withLoading(() => moveDBSectionToNewGroup(sectionID, groupPosition)), [withLoading])

    /**
     * Duplicates a section with its tasks, right after the original in its group. It does NOT reload the data:
     * the caller refreshes the active note.
     * @param sectionID - The ID of the section to duplicate.
     * @returns The ID of the copy.
     * @throws Will throw an error if the section no longer exists or the copy cannot be written.
     * @category Workspace Data Context
     */
    const duplicateSection = useCallback((sectionID: number) =>
        withLoading(() => duplicateDBSection(sectionID)), [withLoading])

    return useMemo(() => ({ createGroup, createSection, createSectionInGroup, updateGroupsPositions, setGroupWidth, setCollapsed, setSectionTaskOrder, moveSection, moveDirectSection, moveSectionToNewGroup, duplicateSection }), [ createGroup, createSection, createSectionInGroup, updateGroupsPositions, setGroupWidth, setCollapsed, setSectionTaskOrder, moveSection, moveDirectSection, moveSectionToNewGroup, duplicateSection ])
}
