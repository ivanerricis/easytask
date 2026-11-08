import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Copy, Download, FileUp, Pencil, Plus, TextCursorInput, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/dialogs/dialog-confirm"
import { InlineNameInput } from "@/components/inline-name-input"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/use-theme"
import { describeThemeImport, exportTheme, importThemes, themeDisplayName } from "@/lib/theme-transfer"
import { MAX_CUSTOM_THEMES, MAX_THEME_NAME_LENGTH, type ThemeDefinition } from "@/lib/themes/types"
import { newCustomThemeId, uniqueThemeName } from "@/lib/themes/validate"
import { getErrorMessage } from "@/lib/utils"
import { SettingsCard } from "./SettingsRow"
import { ThemeEditorDialog } from "./ThemeEditorDialog"
import { ThemePreview } from "./ThemePreview"

type RowActionProps = { label: string, name: string, onClick: () => void, disabled?: boolean, children: ReactNode }

/** An icon button of a theme row: its accessible name says which theme it acts on. */
const RowAction = ({ label, name, onClick, disabled, children }: RowActionProps) => (
    <TooltipCustom text={label}>
        <Button type="button" variant="ghost" size="icon" aria-label={`${label}: ${name}`} onClick={onClick} disabled={disabled}>
            {children}
        </Button>
    </TooltipCustom>
)

type ThemeRowProps = {
    theme: ThemeDefinition
    active: boolean
    atLimit: boolean
    renaming: boolean
    onEdit: () => void
    onStartRename: () => void
    onRename: (name: string | null) => void
    onDuplicate: () => void
    onExport: () => void
    onDelete: () => void
}

