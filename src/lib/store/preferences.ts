import type { AudioPlayerPosition } from "@/types/types"
import { clampNumber, isFiniteNumber } from "@/lib/number"
import { isHexColor } from "@/lib/colors"
import { store } from "./initStore"
import { flushStore, saveStoreSoon } from "./save-soon"
import { DEFAULT_PRIMARY_COLOR } from "@/lib/accent-color"
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from "@/lib/sidebar-layout"
import { DEFAULT_SPLIT_RATIO, clampRatio } from "@/lib/split-layout"
import { DEFAULT_COLOR_INTENSITY, clampColorIntensity } from "@/lib/color-intensity"
import { UNDO_LIMIT } from "@/contexts/undo/stack"
import { normalizeStoredThemes } from "@/lib/themes/validate"
import { isHex6 } from "@/lib/themes/color"
import type { ThemeDefinition } from "@/lib/themes/types"
import { DEFAULT_LANGUAGE_PREFERENCE, isLanguagePreference, type LanguagePreference } from "@/i18n"

export { DEFAULT_PRIMARY_COLOR }

// One debounced save for the whole store (shared with tabs and shortcuts, see save-soon.ts)
const persist = saveStoreSoon

/**
 * Saves immediately any pending store change (call before the app closes).
 * Same as `flushStore`: preferences share its single debounce timer.
 * @returns A promise that resolves when nothing is left to save.
 * @category Store
 */
export const flushPreferences = flushStore

export const DEFAULT_AUDIO_VOLUME = 1
export const AUDIO_PLAYER_SCALES = [0.85, 1, 1.2] as const
export type AudioPlayerScale = typeof AUDIO_PLAYER_SCALES[number]
export const DEFAULT_AUDIO_PLAYER_SCALE: AudioPlayerScale = 1
export const MIN_AUDIO_PLAYER_OPACITY = 0.4
export const DEFAULT_AUDIO_PLAYER_OPACITY = 1

/** Brings a volume into 0-1 (non-numbers give the default). */
const clampAudioVolume = (value: unknown): number => {
    return clampNumber(value, 0, 1, DEFAULT_AUDIO_VOLUME, 0.01)
}

/** Brings an opacity into 0.4-1 (non-numbers give the default). */
const clampAudioPlayerOpacity = (value: unknown): number => {
    return clampNumber(value, MIN_AUDIO_PLAYER_OPACITY, 1, DEFAULT_AUDIO_PLAYER_OPACITY, 0.01)
}

/** Returns the allowed scale (0.85, 1 or 1.2) a stored value stands for; anything else gives 1. */
const normalizeAudioPlayerScale = (value: unknown): AudioPlayerScale =>
    AUDIO_PLAYER_SCALES.find(scale => scale === value) ?? DEFAULT_AUDIO_PLAYER_SCALE

/** Playback speeds the speed button of the player cycles through; the chosen one is remembered. */
export const AUDIO_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const
export type AudioPlaybackRate = typeof AUDIO_PLAYBACK_RATES[number]
export const DEFAULT_AUDIO_PLAYBACK_RATE: AudioPlaybackRate = 1

/** Returns the allowed speed a stored value stands for; anything else gives 1. */
const normalizeAudioPlaybackRate = (value: unknown): AudioPlaybackRate =>
    AUDIO_PLAYBACK_RATES.find(rate => rate === value) ?? DEFAULT_AUDIO_PLAYBACK_RATE

/** Where a track was left: the position in seconds and when it was saved (the keys are numbers, so the object itself keeps no order). */
type AudioPosition = { position: number, updatedAt: number }
/** The remembered positions of the audio files, by audio id. */
export type AudioPositions = Record<string, AudioPosition>
/** Most positions kept: past this the oldest ones are dropped. */
export const MAX_AUDIO_POSITIONS = 200

/** Keeps the valid entries (id key, finite position >= 0; a bare number is a position saved without a date) and the most recent MAX_AUDIO_POSITIONS. */
const normalizeAudioPositions = (value: unknown): AudioPositions => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
    const entries: [string, AudioPosition][] = []
    for (const [id, raw] of Object.entries(value)) {
        if (!/^\d+$/.test(id)) continue
        const entry = typeof raw === "number" ? { position: raw, updatedAt: 0 } : (raw ?? {}) as Partial<AudioPosition>
        const { position, updatedAt } = entry
        if (!isFiniteNumber(position) || position < 0) continue
        entries.push([id, { position, updatedAt: isFiniteNumber(updatedAt) ? updatedAt : 0 }])
    }
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    return Object.fromEntries(entries.slice(0, MAX_AUDIO_POSITIONS))
}

