import { useCallback, useMemo } from "react"
import { countDBTemplates, createDBNoteFromTemplate, createDBTemplateFromNote, getDBTemplates, updateDBTemplateFromNote } from "@/db/queries/template"
import { duplicateDBTemplate } from "@/db/queries/duplicate"
import { buildNote, getFolderNotes, insertTreeItem, removeTreeItem } from "../workspace-tree-ops"
import type { Runtime, WorkspaceActionsType } from "./types"

type TemplateActions = Pick<WorkspaceActionsType,
    "getTemplates" | "countTemplates" | "createTemplateFromNote" | "updateTemplateFromNote" | "duplicateTemplate" | "createNoteFromTemplate">

/**
 * Note templates. Every write bumps the templates version.
 * @category WorkspaceData Context
 */
export function useTemplateActions({ withLoading, bumpTemplates, applyTree, getWorkspaceData, reloadTags }: Runtime): TemplateActions {
    /**
     * Retrieves the templates of a workspace. Does not touch the context state.
     * @param workspaceID - The ID of the workspace.
     * @category Workspace Data Context
     */
    const getTemplates = useCallback((workspaceID: number) =>
        withLoading(() => getDBTemplates(workspaceID)), [withLoading])

    /**
     * Counts the templates of a workspace (for the footer badge).
     * @param workspaceID - The ID of the workspace.
     * @category Workspace Data Context
     */
    const countTemplates = useCallback((workspaceID: number) =>
        withLoading(() => countDBTemplates(workspaceID)), [withLoading])

    /**
     * Creates a template from a note (an exact snapshot of its current content).
     * @param noteID - The ID of the source note.
     * @param name - The template name (unique in the workspace).
     * @returns The ID of the new template.
     * @throws Will throw an error on a name clash or when the note no longer exists.
     * @category Workspace Data Context
     */
    const createTemplateFromNote = useCallback((noteID: number, name: string) => withLoading(async () => {
        const id = await createDBTemplateFromNote(noteID, name)
        bumpTemplates()
        return id
    }), [withLoading, bumpTemplates])

    /**
     * Refreshes the snapshot of a template from its source note, or from another note of the workspace (which then
     * becomes the source of the template).
     * @param templateID - The ID of the template.
     * @param noteID - The note to copy; the source note when omitted.
     * @throws Will throw an error when the note no longer exists.
     * @category Workspace Data Context
     */
    const updateTemplateFromNote = useCallback((templateID: number, noteID?: number) => withLoading(async () => {
        await updateDBTemplateFromNote(templateID, noteID)
        bumpTemplates()
    }), [withLoading, bumpTemplates])

    /**
     * Duplicates a template in the same workspace ("<name> (copy)").
     * @param templateID - The ID of the template.
     * @returns The ID of the copy.
     * @throws Will throw an error when the template no longer exists.
     * @category Workspace Data Context
     */
    const duplicateTemplate = useCallback((templateID: number) => withLoading(async () => {
        const id = await duplicateDBTemplate(templateID)
        bumpTemplates()
        return id
    }), [withLoading, bumpTemplates])

    /**
     * Creates a note from a template at the end of the destination and adds it to the sidebar tree (the content of
     * the note is loaded when it is opened). When the destination folder is not in the tree, the tree is reloaded
     * before resolving.
     * @param color - The color of the template (the new note gets it).
     * @param templateID - The ID of the template.
     * @param workspaceID - The ID of the workspace.
     * @param folderID - The destination folder, null for the workspace root.
     * @param name - The name of the new note.
     * @returns The ID of the new note.
     * @throws Will throw an error on a name clash in the destination.
     * @category Workspace Data Context
     */
    const createNoteFromTemplate = useCallback((templateID: number, workspaceID: number, folderID: number | null, name: string, color?: string | null) =>
        withLoading(async () => {
            const id = await createDBNoteFromTemplate(templateID, workspaceID, folderID, name)
            const applied = Number.isInteger(id) && applyTree(
                tree => insertTreeItem(tree, "note", buildNote(id, workspaceID, folderID, name.trim(), color ?? undefined, getFolderNotes(tree, folderID)), folderID),
                tree => removeTreeItem(tree, "note", id))
            if (!applied) await getWorkspaceData(workspaceID)
            // The template brings its tags: the ones the workspace does not have yet were created with the note
            await reloadTags()
            return id
        }), [withLoading, applyTree, getWorkspaceData, reloadTags])

    return useMemo(() => ({ getTemplates, countTemplates, createTemplateFromNote, updateTemplateFromNote, duplicateTemplate, createNoteFromTemplate }), [ getTemplates, countTemplates, createTemplateFromNote, updateTemplateFromNote, duplicateTemplate, createNoteFromTemplate ])
}
