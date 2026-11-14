import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { store } from "./initStore"
import { getAllPrefs, flushPreferences, getPref, savePref, normalizePref, UI_PREFS, APP_PREFS, clearLastWorkspaceId, getLastWorkspaceId, saveLastWorkspaceId, getReopenLastWorkspace, getAccentOverride, saveAccentOverride, getAudioPlayerPosition, savePrimaryColor, saveAudioPlayerPosition, resetAudioPlayerPosition } from "./preferences"

vi.mock("./initStore", () => ({
    store: { get: vi.fn(), set: vi.fn(), save: vi.fn(), delete: vi.fn() },
}))

afterEach(async () => {
    await flushPreferences()
    vi.useRealTimers()
})

describe("sidebar item size preference", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("defaults to normal when nothing is stored", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("sidebarItemSize")).toBe("normal")
    })

    it.each(["compact", "normal", "large"])("returns the stored value %s", async (value) => {
        vi.mocked(store.get).mockResolvedValue(value)
        expect(await getPref("sidebarItemSize")).toBe(value)
        expect(store.get).toHaveBeenCalledWith("sidebarItemSize")
    })

    it.each(["huge", 3, null, ""])("falls back to normal for the invalid value %j", async (value) => {
        vi.mocked(store.get).mockResolvedValue(value)
        expect(await getPref("sidebarItemSize")).toBe("normal")
    })

    it("saves the value and flushes the store", async () => {
        const p = savePref("sidebarItemSize", "large")
        await vi.advanceTimersByTimeAsync(500)
        await p
        expect(store.set).toHaveBeenCalledWith("sidebarItemSize", "large")
        expect(store.save).toHaveBeenCalled()
    })
})

describe("show group progress bar preference", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("defaults to true when nothing is stored", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("showGroupProgressBar")).toBe(true)
        expect(store.get).toHaveBeenCalledWith("showGroupProgressBar")
    })

    it("returns the stored value", async () => {
        vi.mocked(store.get).mockResolvedValue(false)
        expect(await getPref("showGroupProgressBar")).toBe(false)
    })

    it("saves the value and flushes the store", async () => {
        const p = savePref("showGroupProgressBar", false)
        await vi.advanceTimersByTimeAsync(500)
        await p
        expect(store.set).toHaveBeenCalledWith("showGroupProgressBar", false)
        expect(store.save).toHaveBeenCalled()
    })
})

describe("reopen last workspace preferences", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("defaults to false and returns the stored value", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getReopenLastWorkspace()).toBe(false)
        vi.mocked(store.get).mockResolvedValue(true)
        expect(await getReopenLastWorkspace()).toBe(true)
        expect(store.get).toHaveBeenCalledWith("reopenLastWorkspace")
    })

    it("saves the preference and flushes the store", async () => {
        const p = savePref("reopenLastWorkspace", true)
        await vi.advanceTimersByTimeAsync(500)
        await p
        expect(store.set).toHaveBeenCalledWith("reopenLastWorkspace", true)
        expect(store.save).toHaveBeenCalled()
    })

    it("returns the stored workspace id or null", async () => {
        vi.mocked(store.get).mockResolvedValue(7)
        expect(await getLastWorkspaceId()).toBe(7)
        expect(store.get).toHaveBeenCalledWith("lastWorkspaceId")
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getLastWorkspaceId()).toBeNull()
    })

    it("saves and clears the last workspace id", async () => {
        const a = saveLastWorkspaceId(3)
        expect(store.set).toHaveBeenCalledWith("lastWorkspaceId", 3)
        const b = clearLastWorkspaceId()
        await vi.advanceTimersByTimeAsync(500)
        await Promise.all([a, b])
        expect(store.delete).toHaveBeenCalledWith("lastWorkspaceId")
        expect(store.save).toHaveBeenCalledTimes(1)
    })
})

