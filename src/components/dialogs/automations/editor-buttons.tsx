import { useTranslation } from "react-i18next"
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogFooterActions } from "@/components/ui/dialog"
import { LAST_STEP, type Step } from "./model"

type EditorButtonsProps = {
    step: Step
    /** Whether the data of the current step is complete. */
    valid: boolean
    saving: boolean
    onCancel: () => void
    onGoTo: (step: Step) => void
    onSave: () => void
}

/** The footer of the editor: cancel, back and next (save on the last step), all as wide as the widest of them. */
export const EditorButtons = ({ step, valid, saving, onCancel, onGoTo, onSave }: EditorButtonsProps) => {
    const { t } = useTranslation()
    return (
        <DialogFooterActions>
            <Button variant="outline" type="button" onClick={onCancel}>
                {t("common.cancel")}
            </Button>
            {step > 0 && (
                <Button variant="outline" type="button" onClick={() => onGoTo((step - 1) as Step)}>
                    <ChevronLeft />
                    {t("automations.back")}
                </Button>
            )}
            {step < LAST_STEP ? (
                <Button type="button" onClick={() => onGoTo((step + 1) as Step)} disabled={!valid}>
                    {t("automations.next")}
                    <ChevronRight />
                </Button>
            ) : (
                <Button type="button" onClick={onSave} disabled={saving || !valid}>
                    {saving ? <Loader2 className="animate-spin" /> : <Check />}
                    {t("common.save")}
                </Button>
            )}
        </DialogFooterActions>
    )
}
