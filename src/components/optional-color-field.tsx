import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Palette } from "lucide-react"
import { cn } from "@/lib/utils"
import { textColorOn } from "@/lib/accent-color"
import { Button } from "@/components/ui/button"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DialogAddColor } from "@/components/dialogs/dialog-add-color"

type OptionalColorFieldProps = {
    /** The chosen color; undefined while no color is wanted. */
    value: string | undefined
    onChange: (color: string | undefined) => void
}

/**
 * Palette button for the creation dialogs, next to the name: it opens the usual color palette of the menus and takes the
 * color that was chosen. Without a color it shows a palette icon on a dashed border.
 */
export const OptionalColorField = ({ value, onChange }: OptionalColorFieldProps) => {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const label = value ? t("menu.changeColor") : t("common.addColor")

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <TooltipCustom text={label}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={label}
                        className={cn("size-9 shrink-0", !value && "border-dashed")}
                        style={value ? { backgroundColor: value } : undefined}
                    >
                        <Palette className={value ? undefined : "text-muted-foreground"} style={value ? { color: textColorOn(value) } : undefined} />
                    </Button>
                </PopoverTrigger>
            </TooltipCustom>
            <PopoverContent side="left" align="start" collisionPadding={8} className="w-auto p-1">
                <DialogAddColor
                    item={{ id: 0, color: value }}
                    onPick={color => onChange(color ?? undefined)}
                    setDropDownOpen={setOpen}
                />
            </PopoverContent>
        </Popover>
    )
}