describe("batched saves", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("sets immediately but saves once after the debounce", async () => {
        const p1 = savePref("showGroupProgressBar", true)
        const p2 = savePref("sidebarItemSize", "compact")
        expect(store.set).toHaveBeenCalledTimes(2)
        expect(store.save).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(499)
        expect(store.save).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        await Promise.all([p1, p2])
        expect(store.save).toHaveBeenCalledTimes(1)
    })

    it("restarts the debounce on every change", async () => {
        const p1 = savePref("sidebarItemSize", "compact")
        await vi.advanceTimersByTimeAsync(400)
        const p2 = savePref("sidebarItemSize", "large")
        await vi.advanceTimersByTimeAsync(400)
        expect(store.save).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(100)
        await Promise.all([p1, p2])
        expect(store.save).toHaveBeenCalledTimes(1)
    })

    it("flushPreferences saves right away and cancels the timer", async () => {
        const p = savePref("sidebarItemSize", "large")
        await vi.advanceTimersByTimeAsync(0)
        await flushPreferences()
        await p
        expect(store.save).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1000)
        expect(store.save).toHaveBeenCalledTimes(1)
    })

    it("shares the debounce with the other stores: one save for a preference and a saveStoreSoon", async () => {
        const { saveStoreSoon } = await import("./save-soon")
        const p1 = savePref("sidebarItemSize", "large")
        await vi.advanceTimersByTimeAsync(0)
        const p2 = saveStoreSoon()
        await vi.advanceTimersByTimeAsync(500)
        await Promise.all([p1, p2])
        expect(store.save).toHaveBeenCalledTimes(1)
    })

    it("flushPreferences does nothing when nothing is pending", async () => {
        await flushPreferences()
        expect(store.save).not.toHaveBeenCalled()
    })

    it("rejects the pending promises when the save fails", async () => {
        vi.mocked(store.save).mockRejectedValueOnce(new Error("disk"))
        const p = savePref("sidebarItemSize", "large")
        const assertion = expect(p).rejects.toThrow("disk")
        await vi.advanceTimersByTimeAsync(500)
        await assertion
    })
})

describe("left sidebar width preference", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("defaults to 260 when nothing valid is stored", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("sidebarLeftWidth")).toBe(260)
        vi.mocked(store.get).mockResolvedValue("wide")
        expect(await getPref("sidebarLeftWidth")).toBe(260)
        vi.mocked(store.get).mockResolvedValue(Number.NaN)
        expect(await getPref("sidebarLeftWidth")).toBe(260)
    })

    it.each([[320, 320], [10, 224], [9999, 480]])("clamps the stored width %d to %d", async (stored, expected) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect(await getPref("sidebarLeftWidth")).toBe(expected)
        expect(store.get).toHaveBeenCalledWith("sidebarLeftWidth")
    })

    it("saves the clamped width and flushes the store", async () => {
        const p = savePref("sidebarLeftWidth", 9999)
        await vi.advanceTimersByTimeAsync(500)
        await p
        expect(store.set).toHaveBeenCalledWith("sidebarLeftWidth", 480)
        expect(store.save).toHaveBeenCalled()
    })
})

describe("right sidebar width and tab preferences", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("defaults the width to 260 when nothing valid is stored", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("sidebarRightWidth")).toBe(260)
        vi.mocked(store.get).mockResolvedValue("wide")
        expect(await getPref("sidebarRightWidth")).toBe(260)
    })

    it.each([[320, 320], [10, 224], [9999, 480]])("clamps the stored width %d to %d", async (stored, expected) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect(await getPref("sidebarRightWidth")).toBe(expected)
        expect(store.get).toHaveBeenCalledWith("sidebarRightWidth")
    })

    it("saves the clamped width", async () => {
        const p = savePref("sidebarRightWidth", 9999)
        await vi.advanceTimersByTimeAsync(500)
        await p
        expect(store.set).toHaveBeenCalledWith("sidebarRightWidth", 480)
    })

    it.each([[undefined, "details"], ["bogus", "details"], ["details", "details"], ["history", "history"]])("reads the tab %s as %s", async (stored, expected) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect(await getPref("rightPanelTab")).toBe(expected)
        expect(store.get).toHaveBeenCalledWith("rightPanelTab")
    })

    it("saves the tab", async () => {
        const p = savePref("rightPanelTab", "history")
        await vi.advanceTimersByTimeAsync(500)
        await p
        expect(store.set).toHaveBeenCalledWith("rightPanelTab", "history")
    })
})

