import type { Folder, Note, NoteKind, WorkspaceDataTree } from "@/types/types"
import { insertAt, localTimestamp, nextPosition } from "./note-tree-ops"

/**
 * Pure immutable operations on the workspace tree (sidebar), used for the optimistic updates.
 * Every operation returns a new tree (only the touched path is copied) or the SAME tree when there is nothing to do.
 * @category WorkspaceData Context
 */

export type TreeItemType = "folder" | "note"
type FolderPatch = Partial<Omit<Folder, "subfolders" | "notes">>
type NotePatch = Partial<Omit<Note, "groups">>

/** Location of an item: the parent folder (null = workspace root) and the index among its siblings of the same type. */
type TreeLocation = { item: Folder | Note, parentId: number | null, index: number }

/** Applies a change to the folder with the given id (at any depth); the same array when it is not found. */
function mapFolder(folders: Folder[], folderId: number, change: (folder: Folder) => Folder): Folder[] {
    let changed = false
    const next = folders.map(folder => {
        if (folder.id === folderId) {
            changed = true
            return change(folder)
        }
        const subfolders = mapFolder(folder.subfolders, folderId, change)
        if (subfolders === folder.subfolders) return folder
        changed = true
        return { ...folder, subfolders }
    })
    return changed ? next : folders
}

/* ------------------------------------------------------------------------------------ */
// Builders (defaults of the database columns)

/** A new empty folder appended after `siblings`. */
export function buildFolder(id: number, workspaceId: number, parentId: number | null, name: string, color: string | undefined, siblings: readonly Folder[]): Folder {
    const { date, time } = localTimestamp()
    return {
        id, workspaceID: workspaceId, folderID: parentId, name, position: nextPosition(siblings),
        creation_date: date, creation_time: time, edit_date: date, edit_time: time,
        deleted_at: null, color, subfolders: [], notes: [],
    }
}

/** A new empty note appended after `siblings`. */
export function buildNote(id: number, workspaceId: number, parentId: number | null, name: string, color: string | undefined, siblings: readonly Note[], kind: NoteKind = "note"): Note {
    const { date, time } = localTimestamp()
    return {
        id, workspaceID: workspaceId, folderID: parentId, name, position: nextPosition(siblings),
        creation_date: date, creation_time: time, edit_date: date, edit_time: time,
        deleted_at: null, color, ...(kind === "page" ? { kind } : {}), groups: [],
    }
}

/* ------------------------------------------------------------------------------------ */
// Lookups

/** Finds a folder or a note with its parent and its index among the siblings of the same type. */
export function findTreeItem(tree: WorkspaceDataTree, type: TreeItemType, id: number): TreeLocation | undefined {
    const search = (folders: Folder[], notes: Note[], parentId: number | null): TreeLocation | undefined => {
        const list: { id: number }[] = type === "note" ? notes : folders
        const index = list.findIndex(entry => entry.id === id)
        if (index >= 0) return { item: list[index] as Folder | Note, parentId, index }
        for (const folder of folders) {
            const found = search(folder.subfolders, folder.notes, folder.id)
            if (found) return found
        }
        return undefined
    }
    return search(tree.rootFolders, tree.rootNotes, null)
}

/** The folders that are siblings of a new folder (the children of `parentId`, null = workspace root). */
export function getSubfolders(tree: WorkspaceDataTree, parentId: number | null): Folder[] {
    if (parentId === null) return tree.rootFolders
    return (findTreeItem(tree, "folder", parentId)?.item as Folder | undefined)?.subfolders ?? []
}

/** The notes that are siblings of a new note (the notes of `parentId`, null = workspace root). */
export function getFolderNotes(tree: WorkspaceDataTree, parentId: number | null): Note[] {
    if (parentId === null) return tree.rootNotes
    return (findTreeItem(tree, "folder", parentId)?.item as Folder | undefined)?.notes ?? []
}

