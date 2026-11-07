import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type { ArchiveItem, ArchiveItemType, Folder, Group, Note, TrashItem, WorkspaceDataTree } from "@/types/types"
import type { CollapsibleKind } from "@/db/queries/collapsed"
import type { DBItemType } from "@/db/queries/shared_queries"
import type { TaskMoveTarget } from "@/db/queries/move"
import type { NoteTemplate } from "@/types/template"
import type { NewTaskPosition } from "@/lib/store/preferences"
import type { LayoutState } from "@/contexts/layout-reducer"

export type WorkspaceStateType = {
    folders: Folder[]
    notes: Note[]
    workspaceDataTree: WorkspaceDataTree | null
    currentFolder: Folder | null
    error: string | null
    /** Id of the workspace whose data is loaded in the context (null while nothing is loaded or a load is pending). */
    loadedWorkspaceId: number | null
}

/** The color a folder or a note had before "Color content" changed it (undefined = no color). */
export type PreviousColor = { itemType: "folder" | "note", id: number, name: string, before: string | undefined }

/** What the workspace data needs from the tabs module. */
export type TabsBridge = {
    /** The layout of the open tabs (both panes) right now. */
    snapshot: () => LayoutState
    /** Reopens the tabs of a snapshot (in their panes) that were closed since. */
    reopen: (snapshot: LayoutState) => void
}

/** Every action has a stable identity (it never changes), so consumers of the actions alone never re-render because of it. */
export type WorkspaceActionsType = {
    setCurrentFolder: (folder: Folder | null) => void

    getWorkspaceData: (workspaceID: number) => Promise<void>
    /** Replaces the workspace tree (and the flat folders/notes derived from it) without reloading (optimistic updates). */
    setWorkspaceDataTree: (tree: WorkspaceDataTree) => void

    /**
     * Tells that the archive changed outside the archive actions (e.g. an automation archived a group): bumps the archive
     * and audio versions (see useWorkspaceVersion), so the archive badge and the audio lists reload.
     */
    notifyArchiveChanged: () => void

    /** The creations of folders and notes resolve with the id of the new row (null when the database did not return it). */
    createWorkspaceFolder: (workspaceID: number, name: string, color?: string) => Promise<number | null>
    createWorkspaceNote: (workspaceID: number, name: string, color?: string) => Promise<number | null>

    createSubFolder: (workspaceID: number, folderID: number, name: string) => Promise<number | null>
    createNoteInFolder: (workspaceID: number, folderID: number, name: string) => Promise<number | null>
    /** The creations of the open note resolve with the ids of the new rows, so the caller can update the UI without reloading. */
    createGroup: (noteID: number, name: string) => Promise<{ groupId: number, defaultSectionId: number }>
    createSection: (noteID: number, title: string, position: number) => Promise<{ groupId: number, defaultSectionId: number, sectionId: number }>
    createSectionInGroup: (groupId: number, title: string) => Promise<number>
    createTask: (sectionID: number, text: string, position?: NewTaskPosition) => Promise<number>
    createSubTask: (taskID: number, text: string, position?: NewTaskPosition) => Promise<number>
    insertTaskAfter: (parent: { sectionId: number } | { parentTaskId: number }, afterTaskId: number | null, text: string) => Promise<{ id: number, index: number }>

    updateTaskPriority: (taskID: number, priority: boolean) => Promise<void>
    updateTaskCompletion: (taskID: number, isCompleted: boolean) => Promise<void>
    updateTaskDescription: (taskID: number, description?: string) => Promise<void>
    renameItem: (itemType: DBItemType, itemId: number, name: string) => Promise<void>
    updateItemColor: (itemType: DBItemType, itemId: number, color?: string) => Promise<void>
    /** Saves the background color of a note (undefined = default) and updates the sidebar tree at once. */
    updateNoteBackground: (noteId: number, color?: string) => Promise<void>
    updateGroupsPositions: (groups: Group[]) => Promise<void>
    /** Saves the width of a group in pixels (null = automatic). Not an undo step; the caller patches the open note first. */
    setGroupWidth: (groupId: number, width: number | null) => Promise<void>
    /** Saves whether a group, a section or a task is closed (a state of the view: not an undo step; the caller patches the open note first). */
    setCollapsed: (kind: CollapsibleKind, id: number, collapsed: boolean) => Promise<void>
    /** Resolves with the previous color of every folder and note it touched (the folder itself first), to undo it. */
    updateFolderColorContent: (folderID: number, color?: string) => Promise<PreviousColor[]>

    moveTreeItem: (itemType: "folder" | "note", itemId: number, targetFolderId: number | null, targetIndex: number) => Promise<void>

    /** `beforeList`: a section moved exactly where the list of the direct tasks is goes right before it, not after it. */
    moveSection: (sectionID: number, targetGroupID: number, targetIndex: number, beforeList?: boolean) => Promise<void>
    /** Resolves with the id of the new group, so the caller can update the note without reloading. */
    moveDirectSection: (groupID: number, index: number) => Promise<void>
    moveSectionToNewGroup: (sectionID: number, groupPosition: number) => Promise<{ groupId: number, defaultSectionId: number }>
    moveTask: (taskID: number, target: TaskMoveTarget, targetIndex: number) => Promise<void>

    deleteItem: (itemType: DBItemType, itemID: number) => Promise<void>
    getTrash: (workspaceID: number) => Promise<TrashItem[]>
    /** The number of items in the trash of a workspace (cheaper than getTrash; does not touch the context state). */
    getTrashCount: (workspaceID: number) => Promise<number>
    restoreItem: (itemType: DBItemType, itemID: number) => Promise<void>
    purgeItem: (itemType: DBItemType, itemID: number) => Promise<void>
    emptyTrash: (workspaceID: number) => Promise<void>

    /**
     * Archives a folder, note, group or section: hidden from the sidebar / the open note without going to the trash. A folder
     * or a note is removed from the tree optimistically; for a group or a section the caller removes it from the open note
     * (`withRollback(removeGroup(id) | removeSection(id) | removeTask(id), () => archiveItem(type, id))`, see note-optimistic).
     */
    archiveItem: (itemType: ArchiveItemType, itemID: number) => Promise<void>
    /** Unarchives an item and its archived ancestors. Does not reload: the caller reloads the tree or the note, like after restoreItem. */
    unarchiveItem: (itemType: ArchiveItemType, itemID: number) => Promise<void>
    getArchive: (workspaceID: number) => Promise<ArchiveItem[]>
    /** The number of archived items of a workspace (cheaper than getArchive; does not touch the context state). */
    getArchiveCount: (workspaceID: number) => Promise<number>
    resetData: () => void

    getTemplates: (workspaceID: number) => Promise<NoteTemplate[]>
    countTemplates: (workspaceID: number) => Promise<number>
    createTemplateFromNote: (noteID: number, name: string) => Promise<number>
    /** Refreshes the snapshot of a template from its source note, or from another note of the workspace (which becomes the source). */
    updateTemplateFromNote: (templateID: number, noteID?: number) => Promise<void>
    /** Duplicates a template; resolves with the ID of the copy. */
    duplicateTemplate: (templateID: number) => Promise<number>
    createNoteFromTemplate: (templateID: number, workspaceID: number, folderID: number | null, name: string, color?: string | null) => Promise<number>

    /** Copies a note (same folder, right after it, content included) and refreshes the sidebar tree. Resolves with the id of the copy. */
    duplicateNote: (noteID: number) => Promise<number>
    /** Copies a section with its tasks (same group, right after it). The caller refreshes the open note. Resolves with the id of the copy. */
    duplicateSection: (sectionID: number) => Promise<number>
}