/** Size of the text at the normal zoom, in px: the size of the app is edited in px of that text (16 px = normal). */
export const BASE_TEXT_PX = 16
export const MIN_TEXT_PX = 12
export const MAX_TEXT_PX = 24
/** Zoom of the whole window (text, icons and spaces): 1 = normal. */
export type TextZoom = number
export const DEFAULT_TEXT_ZOOM: TextZoom = 1

/** The zoom for a size of the text in px, brought into the allowed range. */
export const textZoomFromPx = (px: number): TextZoom =>
    Math.min(MAX_TEXT_PX, Math.max(MIN_TEXT_PX, Math.round(px))) / BASE_TEXT_PX

/** The size of the text in px that a zoom stands for. */
export const textPxFromZoom = (zoom: TextZoom): number => Math.round(zoom * BASE_TEXT_PX)

/** Brings a stored value to a whole number of px between the limits; anything else gives the normal zoom. */
const normalizeTextZoom = (value: unknown): TextZoom =>
    isFiniteNumber(value) ? textZoomFromPx(value * BASE_TEXT_PX) : DEFAULT_TEXT_ZOOM

/** Fonts of the app: the default one (the one used so far) and fonts bundled with the app (loaded when chosen). */
export const FONT_FAMILIES = ["system", "inter", "lora", "jetbrains-mono", "atkinson", "opendyslexic"] as const
export type FontFamily = typeof FONT_FAMILIES[number]
export const DEFAULT_FONT_FAMILY: FontFamily = "system"

type WorkspaceView = "grid" | "list"
export type WorkspaceSortBy = "edited" | "created" | "name"
export type WorkspaceSortDir = "asc" | "desc"
export type WorkspaceSort = { by: WorkspaceSortBy, dir: WorkspaceSortDir }
export const DEFAULT_WORKSPACE_SORT: WorkspaceSort = { by: "edited", dir: "desc" }
export type SidebarItemSize = "compact" | "normal" | "large"

/** Where a new top level task goes in its section. */
export type NewTaskPosition = "top" | "bottom"

/** Spacing and text size of the tasks in the notes. */
export type TaskDensity = "compact" | "normal" | "large"

/** What a collapsed group looks like: a narrow vertical strip, or the horizontal bar (same header row, same width as open). */
export type CollapsedGroupLayout = "vertical" | "horizontal"

/** After how many days the trash is emptied at startup (0 = never). */
export const TRASH_AUTO_EMPTY_DAYS = [0, 7, 30, 90] as const
export type TrashAutoEmptyDays = typeof TRASH_AUTO_EMPTY_DAYS[number]

/** How often the automatic backup runs at startup. */
export const BACKUP_FREQUENCIES = ["daily", "weekly", "monthly"] as const
export type BackupFrequency = typeof BACKUP_FREQUENCIES[number]
/**
 * Speed of the animations: "slow" is the original one, "normal" is faster, "none" turns them off, "system" (default) follows
 * the setting of the operating system (animation effects off in Windows = none, otherwise normal).
 */
export type AnimationSpeed = "system" | "slow" | "normal" | "none"
export const ANIMATION_SPEEDS: readonly AnimationSpeed[] = ["system", "none", "normal", "slow"]
export const DEFAULT_ANIMATION_SPEED: AnimationSpeed = "system"
export type RightPanelTab = "details" | "history"

export const DEFAULT_BACKUP_KEEP = 5
export const MIN_BACKUP_KEEP = 1
export const MAX_BACKUP_KEEP = 100

/** Brings a number of backups to keep into the allowed range (non-numbers give the default). */
export const clampBackupKeep = (value: unknown): number => {
    return clampNumber(value, MIN_BACKUP_KEEP, MAX_BACKUP_KEEP, DEFAULT_BACKUP_KEEP, 1)
}

/** The values offered for the undo history limit. */
export const UNDO_LIMIT_OPTIONS = [25, 50, 100, 200, 500] as const

