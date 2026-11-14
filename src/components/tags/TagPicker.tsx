import { useId, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { MoreHorizontal, Plus, Trash2 } from "lucide-react"
import type { Tag } from "@/types/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ColorPalette } from "@/components/color-palette"
import { ConfirmDialog } from "@/components/dialogs/dialog-confirm"
import { FormError } from "@/components/form-error"
import { TagBadge } from "@/components/tag-badge"
import { useActiveNote } from "@/contexts/use-active-note"
import { useWorkspaceTags } from "@/contexts/workspace-data"
import { useTagMutations } from "@/hooks/use-tag-mutations"
import { reportError } from "@/lib/report-error"
import { tagCoverage } from "@/lib/task-tags"
import { getErrorMessage } from "@/lib/utils"
import { MAX_NAME_LENGTH } from "@/lib/names"

type TagPickerProps = {
    /** The tasks the list acts on (one task, or the selected ones). */
    taskIds: readonly number[]
}

/**
 * The tags of the workspace as a checkable list for some tasks (checked = all of them have it; the count says when only some do),
 * with the field that creates a new tag (and gives it to the tasks) and, for each tag, a small menu to rename it, change its
 * color or delete it. Used by the dialog of the task menus and by the details panel.
 */
export function TagPicker({ taskIds }: TagPickerProps) {
    const { t } = useTranslation()
    const tags = useWorkspaceTags()
    const { noteDataTree } = useActiveNote()
    const { assign, create } = useTagMutations()
    const [name, setName] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const nameId = useId()
    const errorId = useId()

    const toggle = async (tag: Tag, assigned: boolean) => {
        setError(null)
        try {
            await assign(tag, taskIds, assigned)
        } catch (err) {
            reportError(err, t("tags.errors.assign", { message: getErrorMessage(err) }))
        }
    }

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (!name.trim() || busy) return
        setBusy(true)
        setError(null)
        try {
            await create(name, taskIds)
            setName("")
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {tags.length === 0
                ? <p className="text-sm text-muted-foreground">{t("tags.empty")}</p>
                : (
                    <ul aria-label={t("tags.list")} className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                        {tags.map(tag => {
                            const coverage = tagCoverage(noteDataTree, taskIds, tag.id)
                            return <TagRow key={tag.id} tag={tag} coverage={coverage} onToggle={assigned => { void toggle(tag, assigned) }} />
                        })}
                    </ul>
                )}
            <form onSubmit={event => { void submit(event) }} className="flex items-center gap-2">
                <Input
                    id={nameId}
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder={t("tags.newPlaceholder")}
                    aria-label={t("tags.newLabel")}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    autoComplete="off"
                    onChange={event => { setName(event.target.value); setError(null) }}
                />
                <Button type="submit" size="sm" disabled={!name.trim() || busy}>
                    <Plus />
                    {t("tags.create")}
                </Button>
            </form>
            <FormError id={errorId}>{error}</FormError>
        </div>
    )
}

type TagRowProps = {
    tag: Tag
    coverage: { with: number, total: number }
    onToggle: (assigned: boolean) => void
}

function TagRow({ tag, coverage, onToggle }: TagRowProps) {
    const { t } = useTranslation()
    const { remove } = useTagMutations()
    const [menuOpen, setMenuOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const all = coverage.total > 0 && coverage.with === coverage.total
    const some = coverage.with > 0 && !all

    return (
        <li className="flex min-w-0 items-center gap-2" data-testid="tag-row">
            <Checkbox
                checked={all}
                aria-label={tag.name}
                onCheckedChange={checked => onToggle(checked === true)}
            />
            <span className="flex min-w-0 flex-1 items-center gap-2">
                <TagBadge tag={tag} className="max-w-full" />
                {/* Some of the selected tasks have the tag: a click gives it to all the others */}
                {some && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{coverage.with}/{coverage.total}</span>}
            </span>
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t("tags.manage", { name: tag.name })}>
                        <MoreHorizontal />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64">
                    <TagManage tag={tag} onDelete={() => { setMenuOpen(false); setDeleting(true) }} />
                </PopoverContent>
            </Popover>
            <ConfirmDialog
                open={deleting}
                onOpenChange={setDeleting}
                destructive
                title={t("tags.deleteTitle")}
                description={t("tags.deleteDescription", { name: tag.name })}
                confirm={{
                    label: t("tags.deleteConfirm"),
                    icon: Trash2,
                    onClick: async () => {
                        try {
                            await remove(tag)
                        } catch (err) {
                            reportError(err, t("tags.errors.delete", { message: getErrorMessage(err) }))
                        }
                    },
                }}
            />
        </li>
    )
}

/** Rename, color and delete of one tag (the content of the small menu of its row). */
function TagManage({ tag, onDelete }: { tag: Tag, onDelete: () => void }) {
    const { t } = useTranslation()
    const { rename, recolor } = useTagMutations()
    const [name, setName] = useState(tag.name)
    const [error, setError] = useState<string | null>(null)
    const errorId = useId()

    const saveName = async (event: FormEvent) => {
        event.preventDefault()
        setError(null)
        try {
            await rename(tag, name)
        } catch (err) {
            setError(getErrorMessage(err))
        }
    }

    const pickColor = async (color: string | null) => {
        setError(null)
        try {
            await recolor(tag, color)
        } catch (err) {
            reportError(err, t("tags.errors.color", { message: getErrorMessage(err) }))
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <form onSubmit={event => { void saveName(event) }} className="flex items-center gap-2">
                <Input
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    aria-label={t("tags.renameLabel")}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    autoComplete="off"
                    onChange={event => { setName(event.target.value); setError(null) }}
                />
                <Button type="submit" size="sm" disabled={!name.trim() || name.trim() === tag.name}>{t("tags.save")}</Button>
            </form>
            <FormError id={errorId}>{error}</FormError>
            <ColorPalette value={tag.color} onPick={color => { void pickColor(color) }} />
            <Button variant="ghost" size="sm" className="justify-start" disabled={!tag.color} onClick={() => { void pickColor(null) }}>
                {t("tags.noColor")}
            </Button>
            <Button variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDelete}>
                <Trash2 />
                {t("tags.delete")}
            </Button>
        </div>
    )
}
