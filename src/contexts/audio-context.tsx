import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import type { AudioFile, MediaFile } from "@/types/types"
import {
    AUDIO_EXTENSIONS, createDBAudioFile, getDBAudioFile, updateDBAudioFilePath,
} from "@/db/queries/audio"
import { MEDIA_EXTENSIONS, createDBMediaFile, updateDBMediaFilePath } from "@/db/queries/media"
import { usePreferences } from "./use-preferences"
import { useWorkspaceActions, useWorkspaceVersion } from "./workspace-data"
import {
    AudioActionsContext, AudioContext, AudioFilesContext,
    type AudioActionsContextType, type AudioContextType, type AudioFilesContextType, type AudioTrack, type PlaybackState,
} from "./audio-context-object"
import { getErrorMessage } from "@/lib/utils"
import { reportError } from "@/lib/report-error"
import { FolderSearch, Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/dialogs/dialog-confirm"

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path
const getFilters =() => [{ name: i18n.t("audio.dialogFilter"), extensions: [...AUDIO_EXTENSIONS] }]
const getMediaFilters = () => [{ name: i18n.t("media.dialogFilter"), extensions: [...MEDIA_EXTENSIONS] }]

/** The file that was not found: an audio file or an image/video, they share the dialog (relink or delete the reference). */
type MissingFile = { file: AudioFile | MediaFile, kind: "audio" | "media" }

/**
 * State of the audio files attached to the groups and of the floating player. It also holds the actions on the images and
 * videos of the groups (add, relink, missing file), which share the list reload and the "file not found" dialog.
 * The playback is deliberately not tied to the open note: it continues across tab switches
 * and stops only when the user closes the player, when the played file is deleted or when the workspace is left.
 * Mounted above both the note view and the player.
 * @category Audio Context
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation()
    const audioVersion = useWorkspaceVersion("audio")
    const { deleteItem } = useWorkspaceActions()
    const { audioPlayerVisible } = usePreferences()
    const [track, setTrack] = useState<AudioTrack | null>(null)
    const [localVersion, setLocalVersion] = useState(0)
    const [reportedState, setPlaybackState] = useState<PlaybackState>("paused")
    const [toggleSeq, setToggleSeq] = useState(0)
    const [missing, setMissing] = useState<MissingFile | null>(null)
    const playSeq = useRef(0)
    const trackRef = useRef(track)
    const knownFiles = useRef(new Map<number, AudioFile>())
    const [filesCache] = useState(() => new Map<number, AudioFile[]>())
    const [mediaCache] = useState(() => new Map<number, MediaFile[]>())

    // Both counters only grow, so their sum changes whenever either does (the audio version, not the trash one: that one
    // moves with every task move and would reload the audio of every group)
    const version = localVersion + audioVersion

    useEffect(() => {
        trackRef.current = track
    }, [track])

    const refresh = useCallback(() => setLocalVersion(value => value + 1), [])

    const closePlayer = useCallback(() => setTrack(null), [])

    const togglePlayback = useCallback(() => {
        if (trackRef.current) setToggleSeq(value => value + 1)
    }, [])

    const playFile = useCallback(async (file: AudioFile) => {
        // The player holds the only controls: with it turned off in the settings nothing starts, the user is told why
        if (!audioPlayerVisible) {
            toast.info(i18n.t("audio.playerHidden"))
            return
        }
        // The loaded file: clicking it again pauses or resumes it (it does not start over)
        if (trackRef.current?.audioId === file.id) {
            setToggleSeq(value => value + 1)
            return
        }
        knownFiles.current.set(file.id, file)
        try {
            await invoke("allow_audio_file", { path: file.path })
        } catch {
            setMissing({ file, kind: "audio" })
            return
        }
        setTrack({ audioId: file.id, name: file.name, src: convertFileSrc(file.path), playId: ++playSeq.current })
    }, [audioPlayerVisible])

    const addFiles = useCallback(async (groupId: number) => {
        try {
            const selected = await open({ multiple: true, directory: false, filters: getFilters() })
            if (!selected) return
            const paths = Array.isArray(selected) ? selected : [selected]

            let failed = 0
            for (const path of paths) {
                try {
                    await createDBAudioFile(groupId, path)
                } catch (error) {
                    failed++
                    reportError(error, i18n.t("audio.addFileError", { name: baseName(path) }))
                }
            }
            refresh()
            if (paths.length > failed)
                toast.success(i18n.t("audio.added", { count: paths.length - failed }))
        } catch (error) {
            toast.error(i18n.t("audio.addError", { message: getErrorMessage(error) }))
        }
    }, [refresh])

    const addMediaFiles = useCallback(async (groupId: number) => {
        try {
            const selected = await open({ multiple: true, directory: false, filters: getMediaFilters() })
            if (!selected) return
            const paths = Array.isArray(selected) ? selected : [selected]

            let failed = 0
            for (const path of paths) {
                try {
                    await createDBMediaFile(groupId, path)
                } catch (error) {
                    failed++
                    reportError(error, i18n.t("media.addFileError", { name: baseName(path) }))
                }
            }
            refresh()
            if (paths.length > failed)
                toast.success(i18n.t("media.added", { count: paths.length - failed }))
        } catch (error) {
            toast.error(i18n.t("media.addError", { message: getErrorMessage(error) }))
        }
    }, [refresh])

    const relinkMediaFile = useCallback(async (file: MediaFile) => {
        try {
            const selected = await open({ multiple: false, directory: false, filters: getMediaFilters() })
            const path = Array.isArray(selected) ? selected[0] : selected
            if (!path) return

            await updateDBMediaFilePath(file.id, path)
            refresh()
            toast.success(i18n.t("audio.pathUpdated"))
        } catch (error) {
            toast.error(i18n.t("audio.pathError", { message: getErrorMessage(error) }))
        }
    }, [refresh])

    const reportMissingMedia = useCallback((file: MediaFile) => setMissing({ file, kind: "media" }), [])

    const relinkFile = useCallback(async (file: AudioFile, play = false) => {
        try {
            const selected = await open({ multiple: false, directory: false, filters: getFilters() })
            const path = Array.isArray(selected) ? selected[0] : selected
            if (!path) return

            await updateDBAudioFilePath(file.id, path)
            refresh()
            const updated = { ...file, path }
            knownFiles.current.set(file.id, updated)
            if (play) await playFile(updated)
            else toast.success(i18n.t("audio.pathUpdated"))
        } catch (error) {
            toast.error(i18n.t("audio.pathError", { message: getErrorMessage(error) }))
        }
    }, [playFile, refresh])

    const reportPlaybackError = useCallback(async () => {
        const current = trackRef.current
        if (!current) return
        const file = knownFiles.current.get(current.audioId)
        const exists = await invoke<boolean>("audio_file_exists", { path: file?.path ?? "" }).catch(() => true)
        if (!exists && file) {
            setTrack(null)
            setMissing({ file, kind: "audio" })
        } else {
            toast.error(i18n.t("audio.playbackError"))
        }
    }, [])

    // The played file was deleted (or renamed) from a dialog, the trash or another view: keep the player in sync
    useEffect(() => {
        const current = trackRef.current
        if (!current) return
        let stale = false
        getDBAudioFile(current.audioId)
            .then(file => {
                if (stale) return
                if (!file) setTrack(null)
                else {
                    knownFiles.current.set(file.id, file)
                    setTrack(latest => latest && latest.audioId === file.id && latest.name !== file.name
                        ? { ...latest, name: file.name } : latest)
                }
            })
            .catch(error => reportError(error))
        return () => { stale = true }
    }, [version])

    const handleDeleteReference = async () => {
        const current = missing
        setMissing(null)
        if (!current) return
        try {
            await deleteItem(current.kind === "audio" ? "audio_file" : "media_file", current.file.id)
            refresh()
            toast.success(i18n.t("audio.referenceTrashed"))
        } catch (error) {
            toast.error(i18n.t("audio.referenceError", { message: getErrorMessage(error) }))
        }
    }

    const handleRelink = () => {
        const current = missing
        setMissing(null)
        if (!current) return
        if (current.kind === "audio") void relinkFile(current.file, true)
        else void relinkMediaFile(current.file)
    }

    const playbackState: PlaybackState = track === null ? "paused" : reportedState

    // Three views of the same state: the full one, the files (version) and the stable actions, so a consumer re-renders only for what it reads
    const actions = useMemo<AudioActionsContextType>(() => ({
        setPlaybackState, togglePlayback, playFile, closePlayer, addFiles, relinkFile, refresh, reportPlaybackError,
        addMediaFiles, relinkMediaFile, reportMissingMedia,
    }), [togglePlayback, playFile, closePlayer, addFiles, relinkFile, refresh, reportPlaybackError, addMediaFiles, relinkMediaFile, reportMissingMedia])
    const files = useMemo<AudioFilesContextType>(() => ({ filesCache, mediaCache, version }), [filesCache, mediaCache, version])
    const value = useMemo<AudioContextType>(() => ({
        ...actions, ...files, track, playbackState, toggleSeq,
    }), [actions, files, track, playbackState, toggleSeq])

    return (
        <AudioContext.Provider value={value}>
            <AudioActionsContext.Provider value={actions}>
            <AudioFilesContext.Provider value={files}>
            {children}
            <ConfirmDialog
                open={missing !== null}
                onOpenChange={(isOpen) => { if (!isOpen) setMissing(null) }}
                title={t("audio.missing.title")}
                description={t(missing?.kind === "media" ? "media.missing.description" : "audio.missing.description")}
                secondary={{ label: t("audio.missing.deleteReference"), icon: Trash2, onClick: handleDeleteReference }}
                secondaryDestructive
                confirm={{ label: t("audio.updatePath"), icon: FolderSearch, onClick: handleRelink }}
            >
                <p className="text-xs text-muted-foreground break-all rounded-xs border bg-secondary p-2">
                    {missing?.file.path}
                </p>
            </ConfirmDialog>
            </AudioFilesContext.Provider>
            </AudioActionsContext.Provider>
        </AudioContext.Provider>
    )
}
