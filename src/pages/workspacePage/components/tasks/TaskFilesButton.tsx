import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FolderSearch, Paperclip, Plus, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TooltipCustom } from "@/components/tooltip-custom"
import { openTaskFile, useTaskFileMutations } from "@/hooks/use-task-file-mutations"
import { useMissingPaths } from "@/contexts/use-media"
import { focusRing } from "@/lib/a11y"
import { cn } from "@/lib/utils"
import type { Task } from "@/types/types"

type TaskFilesListProps = {
    task: Pick<Task, "id" | "text" | "files">
    /** Closes the popover that holds the list (when there is one). */
    onDone?: () => void
}

/**
 * The files attached to a task, one per row: a click opens the file with the system app, a missing one is marked and can be
 * pointed to a new path, each one can be removed, and more can be added. Used in the popover of the row and in the details panel.
 * @category Task
 */
export const TaskFilesList = ({ task, onDone }: TaskFilesListProps) => {
    const { t } = useTranslation()
    const files = task.files ?? []
    const { attach, remove, relink } = useTaskFileMutations(task)
    const missing = useMissingPaths(files, "task_files_exist")
    return (
        <div className="flex flex-col gap-1 text-xs">
            {files.length === 0 && <p className="px-1 py-1 text-muted-foreground">{t("taskFiles.empty")}</p>}
            <ul aria-label={t("taskFiles.title")} className="flex flex-col gap-1">
                {files.map(file => {
                    const isMissing = missing.has(file.path)
                    return (
                        <li key={file.id} data-testid="task-file" data-missing={isMissing ? "true" : undefined}
                            className="group flex items-center gap-1 rounded-xs border bg-background pl-1 hover:bg-secondary">
                            <button
                                type="button"
                                title={file.path}
                                aria-label={isMissing ? `${t("taskFiles.open", { name: file.name })} (${t("audio.missing.title")})` : t("taskFiles.open", { name: file.name })}
                                onClick={() => { if (isMissing) void relink(file); else void openTaskFile(file.path) }}
                                className={cn(focusRing, "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xs py-1 text-left")}>
                                <span className={cn("flex-1 truncate", isMissing && "text-muted-foreground line-through")}>{file.name}</span>
                                {isMissing && <TriangleAlert className="size-4 shrink-0 text-destructive" role="img" aria-label={t("audio.missing.title")} />}
                            </button>
                            {isMissing && <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0"
                                title={t("audio.updatePath")} aria-label={t("audio.updatePath")} onClick={() => void relink(file)}>
                                <FolderSearch />
                            </Button>}
                            <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                                title={t("taskFiles.remove", { name: file.name })} aria-label={t("taskFiles.remove", { name: file.name })}
                                onClick={() => void remove(file)}>
                                <X />
                            </Button>
                        </li>
                    )
                })}
            </ul>
            <Button type="button" variant="outline" size="sm" className="justify-start" onClick={() => { onDone?.(); void attach() }}>
                <Plus />{t("taskFiles.addMore")}
            </Button>
        </div>
    )
}

/**
 * The paperclip with the number of files on the row of a task; it opens the list of the files.
 * @category Task
 */
export const TaskFilesButton = ({ task }: { task: Pick<Task, "id" | "text" | "files"> }) => {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const count = task.files?.length ?? 0
    if (count === 0) return null
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <TooltipCustom text={t("taskFiles.badge", { count })}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        data-testid="task-files-badge"
                        aria-label={t("taskFiles.badge", { count })}
                        onClick={e => e.stopPropagation()}
                        className={cn(focusRing, "mt-0.5 ml-1 flex shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1 text-xs tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground")}>
                        <Paperclip className="size-3.5" />
                        {count}
                    </button>
                </PopoverTrigger>
            </TooltipCustom>
            <PopoverContent align="end" className="w-72 p-2" onClick={e => e.stopPropagation()}>
                <TaskFilesList task={task} onDone={() => setOpen(false)} />
            </PopoverContent>
        </Popover>
    )
}
