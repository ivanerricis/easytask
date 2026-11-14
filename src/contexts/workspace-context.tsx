import React, { useCallback, useMemo, useState } from 'react'
import type { Workspace } from '@/types/types'
import { getDBWorkspaces, createDBWorkspace } from '@/db/queries/workspace'
import { getDBTrashedWorkspaces, purgeDBItem, restoreDBItem } from '@/db/queries/trash'
import { getErrorMessage } from '@/lib/utils'
import { deleteWorkspaceTabs } from '@/lib/store/tabs'
import { reportError } from '@/lib/report-error'
import { usePendingCounter } from './use-pending-counter'
import { WorkspaceContext } from './workspace-context-object'

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { track } = usePendingCounter(useCallback((pending: number) => setIsLoading(pending > 0), []))

    /**
     * Runs an async operation and keeps isLoading true while any operation is in flight; its failure becomes `error`.
     * @param operation The operation to run.
     * @category Workspace Context
     */
    const withLoading = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => track(async () => {
        setError(null)
        try {
            return await operation()
        } catch (err: unknown) {
            setError(getErrorMessage(err))
            throw err
        }
    }), [track])

    /**
     * Retrieves the list of workspaces.
     * @throws Will throw an error if the workspaces cannot be retrieved.
     * @category Workspace Context
     */
    const getWorkspaces = useCallback(() => withLoading(async () => {
        const data = await getDBWorkspaces()
        setWorkspaces(data ?? [])
    }), [withLoading])

    const createWorkspace = useCallback((name: string, color?: string) => withLoading(async () => {
        await createDBWorkspace(name, color ?? null)
        const data = await getDBWorkspaces()
        setWorkspaces(data ?? [])
    }), [withLoading])

    /**
     * Retrieves the workspaces moved to the trash. Does not touch the `workspaces` state.
     * @category Workspace Context
     */
    const getTrashedWorkspaces = useCallback(() => withLoading(() => getDBTrashedWorkspaces()), [withLoading])

    /**
     * Restores a trashed workspace and refreshes `workspaces`.
     * @category Workspace Context
     */
    const restoreWorkspace = useCallback((id: number) => withLoading(async () => {
        await restoreDBItem('workspace', id)
        setWorkspaces((await getDBWorkspaces()) ?? [])
    }), [withLoading])

    /**
     * Permanently deletes a trashed workspace and refreshes `workspaces`.
     * @category Workspace Context
     */
    const purgeWorkspace = useCallback((id: number) => withLoading(async () => {
        await purgeDBItem('workspace', id)
        // The saved tabs of the workspace are of no use any more (a failure here leaves a few bytes, not worth failing the purge)
        try { await deleteWorkspaceTabs(id) } catch (error) { reportError(error) }
        setWorkspaces((await getDBWorkspaces()) ?? [])
    }), [withLoading])

    /**
     * Resets the current workspace and clears any errors.
     * @category Workspace Context
     */
    const resetWorkspace = useCallback(() => {
        setCurrentWorkspace(null)
        setError(null)
    }, [])

    const value = useMemo(() => ({
        workspaces,
        currentWorkspace,
        isLoading,
        error,
        getWorkspaces,
        createWorkspace,
        setCurrentWorkspace,
        getTrashedWorkspaces,
        restoreWorkspace,
        purgeWorkspace,
        resetWorkspace
    }), [workspaces, currentWorkspace, isLoading, error, getWorkspaces, createWorkspace,
        getTrashedWorkspaces, restoreWorkspace, purgeWorkspace, resetWorkspace])

    return (
        <WorkspaceContext.Provider value={value}>
            {children}
        </WorkspaceContext.Provider>
    )
}