/** Whether a stored value is a valid undo limit (a positive integer up to the largest option). */
const isValidUndoLimit = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= UNDO_LIMIT_OPTIONS[UNDO_LIMIT_OPTIONS.length - 1]

/**
 * Definition of a preference kept in the store.
 * - `key`: the name used on disk (never rename it: the saved value would be lost).
 * - `default`: the value used when nothing valid is stored.
 * - `normalize`: brings any value (stored or about to be saved) into the allowed ones; without it a missing value gives the default.
 */
type PrefDef<T> = { key: string, default: T, normalize?: (raw: unknown) => T }

const def = <T>(definition: PrefDef<T>): PrefDef<T> => definition
const normalizeSidebarWidth = (value: unknown): number => isFiniteNumber(value) ? clampSidebarWidth(value) : SIDEBAR_DEFAULT_WIDTH

/** The preferences exposed by `usePreferences()` (the name of each one is the name of its field there). */
export const UI_PREFS = {
    showProgressBar: def({ key: "showProgressBar", default: true }),
    showGroupProgressBar: def({ key: "showGroupProgressBar", default: true }),
    showSectionCount: def({ key: "showSectionCount", default: true }),
    showTaskCount: def({ key: "showTaskCount", default: true }),
    showSubtaskCount: def({ key: "showSubtaskCount", default: true }),
    showAudioFileCount: def({ key: "showAudioFileCount", default: true }),
    showGroupSeparators: def({ key: "showGroupSeparators", default: false, normalize: value => value === true }),
    showUnnamedLabels: def({ key: "showUnnamedLabels", default: false, normalize: value => value === true }),
    animationSpeed: def<AnimationSpeed>({ key: "animationSpeed", default: DEFAULT_ANIMATION_SPEED, normalize: value => ANIMATION_SPEEDS.includes(value as AnimationSpeed) ? value as AnimationSpeed : DEFAULT_ANIMATION_SPEED }),
    taskBackground: def({ key: "taskBackground", default: true, normalize: value => value !== false }),
    renameOnClick: def({ key: "renameOnClick", default: true, normalize: value => value !== false }),
    keepAddingTasks: def({ key: "keepAddingTasks", default: true, normalize: value => value !== false }),
    showTaskInsertLine: def({ key: "showTaskInsertLine", default: true, normalize: value => value !== false }),
    liveDrag: def({ key: "liveDrag", default: true, normalize: value => value !== false }),
    undoLimit: def<number>({ key: "undoLimit", default: UNDO_LIMIT, normalize: value => isValidUndoLimit(value) ? value : UNDO_LIMIT }),
    sidebarLeftOpen: def({ key: "sidebarLeftOpen", default: true }),
    sidebarRightOpen: def({ key: "sidebarRightOpen", default: true }),
    sidebarLeftWidth: def<number>({ key: "sidebarLeftWidth", default: SIDEBAR_DEFAULT_WIDTH, normalize: normalizeSidebarWidth }),
    sidebarRightWidth: def<number>({ key: "sidebarRightWidth", default: SIDEBAR_DEFAULT_WIDTH, normalize: normalizeSidebarWidth }),
    sidebarItemSize: def<SidebarItemSize>({ key: "sidebarItemSize", default: "normal", normalize: value => value === "compact" || value === "large" ? value : "normal" }),
    fontFamily: def<FontFamily>({ key: "fontFamily", default: DEFAULT_FONT_FAMILY, normalize: value => FONT_FAMILIES.find(font => font === value) ?? DEFAULT_FONT_FAMILY }),
    textZoom: def<TextZoom>({ key: "textZoom", default: DEFAULT_TEXT_ZOOM, normalize: normalizeTextZoom }),
    rightPanelTab: def<RightPanelTab>({ key: "rightPanelTab", default: "details", normalize: value => value === "history" ? "history" : "details" }),
    audioVolume: def<number>({ key: "audioVolume", default: DEFAULT_AUDIO_VOLUME, normalize: clampAudioVolume }),
    audioPlayerVisible: def({ key: "audioPlayerVisible", default: true }),
    audioPlayerPinned: def({ key: "audioPlayerPinned", default: false, normalize: value => value === true }),
    audioPlayerScale: def<AudioPlayerScale>({ key: "audioPlayerScale", default: DEFAULT_AUDIO_PLAYER_SCALE, normalize: normalizeAudioPlayerScale }),
    audioPlayerOpacity: def<number>({ key: "audioPlayerOpacity", default: DEFAULT_AUDIO_PLAYER_OPACITY, normalize: clampAudioPlayerOpacity }),
    /** The speed chosen in the player: the next tracks (and the next start) begin with it. */
    audioPlaybackRate: def<AudioPlaybackRate>({ key: "audioPlaybackRate", default: DEFAULT_AUDIO_PLAYBACK_RATE, normalize: normalizeAudioPlaybackRate }),
    /** On: the track starts over when it ends. */
    audioRepeat: def({ key: "audioRepeat", default: false, normalize: value => value === true }),
    /** On: each track starts again from where it was left. */
    audioResume: def({ key: "audioResume", default: false, normalize: value => value === true }),
    workspaceView: def<WorkspaceView>({ key: "workspaceView", default: "grid", normalize: value => value === "list" ? "list" : "grid" }),
    workspaceSort: def<WorkspaceSort>({
        key: "workspaceSort",
        default: DEFAULT_WORKSPACE_SORT,
        normalize: value => {
            const { by, dir } = (value ?? {}) as Partial<WorkspaceSort>
            return (by === "edited" || by === "created" || by === "name") && (dir === "asc" || dir === "desc") ? { by, dir } : { ...DEFAULT_WORKSPACE_SORT }
        }
    }),
    reopenNotes: def({ key: "reopenNotes", default: true }),
    reopenLastWorkspace: def({ key: "reopenLastWorkspace", default: false }),
    /** With "reopen at startup" on: the workspace to always open (null = the last one used). */
    startupWorkspaceId: def<number | null>({ key: "startupWorkspaceId", default: null, normalize: value => typeof value === "number" && Number.isInteger(value) ? value : null }),
    colorIntensity: def<number>({ key: "colorIntensity", default: DEFAULT_COLOR_INTENSITY, normalize: clampColorIntensity }),
    hideCompletedTasks: def({ key: "hideCompletedTasks", default: false }),
    completedTasksLast: def({ key: "completedTasksLast", default: false }),
    language: def<LanguagePreference>({ key: "language", default: DEFAULT_LANGUAGE_PREFERENCE, normalize: value => isLanguagePreference(value) ? value : DEFAULT_LANGUAGE_PREFERENCE }),
    newTaskPosition: def<NewTaskPosition>({ key: "newTaskPosition", default: "bottom", normalize: value => value === "top" ? "top" : "bottom" }),
    collapsedGroupLayout: def<CollapsedGroupLayout>({ key: "collapsedGroupLayout", default: "vertical", normalize: value => value === "horizontal" ? "horizontal" : "vertical" }),
    taskDensity: def<TaskDensity>({ key: "taskDensity", default: "normal", normalize: value => value === "compact" || value === "large" ? value : "normal" }),
    spellcheck: def({ key: "spellcheck", default: true, normalize: value => value !== false }),
    trashAutoEmptyDays: def<TrashAutoEmptyDays>({
        key: "trashAutoEmptyDays",
        default: 0,
        normalize: value => TRASH_AUTO_EMPTY_DAYS.includes(value as TrashAutoEmptyDays) ? value as TrashAutoEmptyDays : 0,
    }),
    /** On: ask before deleting a note, section or group only when it has content (empty ones go straight to the trash). Off: never ask for these. */
    confirmDeleteWithContent: def({ key: "confirmDeleteWithContent", default: true, normalize: value => value !== false }),
}

