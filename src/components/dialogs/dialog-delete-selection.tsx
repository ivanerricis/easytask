import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { ConfirmDialog } from "./dialog-confirm"
import { SKIP_KEYS } from "./use-skipped-confirm"
import { useTrashTreeItems } from "./use-trash-tree-items"
import type { TreeItemRef } from "@/contexts/undo/commands"
import { getErrorMessage } from "@/lib/utils"
import { FormError } from "@/components/form-error"

type DialogDeleteSelectionProps = {
    /** The folders and notes to move to the trash (already reduced to the top-most ones). */
    items: TreeItemRef[]
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * One confirmation for the delete of several folders/notes: they all go to the trash and ONE undo step brings them back.
 * When one of them fails the dialog stays open with the error; the ones already trashed stay trashed (and are undoable),
 * a retry only deals with the rest.
 */
export const DialogDeleteSelection = ({ items, isOpen, onOpenChange }: DialogDeleteSelectionProps) => {
    const { t } = useTranslation()
    const trashItems = useTrashTreeItems()
    const [error, setError] = useState<string | null>(null)
    // Trashed by an earlier attempt of this same confirmation
    const trashed = useRef(new Set<string>())

    const handleDelete = async () => {
        setError(null)
        try {
            await trashItems(items, trashed.current)
            onOpenChange(false)
        } catch (err) {
            setError(t("dialogs.deleteSelection.error", { done: trashed.current.size, total: items.length, message: getErrorMessage(err) }))
        }
    }

    return (
        <ConfirmDialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    setError(null)
                    trashed.current.clear()
                }
                onOpenChange(open)
            }}
            destructive
            autoClose={false}
            skipKey={SKIP_KEYS.treeSelectionTrash}
            title={t("dialogs.delete.title")}
            description={t("dialogs.deleteSelection.description", { count: items.length })}
            confirm={{ label: t("dialogs.deleteSelection.confirm", { count: items.length }), icon: Trash2, onClick: handleDelete }}
        >
            {error && <FormError>{error}</FormError>}
        </ConfirmDialog>
    )
}
