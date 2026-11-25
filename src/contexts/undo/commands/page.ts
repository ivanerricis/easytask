import { applyPageText } from "@/lib/page-text"
import type { UndoCommand } from "../stack"
import { makeLabel } from "./helpers"

/** The commands on the text of a page: one step is the text typed between two pauses (see page-text.ts). */
export function pageCommands() {
    return {
        pageText: (noteId: number, name: string, before: string, after: string): UndoCommand => ({
            label: makeLabel("pageText", "page", name),
            undo: () => applyPageText(noteId, before),
            redo: () => applyPageText(noteId, after),
        }),
    }
}
