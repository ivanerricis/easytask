import { effectiveAccent } from "./builtin"
import { textColorOn } from "./color"
import { themeStylesheet } from "./css"
import type { ThemeDefinition } from "./types"

export const THEME_STYLE_ID = "easytask-theme"

const isPlain = (def: ThemeDefinition) => def.builtin && (def.id === "light" || def.id === "dark")

/**
 * Applies a theme to the page: the `light`/`dark` class of the root and, for the themes other than the plain light and dark
 * (which live in index.css), `data-theme` plus a single `<style id="easytask-theme">`. For light and dark the attribute and
 * the style are removed; an accent override is then set inline on the root (`--ring` follows `--primary` in index.css).
 * @param accentOverride The accent chosen apart from the theme (null: the one of the theme).
 */
export function applyTheme(def: ThemeDefinition, root: HTMLElement = document.documentElement, accentOverride: string | null = null): void {
    const doc = root.ownerDocument
    root.classList.toggle("dark", def.base === "dark")
    root.classList.toggle("light", def.base === "light")
    const existing = doc.getElementById("easytask-theme")
    root.style.removeProperty("--primary")
    root.style.removeProperty("--primary-foreground")
    if (isPlain(def)) {
        root.removeAttribute("data-theme")
        existing?.remove()
        if (accentOverride) {
            const accent = effectiveAccent(def, accentOverride)
            root.style.setProperty("--primary", accent)
            root.style.setProperty("--primary-foreground", textColorOn(accent))
        }
        return
    }
    const style = existing ?? doc.createElement("style")
    style.id = THEME_STYLE_ID
    style.textContent = themeStylesheet(def, accentOverride)
    if (!existing) doc.head.appendChild(style)
    root.setAttribute("data-theme", def.id)
}
