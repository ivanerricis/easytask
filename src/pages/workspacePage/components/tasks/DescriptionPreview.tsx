import { useTranslation } from "react-i18next"
import { MarkdownText } from "@/components/markdown-text"
import { cn } from "@/lib/utils"

type Props = {
    text: string
    placeholder: string
    label: string
    /** A click (or Enter) on the text starts the edit. */
    onEdit: () => void
    onToggle: (line: number) => void
    className?: string
}

/**
 * A description when it is not being edited: drawn from its Markdown, with checklist boxes that can be ticked. Clicking the text
 * (or pressing Enter on it) turns it into the textarea; Ctrl+click on a link opens it instead.
 */
export function DescriptionPreview({ text, placeholder, label, onEdit, onToggle, className }: Props) {
    const { t } = useTranslation()
    return (
        <div
            role="group"
            tabIndex={0}
            aria-label={label}
            title={t("tasks.markdown.clickToEdit")}
            data-testid="description-preview"
            onClick={event => { if (!(event.ctrlKey || event.metaKey)) onEdit() }}
            onKeyDown={event => { if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); onEdit() } }}
            className={cn("cursor-text rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none", className)}
        >
            {text.trim() === ""
                ? <p className="text-muted-foreground">{placeholder}</p>
                : <MarkdownText text={text} onToggle={onToggle} />}
        </div>
    )
}
