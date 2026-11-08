import { DEFAULT_PRIMARY_COLOR } from "@/lib/accent-color"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createExternalStore } from "@/lib/external-store"
import {
    UI_PREFS,
    getAllPrefs,
    savePref,
    normalizePref,
    getAccentOverride,
    saveAccentOverride,
    saveAudioPlayerPosition,
    getAudioPlayerPosition,
    resetAudioPlayerPosition,
    DEFAULT_AUDIO_VOLUME,
    DEFAULT_AUDIO_PLAYER_SCALE,
    DEFAULT_AUDIO_PLAYER_OPACITY,
    DEFAULT_AUDIO_PLAYBACK_RATE,
    type AudioPlayerScale,
    type PrefValue,
    type UiPrefName
} from "@/lib/store/preferences"
import { reportError } from "@/lib/report-error"
import { getThemeStartup } from "@/lib/theme-startup"
import { applyLanguagePreference } from "@/i18n"
import { applyAnimationSpeed } from "@/lib/animation-speed"
import { applyTextZoom } from "@/lib/text-zoom"
import { applyFontFamily } from "@/lib/font-family"
import type { AudioPlayerPosition } from "@/types/types"
import { PreferencesContext, PreferencesStoreContext, type PreferencesContextType, type PrefSetterName } from "./preferences-context-object"

/** Fallback size of the player at scale 1 (title row + controls row), used only until the real one is measured. */
const AUDIO_PLAYER_WIDTH = 350
const AUDIO_PLAYER_HEIGHT = 140
/** Distance kept from the bottom of the container by the default position. */
const AUDIO_PLAYER_MARGIN = 8

type PrefValues = { [K in UiPrefName]: PrefValue<K> }

const PREF_NAMES = Object.keys(UI_PREFS) as UiPrefName[]
const DEFAULT_PREFS = Object.fromEntries(PREF_NAMES.map(name => [name, UI_PREFS[name].default])) as PrefValues

/** The name of the setter exposed for a preference (the sidebar ones are spelled setSideBar...). */
const setterName = (name: UiPrefName) =>
    (name === "sidebarLeftOpen" ? "setSideBarLeftOpen"
        : name === "sidebarRightOpen" ? "setSideBarRightOpen"
            : `set${name[0].toUpperCase()}${name.slice(1)}`) as PrefSetterName<UiPrefName>

