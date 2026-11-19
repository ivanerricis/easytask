import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { DialogFooter, DialogFooterActions } from "@/components/ui/dialog"

type FormFooterProps = {
    onCancel: () => void
    /** The submit button is disabled (empty name, saving...). */
    disabled?: boolean
    /** Icon and label of the submit button. */
    children: ReactNode
}

/** The footer of a form dialog: Cancel and the submit button. */
export const FormFooter = ({ onCancel, disabled, children }: FormFooterProps) => {
    const { t } = useTranslation()
    return (
        <DialogFooter className="mt-4">
            <DialogFooterActions>
                <Button variant="outline" type="button" onClick={onCancel}>
                    {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={disabled}>
                    {children}
                </Button>
            </DialogFooterActions>
        </DialogFooter>
    )
}
