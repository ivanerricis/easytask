import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Update } from "@tauri-apps/plugin-updater"
import { useUpdateInstall } from "./use-update-install"

const relaunch = vi.fn()
const reportError = vi.fn()

vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunch() }))
vi.mock("@/lib/report-error", () => ({ reportError: (...a: unknown[]) => reportError(...a), resetReportErrorDedupe: () => undefined }))

const failing = (message: string) => ({ downloadAndInstall: vi.fn().mockRejectedValue(new Error(message)) }) as unknown as Update

beforeEach(() => {
    relaunch.mockReset().mockResolvedValue(undefined)
    reportError.mockReset()
})

describe("useUpdateInstall", () => {
    it("keeps the error as it is for a failure that is not the network", async () => {
        const { result } = renderHook(() => useUpdateInstall())
        await act(async () => { await result.current.install(failing("boom")) })
        expect(result.current.error).toBe("Impossibile installare l'aggiornamento: boom")
        expect(result.current.errorDetail).toBeNull()
    })

    it("gives a plain sentence and the technical detail when there is no connection", async () => {
        const technical = "error sending request for url (https://github.com/x/app.exe)"
        const { result } = renderHook(() => useUpdateInstall())
        await act(async () => { await result.current.install(failing(technical)) })
        expect(result.current.error).toBe("Nessuna connessione a internet: riprova quando sei online.")
        expect(result.current.errorDetail).toBe(technical)
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), "Nessuna connessione a internet: riprova quando sei online.")
    })

    it("clears the error when a new install starts", async () => {
        const { result } = renderHook(() => useUpdateInstall())
        await act(async () => { await result.current.install(failing("error sending request")) })
        const ok = { downloadAndInstall: vi.fn().mockResolvedValue(undefined) } as unknown as Update
        await act(async () => { await result.current.install(ok) })
        expect(result.current.error).toBeNull()
        expect(result.current.errorDetail).toBeNull()
    })
})
