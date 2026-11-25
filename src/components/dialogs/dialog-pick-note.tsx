import { useTranslation } from "react-i18next"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useAllNotes } from "@/hooks/use-all-notes"
import { NoteSearchLabel } from "@/components/note-search-label"

type DialogPickNoteProps = {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    /** Called with the chosen note; the dialog closes itself. */
    onPick: (note: { id: number, name: string }) => void
    title: string
    description?: string
    placeholder: string
}

/**
 * Lets the user choose one of the notes of the open workspace, with a search box (the same list as the note search,
 * with the folder of each note).
 * @category Dialogs
 */
export const DialogPickNote = ({ isOpen, onOpenChange, onPick, title, description, placeholder }: DialogPickNoteProps) => {
    const { t } = useTranslation()
    const allNotes = useAllNotes().filter(({ note }) => note.kind !== "page")

    return (
        <CommandDialog open={isOpen} onOpenChange={onOpenChange} title={title} description={description} className="rounded-xs">
            <CommandInput placeholder={placeholder} />
            <CommandList>
                <CommandEmpty>{t("notes.search.empty")}</CommandEmpty>
                <CommandGroup heading={t("dialogs.pickNote.heading")}>
                    {allNotes.map(({ note, path }) => (
                        <CommandItem
                            className="!p-2"
                            key={note.id}
                            value={`${note.name} ${note.id}`}
                            keywords={path ? [path] : undefined}
                            onSelect={() => {
                                onOpenChange(false)
                                onPick({ id: note.id, name: note.name })
                            }}
                        >
                            <NoteSearchLabel name={note.name} path={path} />
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    )
}
