import type { AnimationSpeed } from "@/lib/store/preferences"

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

/** The speed that "system" stands for: none when the operating system asks for reduced motion, normal otherwise. */
export const resolveAnimationSpeed = (speed: AnimationSpeed, reducedMotion: boolean): Exclude<AnimationSpeed, "system"> =>
    speed !== "system" ? speed : reducedMotion ? "none" : "normal"

/**
 * Applies the speed of the animations to the page: the stylesheet (index.css) reads the `data-motion` attribute of the root
 * element to scale the durations of the transitions and of the animations of the components, or to turn them off.
 * With "system" the attribute follows the operating system (in Windows: Settings > Accessibility > Visual effects > Animation
 * effects, which the webview reports as prefers-reduced-motion) and changes when the user changes it. Returns what stops that.
 */
export const applyAnimationSpeed = (speed: AnimationSpeed, root: HTMLElement = document.documentElement): (() => void) | void => {
    if (speed !== "system" || typeof window.matchMedia !== "function") {
        root.dataset.motion = resolveAnimationSpeed(speed, false)
        return
    }
    const query = window.matchMedia(REDUCED_MOTION)
    const apply = () => { root.dataset.motion = resolveAnimationSpeed(speed, query.matches) }
    apply()
    query.addEventListener("change", apply)
    return () => query.removeEventListener("change", apply)
}

/**
 * How much longer "slow" is than "normal" in the stylesheet (index.css): the transitions go from 90ms (normal) to the 150ms of
 * tailwind (slow, "the original speed").
 */
export const SLOW_MOTION_RATIO = 150 / 90

/**
 * Duration of the live drag shifts (the rows and the tabs stepping aside, the sidebar rows) for the speed of the animations of the app:
 * 0 with "none", `base` with "normal", `base` times the ratio of the stylesheet with "slow". The speed is the one `applyAnimationSpeed`
 * wrote in `data-motion` (already resolved); only without it (not applied yet) "system" is resolved here, from the operating system.
 * The live drag reads it once, when a drag starts: the speed does not change in the middle of it.
 */
export const shiftDurationMs = (base = 150, root: HTMLElement = document.documentElement): number => {
    const set = root.dataset.motion
    const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches
    const speed = set === "none" || set === "normal" || set === "slow" ? set : resolveAnimationSpeed("system", reduced)
    return speed === "none" ? 0 : speed === "slow" ? Math.round(base * SLOW_MOTION_RATIO) : base
}
