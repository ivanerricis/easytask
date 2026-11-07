import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PreferencesProvider } from "./preferences-context"
import { usePreferences } from "./use-preferences"
import * as prefs from "@/lib/store/preferences"
import { reportError } from "@/lib/report-error"
import { applyTextZoom } from "@/lib/text-zoom"
import { applyFontFamily } from "@/lib/font-family"

vi.mock("@/lib/text-zoom", () => ({ applyTextZoom: vi.fn() }))
vi.mock("@/lib/font-family", () => ({ applyFontFamily: vi.fn() }))

vi.mock("@/lib/store/initStore", () => ({ store: {} }))
vi.mock("@/lib/store/preferences", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/store/preferences")>()),
    getPref: vi.fn(),
    getAllPrefs: vi.fn(),
    savePref: vi.fn(),
    getPrimaryColor: vi.fn(),
    savePrimaryColor: vi.fn(),
    getAudioPlayerPosition: vi.fn(),
    saveAudioPlayerPosition: vi.fn(),
    resetAudioPlayerPosition: vi.fn(),
}))
vi.mock("@/lib/report-error", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/report-error")>()),
    reportError: vi.fn(),
}))

let stored: Record<string, unknown> = {}

const wrapper = ({ children }: { children: ReactNode }) => <PreferencesProvider>{children}</PreferencesProvider>

