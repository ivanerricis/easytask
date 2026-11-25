import { FileText } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Button } from "@/components/ui/button"
import { AddNoteDialog } from "../AddNoteDialog"
import { AddRootItemButton } from "./AddRootItemButton"

/** Sidebar button (and shortcut) that creates a note in the workspace root. */
export const DialogAddNote = () => <AddRootItemButton kind="note" />

/** Sidebar button that creates a Markdown page in the workspace root. */
export const DialogAddPage = () => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    return (
        <>
            <AddNoteDialog kind="page" open={isOpen} onOpenChange={setIsOpen} parentId={null} withColor />
            <TooltipCustom text={t("sidebar.addPage")}>
                <Button onClick={() => setIsOpen(true)} variant="buttonIcon" size="icon" aria-label={t("sidebar.addPage")}>
                    <FileText />
                </Button>
            </TooltipCustom>
        </>
    )
}
