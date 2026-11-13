import { Loader2 } from "lucide-react"
import { useDelayedFlag } from "@/hooks/use-delayed-flag"

type LoadingPageProps = {
    text: string
}

/**
 * The page shown while a page of the app loads. The text and the spinner appear only when the load lasts long enough to be
 * noticed (like the skeletons), so a fast load does not flash them; the text is there from the start for the screen readers.
 */
export const LoadingPage = ({text}: LoadingPageProps) => {
    const shown = useDelayedFlag(true)
    return (
        <div role="status" aria-live="polite" className="flex flex-col w-full h-full items-center justify-center gap-2">
            <p className={shown ? "text-lg font-semibold" : "sr-only"}>
                {text}
            </p>
            {shown && <Loader2 className="animate-spin" aria-hidden="true" />}
        </div>
    )
}
