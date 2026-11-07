import { getVersion } from "@tauri-apps/api/app"
import { getLastSeenVersion, saveLastSeenVersion } from "@/lib/store/preferences"
import { getBundledReleaseNotes } from "@/lib/release-notes"

/**
 * Decides whether the news of the running version have to be shown now: only when the app has been updated, that is when
 * a version was saved by a previous run and it is not this one. The first installation (nothing saved) shows nothing.
 * @returns The notes to show, or null when there is nothing to show; `markSeen` saves the version so they are not shown again.
 * @category Updater
 */
export async function pendingWhatsNew(language: "en" | "it"): Promise<{ notes: string, markSeen: () => Promise<void> } | null> {
    const version = await getVersion()
    const last = await getLastSeenVersion()
    if (last === version) return null
    const markSeen = () => saveLastSeenVersion(version)
    if (last === null) {
        await markSeen()
        return null
    }
    const notes = await getBundledReleaseNotes(version, language)
    if (!notes) {
        // A version with no entry in the changelog has no news to show
        await markSeen()
        return null
    }
    return { notes, markSeen }
}
