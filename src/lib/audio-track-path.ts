import type { AudioFile } from "@/types/types"
import type { AudioTrack } from "@/contexts/audio-context-object"

/** The path of the loaded track: from the lists already loaded, otherwise decoded from its asset URL. */
export const trackPath = (track: AudioTrack, filesCache: Map<number, AudioFile[]>): string | null => {
    for (const files of filesCache.values()) {
        const file = files.find(candidate => candidate.id === track.audioId)
        if (file) return file.path
    }
    try {
        // convertFileSrc: <scheme>://<host>/<encoded path>
        const encoded = new URL(track.src).pathname.slice(1)
        return encoded ? decodeURIComponent(encoded) : null
    } catch {
        return null
    }
}
