import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { MarkdownText } from "@/components/markdown-text"
import { Textarea } from "@/components/ui/textarea"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { usePageMode } from "@/contexts/use-page"
import { useNoteBackgroundCss } from "@/hooks/use-note-background"
import { acquirePage, editPageText, getPageSnapshot, subscribePages } from "@/lib/page-text"
import { toggleChecklistItem } from "@/lib/markdown-lite"

/** The text of a page as it is typed. */
function PageEditor({ noteId, text }: { noteId: number, text: string }) {
    const { t } = useTranslation()
    return (
        <Textarea
            data-testid="page-text"
            aria-label={t("notes.page.text")}
            placeholder={t("notes.page.placeholder")}
            value={text}
            spellCheck={false}
            onChange={event => editPageText(noteId, event.target.value)}
            className="h-full min-h-0 w-full resize-none rounded-none border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0 field-sizing-fixed"
        />
    )
}

/** The formatted page: React elements only (see MarkdownText), links open with Ctrl+click, a click on a checklist box edits the text. */
function PagePreview({ noteId, text }: { noteId: number, text: string }) {
    const { t } = useTranslation()
    const toggle = useCallback((line: number) => {
        const next = toggleChecklistItem(getPageSnapshot(noteId).text, line)
        if (next !== null) editPageText(noteId, next)
    }, [noteId])
    return (
        <div className="h-full overflow-y-auto p-4" data-testid="page-preview" role="document" aria-label={t("notes.page.previewLabel")}>
            {text.trim() === ""
                ? <p className="text-sm text-muted-foreground">{t("notes.page.emptyPreview")}</p>
                : <MarkdownText text={text} rich onToggle={toggle} className="mx-auto max-w-3xl text-md [&>*+*]:mt-3" />}
        </div>
    )
}

/** The body of a pane whose open note is a page: its text or its formatted preview, as chosen with the button of the path bar. */
export function PageView() {
    const noteId = useActiveNoteId()
    const [mode] = usePageMode()
    const background = useNoteBackgroundCss(noteId)
    useEffect(() => (noteId === null ? undefined : acquirePage(noteId)), [noteId])
    const snapshot = useSyncExternalStore(subscribePages, () => getPageSnapshot(noteId))
    return (
        <div className="relative min-h-0 w-full flex-1" data-testid="page-view" style={background}>
            {noteId !== null && snapshot.status === "ready" && (mode === "edit"
                ? <PageEditor key={noteId} noteId={noteId} text={snapshot.text} />
                : <PagePreview noteId={noteId} text={snapshot.text} />)}
        </div>
    )
}