describe("audio player preferences", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("has backwards compatible defaults when nothing is stored", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("audioVolume")).toBe(1)
        expect(await getPref("audioPlayerVisible")).toBe(true)
        expect(await getPref("audioPlayerScale")).toBe(1)
        expect(await getPref("audioPlayerOpacity")).toBe(1)
    })

    it.each([[0.4, 0.4], [-1, 0], [7, 1], ["loud", 1], [Number.NaN, 1]])("reads the volume %s as %s", async (stored, expected) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect(await getPref("audioVolume")).toBe(expected)
        expect(store.get).toHaveBeenCalledWith("audioVolume")
    })

    it.each([[0.85, 0.85], [1.2, 1.2], [2, 1], ["big", 1]])("reads the scale %s as %s", async (stored, expected) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect(await getPref("audioPlayerScale")).toBe(expected)
        expect(store.get).toHaveBeenCalledWith("audioPlayerScale")
    })

    it.each([[0.7, 0.7], [0.1, 0.4], [3, 1], ["x", 1]])("reads the opacity %s as %s", async (stored, expected) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect(await getPref("audioPlayerOpacity")).toBe(expected)
        expect(store.get).toHaveBeenCalledWith("audioPlayerOpacity")
    })

    it("reads the visibility flag", async () => {
        vi.mocked(store.get).mockResolvedValue(false)
        expect(await getPref("audioPlayerVisible")).toBe(false)
        expect(store.get).toHaveBeenCalledWith("audioPlayerVisible")
    })

    it("saves every value (clamped) with a debounced flush", async () => {
        const saves = [savePref("audioVolume", 5), savePref("audioPlayerVisible", false), savePref("audioPlayerScale", 1.2), savePref("audioPlayerOpacity", 0.1)]
        await vi.advanceTimersByTimeAsync(500)
        await Promise.all(saves)
        expect(store.set).toHaveBeenCalledWith("audioVolume", 1)
        expect(store.set).toHaveBeenCalledWith("audioPlayerVisible", false)
        expect(store.set).toHaveBeenCalledWith("audioPlayerScale", 1.2)
        expect(store.set).toHaveBeenCalledWith("audioPlayerOpacity", 0.4)
        expect(store.save).toHaveBeenCalledTimes(1)
    })

    it("has the default color intensity of 100% when nothing is stored", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("colorIntensity")).toBe(1)
    })

    it.each([[1.5, 1.5], [0.25, 0.25], [0.1, 0.25], [5, 1.75], ["x", 1], [Number.NaN, 1]])("reads the color intensity %s as %s", async (stored, expected) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect(await getPref("colorIntensity")).toBe(expected)
        expect(store.get).toHaveBeenCalledWith("colorIntensity")
    })

    it("saves the color intensity (clamped) with a debounced flush", async () => {
        const save = savePref("colorIntensity", 9)
        await vi.advanceTimersByTimeAsync(500)
        await save
        expect(store.set).toHaveBeenCalledWith("colorIntensity", 1.75)
        expect(store.save).toHaveBeenCalledTimes(1)
    })
})

describe("hide completed tasks preference", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("is off by default", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("hideCompletedTasks")).toBe(false)
        expect(store.get).toHaveBeenCalledWith("hideCompletedTasks")
    })

    it("returns the stored value", async () => {
        vi.mocked(store.get).mockResolvedValue(true)
        expect(await getPref("hideCompletedTasks")).toBe(true)
    })

    it("saves the value and flushes the store", async () => {
        const save = savePref("hideCompletedTasks", true)
        await vi.advanceTimersByTimeAsync(500)
        await save
        expect(store.set).toHaveBeenCalledWith("hideCompletedTasks", true)
        expect(store.save).toHaveBeenCalledTimes(1)
    })
})