/** The accent color, stored as `{ hex }`. */
export type PrimaryColorPref = { hex: string }

const DEFAULT_AUDIO_PLAYER_POSITION: AudioPlayerPosition = { x: 0, y: 0, scaleX: 1, scaleY: 1 }

/** Keeps a position made of finite numbers (a missing scale counts as 1); anything else gives the default position. */
const normalizeAudioPlayerPosition = (value: unknown): AudioPlayerPosition => {
    const position = (typeof value === "object" && value !== null ? value : {}) as Partial<AudioPlayerPosition>
    if (!isFiniteNumber(position.x) || !isFiniteNumber(position.y)) return { ...DEFAULT_AUDIO_PLAYER_POSITION }
    return { x: position.x, y: position.y, scaleX: isFiniteNumber(position.scaleX) ? position.scaleX : 1, scaleY: isFiniteNumber(position.scaleY) ? position.scaleY : 1 }
}

/** The preferences used by the app only (not part of `usePreferences()`); saving null removes them from the store. */
export const APP_PREFS = {
    /** The accent color (kept as `{ hex }` on disk); anything that is not a "#rgb"/"#rrggbb" gives the default. */
    primaryColor: def<PrimaryColorPref>({
        key: "primaryColor",
        default: { hex: DEFAULT_PRIMARY_COLOR },
        normalize: value => {
            const hex = (value as { hex?: unknown } | null | undefined)?.hex
            return { hex: isHexColor(hex) ? hex : DEFAULT_PRIMARY_COLOR }
        },
    }),
    /**
     * The chosen theme (id of a built-in theme or `custom-...`). null = not chosen yet: the first start picks one from the
     * operating system (see lib/theme-startup.ts) and saves it.
     */
    themeId: def<string | null>({ key: "themeId", default: null, normalize: value => typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value) ? value : null }),
    /**
     * A copy of the definition of the active theme when it is a custom one (those live in the database, which is not ready for
     * the first frame). null for the built-in themes.
     */
    activeThemeCache: def<ThemeDefinition | null>({ key: "activeThemeCache", default: null, normalize: value => normalizeStoredThemes([value])[0] ?? null }),
    /** Background of the active theme, "#rrggbb": also read by the Rust side at startup (key "themeBackground" in src-tauri/src/lib.rs). */
    themeBackground: def<string | null>({ key: "themeBackground", default: null, normalize: value => isHex6(value) ? value.toLowerCase() : null }),
    /** Where the floating audio player was left (position and scale). */
    audioPlayerPosition: def<AudioPlayerPosition>({ key: "audioPlayerPosition", default: DEFAULT_AUDIO_PLAYER_POSITION, normalize: normalizeAudioPlayerPosition }),
    /** Where each audio file was left (see `lib/audio-positions.ts`): kept out of the React state, it changes every few seconds while playing. */
    audioPositions: def<AudioPositions>({ key: "audioPositions", default: {}, normalize: normalizeAudioPositions }),
    /** Share of the width given to the left pane of the split workspace (internal: no settings row). */
    splitRatio: def<number>({ key: "splitRatio", default: DEFAULT_SPLIT_RATIO, normalize: value => isFiniteNumber(value) ? clampRatio(value, Infinity) : DEFAULT_SPLIT_RATIO }),
    lastWorkspaceId: def<number | null>({ key: "lastWorkspaceId", default: null, normalize: value => typeof value === "number" ? value : null }),
    skippedUpdateVersion: def<string | null>({ key: "skippedUpdateVersion", default: null, normalize: value => typeof value === "string" && value.length > 0 ? value : null }),
    /** The version of the app whose news were last shown in a tab (null = never, i.e. a first installation). */
    lastSeenVersion: def<string | null>({ key: "lastSeenVersion", default: null, normalize: value => typeof value === "string" && value.length > 0 ? value : null }),
    checkUpdatesOnStartup: def({ key: "checkUpdatesOnStartup", default: true }),
    autoBackup: def({ key: "autoBackup", default: true }),
    backupKeep: def<number>({ key: "backupKeep", default: DEFAULT_BACKUP_KEEP, normalize: clampBackupKeep }),
    backupFrequency: def<BackupFrequency>({
        key: "backupFrequency",
        default: "daily",
        normalize: value => BACKUP_FREQUENCIES.includes(value as BackupFrequency) ? value as BackupFrequency : "daily",
    }),
    /** A folder chosen by the user for the backups; null = the "backups" folder in the data folder. */
    backupFolder: def<string | null>({ key: "backupFolder", default: null, normalize: value => typeof value === "string" && value.trim().length > 0 ? value : null }),
    closeToTray: def({ key: "closeToTray", default: false, normalize: value => value === true }),
    // The two keys below are also read by the Rust side at startup (src-tauri/src/lib.rs, setup): keep the names identical there
    /** Restore the position and size of the window at the next start. */
    rememberWindowState: def({ key: "rememberWindowState", default: true, normalize: value => value !== false }),
    /** Keep the window above the others (applied at start by the Rust side, and when changed). */
    alwaysOnTop: def({ key: "alwaysOnTop", default: false, normalize: value => value === true }),
    /** Read by the Rust side at startup (key "hardwareAcceleration" in settings.dat): off starts WebView2 without the GPU. */
    hardwareAcceleration: def({ key: "hardwareAcceleration", default: true, normalize: value => value !== false }),
}

