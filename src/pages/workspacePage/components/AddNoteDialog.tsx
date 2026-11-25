import { FilePlus, FileText } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { FormError } from "@/components/form-error"
import { FormFooter } from "@/components/form-footer"
import { Label } from "@/components/ui/label"
import { NameField } from "@/components/name-field"
import { useFormSubmit } from "@/components/use-form-submit"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OptionalColorField } from "@/components/optional-color-field"
import { useTemplates } from "@/hooks/use-templates"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import type { NoteKind } from "@/types/types"

const NO_TEMPLATE = "none"

type AddNoteDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The folder the note is created in; null for the workspace root. */
    parentId: number | null
    /** Offers the optional color (root notes only: notes in folders take no color on creation). */
    withColor?: boolean
    /** "page" creates a Markdown page (always blank: no template); the default is a note. */
    kind?: NoteKind
}

/** Creates a note (blank or from a template) or a page in the workspace root or in a folder. */
export function AddNoteDialog({ open, onOpenChange, parentId, withColor = false, kind = "note" }: AddNoteDialogProps) {
    const { t } = useTranslation()
    const [name, setName] = useState("")
    const [color, setColor] = useState<string | undefined>(undefined)
    const [templateId, setTemplateId] = useState("")
    const { currentWorkspace } = useWorkspace()
    const { createWorkspaceNote, createNoteInFolder, createNoteFromTemplate } = useWorkspaceActions()
    const recorder = useUndoRecorder()
    const nameId = useId()
    const errorId = useId()
    const templateFieldId = useId()
    const isPage = kind === "page"
    const templates = useTemplates(open && !isPage)
    // A stale selection (template deleted meanwhile) behaves as "no template"
    const template = templates.find(tpl => String(tpl.id) === templateId)

    const reset = () => {
        setName("")
        setColor(undefined)
        setTemplateId("")
    }

    const { busy: saving, error, setError, submit } = useFormSubmit(async () => {
        if (!currentWorkspace?.id) return
        const trimmed = name.trim()
        if (trimmed === "") return
        // Both are added to the sidebar tree by the context
        const id = template
            ? await createNoteFromTemplate(template.id, currentWorkspace.id, parentId, trimmed, template.color)
            : parentId === null
                ? await createWorkspaceNote(currentWorkspace.id, trimmed, withColor ? color : undefined, kind)
                : await createNoteInFolder(currentWorkspace.id, parentId, trimmed, kind)
        if (typeof id === "number") recorder.create("note", id, trimmed)
        reset()
        onOpenChange(false)
    })

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            reset()
            setError(null)
        }
        onOpenChange(next)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{isPage ? t("dialogs.addPage.title") : t("dialogs.addNote.title")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit}>
                    <div className="grid gap-4">
                        <div className="grid gap-3">
                            <NameField
                                id={nameId}
                                label={t("common.name")}
                                value={name}
                                error={error}
                                errorId={errorId}
                                showError={false}
                                onChange={value => {
                                    setError(null)
                                    setName(value)
                                }}
                            >
                                {withColor && !template && <OptionalColorField value={color} onChange={setColor} />}
                            </NameField>
                        </div>
                        {!isPage && templates.length > 0 && (
                            <div className="grid gap-3">
                                <Label htmlFor={templateFieldId}>{t("dialogs.addNote.fromTemplate")}</Label>
                                {/* Radix Select items cannot have an empty value: NO_TEMPLATE stands for "no template" */}
                                <Select value={template ? templateId : NO_TEMPLATE} onValueChange={value => setTemplateId(value === NO_TEMPLATE ? "" : value)}>
                                    <SelectTrigger id={templateFieldId} className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_TEMPLATE}>{t("dialogs.addNote.noTemplate")}</SelectItem>
                                        {templates.map(tpl => <SelectItem key={tpl.id} value={String(tpl.id)}>{tpl.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <FormError id={errorId}>{error}</FormError>
                    </div>
                    <FormFooter onCancel={() => handleOpenChange(false)} disabled={!name.trim() || saving}>
                        {isPage ? <FileText /> : <FilePlus />}
                        {t("dialogs.addNote.submit")}
                    </FormFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
