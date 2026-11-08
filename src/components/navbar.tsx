import { useTranslation } from "react-i18next"
import React, { useEffect, useMemo, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { ButtonNavbar } from "./button-navbar"
import { Copy, Minus, Square, X } from "lucide-react"

type NavBarProps = {
    leftContainer?: React.ReactNode
    centerContainer?: React.ReactNode
    rightContainer?: React.ReactNode
}

// The window controls use the text color, not the accent: the accent is chosen by the user and can be unreadable on the theme.
// Closing turns red on hover, like the windows of the system.
const WINDOW_BUTTON = "text-foreground"
const CLOSE_BUTTON = "text-foreground hover:!bg-window-close hover:!text-window-close-foreground focus-visible:ring-offset-0"

export const Navbar = React.memo(({ leftContainer, centerContainer, rightContainer }: NavBarProps) => {
    const { t } = useTranslation()
    const appWindow = useMemo(() => getCurrentWindow(), [])
    const [maximized, setMaximized] = useState(false)

    // The maximize button turns into "restore" while the window is maximized (also when it is changed by the system:
    // double click on the title bar, Windows snap...)
    useEffect(() => {
        let cancelled = false
        let unlisten: (() => void) | undefined
        const sync = () => {
            appWindow.isMaximized().then(value => { if (!cancelled) setMaximized(value) }).catch(() => undefined)
        }
        sync()
        appWindow.onResized(sync).then(stop => {
            if (cancelled) stop()
            else unlisten = stop
        }).catch(() => undefined)
        return () => {
            cancelled = true
            unlisten?.()
        }
    }, [appWindow])

    const maximizeLabel = maximized ? t("window.restore") : t("window.maximize")

    return (
        <div className="z-50 flex items-center justify-between w-full border-b shadow-sm bg-background" data-tauri-drag-region>
            <div className="flex-1 text-left" data-tauri-drag-region>{leftContainer}</div>
            <div className="flex-1 text-center" data-tauri-drag-region>{centerContainer}</div>
            <div className="flex-1 flex flex-row-reverse items-center justify-start text-right" data-tauri-drag-region>
                <div className="flex items-center justify-end">
                    <ButtonNavbar onClick={() => void appWindow.minimize()} className={WINDOW_BUTTON} label={t("window.minimize")} textTooltip={t("window.minimize")} window>
                        <Minus className="w-5 h-5" />
                    </ButtonNavbar>
                    <ButtonNavbar onClick={() => void appWindow.toggleMaximize()} className={`${WINDOW_BUTTON} !p-2.5`} label={maximizeLabel} textTooltip={maximizeLabel} window>
                        {maximized ? <Copy className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </ButtonNavbar>
                    <ButtonNavbar onClick={() => void appWindow.close()} className={CLOSE_BUTTON} label={t("window.close")} textTooltip={t("window.close")} window>
                        <X className="w-5 h-5" />
                    </ButtonNavbar>
                </div>
                <div>
                    {rightContainer}
                </div>
            </div>
        </div >
    )
})
