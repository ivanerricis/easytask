import { useTranslation } from "react-i18next"
import { MenuSub, MenuSubContent, MenuSubTrigger } from "@/components/menu-kind"
import { Palette } from "lucide-react"
import { DialogAddColor, type DialogAddColorProps } from "@/components/dialogs/dialog-add-color"

type ColorSubmenuProps<T> = Omit<DialogAddColorProps<T>, "setDropDownOpen" | "className"> & {
    /** Closes the menu once a color is picked. */
    onDone?: () => void
    /** The text of the submenu; "Change color" when omitted. */
    label?: string
}

/** "Cambia colore" submenu: the color palette of an item, shared by the item menus. */
export const ColorSubmenu = <T extends { id: number, color?: string | null }>({ onDone, label, ...props }: ColorSubmenuProps<T>) => {
    const { t } = useTranslation()
    return (
        <MenuSub>
            <MenuSubTrigger>
                <Palette className="size-4" />
                {label ?? t("menu.changeColor")}
            </MenuSubTrigger>
            <MenuSubContent>
                <DialogAddColor {...props} setDropDownOpen={onDone} />
            </MenuSubContent>
        </MenuSub>
    )
}
