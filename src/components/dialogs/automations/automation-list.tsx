import { useTranslation } from "react-i18next"
import { Pencil, Plus, Trash2, TriangleAlert, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { TooltipCustom } from "@/components/tooltip-custom"
import { automationName, describeAutomation, type SectionName } from "@/lib/automations/describe"
import { referencedGroups, referencedSections, referencedTags, type Automation } from "@/lib/automations/types"
import { cn } from "@/lib/utils"

type Names = {
    titleOf: (id: number) => SectionName | undefined
    groupLabelOf: (id: number) => string | undefined
    tagNameOf: (id: number) => string | undefined
}

type AutomationRowProps = Names & {
    rule: Automation
    onToggle: (rule: Automation, enabled: boolean) => void
    onEdit: (rule: Automation) => void
    onDelete: (rule: Automation) => void
}

const AutomationRow = ({ rule, titleOf, groupLabelOf, tagNameOf, onToggle, onEdit, onDelete }: AutomationRowProps) => {
    const { t } = useTranslation()
    const name = automationName(rule, titleOf, groupLabelOf, tagNameOf)
    const pausedKey = referencedGroups(rule).some(id => groupLabelOf(id) === undefined) ? "automations.pausedGroup"
        : referencedSections(rule).some(id => titleOf(id) === undefined) ? "automations.paused"
        : referencedTags(rule).some(id => tagNameOf(id) === undefined) ? "automations.pausedTag" : null
    return (
        <li className="flex items-center gap-3 px-3 py-2">
            <Switch
                checked={rule.enabled}
                onCheckedChange={checked => onToggle(rule, checked)}
                aria-label={t("automations.enabledAria", { name })}
            />
            <div className={cn("flex flex-col min-w-0 flex-1", !rule.enabled && "opacity-60")}>
                {rule.name && <span className="text-sm font-medium truncate">{rule.name}</span>}
                <span className={cn("break-words", rule.name ? "text-sm text-muted-foreground" : "text-sm")}>
                    {describeAutomation(rule, titleOf, groupLabelOf, tagNameOf)}
                </span>
                {pausedKey && (
                    <span className="flex items-start gap-1 text-sm text-destructive break-words">
                        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                        {t(pausedKey)}
                    </span>
                )}
            </div>
            <TooltipCustom text={t("automations.edit")}>
                <Button variant="ghost" size="icon" aria-label={t("automations.editAria", { name })} onClick={() => onEdit(rule)}>
                    <Pencil />
                </Button>
            </TooltipCustom>
            <TooltipCustom text={t("automations.delete")}>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" aria-label={t("automations.deleteAria", { name })}
                    onClick={() => onDelete(rule)}>
                    <Trash2 />
                </Button>
            </TooltipCustom>
        </li>
    )
}

type AutomationListProps = Names & {
    rules: Automation[]
    onToggle: (rule: Automation, enabled: boolean) => void
    onEdit: (rule: Automation) => void
    onDelete: (rule: Automation) => void
}

/** The rules of the note: on/off switch, edit and delete. */
export const AutomationList = ({ rules, ...rest }: AutomationListProps) => (
    <ul className="flex min-h-0 flex-1 flex-col divide-y border rounded-xs overflow-y-auto">
        {rules.map(rule => <AutomationRow key={rule.id} rule={rule} {...rest} />)}
    </ul>
)

/** The note has sections but no rules: an example and the "new" button. */
export const AutomationEmpty = ({ onAdd }: { onAdd: () => void }) => {
    const { t } = useTranslation()
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
            <Zap className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-muted-foreground text-sm">{t("automations.empty")}</p>
            <p className="max-w-xs text-xs text-muted-foreground">{t("automations.emptyExample")}</p>
            <Button type="button" className="mt-1" onClick={onAdd}>
                <Plus />
                {t("automations.add")}
            </Button>
        </div>
    )
}
