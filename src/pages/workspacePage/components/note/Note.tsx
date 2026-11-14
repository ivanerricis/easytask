import type { Note } from "@/types/types"
import { useActiveNoteSelector, useTabsActions } from "@/contexts/use-tabs"
import { ButtonMenuNote } from "./ButtonMenuNote"
import React, { useState } from "react"
import { useColorAlpha } from "@/contexts/use-color-alpha"
import { hexToRgba } from "@/lib/utils"
import { useItemSize } from "../sidebar/item-size"
import { DropLine } from "../sidebar/DropLine"
import { openOnKeyboardFocus, useIsTreeTabStop, treeRowKey, treeRowKeyDown, useTreeDropZone, useTreeRow } from "../sidebar/tree-row"
import { SelectionMark } from "../sidebar/SelectionMark"
import { useIsSelected } from "../sidebar/selection-context-object"
import { useTreeRowHandlers } from "../sidebar/use-tree-row-handlers"
import { TreeRowMenu } from "../sidebar/TreeRowMenu"
import type { DropZone } from "../sidebar/tree-dnd"
import { focusRing } from "@/lib/a11y"
import { TooltipTrigger } from "@/components/ui/tooltip"
import { TreeRowTooltip } from "../sidebar/TreeRowTooltip"
import { useTranslation } from "react-i18next"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { InlineNameInput } from "@/components/inline-name-input"

type ItemNoteProps = {
    note: Note
    /** Depth in the tree, starting at 1 (aria-level). */
    level?: number
}

type NoteRowProps = ItemNoteProps & { dropZone: DropZone | null } & Omit<ReturnType<typeof useTreeRow>, "ref"> & { dndRef: ReturnType<typeof useTreeRow>["ref"] }

/**
 * The drag & drop hooks of dnd-kit re-render the component that calls them every time the dragged item moves over another
 * row, so they live in this thin shell: the row below is memoized and only re-renders when its own props change.
 */
export const ItemNote = React.memo((props: ItemNoteProps) => {
    const { ref, attributes, listeners, isDragging } = useTreeRow("note", props.note.id)
    const hoverZone = useTreeDropZone("note", props.note.id)
    return <NoteRow {...props} dropZone={hoverZone} dndRef={ref} attributes={attributes} listeners={listeners} isDragging={isDragging} />
})

const NoteRow = React.memo(({ note, dropZone, level = 1, dndRef, attributes, listeners, isDragging }: NoteRowProps) => {
    const { t } = useTranslation()
    // The sidebar tree is updated by the context: no reload
    const { editing, error, start: startRename, inputProps } = useInlineRename({ itemType: "note", id: note.id, name: note.name })
    const [isHovered, setIsHovered] = useState(false)
    const size = useItemSize()
    const colorAlpha = useColorAlpha()
    const { openNote } = useTabsActions()
    const selected = useIsSelected("note", note.id)
    // The note open in the active tab
    const isActive = useActiveNoteSelector(activeId => activeId === note.id)
    // Roving tabindex: one row of the tree is in the tab order, the others are reached with the arrows
    const tabStop = useIsTreeTabStop("note", note.id)

    // Ctrl/Cmd+click and Shift+click only select; a plain click opens the note and clears the selection
    const { handleClick, handleActivate } = useTreeRowHandlers("note", note.id, () => openNote(note.id))

    return (
        <TreeRowTooltip
            name={note.name}
            creationDate={note.creation_date}
            creationTime={note.creation_time}
            editDate={note.edit_date}
            editTime={note.edit_time}
        >
            <ButtonMenuNote note={note} onRename={startRename}>
                <TooltipTrigger asChild onFocus={openOnKeyboardFocus}>
                    <div
                        {...attributes}
                        {...listeners}
                        ref={dndRef}
                        role="treeitem"
                        aria-label={note.name}
                        data-row-key={treeRowKey("note", note.id)}
                        aria-level={level}
                        tabIndex={tabStop ? 0 : -1}
                        onClick={(e) => { e.stopPropagation(); handleClick(e) }}
                        aria-selected={selected}
                        aria-current={isActive ? "true" : undefined}
                        onKeyDown={treeRowKeyDown(listeners, handleActivate)}
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                        // Flat row: a hover fill and no visible border, except the open or selected note, which has an accent border all around
                        className={`${focusRing} relative group cursor-pointer w-full min-w-0 ${size.row} flex items-center rounded-xs border select-none hover:bg-accent ${selected || isActive ? "border-primary" : "border-transparent"} ${isActive ? "bg-accent" : ""} overflow-hidden ${isDragging ? "opacity-40" : ""}`}
                        style={{ backgroundColor: hexToRgba(colorAlpha.item(isHovered), note.color) }}
                    >
                        <DropLine zone={dropZone} />
                        <SelectionMark selected={selected} />
                        <div className="flex min-w-0 items-center gap-1 px-1 overflow-hidden w-full">
                            {editing
                                ? <InlineNameInput {...inputProps} error={error} aria-label={t("common.name")} className={size.text} />
                                : <span className={`${size.text} ${isActive ? "font-semibold" : ""} text-foreground min-w-0 truncate whitespace-nowrap overflow-hidden max-w-[calc(100%-1rem)]`}>
                                    {note.name}
                                </span>}
                        </div>
                        <TreeRowMenu name={note.name} tabStop={tabStop} />
                    </div>
                </TooltipTrigger>
            </ButtonMenuNote>
        </TreeRowTooltip>
    )
})
