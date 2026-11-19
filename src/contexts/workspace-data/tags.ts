import { createContext, useCallback, useContext, useMemo } from "react"
import type { Tag } from "@/types/types"
import { createExternalStore, useStoreSelector, type ExternalStore } from "@/lib/external-store"
import i18n from "@/i18n"
import { reportError } from "@/lib/report-error"
import { createDBTag, getDBTags, deleteDBTag, renameDBTag, restoreDBTag, setDBGroupTag, setDBTaskTag, updateDBTagColor, updateDBTagShape, type TagLinks } from "@/db/queries/tag"
import type { StoredTagShape } from "@/lib/tag-shapes"
import type { Runtime, WorkspaceActionsType } from "./types"

/**
 * The tags of the loaded workspace. They live in an external store, apart from the workspace state and from the notes: a
 * tag that is renamed or recolored re-renders only the badges that show tags, never the rows of the note.
 * @category WorkspaceData Context
 */
export type WorkspaceTags = { workspaceId: number | null, tags: Tag[] }

export type WorkspaceTagsStore = ExternalStore<WorkspaceTags>

const NO_TAGS: Tag[] = []

export const createTagsStore = (): WorkspaceTagsStore => createExternalStore<WorkspaceTags>({ workspaceId: null, tags: NO_TAGS })

export const WorkspaceTagsContext = createContext<WorkspaceTagsStore | null>(null)

/** The tags of the open workspace, in the order of the list (empty outside a WorkspaceDataProvider). */
export const useWorkspaceTags = (): Tag[] => {
    const store = useContext(WorkspaceTagsContext)
    const empty = useMemo(() => createTagsStore(), [])
    return useStoreSelector(store ?? empty, state => state.tags)
}

/** The tags of a task by its tag ids, in the order of the list: an id with no tag (deleted) is left out. Memoized on both. */
export const useTagsOf = (tagIDs: readonly number[] | undefined): Tag[] => {
    const tags = useWorkspaceTags()
    return useMemo(() => tagIDs?.length ? tags.filter(tag => tagIDs.includes(tag.id)) : NO_TAGS, [tags, tagIDs])
}

const byPosition = (a: Tag, b: Tag) => a.position - b.position || a.id - b.id

type TagActions = Pick<WorkspaceActionsType, "reloadTags" | "createTag" | "renameTag" | "updateTagColor" | "updateTagShape" | "deleteTag" | "restoreTag" | "setTaskTag" | "setGroupTag">

/**
 * Builds the function that reads the tags of the open workspace again (see WorkspaceActionsType.reloadTags).
 * @category WorkspaceData Context
 */
export const createReloadTags = (tags: WorkspaceTagsStore) => async () => {
    const workspaceId = tags.getState().workspaceId
    if (workspaceId === null) return
    try {
        const list = await getDBTags(workspaceId)
        // The workspace may have changed meanwhile
        if (tags.getState().workspaceId === workspaceId) tags.set({ workspaceId, tags: list })
    } catch (error) {
        reportError(error, i18n.t("errors.tag.load", { message: String((error as { message?: unknown })?.message ?? error) }))
    }
}

/**
 * The tags of the open workspace: every write goes to the database first and then updates the store (no optimistic
 * update: a tag is a small list, and a failure such as a name that is taken must leave the list as it is).
 * @category WorkspaceData Context
 */
export function useTagActions({ withLoading, tags, reloadTags }: Runtime): TagActions {
    const update = useCallback((change: (list: Tag[]) => Tag[]) => {
        const state = tags.getState()
        tags.set({ ...state, tags: change(state.tags) })
    }, [tags])

    const createTag = useCallback((workspaceID: number, name: string, color?: string | null, shape?: StoredTagShape) => withLoading(async () => {
        const tag = await createDBTag(workspaceID, name, color, shape)
        if (tags.getState().workspaceId === workspaceID) update(list => [...list, tag].sort(byPosition))
        return tag
    }), [withLoading, tags, update])

    const renameTag = useCallback((tagID: number, name: string) => withLoading(async () => {
        await renameDBTag(tagID, name)
        update(list => list.map(tag => tag.id === tagID ? { ...tag, name: name.trim() } : tag))
    }), [withLoading, update])

    const updateTagColor = useCallback((tagID: number, color: string | null) => withLoading(async () => {
        await updateDBTagColor(tagID, color)
        update(list => list.map(tag => tag.id === tagID ? { ...tag, color } : tag))
    }), [withLoading, update])

    const updateTagShape = useCallback((tagID: number, shape: StoredTagShape) => withLoading(async () => {
        await updateDBTagShape(tagID, shape)
        update(list => list.map(tag => tag.id === tagID ? { ...tag, shape } : tag))
    }), [withLoading, update])

    const deleteTag = useCallback((tagID: number) => withLoading(async () => {
        const links = await deleteDBTag(tagID)
        update(list => list.filter(tag => tag.id !== tagID))
        return links
    }), [withLoading, update])

    const restoreTag = useCallback((tag: Tag, links: Partial<TagLinks>) => withLoading(async () => {
        await restoreDBTag(tag, links)
        if (tags.getState().workspaceId === tag.workspaceID) update(list => [...list.filter(item => item.id !== tag.id), tag].sort(byPosition))
    }), [withLoading, tags, update])

    const setTaskTag = useCallback((tagID: number, taskIds: readonly number[], assigned: boolean) =>
        withLoading(() => setDBTaskTag(tagID, taskIds, assigned)), [withLoading])

    const setGroupTag = useCallback((tagID: number, groupIds: readonly number[], assigned: boolean) =>
        withLoading(() => setDBGroupTag(tagID, groupIds, assigned)), [withLoading])

    return useMemo(() => ({ reloadTags, createTag, renameTag, updateTagColor, updateTagShape, deleteTag, restoreTag, setTaskTag, setGroupTag }),
        [reloadTags, createTag, renameTag, updateTagColor, updateTagShape, deleteTag, restoreTag, setTaskTag, setGroupTag])
}
