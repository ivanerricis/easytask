import { useTranslation } from "react-i18next"
import { Navbar } from "@/components/navbar"
import { ShortcutsHelpButton } from "@/components/shortcuts-help-button"
import { AppMenu } from "@/components/app-menu"
import { useWorkspace } from "@/contexts/use-workspace"
import { useWorkspaceData } from "@/contexts/workspace-data"
import { ArrowLeft } from "lucide-react"
import React, { useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { CommandMenu } from "./components/CommandMenu"
import { ButtonNavbar } from "@/components/button-navbar"
import { clearLastWorkspaceId } from "@/lib/store/preferences"
import { reportError } from "@/lib/report-error"
import { useShortcut } from "@/hooks/use-shortcut"
import { useShortcutLabel } from "@/contexts/use-shortcuts"

type WorkSpaceLayoutProps = {
    children: React.ReactNode
}

export const WorkSpaceLayout = ({ children }: WorkSpaceLayoutProps) => {
    const { t } = useTranslation()

    const { resetWorkspace } = useWorkspace()
    const { resetData } = useWorkspaceData()
    const navigate = useNavigate()

    const handleGoHome = useCallback(() => {
        resetWorkspace()
        resetData()
        clearLastWorkspaceId().catch(error => reportError(error))
        navigate("/")
    }, [resetWorkspace, resetData, navigate])

    useShortcut("go-home", handleGoHome, { allowInInputs: true })
    const homeLabel = useShortcutLabel("go-home")
    const mainRef = useRef<HTMLElement>(null)

    return (
        <div className="flex flex-col w-full h-full">
            {/* Bypass block (WCAG 2.4.1): the first stop of the Tab order, visible only when it has the focus */}
            <button
                type="button"
                onClick={() => mainRef.current?.focus()}
                className="sr-only app-no-drag focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-xs focus:border focus:bg-background focus:px-3 focus:py-1.5 focus:text-sm focus:text-foreground"
            >
                {t("layout.skipToNote")}
            </button>
            <Navbar
                leftContainer={<AppMenu page="workspace" />}
                centerContainer={
                    <div className="flex items-center gap-1">
                        <ButtonNavbar
                            onClick={handleGoHome}
                            // Same height as the search beside it (h-7)
                            className="size-7 shrink-0 text-foreground rounded-xs"
                            textTooltip={t("workspace.backHome")}
                            textTooltipShortcut={homeLabel}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </ButtonNavbar>
                        <CommandMenu />
                        <ShortcutsHelpButton inline />
                    </div>
                }
            />
            <main ref={mainRef} tabIndex={-1} className="flex flex-1 w-full h-full overflow-hidden outline-none">
                {children}
            </main>
        </div>
    )
}