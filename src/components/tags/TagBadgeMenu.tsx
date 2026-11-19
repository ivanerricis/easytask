import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Pencil, X } from "lucide-react"
import type { Tag } from "@/types/types"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useWorkspaceTags } from "@/contexts/workspace-data"
import { useTagMutations } from "@/hooks/use-tag-mutations"
import { reportError } from "@/lib/report-error"
import type { TagTarget } from "@/lib/task-tags"
import { getErrorMessage } from "@/lib/utils"
import { TagManage } from "./TagPicker"

type TagBadgeMenuProps = {
    tag: Tag
    /** The one task, group or section the badge belongs to: "Remove tag" takes the tag away from it only. */
    target: { kind: TagTarget["kind"], id: number }
    /** The badge. */
    children: ReactNode
}

/**
 * Wraps the badge of a tag on a task, group or section with its own context menu: "Edit tag…" (rename, shape and color of the
 * tag, the same as the menu of the tag list) and "Remove tag" (from that item only; the tag stays in the workspace and the
 * removal is an undo step). The right click stops here, so the menu of the row or header the badge sits in does not open too.
 */
export function TagBadgeMenu({ tag, target, children }: TagBadgeMenuProps) {
    const [editing, setEditing] = useState(false)

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger
                    asChild
                    onContextMenu={event => event.stopPropagation()}
                >
                    {/* A press with another button than the main one must not start the drag of the row or header */}
                    <span data-testid="tag-badge-trigger" className="inline-flex max-w-full min-w-0" onPointerDown={event => { if (event.button !== 0) event.stopPropagation() }}>
                        {children}
                    </span>
                </ContextMenuTrigger>
                {/* The menu is in a portal but React events still bubble to the row: keep them out */}
                <ContextMenuContent className="p-1" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                    <TagBadgeMenuItems tag={tag} target={target} onEdit={() => setEditing(true)} />
                </ContextMenuContent>
            </ContextMenu>
            {editing && <DialogEditTag tagId={tag.id} onClose={() => setEditing(false)} />}
        </>
    )
}

/** The entries of the menu. They are mounted only while it is open, so the many badges of a note do not each subscribe to the tag mutations. */
function TagBadgeMenuItems({ tag, target, onEdit }: Pick<TagBadgeMenuProps, "tag" | "target"> & { onEdit: () => void }) {
    const { t } = useTranslation()
    const { assign } = useTagMutations()

    const remove = async () => {
        try {
            await assign(tag, { kind: target.kind, ids: [target.id] }, false)
        } catch (err) {
            reportError(err, t("tags.errors.assign", { message: getErrorMessage(err) }))
        }
    }

    return (
        <>
            <ContextMenuItem onSelect={onEdit}>
                <Pencil />
                {t("tags.editTag")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => { void remove() }}>
                <X />
                {t("tags.removeTag")}
            </ContextMenuItem>
        </>
    )
}

/** The rename / shape / color of one tag in a small dialog (what "Edit tag…" opens). */
function DialogEditTag({ tagId, onClose }: { tagId: number, onClose: () => void }) {
    const { t } = useTranslation()
    const tag = useWorkspaceTags().find(item => item.id === tagId)
    if (!tag) return null
    return (
        <Dialog open onOpenChange={open => { if (!open) onClose() }}>
            {/* The dialog is in a portal but React events still bubble to the row or header: keep them out */}
            <DialogContent className="sm:max-w-xs" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>{t("tags.editTitle")}</DialogTitle>
                    <DialogDescription>{t("tags.editDescription", { name: tag.name })}</DialogDescription>
                </DialogHeader>
                <TagManage tag={tag} onClose={onClose} />
            </DialogContent>
        </Dialog>
    )
}
