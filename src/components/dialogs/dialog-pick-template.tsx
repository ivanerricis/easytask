import { LoadingDots } from "@/components/loading-dots"
import { useTranslation } from "react-i18next"
import { LayoutTemplate } from "lucide-react"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { countTemplateContent, type NoteTemplate } from "@/types/template"
import { FormError } from "@/components/form-error"
import { useOpenList } from "./use-open-list"

type DialogPickTemplateProps = {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    /** Called with the chosen template; the dialog closes itself. */
    onPick: (template: NoteTemplate) => void
}

/**
 * Lets the user choose one of the templates of the open workspace, with a search box (to create a note from it).
 * @category Dialogs
 */
export const DialogPickTemplate = ({ isOpen, onOpenChange, onPick }: DialogPickTemplateProps) => {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    const { getTemplates } = useWorkspaceActions()
    const workspaceID = currentWorkspace?.id
    const { items: templates, isLoading, loadError: error } = useOpenList<NoteTemplate>({
        isOpen,
        resetKey: workspaceID,
        load: async () => workspaceID === undefined ? [] : getTemplates(workspaceID),
    })

    return (
        <CommandDialog
            open={isOpen}
            onOpenChange={onOpenChange}
            title={t("dialogs.pickTemplate.title")}
            description={t("dialogs.pickTemplate.description")}
            className="rounded-xs"
        >
            <CommandInput placeholder={t("dialogs.pickTemplate.placeholder")} />
            <CommandList>
                {error && <FormError className="px-3 py-2 text-xs">{error}</FormError>}
                {isLoading && <p role="status" aria-busy="true" className="px-3 py-6 text-center text-sm text-muted-foreground">{t("common.loading")}<LoadingDots /></p>}
                {!isLoading && !error && <CommandEmpty>{templates.length === 0 ? t("dialogs.pickTemplate.none") : t("common.noResults")}</CommandEmpty>}
                <CommandGroup heading={t("dialogs.pickTemplate.heading")}>
                    {templates.map(template => {
                        const counts = countTemplateContent(template.content)
                        return (
                            <CommandItem
                                className="!p-2"
                                key={template.id}
                                value={`${template.name} ${template.id}`}
                                onSelect={() => {
                                    onOpenChange(false)
                                    onPick(template)
                                }}
                            >
                                <LayoutTemplate className="size-4" />
                                <span className="truncate">{template.name}</span>
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                    {t("common.counts.task", { count: counts.tasks })}
                                </span>
                            </CommandItem>
                        )
                    })}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    )
}
