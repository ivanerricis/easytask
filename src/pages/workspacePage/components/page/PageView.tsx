import { useCallback, useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import { MarkdownText } from "@/components/markdown-text"
import { Highlight } from "@/components/highlight"
import { Textarea } from "@/components/ui/textarea"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { usePageMode } from "@/contexts/use-page"
import { useNoteBackgroundCss } from "@/hooks/use-note-background"
import { acquirePage, editPageText, flushPage, getPageSnapshot, setPageStepSink, subscribePages } from "@/lib/page-text"
import { useOptionalUndo, useUndoRecorder } from "@/contexts/undo/use-undo"
import { useWorkspaceState } from "@/contexts/workspace-data"
import { findTreeItem } from "@/contexts/workspace-tree-ops"
import { toggleChecklistItem } from "@/lib/markdown-lite"
import { countPreviewMatches } from "@/lib/page-search"
import { findMatchRanges, type SearchMatch } from "../note-search"
import { useNoteSearchStore } from "../note-search-context"
import type { NoteSearchStore } from "../note-search-store"

// Same classes on the textarea and on the layer under it that draws the marks of the search: the lines must wrap the same way
const TEXT_CLASS = "w-full whitespace-pre-wrap break-words px-3 py-2 font-mono text-sm md:text-sm"

/** The search of the open page as the store of the path bar sees it: the query, and the current match. */
function useSearchState(store: NoteSearchStore | null) {
    const open = useSyncExternalStore(store?.subscribe ?? (() => () => {}), () => store?.getState().open ?? false)
    const query = useSyncExternalStore(store?.subscribe ?? (() => () => {}), () => store?.getState().query ?? "")
    const active = useSyncExternalStore(store?.subscribe ?? (() => () => {}), () => store?.getState().activeIndex ?? 0)
    return { open, query: open ? query : "", active }
}

/** The text of a page as it is typed, with the matches of the search marked on a layer under it. */
function PageEditor({ noteId, text, mirrorRef }: { noteId: number, text: string, mirrorRef: RefObject<HTMLDivElement | null> }) {
    const { t } = useTranslation()
    const history = useOptionalUndo()
    const { query, active } = useSearchState(useNoteSearchStore())
    // The undo of the app replaces the one of the textarea: the typed text is saved first, so it is a step of the history
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (!history || !(event.ctrlKey || event.metaKey) || event.altKey) return
        const key = event.key.toLowerCase()
        const redo = key === "y" || (key === "z" && event.shiftKey)
        const undo = key === "z" && !event.shiftKey
        if (!undo && !redo) return
        event.preventDefault()
        void flushPage(noteId).then(() => redo ? history.redo() : history.undo())
    }
    return (
        <div className="relative h-full">
            {query.trim() !== "" && (
                <div ref={mirrorRef} aria-hidden data-testid="page-text-marks" className={`pointer-events-none absolute inset-0 overflow-y-scroll text-transparent ${TEXT_CLASS}`}>
                    <div className="relative">
                        <Highlight text={`${text}\n`} query={query} active={active} markClassName="!text-transparent" />
                    </div>
                </div>
            )}
            <Textarea
                data-testid="page-text"
                aria-label={t("notes.page.text")}
                placeholder={t("notes.page.placeholder")}
                value={text}
                spellCheck={false}
                onChange={event => editPageText(noteId, event.target.value)}
                onKeyDown={onKeyDown}
                onScroll={event => { if (mirrorRef.current) mirrorRef.current.scrollTop = event.currentTarget.scrollTop }}
                className={`relative h-full min-h-0 resize-none overflow-y-scroll rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 field-sizing-fixed ${TEXT_CLASS}`}
            />
        </div>
    )
}

/** The formatted page: React elements only (see MarkdownText), links open with Ctrl+click, a click on a checklist box edits the text. */
function PagePreview({ noteId, text, containerRef }: { noteId: number, text: string, containerRef: RefObject<HTMLDivElement | null> }) {
    const { t } = useTranslation()
    const { query, active } = useSearchState(useNoteSearchStore())
    const toggle = useCallback((line: number) => {
        const next = toggleChecklistItem(getPageSnapshot(noteId).text, line)
        if (next !== null) editPageText(noteId, next)
    }, [noteId])
    return (
        <div ref={containerRef} className="h-full overflow-y-auto p-4" data-testid="page-preview" role="document" aria-label={t("notes.page.previewLabel")}>
            {text.trim() === ""
                ? <p className="text-sm text-muted-foreground">{t("notes.page.emptyPreview")}</p>
                : <MarkdownText text={text} rich onToggle={toggle} search={{ query, active }} className="mx-auto max-w-3xl text-md [&>*+*]:mt-3" />}
        </div>
    )
}

