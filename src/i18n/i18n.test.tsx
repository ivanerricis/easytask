import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import i18n, { applyLanguagePreference, getSystemLanguage, initI18n, languageFromLocale, resolveLanguage } from "@/i18n"
import { it as itLocale } from "./locales/it"
import { en as enLocale } from "./locales/en"
import { DialogSettings } from "@/components/dialogs/dialog-settings"
import { PreferencesProvider } from "@/contexts/preferences-context"
import { getLanguage } from "@/lib/store/preferences"

vi.mock("@/components/mode-toggle", () => ({ ModeToggle: () => <div>mode-toggle</div> }))

type Tree = { [key: string]: string | Tree }

const flatten = (tree: Tree, prefix = ""): Record<string, string> =>
    Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof value === "string") acc[path] = value
        else Object.assign(acc, flatten(value, path))
        return acc
    }, {})

const placeholders = (value: string) => [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(match => match[1]).sort()

const mockSystemLanguage = (language: string) =>
    vi.spyOn(window.navigator, "language", "get").mockReturnValue(language)

afterEach(async () => {
    mockSystemLanguage("it-IT")
    await applyLanguagePreference("it")
})

describe("locale files", () => {
    const itFlat = flatten(itLocale)
    const enFlat = flatten(enLocale)

    it("have exactly the same keys", () => {
        expect(Object.keys(enFlat).sort()).toEqual(Object.keys(itFlat).sort())
    })

    it("have no empty translation", () => {
        for (const [key, value] of Object.entries(itFlat)) expect(value.trim(), `it.${key}`).not.toBe("")
        for (const [key, value] of Object.entries(enFlat)) expect(value.trim(), `en.${key}`).not.toBe("")
    })

    it("use the same interpolation placeholders", () => {
        for (const key of Object.keys(itFlat)) expect(placeholders(enFlat[key]), key).toEqual(placeholders(itFlat[key]))
    })
})

describe("system language detection", () => {
    it("maps it* locales to Italian and everything else to English", () => {
        expect(languageFromLocale("it")).toBe("it")
        expect(languageFromLocale("it-IT")).toBe("it")
        expect(languageFromLocale("IT-ch")).toBe("it")
        expect(languageFromLocale("en-US")).toBe("en")
        expect(languageFromLocale("fr-FR")).toBe("en")
        expect(languageFromLocale("")).toBe("en")
        expect(languageFromLocale(undefined)).toBe("en")
    })

    it("follows navigator.language for the \"system\" preference", () => {
        mockSystemLanguage("it-IT")
        expect(getSystemLanguage()).toBe("it")
        expect(resolveLanguage("system")).toBe("it")
        mockSystemLanguage("de-DE")
        expect(resolveLanguage("system")).toBe("en")
    })

    it("explicit preferences win over the system language", () => {
        mockSystemLanguage("it-IT")
        expect(resolveLanguage("en")).toBe("en")
        mockSystemLanguage("en-GB")
        expect(resolveLanguage("it")).toBe("it")
    })

    it("applies the system language and the document lang attribute", async () => {
        mockSystemLanguage("en-US")
        await applyLanguagePreference("system")
        expect(i18n.language).toBe("en")
        expect(document.documentElement.lang).toBe("en")
        expect(i18n.t("common.cancel")).toBe("Cancel")

        mockSystemLanguage("it-IT")
        await applyLanguagePreference("system")
        expect(i18n.language).toBe("it")
        expect(document.documentElement.lang).toBe("it")
        expect(i18n.t("common.cancel")).toBe("Annulla")
    })

    it("initI18n on an initialized instance only switches the language", async () => {
        initI18n("en")
        await waitFor(() => expect(i18n.language).toBe("en"))
    })
})

describe("language setting", () => {
    const renderSettings = async () => {
        const user = userEvent.setup()
        render(<PreferencesProvider><DialogSettings /></PreferencesProvider>)
        await user.click(screen.getByRole("button", { name: "Impostazioni" }))
        // The dialog content is a lazy chunk
        await screen.findByRole("dialog", {}, { timeout: 5000 })
        return user
    }

    it("offers System, Italiano and English and starts on System", async () => {
        const user = await renderSettings()
        const select = await screen.findByRole("combobox", { name: "Lingua" })
        await waitFor(() => expect(select).toHaveTextContent("Sistema"))
        await user.click(select)
        expect(await screen.findByRole("option", { name: "Sistema" })).toBeInTheDocument()
        expect(screen.getByRole("option", { name: "Italiano" })).toBeInTheDocument()
        expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument()
    })

    it("switches the UI immediately and persists the choice", async () => {
        const user = await renderSettings()
        await user.click(await screen.findByRole("combobox", { name: "Lingua" }))
        await user.click(await screen.findByRole("option", { name: "English" }))

        // Dialog title, nav and panel are re-rendered in English without a restart
        expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument()
        expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent("English")
        expect(screen.getByRole("tab", { name: "Notes and sections" })).toBeInTheDocument()
        expect(document.documentElement.lang).toBe("en")
        expect(await getLanguage()).toBe("en")

        await user.click(screen.getByRole("combobox", { name: "Language" }))
        await user.click(await screen.findByRole("option", { name: "Italiano" }))
        expect(await screen.findByRole("heading", { name: "Aspetto" })).toBeInTheDocument()
        expect(document.documentElement.lang).toBe("it")
        expect(await getLanguage()).toBe("it")
    })

    it("restores the persisted language when the app starts", async () => {
        const { savePref } = await import("@/lib/store/preferences")
        await savePref("language", "en")
        render(<PreferencesProvider><DialogSettings /></PreferencesProvider>)
        await waitFor(() => expect(i18n.language).toBe("en"))
        expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
    })
})
