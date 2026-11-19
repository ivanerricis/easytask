import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useCreateRootNote } from "@/hooks/use-create-root-note"

/**
 * The "+" at the right of the tabs of a pane: creates a note in the root of the tree with a provisional name, opens it in this pane
 * and puts its tab straight into inline rename (Enter confirms, Escape keeps the provisional name).
 */
export function NewNoteTabButton() {
    const { t } = useTranslation()
    const { create, busy } = useCreateRootNote()
    const label = t("notes.newNote")

    return (
        <TooltipCustom text={label}>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={label}
                disabled={busy}
                onClick={() => void create()}
                className="mx-1 my-auto shrink-0 text-muted-foreground"
            >
                <Plus />
            </Button>
        </TooltipCustom>
    )
}