describe("PreferencesContext", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        document.documentElement.style.removeProperty("--primary")
        vi.mocked(prefs.getPrimaryColor).mockResolvedValue("#123456")
        vi.mocked(prefs.getAudioPlayerPosition).mockResolvedValue({ x: 5, y: 6, scaleX: 2, scaleY: 2 })
        stored = {
            showProgressBar: false,
            showGroupProgressBar: false,
            showSectionCount: true,
            showTaskCount: false,
            showAudioFileCount: false,
            showGroupSeparators: true,
            showUnnamedLabels: true,
            renameOnClick: false,
            keepAddingTasks: false,
            showTaskInsertLine: false,
            liveDrag: false,
            undoLimit: 200,
            sidebarLeftOpen: false,
            sidebarRightOpen: true,
            workspaceView: "list",
            workspaceSort: { by: "name", dir: "asc" },
            reopenNotes: false,
            reopenLastWorkspace: true,
            sidebarItemSize: "large",
            textZoom: 1.25,
            fontFamily: "lora",
            sidebarLeftWidth: 320,
            sidebarRightWidth: 300,
            rightPanelTab: "history",
            language: "system",
            colorIntensity: 1.4,
            audioVolume: 0.3,
            audioPlayerVisible: false,
            audioPlayerPinned: true,
            audioPlayerScale: 1.2,
            audioPlayerOpacity: 0.6,
            audioPlaybackRate: 1.5,
            audioRepeat: true,
            audioResume: true,
            hideCompletedTasks: true,
            showSubtaskCount: false,
        }
        vi.mocked(prefs.getPref).mockImplementation(async name => name in stored ? stored[name] : prefs.UI_PREFS[name as prefs.UiPrefName].default)
        vi.mocked(prefs.getAllPrefs).mockImplementation(async () => Object.fromEntries(
            (Object.keys(prefs.UI_PREFS) as prefs.UiPrefName[]).map(name => [name, name in stored ? stored[name] : prefs.UI_PREFS[name].default])) as Awaited<ReturnType<typeof prefs.getAllPrefs>>)
        // The saves are promises (the provider reports their failures)
        for (const [name, fn] of Object.entries(prefs)) {
            if (/^(save|reset)/.test(name) && vi.isMockFunction(fn)) fn.mockResolvedValue(undefined)
        }
    })

    it("keeps the same value and setters while nothing changes", async () => {
        const { result, rerender } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.undoLimit).toBe(200))
        const before = result.current
        rerender()
        expect(result.current).toBe(before)
        act(() => result.current.setUndoLimit(100))
        expect(result.current).not.toBe(before)
        expect(result.current.setUndoLimit).toBe(before.setUndoLimit)
        expect(result.current.setAudioPlayerPosition).toBe(before.setAudioPlayerPosition)
    })

    it("has defaults for the audio count, the separators and the undo limit before the store answers", () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.showAudioFileCount).toBe(true)
        expect(result.current.showGroupSeparators).toBe(false)
        expect(result.current.undoLimit).toBe(50)
    })

    it("updates and saves the audio count, the separators and the undo limit", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.undoLimit).toBe(200))
        act(() => {
            result.current.setShowAudioFileCount(true)
            result.current.setShowGroupSeparators(false)
            result.current.setUndoLimit(25)
            result.current.setShowUnnamedLabels(false)
            result.current.setRenameOnClick(true)
            result.current.setKeepAddingTasks(true)
            result.current.setShowTaskInsertLine(false)
            result.current.setLiveDrag(false)
        })
        expect(result.current.showAudioFileCount).toBe(true)
        expect(result.current.showGroupSeparators).toBe(false)
        expect(result.current.undoLimit).toBe(25)
        expect(prefs.savePref).toHaveBeenCalledWith("showAudioFileCount", true)
        expect(prefs.savePref).toHaveBeenCalledWith("showGroupSeparators", false)
        expect(prefs.savePref).toHaveBeenCalledWith("undoLimit", 25)
        expect(prefs.savePref).toHaveBeenCalledWith("showUnnamedLabels", false)
        expect(prefs.savePref).toHaveBeenCalledWith("renameOnClick", true)
        expect(result.current.keepAddingTasks).toBe(true)
        expect(result.current.liveDrag).toBe(false)
        expect(prefs.savePref).toHaveBeenCalledWith("keepAddingTasks", true)
        expect(prefs.savePref).toHaveBeenCalledWith("showTaskInsertLine", false)
        expect(prefs.savePref).toHaveBeenCalledWith("liveDrag", false)
    })

    it("sets the spellcheck of the document from the preference", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(document.documentElement.spellcheck).toBe(true)
        act(() => result.current.setSpellcheck(false))
        expect(document.documentElement.spellcheck).toBe(false)
        expect(prefs.savePref).toHaveBeenCalledWith("spellcheck", false)
        act(() => result.current.setSpellcheck(true))
        expect(document.documentElement.spellcheck).toBe(true)
        await waitFor(() => expect(result.current.primaryColor).toBe("#123456"))
    })

    it("applies a stored spellcheck off", async () => {
        stored.spellcheck = false
        renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(document.documentElement.spellcheck).toBe(false))
        document.documentElement.spellcheck = true
    })

    it("throws when used outside the provider", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        expect(() => renderHook(() => usePreferences())).toThrow(/PreferencesProvider/)
        spy.mockRestore()
    })

    it("has defaults before the store answers", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.primaryColor).toBe("#c2410c")
        expect(result.current.showProgressBar).toBe(true)
        expect(result.current.showGroupProgressBar).toBe(true)
        expect(result.current.showUnnamedLabels).toBe(false)
        expect(result.current.renameOnClick).toBe(true)
        expect(result.current.keepAddingTasks).toBe(true)
        expect(result.current.liveDrag).toBe(true)
        expect(result.current.workspaceView).toBe("grid")
        await waitFor(() => expect(result.current.primaryColor).toBe("#123456"))
    })

    it("loads persisted values and applies the primary color to the document", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })

        await waitFor(() => expect(result.current.primaryColor).toBe("#123456"))
        expect(result.current.showProgressBar).toBe(false)
        expect(result.current.showGroupProgressBar).toBe(false)
        expect(result.current.showTaskCount).toBe(false)
        expect(result.current.showAudioFileCount).toBe(false)
        expect(result.current.showGroupSeparators).toBe(true)
        expect(result.current.showUnnamedLabels).toBe(true)
        expect(result.current.renameOnClick).toBe(false)
        expect(result.current.keepAddingTasks).toBe(false)
        expect(result.current.showTaskInsertLine).toBe(false)
        expect(result.current.liveDrag).toBe(false)
        expect(result.current.undoLimit).toBe(200)
        expect(result.current.sidebarLeftOpen).toBe(false)
        expect(result.current.workspaceView).toBe("list")
        expect(result.current.workspaceSort).toEqual({ by: "name", dir: "asc" })
        expect(result.current.audioPlayerPosition).toEqual({ x: 5, y: 6, scaleX: 2, scaleY: 2 })
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#123456")
    })

    it("updates state and persists when a setter is called", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.primaryColor).toBe("#123456"))

        act(() => {
            result.current.setShowProgressBar(true)
            result.current.setShowGroupProgressBar(true)
            result.current.setSideBarLeftOpen(true)
            result.current.setPrimaryColor("#abcdef")
            result.current.setWorkspaceView("grid")
            result.current.setWorkspaceSort({ by: "created", dir: "desc" })
        })

        expect(result.current.showProgressBar).toBe(true)
        expect(result.current.sidebarLeftOpen).toBe(true)
        expect(result.current.primaryColor).toBe("#abcdef")
        expect(prefs.savePref).toHaveBeenCalledWith("showProgressBar", true)
        expect(result.current.showGroupProgressBar).toBe(true)
        expect(prefs.savePref).toHaveBeenCalledWith("showGroupProgressBar", true)
        expect(prefs.savePref).toHaveBeenCalledWith("sidebarLeftOpen", true)
        expect(prefs.savePrimaryColor).toHaveBeenCalledWith("#abcdef")
        expect(result.current.workspaceView).toBe("grid")
        expect(prefs.savePref).toHaveBeenCalledWith("workspaceView", "grid")
        expect(result.current.workspaceSort).toEqual({ by: "created", dir: "desc" })
        expect(prefs.savePref).toHaveBeenCalledWith("workspaceSort", { by: "created", dir: "desc" })
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#abcdef")
    })

    it("has backwards compatible audio defaults, then loads the stored ones", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.audioVolume).toBe(1)
        expect(result.current.audioPlayerVisible).toBe(true)
        expect(result.current.audioPlayerPinned).toBe(false)
        expect(result.current.audioPlayerScale).toBe(1)
        expect(result.current.audioPlayerOpacity).toBe(1)
        expect(result.current.audioPlaybackRate).toBe(1)
        expect(result.current.audioRepeat).toBe(false)
        expect(result.current.audioResume).toBe(false)
        await waitFor(() => expect(result.current.audioVolume).toBe(0.3))
        expect(result.current.audioPlaybackRate).toBe(1.5)
        expect(result.current.audioRepeat).toBe(true)
        expect(result.current.audioResume).toBe(true)
        expect(result.current.audioPlayerVisible).toBe(false)
        expect(result.current.audioPlayerPinned).toBe(true)
        expect(result.current.audioPlayerScale).toBe(1.2)
        expect(result.current.audioPlayerOpacity).toBe(0.6)
    })

    it("updates and persists the audio preferences (clamped) and can reset them", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioVolume).toBe(0.3))

        act(() => {
            result.current.setAudioVolume(5)
            result.current.setAudioPlayerOpacity(0.1)
            result.current.setAudioPlayerScale(0.85)
            result.current.setAudioPlayerVisible(true)
        })
        expect(result.current.audioVolume).toBe(1)
        expect(prefs.savePref).toHaveBeenCalledWith("audioVolume", 1)
        expect(result.current.audioPlayerOpacity).toBe(0.4)
        expect(prefs.savePref).toHaveBeenCalledWith("audioPlayerOpacity", 0.4)
        expect(result.current.audioPlayerScale).toBe(0.85)
        expect(prefs.savePref).toHaveBeenCalledWith("audioPlayerScale", 0.85)
        expect(prefs.savePref).toHaveBeenCalledWith("audioPlayerVisible", true)
        expect(result.current.audioPlayerPinned).toBe(true)
        act(() => result.current.setAudioPlayerPinned(false))
        expect(prefs.savePref).toHaveBeenCalledWith("audioPlayerPinned", false)
        act(() => result.current.setAudioPlayerPinned(true))
        act(() => result.current.setAudioPlaybackRate(2))
        expect(prefs.savePref).toHaveBeenCalledWith("audioPlaybackRate", 2)
        act(() => result.current.setAudioRepeat(true))
        expect(prefs.savePref).toHaveBeenCalledWith("audioRepeat", true)
        act(() => result.current.setAudioResume(true))
        expect(prefs.savePref).toHaveBeenCalledWith("audioResume", true)

        act(() => result.current.setAudioVolume(0.2))
        act(() => result.current.resetAudioSettings())
        expect(result.current.audioPlayerPinned).toBe(false)
        expect(result.current.audioPlaybackRate).toBe(1)
        expect(result.current.audioRepeat).toBe(false)
        expect(result.current.audioResume).toBe(false)
        expect(result.current.audioVolume).toBe(1)
        expect(result.current.audioPlayerScale).toBe(1)
        expect(result.current.audioPlayerOpacity).toBe(1)
        expect(result.current.audioPlayerVisible).toBe(true)
    })

    it("has the default color intensity, then loads the stored one", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.colorIntensity).toBe(1)
        await waitFor(() => expect(result.current.colorIntensity).toBe(1.4))
    })

    it("updates and persists the color intensity (clamped)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.colorIntensity).toBe(1.4))
        act(() => result.current.setColorIntensity(0.1))
        expect(result.current.colorIntensity).toBe(0.25)
        expect(prefs.savePref).toHaveBeenCalledWith("colorIntensity", 0.25)
        act(() => result.current.setColorIntensity(1))
        expect(result.current.colorIntensity).toBe(1)
        expect(prefs.savePref).toHaveBeenCalledWith("colorIntensity", 1)
    })

    it("pulls the player back inside the container when it gets bigger", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioPlayerScale).toBe(1.2))
        const container = document.createElement("div")
        Object.defineProperty(container, "offsetWidth", { value: 600 })
        Object.defineProperty(container, "offsetHeight", { value: 400 })
        result.current.audioPlayerContainerRef.current = container
        act(() => result.current.setAudioPlayerPosition({ x: 250, y: 318, scaleX: 1, scaleY: 1 }))
        act(() => result.current.setAudioPlayerScale(1.2))
        expect(result.current.audioPlayerPosition.x).toBe(180)
        expect(result.current.audioPlayerPosition.y).toBeCloseTo(400 - 140 * 1.2)
    })

    it("loads and persists the reopen notes preference (default on)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.reopenNotes).toBe(true)
        await waitFor(() => expect(result.current.reopenNotes).toBe(false))

        act(() => result.current.setReopenNotes(true))

        expect(result.current.reopenNotes).toBe(true)
        expect(prefs.savePref).toHaveBeenCalledWith("reopenNotes", true)
    })

    it("loads and persists the reopen last workspace preference (default off)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.reopenLastWorkspace).toBe(false)
        await waitFor(() => expect(result.current.reopenLastWorkspace).toBe(true))

        act(() => result.current.setReopenLastWorkspace(false))

        expect(result.current.reopenLastWorkspace).toBe(false)
        expect(prefs.savePref).toHaveBeenCalledWith("reopenLastWorkspace", false)
    })

    it("loads the app zoom, saves it and applies it to the window", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.textZoom).toBe(1)
        await waitFor(() => expect(result.current.textZoom).toBe(1.25))
        expect(applyTextZoom).toHaveBeenLastCalledWith(1.25)

        act(() => result.current.setTextZoom(1.5))

        expect(result.current.textZoom).toBe(1.5)
        expect(prefs.savePref).toHaveBeenCalledWith("textZoom", 1.5)
        expect(applyTextZoom).toHaveBeenLastCalledWith(1.5)
    })

    it("loads the font, saves it and applies it", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.fontFamily).toBe("system")
        await waitFor(() => expect(result.current.fontFamily).toBe("lora"))
        expect(applyFontFamily).toHaveBeenLastCalledWith("lora")

        act(() => result.current.setFontFamily("inter"))

        expect(prefs.savePref).toHaveBeenCalledWith("fontFamily", "inter")
        expect(applyFontFamily).toHaveBeenLastCalledWith("inter")
    })

    it("loads and persists the sidebar item size (default normal)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.sidebarItemSize).toBe("normal")
        await waitFor(() => expect(result.current.sidebarItemSize).toBe("large"))

        act(() => result.current.setSidebarItemSize("compact"))

        expect(result.current.sidebarItemSize).toBe("compact")
        expect(prefs.savePref).toHaveBeenCalledWith("sidebarItemSize", "compact")
    })

    it("loads and persists the left sidebar width (default 260, clamped on save)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.sidebarLeftWidth).toBe(260)
        await waitFor(() => expect(result.current.sidebarLeftWidth).toBe(320))

        act(() => result.current.setSidebarLeftWidth(400))
        expect(result.current.sidebarLeftWidth).toBe(400)
        expect(prefs.savePref).toHaveBeenCalledWith("sidebarLeftWidth", 400)

        act(() => result.current.setSidebarLeftWidth(5000))
        expect(result.current.sidebarLeftWidth).toBe(480)
    })

    it("loads and persists the right sidebar width (default 260, clamped on save)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.sidebarRightWidth).toBe(260)
        await waitFor(() => expect(result.current.sidebarRightWidth).toBe(300))

        act(() => result.current.setSidebarRightWidth(380))
        expect(result.current.sidebarRightWidth).toBe(380)
        expect(prefs.savePref).toHaveBeenCalledWith("sidebarRightWidth", 380)

        act(() => result.current.setSidebarRightWidth(5000))
        expect(result.current.sidebarRightWidth).toBe(480)
    })

    it("loads and persists the right panel tab (details by default)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.rightPanelTab).toBe("details")
        await waitFor(() => expect(result.current.rightPanelTab).toBe("history"))

        act(() => result.current.setRightPanelTab("details"))
        expect(result.current.rightPanelTab).toBe("details")
        expect(prefs.savePref).toHaveBeenCalledWith("rightPanelTab", "details")
    })

    it("resetPlayerPosition resets the store but skips the state update without a container", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioPlayerPosition.x).toBe(5))

        act(() => result.current.resetPlayerPosition())

        expect(prefs.resetAudioPlayerPosition).toHaveBeenCalled()
        expect(prefs.saveAudioPlayerPosition).not.toHaveBeenCalled()
        expect(result.current.audioPlayerPosition.x).toBe(5)
    })

    it("resetPlayerPosition centers the player at the bottom of the container", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioPlayerPosition.x).toBe(5))
        // The stored size is 1.2: the player is taller and wider, so it is placed accordingly
        await waitFor(() => expect(result.current.audioPlayerScale).toBe(1.2))

        const el = document.createElement("div")
        Object.defineProperty(el, "offsetWidth", { value: 1000 })
        Object.defineProperty(el, "offsetHeight", { value: 600 })
        result.current.audioPlayerContainerRef.current = el

        act(() => result.current.resetPlayerPosition())

        const expected = { x: 500 - 175 * 1.2, y: 600 - 140 * 1.2 - 8, scaleX: 1, scaleY: 1 }
        expect(result.current.audioPlayerPosition).toEqual(expected)
        expect(prefs.saveAudioPlayerPosition).toHaveBeenCalledWith(expected)
    })

    it("loads and persists the hide completed tasks preference (default off)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.hideCompletedTasks).toBe(false)
        await waitFor(() => expect(result.current.hideCompletedTasks).toBe(true))

        act(() => result.current.setHideCompletedTasks(false))

        expect(result.current.hideCompletedTasks).toBe(false)
        expect(prefs.savePref).toHaveBeenCalledWith("hideCompletedTasks", false)
    })

    it("loads and persists the completed tasks last preference (default off)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.completedTasksLast).toBe(false)
        act(() => result.current.setCompletedTasksLast(true))
        expect(result.current.completedTasksLast).toBe(true)
        expect(prefs.savePref).toHaveBeenCalledWith("completedTasksLast", true)
    })

    it("loads and persists the subtask count preference (default on)", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        expect(result.current.showSubtaskCount).toBe(true)
        await waitFor(() => expect(result.current.showSubtaskCount).toBe(false))

        act(() => result.current.setShowSubtaskCount(true))

        expect(result.current.showSubtaskCount).toBe(true)
        expect(prefs.savePref).toHaveBeenCalledWith("showSubtaskCount", true)
    })

    it("resetPlayerPosition sets and saves the computed position once", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioPlayerScale).toBe(1.2))
        const el = document.createElement("div")
        Object.defineProperty(el, "offsetWidth", { value: 1000 })
        Object.defineProperty(el, "offsetHeight", { value: 600 })
        result.current.audioPlayerContainerRef.current = el

        act(() => result.current.resetPlayerPosition())

        expect(prefs.saveAudioPlayerPosition).toHaveBeenCalledTimes(1)
    })

    it("clamps a stored player position that lies outside the window", async () => {
        vi.mocked(prefs.getAudioPlayerPosition).mockResolvedValue({ x: 99999, y: 99999, scaleX: 1, scaleY: 1 })
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioPlayerPosition.x).toBe(window.innerWidth - 350))
        expect(result.current.audioPlayerPosition.y).toBe(window.innerHeight - 140)
    })

    it("places the default position fully inside the container using the measured size of a tall player", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioPlayerScale).toBe(1.2))
        const el = document.createElement("div")
        Object.defineProperty(el, "offsetWidth", { value: 1000 })
        Object.defineProperty(el, "offsetHeight", { value: 600 })
        result.current.audioPlayerContainerRef.current = el
        act(() => result.current.reportAudioPlayerSize({ width: 300, height: 220 }))

        act(() => result.current.resetPlayerPosition())

        expect(result.current.audioPlayerPosition).toEqual({ x: 350, y: 600 - 220 - 8, scaleX: 1, scaleY: 1 })
    })

    it("pulls the player back inside the container when its measured size grows, saving only if it moved", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioPlayerScale).toBe(1.2))
        const el = document.createElement("div")
        Object.defineProperty(el, "offsetWidth", { value: 1000 })
        Object.defineProperty(el, "offsetHeight", { value: 600 })
        result.current.audioPlayerContainerRef.current = el
        act(() => result.current.reportAudioPlayerSize({ width: 300, height: 100 }))
        act(() => result.current.setAudioPlayerPosition({ x: 100, y: 480, scaleX: 1, scaleY: 1 }))
        vi.mocked(prefs.saveAudioPlayerPosition).mockClear()

        act(() => result.current.reportAudioPlayerSize({ width: 300, height: 100 }))
        expect(prefs.saveAudioPlayerPosition).not.toHaveBeenCalled()

        act(() => result.current.reportAudioPlayerSize({ width: 300, height: 160 }))
        expect(result.current.audioPlayerPosition.y).toBe(440)
        expect(prefs.saveAudioPlayerPosition).toHaveBeenCalledTimes(1)
    })

    it("pulls the player back inside the container when the window shrinks", async () => {
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(result.current.audioPlayerScale).toBe(1.2))
        const container = document.createElement("div")
        Object.defineProperty(container, "offsetWidth", { value: 600, configurable: true })
        Object.defineProperty(container, "offsetHeight", { value: 400 })
        result.current.audioPlayerContainerRef.current = container
        act(() => result.current.setAudioPlayerPosition({ x: 100, y: 100, scaleX: 1, scaleY: 1 }))
        vi.mocked(prefs.saveAudioPlayerPosition).mockClear()

        Object.defineProperty(container, "offsetWidth", { value: 300, configurable: true })
        act(() => { window.dispatchEvent(new Event("resize")) })

        expect(result.current.audioPlayerPosition.x).toBe(0)
        expect(result.current.audioPlayerPosition.y).toBe(100)
        expect(prefs.saveAudioPlayerPosition).toHaveBeenCalledTimes(1)
    })

    it("reports a failing preference save and a failing initial load instead of leaving them unhandled", async () => {
        vi.mocked(prefs.savePref).mockRejectedValue(new Error("save"))
        vi.mocked(prefs.getAllPrefs).mockRejectedValue(new Error("load"))
        const { result } = renderHook(() => usePreferences(), { wrapper })
        await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1))
        act(() => result.current.setShowProgressBar(false))
        await waitFor(() => expect(reportError).toHaveBeenCalledTimes(2))
    })
})
