import { useId, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Check, MoreHorizontal, Plus, Trash2, X } from "lucide-react"
import type { Tag } from "@/types/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { segmentedGroupClass, segmentedItemClass } from "@/components/ui/toggle-variants"
import { ColorPalette } from "@/components/color-palette"
import { ConfirmDialog } from "@/components/dialogs/dialog-confirm"
import { SKIP_KEYS, useConfirmSkipped } from "@/components/dialogs/use-skipped-confirm"
import { FormError } from "@/components/form-error"
import { TagBadge, TagShapeSample } from "@/components/tag-badge"
import { useActiveNote } from "@/contexts/use-active-note"
import { useOptionalUndo } from "@/contexts/undo/use-undo"
import { useWorkspaceTags } from "@/contexts/workspace-data"
import { useTagMutations } from "@/hooks/use-tag-mutations"
import { reportError } from "@/lib/report-error"
import { TAG_SHAPES, shapeOf, toStoredShape } from "@/lib/tag-shapes"
import { groupTagCoverage, tagCoverage, type TagTarget } from "@/lib/task-tags"
import { cn, getErrorMessage } from "@/lib/utils"
import { MAX_NAME_LENGTH } from "@/lib/names"
import { toastUndoable } from "@/lib/toast-trashed"

type TagPickerProps =
    /** The tasks the list acts on (one task, or the selected ones). */
    | { taskIds: readonly number[], groupIds?: undefined }
    /** The groups the list acts on. */
    | { groupIds: readonly number[], taskIds?: undefined }

/**
 * The tags of the workspace as a checkable list for some tasks or groups (checked = all of them have it; the count says when only
 * some do), with the field that creates a new tag (and gives it to them) and, for each tag, a small menu to rename it, change its
 * shape or color or delete it. Used by the dialogs of the task and group menus and by the details panel.
 */
export function TagPicker(props: TagPickerProps) {
    const { t } = useTranslation()
    const tags = useWorkspaceTags()
    const { noteDataTree } = useActiveNote()
    const { assign, create } = useTagMutations()
    const [name, setName] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const nameId = useId()
    const errorId = useId()
    const target: TagTarget = props.groupIds ? { kind: "groups", ids: props.groupIds } : { kind: "tasks", ids: props.taskIds }
    // The tasks go as a plain list of ids (the original form), the groups say what they are
    const payload = target.kind === "tasks" ? target.ids : target

    const toggle = async (tag: Tag, assigned: boolean) => {
        setError(null)
        try {
            await assign(tag, payload, assigned)
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
            await create(name, payload)
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
                            const coverage = target.kind === "groups" ? groupTagCoverage(noteDataTree, target.ids, tag.id) : tagCoverage(noteDataTree, target.ids, tag.id)
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
                    className="h-8"
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
    const undo = useOptionalUndo()?.undo
    const skipConfirm = useConfirmSkipped(SKIP_KEYS.tagDelete)
    const all = coverage.total > 0 && coverage.with === coverage.total
    const some = coverage.with > 0 && !all

    // The toast brings the tag back (with its tasks): that is why the question can be silenced
    const removeTag = async () => {
        try {
            await remove(tag)
            toastUndoable(t("tags.deleted"), undo)
        } catch (err) {
            reportError(err, t("tags.errors.delete", { message: getErrorMessage(err) }))
        }
    }

    return (
        <li className="flex h-8 min-w-0 items-center gap-2" data-testid="tag-row">
            <Checkbox
                checked={all}
                aria-label={tag.name}
                onCheckedChange={checked => onToggle(checked === true)}
            />
            <span className="flex min-w-0 flex-1 items-center gap-2">
                <TagBadge tag={tag} className="max-w-full" />
                {/* Some of the selected items have the tag: a click gives it to all the others */}
                {some && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{coverage.with}/{coverage.total}</span>}
            </span>
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={t("tags.manage", { name: tag.name })}>
                        <MoreHorizontal />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64">
                    <TagManage tag={tag} onDelete={() => { setMenuOpen(false); if (skipConfirm) void removeTag(); else setDeleting(true) }} />
                </PopoverContent>
            </Popover>
            <ConfirmDialog
                open={deleting}
                onOpenChange={setDeleting}
                destructive
                skipKey={SKIP_KEYS.tagDelete}
                title={t("tags.deleteTitle")}
                description={t("tags.deleteDescription", { name: tag.name })}
                confirm={{ label: t("tags.deleteConfirm"), icon: Trash2, onClick: removeTag }}
            />
        </li>
    )
}

/** The rows at the bottom of the menu of a tag: the same size and padding as the entries of the other menus. */
const rowClass = "h-auto w-full justify-start gap-2 rounded-xs px-2 py-1.5 font-normal"

/**
 * Rename, shape, color and delete of one tag (the content of the small menu of its row): the name with its Save button, the shape
 * picker, the palette as wide as the menu, then "No color" and "Delete" as rows like the entries of a menu.
 */
function TagManage({ tag, onDelete }: { tag: Tag, onDelete: () => void }) {
    const { t } = useTranslation()
    const { rename, recolor, reshape } = useTagMutations()
    const [name, setName] = useState(tag.name)
    const [error, setError] = useState<string | null>(null)
    const errorId = useId()
    const shape = shapeOf(tag.shape)

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

    const pickShape = async (value: string) => {
        // A click on the selected one gives an empty value: the shape stays
        if (!value) return
        setError(null)
        try {
            await reshape(tag, toStoredShape(value))
        } catch (err) {
            reportError(err, t("tags.errors.shape", { message: getErrorMessage(err) }))
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
                    className="h-8 min-w-0 flex-1"
                    onChange={event => { setName(event.target.value); setError(null) }}
                />
                <Button type="submit" size="sm" className="shrink-0" disabled={!name.trim() || name.trim() === tag.name}>{t("tags.save")}</Button>
            </form>
            <FormError id={errorId}>{error}</FormError>
            <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t("tags.shape.label")}</span>
                <ToggleGroup type="single" value={shape} onValueChange={value => { void pickShape(value) }} aria-label={t("tags.shape.label")} className={cn(segmentedGroupClass, "w-full")}>
                    {TAG_SHAPES.map(option => (
                        <ToggleGroupItem key={option} value={option} aria-label={t(`tags.shape.${option}`)} title={t(`tags.shape.${option}`)} className={cn(segmentedItemClass, "px-0")}>
                            <TagShapeSample shape={option} color={tag.color} />
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t("dialogs.color.palette")}</span>
                <ColorPalette value={tag.color} onPick={color => { void pickColor(color) }} className="grid-cols-8" />
            </div>
            <div className="flex flex-col border-t pt-2">
                <Button variant="ghost" className={cn(rowClass, "[&_svg:not([class*='text-'])]:text-muted-foreground")} disabled={!tag.color} onClick={() => { void pickColor(null) }}>
                    <X />
                    {t("tags.noColor")}
                    {!tag.color && <Check className="ml-auto" aria-hidden="true" />}
                </Button>
                <Button variant="ghost" className={cn(rowClass, "text-destructive hover:text-destructive hover:bg-destructive/10")} onClick={onDelete}>
                    <Trash2 />
                    {t("tags.delete")}
                </Button>
            </div>
        </div>
    )
}
