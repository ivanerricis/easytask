import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import { useState } from "react"
import { ArchiveRestore, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "./dialog-confirm"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogFooterActions, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormError } from "@/components/form-error"
import { ItemRow, ItemRowActions, ListEmpty, ListError, TypeTabs, TypeTabsSkeleton } from "./item-list-parts"
import { useOpenList } from "./use-open-list"
import { useWorkspaceRefresh } from "./use-workspace-refresh"
import { ITEM_ICONS, formatStoredDate } from "./item-list-utils"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import type { ArchiveItem, ArchiveItemType } from "@/types/types"

/** The kinds of items that can be archived, in the order of the tabs. */
const TYPES: ArchiveItemType[] = ["folder", "note", "section_group", "section", "task"]

// Second line of a row: where it was, what it contained and when it was archived
const details = (item: ArchiveItem) =>
    [item.context, item.summary, i18n.t("archive.archivedOn", { date: formatStoredDate(item.archived_at) })].filter(Boolean).join(" · ")

type DialogArchiveProps = {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

/** Archive of the current workspace: one tab per type of item (folders, notes, groups, sections, tasks) with restore and move to the trash. */
export const DialogArchive = ({ isOpen, onOpenChange }: DialogArchiveProps) => {
    const { t } = useTranslation()
    const { currentWorkspace } = useWorkspace()
    const { getArchive, unarchiveItem, deleteItem } = useWorkspaceActions()
    const recorder = useUndoRecorder()
    const workspaceID = currentWorkspace?.id

    const [toTrash, setToTrash] = useState<ArchiveItem | null>(null)
    const { items, isLoading, loadError, reload, run, busy, error, selected, setSelected } = useOpenList<ArchiveItem, ArchiveItemType>({
        isOpen,
        load: async () => workspaceID === undefined ? [] : getArchive(workspaceID),
        // The first time: show the first type that has something in it
        firstSelected: list => TYPES.find(type => list.some(i => i.type === type)) ?? TYPES[0],
    })

    // Folders and notes live in the sidebar tree, groups, sections and tasks in the open note
    const refresh = useWorkspaceRefresh()

    const handleRestore = (item: ArchiveItem) => run(async () => {
        await unarchiveItem(item.type, item.id)
        recorder.unarchive(item.type, item.id, item.name)
        await refresh()
    }, t("archive.restored"))

    const handleTrash = async () => {
        const item = toTrash
        setToTrash(null)
        if (!item) return
        await run(async () => {
            await deleteItem(item.type, item.id)
            recorder.remove(item.type, item.id, item.name)
            await refresh()
        }, t("dialogs.delete.done", { count: 1 }))
    }

    const active = selected ?? TYPES[0]
    const countOf = (type: ArchiveItemType) => items.filter(i => i.type === type).length
    const activeItems = items.filter(i => i.type === active)
    const Icon = ITEM_ICONS[active]
    // The dialog always has the two columns of TypeTabs (while loading with the skeleton of the same layout, and when empty with
    // every tab at 0), so nothing moves when the items arrive; only a failed load uses the plain layout
    const tabbed = isLoading || loadError === null
    const title = <DialogTitle>{t("archive.title")}</DialogTitle>
    // pr-10: the close button of the dialog sits at the top right and must not cover the end of the text
    const description = <DialogDescription className="pr-10">{t("archive.description")}</DialogDescription>
    const footer = (
        <>
            <FormError>{error}</FormError>
            {/* mt-auto: with few or no items the buttons stay at the bottom of the (fixed height) dialog */}
            <DialogFooter className="mt-auto">
                <DialogFooterActions>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t("common.close")}
                    </Button>
                </DialogFooterActions>
            </DialogFooter>
        </>
    )

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className={tabbed ? "sm:max-w-3xl h-[min(560px,85vh)] gap-0 overflow-hidden p-0" : "flex flex-col sm:max-w-3xl h-[min(560px,85vh)] overflow-hidden"}>
                    {isLoading ? (
                        <TypeTabsSkeleton heading={<DialogHeader>{title}</DialogHeader>} description={description} footer={footer} tabs={TYPES.length} />
                    ) : !tabbed ? (
                        <>
                            <DialogHeader>
                                {title}
                                {description}
                            </DialogHeader>
                            {loadError !== null ? (
                                <ListError message={loadError} onRetry={() => void reload()} />
                            ) : (
                                <ListEmpty>{t("archive.isEmpty")}</ListEmpty>
                            )}
                            {footer}
                        </>
                    ) : (
                        <TypeTabs
                            types={TYPES}
                            active={active}
                            onSelect={setSelected}
                            count={countOf}
                            label={type => t(`archive.types.${type}`)}
                            ariaLabel={t("archive.nav")}
                            heading={<DialogHeader>{title}</DialogHeader>}
                            description={description}
                            footer={footer}
                        >
                            {items.length === 0 ? (
                                <ListEmpty>{t("archive.isEmpty")}</ListEmpty>
                            ) : activeItems.length === 0 ? (
                                <ListEmpty>{t("archive.emptyType")}</ListEmpty>
                            ) : activeItems.map(item => (
                                <ItemRow key={`${item.type}-${item.id}`} icon={Icon} name={item.name} details={details(item)}>
                                    <ItemRowActions
                                        disabled={busy}
                                        restore={{ icon: ArchiveRestore, tooltip: t("archive.restore"), ariaLabel: t("archive.restoreAria", { name: item.name }), onClick: () => void handleRestore(item) }}
                                        remove={{ icon: Trash2, tooltip: t("dialogs.delete.confirm"), ariaLabel: t("archive.trashAria", { name: item.name }), onClick: () => setToTrash(item) }}
                                    />
                                </ItemRow>
                            ))}
                        </TypeTabs>
                    )}
                </DialogContent>
            </Dialog>
            <ConfirmDialog
                open={toTrash !== null}
                onOpenChange={(open) => { if (!open) setToTrash(null) }}
                destructive
                initialFocus="cancel"
                title={t("dialogs.delete.title")}
                description={t("dialogs.delete.description")}
                confirm={{ label: t("dialogs.delete.confirm"), icon: Trash2, onClick: handleTrash }}
            />
        </>
    )
}
