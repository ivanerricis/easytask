import { useEffect } from "react"
import { useActiveNote } from "@/contexts/use-active-note"
import { useActiveNoteId, useSelectTask, useTabsActions, useTabUiStore } from "@/contexts/use-tabs"
import { usePaneRoot } from "@/contexts/use-layout"
import { useStoreSelector } from "@/lib/external-store"
import { claimOpenNote, finishOpenTask, openTaskStore } from "@/lib/open-task-request"
import { taskSections } from "@/lib/group-sections"
import type { NoteDataTree, Task } from "@/types/types"

/** How many frames to wait for the row of the task to be drawn before giving up on the scroll. */
const SEEK_FRAMES = 90

/** The group, the section and the parent tasks above a task, to open them (the task may be inside closed ones); null when it is not in the note. */
function pathOf(tree: NoteDataTree, taskId: number): { groupId: number, sectionId: number, ancestors: number[] } | null {
    const search = (tasks: Task[], trail: number[]): number[] | null => {
        for (const task of tasks) {
            if (task.id === taskId) return trail
            const inner = search(task.subtasks, [...trail, task.id])
            if (inner) return inner
        }
        return null
    }
    for (const group of tree.groups)
        for (const section of taskSections(group)) {
            const ancestors = search(section.tasks, [])
            if (ancestors) return { groupId: group.id, sectionId: section.id, ancestors }
        }
    return null
}

/**
 * Carries out a request to show a task (see requestOpenTask): opens its note in a tab, selects the task (details panel and
 * highlight), opens the closed group, section and parent tasks above it for as long as the note is open, and scrolls its row
 * into view. Mount it once per pane: the pane whose active note is the target does the selection.
 */
export function OpenTaskEffect() {
    const request = useStoreSelector(openTaskStore, state => state)
    const { openNote } = useTabsActions()
    const activeId = useActiveNoteId()
    const { noteDataTree } = useActiveNote()
    const selectTask = useSelectTask()
    const ui = useTabUiStore()
    const paneRoot = usePaneRoot()

    // 1. Open the note once the workspace of the task is the open one
    useEffect(() => {
        if (!request || !request.ready || request.noteOpened) return
        if (claimOpenNote()) openNote(request.noteId)
    }, [request, openNote])

    // 2. The note is the active one of this pane and drawn: select the task, open what hides it, scroll to it
    useEffect(() => {
        if (!request || !request.noteOpened || activeId !== request.noteId || !noteDataTree) return
        const path = pathOf(noteDataTree, request.taskId)
        if (!path) { finishOpenTask(); return }
        selectTask(request.taskId)
        ui.setRevealed(request.noteId, "group", path.groupId, true)
        ui.setRevealed(request.noteId, "section", path.sectionId, true)
        for (const id of path.ancestors) ui.setRevealed(request.noteId, "task", id, true)
        let frame = 0
        let attempts = 0
        const seek = () => {
            const row = paneRoot().querySelector(`[data-task-id="${request.taskId}"]`)
            if (row) {
                row.scrollIntoView?.({ block: "center", inline: "nearest" })
                finishOpenTask()
                return
            }
            if (++attempts < SEEK_FRAMES) frame = requestAnimationFrame(seek)
            else finishOpenTask()
        }
        frame = requestAnimationFrame(seek)
        return () => cancelAnimationFrame(frame)
    }, [request, activeId, noteDataTree, selectTask, ui, paneRoot])

    return null
}
