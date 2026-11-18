import { LayoutTemplate } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useState } from "react"
import { toast } from "sonner"
import { DialogFormShell } from "./dialog-form-shell"
import { FormFooter } from "@/components/form-footer"
import { NameField } from "@/components/name-field"
import { useFormSubmit } from "@/components/use-form-submit"
import { useWorkspaceActions } from "@/contexts/workspace-data"

type CreatedTemplate = { id: number, name: string }

type DialogCreateTemplateProps = {
    /** The source note (only id and name are used). */
    note: { id: number, name: string }
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    /** Called after the template was created, with its id and name (e.g. to reload a list of templates). */
    onCreated?: (template: CreatedTemplate) => void
}

type TemplateFormProps = {
    /** The name the field starts with. */
    initialName: string
    /** Creates the template with the (trimmed) name and resolves with its id. */
    create: (name: string) => Promise<number>
    onOpenChange: (open: boolean) => void
    onCreated?: (template: CreatedTemplate) => void
}

// Mounted only while the dialog is open, so the name always starts from the initial name
const TemplateForm = ({ initialName, create, onOpenChange, onCreated }: TemplateFormProps) => {
    const { t } = useTranslation()
    const [name, setName] = useState(initialName)
    const { busy, error, setError, submit } = useFormSubmit(async () => {
        if (!name.trim()) return
        const id = await create(name.trim())
        toast.success(t("dialogs.createTemplate.created"))
        onCreated?.({ id, name: name.trim() })
        onOpenChange(false)
    })

    return (
        <form onSubmit={submit} className="grid gap-3">
            <NameField
                label={t("dialogs.createTemplate.name")}
                value={name}
                autoFocus
                // The prefilled name is selected: typing replaces it
                selectOnFocus
                error={error}
                onChange={value => {
                    setError(null)
                    setName(value)
                }}
            />
            <FormFooter onCancel={() => onOpenChange(false)} disabled={!name.trim() || busy}>
                <LayoutTemplate />
                {t("dialogs.createTemplate.title")}
            </FormFooter>
        </form>
    )
}

/**
 * Creates a template from a note: an exact copy of its current content (groups, sections, tasks and subtasks;
 * deleted items and audio files are not included). Opened from the note menu, or from the Template dialog after choosing the note.
 * @category Dialogs
 */
export const DialogCreateTemplate = ({ note, isOpen, onOpenChange, onCreated }: DialogCreateTemplateProps) => {
    const { t } = useTranslation()
    const { createTemplateFromNote } = useWorkspaceActions()
    return (
        <DialogFormShell
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            title={t("dialogs.createTemplate.title")}
            description={t("dialogs.createTemplate.description", { name: note.name })}
        >
            <TemplateForm initialName={note.name} create={name => createTemplateFromNote(note.id, name)} onOpenChange={onOpenChange} onCreated={onCreated} />
        </DialogFormShell>
    )
}

type DialogCreateEmptyTemplateProps = {
    /** The workspace the template belongs to. */
    workspaceId: number
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    /** Called after the template was created (the Templates dialog opens it in the editor). */
    onCreated?: (template: CreatedTemplate) => void
}

/**
 * Creates an empty template: only the name is asked, the content is added in the template editor.
 * @category Dialogs
 */
export const DialogCreateEmptyTemplate = ({ workspaceId, isOpen, onOpenChange, onCreated }: DialogCreateEmptyTemplateProps) => {
    const { t } = useTranslation()
    const { createEmptyTemplate } = useWorkspaceActions()
    return (
        <DialogFormShell
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            title={t("dialogs.createTemplate.emptyTitle")}
            description={t("dialogs.createTemplate.emptyDescription")}
        >
            <TemplateForm initialName="" create={name => createEmptyTemplate(workspaceId, name)} onOpenChange={onOpenChange} onCreated={onCreated} />
        </DialogFormShell>
    )
}
