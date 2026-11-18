import { useTranslation } from "react-i18next"
import { ArrowUpDown } from "lucide-react"
import { MenuRadioGroup, MenuRadioItem, MenuSub, MenuSubContent, MenuSubTrigger } from "@/components/menu-kind"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { withRollback } from "@/contexts/with-rollback"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { isTaskOrder, TASK_ORDERS, type TaskOrder } from "@/lib/task-order"
import type { Section } from "@/types/types"

/** Value of the radio item that gives the choice back to the preference ("completed tasks last"). */
const FOLLOW_PREFERENCE = "default"

const LABELS = {
    manual: "menu.taskOrderManual",
    "open-first": "menu.taskOrderOpenFirst",
    "done-first": "menu.taskOrderDoneFirst",
} as const satisfies Record<TaskOrder, `menu.${string}`>

type SectionTaskOrderSubmenuProps = {
    section: Pick<Section, "id" | "task_order">
    /** Closes the menu once an order is picked. */
    onDone?: () => void
}

/**
 * "Task order" submenu of the menu of a section: as in the settings (the preference "completed tasks last"), manual, open
 * tasks first or completed tasks first. Applied to the open note at once and put back if the write fails; a state of the view,
 * so it is not an undo step.
 */
export const SectionTaskOrderSubmenu = ({ section, onDone }: SectionTaskOrderSubmenuProps) => {
    const { t } = useTranslation()
    const { setSectionTaskOrder } = useWorkspaceActions()
    const { patchSection } = useActiveNoteActions()
    const stored = isTaskOrder(section.task_order) ? section.task_order : null

    const choose = (value: string) => {
        const order = isTaskOrder(value) ? value : null
        if (order === stored) return
        withRollback(patchSection(section.id, { task_order: order }), () => setSectionTaskOrder(section.id, order))
            .catch(error => reportError(error, getErrorMessage(error)))
        onDone?.()
    }

    return (
        <MenuSub>
            <MenuSubTrigger>
                <ArrowUpDown className="size-4" />
                {t("menu.taskOrder")}
            </MenuSubTrigger>
            <MenuSubContent>
                <MenuRadioGroup value={stored ?? FOLLOW_PREFERENCE} onValueChange={choose}>
                    <MenuRadioItem value={FOLLOW_PREFERENCE}>{t("menu.taskOrderDefault")}</MenuRadioItem>
                    {TASK_ORDERS.map(order => <MenuRadioItem key={order} value={order}>{t(LABELS[order])}</MenuRadioItem>)}
                </MenuRadioGroup>
            </MenuSubContent>
        </MenuSub>
    )
}
