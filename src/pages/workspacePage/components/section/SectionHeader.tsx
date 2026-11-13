import { MAX_NAME_LENGTH } from "@/lib/names"
import { memo, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ProgressRing } from "@/components/ui/progress-ring"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getErrorMessage } from "@/lib/utils"
import type { Section as SectionType } from "@/types/types"
import { ChevronDown } from "lucide-react"
import { ButtonMenuSection } from "./ButtonMenuSection"
import { ItemMenuButton } from "@/components/item-menu"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { InlineErrorTooltip } from "@/components/inline-error-tooltip"
import { withRollback } from "@/contexts/with-rollback"
import { useInlineEdit } from "@/hooks/use-inline-edit"
import { getSectionLabel } from "./section-label"
import { getSectionCompletionPercent } from "./section-progress"
import { Highlight } from "@/components/highlight"
import { useSearchHighlight } from "../note-search-context"
import { usePreference } from "@/contexts/use-preference"
import type { HTMLAttributes } from "react"

type SectionHeaderProps = {
    isOpen: boolean
    onOpenChange: (isOpen: boolean) => void
    section: SectionType
    /** Starts the drag of the section from the whole header (drag & drop inside the open note); omitted when not draggable. */
    dragProps?: HTMLAttributes<HTMLElement>
}

export const SectionHeader = memo(({ isOpen, onOpenChange, section, dragProps }: SectionHeaderProps) => {
    const { t } = useTranslation()
    const { renameItem } = useWorkspaceActions()
    const { patchSection } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    const showProgressBar = usePreference(p => p.showProgressBar)
    const showUnnamedLabels = usePreference(p => p.showUnnamedLabels)
    const renameOnClick = usePreference(p => p.renameOnClick) ?? true
    const search = useSearchHighlight("section", section.id)
    // An empty text removes the title (a section can have none)
    const { editing: isTextAreaOpen, error, start: startEdit, inputProps } = useInlineEdit({
        value: section.title,
        allowEmpty: true,
        errorMessage: err => t("sections.renameError", { message: getErrorMessage(err) }),
        onCommit: async next => {
            // Optimistic: the cached tree is updated at once and restored if the write fails
            await withRollback(patchSection(section.id, { title: next }), () => renameItem("section", section.id, next))
            recorder.rename("section", section.id, section.title, next)
        },
    })

    const handleOpen = () => {
        onOpenChange(!isOpen)
    }

    const completionPercentage = useMemo(() => getSectionCompletionPercent(section.tasks), [section.tasks])

    return (
        <div className="relative flex flex-col items-center justify-center">

            <ButtonMenuSection section={section} onRename={startEdit}>
                <div
                    // The color of the section is the band at the top of its card (see Section): the header stays plain
                    className={`group flex items-center gap-1 w-full px-1.5 py-1 whitespace-nowrap rounded-xs ${dragProps ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
                    {...dragProps}
                >
                    {/* Without tasks there is nothing to collapse, but the arrow's space stays so the title does not move */}
                    {(section.tasks.length === 0) && <span aria-hidden data-testid="collapse-placeholder" className="size-6 shrink-0" />}
                    {(section.tasks.length > 0) &&
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleOpen}
                            aria-label={isOpen ? t("sections.collapse") : t("sections.expand")}
                            aria-expanded={isOpen}
                            className="size-6 shrink-0">
                            <ChevronDown className={isOpen ? "rotate-0" : "-rotate-90"} />
                        </Button>}
                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                        {!isTextAreaOpen && <button
                            type="button"
                            onClick={renameOnClick ? startEdit : undefined}
                            // Enter renames even when the click does not
                            onKeyDown={e => { if (!renameOnClick && e.key === "Enter") { e.preventDefault(); startEdit() } }}
                            title={section.title ? section.title : undefined}
                            // An untitled section shows no text unless the preference asks for the fallback label
                            // and says what the button does (Enter renames), not only what it is called
                            aria-label={t("sections.renameAria", { name: getSectionLabel(section) })}
                            className={`text-sm ml-1 min-w-0 flex-1 h-6 truncate text-left rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${renameOnClick ? "cursor-text" : ""} ${!section.title ? "text-muted-foreground" : ""}`}>
                            {search.query ? <Highlight text={section.title} query={search.query} active={search.active} /> : section.title || (showUnnamedLabels ? getSectionLabel(section) : "")}
                        </button>}
                        {isTextAreaOpen && <InlineErrorTooltip message={error}>
                            <Input
                                {...inputProps}
                                onPointerDown={e => e.stopPropagation()}
                                type="text"
                                placeholder={t("sections.untitled")}
                                aria-label={t("sections.titleLabel")}
                                maxLength={MAX_NAME_LENGTH}
                                className="h-6 min-w-0 flex-1 px-1 py-0 ml-1 text-sm md:text-sm border-primary"
                            />
                        </InlineErrorTooltip>}
                        {!isOpen && section.tasks.length > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {t("common.counts.task", { count: section.tasks.length })}
                        </span>}
                        {showProgressBar && section.tasks.length > 0 && <div className="flex items-center gap-1.5 shrink-0">
                            <ProgressRing value={completionPercentage} aria-label={t("sections.progress")} />
                            <span className="min-w-[3ch] text-right text-xs text-muted-foreground tabular-nums">
                                {Math.round(completionPercentage)}%
                            </span>
                        </div>}
                        <div className="flex items-center leading-none shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                            <ItemMenuButton name={getSectionLabel(section)} />
                        </div>
                    </div>
                </div>
            </ButtonMenuSection>
        </div>
    )
})
