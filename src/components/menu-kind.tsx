import * as React from "react"
import {
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import {
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
} from "@/components/ui/context-menu"

/**
 * The same item list is shown by the "…" button (DropdownMenu) and by the right click (ContextMenu).
 * The Menu* primitives below render the DropdownMenu or ContextMenu flavour depending on the menu they are in,
 * so an item list is written once. Outside any provider they fall back to the dropdown flavour.
 */
type MenuKind = "dropdown" | "context"

const MenuKindContext = React.createContext<MenuKind>("dropdown")

export const MenuKindProvider = MenuKindContext.Provider

const useMenuKind = () => React.useContext(MenuKindContext)

export function MenuGroup(props: React.ComponentProps<typeof DropdownMenuGroup>) {
    return useMenuKind() === "context" ? <ContextMenuGroup {...props} /> : <DropdownMenuGroup {...props} />
}

export function MenuItem(props: React.ComponentProps<typeof DropdownMenuItem>) {
    return useMenuKind() === "context" ? <ContextMenuItem {...props} /> : <DropdownMenuItem {...props} />
}

export function MenuRadioGroup(props: React.ComponentProps<typeof DropdownMenuRadioGroup>) {
    return useMenuKind() === "context" ? <ContextMenuRadioGroup {...props} /> : <DropdownMenuRadioGroup {...props} />
}

export function MenuRadioItem(props: React.ComponentProps<typeof DropdownMenuRadioItem>) {
    return useMenuKind() === "context" ? <ContextMenuRadioItem {...props} /> : <DropdownMenuRadioItem {...props} />
}

export function MenuSeparator(props: React.ComponentProps<typeof DropdownMenuSeparator>) {
    return useMenuKind() === "context" ? <ContextMenuSeparator {...props} /> : <DropdownMenuSeparator {...props} />
}

export function MenuShortcut(props: React.ComponentProps<typeof DropdownMenuShortcut>) {
    return useMenuKind() === "context" ? <ContextMenuShortcut {...props} /> : <DropdownMenuShortcut {...props} />
}

export function MenuSub(props: React.ComponentProps<typeof DropdownMenuSub>) {
    return useMenuKind() === "context" ? <ContextMenuSub {...props} /> : <DropdownMenuSub {...props} />
}

export function MenuSubTrigger(props: React.ComponentProps<typeof DropdownMenuSubTrigger>) {
    return useMenuKind() === "context" ? <ContextMenuSubTrigger {...props} /> : <DropdownMenuSubTrigger {...props} />
}

export function MenuSubContent(props: React.ComponentProps<typeof DropdownMenuSubContent>) {
    return useMenuKind() === "context" ? <ContextMenuSubContent {...props} /> : <DropdownMenuSubContent {...props} />
}
