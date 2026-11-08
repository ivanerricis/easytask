import { useId, useMemo, useState, type ChangeEvent } from "react"
import { useTranslation } from "react-i18next"
import { Check, TriangleAlert } from "lucide-react"
import { FormFooter } from "@/components/form-footer"
import { FormError } from "@/components/form-error"
import { useFormSubmit } from "@/components/use-form-submit"
import { useTheme } from "@/components/use-theme"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { themeDisplayName } from "@/lib/theme-transfer"
import { isHex6 } from "@/lib/themes/color"
import { checkThemeContrast, type ThemeColorName } from "@/lib/themes/contrast-checks"
import { MAX_CUSTOM_THEMES, MAX_THEME_NAME_LENGTH, THEME_COLOR_KEYS, type ThemeBase, type ThemeColors, type ThemeDefinition } from "@/lib/themes/types"
import { newCustomThemeId, normalizeThemeName, uniqueThemeName } from "@/lib/themes/validate"
import { createError } from "@/types/error"
import { ThemePreview } from "./ThemePreview"

const COLOR_NAMES: readonly ThemeColorName[] = [...THEME_COLOR_KEYS, "accent"]

const BASE_ITEM_CLASS = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground"

type Draft = { name: string, base: ThemeBase, colors: ThemeColors, accent: string }

/** "#abc123" for what the user typed ("abc123" is accepted too), null when it is not a full hex color. */
const parseTypedHex = (text: string): string | null => {
    const trimmed = text.trim()
    const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
    return isHex6(hex) ? hex.toLowerCase() : null
}

type ColorRowProps = { label: string, pickLabel: string, value: string, onChange: (hex: string) => void }

/** A color: the swatch (which opens the native picker), its name and the hex code, which can be typed. */
const ColorRow = ({ label, pickLabel, value, onChange }: ColorRowProps) => {
    const id = useId()
    // What is typed (may be incomplete); once the color changes from elsewhere (the picker) the field follows the color again
    const [typed, setTyped] = useState<{ text: string, forValue: string } | null>(null)
    const showingTyped = typed !== null && typed.forValue === value
    const text = showingTyped ? typed.text : value
    const invalid = showingTyped && parseTypedHex(typed.text) === null

    const handleText = (e: ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value
        const hex = parseTypedHex(next)
        if (hex && hex !== value) onChange(hex)
        setTyped({ text: next, forValue: hex ?? value })
    }

    return (
        <div className="flex items-center gap-3">
            <div className="relative size-8 shrink-0 overflow-hidden rounded-xs border focus-within:ring-[3px] focus-within:ring-ring" style={{ backgroundColor: value }}>
                <Input type="color" aria-label={pickLabel} className="size-full cursor-pointer border-0 p-0 opacity-0" value={value} onChange={e => onChange(e.target.value.toLowerCase())} />
            </div>
            <Label htmlFor={id} className="min-w-0 flex-1 font-normal">{label}</Label>
            <Input
                id={id}
                value={text}
                onChange={handleText}
                onBlur={() => setTyped(null)}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={invalid || undefined}
                className="h-8 w-24 shrink-0 rounded-xs px-2 font-mono text-xs uppercase md:text-xs"
            />
        </div>
    )
}

const formatRatio = (ratio: number) => (Math.floor(ratio * 10) / 10).toFixed(1)

type EditorFormProps = { theme: ThemeDefinition | null, onClose: () => void }

