import { useTranslation } from "react-i18next"
import { memo, useCallback, useState } from "react"
import { useDroppable } from "@dnd-kit/core"
import { FilePlus, Folder as FolderIcon, FolderPlus } from "lucide-react"
import type { Folder, Note } from "@/types/types"
import { hexToRgba } from "@/lib/utils"
import { useStoreSelector } from "@/lib/external-store"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { ItemNote } from "../note/Note"
import { ItemFolder } from "../folder/Folder"
import { useItemSize } from "./item-size"
import { useTreeRootActive, type createTreeTabStopStore } from "./tree-row"
import { ROOT_DROP_ID } from "./use-tree-dnd"
import { VirtualTree } from "./VirtualTree"
import { AddNoteDialog } from "../AddNoteDialog"
import { AddFolderDialog } from "../AddFolderDialog"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

type FileTreeItemProps = {
    item: Folder | Note
    collapsedIds: Set<number>
    onToggleFolder: (folderId: number) => void
    /** Nesting depth, 0 for the root items. */
    depth?: number
}

/** Recursive tree node. Defined at module level so the tree is not remounted on every render. */
export const FileTreeItem = memo(({ item, collapsedIds, onToggleFolder, depth = 0 }: FileTreeItemProps) => {
    if ("subfolders" in item) {
        return (
            <ItemFolder
                folder={item}
                isOpen={!collapsedIds.has(item.id)}
                onToggle={onToggleFolder}
                level={depth + 1}
                layer
            >
                {item.subfolders.map((child) => (
                    <FileTreeItem
                        key={`folder-${child.id}`}
                        item={child}
                        collapsedIds={collapsedIds}
                        onToggleFolder={onToggleFolder}
                        depth={depth + 1}
                    />
                ))}
                {item.notes.map((note) => (
                    <ItemNote
                        key={`note-${note.id}`}
                        note={note}
                        level={depth + 2}
                        layer
                    />
                ))}
            </ItemFolder>
        )
    }

    return <ItemNote note={item} level={depth + 1} layer />
})

/** The virtualized tree, which alone follows the tab stop: a focus move re-renders it, not the whole FileTree. */
export const TabStopVirtualTree = (props: Omit<React.ComponentProps<typeof VirtualTree>, "tabStopKey"> & { tabStopStore: ReturnType<typeof createTreeTabStopStore> }) => {
    const { tabStopStore, ...rest } = props
    const tabStopKey = useStoreSelector(tabStopStore, key => key)
    return <VirtualTree {...rest} tabStopKey={tabStopKey} />
}

/** What follows the pointer: the dragged item, or "N items" when the whole selection is dragged. */
export const DragPreview = ({ item, count }: { item: Folder | Note, count: number }) => {
    const { t } = useTranslation()
    const size = useItemSize()
    const colorAlpha = useColorAlpha()
    // The color of the item, over the background, like its row (a dragged selection has no single color)
    const tint = count > 1 || !item.color ? undefined : hexToRgba(colorAlpha.item(false), item.color)
    return (
        <div
            className={`flex items-center gap-1 ${size.row} px-1 rounded-xs border border-accent bg-background shadow-md opacity-90 w-48`}
            style={tint ? { backgroundImage: `linear-gradient(${tint}, ${tint})` } : undefined}
        >
            <span className={`${size.text} truncate`}>{count > 1 ? t("menu.selection.dragCount", { count }) : item.name}</span>
        </div>
    )
}

/** Empty workspace: explains it and offers to create the first note or folder (in the root). */
export const EmptyTree = () => {
    const { t } = useTranslation()
    const [noteOpen, setNoteOpen] = useState(false)
    const [folderOpen, setFolderOpen] = useState(false)
    return (
        <Empty className="p-4 md:p-4 gap-4">
            <EmptyHeader>
                <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
                <EmptyTitle className="text-base">{t("sidebar.emptyTree")}</EmptyTitle>
                <EmptyDescription>{t("sidebar.emptyTreeHint")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <Button size="sm" onClick={() => setNoteOpen(true)}>
                    <FilePlus />
                    {t("sidebar.addNote")}
                </Button>
                <Button size="sm" onClick={() => setFolderOpen(true)}>
                    <FolderPlus />
                    {t("sidebar.addFolder")}
                </Button>
            </EmptyContent>
            <AddNoteDialog open={noteOpen} onOpenChange={setNoteOpen} parentId={null} withColor />
            <AddFolderDialog open={folderOpen} onOpenChange={setFolderOpen} parentId={null} withColor />
        </Empty>
    )
}

type RootDropAreaProps = React.ComponentProps<"div"> & { rootRef?: React.RefObject<HTMLDivElement | null>, treeLabel?: string }

// The rest of the props and the ref are the ones the right click menu (its trigger) gives to the area
export const RootDropArea = ({ children, rootRef, treeLabel, ref: triggerRef, ...triggerProps }: RootDropAreaProps) => {
    const { setNodeRef } = useDroppable({ id: ROOT_DROP_ID })
    const highlighted = useTreeRootActive()
    const setRefs = useCallback((node: HTMLDivElement | null) => {
        setNodeRef(node)
        if (rootRef) rootRef.current = node
        if (typeof triggerRef === "function") triggerRef(node)
        else if (triggerRef) triggerRef.current = node
    }, [setNodeRef, rootRef, triggerRef])
    return (
        <div
            {...triggerProps}
            ref={setRefs}
            role={treeLabel ? "tree" : undefined}
            aria-label={treeLabel}
            aria-multiselectable={treeLabel ? true : undefined}
            className={`relative flex flex-col gap-1 p-1 w-full min-h-full ${highlighted ? "bg-primary/10" : ""}`}
        >
            {children}
        </div>
    )
}
