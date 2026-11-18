import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import React from "react"
import { reportError } from "@/lib/report-error"
import type { DBItemType } from "@/db/queries/shared_queries"
import { getErrorMessage } from "@/lib/utils"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { getItemName, isUndoableType } from "@/contexts/undo/commands"
import { Button } from "@/components/ui/button"
import { ColorPalette } from "@/components/color-palette"
import { GROUP_COLOR_PROGRESS } from "@/lib/colors"

export type DialogAddColorProps<T> = {
    /** The item to color; not needed with `onPick`. */
    item?: T
    itemType?: DBItemType
    getItemId?: number | undefined
    addColorItem?: (itemType: DBItemType, id: number, color?: string) => Promise<void>
    /** Takes over the change (e.g. a color for several items): called with the chosen color, null to remove it. Nothing is saved or recorded here. */
    onPick?: (color: string | null) => void | Promise<void>
    /** Reloads the data after the change; not needed when `addColorItem` updates the cached data itself. */
    getItemData?: (id: number) => Promise<void>
    setDropDownOpen?: (open: boolean) => void
}

type defaultItemType = {
    id: number
    color?: string | null | undefined
}

export const DialogAddColor = <T extends defaultItemType>({ item, itemType, getItemId, addColorItem, onPick, getItemData, setDropDownOpen }: DialogAddColorProps<T>) => {
    const { t } = useTranslation()
    const recorder = useUndoRecorder()
    // Reloading needs the id; without a reload hook the change is saved as is
    const canSave = !getItemData || !!getItemId

    // Saves the color (null removes it); closes the menu first, so the click does not reach the row below
    const apply = async (color: string | null) => {
        if (setDropDownOpen) setDropDownOpen(false)
        try {
            if (onPick) {
                await onPick(color)
            } else if (item && itemType && addColorItem && canSave && (color === null ? item.color : item.color !== color)) {
                if (color === null) await addColorItem(itemType, item.id)
                else await addColorItem(itemType, item.id, color)
                if (getItemData && getItemId) await getItemData(getItemId)
                if (isUndoableType(itemType)) recorder.color(itemType, item.id, getItemName(item), item.color ?? null, color)
            }
        } catch (err) {
            reportError(err, getErrorMessage(err))
        }
    }

    const handleSaveColor = (color: string, e?: React.MouseEvent) => {
        e?.stopPropagation()
        return apply(color)
    }

    const handleDeleteColor = (e: React.MouseEvent) => {
        e.stopPropagation()
        return apply(null)
    }

    return (
        <div className="flex flex-col rounded-xs">
            {/* The automatic color of a group is a rule, not a swatch: no swatch is marked (nor the "+" one) */}
            <ColorPalette value={item?.color === GROUP_COLOR_PROGRESS ? null : item?.color} onPick={handleSaveColor} />
            <div className="flex items-center p-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteColor}
                    className="w-full justify-start text-xs"
                >
                    <X />
                    {t("details.noColor")}
                </Button>
            </div>
        </div>
    )
}
