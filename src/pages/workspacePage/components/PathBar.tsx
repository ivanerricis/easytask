import { Fragment, useMemo, useRef, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { CirclePlus, Columns2, Eye, EyeOff, FileText, Pencil, Search } from "lucide-react"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import {
    Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { useIsActivePage, usePageMode } from "@/contexts/use-page"
import { useIsSplit, useLayoutActions } from "@/contexts/use-layout"
import { usePreferences } from "@/contexts/use-preferences"
import { useShortcutLabel } from "@/contexts/use-shortcuts"
import { useWorkspaceData } from "@/contexts/workspace-data"
import { useDraftOfNote, useDraftSaveStatus, useTemplateDraftActions } from "@/contexts/use-template-drafts"
import { useShortcut } from "@/hooks/use-shortcut"
import { focusRing, ghostIconButtonClass } from "@/lib/a11y"
import { requestAppCommand } from "@/lib/app-commands"
import { requestTreeReveal } from "@/lib/tree-reveal"
import { cn } from "@/lib/utils"
import { getNotePath, type NotePathSegment } from "./sidebar/note-path"
import { DraftSaveStatus } from "./template-draft/DraftSaveStatus"
import { NoteSearchField } from "./NoteSearchField"
import { TagFilterButton } from "./TagFilterButton"
import { useNoteSearchStore } from "./note-search-context"

/** With more segments than this, only the first and the last two are shown, with an ellipsis between them. */
const MAX_SEGMENTS = 4

const shortenPath = (path: NotePathSegment[]): (NotePathSegment | null)[] =>
    path.length > MAX_SEGMENTS ? [path[0], null, ...path.slice(-2)] : path

const NEVER = () => () => {}

/**
 * The bar between the tabs and the groups: the path of the open note (each segment shows its item in the sidebar) and, on
 * the right, the buttons that act on the whole note.
 */
export const PathBar = () => {
    const { t } = useTranslation()
    const activeId = useActiveNoteId()
    const { workspaceDataTree } = useWorkspaceData()
    const { hideCompletedTasks, setHideCompletedTasks } = usePreferences()
    const hideLabel = useShortcutLabel("toggle-hide-completed")
    const newGroupLabel = useShortcutLabel("new-group")
    const searchLabel = useShortcutLabel("search-in-note")
    const splitLabel = useShortcutLabel("toggle-split")
    const isSplit = useIsSplit()
    const { toggleSplit } = useLayoutActions()
    const splitText = isSplit ? t("notes.split.close") : t("notes.split.split")
    const draft = useDraftOfNote(activeId)
    const draftStatus = useDraftSaveStatus(activeId)
    const { retrySave } = useTemplateDraftActions()
    const isPage = useIsActivePage()
    const [pageMode, setPageMode] = usePageMode()
    const pageToggleText = pageMode === "edit" ? t("notes.page.showPreview") : t("notes.page.showText")
    const search = useNoteSearchStore()
    const searchOpen = useSyncExternalStore(search?.subscribe ?? NEVER, () => search?.getState().open ?? false)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Registered once: the bar exists while a note is open, whatever the number of tabs
    useShortcut("toggle-hide-completed", () => setHideCompletedTasks(!hideCompletedTasks), { allowInInputs: true })

    // Opens the search field (it takes the focus when it appears); already open, it takes the focus and selects the query
    useShortcut("search-in-note", () => {
        // A page has no tasks to search
        if (!search || isPage) return
        if (search.getState().open) {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
        } else search.open()
    }, { allowInInputs: true })

    const segments = useMemo(() => {
        if (activeId === null || !workspaceDataTree) return []
        const tree = { rootFolders: workspaceDataTree.rootFolders ?? [], rootNotes: workspaceDataTree.rootNotes ?? [] }
        return shortenPath(getNotePath(tree, activeId))
    }, [activeId, workspaceDataTree])

    return (
        <div className="flex h-8 shrink-0 items-center gap-2 px-2">
            <Breadcrumb aria-label={t("notes.path.label")} className="min-w-0 flex-1">
                <BreadcrumbList className="flex-nowrap gap-1 text-xs sm:gap-1">
                    {draft && (
                        <>
                            <BreadcrumbItem className="shrink-0">{t("templateEditor.pathRoot")}</BreadcrumbItem>
                            <BreadcrumbSeparator className="shrink-0" />
                            <BreadcrumbItem className="min-w-0">
                                <span title={draft.templateName} aria-current="page" className="min-w-0 truncate px-1 font-medium text-foreground">{draft.templateName}</span>
                            </BreadcrumbItem>
                        </>
                    )}
                    {!draft && segments.map((segment, index) => (
                        <Fragment key={segment ? `${segment.type}-${segment.id}` : "ellipsis"}>
                            {index > 0 && <BreadcrumbSeparator className="shrink-0" />}
                            {segment ? (
                                <BreadcrumbItem className="min-w-0">
                                    <BreadcrumbLink asChild>
                                        <button
                                            type="button"
                                            title={segment.name}
                                            aria-label={t("notes.path.reveal", { name: segment.name })}
                                            aria-current={segment.type === "note" ? "page" : undefined}
                                            onClick={() => requestTreeReveal({ type: segment.type, id: segment.id })}
                                            className={cn(focusRing, "min-w-0 cursor-pointer truncate rounded-xs px-1", segment.type === "note" && "font-medium text-foreground")}
                                        >
                                            {segment.name}
                                        </button>
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                            ) : (
                                <BreadcrumbItem><BreadcrumbEllipsis className="size-5" /></BreadcrumbItem>
                            )}
                        </Fragment>
                    ))}
                </BreadcrumbList>
            </Breadcrumb>
            {/* More buttons can be added here */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
                {draft && activeId !== null && <DraftSaveStatus status={draftStatus} onRetry={() => { void retrySave(activeId) }} />}
                {isPage && (
                    <TooltipCustom text={pageToggleText}>
                        <Button type="button" variant="ghost" size="icon" className={cn(ghostIconButtonClass, "[&_svg]:!size-4")}
                            data-testid="page-mode-toggle" aria-label={pageToggleText}
                            onClick={() => setPageMode(pageMode === "edit" ? "preview" : "edit")}>
                            {pageMode === "edit" ? <FileText /> : <Pencil />}
                        </Button>
                    </TooltipCustom>
                )}
                {!isPage && (
                <TooltipCustom text={t("menu.newGroup")} shortcut={newGroupLabel}>
                    <Button type="button" variant="ghost" size="icon" className={cn(ghostIconButtonClass, "[&_svg]:!size-4")}
                        aria-label={t("menu.newGroup")} onClick={() => requestAppCommand("new-group")}>
                        <CirclePlus />
                    </Button>
                </TooltipCustom>
                )}
                {!isPage && search && (searchOpen
                    ? <NoteSearchField store={search} inputRef={searchInputRef} />
                    : <TooltipCustom text={t("notes.noteSearch.inNote")} shortcut={searchLabel}>
                        <Button type="button" variant="ghost" size="icon" className={cn(ghostIconButtonClass, "[&_svg]:!size-4")}
                            aria-label={t("notes.noteSearch.inNote")} onClick={() => search.open()}>
                            <Search />
                        </Button>
                    </TooltipCustom>)}
                {!draft && !isPage && <TagFilterButton />}
                <TooltipCustom text={splitText} shortcut={splitLabel}>
                    <Button type="button" variant="ghost" size="icon" className={cn(ghostIconButtonClass, "[&_svg]:!size-4")}
                        aria-label={splitText} onClick={toggleSplit}>
                        <Columns2 />
                    </Button>
                </TooltipCustom>
                {!isPage && <TooltipCustom text={t("notes.hideCompleted")} shortcut={hideLabel}>
                    <Toggle
                        aria-label={t("notes.hideCompleted")}
                        pressed={hideCompletedTasks}
                        onPressedChange={setHideCompletedTasks}
                        className={cn(ghostIconButtonClass, "min-w-7 p-0")}
                    >
                        {hideCompletedTasks ? <EyeOff /> : <Eye />}
                    </Toggle>
                </TooltipCustom>}
            </div>
        </div>
    )
}
