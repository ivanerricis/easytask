import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Briefcase, Download, FileText, Folder, Loader2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogFooterActions, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormError } from "@/components/form-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useFormSubmit } from "@/components/use-form-submit"
import type { ImportName } from "@/lib/workspace-transfer"

const ICONS: Record<ImportName["type"], LucideIcon> = { workspace: Briefcase, folder: Folder, note: FileText }

type DialogImportNamesProps = {
    /** What the import creates at the top, with the proposed (free) names. */
    proposed: ImportName[]
    /** Imports with the chosen names; a rejection (e.g. a name already taken) is shown and the dialog stays open. */
    onSubmit: (names: string[]) => Promise<void>
    onCancel: () => void
}

/**
 * Shows the names an import is about to create, editable, before anything is written.
 * @category Dialogs
 */
export const DialogImportNames = ({ proposed, onSubmit, onCancel }: DialogImportNamesProps) => {
    const { t } = useTranslation()
    const baseId = useId()
    const errorId = useId()
    const [names, setNames] = useState(() => proposed.map(item => item.name))
    const { busy: saving, error, setError, submit } = useFormSubmit(async () => {
        if (names.some(name => !name.trim())) return
        await onSubmit(names)
    })
    const blank = names.some(name => !name.trim())
    const message = error ?? (blank ? t("errors.nameEmpty") : null)

    return (
        <Dialog open onOpenChange={open => { if (!open && !saving) onCancel() }}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>{t("transfer.namesTitle")}</DialogTitle>
                        <DialogDescription>{t("transfer.namesDescription")}</DialogDescription>
                    </DialogHeader>
                    {/* A long list (many top items) scrolls inside the dialog */}
                    <div className="scroll-inset grid gap-3 max-h-[50vh] overflow-y-auto -mx-1 px-1 py-1">
                        {proposed.map((item, index) => {
                            const Icon = ICONS[item.type]
                            const id = `${baseId}-${index}`
                            return (
                                <div key={id} className="grid gap-1.5">
                                    <Label htmlFor={id} className="flex items-center gap-2">
                                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                        {t(`transfer.names.${item.type}`)}
                                    </Label>
                                    <Input
                                        id={id}
                                        value={names[index]}
                                        autoFocus={index === 0}
                                        onFocus={e => { if (index === 0) e.currentTarget.select() }}
                                        readOnly={saving}
                                        // A refused import names no field: the message belongs to all of them; an empty name only to itself
                                        aria-invalid={error || !names[index].trim() ? true : undefined}
                                        aria-describedby={error || !names[index].trim() ? errorId : undefined}
                                        onChange={e => {
                                            const value = e.target.value
                                            setError(null)
                                            setNames(current => current.map((name, i) => i === index ? value : name))
                                        }}
                                    />
                                </div>
                            )
                        })}
                    </div>
                    <FormError id={errorId}>{message}</FormError>
                    <DialogFooter>
                        <DialogFooterActions>
                            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>{t("common.cancel")}</Button>
                            <Button type="submit" disabled={saving || blank} aria-busy={saving || undefined}>
                                {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}
                                {t("transfer.importAction")}
                            </Button>
                        </DialogFooterActions>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
