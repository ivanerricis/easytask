import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { MenuSub, MenuSubContent, MenuSubTrigger } from "@/components/menu-kind"
import { Palette } from "lucide-react"
import { DialogAddColor, type DialogAddColorProps } from "@/components/dialogs/dialog-add-color"

type ColorSubmenuProps<T> = Omit<DialogAddColorProps<T>, "setDropDownOpen" | "className"> & {
    /** Closes the menu once a color is picked. */
    onDone?: () => void
    /** The text of the submenu; "Change color" when omitted. */
    label?: string
    /** An entry above the palette (e.g. the automatic color of a group); it closes the menu itself. */
    header?: ReactNode
}

/** "Cambia colore" submenu: the color palette of an item, shared by the item menus. */
export const ColorSubmenu = <T extends { id: number, color?: string | null }>({ onDone, label, header, ...props }: ColorSubmenuProps<T>) => {
    const { t } = useTranslation()
    return (
        <MenuSub>
            <MenuSubTrigger>
                <Palette className="size-4" />
                {label ?? t("menu.changeColor")}
            </MenuSubTrigger>
            <MenuSubContent className="p-1">
                {header}
                <DialogAddColor {...props} setDropDownOpen={onDone} />
            </MenuSubContent>
        </MenuSub>
    )
}