const ALL_PREFS = { ...UI_PREFS, ...APP_PREFS }

export type UiPrefName = keyof typeof UI_PREFS
type PrefName = keyof typeof ALL_PREFS
export type PrefValue<K extends PrefName> = (typeof ALL_PREFS)[K] extends PrefDef<infer T> ? T : never

/**
 * Brings a value into the ones allowed for a preference (what the store would give back for it).
 * @param name The preference (see UI_PREFS and APP_PREFS).
 * @param value The value to check (anything is accepted, undefined gives the default).
 * @returns The value itself when valid, otherwise the nearest allowed one.
 * @category Store
 */
export const normalizePref = <K extends PrefName>(name: K, value: unknown): PrefValue<K> => {
    const definition: PrefDef<unknown> = ALL_PREFS[name]
    return (definition.normalize ? definition.normalize(value) : value ?? definition.default) as PrefValue<K>
}

/**
 * Gets a preference.
 * @param name The preference (see UI_PREFS and APP_PREFS).
 * @returns A promise that resolves to the stored value, or to the default when nothing valid is stored.
 * @category Store
 */
export const getPref = async <K extends PrefName>(name: K): Promise<PrefValue<K>> =>
    normalizePref(name, await store.get(ALL_PREFS[name].key))

/**
 * Reads every UI preference at once (one `entries()` call of the store instead of one `get` per preference).
 * @returns A promise that resolves to the value of each one, normalized (the default when nothing valid is stored).
 * @category Store
 */
