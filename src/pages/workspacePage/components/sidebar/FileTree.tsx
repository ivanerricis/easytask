import { useTranslation } from "react-i18next"
import { useEffect, useMemo, useRef, useCallback } from "react"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { findTreeItem } from "./tree-dnd"
import { useTreeData } from "./use-tree-data"
import { TreeHoverStoreContext, TreeTabStopContext, treeRowKey } from "./tree-row"
import { VIRTUALIZE_THRESHOLD, flattenTree } from "./flat-tree"
import { rowKeys } from "./selection"
import { useSelectionStore } from "./selection-context"
import { type VirtualTreeHandle } from "./VirtualTree"
import { TreeBackgroundMenu } from "./TreeBackgroundMenu"
import { useTreeDnd } from "./use-tree-dnd"
import { DragEndGuard } from "@/components/dnd-end-guard"
import { useTreeKeyboard } from "./use-tree-keyboard"
import { useTreeReveal } from "./use-tree-reveal"
import { ActiveAncestorsProvider } from "./active-ancestors"
import { DragPreview, EmptyTree, FileTreeItem, RootDropArea, TabStopVirtualTree } from "./FileTreeParts"

type FileTreeProps = {
    collapsedIds: Set<number>
    onToggleFolder: (folderId: number) => void
    onExpandFolder: (folderId: number) => void
    /** Collapses or expands every folder (an entry of the menu of the empty space of the tree). */
    onToggleAll?: () => void
    allCollapsed?: boolean
    /** An item to show: its row is selected, scrolled into view and focused once it is in the tree. */
    reveal?: { key: string, seq: number } | null
    /** Called when the reveal is done (or cannot be done), so the request can be dropped. */
    onRevealed?: () => void
}

/**
 * Sidebar tree with drag & drop. Drop zones (from the pointer position on the hovered row):
 * - note row: top half = before, bottom half = after;
 * - folder row: top 25% = before, bottom 25% = after, middle = inside (appended at the end).
 *   If the folder is expanded and has children the bottom 25% means "inside, first position";
 * - empty root area = end of the root.
 * Folders are always listed above notes, so a note dropped next to a folder becomes the first note
 * of that parent and a folder dropped next to a note becomes its last folder.
 *
 * This component composes and renders; the drag & drop, the reveal and the keyboard navigation are in their own hooks.
 */
export const FileTree = ({ collapsedIds, onToggleFolder, onExpandFolder, onToggleAll, allCollapsed = false, reveal = null, onRevealed }: FileTreeProps) => {
    const { t } = useTranslation()
    const tree = useTreeData()
    const store = useSelectionStore()
    const flatRows = useMemo(() => flattenTree(tree, collapsedIds), [tree, collapsedIds])
    const { hoverStore, activeRef, multiCount, dndProps } = useTreeDnd({ tree, rows: flatRows, collapsedIds, onExpandFolder })

    const activeItem = activeRef ? findTreeItem(tree, activeRef) : undefined
    const rootElRef = useRef<HTMLDivElement | null>(null)
    const virtualRef = useRef<VirtualTreeHandle>(null)
    const virtualized = flatRows.length > VIRTUALIZE_THRESHOLD
    // The selection follows the rows in view: what disappears from the tree (or gets hidden) is deselected
    useEffect(() => { store?.sync(rowKeys(flatRows)) }, [store, flatRows])

    const { tabStopStore, handleTreeFocus, handleTreeKeyDown } = useTreeKeyboard({
        rootElRef, virtualRef, virtualized, flatRows, collapsedIds, dragging: activeRef !== null, onToggleFolder, onExpandFolder,
    })
    // After the sync above: the key has to be in the rows in view (the folders above it expanded) before it can be selected
    useTreeReveal({ reveal, onRevealed, tree, flatRows, virtualized, rootElRef, virtualRef })

    const getScrollElement = useCallback(
        () => rootElRef.current?.closest<HTMLElement>("[data-tree-scroll]") ?? rootElRef.current?.parentElement ?? null,
        [],
    )
    const isEmpty = tree.rootFolders.length === 0 && tree.rootNotes.length === 0

    return (
        <ActiveAncestorsProvider tree={tree}>
        <TreeHoverStoreContext.Provider value={hoverStore}>
        <TreeTabStopContext.Provider value={tabStopStore}>
        <DndContext {...dndProps} autoScroll>
            <DragEndGuard dragging={activeRef !== null} onLost={dndProps.onDragCancel} />
            <TreeBackgroundMenu allCollapsed={allCollapsed} onToggleAll={onToggleAll} hasFolders={tree.rootFolders.length > 0}>
            <RootDropArea rootRef={rootElRef} treeLabel={isEmpty ? undefined : t("sidebar.treeLabel")} onFocus={handleTreeFocus} onKeyDown={handleTreeKeyDown}>
                {isEmpty ? (
                    <EmptyTree />
                ) : virtualized ? (
                    <TabStopVirtualTree
                        tabStopStore={tabStopStore}
                        rows={flatRows}
                        collapsedIds={collapsedIds}
                        onToggleFolder={onToggleFolder}
                        activeKey={activeRef ? treeRowKey(activeRef.type, activeRef.id) : null}
                        getScrollElement={getScrollElement}
                        handleRef={virtualRef}
                    />
                ) : (
                    <>
                        {tree.rootFolders.map((folder) => (
                            <FileTreeItem
                                key={`folder-${folder.id}`}
                                item={folder}
                                collapsedIds={collapsedIds}
                                onToggleFolder={onToggleFolder}
                            />
                        ))}
                        {tree.rootNotes.map((note) => (
                            <FileTreeItem
                                key={`note-${note.id}`}
                                item={note}
                                collapsedIds={collapsedIds}
                                onToggleFolder={onToggleFolder}
                            />
                        ))}
                    </>
                )}
            </RootDropArea>
            </TreeBackgroundMenu>
            <DragOverlay dropAnimation={null}>
                {activeItem && activeRef ? <div className="rotate-2"><DragPreview item={activeItem} count={multiCount} /></div> : null}
            </DragOverlay>
        </DndContext>
        </TreeTabStopContext.Provider>
        </TreeHoverStoreContext.Provider>
        </ActiveAncestorsProvider>
    )
}
