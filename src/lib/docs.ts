import { openUrl } from "@tauri-apps/plugin-opener"

export const DOCS_URL = "https://ivanerricis.github.io/easytask/"

/** The documentation site in the language of the UI: the Italian pages live under /it/. */
export const docsUrl = (language: string): string => language.startsWith("it") ? `${DOCS_URL}it/` : DOCS_URL

/** Opens the documentation in the browser (the opener permission allows the docs site). */
export const openDocs = (language: string): Promise<void> => openUrl(docsUrl(language))
