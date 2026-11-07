import { describe, expect, it } from "vitest"
import { extractVersionNotes, getBundledReleaseNotes } from "./release-notes"

const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "- Not released yet.",
    "",
    "## [0.2.0] - 2026-01-02",
    "",
    "### Added",
    "",
    "- Second.",
    "",
    "### Fixed",
    "",
    "- A bug.",
    "",
    "## [0.1.0] - 2026-01-01",
    "",
    "- First.",
].join("\n")

describe("extractVersionNotes", () => {
    it("gives the section of the version, from its heading to the next release", () => {
        expect(extractVersionNotes(changelog, "0.2.0")).toBe("### Added\n\n- Second.\n\n### Fixed\n\n- A bug.")
        expect(extractVersionNotes(changelog, "0.1.0")).toBe("- First.")
    })

    it("works with Windows line endings", () => {
        expect(extractVersionNotes(changelog.replace(/\n/g, "\r\n"), "0.1.0")).toBe("- First.")
    })

    it("is empty when the version has no section", () => {
        expect(extractVersionNotes(changelog, "9.9.9")).toBe("")
        expect(extractVersionNotes("", "0.1.0")).toBe("")
    })

    it("does not match a version that only starts like the asked one", () => {
        expect(extractVersionNotes(changelog, "0.2")).toBe("")
    })
})

describe("getBundledReleaseNotes", () => {
    it("reads the bundled changelog of the language", async () => {
        expect(await getBundledReleaseNotes("0.17.0", "en")).toContain("Text size")
        expect(await getBundledReleaseNotes("0.17.0", "it")).toContain("Dimensione del testo")
    })

    it("is empty for a version that is not in the changelog", async () => {
        expect(await getBundledReleaseNotes("0.0.1", "en")).toBe("")
    })
})
