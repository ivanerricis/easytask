/** Languages the release notes are written in. */
type NotesLanguage = "en" | "it"

// The body of a release has one section per language, each under its own "## " heading
// ("## English" first, then "## Italiano"): see RELEASING.md and the release workflow, which build it from CHANGELOG.md
// and CHANGELOG.it.md.
const SECTION_HEADING = /^##\s+(English|Italiano)\s*$/i
const LANGUAGE_OF: Record<string, NotesLanguage> = { english: "en", italiano: "it" }

/**
 * The part of the release notes that is in the given language. The English section is the fallback when the language
 * has none. A body without language sections (the releases made before them) is a single text for everybody.
 * @param body The release notes, as they come with the update.
 * @param language The language of the app.
 * @category Updater
 */
export function selectReleaseNotes(body: string, language: NotesLanguage): string {
    const sections = new Map<NotesLanguage, string[]>()
    let current: NotesLanguage | null = null
    for (const line of body.split(/\r?\n/)) {
        const match = SECTION_HEADING.exec(line.trim())
        if (match) {
            current = LANGUAGE_OF[match[1].toLowerCase()]
            if (!sections.has(current)) sections.set(current, [])
        } else {
            // Text before the first language heading is not part of any language (it is dropped when sections exist)
            sections.get(current as NotesLanguage)?.push(line)
        }
    }
    if (sections.size === 0) return body.trim()
    const text = (lang: NotesLanguage) => (sections.get(lang) ?? []).join("\n").trim()
    return text(language) || text("en") || text("it")
}

/**
 * The notes of one version in a changelog written like CHANGELOG.md: the lines under its "## [version]" heading, up to the
 * next "## " heading.
 * @param changelog The text of the changelog.
 * @param version The version, as the app reports it (for example "0.19.0").
 * @returns The notes of the version, or an empty string when the changelog has no section for it.
 * @category Updater
 */
export function extractVersionNotes(changelog: string, version: string): string {
    const lines: string[] = []
    let inside = false
    for (const line of changelog.split(/\r?\n/)) {
        if (/^##\s/.test(line)) {
            if (inside) break
            inside = /^##\s+\[([^\]]+)\]/.exec(line)?.[1] === version
            continue
        }
        if (inside) lines.push(line)
    }
    return lines.join("\n").trim()
}

/**
 * The notes of a version that come with the app (the bundled CHANGELOG.md and CHANGELOG.it.md), in the given language.
 * The changelog is loaded on demand, so it is not part of the first bundle.
 * @param version The version of the app.
 * @param language The language of the app.
 * @returns The notes, or an empty string when the changelog has no section for the version.
 * @category Updater
 */
export async function getBundledReleaseNotes(version: string, language: NotesLanguage): Promise<string> {
    const changelog = language === "it"
        ? (await import("../../CHANGELOG.it.md?raw")).default
        : (await import("../../CHANGELOG.md?raw")).default
    return extractVersionNotes(changelog, version)
}
