import { useTranslation } from "react-i18next"
import { linkHint, openLinkAtCaret } from "@/lib/link-click"
import type { Task } from "@/types/types";
import { getErrorMessage } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogFooterActions, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TextareaAutosize from "react-textarea-autosize"
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";
import { useWorkspaceActions } from "@/contexts/workspace-data";
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo";
import { useSubmitOnce } from "@/hooks/use-submit-once"

type Props = {
    task: Task
    open: boolean
    onOpenChange: (value: boolean) => void
}

export const DialogTaskDescription = ({ task, open, onOpenChange }: Props) => {
    const { t } = useTranslation()
    const [text, setText] = useState(task.description)
    const { saving, run } = useSubmitOnce()
    const [error, setError] = useState<string | null>(null)
    const { updateTaskDescription } = useWorkspaceActions()
    const { patchTask } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    const changed = text !== (task.description ?? "")

    const save = async () => {
        if (!changed) return
        await run(async () => {
            setError(null)
            // Optimistic: the cached tree is updated at once and restored if the write fails
            const rollback = patchTask(task.id, { description: text })
            try {
                await updateTaskDescription(task.id, text !== "" ? text : undefined)
                recorder.taskDescription(task.id, task.text, task.description ?? "", text)
                onOpenChange(false)
            } catch (err) {
                rollback()
                setError(getErrorMessage(err))
            }
        })
    }

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation()
        void save()
    }

    // Every way of closing (Cancel, Escape, click outside) gives up the unsaved text and the error
    const handleOpenChange = (value: boolean) => {
        if (!value) {
            setText(task.description)
            setError(null)
        }
        onOpenChange(value)
    }

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation()
        handleOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("tasks.descriptionDialog.title")}</DialogTitle>
                    <DialogDescription className="min-w-0 truncate" title={task.text}>{task.text}</DialogDescription>
                </DialogHeader>
                <TextareaAutosize
                    autoFocus
                    minRows={5}
                    maxRows={12}
                    aria-label={t("tasks.descriptionDialog.label")}
                    placeholder={t("tasks.descriptionDialog.placeholder")}
                    className="resize-none border rounded-xs py-1 px-2 text-sm focus-visible:border-primary"
                    value={text}
                    onClick={openLinkAtCaret}
                    title={linkHint(text, t("tasks.openLink"))}
                    onChange={(e) => { setError(null); setText(e.target.value) }}
                    // The caret starts at the end of the existing text
                    onFocus={(e) => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end) }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault()
                            void save()
                        }
                    }}
                />
                {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
                <DialogFooter className="items-center sm:justify-between">
                    <span className="hidden text-xs text-muted-foreground sm:inline">{t("tasks.descriptionDialog.hint")}</span>
                    <DialogFooterActions>
                        <Button variant="outline" onClick={handleClose}>
                            {t("common.cancel")}
                        </Button>
                        <Button onClick={handleSave} disabled={!changed || saving}>
                            <Check />
                            {t("common.save")}
                        </Button>
                    </DialogFooterActions>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
