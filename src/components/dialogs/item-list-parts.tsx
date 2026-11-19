import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDelayedFlag } from "@/hooks/use-delayed-flag"
import { ITEM_ICONS } from "./item-list-utils"
import { NAV_TAB_TRIGGER } from "./nav-tab"
import { cn } from "@/lib/utils"
import { FormError } from "@/components/form-error"

type ItemRowProps = {
    icon: LucideIcon
    name: string
    /** Replaces the plain text of the name (e.g. a name that is renamed in place); `name` stays the title and the fallback. */
    nameSlot?: ReactNode
    /** Second line (more lines as an array): where the item was, what it contains and when. */
    details: string | readonly string[]
    /** The action buttons of the row. */
    children: ReactNode
}

/** A row of the trash / archive / templates lists: icon, name with details, and the actions on the right. */
export const ItemRow = ({ icon: Icon, name, nameSlot, details, children }: ItemRowProps) => (
    <div className="flex items-center gap-2 rounded-xs border p-2">
        <Icon className="size-4 shrink-0" />
        <div className="flex flex-col min-w-0 flex-1">
            {nameSlot ?? <span className="truncate text-sm" title={name}>{name}</span>}
            {(typeof details === "string" ? [details] : details).map((line, index) => (
                <span key={index} className="truncate text-sm text-muted-foreground" title={line}>
                    {line}
                </span>
            ))}
        </div>
        {children}
    </div>
)

type RowAction = {
    icon: LucideIcon
    /** Text of the tooltip. */
    tooltip: string
    /** Accessible name of the button (with the name of the item). */
    ariaLabel: string
    onClick: () => void
}

type ItemRowActionsProps = {
    /** The outline button on the left (restore). */
    restore: RowAction
    /** The destructive button on the right (delete, move to the trash). */
    remove: RowAction
    disabled?: boolean
}

/** The pair of icon buttons of a row of the trash / archive: restore and (destructive) remove, each with its tooltip. */
export const ItemRowActions = ({ restore, remove, disabled }: ItemRowActionsProps) => (
    <>
        {([["outline", restore], ["destructive", remove]] as const).map(([variant, action]) => (
            <TooltipCustom key={variant} text={action.tooltip}>
                <Button variant={variant} size="icon" aria-label={action.ariaLabel} disabled={disabled} onClick={action.onClick}>
                    <action.icon />
                </Button>
            </TooltipCustom>
        ))}
    </>
)

/** The message of an empty list of a list dialog. */
export const ListEmpty = ({ children }: { children: ReactNode }) => (
    <p className="py-6 text-center text-muted-foreground text-sm">{children}</p>
)

/** One row of {@link ListSkeleton}: the shape of an {@link ItemRow} (icon, two lines, two action buttons). */
const RowSkeleton = () => (
    <div className="flex items-center gap-2 rounded-xs border p-2">
        <Skeleton className="size-4 shrink-0" />
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
        </div>
        <Skeleton className="size-9 shrink-0" />
        <Skeleton className="size-9 shrink-0" />
    </div>
)

/**
 * The loading state of a list dialog: rows shaped like the real ones, shown only when the load lasts long enough to be
 * noticed (before that the space stays empty, so a fast load does not flash). Announced to screen readers.
 */
export const ListSkeleton = ({ rows = 5 }: { rows?: number }) => {
    const { t } = useTranslation()
    const shown = useDelayedFlag(true)
    return (
        <div role="status" aria-busy="true" className="flex flex-col gap-1">
            {/* Visible together with the skeleton rows (the same delay), read out from the start */}
            <span className={shown ? "px-1 pb-1 text-sm text-muted-foreground" : "sr-only"}>{t("common.loading")}</span>
            {shown && Array.from({ length: rows }, (_, index) => <RowSkeleton key={index} />)}
        </div>
    )
}

/** The failed load of a list dialog: the error with a way to try again (instead of a misleading "empty" message). */
export const ListError = ({ message, onRetry }: { message: string, onRetry: () => void }) => {
    const { t } = useTranslation()
    return (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
            <FormError>{message}</FormError>
            <Button variant="outline" size="sm" onClick={onRetry}>{t("common.retry")}</Button>
        </div>
    )
}

