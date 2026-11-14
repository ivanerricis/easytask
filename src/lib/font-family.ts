import { reportError } from "@/lib/report-error"
import type { FontFamily } from "@/lib/store/preferences"

/** The stylesheets of the bundled fonts, loaded only when the font is chosen (the system font needs none). */
const LOADERS: Record<Exclude<FontFamily, "system">, () => Promise<unknown>> = {
    inter: () => import("@fontsource-variable/inter/wght.css"),
    lora: () => import("@fontsource-variable/lora/wght.css"),
    "jetbrains-mono": () => import("@fontsource-variable/jetbrains-mono/wght.css"),
    atkinson: () => import("@fontsource-variable/atkinson-hyperlegible-next/wght.css"),
    // Our own @font-face rules: woff2 only (the package stylesheets also ship the .woff files)
    opendyslexic: () => import("./opendyslexic.css"),
}

/**
 * Applies the font of the app: the stylesheet (index.css) reads the `data-font` attribute of the root element to set
 * `--font-sans`. The font files are loaded the first time the font is chosen.
 */
export const applyFontFamily = (font: FontFamily, root: HTMLElement = document.documentElement): void => {
    root.dataset.font = font
    if (font === "system") return
    LOADERS[font]().catch(error => reportError(error))
}