describe("primary color preference validation", () => {
    beforeEach(() => vi.resetAllMocks())

    it.each(["#fff", "#FFB375", "#a1b2c3"])("keeps the valid hex %s", async (hex) => {
        vi.mocked(store.get).mockResolvedValue({ hex })
        expect((await getPref("primaryColor")).hex).toBe(hex)
    })

    it.each([undefined, null, {}, { hex: 3 }, { hex: "red" }, { hex: "#12" }, { hex: "#12345g" }, { hex: "url(x)" }, "#fff"])("falls back to the default for %j", async (stored) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect((await getPref("primaryColor")).hex).toBe("#c2410c")
    })
})

describe("primary color saving", () => {
    beforeEach(() => vi.resetAllMocks())

    it("stores a valid color as { hex }", async () => {
        await savePrimaryColor("#fff")
        expect(store.set).toHaveBeenCalledWith("primaryColor", { hex: "#fff" })
    })

    it("stores the default for an invalid color", async () => {
        await savePrimaryColor("url(x)")
        expect(store.set).toHaveBeenCalledWith("primaryColor", { hex: "#c2410c" })
    })
})

describe("audio player position saving", () => {
    beforeEach(() => vi.resetAllMocks())

    it("stores a valid position", async () => {
        await saveAudioPlayerPosition({ x: 3, y: 4, scaleX: 2, scaleY: 2 })
        expect(store.set).toHaveBeenCalledWith("audioPlayerPosition", { x: 3, y: 4, scaleX: 2, scaleY: 2 })
    })

    it("stores the default position when the coordinates are not finite", async () => {
        await saveAudioPlayerPosition({ x: Number.NaN, y: 4, scaleX: 1, scaleY: 1 })
        expect(store.set).toHaveBeenCalledWith("audioPlayerPosition", { x: 0, y: 0, scaleX: 1, scaleY: 1 })
    })

    it("reset removes the key", async () => {
        await resetAudioPlayerPosition()
        expect(store.delete).toHaveBeenCalledWith("audioPlayerPosition")
    })
})

describe("audio player position validation", () => {
    beforeEach(() => vi.resetAllMocks())

    it("returns a valid stored position", async () => {
        vi.mocked(store.get).mockResolvedValue({ x: 10, y: 20, scaleX: 1, scaleY: 1 })
        expect(await getAudioPlayerPosition()).toEqual({ x: 10, y: 20, scaleX: 1, scaleY: 1 })
    })

    it.each([undefined, null, "x", {}, { x: "1", y: 2 }, { x: Number.NaN, y: 2 }, { x: 1, y: Infinity }])("falls back to the default for %j", async (stored) => {
        vi.mocked(store.get).mockResolvedValue(stored)
        expect(await getAudioPlayerPosition()).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
    })

    it("defaults a missing or invalid scale to 1", async () => {
        vi.mocked(store.get).mockResolvedValue({ x: 1, y: 2, scaleX: "a" })
        expect(await getAudioPlayerPosition()).toEqual({ x: 1, y: 2, scaleX: 1, scaleY: 1 })
    })
})