export const getAllPrefs = async (): Promise<{ [K in UiPrefName]: PrefValue<K> }> => {
    const names = Object.keys(UI_PREFS) as UiPrefName[]
    const raw = new Map<string, unknown>()
    if (typeof store.entries === "function") {
        for (const [key, value] of await store.entries<unknown>()) raw.set(key, value)
    } else {
        await Promise.all(names.map(async name => raw.set(UI_PREFS[name].key, await store.get(UI_PREFS[name].key))))
    }
    return Object.fromEntries(names.map(name => [name, normalizePref(name, raw.get(UI_PREFS[name].key))])) as { [K in UiPrefName]: PrefValue<K> }
}

/**
 * Saves a preference (the value is brought into the allowed ones first).
 * @param name The preference (see UI_PREFS and APP_PREFS).
 * @param value The value to save; null removes the preference from the store.
 * @returns A promise that resolves when the value is saved.
 * @category Store
 */
export const savePref = async <K extends PrefName>(name: K, value: PrefValue<K>): Promise<void> => {
    const key = ALL_PREFS[name].key
    const normalized = normalizePref(name, value)
    if (normalized === null) await store.delete(key)
    else await store.set(key, normalized)
    await persist()
}

// Thin wrappers for the preferences read or written outside of the provider
export const getAutoBackup = () => getPref("autoBackup")
export const saveAutoBackup = (value: boolean) => savePref("autoBackup", value)
export const getBackupKeep = () => getPref("backupKeep")
export const saveBackupKeep = (value: number) => savePref("backupKeep", value)
export const getBackupFrequency = () => getPref("backupFrequency")
export const saveBackupFrequency = (value: BackupFrequency) => savePref("backupFrequency", value)
export const getBackupFolder = () => getPref("backupFolder")
export const saveBackupFolder = (path: string | null) => savePref("backupFolder", path)
export const getCloseToTray = () => getPref("closeToTray")
export const saveCloseToTray = (value: boolean) => savePref("closeToTray", value)
export const getRememberWindowState = () => getPref("rememberWindowState")
export const saveRememberWindowState = (value: boolean) => savePref("rememberWindowState", value)
export const getAlwaysOnTop = () => getPref("alwaysOnTop")
export const saveAlwaysOnTop = (value: boolean) => savePref("alwaysOnTop", value)
export const getHardwareAcceleration = () => getPref("hardwareAcceleration")
export const saveHardwareAcceleration = (value: boolean) => savePref("hardwareAcceleration", value)
export const getTrashAutoEmptyDays = () => getPref("trashAutoEmptyDays")
export const getCheckUpdatesOnStartup = () => getPref("checkUpdatesOnStartup")
export const saveCheckUpdatesOnStartup = (value: boolean) => savePref("checkUpdatesOnStartup", value)
export const getSkippedUpdateVersion = () => getPref("skippedUpdateVersion")
export const saveSkippedUpdateVersion = (version: string | null) => savePref("skippedUpdateVersion", version)
export const getLastSeenVersion = () => getPref("lastSeenVersion")
export const saveLastSeenVersion = (version: string) => savePref("lastSeenVersion", version)
export const getLastWorkspaceId = () => getPref("lastWorkspaceId")
export const saveLastWorkspaceId = (id: number) => savePref("lastWorkspaceId", id)
/** Forgets the last open workspace (e.g. after going back to the home). */
export const clearLastWorkspaceId = () => savePref("lastWorkspaceId", null)
export const getReopenNotes = () => getPref("reopenNotes")
export const getStartupWorkspaceId = () => getPref("startupWorkspaceId")
export const getReopenLastWorkspace = () => getPref("reopenLastWorkspace")
export const getLanguage = () => getPref("language")