export const PreferencesProvider = ({ children }: { children: React.ReactNode }) => {
    const [prefs, setPrefs] = useState<PrefValues>(DEFAULT_PREFS)
    // The accent override is applied with the theme by the ThemeProvider
    const [accentOverride, setAccentOverrideState] = useState<string | null>(() => getThemeStartup()?.accentOverride ?? null)
    useEffect(() => applyAnimationSpeed(prefs.animationSpeed), [prefs.animationSpeed])
    useEffect(() => applyTextZoom(prefs.textZoom), [prefs.textZoom])
    useEffect(() => applyFontFamily(prefs.fontFamily), [prefs.fontFamily])
    // The spellcheck attribute is inherited: on the root it covers every text field of the app
    useEffect(() => { document.documentElement.spellcheck = prefs.spellcheck }, [prefs.spellcheck])
    const [audioPlayerPosition, setAudioPlayerPositionState] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
    const audioPlayerContainerRef = useRef<HTMLDivElement>(null)
    const positionRef = useRef<AudioPlayerPosition>(audioPlayerPosition)
    const scaleRef = useRef<AudioPlayerScale>(prefs.audioPlayerScale)
    /** Real size of the mounted player (scale included), null while it is not mounted. */
    const playerSizeRef = useRef<{ width: number; height: number } | null>(null)

    useEffect(() => {
        scaleRef.current = prefs.audioPlayerScale
    }, [prefs.audioPlayerScale])

    /** Brings a position inside the container of the player (the window while it is not mounted). */
    const fitPosition = (position: AudioPlayerPosition, scale: AudioPlayerScale = scaleRef.current): AudioPlayerPosition => {
        const container = audioPlayerContainerRef.current
        const width = container?.offsetWidth || window.innerWidth
        const height = container?.offsetHeight || window.innerHeight
        const { width: playerWidth, height: playerHeight } = playerSizeRef.current ?? { width: AUDIO_PLAYER_WIDTH * scale, height: AUDIO_PLAYER_HEIGHT * scale }
        const x = Math.max(0, Math.min(position.x, width - playerWidth))
        const y = Math.max(0, Math.min(position.y, height - playerHeight))
        return x === position.x && y === position.y ? position : { ...position, x, y }
    }
    const fitPositionRef = useRef(fitPosition)
    useEffect(() => {
        fitPositionRef.current = fitPosition
    })

    /** Pulls the current position back inside the container; state and store change only when it moved. */
    const refitPosition = useCallback(() => {
        const current = positionRef.current
        const fitted = fitPositionRef.current(current)
        if (fitted === current) return
        positionRef.current = fitted
        setAudioPlayerPositionState(fitted)
        saveAudioPlayerPosition(fitted).catch(reportError)
    }, [])

    /** The player reports its real size (null when it unmounts): a taller title or a new scale must not push it out of the window. */
    const reportAudioPlayerSize = useCallback((size: { width: number; height: number } | null) => {
        const previous = playerSizeRef.current
        if (previous?.width === size?.width && previous?.height === size?.height) return
        playerSizeRef.current = size
        if (size) refitPosition()
    }, [refitPosition])

    // A smaller window must not leave the player outside of it
    useEffect(() => {
        const onResize = () => refitPosition()
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [refitPosition])

    /** Sets the state of a preference (nothing changes, so nothing renders, when the value is the same). */
    const setPref = useCallback(<K extends UiPrefName>(name: K, value: PrefValue<K>) =>
        setPrefs(current => Object.is(current[name], value) ? current : { ...current, [name]: value }), [])

    useEffect(() => {
        // One read of the whole store and one state update (instead of one get and one setState per preference)
        getAllPrefs().then(loaded => {
            setPrefs(current => PREF_NAMES.every(name => Object.is(current[name], loaded[name])) ? current : loaded)
            void applyLanguagePreference(loaded.language)
        }).catch(reportError)
        getAudioPlayerPosition().then(position => {
            const fitted = fitPositionRef.current(position)
            positionRef.current = fitted
            setAudioPlayerPositionState(fitted)
        }).catch(reportError)
        getAccentOverride().then(setAccentOverrideState).catch(reportError)
    }, [])

    // The actions only go through setState and refs: built once, so their identity never changes and the value below
    // changes only with the preferences (every colored row reads it through useColorAlpha)
    const actions = useMemo(() => {
        // One setter per preference: it brings the value into the allowed ones, updates the state and saves it
        const setters = Object.fromEntries(PREF_NAMES.map(name => [setterName(name), (value: unknown) => {
            const normalized = normalizePref(name, value)
            setPref(name, normalized)
            if (name === "language") void applyLanguagePreference(normalized as PrefValues["language"])
            savePref(name, normalized).catch(reportError)
        }])) as Pick<PreferencesContextType, PrefSetterName<UiPrefName>>

        const setAccentOverride = (hex: string | null) => {
            setAccentOverrideState(hex)
            saveAccentOverride(hex).catch(reportError)
        }
        const setPrimaryColor = (hex: string) => setAccentOverride(hex)

        const setAudioPlayerPosition = (position: AudioPlayerPosition) => {
            setAudioPlayerPositionState(position)
            positionRef.current = position
            saveAudioPlayerPosition(position).catch(reportError)
        }

        const setAudioPlayerScale = (value: AudioPlayerScale) => {
            const scale = normalizePref("audioPlayerScale", value)
            setters.setAudioPlayerScale(scale)
            // A bigger player must not overflow the window: pull it back inside
            if (!audioPlayerContainerRef.current) return
            const current = positionRef.current
            const fitted = fitPositionRef.current(current, scale)
            if (fitted !== current) setAudioPlayerPosition(fitted)
        }

        const resetAudioSettings = () => {
            setters.setAudioVolume(DEFAULT_AUDIO_VOLUME)
            setters.setAudioPlayerVisible(true)
            setters.setAudioPlayerPinned(false)
            setAudioPlayerScale(DEFAULT_AUDIO_PLAYER_SCALE)
            setters.setAudioPlayerOpacity(DEFAULT_AUDIO_PLAYER_OPACITY)
            setters.setAudioPlaybackRate(DEFAULT_AUDIO_PLAYBACK_RATE)
            setters.setAudioRepeat(false)
            setters.setAudioResume(false)
        }

        const resetPlayerPosition = () => {
            const container = audioPlayerContainerRef.current
            if (!container) {
                resetAudioPlayerPosition().catch(reportError)
                return
            }
            const { width: playerWidth, height: playerHeight } = playerSizeRef.current
                ?? { width: AUDIO_PLAYER_WIDTH * scaleRef.current, height: AUDIO_PLAYER_HEIGHT * scaleRef.current }
            // Computed once and set once (setAudioPlayerPosition also saves it, replacing the stored position)
            setAudioPlayerPosition({
                x: Math.max(0, container.offsetWidth / 2 - playerWidth / 2),
                y: Math.max(0, container.offsetHeight - playerHeight - AUDIO_PLAYER_MARGIN),
                scaleX: 1,
                scaleY: 1
            })
        }

        return { ...setters, setAudioPlayerScale, setAccentOverride, setPrimaryColor, setAudioPlayerPosition, resetPlayerPosition, resetAudioSettings }
    }, [setPref])

    const value = useMemo<PreferencesContextType>(() => ({
        ...prefs,
        ...actions,
        accentOverride,
        primaryColor: accentOverride ?? DEFAULT_PRIMARY_COLOR,
        audioPlayerPosition,
        audioPlayerContainerRef,
        reportAudioPlayerSize,
    }), [prefs, actions, accentOverride, audioPlayerPosition, reportAudioPlayerSize])

    // The same value in an external store: usePreference(selector) re-renders its component only when the selected value changes
    // eslint-disable-next-line react-hooks/refs -- only the ref object is stored, its current is never read
    const [store] = useState(() => createExternalStore(value))
    useLayoutEffect(() => store.set(value), [store, value])

    return (
        <PreferencesStoreContext.Provider value={store}>
            <PreferencesContext.Provider value={value}>
                {children}
            </PreferencesContext.Provider>
        </PreferencesStoreContext.Provider>
    )
}