/** The two columns of {@link TypeTabs} (and of its skeleton): the left one has the separator that runs the whole height. */
const TWO_COLUMNS = "grid h-full min-h-0 gap-0 max-sm:grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[14rem_minmax(0,1fr)]"
const LEFT_COLUMN = "flex flex-col gap-4 p-6 max-sm:border-b max-sm:pb-3 sm:overflow-y-auto sm:border-r"
const RIGHT_COLUMN = "flex min-h-0 min-w-0 flex-col gap-4 p-6"

type TypeTabsProps<T extends keyof typeof ITEM_ICONS> = {
    types: readonly T[]
    active: T
    onSelect: (type: T) => void
    count: (type: T) => number
    label: (type: T) => string
    ariaLabel: string
    /** Top of the left column, above the tabs (the title of the dialog). */
    heading: ReactNode
    /** Top of the right column, above the panel (the description of the dialog). */
    description: ReactNode
    /** Bottom of the right column, under the panel (errors and the buttons of the dialog). */
    footer: ReactNode
    /** The content of the selected tab (the panel). */
    children: ReactNode
}

/**
 * The whole body of the trash / archive dialogs when they have tabs (the DialogContent must have no padding): vertical tabs,
 * one per kind of item with its count, and the panel of the selected one. Arrows move between the tabs.
 * Two columns, like the settings: title and tabs on the left, whose right border is the separator and runs the whole height of
 * the dialog; description, panel and buttons on the right.
 */
export function TypeTabs<T extends keyof typeof ITEM_ICONS>({ types, active, onSelect, count, label, ariaLabel, heading, description, footer, children }: TypeTabsProps<T>) {
    return (
        <Tabs
            orientation="vertical"
            value={active}
            onValueChange={value => onSelect(value as T)}
            className={TWO_COLUMNS}
        >
            <div className={LEFT_COLUMN}>
                {heading}
                <TabsList
                    variant="line"
                    aria-label={ariaLabel}
                    className="w-full shrink-0 max-sm:flex-row max-sm:flex-wrap sm:h-fit sm:justify-start sm:self-start gap-1 p-0"
                >
                    {types.map(type => {
                        const TypeIcon: LucideIcon = ITEM_ICONS[type]
                        return (
                            <TabsTrigger
                                key={type}
                                value={type}
                                data-type={type}
                                className={cn("flex-none sm:flex-1", NAV_TAB_TRIGGER)}
                            >
                                <TypeIcon />
                                {label(type)}
                                <span className="ml-auto text-xs text-muted-foreground">{count(type)}</span>
                            </TabsTrigger>
                        )
                    })}
                </TabsList>
            </div>
            <div className={RIGHT_COLUMN}>
                {description}
                <TabsContent value={active} className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1 flex flex-col gap-1">
                    {children}
                </TabsContent>
                {footer}
            </div>
        </Tabs>
    )
}

type TypeTabsSkeletonProps = {
    heading: ReactNode
    description: ReactNode
    footer: ReactNode
    /** How many tabs to draw (the kinds of items of the dialog). */
    tabs: number
}

/**
 * The loading state of the trash / archive dialogs: the very layout of {@link TypeTabs} (so nothing moves when the items
 * arrive), with tabs and rows drawn as skeletons once the load lasts long enough to be noticed.
 */
export const TypeTabsSkeleton = ({ heading, description, footer, tabs }: TypeTabsSkeletonProps) => {
    const shown = useDelayedFlag(true)
    return (
        <div className={TWO_COLUMNS}>
            <div className={LEFT_COLUMN}>
                {heading}
                <div aria-hidden className="flex flex-col gap-1 max-sm:flex-row max-sm:flex-wrap">
                    {shown && Array.from({ length: tabs }, (_, index) => (
                        <div key={index} className="flex items-center gap-2 px-3 py-2">
                            <Skeleton className="size-4 shrink-0" />
                            <Skeleton className="h-3.5 flex-1" />
                            <Skeleton className="h-3 w-5 shrink-0" />
                        </div>
                    ))}
                </div>
            </div>
            <div className={RIGHT_COLUMN}>
                {description}
                <div className="min-h-0 flex-1 overflow-hidden pr-1">
                    <ListSkeleton />
                </div>
                {footer}
            </div>
        </div>
    )
}
