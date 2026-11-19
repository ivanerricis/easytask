import { useTranslation } from "react-i18next"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useActiveNoteSelector, useTabsActions } from "@/contexts/use-tabs"
import type { Note } from "@/types/types"
import { useShortcutLabel } from "@/contexts/use-shortcuts"
import { X } from "lucide-react"
import React, { useEffect } from "react"
import { usePane } from "@/contexts/use-layout"
import { useStoreSelector } from "@/lib/external-store"
import { consumeTabRename, pendingRename } from "@/lib/pending-rename"
import { ButtonMenuNote } from "./ButtonMenuNote"
import { Button } from "@/components/ui/button"
import { focusRing } from "@/lib/a11y"
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
    const { editing, error, start: startRename, inputProps } = useInlineRename({ itemType: "note", id: note.id, name: note.name })

    // A note just created with the "+" of the bar asks for its name as soon as its tab is here
    const pane = usePane()?.pane ?? 0
    const renameRequested = useStoreSelector(pendingRename, request => request?.noteId === note.id && request.pane === pane)
    useEffect(() => {
        if (renameRequested && consumeTabRename(note.id, pane)) startRename()
    }, [renameRequested, note.id, pane, startRename])

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
                <InlineNameInput {...inputProps} error={error} aria-label={t("common.name")} className="max-w-56 text-sm" />
            </div>}
            {(!editing || draft) && <button
                type="button"
                role="tab"
                aria-selected={isActive}
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
