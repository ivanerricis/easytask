import { useTranslation } from "react-i18next"
import { useState } from "react"
import { FileInput, FilePlus, LayoutTemplate, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "./dialog-confirm"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogFooterActions, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormError } from "@/components/form-error"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ListEmpty, ListError, ListSkeleton } from "./item-list-parts"
import { TemplateRow } from "./template-row"
import { useOpenList } from "./use-open-list"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useTemplateDraftActions, useTemplateDrafts } from "@/contexts/use-template-drafts"
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete"
import { DialogNoteFromTemplate } from "@/components/dialogs/dialog-note-from-template"
import { DialogCreateEmptyTemplate, DialogCreateTemplate } from "@/components/dialogs/dialog-create-template"
import { DialogPickNote } from "@/components/dialogs/dialog-pick-note"
import { useAllNotes } from "@/hooks/use-all-notes"
import type { NoteTemplate } from "@/types/template"

// The search box is shown only when the list gets long
const SEARCH_THRESHOLD = 8
// Under this many templates the list is short: a hint says how to add more
const SHORT_LIST = 3

type DialogTemplatesProps = {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * Templates of the current workspace: create a template from one of the notes, create a note from a template, edit it
 * (in a tab), rename, duplicate, refresh from the source note or from another note, delete (soft delete: the template
 * goes to the trash).
 * @category Dialogs
 */
export const DialogTemplates = ({ isOpen, onOpenChange }: DialogTemplatesProps) => {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    const { getTemplates, updateTemplateFromNote, duplicateTemplate } = useWorkspaceActions()
    const drafts = useTemplateDrafts()
    const { openTemplateEditor, flushTemplate, refreshDrafts } = useTemplateDraftActions()
    const workspaceID = currentWorkspace?.id
    const allNotes = useAllNotes().filter(({ note }) => note.kind !== "page")

    const { items: templates, isLoading, loadError, reload, run, busy, error, setError } = useOpenList<NoteTemplate>({
        isOpen,
        resetKey: workspaceID,
        load: async () => {
            if (workspaceID === undefined) return []
            const list = await getTemplates(workspaceID)
            // A renamed template renames the tab of its editor
            void refreshDrafts()
            return list
        },
    })
    const [search, setSearch] = useState("")
    const [creating, setCreating] = useState<NoteTemplate | null>(null)
    const [deleting, setDeleting] = useState<NoteTemplate | null>(null)
    // The template being refreshed; `note` is the other note chosen as the source (none = its source note)
    const [refreshing, setRefreshing] = useState<{ template: NoteTemplate, note?: { id: number, name: string } } | null>(null)
    // Choosing the other note to refresh a template from
    const [pickingFor, setPickingFor] = useState<NoteTemplate | null>(null)
    // Creating a template here: first the note is chosen, then the template gets its name
    const [picking, setPicking] = useState(false)
    const [source, setSource] = useState<{ id: number, name: string } | null>(null)
    // Creating an empty template: its name is asked, then it opens in the editor
    const [creatingEmpty, setCreatingEmpty] = useState(false)

    // The template is saved first, so what the user sees in the list is what the action works on
    const saved = async (template: NoteTemplate) => {
        if (await flushTemplate(template.id)) return true
        setError(t("templateEditor.saveError"))
        return false
    }

    const handleEdit = (template: NoteTemplate) => run(async () => {
        await openTemplateEditor(template)
        onOpenChange(false)
    }, undefined, { reload: false })

    const handleDuplicate = (template: NoteTemplate) => run(async () => {
        if (!await saved(template)) return false
        await duplicateTemplate(template.id)
    }, t("templateEditor.duplicated"))

    const handleRefresh = async () => {
        const target = refreshing
        setRefreshing(null)
        if (!target) return
        const { template, note } = target
        await run(async () => {
            if (note) await updateTemplateFromNote(template.id, note.id)
            else await updateTemplateFromNote(template.id)
        }, t("dialogs.templates.updated"))
    }

    const query = search.trim().toLowerCase()
    const visible = query ? templates.filter(tpl => tpl.name.toLowerCase().includes(query)) : templates

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent
                    className="flex flex-col sm:max-w-xl max-h-[min(560px,85vh)] overflow-hidden"
                    // Escape while a name is being edited only cancels the edit
                    onEscapeKeyDown={e => { if ((e.target as HTMLElement | null)?.closest?.("[data-template-rename]")) e.preventDefault() }}
                >
                    <DialogHeader>
                        <DialogTitle>{t("dialogs.templates.title")}</DialogTitle>
                        <DialogDescription>
                            {t("dialogs.templates.description")}
                        </DialogDescription>
                    </DialogHeader>
                    {templates.length > SEARCH_THRESHOLD && (
                        <Input
                            aria-label={t("dialogs.templates.search")}
                            placeholder={t("dialogs.templates.searchPlaceholder")}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    )}
                    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
                        {isLoading ? (
                            <ListSkeleton />
                        ) : loadError !== null ? (
                            <ListError message={loadError} onRetry={() => void reload()} />
                        ) : templates.length === 0 ? (
                            <ListEmpty>{t("dialogs.templates.empty")}</ListEmpty>
                        ) : visible.length === 0 ? (
                            <ListEmpty>{t("common.noResults")}</ListEmpty>
                        ) : (
                            visible.map(template => {
                                // While its editor is open the content of the template changes by itself: no refresh from a note
                                const editing = drafts.some(draft => draft.templateId === template.id)
                                return (
                                    <TemplateRow
                                        key={template.id}
                                        template={template}
                                        busy={busy}
                                        editing={editing}
                                        reload={reload}
                                        onCreateNote={() => { void saved(template).then(ok => { if (ok) setCreating(template) }) }}
                                        onEdit={() => void handleEdit(template)}
                                        onDelete={() => setDeleting(template)}
                                        onDuplicate={() => void handleDuplicate(template)}
                                        onRefresh={() => setRefreshing({ template })}
                                        onRefreshFromOther={() => setPickingFor(template)}
                                    />
                                )
                            })
                        )}
                    </div>
                    {!isLoading && loadError === null && templates.length > 0 && templates.length <= SHORT_LIST && (
                        <p className="text-center text-xs text-muted-foreground">{t("dialogs.templates.shortHint")}</p>
                    )}
                    <FormError>{error}</FormError>
                    <DialogFooter>
                        <DialogFooterActions>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                {t("common.close")}
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={busy}>
                                        <Plus />
                                        {t("dialogs.templates.new")}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem disabled={workspaceID === undefined} onSelect={() => setCreatingEmpty(true)}>
                                        <LayoutTemplate />
                                        {t("dialogs.templates.newEmpty")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={allNotes.length === 0} onSelect={() => setPicking(true)}>
                                        <FilePlus />
                                        <span className="flex flex-col">
                                            {t("dialogs.templates.newFromNote")}
                                            {allNotes.length === 0 && <span className="text-xs text-muted-foreground">{t("dialogs.templates.noNotes")}</span>}
                                        </span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </DialogFooterActions>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DialogPickNote
                isOpen={picking}
                onOpenChange={setPicking}
                onPick={setSource}
                title={t("dialogs.templates.pickNote.title")}
                description={t("dialogs.templates.pickNote.description")}
                placeholder={t("dialogs.templates.pickNote.placeholder")}
            />
            <DialogPickNote
                isOpen={pickingFor !== null}
                onOpenChange={open => { if (!open) setPickingFor(null) }}
                onPick={note => { if (pickingFor) setRefreshing({ template: pickingFor, note }) }}
                title={t("templateEditor.pickOther.title")}
                description={t("templateEditor.pickOther.description")}
                placeholder={t("templateEditor.pickOther.placeholder")}
            />
            {creatingEmpty && workspaceID !== undefined && (
                <DialogCreateEmptyTemplate
                    workspaceId={workspaceID}
                    isOpen
                    onOpenChange={open => { if (!open) setCreatingEmpty(false) }}
                    onCreated={template => {
                        // The new template is opened in the editor, where its content is written
                        void run(async () => {
                            await openTemplateEditor(template)
                            onOpenChange(false)
                        }, undefined, { reload: false })
                    }}
                />
            )}
            {source && (
                <DialogCreateTemplate
                    key={source.id}
                    note={source}
                    isOpen
                    onOpenChange={open => { if (!open) setSource(null) }}
                    onCreated={() => void reload()}
                />
            )}
            {creating && (
                <DialogNoteFromTemplate
                    key={creating.id}
                    template={creating}
                    isOpen
                    onOpenChange={open => { if (!open) setCreating(null) }}
                    onCreated={() => onOpenChange(false)}
                />
            )}
            {deleting && (
                <DialogDeleteItem
                    key={deleting.id}
                    item={deleting}
                    itemType="note_template"
                    isOpen
                    onOpenChange={open => { if (!open) setDeleting(null) }}
                    getItemId={deleting.id}
                    getItemData={reload}
                />
            )}
            <ConfirmDialog
                open={refreshing !== null}
                onOpenChange={open => { if (!open) setRefreshing(null) }}
                destructive
                initialFocus="cancel"
                title={t("dialogs.templates.refreshTitle")}
                description={refreshing?.note
                    ? t("templateEditor.refreshOtherDescription", { name: refreshing.template.name, note: refreshing.note.name })
                    : t("dialogs.templates.refreshDescription", { name: refreshing?.template.name, note: refreshing?.template.sourceNoteName })}
                confirm={{ label: t("dialogs.templates.overwrite"), icon: FileInput, onClick: handleRefresh }}
            />
        </>
    )
}
