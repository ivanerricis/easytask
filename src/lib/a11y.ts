/** Same focus ring as the Button (3px ring-ring), so every focusable control looks alike. */
export const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

/** Small ghost icon button (size-7) whose hit area extends 2px beyond the visible box. */
export const ghostIconButtonClass = "relative size-7 after:absolute after:-inset-0.5 after:content-['']";

/** The ids that link a tab of the bar to the panel of its pane (aria-controls / aria-labelledby): one panel per pane, one active tab. */
export const tabElementId = (pane: number, noteId: number) => `tab-${pane}-${noteId}`
export const tabPanelId = (pane: number) => `tabpanel-${pane}`