describe("undo limit preference", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it.each([undefined, null, "100", 0, -5, 12.5, 501, NaN, 1e9])("falls back to 50 for the stored value %s", async (value) => {
        vi.mocked(store.get).mockResolvedValue(value)
        expect(await getPref("undoLimit")).toBe(50)
    })

    it.each([1, 25, 200, 500])("returns the valid stored value %s", async (value) => {
        vi.mocked(store.get).mockResolvedValue(value)
        expect(await getPref("undoLimit")).toBe(value)
        expect(store.get).toHaveBeenCalledWith("undoLimit")
    })

    it("saves a valid value and flushes the store", async () => {
        const p = savePref("undoLimit", 100)
        await vi.runAllTimersAsync()
        await p
        expect(store.set).toHaveBeenCalledWith("undoLimit", 100)
        expect(store.save).toHaveBeenCalled()
    })

    it("saves the default instead of an invalid value", async () => {
        const p = Promise.all([savePref("undoLimit", 0), savePref("undoLimit", 2.5)])
        await vi.runAllTimersAsync()
        await p
        expect(store.set).toHaveBeenNthCalledWith(1, "undoLimit", 50)
        expect(store.set).toHaveBeenNthCalledWith(2, "undoLimit", 50)
    })
})

describe("audio file count and section separators preferences", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("show the audio file count by default and the separators never by default", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("showAudioFileCount")).toBe(true)
        expect(await getPref("showGroupSeparators")).toBe(false)
    })

    it("moves the tasks while they are dragged by default, and only an explicit false turns it off", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("liveDrag")).toBe(true)
        vi.mocked(store.get).mockResolvedValue("no")
        expect(await getPref("liveDrag")).toBe(true)
        vi.mocked(store.get).mockResolvedValue(false)
        expect(await getPref("liveDrag")).toBe(false)
    })

    it("shows no label of unnamed items and renames on click by default", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("showUnnamedLabels")).toBe(false)
        expect(await getPref("renameOnClick")).toBe(true)
        vi.mocked(store.get).mockResolvedValue("no")
        expect(await getPref("showUnnamedLabels")).toBe(false)
        vi.mocked(store.get).mockResolvedValue(false)
        expect(await getPref("renameOnClick")).toBe(false)
        vi.mocked(store.get).mockResolvedValue(true)
        expect(await getPref("showUnnamedLabels")).toBe(true)
    })

    it("shows the task insert line by default and only an explicit false hides it", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("showTaskInsertLine")).toBe(true)
        vi.mocked(store.get).mockResolvedValue("no")
        expect(await getPref("showTaskInsertLine")).toBe(true)
        vi.mocked(store.get).mockResolvedValue(false)
        expect(await getPref("showTaskInsertLine")).toBe(false)
    })

    it("keeps adding tasks by default and leaves the player unpinned", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("keepAddingTasks")).toBe(true)
        expect(await getPref("audioPlayerPinned")).toBe(false)
        vi.mocked(store.get).mockResolvedValue("no")
        expect(await getPref("keepAddingTasks")).toBe(true)
        expect(await getPref("audioPlayerPinned")).toBe(false)
        vi.mocked(store.get).mockResolvedValue(false)
        expect(await getPref("keepAddingTasks")).toBe(false)
        vi.mocked(store.get).mockResolvedValue(true)
        expect(await getPref("audioPlayerPinned")).toBe(true)
    })

    it("remembers the playback speed only when it is one of the speeds of the player", async () => {
        for (const rate of [0.75, 1, 1.25, 1.5, 2]) expect(normalizePref("audioPlaybackRate", rate)).toBe(rate)
        for (const garbage of [0, 3, -1, 1.1, "2", null, undefined, NaN, {}]) expect(normalizePref("audioPlaybackRate", garbage)).toBe(1)
    })

    it("repeats and resumes only when turned on", () => {
        for (const name of ["audioRepeat", "audioResume"] as const) {
            expect(normalizePref(name, undefined)).toBe(false)
            expect(normalizePref(name, "yes")).toBe(false)
            expect(normalizePref(name, 1)).toBe(false)
            expect(normalizePref(name, true)).toBe(true)
        }
    })

    it("keeps the valid audio positions and at most 200, dropping the oldest", () => {
        expect(normalizePref("audioPositions", undefined)).toEqual({})
        expect(normalizePref("audioPositions", [1, 2])).toEqual({})
        expect(normalizePref("audioPositions", "x")).toEqual({})
        expect(normalizePref("audioPositions", {
            "1": { position: 10, updatedAt: 5 },
            "2": 20,
            "3": { position: -1, updatedAt: 5 },
            "4": { position: "x", updatedAt: 5 },
            "5": null,
            "abc": { position: 3, updatedAt: 5 },
            "6": { position: 7, updatedAt: "late" },
        })).toEqual({ "1": { position: 10, updatedAt: 5 }, "2": { position: 20, updatedAt: 0 }, "6": { position: 7, updatedAt: 0 } })
        const many = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [String(i + 1), { position: 10, updatedAt: i + 1 }]))
        const kept = normalizePref("audioPositions", many)
        expect(Object.keys(kept)).toHaveLength(200)
        expect(kept["250"]).toBeDefined()
        expect(kept["51"]).toBeDefined()
        expect(kept["50"]).toBeUndefined()
    })

    it("saves the separators", async () => {
        const p = savePref("showGroupSeparators", true)
        await vi.runAllTimersAsync()
        await p
        expect(store.set).toHaveBeenCalledWith("showGroupSeparators", true)
    })
})

