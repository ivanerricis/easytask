import { ChevronDown } from "lucide-react"
import React, { useId, useState } from "react"
import { DropLine } from "../sidebar/DropLine"
import { useItemSize } from "../sidebar/item-size"
import { isInsideZone, openOnKeyboardFocus, treeRowKey, treeRowKeyDown, useIsTreeTabStop, useTreeDropZone, useTreeRow } from "../sidebar/tree-row"
import { SelectionMark } from "../sidebar/SelectionMark"
import { useFolderHoldsActiveNote } from "../sidebar/active-ancestors-object"
import { useIsSelected } from "../sidebar/selection-context-object"
import { useTreeRowHandlers } from "../sidebar/use-tree-row-handlers"
import { TreeRowMenu } from "../sidebar/TreeRowMenu"
import type { DropZone } from "../sidebar/tree-dnd"
import { ButtonMenuFolder } from "./ButtonMenuFolder"
import type { Folder } from "@/types/types"
import { focusRing } from "@/lib/a11y"
import { TooltipTrigger } from "@/components/ui/tooltip"
import { TreeRowTooltip } from "../sidebar/TreeRowTooltip"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { hexToRgba } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { InlineNameInput } from "@/components/inline-name-input"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"

type ItemFolderProps = {
    folder: Folder
    children?: React.ReactNode
    isOpen: boolean
    onToggle: (folderId: number) => void
    /** Depth in the tree, starting at 1 (aria-level). */
    level?: number
}

type FolderRowProps = ItemFolderProps & { dropZone: DropZone | null } & Omit<ReturnType<typeof useTreeRow>, "ref"> & { dndRef: ReturnType<typeof useTreeRow>["ref"] }

/**
 * The drag & drop hooks of dnd-kit re-render the component that calls them every time the dragged item moves over another
 * row, so they live in this thin shell: the row below is memoized and only re-renders when its own props change.
 */
export const ItemFolder = React.memo((props: ItemFolderProps) => {
    const { ref, attributes, listeners, isDragging } = useTreeRow("folder", props.folder.id)
    const hoverZone = useTreeDropZone("folder", props.folder.id)
    return <FolderRow {...props} dropZone={hoverZone} dndRef={ref} attributes={attributes} listeners={listeners} isDragging={isDragging} />
})

const FolderRow = React.memo(({ folder, children, isOpen, onToggle, dropZone, level = 1, dndRef, attributes, listeners, isDragging }: FolderRowProps) => {
    const { t } = useTranslation()
    const [isHovered, setIsHovered] = useState(false)
    // The sidebar tree is updated by the context: no reload
    const { editing, error, start: startRename, inputProps } = useInlineRename({ itemType: "folder", id: folder.id, name: folder.name })

    const size = useItemSize()
    const colorAlpha = useColorAlpha()
    const hasContent = React.Children.count(children) > 0
    const selected = useIsSelected("folder", folder.id)
    // A collapsed folder hides the open note: it gets a discreet mark so that the note can be found again
    // (the ancestors of the open note are computed once, see ActiveAncestorsProvider)
    const holdsActiveNote = useFolderHoldsActiveNote(folder.id, isOpen)
    const holdsNoteId = useId()
    // Roving tabindex: one row of the tree is in the tab order, the others are reached with the arrows
    const tabStop = useIsTreeTabStop("folder", folder.id)

    // Ctrl/Cmd+click and Shift+click only select; a plain click toggles the folder and clears the selection
    const { handleClick, handleActivate } = useTreeRowHandlers("folder", folder.id, () => onToggle(folder.id))

    return (
        <Collapsible open={isOpen && hasContent} className="relative flex flex-col w-full">
            <TreeRowTooltip
                name={folder.name}
                creationDate={folder.creation_date}
                creationTime={folder.creation_time}
                editDate={folder.edit_date}
                editTime={folder.edit_time}
            >
                <ButtonMenuFolder folder={folder} onRename={startRename}>
                    <TooltipTrigger asChild onFocus={openOnKeyboardFocus}>
                        <div
                            {...attributes}
                            {...listeners}
                            ref={dndRef}
                            role="treeitem"
                            aria-label={folder.name}
                            data-row-key={treeRowKey("folder", folder.id)}
                            aria-level={level}
                            tabIndex={tabStop ? 0 : -1}
                            aria-expanded={isOpen}
                            onClick={handleClick}
                            aria-selected={selected}
                            data-holds-active={holdsActiveNote || undefined}
                            aria-describedby={holdsActiveNote ? holdsNoteId : undefined}
                            onKeyDown={treeRowKeyDown(listeners, handleActivate)}
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                            // Flat row: a hover fill and no visible border, except a selected folder (accent border all around) and a collapsed one holding the open note (fainter)
                            className={`${focusRing} relative group cursor-pointer gap-1 w-full min-w-0 pl-1 ${size.row} flex items-center rounded-xs border select-none hover:bg-accent ${selected ? "border-primary" : holdsActiveNote ? "border-primary/60" : "border-transparent"} overflow-hidden ${isDragging ? "opacity-40" : ""} ${isInsideZone(dropZone) ? "ring-2 ring-primary ring-inset" : ""}`}
                            style={{ backgroundColor: hexToRgba(colorAlpha.item(isHovered), folder.color) }}
                        >

                            <DropLine zone={dropZone} />
                            <SelectionMark selected={selected} />
                            <div className="flex min-w-0 items-center gap-1 w-full h-full">
                                <ChevronDown className={`${isOpen ? 'rotate-0' : '-rotate-90'} ${size.icon} shrink-0 transition-transform`} />
                                {editing
                                    ? <InlineNameInput {...inputProps} error={error} aria-label={t("common.name")} className={size.text} />
                                    : <span className={`w-full ${size.text} min-w-0 truncate whitespace-nowrap overflow-hidden max-w-[calc(100%-1rem)]`}>
                                        {folder.name}
                                    </span>}
                                {/* Not by the colour of the border alone: a dot, and a text for the screen readers */}
                                {holdsActiveNote && <>
                                    <span aria-hidden="true" data-testid="holds-open-note" className="size-1.5 shrink-0 rounded-full bg-primary" />
                                    <span id={holdsNoteId} className="sr-only">{t("sidebar.holdsOpenNote")}</span>
                                </>}
                            </div>
                            <TreeRowMenu name={folder.name} tabStop={tabStop} />
                        </div>
                    </TooltipTrigger>
                </ButtonMenuFolder>
            </TreeRowTooltip>

            {/* The children slide open and closed (the speed follows the animation setting); once closed they are unmounted */}
            {/* pr-1 and pb-0.5 (with the negative margins): room for the 2px focus ring of the rows, which the clipping of the animation would cut */}
            <CollapsibleContent className="relative -mr-1 pr-1 -mb-0.5 pb-0.5 overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className={`absolute ${size.guide} h-full w-[1px] bg-foreground/25`} />
                {/* pt-1: the gap between the folder row and its children is inside the animated part, so it does not jump when the animation ends */}
                <div className={`${size.indent} flex flex-col gap-1 pt-1`}>
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
})