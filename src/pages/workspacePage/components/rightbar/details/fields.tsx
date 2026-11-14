import { useTranslation } from "react-i18next"
import type { DBItemType } from "@/db/queries/shared_queries"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DialogAddColor } from "@/components/dialogs/dialog-add-color"
import { Tags } from "lucide-react"
import { TagBadge } from "@/components/tag-badge"
import { TagPicker } from "@/components/tags/TagPicker"
import { useTagsOf } from "@/contexts/workspace-data"
import { formatDate } from "@/lib/utils"

export const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-muted-foreground"

export const Field = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="flex flex-col gap-1">
        <h3 className={sectionTitle}>{label}</h3>
        <div className="text-sm break-words">{children}</div>
    </div>
)

const ColorSwatch = ({ color }: { color?: string | null }) => color
    ? <span className="inline-block size-4 rounded-full border" style={{ backgroundColor: color }} aria-hidden />
    : null

type DatesProps = { creationDate: string, creationTime: string, editDate: string, editTime: string }

export const Dates = ({ creationDate, creationTime, editDate, editTime }: DatesProps) => {
    const { t } = useTranslation()
    return (
        <Field label={t("details.dates")}>
            <p>{t("common.creationDate", { date: formatDate(creationDate), time: creationTime })}</p>
            <p>{t("common.editDate", { date: formatDate(editDate), time: editTime })}</p>
        </Field>
    )
}

type ColorFieldProps = {
    item: { id: number, color?: string | null }
    itemType: DBItemType
    addColorItem: (itemType: DBItemType, itemId: number, color?: string) => Promise<void>
    getItemId?: number
}

/** The color of an item: a button showing it (or "no color") that opens the palette. */
export const ColorField = ({ item, itemType, addColorItem, getItemId }: ColorFieldProps) => {
    const { t } = useTranslation()
    return (
        <div className="flex items-center justify-between gap-2">
            <h3 className={sectionTitle}>{t("details.color")}</h3>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" aria-label={`${t("menu.changeColor")}: ${item.color ?? t("details.noColor")}`}>
                        {item.color ? <ColorSwatch color={item.color} /> : <span className="text-xs">{t("details.noColor")}</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1">
                    <DialogAddColor
                        item={item}
                        itemType={itemType}
                        addColorItem={addColorItem}
                        getItemId={getItemId}
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}


/** The tags of a task: its pills (or "no tags") and the button that opens the list to change them. */
export const TagsField = ({ taskId, tagIDs }: { taskId: number, tagIDs?: number[] }) => {
    const { t } = useTranslation()
    const tags = useTagsOf(tagIDs)
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <h3 className={sectionTitle}>{t("tags.field")}</h3>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" aria-label={t("tags.edit")}>
                            <Tags />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72">
                        <TagPicker taskIds={[taskId]} />
                    </PopoverContent>
                </Popover>
            </div>
            {tags.length === 0
                ? <span className="text-sm text-muted-foreground">{t("tags.none")}</span>
                : <div data-testid="details-tags" className="flex flex-wrap gap-1">{tags.map(tag => <TagBadge key={tag.id} tag={tag} />)}</div>}
        </div>
    )
}

export const ProgressBar = ({ done, total, label }: { done: number, total: number, label: string }) => {
    const percent = total === 0 ? 0 : Math.round((done / total) * 100)
    return (
        <div className="flex flex-col gap-1">
            <Progress value={percent} aria-label={label} />
            <p className="text-xs text-muted-foreground">{label} ({percent}%)</p>
        </div>
    )
}
