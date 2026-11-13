import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useActiveNote } from "@/contexts/use-active-note"
import { useActiveNoteId, useSelectedTask } from "@/contexts/use-tabs"
import { findTask } from "@/contexts/note-tree-ops"
import { usePreferences } from "@/contexts/use-preferences"
import { useShortcut } from "@/hooks/use-shortcut"
import { CHROME_HEIGHT_CLASS, useCompactLayout } from "@/lib/sidebar-layout"
import type { RightPanelTab } from "@/lib/store/preferences"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SideBar } from "../sidebar/SideBar"
import { DetailsPanel } from "./DetailsPanel"
import { HistoryPanel } from "./HistoryPanel"
import { useRightPanel } from "./use-right-panel"

const TABS: RightPanelTab[] = ["details", "history"]

/**
 * The right sidebar: two tabs, "Details" (the selected task, otherwise the active note) and "History" (undo/redo).
 * Open state, width and tab are remembered; in a compact window it is an overlay. Must be inside a RightPanelProvider.
 * @category RightPanel
 */
export const SideBarRight = () => {
    const { t } = useTranslation()
    const { open, setOpen, tab, setTab } = useRightPanel()
    const { sidebarRightWidth, setSidebarRightWidth } = usePreferences()
    const compact = useCompactLayout()
    const activeId = useActiveNoteId()
    const { noteDataTree } = useActiveNote()
    const [selectedId, selectTask] = useSelectedTask(activeId)

    useShortcut("toggle-right-sidebar", () => setOpen(!open), { allowInInputs: true })

    // A selected task that disappears (deleted, moved to the trash) is no longer selected
    useEffect(() => {
        if (selectedId !== null && noteDataTree && !findTask(noteDataTree, selectedId)) selectTask(null)
    }, [selectedId, noteDataTree, selectTask])

    return (
        <SideBar
            position="right"
            open={open}
            onOpenChange={setOpen}
            width={sidebarRightWidth}
            onWidthChange={setSidebarRightWidth}
            overlay={compact}
            toggleShortcut="toggle-right-sidebar"
            toggleLabels={{ toggle: t("rightPanel.toggle"), show: t("rightPanel.show"), hide: t("rightPanel.hide") }}
        >
            <Tabs value={tab} onValueChange={value => setTab(value as RightPanelTab)} className="h-full w-full min-h-0 gap-0 bg-secondary">
                {/* Same height as the left sidebar header and the note tabs */}
                <TabsList variant="line" aria-label={t("rightPanel.tabs")} className={`${CHROME_HEIGHT_CLASS} h-auto group-data-[orientation=horizontal]/tabs:h-auto w-full shrink-0 gap-0 rounded-none border-b p-0`}>
                    {TABS.map(item => (
                        <TabsTrigger
                            key={item}
                            value={item}
                            // -mb-px: the line of the active tab lies on the border of the bar instead of 1px above it
                            className="relative -mb-px h-auto flex-1 rounded-none border-0 border-b-2 border-transparent px-3 py-2 after:hidden data-[state=active]:border-primary data-[state=active]:font-semibold"
                        >
                            {t(`rightPanel.${item}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {TABS.map(item => (
                    <TabsContent
                        key={item}
                        value={item}
                        className={item === "details" ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto"}
                    >
                        {item === "details" ? <DetailsPanel /> : <HistoryPanel />}
                    </TabsContent>
                ))}
            </Tabs>
        </SideBar>
    )
}
