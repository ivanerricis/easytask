import { useTranslation } from "react-i18next"
import { Redo2, Rewind, Undo2 } from "lucide-react"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Button } from "@/components/ui/button"
import { useShortcutLabel } from "@/contexts/use-shortcuts"
import { useUndo } from "@/contexts/undo/use-undo"
import { cn } from "@/lib/utils"

const entryClass = "h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left font-normal break-words"

/**
 * The undo/redo history of the open workspace: the undoable actions (the most recent first, the last one is the
 * current state) and, below, the undone ones that can be redone. Choosing an entry undoes/redoes up to it.
 * Must be inside an UndoProvider.
 * @category Undo
 */
export function HistoryPanel() {
    const { t } = useTranslation()
    const { entries, canUndo, canRedo, undo, redo, undoTo, redoTo } = useUndo()
    const undoShortcut = useShortcutLabel("undo")
    const redoShortcut = useShortcutLabel("redo")

    return (
        <div className="flex h-full min-h-0 flex-col" role="region" aria-label={t("history.title")}>
            <div className="flex items-center gap-1 border-b p-2">
                <h2 className="mr-auto text-sm font-semibold">{t("history.title")}</h2>
                {/* Back to before every recorded action, like choosing the oldest entry: the actions stay redoable */}
                <TooltipCustom text={t("history.undoAllHint")}>
                    <Button
                        variant="buttonIcon"
                        size="icon"
                        aria-label={t("history.undoAll")}
                        disabled={!canUndo || entries.undo.length === 0}
                        onClick={() => { void undoTo(entries.undo.length - 1) }}
                    >
                        <Rewind />
                    </Button>
                </TooltipCustom>
                <TooltipCustom text={t("undo.undo")} shortcut={undoShortcut}>
                    <Button variant="buttonIcon" size="icon" aria-label={t("undo.undo")} disabled={!canUndo} onClick={() => { void undo() }}>
                        <Undo2 />
                    </Button>
                </TooltipCustom>
                <TooltipCustom text={t("undo.redo")} shortcut={redoShortcut}>
                    <Button variant="buttonIcon" size="icon" aria-label={t("undo.redo")} disabled={!canRedo} onClick={() => { void redo() }}>
                        <Redo2 />
                    </Button>
                </TooltipCustom>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {entries.undo.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("history.emptyUndo")}</p>
                ) : (
                    <ul aria-label={t("history.undoList")} className="flex flex-col gap-0.5">
                        {entries.undo.map((label, index) => (
                            <li key={`undo-${entries.undo.length - index}`}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className={cn(entryClass, index === 0 && "bg-accent/60 font-medium")}
                                    aria-label={t("history.goBackTo", { label })}
                                    aria-current={index === 0 ? "true" : undefined}
                                    onClick={() => { void undoTo(index) }}
                                >
                                    <span className="flex flex-col items-start">
                                        {label}
                                        {index === 0 && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{t("history.current")}</span>}
                                    </span>
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
                {entries.redo.length > 0 && (
                    <ul aria-label={t("history.redoList")} className="mt-2 flex flex-col gap-0.5 border-t pt-2">
                        {entries.redo.map((label, index) => (
                            <li key={`redo-${entries.redo.length - index}`}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className={cn(entryClass, "text-muted-foreground")}
                                    aria-label={t("history.goForwardTo", { label })}
                                    onClick={() => { void redoTo(index) }}
                                >
                                    <span className="flex flex-col items-start">
                                        {label}
                                        <span className="mt-0.5 block text-xs">{t("history.undoneBadge")}</span>
                                    </span>
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
