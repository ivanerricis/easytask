import { useTranslation } from "react-i18next"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useActiveNoteSelector, useTabsActions } from "@/contexts/use-tabs"
import type { Note } from "@/types/types"
import { useShortcutLabel } from "@/contexts/use-shortcuts"
import { X } from "lucide-react"
import React, { useCallback, useEffect, useRef } from "react"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { usePane } from "@/contexts/use-layout"
import { useStoreSelector } from "@/lib/external-store"
import { consumeTabRename, pendingRename } from "@/lib/pending-rename"
import { ButtonMenuNote } from "./ButtonMenuNote"
import { Button } from "@/components/ui/button"
import { focusRing, tabElementId, tabPanelId } from "@/lib/a11y"
import { cn } from "@/lib/utils"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { InlineNameInput } from "@/components/inline-name-input"
import { useDraftOfNote } from "@/contexts/use-template-drafts"
import { TemplateTabLabel } from "../template-draft/TemplateTabLabel"
import { DraftTabMenu } from "../template-draft/DraftTabMenu"

type NoteHeaderProps = {
    note: Note
}

/**
 * One tab of the bar of the open notes. The tab itself (role "tab") is the name; the close button is its sibling inside the same box,
 * never nested in it (a tab must not contain buttons).
 */
export const NoteHeader = React.memo(({ note }: NoteHeaderProps) => {
    const { t } = useTranslation()

    const { closeNote, activateNote } = useTabsActions()
    const isActive = useActiveNoteSelector(activeId => activeId === note.id)
    // A template editor: its tab shows the template (badge, name, color) and has its own menu
    const draft = useDraftOfNote(note.id)
    const color = draft ? draft.color : note.color
    const closeLabel = useShortcutLabel("close-note")
    // `keep` is set while the name is provisional (a note just created): Escape cancels the creation, any other end keeps the note
    const { deleteItem, purgeItem } = useWorkspaceActions()
    const keep = useRef<(() => void) | null>(null)
    const flushKeep = useCallback(() => {
        const fn = keep.current
        keep.current = null
        fn?.()
    }, [])
    const discardCreation = useCallback(async () => {
        // The tab is closed here too: with the sidebar closed the tree may not hold the note, so the delete alone would not close it
        closeNote(note.id)
        try {
            await deleteItem("note", note.id)
            await purgeItem("note", note.id)
        } catch (err) {
            reportError(err, getErrorMessage(err))
        }
    }, [closeNote, deleteItem, purgeItem, note.id])
    // The creation goes into the undo history before the rename, so that undo steps back in the right order
    const { editing, error, start: startRename, inputProps } = useInlineRename({ itemType: "note", id: note.id, name: note.name, beforeRecord: flushKeep })

    // A note just created with the "+" of the bar asks for its name as soon as its tab is here
    const pane = usePane()?.pane ?? 0
    const renameRequested = useStoreSelector(pendingRename, request => request?.noteId === note.id && request.pane === pane)
    useEffect(() => {
        if (!renameRequested) return
        const request = consumeTabRename(note.id, pane)
        if (!request) return
        keep.current = request.onKeep ?? null
        startRename()
    }, [renameRequested, note.id, pane, startRename])
    const wasEditing = useRef(false)
    useEffect(() => {
        if (wasEditing.current && !editing) flushKeep()
        wasEditing.current = editing
    }, [editing, flushKeep])
    // No flush on unmount: effects are cleaned up and re-run while the state is kept (hidden/re-shown trees), which would drop `keep` while the field is still open
    const nameInputProps = {
        ...inputProps,
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Escape" && keep.current) {
                keep.current = null
                void discardCreation()
            }
            inputProps.onKeyDown(e)
        },
    }

    const handleCloseHeader =(e: React.MouseEvent) => {
        e.stopPropagation()
        closeNote(note.id)
    }

    const tab = (
        <div
            className={cn(
                "group/tab relative flex items-stretch min-h-[42px] border-x border-b",
                isActive ? "bg-background border-x-border border-b-transparent" : "bg-secondary border-x-transparent border-b-border hover:bg-background/40",
            )}
        >
            {/* Color container */}
            {color && <div
                className="w-full h-1 absolute top-0"
                style={{ backgroundColor: color }}
            >
            </div>}

            {/* Same height as the sidebar header (32px buttons + padding + border), the content centered in it */}
            {editing && !draft && <div className="flex min-w-0 flex-1 items-center py-1 pl-2 pr-1">
                <InlineNameInput {...nameInputProps} error={error} aria-label={t("common.name")} className="max-w-56 text-sm" />
            </div>}
            {(!editing || draft) && <button
                type="button"
                role="tab"
                aria-selected={isActive}
                id={tabElementId(pane, note.id)}
                aria-controls={isActive ? tabPanelId(pane) : undefined}
                tabIndex={isActive ? 0 : -1}
                data-note-id={note.id}
                title={draft ? t("templateEditor.tab", { name: draft.templateName }) : note.name}
                onClick={() => activateNote(note.id)}
                className={cn(focusRing, "flex min-w-0 flex-1 cursor-pointer items-center py-1 pl-2 pr-1 text-left text-sm")}
            >
                {draft
                    ? <TemplateTabLabel name={draft.templateName} className={cn("max-w-52", isActive ? "font-medium text-foreground" : "text-muted-foreground")} />
                    : <span className={cn("block max-w-44 truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {note.name}
                    </span>}
            </button>}
            <div className="flex shrink-0 items-center gap-1 py-1 pr-1">
                <TooltipCustom text={isActive ? t("notes.closeCurrent") : t("notes.close")} shortcut={isActive ? closeLabel : undefined}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={isActive ? t("notes.closeCurrent") : t("notes.close")}
                        onClick={handleCloseHeader}
                        className={cn("relative after:absolute after:-inset-1 after:content-['']", isActive ? "text-foreground" : "text-muted-foreground opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100")}
                    >
                        <X />
                    </Button>
                </TooltipCustom>
            </div>
        </div>
    )

    if (draft) return <DraftTabMenu draft={draft}>{tab}</DraftTabMenu>
    return <ButtonMenuNote note={note} onRename={startRename}>{tab}</ButtonMenuNote>
})
