import { useTranslation } from "react-i18next"
import { lazyNamed, preloadWhenIdle } from "@/lib/lazy-preload"
import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LazyMount } from "@/components/lazy-mount"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useAppCommand } from "@/lib/app-commands"

const DialogTrashWorkspaces = lazyNamed(() => import("@/components/dialogs/dialog-trash"), "DialogTrashWorkspaces")
preloadWhenIdle(DialogTrashWorkspaces)

export const ButtonTrashWorkspaces = () => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    useAppCommand("open-workspace-trash", () => setIsOpen(true))

    return (
        <>
            <TooltipCustom text={t("trash.title")}>
                <Button variant="outline" size="icon" aria-label={t("trash.title")} onClick={() => setIsOpen(true)}>
                    <Trash2 />
                </Button>
            </TooltipCustom>
            <LazyMount active={isOpen}>
                <DialogTrashWorkspaces isOpen={isOpen} onOpenChange={setIsOpen} />
            </LazyMount>
        </>
    )
}