/** All the folders and notes of the tree, flattened (parents before their children). */
export function flattenTree(tree: WorkspaceDataTree): { folders: Folder[], notes: Note[] } {
    const folders: Folder[] = []
    const notes: Note[] = [...tree.rootNotes]
    const visit = (list: Folder[]) => {
        for (const folder of list) {
            folders.push(folder)
            notes.push(...folder.notes)
            visit(folder.subfolders)
        }
    }
    visit(tree.rootFolders)
    return { folders, notes }
}

/* ------------------------------------------------------------------------------------ */
// Operations

/** Merges a patch into a folder. */
export function patchFolder(tree: WorkspaceDataTree, id: number, patch: FolderPatch): WorkspaceDataTree {
    const rootFolders = mapFolder(tree.rootFolders, id, folder => ({ ...folder, ...patch }))
    return rootFolders === tree.rootFolders ? tree : { ...tree, rootFolders }
}

/** Merges a patch into a note. */
export function patchNote(tree: WorkspaceDataTree, id: number, patch: NotePatch): WorkspaceDataTree {
    const location = findTreeItem(tree, "note", id)
    if (!location) return tree
    const change = (notes: Note[]) => notes.map(note => note.id === id ? { ...note, ...patch } : note)
    if (location.parentId === null) return { ...tree, rootNotes: change(tree.rootNotes) }
    return { ...tree, rootFolders: mapFolder(tree.rootFolders, location.parentId, folder => ({ ...folder, notes: change(folder.notes) })) }
}

/** Merges a patch into a folder or a note. */
export function patchTreeItem(tree: WorkspaceDataTree, type: TreeItemType, id: number, patch: FolderPatch | NotePatch): WorkspaceDataTree {
    return type === "folder" ? patchFolder(tree, id, patch as FolderPatch) : patchNote(tree, id, patch as NotePatch)
}

/**
 * Inserts a folder or a note in a folder (`parentId`, null = workspace root) at `index` (default: the end).
 * The item must have its `folderID` set to `parentId`. Same tree when the parent folder does not exist or the item is already there.
 */
export function insertTreeItem(tree: WorkspaceDataTree, type: TreeItemType, item: Folder | Note, parentId: number | null, index?: number): WorkspaceDataTree {
    if (findTreeItem(tree, type, item.id)) return tree
    if (parentId === null)
        return type === "folder"
            ? { ...tree, rootFolders: insertAt(tree.rootFolders, item as Folder, index) }
            : { ...tree, rootNotes: insertAt(tree.rootNotes, item as Note, index) }
    const rootFolders = mapFolder(tree.rootFolders, parentId, folder => type === "folder"
        ? { ...folder, subfolders: insertAt(folder.subfolders, item as Folder, index) }
        : { ...folder, notes: insertAt(folder.notes, item as Note, index) })
    return rootFolders === tree.rootFolders ? tree : { ...tree, rootFolders }
}

/** Removes a folder (with its content) or a note. */
export function removeTreeItem(tree: WorkspaceDataTree, type: TreeItemType, id: number): WorkspaceDataTree {
    const location = findTreeItem(tree, type, id)
    if (!location) return tree
    const keep = <T extends { id: number }>(list: T[]) => list.filter(entry => entry.id !== id)
    if (location.parentId === null)
        return type === "folder" ? { ...tree, rootFolders: keep(tree.rootFolders) } : { ...tree, rootNotes: keep(tree.rootNotes) }
    return {
        ...tree,
        rootFolders: mapFolder(tree.rootFolders, location.parentId, folder => type === "folder"
            ? { ...folder, subfolders: keep(folder.subfolders) }
            : { ...folder, notes: keep(folder.notes) }),
    }
}

/** Sets the color of a folder, of all its subfolders and of the notes they contain ("Colora contenuto"). */
export function colorFolderContent(tree: WorkspaceDataTree, folderId: number, color: string | undefined): WorkspaceDataTree {
    const paint = (folder: Folder): Folder => ({
        ...folder,
        color,
        subfolders: folder.subfolders.map(paint),
        notes: folder.notes.map(note => ({ ...note, color })),
    })
    const rootFolders = mapFolder(tree.rootFolders, folderId, paint)
    return rootFolders === tree.rootFolders ? tree : { ...tree, rootFolders }
}
