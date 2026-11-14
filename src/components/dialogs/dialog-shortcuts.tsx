import { useState } from "react"
import { lazyNamed, preloadWhenIdle } from "@/lib/lazy-preload"
import { useShortcut } from "@/hooks/use-shortcut"
import { LazyMount } from "@/components/lazy-mount"

const DialogShortcutsContent = lazyNamed(() => import("./dialog-shortcuts-content"), "DialogShortcutsContent")
preloadWhenIdle(DialogShortcutsContent)

// The shortcut listener stays in the main bundle; the dialog markup is fetched the first time it opens
export const DialogShortcuts = () => {
    const [open, setOpen] = useState(false)

    useShortcut("show-shortcuts", () => setOpen(true))

    return (
        <LazyMount active={open}>
            <DialogShortcutsContent open={open} onOpenChange={setOpen} />
        </LazyMount>
    )
}
