import { initialLayoutState, normalizeLayout, type LayoutState, type PaneIndex } from "@/lib/tabs/layout-reducer"
import { initialTabsState, type TabsState } from "@/lib/tabs/tabs-reducer"
import { store } from "./initStore"
import { saveStoreSoon } from "./save-soon"
import { isFiniteNumber } from "@/lib/number"

const tabsKey = (workspaceId: number) => `openTabs:${workspaceId}`

/** The tabs of a pane as read from the store: only finite numbers, and an active id that is one of the open ids. */
function readPane(value: unknown): TabsState {
    if (typeof value !== "object" || value === null) return initialTabsState
    const { openIds: rawIds, activeId: rawActive } = value as { openIds?: unknown, activeId?: unknown }
    const openIds = Array.isArray(rawIds) ? rawIds.filter((id): id is number => isFiniteNumber(id)) : []
    const activeId = typeof rawActive === "number" && openIds.includes(rawActive) ? rawActive : (openIds[0] ?? null)
    return { openIds, activeId }
}

/**
 * Gets the open note tabs saved for a workspace. Reads the layout `{ version: 2, left, right, focused }` and the legacy
 * `{ openIds, activeId }` (which becomes the left pane).
 * @param workspaceId The ID of the workspace.
 * @returns A promise that resolves to the saved layout, normalized (empty if none or malformed).
 * @category Store
 */
export const getWorkspaceTabs = async (workspaceId: number): Promise<LayoutState> => {
    const value = await store.get<unknown>(tabsKey(workspaceId))
    if (typeof value !== "object" || value === null) return initialLayoutState
    const record = value as Record<string, unknown>
    if (record.version === 2) {
        const right = typeof record.right === "object" && record.right !== null ? readPane(record.right) : null
        const focused: PaneIndex = record.focused === 1 ? 1 : 0
        return normalizeLayout({ left: readPane(record.left), right, focused })
    }
    return normalizeLayout({ left: readPane(record), right: null, focused: 0 })
}

/**
 * Saves the open note tabs of a workspace.
 * @param workspaceId The ID of the workspace.
 * @param layout The panes with their tabs, and the focused one.
 * @returns A promise that resolves when the layout is saved.
 * @category Store
 */
export const saveWorkspaceTabs = async (workspaceId: number, layout: LayoutState): Promise<void> => {
    const pane = (tabs: TabsState) => ({ openIds: tabs.openIds, activeId: tabs.activeId })
    await store.set(tabsKey(workspaceId), {
        version: 2,
        left: pane(layout.left),
        right: layout.right ? pane(layout.right) : null,
        focused: layout.focused,
    })
    await saveStoreSoon()
}

/**
 * Forgets the open note tabs of a workspace that was permanently deleted.
 * @param workspaceId The ID of the workspace.
 * @category Store
 */
export const deleteWorkspaceTabs = async (workspaceId: number): Promise<void> => {
    await store.delete(tabsKey(workspaceId))
    await saveStoreSoon()
}
