import { LoadingDots } from "@/components/loading-dots"
import { useTranslation } from "react-i18next"
import { AlertCircle, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DraftSaveStatus as Status } from "@/lib/template-draft"

type DraftSaveStatusProps = {
    status: Status
    /** Called by the "Retry" button, shown only after a failed save. */
    onRetry: () => void
    className?: string
}

/**
 * The save state of a template draft, read aloud by screen readers when it changes: "Saving…", "Saved" or, after a
 * failed save, the error with a "Retry" button. Nothing is shown while the draft has not changed.
 */
export const DraftSaveStatus = ({ status, onRetry, className }: DraftSaveStatusProps) => {
    const { t } = useTranslation()

    return (
        <div role="status" aria-live="polite" className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
            {status === "saving" && <><Loader2 className="size-3.5 animate-spin" aria-hidden />{t("templateEditor.saving")}<LoadingDots /></>}
            {status === "saved" && <><Check className="size-3.5" aria-hidden />{t("templateEditor.saved")}</>}
            {status === "error" && (
                <>
                    <AlertCircle className="size-3.5 text-destructive" aria-hidden />
                    <span className="text-destructive">{t("templateEditor.saveError")}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRetry}>
                        {t("templateEditor.retry")}
                    </Button>
                </>
            )}
        </div>
    )
}
