import { useCallback, useContext, useEffect, useRef, type KeyboardEvent } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { useActiveNoteId, useTabs, useTabsActions } from "@/contexts/use-tabs"
import { usePane } from "@/contexts/use-layout"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { NoteHeader } from "./NoteHeader"
import { WhatsNewHeader } from "../whats-new/WhatsNewHeader"
import { isWhatsNewTab } from "@/lib/tabs/virtual-tabs"
import { DropLine } from "../sidebar/DropLine"
import { registerShiftNode, SHIFT_ATTR, tabNodeKey } from "../note-dnd-shift"
import { barDndId, keepInBar, tabDndId, type TabHover, type TabZone } from "./tab-reorder"
import { TabsDndProvider } from "./TabsDndProvider"
import { TabsDndContext } from "./tabs-dnd-context-object"
import type { Note } from "@/types/types"

/**
 * One draggable / droppable tab. `dndId` is the note id in a bar with its own dnd context, `tab:<pane>:<noteId>` in the shared one;
 * `overlay` is true when a `DragOverlay` shows the dragged tab (the original then stays in place, dimmed). `live`: the live drag is on,
 * the other tabs step aside (the wrapper is registered for it, see note-dnd-shift) instead of the drop line.
 */
const Tab = ({ note, pane, indicator, dndId = note.id, overlay = false, live = false }: { note: Note, pane: number, indicator: TabZone | null, dndId?: string | number, overlay?: boolean, live?: boolean }) => {
    const { setNodeRef: setDropRef } = useDroppable({ id: dndId })
    const { setNodeRef: setDragRef, listeners, transform, isDragging, node, activeNodeRect } = useDraggable({ id: dndId })
    // With no overlay the tab itself follows the pointer: kept inside the visible part of its bar, or past the right end it would widen the
    // scrollable area and the bar would show a horizontal scrollbar it does not need (only what is drawn: the drop target is still the pointer's)
    // (with the live drag the transform of the wrapper is the one of the shift: the one of dnd-kit must not overwrite it)
    const shown = live ? null : !overlay && isDragging ? keepInBar(transform, activeNodeRect, node.current?.parentElement) : transform
    // A stable ref callback: a new one per render would unregister the wrapper (and forget its shift) on every hover change
    const shiftKey = tabNodeKey(pane, note.id)
    const setRef = useCallback((element: HTMLElement | null) => {
        setDropRef(element)
        setDragRef(element)
        registerShiftNode(shiftKey, element)
    }, [setDropRef, setDragRef, shiftKey])
    const wrapAttributes = { [SHIFT_ATTR.tab]: note.id, [SHIFT_ATTR.tabBar]: pane }

    return (
        <div
            ref={setRef}
            {...wrapAttributes}
            {...listeners}
            style={{ transform: CSS.Translate.toString(shown) }}
            // The bar draws the lines between the tabs (divide-x): the last tab closes itself on the right
            className={cn("relative min-w-28 shrink-0 last:border-r", isDragging && (overlay ? "opacity-40" : "z-10 opacity-70"))}
        >
            {!isDragging && !live && <DropLine zone={indicator} vertical className="z-20" />}
            {isWhatsNewTab(note.id) ? <WhatsNewHeader /> : <NoteHeader note={note} />}
        </div>
    )
}

/** Scroll of the active tab into view and roving tabindex / arrow keys of one bar (scoped to the tabs inside its list). */
function useTabBar(tabs: Note[]) {
    const { activateNote } = useTabsActions()
    const listRef = useRef<HTMLDivElement>(null)

    // The active tab can be outside the visible part of the bar (many tabs open, a note opened from the tree, the search or a shortcut)
    const activeId = useActiveNoteId()
    useEffect(() => {
        if (activeId === null) return
        listRef.current?.querySelector<HTMLElement>(`[role="tab"][data-note-id="${activeId}"]`)
            ?.scrollIntoView?.({ inline: "nearest", block: "nearest" })
    }, [activeId, tabs.length])

    // Arrows, Home and End move between the tabs (roving tabindex: only the active tab is in the tab order)
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement
        if (target.getAttribute("role") !== "tab" || tabs.length === 0) return
        // A modifier makes it a shortcut (e.g. Ctrl+arrow bound to a sidebar), not a move between the tabs
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
        const index = tabs.findIndex(note => String(note.id) === target.dataset.noteId)
        if (index < 0) return
        const next = e.key === "ArrowRight" ? (index + 1) % tabs.length
            : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
                : e.key === "Home" ? 0
                    : e.key === "End" ? tabs.length - 1
                        : null
        if (next === null) return
        e.preventDefault()
        const note = tabs[next]
        activateNote(note.id)
        listRef.current?.querySelector<HTMLElement>(`[role="tab"][data-note-id="${note.id}"]`)?.focus()
    }
    return { listRef, handleKeyDown }
}

// The line under the tabs: drawn by every inactive tab and, as an inset shadow, by the empty part of the bar.
// The active tab paints over it, so it opens onto the note below.
const BAR_CLASS = "flex shrink-0 w-full overflow-x-auto overflow-y-hidden bg-secondary divide-x-1 shadow-[inset_0_-1px_0_0_var(--color-primary)]"

/**
 * The tab bar of a pane, inside `TabsDndProvider`. Split: the drag and drop context is the shared one, the bar is a droppable
 * (`bar:<pane>`, also the target of an empty bar) and keeps a minimum height so an empty pane can still receive a tab.
 * Not split: the only bar, whose tabs can just be reordered (plain note ids, no minimum height).
 */
function TabBar({ hover, split, live }: { hover: TabHover | null, split: boolean, live: boolean }) {
    const { t } = useTranslation()
    const { tabs } = useTabs()
    const pane = usePane()?.pane ?? 0
    const { listRef, handleKeyDown } = useTabBar(tabs)
    const { setNodeRef } = useDroppable({ id: barDndId(pane), disabled: !split })
    const mine = hover?.pane === pane ? hover : null
    const label = t(pane === 0 ? "notes.split.leftPane" : "notes.split.rightPane")

    return (
        <div
            ref={node => {
                listRef.current = node
                setNodeRef(node)
            }}
            role="tablist"
            aria-label={split ? t("notes.split.openTabsPane", { pane: label }) : t("notes.openTabs")}
            onKeyDown={handleKeyDown}
            className={cn(BAR_CLASS, split && "relative min-h-[42px]")}
        >
            {tabs.map(note => (
                <Tab
                    key={note.id}
                    note={note}
                    pane={pane}
                    dndId={split ? tabDndId(pane, note.id) : note.id}
                    overlay={split || live}
                    live={live}
                    indicator={mine?.overId === note.id ? mine.zone : null}
                />
            ))}
            {/* Over the bar itself (it has no tab to point at): the line at the start, which is also its end */}
            {split && tabs.length === 0 && <DropLine zone={mine && mine.overId === null ? "before" : null} vertical />}
        </div>
    )
}

function NoteListInContext() {
    const shared = useContext(TabsDndContext)!
    return <TabBar hover={shared.hover} split={shared.split} live={shared.live} />
}

/**
 * The tab bar of the open notes. It takes part in the drag and drop of `TabsDndProvider` (shared by the two bars when the workspace is split);
 * rendered on its own, it wraps itself in one for a single bar: tabs can only be reordered, along the horizontal axis.
 */
export const NoteList = () => {
    const shared = useContext(TabsDndContext)
    if (shared) return <NoteListInContext />
    return <TabsDndProvider split={false}><NoteListInContext /></TabsDndProvider>
}