describe("workspace sort preference", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("defaults to last edited first when nothing is stored", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("workspaceSort")).toEqual({ by: "edited", dir: "desc" })
    })

    it("returns the stored value", async () => {
        vi.mocked(store.get).mockResolvedValue({ by: "name", dir: "asc" })
        expect(await getPref("workspaceSort")).toEqual({ by: "name", dir: "asc" })
        expect(store.get).toHaveBeenCalledWith("workspaceSort")
    })

    it.each([null, "name", 3, {}, { by: "name" }, { by: "size", dir: "asc" }, { by: "name", dir: "up" }])(
        "falls back to the default for the invalid value %j",
        async (value) => {
            vi.mocked(store.get).mockResolvedValue(value)
            expect(await getPref("workspaceSort")).toEqual({ by: "edited", dir: "desc" })
        })

    it("saves the value and flushes the store", async () => {
        const p = savePref("workspaceSort", { by: "created", dir: "asc" })
        await vi.runAllTimersAsync()
        await p
        expect(store.set).toHaveBeenCalledWith("workspaceSort", { by: "created", dir: "asc" })
    })
})

describe("preference table", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    const all = { ...UI_PREFS, ...APP_PREFS }

    it("has a unique store key per preference", () => {
        const keys = Object.values(all).map(definition => definition.key)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it("keeps the keys saved on disk", () => {
        expect(Object.values(all).map(definition => definition.key).sort()).toEqual([
            "activeThemeCache", "alwaysOnTop", "animationSpeed", "audioPlaybackRate", "audioPlayerOpacity", "audioPlayerPinned", "audioPlayerPosition", "audioPlayerScale", "audioPlayerVisible", "audioPositions", "audioRepeat", "audioResume", "audioVolume", "autoBackup", "backupFolder",
            "backupFrequency", "backupKeep", "checkUpdatesOnStartup", "closeToTray", "collapsedGroupLayout", "colorIntensity", "completedTasksLast", "confirmDeleteWithContent", "fontFamily", "hardwareAcceleration", "hideCompletedTasks", "keepAddingTasks", "language",
            "lastSeenVersion", "lastWorkspaceId", "liveDrag", "newTaskPosition", "primaryColor", "rememberWindowState", "renameOnClick", "reopenLastWorkspace", "reopenNotes", "rightPanelTab", "showAudioFileCount",
            "showGroupProgressBar", "showGroupSeparators", "showProgressBar", "showSectionCount", "showSubtaskCount", "showTaskCount",
            "showTaskInsertLine", "showUnnamedLabels", "sidebarItemSize", "sidebarLeftOpen", "sidebarLeftWidth", "sidebarRightOpen", "sidebarRightWidth",
            "skippedUpdateVersion", "spellcheck", "splitRatio", "startupWorkspaceId", "taskBackground", "taskDensity", "textZoom", "themeBackground", "themeId", "trashAutoEmptyDays", "undoLimit", "workspaceSort", "workspaceView",
        ])
    })

    it.each(Object.entries(all))("reads the default of %s when nothing is stored", async (name, definition) => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref(name as keyof typeof all)).toEqual(definition.default)
        expect(store.get).toHaveBeenCalledWith(definition.key)
    })

    it.each(Object.entries(all))("gives a valid value for the stored garbage of %s", async (name) => {
        vi.mocked(store.get).mockResolvedValue({ garbage: true })
        const value = await getPref(name as keyof typeof all)
        expect(normalizePref(name as keyof typeof all, value)).toEqual(value)
    })

    it("normalizes the value when saving", async () => {
        const p = savePref("audioVolume", 5)
        await vi.runAllTimersAsync()
        await p
        expect(store.set).toHaveBeenCalledWith("audioVolume", 1)
    })

    it("removes a nullable preference from the store when saving null", async () => {
        const p = savePref("skippedUpdateVersion", null)
        await vi.runAllTimersAsync()
        await p
        expect(store.delete).toHaveBeenCalledWith("skippedUpdateVersion")
        expect(store.set).not.toHaveBeenCalled()
    })

    it("reads a skipped version only when it is a non-empty string", async () => {
        vi.mocked(store.get).mockResolvedValue("1.2.3")
        expect(await getPref("skippedUpdateVersion")).toBe("1.2.3")
        vi.mocked(store.get).mockResolvedValue("")
        expect(await getPref("skippedUpdateVersion")).toBeNull()
    })

    it("clamps the backups to keep", async () => {
        vi.mocked(store.get).mockResolvedValue(500)
        expect(await getPref("backupKeep")).toBe(100)
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref("backupKeep")).toBe(5)
    })

    it("persists with one debounced save for several preferences", async () => {
        const saves = [savePref("showTaskCount", false), savePref("backupKeep", 0), savePref("reopenNotes", false)]
        expect(store.set).toHaveBeenCalledWith("backupKeep", 1)
        await vi.advanceTimersByTimeAsync(500)
        await Promise.all(saves)
        expect(store.save).toHaveBeenCalledTimes(1)
    })
})

