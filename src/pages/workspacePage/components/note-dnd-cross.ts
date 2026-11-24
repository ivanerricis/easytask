import { useCallback } from "react"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { useWorkspaceActions, useWorkspaceTags } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { useAutomations } from "@/hooks/use-automations"
import { captureSectionPlace, captureTaskPlace, makeLabel } from "@/contexts/undo/commands"
import type { UndoCommand } from "@/contexts/undo/stack"
import { findGroup, findSection, findTask } from "@/contexts/note-tree-ops"
import { moveGroupAcross, moveSectionAcross, moveSectionToNewGroupAcross, moveTaskAcross, type TreePair } from "@/contexts/cross-note-ops"
import {
    copyDBGroupToNote, copyDBSectionToNote, copyDBTasksToNote, moveDBGroupToNote, moveDBSectionToNewGroupOfNote, moveDBSectionToNote, moveDBTaskToNote,
} from "@/db/queries/cross-note"
import { moveDBDirectSection } from "@/db/queries/move"
import { createDBGroup } from "@/db/queries/group"
import { snapshotTasks } from "@/lib/task-clipboard"
import { getGroupLabel } from "./groups/group-label"
import { getSectionLabel } from "./section/section-label"
import type { NoteDataTree } from "@/types/types"
import type { SectionTarget, TaskTarget } from "./note-dnd"

/**
 * Drops of the drag that crosses to the other note of the split view (Ctrl held): a move or, with Alt at the release, a copy.
 * A move updates the cached data of both notes at once and puts it back if the write fails; it is ONE step of the undo history.
 * A copy is written first (the ids of the new rows are only known then) and the destination note is read again; its undo trashes
 * the copies and its redo brings them back.
 * @category Note DnD
 */

/** What is dropped and where, in the note that receives it. */
export type CrossDrop =
    | { kind: "task", id: number, toNoteId: number, target: TaskTarget, copy: boolean, createdGroupId?: number }
    | { kind: "section", id: number, toNoteId: number, target: SectionTarget, copy: boolean }
    | { kind: "group", id: number, toNoteId: number, index: number, copy: boolean }

type Ids = { fromNoteId: number, toNoteId: number }

/** A move, in the form both the drop and its undo/redo run. */
type MoveOp =
    | (Ids & { kind: "task", id: number, to: TaskTarget, name: string, createdGroupId?: number })
    | (Ids & { kind: "section", id: number, to: SectionTarget, name: string })
    | (Ids & { kind: "group", id: number, index: number, name: string })

/** The cached trees of the two notes (the same one twice when they are the same note). */
type Trees = { from: NoteDataTree | null, to: NoteDataTree | null }