/**
 * The search of the path bar inside a page: it finds the matches in the text (or in what the preview draws), gives them to the
 * store (the counter and the arrows of the field read it) and brings the current one into view. Draws nothing.
 */
function PageSearchEngine({ store, noteId, text, mode, mirrorRef, previewRef }: {
    store: NoteSearchStore, noteId: number, text: string, mode: "edit" | "preview",
    mirrorRef: RefObject<HTMLDivElement | null>, previewRef: RefObject<HTMLDivElement | null>,
}) {
    const open = useSyncExternalStore(store.subscribe, () => store.getState().open)
    const query = useSyncExternalStore(store.subscribe, () => store.getState().query)
    const revealTick = useSyncExternalStore(store.subscribe, () => store.getState().revealTick)
    const scanned = useRef("")

    useEffect(() => {
        if (!open) scanned.current = ""
        if (!open) return
        const fresh = scanned.current !== query
        const total = query.trim() === "" ? 0 : mode === "edit" ? findMatchRanges(text, query).length : countPreviewMatches(text, query)
        scanned.current = query
        const matches: SearchMatch[] = Array.from({ length: total }, (_, occurrence) => ({
            id: `page-${noteId}#${occurrence}`, key: `page-${noteId}`, kind: "group", itemId: noteId, groupId: 0, taskPath: [], occurrence,
        }))
        store.setMatches(matches, fresh)
    }, [open, query, text, mode, noteId, store])

    // The current match is brought into view when it changes (a step, a new query)
    useEffect(() => {
        if (revealTick === 0) return
        const frame = requestAnimationFrame(() => {
            if (mode === "edit") {
                const textarea = mirrorRef.current?.parentElement?.querySelector("textarea")
                const mark = mirrorRef.current?.querySelector<HTMLElement>("mark[data-active]")
                if (mark && textarea) textarea.scrollTop = Math.max(0, mark.offsetTop - textarea.clientHeight / 3)
            } else {
                previewRef.current?.querySelector("mark[data-active]")?.scrollIntoView?.({ block: "center" })
            }
        })
        return () => cancelAnimationFrame(frame)
    }, [revealTick, mode, mirrorRef, previewRef])

    return null
}

/** The body of a pane whose open note is a page: its text or its formatted preview, as chosen with the button of the path bar. */
export function PageView() {
    const noteId = useActiveNoteId()
    const [mode] = usePageMode()
    const background = useNoteBackgroundCss(noteId)
    const recorder = useUndoRecorder()
    const search = useNoteSearchStore()
    const { workspaceDataTree } = useWorkspaceState()
    const treeRef = useRef(workspaceDataTree)
    useEffect(() => { treeRef.current = workspaceDataTree }, [workspaceDataTree])
    const mirrorRef = useRef<HTMLDivElement | null>(null)
    const previewRef = useRef<HTMLDivElement | null>(null)
    // Each saved burst of typing is a step of the history (the sink stays after the view goes away: a pending write still records its step)
    useEffect(() => {
        setPageStepSink((id, before, after) => {
            const tree = treeRef.current
            const name = tree ? (findTreeItem(tree, "note", id)?.item as { name?: string } | undefined)?.name : undefined
            recorder.pageText(id, name ?? "", before, after)
        })
    }, [recorder])
    useEffect(() => (noteId === null ? undefined : acquirePage(noteId)), [noteId])
    const snapshot = useSyncExternalStore(subscribePages, () => getPageSnapshot(noteId))
    const ready = noteId !== null && snapshot.status === "ready"
    return (
        <div className="relative min-h-0 w-full flex-1" data-testid="page-view" style={background}>
            {ready && (mode === "edit"
                ? <PageEditor key={noteId} noteId={noteId} text={snapshot.text} mirrorRef={mirrorRef} />
                : <PagePreview noteId={noteId} text={snapshot.text} containerRef={previewRef} />)}
            {ready && search && <PageSearchEngine store={search} noteId={noteId} text={snapshot.text} mode={mode} mirrorRef={mirrorRef} previewRef={previewRef} />}
        </div>
    )
}
