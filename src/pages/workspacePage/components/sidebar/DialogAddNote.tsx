import { FileText } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Button } from "@/components/ui/button"
import { useShortcutLabel } from "@/contexts/use-shortcuts"
import { AddNoteDialog } from "../AddNoteDialog"
import { AddRootItemButton } from "./AddRootItemButton"

/** Sidebar button (and shortcut) that creates a note in the workspace root. */
export const DialogAddNote = () => <AddRootItemButton kind="note" />

/** Sidebar button that creates a Markdown page in the workspace root (the shortcut is handled by SidebarDialogs, which stays mounted with the sidebar closed). */
export const DialogAddPage = () => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const shortcutLabel = useShortcutLabel("new-page")
    return (
        <>
            <AddNoteDialog kind="page" open={isOpen} onOpenChange={setIsOpen} parentId={null} withColor />
            <TooltipCustom text={t("sidebar.addPage")} shortcut={shortcutLabel}>
                <Button onClick={() => setIsOpen(true)} variant="buttonIcon" size="icon" aria-label={t("sidebar.addPage")}>
                    <FileText />
                </Button>
            </TooltipCustom>
        </>
    )
}
