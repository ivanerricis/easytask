import i18n from "@/i18n"
import { useContext, useEffect, useState } from "react"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import type { MediaFile } from "@/types/types"
import { getDBGroupMediaFiles, getDBNoteMediaCounts } from "@/db/queries/media"
import { reportError } from "@/lib/report-error"
import { createRequiredContextHook } from "@/lib/required-context"
import { AudioFilesContext } from "./audio-context-object"

const useAudioFilesContext = createRequiredContextHook(AudioFilesContext, "useGroupMediaFiles", "AudioProvider")

/**
 * The images and videos of a group, reloaded whenever the files may have changed (the same version as the audio files).
 * The last list is remembered, so a group that is collapsed and opened again shows its files in the first render.
 * @param groupId The ID of the group.
 * @category Audio Context
 */
export function useGroupMediaFiles(groupId: number): MediaFile[] {
    const { version, mediaCache } = useAudioFilesContext()
    const [files, setFiles] = useState<MediaFile[]>(() => mediaCache.get(groupId) ?? [])

    useEffect(() => {
        let stale = false
        getDBGroupMediaFiles(groupId)
            .then(rows => {
                if (stale) return
                mediaCache.set(groupId, rows)
                setFiles(rows)
            })
            .catch(error => reportError(error, i18n.t("errors.loadMedia")))
        return () => { stale = true }
    }, [groupId, version, mediaCache])

    return files
}

const EMPTY_COUNTS: Record<number, number> = {}

/**
 * The number of images and videos of each group of a note (groups without files have no entry): one query for the whole
 * note, reloaded whenever the files may have changed. Works without an AudioProvider (it then loads once).
 * @param noteId The ID of the note (null: no note, nothing is loaded).
 * @param enabled When false nothing is loaded (the counts are not shown).
 * @category Audio Context
 */
export function useNoteMediaCounts(noteId: number | null, enabled = true): Record<number, number> {
    const version = useContext(AudioFilesContext)?.version ?? 0
    const [loaded, setLoaded] = useState<{ noteId: number, counts: Record<number, number> } | null>(null)

    useEffect(() => {
        if (noteId === null || !enabled) return
        let stale = false
        getDBNoteMediaCounts(noteId)
            .then(counts => {
                if (!stale) setLoaded({ noteId, counts })
            })
            .catch(error => reportError(error, i18n.t("errors.loadMedia")))
        return () => { stale = true }
    }, [noteId, enabled, version])

    return enabled && loaded?.noteId === noteId ? loaded.counts : EMPTY_COUNTS
}

const NONE = new Set<string>()

/**
 * The paths, among the ones of the given files (audio, images or videos), that no longer point to a file. One call of the
 * Rust command `files_exist` checks the whole list, again whenever the list changes (a relink, an added file, a reload).
 * The answer of the previous list stays until the new one arrives, so the markers do not blink. A failed check marks nothing.
 * @param files The files shown (only their path is read).
 * @category Audio Context
 */
export function useMissingPaths(files: readonly { path: string }[]): ReadonlySet<string> {
    const [missing, setMissing] = useState<ReadonlySet<string>>(NONE)
    // The list is rebuilt on every reload: compare its content, so an equal list does not ask again
    const key = JSON.stringify(files.map(file => file.path))

    useEffect(() => {
        const paths = JSON.parse(key) as string[]
        if (paths.length === 0) return
        let stale = false
        invoke<boolean[]>("files_exist", { paths })
            .then(results => {
                if (stale) return
                const gone = paths.filter((_, index) => results[index] === false)
                setMissing(previous => previous.size === gone.length && gone.every(path => previous.has(path)) ? previous : new Set(gone))
            })
            .catch(() => undefined)
        return () => { stale = true }
    }, [key])

    return files.length === 0 ? NONE : missing
}

/**
 * The URLs (asset protocol) to show the given images and videos, by path. Each file is first allowed in the scope of the asset
 * protocol (one file at a time, nothing global); a file that cannot be allowed (missing) has no URL.
 * @param files The files to show (only their path is read).
 * @category Audio Context
 */
export function useMediaSources(files: readonly { path: string }[]): Readonly<Record<string, string>> {
    const [sources, setSources] = useState<Readonly<Record<string, string>>>({})
    const key = JSON.stringify(files.map(file => file.path))

    useEffect(() => {
        const paths = JSON.parse(key) as string[]
        let stale = false
        void Promise.all(paths.map(async path => {
            try {
                await invoke("allow_media_file", { path })
                return [path, convertFileSrc(path)] as const
            } catch {
                return null
            }
        })).then(entries => {
            if (stale) return
            setSources(Object.fromEntries(entries.filter(entry => entry !== null)))
        })
        return () => { stale = true }
    }, [key])

    return sources
}
