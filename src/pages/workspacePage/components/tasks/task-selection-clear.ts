// Where a left click leaves the selection alone: the tasks themselves, the selection bar, and everything that floats over the page
// (menus, dialogs, popovers, the toasts). A click on the overlay of an open dialog or outside an open menu only closes it.
const KEEPS_SELECTION = "[role='treeitem'][data-task-id], [data-task-selection-bar], [role='menu'], [role='dialog'], [role='alertdialog'], [role='listbox'], [data-radix-popper-content-wrapper], [data-sonner-toast], [data-sonner-toaster]"
// Only what is really open (Radix marks it): a closed or lingering element, or a tooltip, must not keep the selection
const FLOATING_OPEN = "[role='menu'][data-state='open'], [role='dialog'][data-state='open'], [role='alertdialog'][data-state='open'], [role='listbox'][data-state='open']"

/** Whether a press clears the multi-selection: the main button, without Ctrl/Cmd/Shift, outside {@link KEEPS_SELECTION} and with nothing floating open. */
export function clearsTaskSelection(event: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "target">): boolean {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return false
    const target = event.target
    if (!(target instanceof Element)) return false
    return !target.closest(KEEPS_SELECTION) && !document.querySelector(FLOATING_OPEN)
}
