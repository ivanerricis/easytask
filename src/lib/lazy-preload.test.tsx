import { Suspense } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { lazyNamed, lazyWithPreload } from "./lazy-preload"

const Hello = ({ name }: { name: string }) => <p>Ciao {name}</p>

describe("lazyWithPreload", () => {
    it("loads the module once, whether it is preloaded or rendered", async () => {
        const load = vi.fn(async () => ({ default: Hello }))
        const Lazy = lazyWithPreload(load)
        await Lazy.preload()
        await Lazy.preload()
        render(<Suspense fallback={<p>fallback</p>}><Lazy name="Ada" /></Suspense>)
        expect(load).toHaveBeenCalledTimes(1)
    })

    it("renders a preloaded component at once, without suspending", async () => {
        const Lazy = lazyWithPreload(async () => ({ default: Hello }))
        await Lazy.preload()
        render(<Suspense fallback={<p>fallback</p>}><Lazy name="Ada" /></Suspense>)
        // Synchronously, in the very first render: no fallback
        expect(screen.getByText("Ciao Ada")).toBeInTheDocument()
        expect(screen.queryByText("fallback")).not.toBeInTheDocument()
    })

    it("works like React.lazy when it was not preloaded", async () => {
        const Lazy = lazyWithPreload(async () => ({ default: Hello }))
        render(<Suspense fallback={<p>fallback</p>}><Lazy name="Ada" /></Suspense>)
        expect(screen.getByText("fallback")).toBeInTheDocument()
        expect(await screen.findByText("Ciao Ada")).toBeInTheDocument()
    })

    it("tries again after a failed load", async () => {
        const load = vi.fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValue({ default: Hello })
        const Lazy = lazyWithPreload(load)
        await expect(Lazy.preload()).rejects.toThrow("offline")
        await Lazy.preload()
        expect(load).toHaveBeenCalledTimes(2)
    })
})

describe("lazyNamed", () => {
    it("picks the component by the name of its export", async () => {
        const Lazy = lazyNamed(async () => ({ Hello, other: 1 as never }) as { Hello: typeof Hello }, "Hello")
        render(<Suspense fallback={<p>fallback</p>}><Lazy name="Ada" /></Suspense>)
        expect(await screen.findByText("Ciao Ada")).toBeInTheDocument()
    })
})