const EditorForm = ({ theme, onClose }: EditorFormProps) => {
    const { t } = useTranslation()
    const { themes, activeTheme, saveCustomTheme } = useTheme()
    const nameId = useId()

    const [draft, setDraft] = useState<Draft>(() => {
        if (theme) return { name: theme.name, base: theme.base, colors: { ...theme.colors }, accent: theme.accent }
        const name = uniqueThemeName(t("settings.themes.defaultName"), themes.map(other => themeDisplayName(other)))
        return { name, base: activeTheme.base, colors: { ...activeTheme.colors }, accent: activeTheme.accent }
    })

    const definition: ThemeDefinition = useMemo(
        () => ({ id: theme?.id ?? "custom-preview", name: draft.name, base: draft.base, colors: draft.colors, accent: draft.accent, builtin: false }),
        [theme?.id, draft],
    )
    const failures = useMemo(() => checkThemeContrast(definition), [definition])
    const name = normalizeThemeName(draft.name)

    const { busy, error, setError, submit } = useFormSubmit(async () => {
        if (name === null) throw createError("THEME_NAME", t("errors.themes.name", { max: MAX_THEME_NAME_LENGTH }))
        if (!theme && themes.filter(other => !other.builtin).length >= MAX_CUSTOM_THEMES)
            throw createError("THEME_LIMIT", t("errors.themes.limit", { max: MAX_CUSTOM_THEMES }))
        const others = themes.filter(other => other.id !== theme?.id).map(other => themeDisplayName(other))
        await saveCustomTheme({
            id: theme?.id ?? newCustomThemeId(), name: uniqueThemeName(name, others), base: draft.base, colors: draft.colors, accent: draft.accent, builtin: false,
        })
        onClose()
    })

    const setColor = (colorName: ThemeColorName, hex: string) => {
        setError(null)
        setDraft(current => colorName === "accent" ? { ...current, accent: hex } : { ...current, colors: { ...current.colors, [colorName]: hex } })
    }
    const colorLabel = (colorName: ThemeColorName) => t(`settings.themes.colors.${colorName}`)

    return (
        <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
            <div className="grid min-h-0 gap-6 overflow-y-auto p-1 md:grid-cols-2">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={nameId}>{t("settings.themes.editor.name")}</Label>
                        <Input
                            id={nameId}
                            value={draft.name}
                            maxLength={MAX_THEME_NAME_LENGTH}
                            placeholder={t("settings.themes.editor.namePlaceholder")}
                            onChange={e => { setError(null); setDraft(current => ({ ...current, name: e.target.value })) }}
                            aria-invalid={name === null || undefined}
                            readOnly={busy}
                            className="rounded-xs"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label id={`${nameId}-base`}>{t("settings.themes.editor.base")}</Label>
                        <ToggleGroup
                            type="single"
                            variant="outline"
                            size="sm"
                            value={draft.base}
                            onValueChange={next => { if (next === "light" || next === "dark") setDraft(current => ({ ...current, base: next })) }}
                            aria-labelledby={`${nameId}-base`}
                            aria-describedby={`${nameId}-base-description`}
                            className="self-start"
                        >
                            <ToggleGroupItem value="light" className={BASE_ITEM_CLASS}>{t("settings.themes.editor.baseLight")}</ToggleGroupItem>
                            <ToggleGroupItem value="dark" className={BASE_ITEM_CLASS}>{t("settings.themes.editor.baseDark")}</ToggleGroupItem>
                        </ToggleGroup>
                        <p id={`${nameId}-base-description`} className="text-xs text-muted-foreground">{t("settings.themes.editor.baseDescription")}</p>
                    </div>
                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-sm font-medium">{t("settings.themes.editor.colors")}</legend>
                        {COLOR_NAMES.map(colorName => (
                            <ColorRow
                                key={colorName}
                                label={colorLabel(colorName)}
                                pickLabel={t("settings.themes.editor.pickColor", { name: colorLabel(colorName) })}
                                value={colorName === "accent" ? draft.accent : draft.colors[colorName]}
                                onChange={hex => setColor(colorName, hex)}
                            />
                        ))}
                    </fieldset>
                </div>
                <div className="flex flex-col gap-4">
                    <ThemePreview theme={definition} />
                    <section aria-labelledby={`${nameId}-contrast`} className="flex flex-col gap-2">
                        <h4 id={`${nameId}-contrast`} className="text-sm font-medium">{t("settings.themes.editor.contrastTitle")}</h4>
                        {failures.length === 0 ? (
                            <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground"><Check className="size-4 shrink-0" />{t("settings.themes.editor.contrastOk")}</p>
                        ) : (
                            <>
                                <ul role="status" className="flex flex-col gap-1">
                                    {failures.map(failure => (
                                        <li key={`${failure.fg}-${failure.bg}`} className="flex items-start gap-1.5 text-sm text-warning">
                                            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                                            <span>{t("settings.themes.editor.contrastLow", { fg: colorLabel(failure.fg), bg: colorLabel(failure.bg), ratio: formatRatio(failure.ratio), min: failure.min })}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-muted-foreground">{t("settings.themes.editor.saveAnyway")}</p>
                            </>
                        )}
                    </section>
                </div>
            </div>
            <FormError>{error}</FormError>
            <FormFooter onCancel={onClose} disabled={busy || name === null}>
                <Check />
                {t("settings.themes.editor.save")}
            </FormFooter>
        </form>
    )
}

type ThemeEditorDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The custom theme to edit; null creates a new one, starting from a copy of the theme in use. */
    theme: ThemeDefinition | null
}

/**
 * Editor of a custom theme: name, base (light/dark), the 11 colors with a live preview and the contrast checks (they only warn:
 * the theme can be saved anyway). The form is mounted only while the dialog is open, so it always starts from the theme.
 * @category Dialogs
 */
export const ThemeEditorDialog = ({ open, onOpenChange, theme }: ThemeEditorDialogProps) => {
    const { t } = useTranslation()
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl" onClick={e => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>{theme ? t("settings.themes.editor.title") : t("settings.themes.editor.newTitle")}</DialogTitle>
                    <DialogDescription className="sr-only">{t("settings.themes.custom.description")}</DialogDescription>
                </DialogHeader>
                <EditorForm theme={theme} onClose={() => onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    )
}
