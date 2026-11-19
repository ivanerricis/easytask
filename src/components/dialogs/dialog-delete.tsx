import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "./dialog-confirm"
import { useDeleteItem } from "./use-delete-item"
import { FormError } from "@/components/form-error"
import type { DBItemType } from "@/db/queries/shared_queries"
import { getErrorMessage } from "@/lib/utils"

type DialogDeleteProps<T> = {
    item: T
    itemType: DBItemType
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    getItemId?: number | undefined
    /** Reloads the data after the delete (when the removal is not applied optimistically), with `getItemId` or the item id. */
    getItemData?: (id: number) => Promise<void>
    /** Removes the item from the cached data before the write; returns the function that restores it if the write fails. */
    optimistic?: () => () => void
    /** Key of the "Non chiedermelo più" checkbox (see `SKIP_KEYS`); only for deletes that show the undo toast. */
    skipKey?: string
}

type defaultItemType = {
    id: number
}

export const DialogDeleteItem = <T extends defaultItemType>({ item, itemType, getItemId, isOpen, onOpenChange, getItemData, optimistic, skipKey }: DialogDeleteProps<T>) => {
    const { t } = useTranslation()
    const deleteNow = useDeleteItem({ item, itemType, getItemId, getItemData, optimistic })

    const errorId = useId()
    const [error, setError] = useState<string | null>(null)

    const handleDelete = async () => {
        setError(null)
        try {
            await deleteNow()
            onOpenChange(false)
        } catch (error) {
            setError(t("dialogs.delete.error", { message: getErrorMessage(error) }))
        }
    }

    return (
        <ConfirmDialog
            open={isOpen}
            onOpenChange={(open) => { if (!open) setError(null); onOpenChange(open) }}
            destructive
            autoClose={false}
            skipKey={skipKey}
            confirmDescribedBy={error ? errorId : undefined}
            title={t("dialogs.delete.title")}
            description={t("dialogs.delete.description")}
            confirm={{ label: t("dialogs.delete.confirm"), icon: Trash2, onClick: handleDelete }}
        >
            {error && <FormError id={errorId}>{error}</FormError>}
        </ConfirmDialog>
    )
}