/**
 * What the domain modules share (built by the provider): the operation wrappers and the state they need.
 * @category WorkspaceData Context
 */
export type Runtime = {
    /** Bridge to the tabs (filled by the TabsProvider, null outside it): used to reopen the tabs closed by a failed delete. */
    tabsBridge: MutableRefObject<TabsBridge | null>
    /** Runs an async operation and keeps isLoading true while any operation is in flight. */
    withLoading: <T>(operation: () => Promise<T>) => Promise<T>
    /** Runs an operation that can change the trash content and bumps the trash (and archive) version once it succeeds. */
    withTrashChange: <T>(operation: () => Promise<T>) => Promise<T>
    /** Runs an operation that can change the archive content and bumps the archive version once it succeeds. */
    withArchiveChange: <T>(operation: () => Promise<T>) => Promise<T>
    /** Bumps the audio version (call it once an operation that can change the visible audio files has succeeded). */
    bumpAudioVersion: () => void
    /** Bumps the templates version (call it once an operation that can change the templates has succeeded). */
    bumpTemplates: () => void
    /**
     * Bumps what a succeeded delete, restore or purge of an item of this type changes: the templates for a template, the audio
     * for the types that carry audio files (`forceAudio`: for every type, e.g. a restored section can bring back its group).
     */
    afterItemChange: (itemType: DBItemType, forceAudio?: boolean) => void
    /** Reloads the tree without waiting for it; a failure is reported, not thrown. */
    reloadTreeInBackground: (workspaceId: number) => void
    setCurrentFolder: Dispatch<SetStateAction<Folder | null>>
    getWorkspaceData: WorkspaceActionsType["getWorkspaceData"]
    /** The current workspace tree (null before the first load). */
    getTree: () => WorkspaceDataTree | null
    /**
     * Optimistically changes the workspace tree.
     * @param forward Returns the changed tree (the same one when there is nothing to do).
     * @param inverse Undoes the change on the latest tree; without it the previous tree is restored (or, when the
     * tree changed again meanwhile, reloaded in background).
     * @returns The rollback, or null when nothing was applied.
     */
    applyTree: (
        forward: (tree: WorkspaceDataTree) => WorkspaceDataTree,
        inverse?: (tree: WorkspaceDataTree) => WorkspaceDataTree,
    ) => (() => void) | null
}
