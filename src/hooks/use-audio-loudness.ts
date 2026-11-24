import { useEffect, useState } from "react"
import { getAudioLoudness, type LoudnessReport } from "@/lib/audio-loudness"

type State = { path: string, report: LoudnessReport | null }

export type AudioLoudness =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready", report: LoudnessReport }

/**
 * The loudness of the file at `path`, measured by the backend when the path changes (null: nothing to measure).
 * The answer of a file that is no longer the current one is dropped.
 */
export const useAudioLoudness = (path: string | null): AudioLoudness => {
    const [state, setState] = useState<State | null>(null)

    useEffect(() => {
        if (!path) return
        let cancelled = false
        getAudioLoudness(path)
            .then(report => { if (!cancelled) setState({ path, report }) })
            .catch(() => { if (!cancelled) setState({ path, report: null }) })
        return () => { cancelled = true }
    }, [path])

    if (!path) return { status: "idle" }
    if (state?.path !== path) return { status: "loading" }
    return state.report ? { status: "ready", report: state.report } : { status: "error" }
}
