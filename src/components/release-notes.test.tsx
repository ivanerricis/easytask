import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import i18n from "@/i18n"
import { ReleaseNotes } from "./release-notes"

const openUrl = vi.fn().mockResolvedValue(undefined)
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (...a: unknown[]) => openUrl(...a) }))
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }))
vi.mock("@/db/appPaths", () => ({ isPortable: vi.fn() }))

const body = [
    "## English",
    "",
    "### Added",
    "",
    "- Hide completed tasks (`Ctrl+Shift+H`).",
    "- Duplicate notes.",
    "",
    "## Italiano",
    "",
    "### Aggiunto",
    "",
    "- Nascondi i task completati (`Ctrl+Shift+H`).",
    "- Duplica le note.",
].join("\n")

afterEach(async () => { await act(() => i18n.changeLanguage("it")) })

describe("ReleaseNotes", () => {
    it("shows the notes in Italian when the app is in Italian", async () => {
        await act(() => i18n.changeLanguage("it"))
        render(<ReleaseNotes body={body} />)
        expect(screen.getByText("Aggiunto")).toBeInTheDocument()
        expect(screen.getByText("Duplica le note.")).toBeInTheDocument()
        expect(screen.queryByText("Duplicate notes.")).not.toBeInTheDocument()
    })

    it("shows the notes in English when the app is in English", async () => {
        await act(() => i18n.changeLanguage("en"))
        render(<ReleaseNotes body={body} />)
        expect(screen.getByText("Added")).toBeInTheDocument()
        expect(screen.getByText("Duplicate notes.")).toBeInTheDocument()
        expect(screen.queryByText("Duplica le note.")).not.toBeInTheDocument()
    })

    it("follows a change of language while it is shown", async () => {
        await act(() => i18n.changeLanguage("it"))
        render(<ReleaseNotes body={body} />)
        expect(screen.getByText("Duplica le note.")).toBeInTheDocument()
        await act(() => i18n.changeLanguage("en"))
        expect(screen.getByText("Duplicate notes.")).toBeInTheDocument()
    })

    it("renders headings, bullets and code, with no trace of the language headings", async () => {
        await act(() => i18n.changeLanguage("en"))
        const { container } = render(<ReleaseNotes body={body} />)
        expect(screen.getAllByRole("listitem")).toHaveLength(2)
        expect(screen.getByText("Ctrl+Shift+H").tagName).toBe("CODE")
        expect(container).not.toHaveTextContent("Italiano")
        expect(container).not.toHaveTextContent("English")
    })

    it("renders bold, italic and snake_case words", async () => {
        await act(() => i18n.changeLanguage("en"))
        const { container } = render(<ReleaseNotes body={"A **strong** and *slanted* and _also_ foo_bar_baz."} />)
        expect(screen.getByText("strong").tagName).toBe("STRONG")
        expect(screen.getByText("slanted").tagName).toBe("EM")
        expect(screen.getByText("also").tagName).toBe("EM")
        expect(container).toHaveTextContent("foo_bar_baz.")
    })

    it("opens links with the opener, never in the webview", async () => {
        await act(() => i18n.changeLanguage("en"))
        openUrl.mockClear()
        render(<ReleaseNotes body={"See [the docs](https://example.com/docs) now"} />)
        const link = screen.getByRole("link", { name: "the docs" })
        expect(fireEvent.click(link)).toBe(false) // default prevented
        expect(openUrl).toHaveBeenCalledWith("https://example.com/docs")
    })

    it("nests indented bullets and spaces the headings", async () => {
        await act(() => i18n.changeLanguage("en"))
        render(<ReleaseNotes body={"### One\n\n- Parent\n  - Child\n- Other\n\n### Two"} />)
        expect(screen.getAllByRole("list")).toHaveLength(2)
        expect(screen.getAllByRole("listitem")).toHaveLength(3)
        expect(screen.getByText("One")).not.toHaveClass("mt-2")
        expect(screen.getByText("Two")).toHaveClass("mt-2")
    })

    it("shows an older release, written in one language only, to everybody", async () => {
        await act(() => i18n.changeLanguage("it"))
        render(<ReleaseNotes body={"### Added\n\n- Hide completed tasks.\n"} />)
        expect(screen.getByText("Hide completed tasks.")).toBeInTheDocument()
    })

    it("colors the section labels with the theme tokens, without fixed palette colors", async () => {
        await act(() => i18n.changeLanguage("en"))
        render(<ReleaseNotes body={body} variant="page" />)
        const cls = screen.getByRole("heading", { name: "Added" }).querySelector("span")?.className ?? ""
        expect(cls).toContain("bg-success/15")
        expect(cls).toContain("text-success")
        expect(cls).not.toMatch(/emerald|sky|amber|rose|violet|dark:/)
    })
})
