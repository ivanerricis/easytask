import { useTranslation } from "react-i18next"
import { Copy, FileInput, FilePlus, LayoutTemplate, MoreHorizontal, Pencil, SquarePen, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { TooltipCustom } from "@/components/tooltip-custom"
import { ItemRow } from "./item-list-parts"
import { useAfterMenuClose } from "@/hooks/use-after-menu-close"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { formatDate } from "@/lib/utils"
import { countTemplateContent, type NoteTemplate } from "@/types/template"

type TemplateRowProps = {
    template: NoteTemplate
    /** An action of the list is running: the buttons wait. */
    busy: boolean
    /** Its editor is open: the content changes by itself, so it cannot be refreshed from a note. */
    editing: boolean
    onCreateNote: () => void
    onEdit: () => void
    onDelete: () => void
    onDuplicate: () => void
    onRefresh: () => void
    onRefreshFromOther: () => void
    /** Reloads the list after the template was renamed. */
    reload: () => Promise<void>
}

/**
 * A template of the Templates dialog. The name is renamed in place (a click on it); next to it Create note, Edit and
 * Delete; Rename, Update from the source note, Update from another note and Duplicate are in the "more" menu.
 * @category Dialogs
 */
export const TemplateRow = ({ template, busy, editing, onCreateNote, onEdit, onDelete, onDuplicate, onRefresh, onRefreshFromOther, reload }: TemplateRowProps) => {
    const { t } = useTranslation()
    const counts = countTemplateContent(template.content)
    const rename = useInlineRename({ itemType: "note_template", id: template.id, name: template.name, reload })
    const { request: requestRename, onCloseAutoFocus } = useAfterMenuClose(rename.start)
    const refreshReason = editing ? t("templateEditor.refreshBlocked") : template.sourceNoteName === null ? t("dialogs.templates.sourceMissing") : null

    const nameSlot = rename.editing ? (
        <div className="flex flex-col gap-0.5">
            <Input
                {...rename.inputProps}
                // The dialog does not close on Escape while the name is edited (see DialogTemplates)
                data-template-rename=""
                className="h-7 px-2 text-sm"
                aria-label={t("common.name")}
                aria-describedby={rename.error !== null ? `template-rename-error-${template.id}` : undefined}
            />
            {rename.error !== null && (
                <span id={`template-rename-error-${template.id}`} role="alert" className="text-xs text-destructive">{rename.error}</span>
            )}
        </div>
    ) : (
        <button
            type="button"
            title={template.name}
            aria-label={t("dialogs.templates.renameAria", { name: template.name })}
            disabled={busy}
            onClick={rename.start}
            className="cursor-text truncate rounded-xs text-left text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
            {template.name}
        </button>
    )

    return (
        <ItemRow
            icon={LayoutTemplate}
            name={template.name}
            nameSlot={nameSlot}
            details={[
                `${template.sourceNoteName !== null ? t("dialogs.templates.from", { name: template.sourceNoteName }) : t("dialogs.templates.noteDeleted")} · ${t("dialogs.templates.createdOn", { date: formatDate(template.creation_date) })}`,
                [
                    t("common.counts.group", { count: counts.groups }),
                    t("common.counts.section", { count: counts.sections }),
                    t("common.counts.task", { count: counts.tasks }),
                ].join(" · "),
            ]}
        >
            <TooltipCustom text={t("dialogs.templates.createNote")}>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("dialogs.templates.createNoteFrom", { name: template.name })}
                    disabled={busy}
                    onClick={onCreateNote}
                >
                    <FilePlus />
                </Button>
            </TooltipCustom>
            <TooltipCustom text={t("templateEditor.edit")}>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("templateEditor.editAria", { name: template.name })}
                    disabled={busy}
                    onClick={onEdit}
                >
                    <SquarePen />
                </Button>
            </TooltipCustom>
            <DropdownMenu>
                <TooltipCustom text={t("templateEditor.moreTooltip")}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label={t("templateEditor.moreAria", { name: template.name })}
                            disabled={busy}
                        >
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipCustom>
                <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
                    <DropdownMenuItem onSelect={requestRename}>
                        <Pencil />
                        {t("common.rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={refreshReason !== null} onSelect={onRefresh}>
                        <FileInput />
                        <span className="flex flex-col">
                            {t("dialogs.templates.refreshFromSource")}
                            {refreshReason !== null && <span className="text-xs text-muted-foreground">{refreshReason}</span>}
                        </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={editing} onSelect={onRefreshFromOther}>
                        <FileInput />
                        {t("templateEditor.refreshFromOther")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onDuplicate}>
                        <Copy />
                        {t("templateEditor.duplicate")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <span aria-hidden className="mx-0.5 w-px self-stretch bg-border" />
            <TooltipCustom text={t("common.delete")}>
                <Button
                    variant="destructiveGhost"
                    size="icon"
                    aria-label={t("dialogs.templates.deleteAria", { name: template.name })}
                    disabled={busy}
                    onClick={onDelete}
                >
                    <Trash2 />
                </Button>
            </TooltipCustom>
        </ItemRow>
    )
}
