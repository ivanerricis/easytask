import type { DBItemType } from "@/db/queries/shared_queries"
import type { WorkspaceActionsType } from "../../workspace-data"
import type { ActiveNoteActionsType } from "../../active-note-context-object"
import type { TreeItemType } from "../../workspace-tree-ops"

/**
 * What the commands need from the rest of the app. Everything is stable (the actions never change identity), so a
 * command stays valid after the component that recorded it has unmounted.
 * @category Undo
 */
export type UndoDeps = {
    /** The workspace the history belongs to (null outside a workspace). */
    getWorkspaceId: () => number | null
    workspace: Pick<WorkspaceActionsType,
        "renameItem" | "updateItemColor" | "updateNoteBackground" | "updateNoteBackgroundImage" | "deleteItem" | "restoreItem" | "archiveItem" | "unarchiveItem" | "moveTreeItem" | "moveSection" | "moveDirectSection" | "moveTask" |
        "updateTaskCompletion" | "updateTaskPriority" | "updateTaskDue" | "setTaskFiles" | "updateTaskDescription" | "updateFolderColorContent" | "getWorkspaceData" |
        "renameTag" | "updateTagColor" | "updateTagShape" | "deleteTag" | "restoreTag" | "setTaskTag" | "setGroupTag" | "setSectionTag">
    note: Pick<ActiveNoteActionsType,
        "patchTask" | "patchSection" | "patchGroup" | "removeGroup" | "removeSection" | "removeTask" |
        "applySectionMove" | "applyDirectSectionMove" | "applyTaskMove" | "refreshActiveNote" | "getNoteTree">
}

/** The types of item whose actions are undoable (folders and notes live in the sidebar tree, the others in the open note). */
export type UndoItemType = "folder" | "note" | "section_group" | "section" | "task"

const UNDOABLE: readonly DBItemType[] = ["folder", "note", "section_group", "section", "task"]

/** Whether the actions on this type of item can be undone. */
export const isUndoableType = (itemType: DBItemType): itemType is UndoItemType => UNDOABLE.includes(itemType)

/**
 * The types whose move to the trash can be undone: the undoable ones plus the audio, image and video files of a group.
 * (Their rename and color stay outside the history: files are only removed and brought back.)
 */
export type UndoRemoveType = UndoItemType | "audio_file" | "media_file"

/** Whether the removal (move to the trash) of this type of item can be undone. */
export const isUndoableRemoveType = (itemType: DBItemType): itemType is UndoRemoveType =>
    isUndoableType(itemType) || itemType === "audio_file" || itemType === "media_file"

export const isTreeType = (itemType: UndoRemoveType): itemType is TreeItemType => itemType === "folder" || itemType === "note"

/** Where a folder or a note sits: the parent folder (null = workspace root) and the index among its siblings of the same type. */
export type TreePlace = { folderId: number | null, index: number }
/** One item of a multi-selection action, with its name for the label. */
export type TreeItemRef = { itemType: TreeItemType, id: number, name: string | null | undefined }
/** One item of a multi-selection action on folders, notes or tasks (a task action reloads the open note, not the tree). */
export type ManyItemRef = { itemType: TreeItemType | "task", id: number, name: string | null | undefined }
/** One color change of a multi-selection action. */
export type ColorChange = ManyItemRef & { before: string | null | undefined, after: string | null | undefined }
/** One step of a multi move of tasks: the task and where it is before / after the step. */
export type TaskMoveStep = { id: number, name: string, from: TaskPlace, to: TaskPlace }
/** One step of a multi move: the item and where it is before / after the step. */
export type TreeMoveStep = { itemType: TreeItemType, id: number, name: string, from: TreePlace, to: TreePlace }
/**
 * Where a section sits in the open note. `listIndex` is the place of the list of the direct tasks of that group when the place was
 * captured (how many sections come before it): a section index alone cannot tell on which side of the list the section was,
 * so undoing a move puts the list back too.
 */
export type SectionPlace = { groupId: number, index: number, listIndex?: number, beforeList?: boolean }
/** Where a task sits in the open note: a section (top level, parentTaskId null; also the default section of a group) or under another task. */
export type TaskPlace = { sectionId: number, parentTaskId: number | null, index: number }