describe("delete confirmation and window preferences", () => {
    beforeEach(() => { vi.resetAllMocks() })

    it.each([
        ["confirmDeleteWithContent", true],
        ["rememberWindowState", true],
        ["alwaysOnTop", false],
        ["hardwareAcceleration", true],
    ] as const)("%s defaults to %s", async (name, expected) => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getPref(name)).toBe(expected)
    })

    it.each(["confirmDeleteWithContent", "rememberWindowState", "hardwareAcceleration"] as const)("%s is on unless stored as false", (name) => {
        expect(normalizePref(name, false)).toBe(false)
        expect(normalizePref(name, "x")).toBe(true)
        expect(normalizePref(name, null)).toBe(true)
    })

    it("alwaysOnTop is off unless stored as true", () => {
        expect(normalizePref("alwaysOnTop", true)).toBe(true)
        expect(normalizePref("alwaysOnTop", "yes")).toBe(false)
        expect(normalizePref("alwaysOnTop", 1)).toBe(false)
    })
})

describe("text zoom preference", () => {
    it("is stored as a zoom of whole px of text (16 px = 1)", () => {
        expect(normalizePref("textZoom", 1)).toBe(1)
        expect(normalizePref("textZoom", 20 / 16)).toBe(1.25)
        expect(normalizePref("textZoom", 1.0001)).toBe(1)
    })

    it("is kept between 12 and 24 px; anything else gives 1", () => {
        expect(normalizePref("textZoom", 0.1)).toBe(12 / 16)
        expect(normalizePref("textZoom", 9)).toBe(24 / 16)
        expect(normalizePref("textZoom", "big")).toBe(1)
        expect(normalizePref("textZoom", Number.NaN)).toBe(1)
    })
})

