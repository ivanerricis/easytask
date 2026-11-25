import { useTranslation } from "react-i18next"
import { useWorkspace } from "@/contexts/use-workspace"
import { Button } from "../ui/button"
import { CopyIcon } from "@/components/copy-icon"
import { useCopiedFlash } from "@/hooks/use-copied-flash"
import { AlertCircle, ArrowLeft, ChevronRight, RotateCcw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { toast } from "sonner"
import { reportError } from "@/lib/report-error"
import { useNavigate } from "react-router-dom"
import { useWorkspaceData } from "@/contexts/workspace-data"

type ErrorPageProps = {
    error: string | null
    /** When given, a "Try again" button is shown (e.g. to reload the data that failed to load). */
    onRetry?: () => void
}

/** Copies the technical details of an error to the clipboard, with a toast for the result. */
const useCopyDetails = () => {
    const { t } = useTranslation()
    const [copied, flash] = useCopiedFlash()
    const copy = async (details: string) => {
        try {
            await writeText(details)
            flash()
            toast.success(t("crash.copied"))
        } catch (e) {
            reportError(e, t("crash.copyFailed"))
        }
    }
    return { copied, copy }
}

/** The error alert: a translated message, and the raw (often English) message folded in "Technical details". */
const ErrorAlert = ({ message }: { message: string | null }) => {
    const { t } = useTranslation()
    return (
        <Alert variant="destructive" className="max-w-md w-full break-words">
            <AlertCircle />
            <AlertTitle className="line-clamp-none"><h1>{t("errorPage.title")}</h1></AlertTitle>
            <AlertDescription>
                <p>{t("errorPage.description")}</p>
                {message && (
                    <Collapsible className="group/details w-full">
                        <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 rounded-xs text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                            <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/details:rotate-90" />
                            {t("errorPage.details")}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                            <code className="text-xs">{message}</code>
                        </CollapsibleContent>
                    </Collapsible>
                )}
            </AlertDescription>
        </Alert>
    )
}

export const ErrorPage = ({ error, onRetry }: ErrorPageProps) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { resetWorkspace } = useWorkspace()
    const { resetData } = useWorkspaceData()
    const { copied, copy: copyDetails } = useCopyDetails()

    const handleClick = () => {
        resetWorkspace()
        resetData()
        navigate('/')
    }

    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
            <ErrorAlert message={error} />
            <div className="flex gap-2">
                {onRetry && (
                    <Button variant="outline" onClick={onRetry} autoFocus>
                        <RotateCcw />
                        {t("errorPage.retry")}
                    </Button>
                )}
                <Button variant="outline" onClick={handleClick} autoFocus={!onRetry}>
                    <ArrowLeft />
                    {t("errorPage.home")}
                </Button>
                {error && (
                    <Button variant="outline" onClick={() => void copyDetails(error)}>
                        <CopyIcon copied={copied} />
                        {t("crash.copyDetails")}
                    </Button>
                )}
            </div>
        </div>
    )
}

type CrashScreenProps = {
    error: Error
}

/** Router- and context-free error screen used by the ErrorBoundary (it may render outside every provider) */
export const CrashScreen = ({ error }: CrashScreenProps) => {
    const { t } = useTranslation()

    const { copied, copy: copyDetails } = useCopyDetails()
    const handleCopy = () => copyDetails([`${error.name}: ${error.message}`, error.stack].filter(Boolean).join("\n"))

    return (
        <div className="flex flex-col items-center justify-center h-full w-full gap-4 p-4">
            <ErrorAlert message={error.message} />
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.location.reload()} autoFocus>
                    <RotateCcw />
                    {t("crash.reload")}
                </Button>
                <Button variant="outline" onClick={() => void handleCopy()}>
                    <CopyIcon copied={copied} />
                    {t("crash.copyDetails")}
                </Button>
            </div>
        </div>
    )
}