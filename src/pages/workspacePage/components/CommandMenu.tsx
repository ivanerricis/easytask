import { useTranslation } from "react-i18next"
import { TooltipCustom } from "@/components/tooltip-custom"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useAllNotes } from "@/hooks/use-all-notes"
import { NoteSearchLabel } from "@/components/note-search-label"
import { useTabsActions } from "@/contexts/use-tabs"
import { SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useWorkspace } from "@/contexts/use-workspace"
import { searchDBPageText, type PageTextMatch } from "@/db/queries/note"
import { flushAllPages } from "@/lib/page-text"
import { reportError } from "@/lib/report-error"
import { useShortcut } from "@/hooks/use-shortcut"
import { useShortcutKeys, useShortcutLabel } from "@/contexts/use-shortcuts"
import { Button } from "@/components/ui/button"
import { KbdKeys } from "@/components/kbd"
import { useOptionalUndo } from "@/contexts/undo/use-undo"
import { Redo2, Undo2 } from "lucide-react"

export function CommandMenu() {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const { openNote } = useTabsActions()
    const undo = useOptionalUndo()
    const undoShortcut = useShortcutLabel("undo")
    const redoShortcut = useShortcutLabel("redo")

    useShortcut("search-notes", () => setOpen(open => !open), { allowInInputs: true })
    const searchLabel = useShortcutLabel("search-notes")
    const searchKeys = useShortcutKeys("search-notes")

    // Every note once, with the path of its folder (shown in full, workspace included, under the name)
    const allNotes = useAllNotes()
    const { currentWorkspace } = useWorkspace()
    const workspaceId = currentWorkspace?.id

    // The words typed are also looked for inside the text of the pages (after a short pause: it reads the database)
    const [query, setQuery] = useState("")
    const [textMatches, setTextMatches] = useState<{ query: string, matches: PageTextMatch[] }>({ query: "", matches: [] })
    useEffect(() => {
        const needle = query.trim()
        if (!open || !workspaceId || needle === "") return
        let current = true
        const timer = setTimeout(() => {
            // What is typed in a page and not saved yet counts too
            flushAllPages()
                .then(() => searchDBPageText(workspaceId, needle))
                .then(matches => { if (current) setTextMatches({ query: needle, matches }) })
                .catch((error: unknown) => reportError(error))
        }, 200)
        return () => { current = false; clearTimeout(timer) }
    }, [open, query, workspaceId])
    const shownMatches = query.trim() !== "" && textMatches.query === query.trim() ? textMatches.matches : []
    const noteById = new Map(allNotes.map(entry => [entry.note.id, entry]))

    return (
        <>
            <CommandDialog open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery("") }} className="rounded-xs">
                <CommandInput placeholder={t("notes.search.placeholder")} value={query} onValueChange={setQuery} />
                <CommandList>
                    <CommandEmpty>{t("notes.search.empty")}</CommandEmpty>
                    <CommandGroup heading={t("notes.search.suggestions")}>
                        {allNotes.map(({ note, path }) => (
                            <CommandItem
                                className="!p-2"
                                key={note.id}
                                value={`${note.name} ${note.id}`}
                                keywords={path ? [path] : undefined}
                                onSelect={() => {
                                    setOpen(prev => !prev)
                                    openNote(note.id)
                                }}
                            >
                                <NoteSearchLabel name={note.name} path={path} />
                            </CommandItem>))}
                    </CommandGroup>
                    {shownMatches.length > 0 && (
                        <CommandGroup heading={t("notes.search.inText")}>
                            {shownMatches.flatMap(({ id, snippet }) => {
                                const entry = noteById.get(id)
                                if (!entry) return []
                                // The query is part of the value, so the filter of the list keeps the pages found by their text
                                return [(
                                    <CommandItem
                                        className="!p-2"
                                        key={`text-${id}`}
                                        value={`${entry.note.name} ${id} ${textMatches.query}`}
                                        onSelect={() => { setOpen(false); setQuery(""); openNote(id) }}
                                    >
                                        <NoteSearchLabel name={entry.note.name} path={entry.path} snippet={snippet} />
                                    </CommandItem>
                                )]
                            })}
                        </CommandGroup>
                    )}
                    {undo && (undo.canUndo || undo.canRedo) && (
                        <CommandGroup heading={t("undo.actions")}>
                            {undo.canUndo && (
                                <CommandItem className="!p-2" onSelect={() => { setOpen(false); void undo.undo() }}>
                                    <Undo2 className="size-4" />
                                    {t("undo.undoWithLabel", { label: undo.undoLabel })}
                                    {undoShortcut && <span className="ml-auto text-xs text-muted-foreground">{undoShortcut}</span>}
                                </CommandItem>
                            )}
                            {undo.canRedo && (
                                <CommandItem className="!p-2" onSelect={() => { setOpen(false); void undo.redo() }}>
                                    <Redo2 className="size-4" />
                                    {t("undo.redoWithLabel", { label: undo.redoLabel })}
                                    {redoShortcut && <span className="ml-auto text-xs text-muted-foreground">{redoShortcut}</span>}
                                </CommandItem>
                            )}
                        </CommandGroup>
                    )}
                </CommandList>
            </CommandDialog>

            <TooltipCustom text={t("notes.hints.search")} shortcut={searchLabel}>
                <Button
                    type="button"
                    variant="outline"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onClick={() => { setOpen(prev => !prev) }}
                    className="app-no-drag h-7 w-full justify-start gap-2 rounded-xs px-2 py-0 text-xs font-normal text-muted-foreground">
                    <SearchIcon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{t("notes.search.short")}</span>
                    {searchKeys.length > 0 && <KbdKeys keys={searchKeys} className="shrink-0" />}
                </Button>
            </TooltipCustom>
        </>
    )
}