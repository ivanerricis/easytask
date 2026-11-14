import { createContext } from "react"
import type { AudioFile, MediaFile } from "@/types/types"

/**
 * The track loaded in the player. `playId` changes when a file is requested that is not the loaded one (or after
 * the player was closed), so the track starts from the beginning; asking again for the loaded file pauses or
 * resumes it instead (see `togglePlayback`).
 * @category Audio Context
 */
export type AudioTrack = {
    audioId: number
    name: string
    /** URL served by the asset protocol (the file is allowed at runtime, one file at a time). */
    src: string
    playId: number
}

/** What the loaded track is doing: playing, paused by the user, or ended (it played to the end). */
export type PlaybackState = "playing" | "paused" | "ended"

export type AudioContextType = {
    /** The track of the player, null when the player is closed. */
    track: AudioTrack | null
    /** What the loaded track is doing ("paused" while there is no track). */
    playbackState: PlaybackState
    /** Called by the player when its state changes. */
    setPlaybackState: (state: PlaybackState) => void
    /** Changes at every `togglePlayback` request: the player pauses or resumes when it sees a new value. */
    toggleSeq: number
    /** Pauses the playback, or resumes it when it is paused (nothing without a track). */
    togglePlayback: () => void
    /**
     * The last list of audio files loaded for each group. A group that is collapsed and opened again shows its list at
     * once from here (and refreshes it), instead of starting empty and popping in a moment later.
     */
    filesCache: Map<number, AudioFile[]>
    /** The same for the images and videos of each group. */
    mediaCache: Map<number, MediaFile[]>
    /** Incremented whenever the audio files may have changed (add, rename, relink, delete, trash operations). */
    version: number
    /**
     * Plays a file: checks it exists and grants the webview access to it, then opens the player and starts.
     * For the file that is already loaded it pauses or resumes instead of restarting.
     * A missing file opens the "File non trovato" dialog (relink or delete the reference).
     */
    playFile: (file: AudioFile) => Promise<void>
    /** Closes the player and stops the playback. */
    closePlayer: () => void
    /** Asks for audio files and attaches them to a group. */
    addFiles: (groupId: number) => Promise<void>
    /** Asks for the new location of a file and stores it; when `play` is true the file is played afterwards. */
    relinkFile: (file: AudioFile, play?: boolean) => Promise<void>
    /** Tells the lists to reload (call after operations done outside this context, e.g. rename/delete dialogs). */
    refresh: () => void
    /** Called by the player when the media element fails (unsupported codec, file removed after the check...). */
    reportPlaybackError: () => Promise<void>
    /** Asks for images and videos and attaches them to a group (links only, nothing is copied). */
    addMediaFiles: (groupId: number) => Promise<void>
    /** Asks for the new location of an image or a video and stores it. */
    relinkMediaFile: (file: MediaFile) => Promise<void>
    /** Opens the "File non trovato" dialog (relink or delete the reference) for an image or a video that is missing. */
    reportMissingMedia: (file: MediaFile) => void
}

/**
 * The files part of the audio state, in its own context so the lists of the groups do not re-render when the playback
 * changes (play, pause, next track): only a change of `version` reaches them.
 */
export type AudioFilesContextType = Pick<AudioContextType, "filesCache" | "mediaCache" | "version">

/**
 * The actions of the audio state, which keep their identity across playback changes: a component that only starts a
 * playback or attaches files does not re-render on play/pause.
 */
export type AudioActionsContextType = Pick<AudioContextType, "setPlaybackState" | "togglePlayback" | "playFile" | "closePlayer" | "addFiles" | "relinkFile" | "refresh" | "reportPlaybackError" | "addMediaFiles" | "relinkMediaFile" | "reportMissingMedia">

export const AudioContext = createContext<AudioContextType | null>(null)
export const AudioFilesContext = createContext<AudioFilesContextType | null>(null)
export const AudioActionsContext = createContext<AudioActionsContextType | null>(null)
