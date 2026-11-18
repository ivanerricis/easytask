import { useTranslation } from "react-i18next"
import * as React from "react"
import { EllipsisVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { ItemMenuState } from "@/hooks/use-item-menu-state"
import { MenuKindProvider } from "@/components/menu-kind"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"

type ItemMenuContextValue = {
    state: ItemMenuState
    items: ItemMenuItems
    contentClassName?: string
    onCloseAutoFocus?: (event: Event) => void
}

/** The entries, or a function building them (called only while a menu is open, so closed menus build no JSX). */
export type ItemMenuItems = React.ReactNode | (() => React.ReactNode)

const renderItems = (items: ItemMenuItems) => typeof items === "function" ? items() : items

const ItemMenuContext = React.createContext<ItemMenuContextValue | null>(null)

type ItemMenuProps = {
    state: ItemMenuState
    /** Menu entries, written once with the Menu* primitives: shown by both the "…" button and the right click. A function is called only while the menu is open. */
    items: ItemMenuItems
    /** Dialogs opened by the entries; rendered outside the row so they never receive the row's events. */
    dialogs?: React.ReactNode
    contentClassName?: string
    onCloseAutoFocus?: (event: Event) => void
    /** The row: a single element. A right click anywhere on it opens the menu at the pointer. */
    children: React.ReactElement
}

// Right click inside a writable text field or on the (portaled) menu content does not open the item menu
// (a read only field, like the text of a task before it is edited, is just text of the row)
const ignoreContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const field = target.closest<HTMLInputElement>("input, textarea, [contenteditable='true']")
    if (!event.currentTarget.contains(target) || (field && !field.readOnly)) {
        event.preventDefault()
    }
}

/**
 * Wraps the row of an item: right click on it opens the item menu at the cursor.
 * The "…" button inside the row is an {@link ItemMenuButton}, which opens the very same entries.
 */
export const ItemMenu = ({ state, items, dialogs, contentClassName, onCloseAutoFocus, children }: ItemMenuProps) => {
    const value = React.useMemo(
        () => ({ state, items, contentClassName, onCloseAutoFocus }),
        [state, items, contentClassName, onCloseAutoFocus],
    )

    return (
        <ItemMenuContext.Provider value={value}>
            <ContextMenu open={state.contextOpen} onOpenChange={state.setContextOpen}>
                {/* data-contextmenu: the read-only text of the row (a task text) belongs to this menu, the text menu stays out of it */}
                <ContextMenuTrigger asChild onContextMenu={ignoreContextMenu} data-contextmenu="">
                    {children}
                </ContextMenuTrigger>
                <ContextMenuContent
                    onClick={(e) => e.stopPropagation()}
                    className={contentClassName}
                    onCloseAutoFocus={onCloseAutoFocus}
                >
                    <MenuKindProvider value="context">{renderItems(items)}</MenuKindProvider>
                </ContextMenuContent>
            </ContextMenu>
            {dialogs}
        </ItemMenuContext.Provider>
    )
}

type ItemMenuButtonProps = {
    className?: string
    /** Box and icon size: "icon-sm" (24px, icon 16px, default) or "icon-xs" (20px, icon 14px, for compact rows). */
    size?: "icon-sm" | "icon-xs"
    /** Accessible name of the button (wins over `name`). */
    label?: string
    /** Name of the item: the button is called "Menu: <name>", so the buttons of a list can be told apart. */
    name?: string
    /** -1 takes the button out of the tab order (the rows of the sidebar tree have a single tab stop). */
    tabIndex?: number
}

/** The "…" button of an item (inside an {@link ItemMenu}): opens the item menu below the button. */
export const ItemMenuButton = ({ className, size = "icon-sm", label, name, tabIndex }: ItemMenuButtonProps) => {
    const { t } = useTranslation()
    const menu = React.useContext(ItemMenuContext)
    if (!menu) return null
    const { state, items, contentClassName, onCloseAutoFocus } = menu
    const accessibleName = label ?? (name?.trim() ? t("common.menuOf", { name: name.trim() }) : t("common.openMenu"))

    return (
        <DropdownMenu open={state.dropdownOpen} onOpenChange={state.setDropdownOpen}>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size={size} aria-label={accessibleName} onClick={(e) => e.stopPropagation()} tabIndex={tabIndex} className={cn("relative after:absolute after:-inset-1 after:content-['']", className)}><EllipsisVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                onClick={(e) => e.stopPropagation()}
                className={contentClassName}
                onCloseAutoFocus={onCloseAutoFocus}
            >
                <MenuKindProvider value="dropdown">{renderItems(items)}</MenuKindProvider>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
