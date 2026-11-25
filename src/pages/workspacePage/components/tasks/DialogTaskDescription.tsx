import { useTranslation } from "react-i18next"
import { linkHint, openLinkAtCaret } from "@/lib/link-click"
import type { Task } from "@/types/types";
import { getErrorMessage } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogFooterActions, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TextareaAutosize from "react-textarea-autosize"
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";
import { useSubmitOnce } from "@/hooks/use-submit-once"
import { useTaskDescriptionWriter } from "@/hooks/use-task-description"
import { DescriptionPreview } from "./DescriptionPreview"

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
    const { write, toggleItem } = useTaskDescriptionWriter(task)
    // A description opens drawn from its Markdown (boxes can be ticked); a click on it, or no description yet, gives the textarea
    const [editing, setEditing] = useState(!task.description?.trim())
    const changed = text !== (task.description ?? "")

    const save = async () => {
        if (!changed) return
        await run(async () => {
            setError(null)
            try {
                await write(text)
                onOpenChange(false)
            } catch (err) {
                setError(getErrorMessage(err))
            }
        })
    }

    // A tick saves at once (and can be undone), the dialog stays open
    const toggle = (line: number) => {
        void run(async () => {
            try {
                await toggleItem(line)
            } catch (err) {
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
            setEditing(!task.description?.trim())
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
                {editing
                    ? (
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
                    )
                    : (
                        <DescriptionPreview
                            text={task.description ?? ""}
                            placeholder={t("tasks.descriptionDialog.placeholder")}
                            label={t("tasks.descriptionDialog.label")}
                            onEdit={() => { setText(task.description); setEditing(true) }}
                            onToggle={toggle}
                            className="max-h-72 min-h-28 overflow-y-auto"
                        />
                    )}
                {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
                <DialogFooter className="items-center sm:justify-between">
                    <span className="hidden text-xs text-muted-foreground sm:inline">{t("tasks.descriptionDialog.hint")}</span>
                    <DialogFooterActions>
                        <Button variant="outline" onClick={handleClose}>
                            {t("common.cancel")}
                        </Button>
                        <Button onClick={handleSave} disabled={!editing || !changed || saving}>
                            <Check />
                            {t("common.save")}
                        </Button>
                    </DialogFooterActions>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
