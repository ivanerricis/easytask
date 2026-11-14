import { act, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { AskIncludeFiles } from "@/lib/workspace-transfer"
import { ExportFilesProvider, useAskIncludeFiles } from "./export-files-context"

/** Renders the hook inside the provider and returns the question function (a stable reference). */
const renderProvider = (): AskIncludeFiles => renderHook(() => useAskIncludeFiles(), { wrapper: ExportFilesProvider }).result.current!

describe("ExportFilesProvider", () => {
    it("is not available outside the provider (the export then keeps only the paths)", () => {
        expect(renderHook(() => useAskIncludeFiles()).result.current).toBeUndefined()
    })

    it("asks with the number and the size of the files, and answers yes", async () => {
        const ask = renderProvider()
        let answer: Promise<boolean | null> | undefined
        act(() => { answer = ask({ bytes: 1.4 * 1024 ** 3, count: 3, missing: 0 }) })
        expect(await screen.findByText(/audio, immagini e video/)).toBeInTheDocument()
        expect(screen.getByText(/3 file, circa 1,4 GB/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Includi i file" }))
        await expect(answer).resolves.toBe(true)
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("answers no with 'Solo i percorsi'", async () => {
        const ask = renderProvider()
        let answer: Promise<boolean | null> | undefined
        act(() => { answer = ask({ bytes: 10, count: 1, missing: 0 }) })
        await userEvent.click(await screen.findByRole("button", { name: "Solo i percorsi" }))
        await expect(answer).resolves.toBe(false)
    })

    it("answers null (cancel the export) with Annulla and with Escape", async () => {
        const ask = renderProvider()
        let answer: Promise<boolean | null> | undefined
        act(() => { answer = ask({ bytes: 10, count: 1, missing: 0 }) })
        await userEvent.click(await screen.findByRole("button", { name: "Annulla" }))
        await expect(answer).resolves.toBeNull()

        act(() => { answer = ask({ bytes: 10, count: 1, missing: 0 }) })
        await screen.findByRole("dialog")
        await userEvent.keyboard("{Escape}")
        await expect(answer).resolves.toBeNull()
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
})
