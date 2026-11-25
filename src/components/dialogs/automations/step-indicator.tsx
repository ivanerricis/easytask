import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AutomationDraft } from "@/lib/automations/types"
import { cn } from "@/lib/utils"
import { LAST_STEP, STEPS, stepReachable, stepValid, type Step } from "./model"

/** The progress of the editor: "1 When - 2 Then - 3 Summary"; the steps already reachable are buttons. */
export const StepIndicator = ({ step, draft, onSelect }: { step: Step, draft: AutomationDraft, onSelect: (step: Step) => void }) => {
    const { t } = useTranslation()
    return (
        <nav aria-label={t("automations.stepsAria")}>
            {/* The same element for every step, so a screen reader announces the change */}
            <p aria-live="polite" className="sr-only">
                {t("automations.stepStatus", { current: step + 1, total: STEPS.length, name: t(`automations.steps.${STEPS[step]}`) })}
            </p>
            <ol className="flex items-center gap-2">
                {STEPS.map((name, index) => {
                    const current = index === step
                    const done = index < step && stepValid(index, draft)
                    return (
                        <li key={name} className={cn("flex items-center gap-2 min-w-0", index < LAST_STEP && "flex-1")}>
                            <Button variant="ghost" size="sm" type="button" className="shrink-0 px-2"
                                aria-current={current ? "step" : undefined}
                                disabled={!stepReachable(index, draft)}
                                onClick={() => onSelect(index as Step)}>
                                <span aria-hidden className={cn(
                                    "flex size-5 items-center justify-center rounded-full border text-xs",
                                    current && "border-primary bg-primary text-primary-foreground",
                                    done && "border-primary text-primary-text",
                                )}>{done ? <Check className="size-3 animate-in zoom-in-50 fade-in-0" /> : index + 1}</span>
                                <span className={cn(!current && "text-muted-foreground")}>{t(`automations.steps.${name}`)}</span>
                            </Button>
                            {index < LAST_STEP && <span aria-hidden className="h-px min-w-2 flex-1 bg-border" />}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