/**
 * Saves the primary color preference (a value that is not a "#rgb"/"#rrggbb" color saves the default).
 * @param hex A string representing the primary color in hex format.
 * @returns A promise that resolves when the primary color is saved.
 * @category Store
 */
export const savePrimaryColor = (hex: string): Promise<void> => savePref("primaryColor", { hex })

/** "#rgb" or "#rrggbb" as lowercase "#rrggbb". */
const toHex6 = (hex: string): string => (hex.length === 4 ? `#${[...hex.slice(1)].map(d => d + d).join("")}` : hex).toLowerCase()

/**
 * Gets the accent chosen apart from the theme (the stored `primaryColor`).
 * @returns A promise that resolves to "#rrggbb", or to null when there is none: the theme uses its own accent. The old default
 * orange counts as none (it was saved by the old "reset", and would hide the accents of the themes).
 * @category Store
 */
export const getAccentOverride = async (): Promise<string | null> => {
    const hex = ((await store.get<{ hex?: unknown }>(APP_PREFS.primaryColor.key)) as { hex?: unknown } | null | undefined)?.hex
    if (!isHexColor(hex)) return null
    const normalized = toHex6(hex)
    return normalized === DEFAULT_PRIMARY_COLOR ? null : normalized
}

/**
 * Saves the accent chosen apart from the theme.
 * @param hex The color, or null to remove it (the accent of the theme is used again).
 * @category Store
 */
export const saveAccentOverride = async (hex: string | null): Promise<void> => {
    if (hex === null || !isHexColor(hex)) {
        await store.delete(APP_PREFS.primaryColor.key)
        await persist()
        return
    }
    await savePrimaryColor(toHex6(hex))
}

export const saveThemeId = (id: string) => savePref("themeId", id)

/**
 * Gets the current position of the audio player.
 * If no position is set (or it is not made of finite numbers), it defaults to { x: 0, y: 0, scaleX: 1, scaleY: 1 }.
 * @returns A promise that resolves to an object containing the audio player's position and scale.
 * @category Store
 */
export const getAudioPlayerPosition = (): Promise<AudioPlayerPosition> => getPref("audioPlayerPosition")

/**
 * Saves the current position of the audio player (non-finite coordinates save the default position).
 * @param position An object containing the audio player's position and scale.
 * @returns A promise that resolves when the position is saved.
 * @category Store
 */
export const saveAudioPlayerPosition = (position: AudioPlayerPosition): Promise<void> => savePref("audioPlayerPosition", position)

/**
 * Resets the audio player position to its default state.
 * @returns A promise that resolves when the audio player position is reset.
 * @category Store
 */
export const resetAudioPlayerPosition = async (): Promise<void> => {
    await store.delete(APP_PREFS.audioPlayerPosition.key)
    await persist()
}
