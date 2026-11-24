import { useRef, type FocusEvent, type MouseEvent } from "react"
import { useSelectTask } from "@/contexts/use-tabs"
import { handleSelectionClick } from "../sidebar/selection"
import { taskKey } from "./task-selection"
import { useTaskSelectionStore } from "./use-task-selection"
import { useTaskTabStopStore } from "./task-tab-stop"
import { LINK_ATTRIBUTE } from "@/lib/link-click"
import { isLinkClick } from "@/lib/links"
import { isFocusKeepingDetails } from "./task-focus-intent"

// Clicks on these keep their own action (checkbox, buttons) and do not select the row
const SELECTION_IGNORED = "button, [role=button], [role=checkbox]"

/**
 * Pointer and focus handlers of a task row: a click shows the task in the details, a selection gesture (Ctrl/Cmd/Shift)
 * adds it to the multi-selection instead, and the focused row becomes the tab stop of its list.
 */
export function useTaskRowPointer(taskId: number) {
    const selectTask = useSelectTask()
    const selectionStore = useTaskSelectionStore()
    const tabStopStore = useTaskTabStopStore()
    // The press that is going to focus the row carried Ctrl/Cmd/Shift: it is a selection gesture, not a single selection
    const gestureDown = useRef(false)

    return {
        // Capture phase: a selection gesture must not reach the text (rename) or the other handlers of the row
        onClickCapture: (e: MouseEvent<HTMLElement>) => {
            gestureDown.current = false
            if ((e.target as HTMLElement).closest(SELECTION_IGNORED)) return
            // Ctrl+click on a link of the text opens the link: it is not a selection gesture
            if (isLinkClick(e) && (e.target as HTMLElement).closest(`[${LINK_ATTRIBUTE}]`)) return
            if (handleSelectionClick(selectionStore, taskKey(taskId), e)) {
                e.preventDefault()
                e.stopPropagation()
            }
        },
        onMouseDown: (e: MouseEvent<HTMLElement>) => {
            const onLink = isLinkClick(e) && !e.shiftKey && !!(e.target as HTMLElement).closest(`[${LINK_ATTRIBUTE}]`)
            gestureDown.current = !!selectionStore && !onLink && (e.shiftKey || e.ctrlKey || e.metaKey)
            // No text selection while extending a range with Shift
            if (selectionStore && e.shiftKey) e.preventDefault()
        },
        onClick: (e: MouseEvent<HTMLElement>) => {
            if (!(e.target as HTMLElement).closest(SELECTION_IGNORED)) selectTask(taskId)
        },
        onFocus: (e: FocusEvent<HTMLElement>) => {
            tabStopStore?.set(taskId)
            const gesture = gestureDown.current
            gestureDown.current = false
            // A row focused by Shift+arrows / Ctrl+Space is part of a selection: the details stay as they are
            if (!gesture && !isFocusKeepingDetails(e.currentTarget)) selectTask(taskId)
        },
    }
}
