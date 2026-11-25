import { describe, expect, it, vi } from "vitest"
import { createTabUiStore } from "./tab-ui-store"

describe("page mode of the tab UI store", () => {
    it("starts on the text, changes per page, tells the listeners only when it changes, and is dropped with a closed tab", () => {
        const store = createTabUiStore()
        const listener = vi.fn()
        store.subscribe(listener)
        expect(store.getPageMode(1)).toBe("edit")
        store.setPageMode(1, "edit")
        expect(listener).not.toHaveBeenCalled()
        store.setPageMode(1, "preview")
        expect(store.getPageMode(1)).toBe("preview")
        expect(store.getPageMode(2)).toBe("edit")
        expect(listener).toHaveBeenCalledTimes(1)
        store.setPageMode(1, "edit")
        expect(store.getPageMode(1)).toBe("edit")
        store.setPageMode(3, "preview")
        store.retain([1])
        expect(store.getPageMode(3)).toBe("edit")
    })
})
