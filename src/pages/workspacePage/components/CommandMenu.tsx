import { useTranslation } from "react-i18next"
import { TooltipCustom } from "@/components/tooltip-custom"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useAllNotes } from "@/hooks/use-all-notes"
import { NoteSearchLabel } from "@/components/note-search-label"
import { useTabsActions } from "@/contexts/use-tabs"
import { SearchIcon } from "lucide-react"
import { useState } from "react"
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

    return (
        <>
            <CommandDialog open={open} onOpenChange={setOpen} className="rounded-xs">
                <CommandInput placeholder={t("notes.search.placeholder")} />
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