const ThemeRow = ({ theme, active, atLimit, renaming, onEdit, onStartRename, onRename, onDuplicate, onExport, onDelete }: ThemeRowProps) => {
    const { t } = useTranslation()
    const name = themeDisplayName(theme)
    const [value, setValue] = useState(name)

    return (
        <li className="flex flex-wrap items-center gap-3">
            <ThemePreview theme={theme} size="sm" />
            <div className="flex min-w-32 flex-1 items-center gap-2">
                {renaming ? (
                    <InlineNameInput
                        autoFocus
                        aria-label={`${t("settings.themes.custom.rename")}: ${name}`}
                        value={value}
                        maxLength={MAX_THEME_NAME_LENGTH}
                        error={null}
                        onChange={e => setValue(e.target.value)}
                        onFocus={e => e.target.select()}
                        onBlur={() => onRename(value)}
                        onKeyDown={e => {
                            if (e.key === "Enter") onRename(value)
                            else if (e.key === "Escape") onRename(null)
                        }}
                    />
                ) : (
                    <span className="truncate text-sm">{name}</span>
                )}
                {active && <Badge variant="secondary">{t("settings.themes.gallery.selected")}</Badge>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <RowAction label={t("settings.themes.custom.edit")} name={name} onClick={onEdit}><Pencil /></RowAction>
                <RowAction label={t("settings.themes.custom.rename")} name={name} onClick={() => { setValue(name); onStartRename() }}><TextCursorInput /></RowAction>
                <RowAction label={t("settings.themes.custom.duplicate")} name={name} onClick={onDuplicate} disabled={atLimit}><Copy /></RowAction>
                <RowAction label={t("settings.themes.custom.export")} name={name} onClick={onExport}><Download /></RowAction>
                <RowAction label={t("settings.themes.custom.delete")} name={name} onClick={onDelete}><Trash2 /></RowAction>
            </div>
        </li>
    )
}

/**
 * The "Custom themes" part of Settings > Appearance: the user's themes with edit, rename, duplicate, export and delete, the
 * count against the limit, and the buttons to create a theme or import some files.
 * @category Components
 */
export const CustomThemesSection = () => {
    const { t } = useTranslation()
    const { themes, activeTheme, saveCustomTheme, renameCustomTheme, deleteCustomTheme } = useTheme()
    const custom = themes.filter(theme => !theme.builtin)
    const atLimit = custom.length >= MAX_CUSTOM_THEMES
    // `undefined`: the editor is closed; `null`: it creates a new theme
    const [editing, setEditing] = useState<ThemeDefinition | null | undefined>(undefined)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<ThemeDefinition | null>(null)
    const [importing, setImporting] = useState(false)

    const run = async (action: () => Promise<void>) => {
        try {
            await action()
        } catch (error) {
            toast.error(getErrorMessage(error))
        }
    }

    const handleRename = (theme: ThemeDefinition, name: string | null) => {
        setRenamingId(null)
        const trimmed = name?.trim()
        if (!trimmed || trimmed === theme.name) return
        void run(async () => { await renameCustomTheme(theme.id, trimmed) })
    }

    const handleDuplicate = (theme: ThemeDefinition) => run(async () => {
        const copyName = t("settings.themes.copyName", { name: themeDisplayName(theme) })
        await saveCustomTheme({ ...theme, id: newCustomThemeId(), name: uniqueThemeName(copyName, themes.map(other => themeDisplayName(other))), builtin: false })
    })

    const handleExport = (theme: ThemeDefinition) => run(async () => {
        if (await exportTheme(theme)) toast.success(t("errors.themes.exported"))
    })

    const handleImport = async () => {
        setImporting(true)
        await run(async () => {
            const summary = await importThemes(themes, saveCustomTheme)
            if (!summary) return
            const { text, error } = describeThemeImport(summary)
            if (error) toast.error(text)
            else toast.success(text)
        })
        setImporting(false)
    }

    return (
        <section aria-label={t("settings.themes.custom.title")} className="flex flex-col gap-2">
            <SettingsCard>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-48 flex-1">
                        <h4 className="text-sm font-semibold">{t("settings.themes.custom.title")}</h4>
                        <p className="text-xs text-muted-foreground">{t("settings.themes.custom.description")}</p>
                        <p className="text-xs text-muted-foreground">{t("settings.themes.custom.count", { count: custom.length, max: MAX_CUSTOM_THEMES })}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)} disabled={atLimit}>
                            <Plus />{t("settings.themes.custom.new")}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleImport()} disabled={atLimit || importing}>
                            <FileUp />{t("settings.themes.custom.import")}
                        </Button>
                    </div>
                </div>
                {custom.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("settings.themes.custom.empty")}</p>
                ) : (
                    <ul className="flex flex-col divide-y !p-0 [&>li]:px-4 [&>li]:py-3">
                        {custom.map(theme => (
                            <ThemeRow
                                key={theme.id}
                                theme={theme}
                                active={theme.id === activeTheme.id}
                                atLimit={atLimit}
                                renaming={renamingId === theme.id}
                                onEdit={() => setEditing(theme)}
                                onStartRename={() => setRenamingId(theme.id)}
                                onRename={name => handleRename(theme, name)}
                                onDuplicate={() => void handleDuplicate(theme)}
                                onExport={() => void handleExport(theme)}
                                onDelete={() => setDeleting(theme)}
                            />
                        ))}
                    </ul>
                )}
            </SettingsCard>
            <ThemeEditorDialog open={editing !== undefined} onOpenChange={open => { if (!open) setEditing(undefined) }} theme={editing ?? null} />
            {deleting && (
                <ConfirmDialog
                    open
                    onOpenChange={open => { if (!open) setDeleting(null) }}
                    destructive
                    initialFocus="cancel"
                    title={t("settings.themes.custom.deleteTitle", { name: themeDisplayName(deleting) })}
                    description={t("settings.themes.custom.deleteDescription")}
                    confirm={{
                        label: t("settings.themes.custom.deleteConfirm"),
                        icon: Trash2,
                        onClick: () => run(async () => {
                            await deleteCustomTheme(deleting.id)
                            toast.success(t("errors.themes.deleted"))
                        }),
                    }}
                />
            )}
        </section>
    )
}
