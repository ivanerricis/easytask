import { lazyNamed, preloadWhenIdle } from "@/lib/lazy-preload"

/** The automations dialog of a section or a group, loaded on demand (and preloaded once the app is idle). */
export const LazyDialogAutomations = lazyNamed(() => import("@/components/dialogs/dialog-automations"), "DialogAutomations")
preloadWhenIdle(LazyDialogAutomations)
