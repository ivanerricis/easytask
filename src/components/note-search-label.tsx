import { useContext } from "react"
import { FileText } from "lucide-react"
import { WorkspaceContext } from "@/contexts/workspace-context-object"

type NoteSearchLabelProps = {
    name: string
    /** Folders the note is in ("" at the root of the workspace), as given by useAllNotes. */
    path: string
    /** The piece of text of a page around the words found (search by text only). */
    snippet?: string
}

/**
 * Content of a note in the note search lists: the name, and under it the full location of the note
 * (workspace / folders), so that notes with the same name can be told apart.
 * @category Components
 */
export const NoteSearchLabel = ({ name, path, snippet }: NoteSearchLabelProps) => {
    // Optional: outside a workspace provider the location is just the folders
    const workspaceName = useContext(WorkspaceContext)?.currentWorkspace?.name
    const location = [workspaceName, path].filter(Boolean).join(" / ")

    return (
        <>
            <FileText className="size-4 shrink-0" />
            <div className="flex min-w-0 flex-col">
                <span className="truncate">{name}</span>
                {snippet && <span className="truncate text-xs italic text-muted-foreground" title={snippet} data-testid="search-snippet">{snippet}</span>}
                {location && <span className="truncate text-xs text-muted-foreground" title={location}>{location}</span>}
            </div>
        </>
    )
}
