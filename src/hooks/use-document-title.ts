import { useEffect } from "react"
import { useTabs, useActiveNoteId } from "@/contexts/use-tabs"
import { useWorkspace } from "@/contexts/use-workspace"

const APP_TITLE = "EasyTask"

/**
 * Keeps the title of the document (and so of the window) in step with the open note: "Note - Workspace - EasyTask" (WCAG 2.4.2).
 * Without an active note it is "Workspace - EasyTask"; when the workspace page goes away the title goes back to the plain name of the app.
 * @category Accessibility
 */
export function useDocumentTitle(): void {
    const { tabs } = useTabs()
    const activeId = useActiveNoteId()
    const { currentWorkspace } = useWorkspace()
    const noteName = activeId === null ? undefined : tabs.find(note => note.id === activeId)?.name
    const workspaceName = currentWorkspace?.name

    useEffect(() => {
        document.title = [noteName, workspaceName, APP_TITLE].filter(Boolean).join(" - ")
    }, [noteName, workspaceName])

    useEffect(() => () => { document.title = APP_TITLE }, [])
}
