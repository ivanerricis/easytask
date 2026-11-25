import { useTranslation } from "react-i18next"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useShortcut } from "@/hooks/use-shortcut"
import { useShortcutLabel } from "@/contexts/use-shortcuts"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { FormFooter } from "@/components/form-footer"
import { NameField } from "@/components/name-field"
import { useFormSubmit } from "@/components/use-form-submit"
import { OptionalColorField } from "@/components/optional-color-field"
import { useWorkspace } from "@/contexts/use-workspace"
import { Plus } from "lucide-react"
import { useState } from "react"

export function DialogCreateWorkspace() {
    const { t } = useTranslation()
    const [name, setName] = useState("")
    const [color, setColor] = useState<string | undefined>(undefined)
    const [isOpen, setIsOpen] = useState(false)
    const { createWorkspace, getWorkspaces } = useWorkspace()

    useShortcut("new-workspace", () => setIsOpen(true), { allowInInputs: true })
    const shortcutLabel = useShortcutLabel("new-workspace")

    const { busy: saving, error, setError, submit } = useFormSubmit(async () => {
        if (name.trim() === "") return
        await createWorkspace(name.trim(), color)
        await getWorkspaces()
        setIsOpen(false)
        setName("")
        setColor(undefined)
    })

    const handleCancel = () => {
        setName("")
        setColor(undefined)
        setError(null)
        setIsOpen(false)
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={open => { if (open) setIsOpen(true); else handleCancel() }}>
                <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{t("home.createWorkspace.title")}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <div className="grid gap-4">
                            <div className="grid gap-3">
                                <NameField
                                    label={t("home.createWorkspace.name")}
                                    value={name}
                                    error={error}
                                    onChange={value => {
                                        setError(null)
                                        setName(value)
                                    }}
                                >
                                    <OptionalColorField value={color} onChange={setColor} />
                                </NameField>
                            </div>
                        </div>
                        <FormFooter onCancel={handleCancel} disabled={!name.trim() || saving}>
                            <Plus />
                            {t("home.createWorkspace.title")}
                        </FormFooter>
                    </form>
                </DialogContent>
            </Dialog >

            <TooltipCustom text={t("home.createWorkspace.title")} shortcut={shortcutLabel}>
                <Button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center justify-center w-full min-w-0 p-6 rounded-xs gap-2 text-lg transition-colors"
                >
                    <Plus className="h-5! w-5!" />
                    {t("home.createWorkspace.open")}
                </Button>
            </TooltipCustom>
        </>
    )
}