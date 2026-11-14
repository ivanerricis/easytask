import { useEffect, useState } from "react"
import { lazyNamed, preloadWhenIdle } from "@/lib/lazy-preload"
import { OPEN_SETTINGS_EVENT } from "@/lib/updater"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Settings } from "lucide-react"
import { TooltipCustom } from "@/components/tooltip-custom"
import { LazyMount } from "@/components/lazy-mount"

const DialogSettingsContent = lazyNamed(() => import("./dialog-settings-content"), "DialogSettingsContent")
preloadWhenIdle(DialogSettingsContent)

type DialogSettingsProps = {
    className?: string
}

export const DialogSettings = ({ className }: DialogSettingsProps) => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const [category, setCategory] = useState<string | undefined>(undefined)

    // Other parts of the app (e.g. the update toast) can ask to open the settings on a given page
    useEffect(() => {
        const onRequest = (event: Event) => {
            const requested = (event as CustomEvent<{ category?: string }>).detail?.category
            setCategory(requested)
            setIsOpen(true)
        }
        window.addEventListener(OPEN_SETTINGS_EVENT, onRequest)
        return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onRequest)
    }, [])

    return (
        <>
            <LazyMount active={isOpen}>
                <DialogSettingsContent isOpen={isOpen} onOpenChange={open => { setIsOpen(open); if (!open) setCategory(undefined) }} requestedCategory={category} />
            </LazyMount>

            <TooltipCustom text={t("settings.title")}>
                <Button
                    onClick={() => setIsOpen(true)}
                    variant="buttonIcon"
                    size="icon"
                    aria-label={t("settings.title")}
                    className={className}
                >
                    <Settings />
                </Button>
            </TooltipCustom>
        </>
    )
}