describe("getAllPrefs", () => {
    beforeEach(() => vi.resetAllMocks())

    it("reads the store with one entries() call and normalizes each preference", async () => {
        const entries = vi.fn().mockResolvedValue([["undoLimit", 200], ["sidebarItemSize", "huge"], ["unrelated", 1]])
        Object.assign(store, { entries })
        const all = await getAllPrefs()
        delete (store as { entries?: unknown }).entries
        expect(entries).toHaveBeenCalledTimes(1)
        expect(store.get).not.toHaveBeenCalled()
        expect(all.undoLimit).toBe(200)
        expect(all.sidebarItemSize).toBe("normal")
        expect(Object.keys(all).sort()).toEqual(Object.keys(UI_PREFS).sort())
    })

    it("falls back to one get per preference when the store has no entries()", async () => {
        vi.mocked(store.get).mockImplementation(async (key: string) => key === "undoLimit" ? 200 : undefined)
        const all = await getAllPrefs()
        expect(all.undoLimit).toBe(200)
        expect(all.showProgressBar).toBe(true)
    })
})

describe("theme preferences", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
    })

    it("themeId is null until one is chosen and rejects what is not an id", () => {
        expect(normalizePref("themeId", undefined)).toBeNull()
        expect(normalizePref("themeId", "nord")).toBe("nord")
        expect(normalizePref("themeId", "custom-" + "a".repeat(32))).toBe("custom-" + "a".repeat(32))
        expect(normalizePref("themeId", "Bad Id")).toBeNull()
        expect(normalizePref("themeId", 3)).toBeNull()
    })

    it("themeBackground keeps only a #rrggbb color, lowercased", () => {
        expect(normalizePref("themeBackground", "#1B1B1B")).toBe("#1b1b1b")
        expect(normalizePref("themeBackground", "#fff")).toBeNull()
        expect(normalizePref("themeBackground", "red")).toBeNull()
    })

    it("activeThemeCache keeps only a valid custom theme", () => {
        const theme = {
            id: "custom-" + "b".repeat(32), name: "Mine", base: "dark", builtin: false, accent: "#112233",
            colors: { background: "#101010", foreground: "#fafafa", card: "#181818", muted: "#222222", mutedForeground: "#aaaaaa", accentSurface: "#333333", border: "#444444", input: "#888888", destructive: "#ff6666", warning: "#ffcc00" },
        }
        expect(normalizePref("activeThemeCache", theme)).toEqual(theme)
        expect(normalizePref("activeThemeCache", { ...theme, id: "nord" })).toBeNull()
        expect(normalizePref("activeThemeCache", null)).toBeNull()
    })

    it("the accent override is null without a stored color and for the old default orange", async () => {
        vi.mocked(store.get).mockResolvedValue(undefined)
        expect(await getAccentOverride()).toBeNull()
        vi.mocked(store.get).mockResolvedValue({ hex: "#C2410C" })
        expect(await getAccentOverride()).toBeNull()
        vi.mocked(store.get).mockResolvedValue({ hex: "nope" })
        expect(await getAccentOverride()).toBeNull()
    })

    it("the accent override is the stored color as #rrggbb", async () => {
        vi.mocked(store.get).mockResolvedValue({ hex: "#ABC" })
        expect(await getAccentOverride()).toBe("#aabbcc")
        expect(store.get).toHaveBeenCalledWith("primaryColor")
    })

    it("saving the accent override stores it, saving null removes it", async () => {
        const saved = saveAccentOverride("#ABC")
        await vi.advanceTimersByTimeAsync(500)
        await saved
        expect(store.set).toHaveBeenCalledWith("primaryColor", { hex: "#aabbcc" })
        const removed = saveAccentOverride(null)
        await vi.advanceTimersByTimeAsync(500)
        await removed
        expect(store.delete).toHaveBeenCalledWith("primaryColor")
    })
})
