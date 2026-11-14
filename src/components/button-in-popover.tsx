import { MenuItem, MenuShortcut } from "@/components/menu-kind"
import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Download, FilePlus, FileText, FileX, FolderInput, FolderPlus, Info, ImagePlus, Link2, LayoutTemplate, ListPlus, Music, OctagonAlert, OctagonX, PaintBucket, Palette, Pen, SquareArrowOutUpRight, Trash2, Upload, Zap, ListCollapse, ListChevronsUpDown, Eye, EyeOff, Columns3, Rows3, X, PanelLeft, PanelRight } from "lucide-react"
import React from "react"
import { cn } from "@/lib/utils"

type ButtonInPopoverProps = {
    text: string
    /** The icon of the entry: only the names of the map below (a typo is a compile error, not a "?" icon). */
    type: ButtonInPopoverIcon
    children?: React.ReactNode
    className?: string
    destructive?: boolean
    /** Greyed out and not clickable (e.g. "Move up" on the first item). */
    disabled?: boolean
    /** Keys of the shortcut, shown right-aligned. */
    shortcut?: string[]
    /** Drawn attention to (e.g. "Update path" of a file that is missing). */
    highlight?: boolean
    onClick?: () => void | Promise<void>
}

const iconMap = {
    open: SquareArrowOutUpRight,
    openRight: PanelRight,
    openLeft: PanelLeft,
    details: Info,
    addFolder: FolderPlus,
    addNote: FilePlus,
    rename: Pen,
    color: Palette,
    move: FolderInput,
    moveUp: ArrowUp,
    moveDown: ArrowDown,
    moveLeft: ArrowLeft,
    moveRight: ArrowRight,
    colorContent: PaintBucket,
    addPriority: OctagonAlert,
    removePriority: OctagonX,
    addDescription: FileText,
    removeDescription: FileX,
    addSubtask: ListPlus,
    addAudio: Music,
    addMedia: ImagePlus,
    createTemplate: LayoutTemplate,
    duplicate: Copy,
    export: Upload,
    import: Download,
    relink: Link2,
    archive: Archive,
    automations: Zap,
    collapseAll: ListCollapse,
    expandAll: ListChevronsUpDown,
    delete: Trash2,
    addGroup: Columns3,
    hideCompleted: EyeOff,
    showCompleted: Eye,
    addSection: Rows3,
    close: X,
} satisfies Record<string, React.ElementType>

export type ButtonInPopoverIcon = keyof typeof iconMap

export const ButtonInPopover = React.memo(({ text, type, children, className, destructive, disabled, shortcut, highlight, onClick }:ButtonInPopoverProps) => {
    const IconComponent = iconMap[type]

    return (
        <MenuItem
            variant={destructive ? "destructive" : "default"}
            disabled={disabled}
            className={cn(highlight && "bg-primary/10 font-medium text-primary", className)}
            data-highlight={highlight ? "true" : undefined}
            onSelect={() => { void onClick?.() }}
        >
            <IconComponent />
            {text}
            {children}
            {shortcut && shortcut.length > 0 && <MenuShortcut>{shortcut.join(" + ")}</MenuShortcut>}
        </MenuItem>
    )
})
