import { lazy, type ComponentType } from "react"

/** How long after startup the preloads run, when the browser has no idle callback. */
const IDLE_FALLBACK_MS = 1500

/** A lazily loaded component that can be loaded ahead of time with `preload()`. */
type PreloadableComponent<C extends ComponentType<never>> = C & {
    preload: () => Promise<unknown>
}

/**
 * Like React.lazy, but once its code is loaded (by `preload()` or by a first render) the component renders directly,
 * without suspending. React.lazy suspends on its first render even when the module is already there, and React holds back
 * content revealed after a suspension for about 300ms: a dialog opened for the first time appeared ~400ms after the click.
 * @param load Loads the module and returns the component as `default`.
 * @category Utils
 */
export function lazyWithPreload<C extends ComponentType<never>>(load: () => Promise<{ default: C }>): PreloadableComponent<C> {
    let loaded: C | undefined
    let pending: Promise<{ default: C }> | undefined
    const preload = () => {
        pending ??= load().then(module => {
            loaded = module.default
            return module
        }, error => {
            pending = undefined // a failed load is tried again on the next use
            throw error
        })
        return pending
    }
    const Lazy = lazy(preload as unknown as () => Promise<{ default: ComponentType<object> }>)
    const Preloadable = (props: object) => {
        const Component = (loaded ?? Lazy) as unknown as ComponentType<object>
        return <Component {...props} />
    }
    return Object.assign(Preloadable, { preload }) as unknown as PreloadableComponent<C>
}

/**
 * Loads the given components once the app is idle (after startup), so that their first use is immediate.
 * Skipped in the unit tests. A failed preload is only retried on use.
 * @category Utils
 */
export function preloadWhenIdle(...components: { preload: () => Promise<unknown> }[]): void {
    if (typeof window === "undefined" || import.meta.env.MODE === "test") return
    const run = () => { for (const component of components) component.preload().catch(() => undefined) }
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run)
    else setTimeout(run, IDLE_FALLBACK_MS)
}

/**
 * `lazyWithPreload` for a module that exports the component by name: `lazyNamed(() => import("./dialog"), "Dialog")`.
 * @category Utils
 */
export function lazyNamed<M extends Record<K, ComponentType<never>>, K extends keyof M>(load: () => Promise<M>, name: K): PreloadableComponent<M[K]> {
    return lazyWithPreload(() => load().then(module => ({ default: module[name] })))
}