export function useCrossNoteMoves() {
    const noteId = useActiveNoteId()
    const { getCachedNoteTree, setNoteDataTree, getNoteData } = useActiveNoteActions()
    const { deleteItem, restoreItem } = useWorkspaceActions()
    const tags = useWorkspaceTags()
    const recorder = useUndoRecorder()
    const { dispatch, sync } = useAutomations()

    const treesOf = useCallback((ids: Ids): Trees => ({ from: getCachedNoteTree(ids.fromNoteId), to: getCachedNoteTree(ids.toNoteId) }), [getCachedNoteTree])

    /** Writes both trees back to the cache (one tree when the two notes are the same). */
    const commit = useCallback((ids: Ids, pair: TreePair) => {
        if (ids.fromNoteId === ids.toNoteId) { setNoteDataTree(pair.to, ids.toNoteId); return }
        setNoteDataTree(pair.from, ids.fromNoteId)
        setNoteDataTree(pair.to, ids.toNoteId)
    }, [setNoteDataTree])

    const reload = useCallback(async (ids: Ids) => {
        const reloads = ids.fromNoteId === ids.toNoteId ? [ids.toNoteId] : [ids.fromNoteId, ids.toNoteId]
        await Promise.all(reloads.map(id => getNoteData(id).catch(error => reportError(error))))
    }, [getNoteData])

    /** The new trees of an optimistic move (null when it cannot be applied). A new group needs the ids the write returns. */
    const optimistic = useCallback((op: MoveOp, trees: Trees, created?: { groupId: number, defaultSectionId: number }): TreePair | null => {
        if (!trees.from || !trees.to) return null
        const same = op.fromNoteId === op.toNoteId
        if (op.kind === "task") return moveTaskAcross(trees.from, trees.to, op.id, op.to, op.to.index, same)
        if (op.kind === "group") return moveGroupAcross(trees.from, trees.to, op.id, op.toNoteId, op.index, same)
        if (op.to.type === "group") return moveSectionAcross(trees.from, trees.to, op.id, op.to.groupId, op.to.index, op.to.beforeList, same)
        return created ? moveSectionToNewGroupAcross(trees.from, trees.to, op.id, op.toNoteId, created.groupId, created.defaultSectionId, op.to.index, same) : null
    }, [])

    /** The write of a move. Returns the group created for a section moved into a new group. */
    const write = useCallback(async (op: MoveOp): Promise<{ groupId: number, defaultSectionId: number } | undefined> => {
        if (op.kind === "task") await moveDBTaskToNote(op.id, { sectionId: op.to.sectionId, parentTaskId: op.to.parentTaskId }, op.to.index)
        else if (op.kind === "group") await moveDBGroupToNote(op.id, op.toNoteId, op.index)
        else if (op.to.type === "group") await moveDBSectionToNote(op.id, op.to.groupId, op.to.index, { beforeList: op.to.beforeList })
        else return moveDBSectionToNewGroupOfNote(op.id, op.toNoteId, op.to.index)
        return undefined
    }, [])

    /** Moves again with the cache read from the database: what undo and redo do (the same write, then both notes are reloaded). */
    const replay = useCallback(async (op: MoveOp) => {
        try {
            await write(op)
        } finally {
            await reload(op)
        }
    }, [write, reload])

    /** The place a moved item came from, as the op that puts it back (null when it cannot be told). */
    const reverseOf = useCallback((op: MoveOp, trees: Trees): MoveOp | null => {
        const back: Ids = { fromNoteId: op.toNoteId, toNoteId: op.fromNoteId }
        if (!trees.from) return null
        if (op.kind === "task") {
            const place = captureTaskPlace(trees.from, op.id)
            return place ? { ...back, kind: "task", id: op.id, name: op.name, to: { sectionId: place.sectionId, parentTaskId: place.parentTaskId, index: place.index } } : null
        }
        if (op.kind === "group") {
            const sorted = [...trees.from.groups].sort((a, b) => a.position - b.position)
            const at = sorted.findIndex(group => group.id === op.id)
            return at < 0 ? null : { ...back, kind: "group", id: op.id, name: op.name, index: at }
        }
        const place = captureSectionPlace(trees.from, op.id)
        return place ? { ...back, kind: "section", id: op.id, name: op.name, to: { type: "group", groupId: place.groupId, index: place.index } } : null
    }, [])

    /** Trashes a group made for a drop that failed, and reads the note again. */
    const discardGroup = useCallback(async (groupId: number, noteId: number) => {
        try {
            await deleteItem("section_group", groupId)
        } catch (error) {
            reportError(error, getErrorMessage(error))
        }
        await getNoteData(noteId).catch(error => reportError(error))
    }, [deleteItem, getNoteData])

    const move = useCallback((op: MoveOp) => recorder.track((async () => {
        const trees = treesOf(op)
        const back = reverseOf(op, trees)
        const fromSection = op.kind === "section" ? captureSectionPlace(trees.from, op.id) : null
        const first = op.kind === "section" && op.to.type === "new-group" ? null : optimistic(op, trees)
        if (op.kind !== "section" || op.to.type !== "new-group") {
            if (!first) {
                if (op.kind === "task" && op.createdGroupId !== undefined) await discardGroup(op.createdGroupId, op.toNoteId)
                return
            }
            commit(op, first)
        }
        try {
            const created = await write(op)
            // A new group exists only once the write returned its id
            if (op.kind === "section" && op.to.type === "new-group") {
                const pair = optimistic(op, treesOf(op), created)
                if (pair) commit(op, pair)
                else await reload(op)
            }
            // The state rules of a note that does not have the focus are not synced by the focused note's effect
            void sync(op.fromNoteId)
            if (op.toNoteId !== op.fromNoteId) void sync(op.toNoteId)
            if (!back) return
            const groupId = created?.groupId
            const holderId = op.kind === "task" ? op.createdGroupId : undefined
            const itemType = op.kind === "group" ? "section_group" : op.kind
            const command: UndoCommand = {
                label: makeLabel("move", itemType, op.name),
                undo: async () => {
                    await replay(back)
                    // The group that was made to hold the task goes away with the move
                    if (holderId !== undefined) {
                        await deleteItem("section_group", holderId)
                        await reload(op)
                    }
                    // The list of direct tasks that stood next to the section goes back where it was, and the group the move created goes away
                    if (fromSection?.listIndex !== undefined && back.kind === "section" && back.to.type === "group") {
                        await moveDBDirectSection(back.to.groupId, fromSection.listIndex).catch(error => reportError(error, getErrorMessage(error)))
                        await reload(back)
                    }
                    if (groupId !== undefined) {
                        await deleteItem("section_group", groupId)
                        await reload(op)
                    }
                },
                redo: async () => {
                    if (holderId !== undefined) {
                        await restoreItem("section_group", holderId)
                        await replay(op)
                        return
                    }
                    if (groupId !== undefined) {
                        await restoreItem("section_group", groupId)
                        await replay({ ...op, to: { type: "group", groupId, index: 0 } } as MoveOp)
                        return
                    }
                    await replay(op)
                },
            }
            recorder.record(command)
            if (op.kind === "task" && trees.from) {
                const place = captureTaskPlace(trees.from, op.id)
                if (place && place.sectionId !== op.to.sectionId) void dispatch({ type: "task.moved", taskId: op.id, fromSectionId: place.sectionId }, op.toNoteId)
            }
        } catch (error) {
            // Both notes go back to what they were before the drop
            if (trees.from && trees.to) commit(op, { from: trees.from, to: trees.to })
            reportError(error, getErrorMessage(error))
            // The group made to hold the task does not stay empty behind
            if (op.kind === "task" && op.createdGroupId !== undefined) await discardGroup(op.createdGroupId, op.toNoteId)
        }
    })()), [recorder, treesOf, reverseOf, optimistic, commit, write, reload, replay, deleteItem, restoreItem, dispatch, sync, discardGroup])

    const copy = useCallback((drop: CrossDrop, fromNoteId: number) => recorder.track((async () => {
        const ids: Ids = { fromNoteId, toNoteId: drop.toNoteId }
        const source = getCachedNoteTree(fromNoteId)
        if (!source) return
        try {
            let undoIds: { itemType: "task" | "section" | "section_group", id: number }[]
            let name: string | undefined
            if (drop.kind === "task") {
                const task = findTask(source, drop.id)?.task
                if (!task) return
                name = task.text
                const created = await copyDBTasksToNote(snapshotTasks([task], tags), { sectionId: drop.target.sectionId, parentTaskId: drop.target.parentTaskId }, drop.target.index)
                // A copy in a group made for it is undone by trashing the group (it takes the copy with it)
                undoIds = drop.createdGroupId !== undefined ? [{ itemType: "section_group", id: drop.createdGroupId }] : created.map(id => ({ itemType: "task", id }))
            } else if (drop.kind === "section") {
                const section = findSection(source, drop.id)?.section
                if (!section) return
                name = getSectionLabel(section)
                const created = await copyDBSectionToNote(drop.id, drop.target.type === "group"
                    ? { type: "group", groupId: drop.target.groupId, index: drop.target.index, beforeList: drop.target.beforeList }
                    : { type: "new-group", noteId: drop.toNoteId, index: drop.target.index })
                // A copy in a new group is undone by trashing the group (it takes the copy with it)
                undoIds = [created.groupId !== undefined ? { itemType: "section_group", id: created.groupId } : { itemType: "section", id: created.sectionId }]
            } else {
                const found = findGroup(source, drop.id)
                if (!found) return
                const sorted = [...source.groups].sort((a, b) => a.position - b.position)
                name = getGroupLabel(found.group, sorted.findIndex(group => group.id === drop.id))
                undoIds = [{ itemType: "section_group", id: await copyDBGroupToNote(drop.id, drop.toNoteId, drop.index) }]
            }
            await reload(ids)
            void sync(drop.toNoteId)
            const first = undoIds[0]
            if (!first) return
            recorder.record({
                label: makeLabel("copy", first.itemType, name),
                undo: async () => {
                    try { for (const item of undoIds) await deleteItem(item.itemType, item.id) } finally { await reload(ids) }
                },
                redo: async () => {
                    try { for (const item of undoIds) await restoreItem(item.itemType, item.id) } finally { await reload(ids) }
                },
            })
        } catch (error) {
            reportError(error, getErrorMessage(error))
            if (drop.kind === "task" && drop.createdGroupId !== undefined) await discardGroup(drop.createdGroupId, drop.toNoteId)
        }
    })()), [recorder, getCachedNoteTree, tags, reload, deleteItem, restoreItem, sync, discardGroup])

    /** Drops the item dragged from the note this provider belongs to (`noteId`) on the other note: a move, or a copy (Alt). */
    const dropAcross = useCallback(async (drop: CrossDrop) => {
        if (noteId === null) return
        if (drop.copy) { await copy(drop, noteId); return }
        const trees = treesOf({ fromNoteId: noteId, toNoteId: drop.toNoteId })
        const base = { fromNoteId: noteId, toNoteId: drop.toNoteId }
        if (drop.kind === "task") {
            await move({ ...base, kind: "task", id: drop.id, to: drop.target, createdGroupId: drop.createdGroupId, name: (trees.from && findTask(trees.from, drop.id)?.task.text) ?? "" })
        } else if (drop.kind === "section") {
            const section = trees.from ? findSection(trees.from, drop.id)?.section : undefined
            await move({ ...base, kind: "section", id: drop.id, to: drop.target, name: section ? getSectionLabel(section) : "" })
        } else {
            const sorted = trees.from ? [...trees.from.groups].sort((a, b) => a.position - b.position) : []
            const at = sorted.findIndex(group => group.id === drop.id)
            await move({ ...base, kind: "group", id: drop.id, index: drop.index, name: at >= 0 ? getGroupLabel(sorted[at], at) : "" })
        }
    }, [noteId, copy, move, treesOf])

    /**
     * Drops a task of this note on the empty area of an empty note: a group is created there (with its default section), the note is
     * read again so both notes know it, and the task goes in as its first one (a move or, with Alt, a copy). The group is part of the
     * same undo step (undo trashes it, redo brings it back) and is trashed again if the drop fails.
     */
    const dropTaskInEmptyNote = useCallback((drop: { id: number, toNoteId: number, copy: boolean }) => recorder.track((async () => {
        let created: { groupId: number, defaultSectionId: number }
        try {
            created = await createDBGroup(drop.toNoteId, "")
            await getNoteData(drop.toNoteId)
        } catch (error) {
            reportError(error, getErrorMessage(error))
            return
        }
        await dropAcross({
            kind: "task", id: drop.id, toNoteId: drop.toNoteId, copy: drop.copy, createdGroupId: created.groupId,
            target: { sectionId: created.defaultSectionId, parentTaskId: null, index: 0 },
        })
    })()), [recorder, getNoteData, dropAcross])

    return { noteId, getTree: getCachedNoteTree, dropAcross, dropTaskInEmptyNote }
}
