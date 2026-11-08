import { Fragment, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
    Archive, ArrowLeft, ArrowRight, ArrowRightLeft, BookOpen, CircleX, Columns2, EyeOff, FileDown, FilePlus, FileText, FolderPlus, House, Info, Keyboard, LayoutTemplate,
    LogOut, PanelLeft, PanelRight, Palette, Plus, Redo2, Rows3, ScrollText, Search, Settings, SunMoon, Trash2, Undo2, X, type LucideIcon,
} from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarRadioGroup,
    MenubarRadioItem,
    MenubarSeparator,
    MenubarShortcut,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarTrigger,
} from "@/components/ui/menubar"
import { isDialogOpen } from "@/components/dialog-open"
import { builtinThemeGroups, isTheme, themeIcon, themeLabel } from "@/components/theme-options"
import { useTheme } from "@/components/use-theme"
import { useShortcutKeys, useShortcutsContext } from "@/contexts/use-shortcuts"
import { requestAppCommand, useIsAppCommandActive, type AppCommand } from "@/lib/app-commands"
import { OPEN_SETTINGS_EVENT, openReleasesPage, requestOpenSettings } from "@/lib/updater"
import { reportError } from "@/lib/report-error"
import { openDocs } from "@/lib/docs"
import { useShortcut } from "@/hooks/use-shortcut"
import { usePreferences } from "@/contexts/use-preferences"
import { DEFAULT_TEXT_ZOOM } from "@/lib/store/preferences"
import { stepTextZoom } from "@/lib/text-zoom"

type AppMenuProps = {
    // The home page has no notes: only the entries that make sense there are shown
    page: "home" | "workspace"
}

// The action runs once the menu has closed and given the focus back, so a dialog it opens keeps the focus
const afterClose = (action: () => void) => { window.setTimeout(action, 0) }

// The radio items of the theme have no icon styling of their own: same size and color as the other entries
const RADIO_ICON = "size-4 shrink-0 text-muted-foreground"

/** An entry that runs a shortcut: it shows the effective binding and is disabled while no handler is active. */
const ShortcutItem = ({ id, label, icon: Icon }: { id: string, label: string, icon: LucideIcon }) => {
    const { trigger, isActive } = useShortcutsContext()
    const keys = useShortcutKeys(id)
    return (
        <MenubarItem disabled={!isActive(id)} onSelect={() => afterClose(() => { trigger(id) })}>
            <Icon />
            {label}
            {keys.length > 0 && <MenubarShortcut>{keys.join("+")}</MenubarShortcut>}
        </MenubarItem>
    )
}

/** An entry that runs an app command: it is disabled while no component is listening to it. */
const CommandItem = ({ command, label, icon: Icon }: { command: AppCommand, label: string, icon: LucideIcon }) => {
    const active = useIsAppCommandActive(command)
    return <MenubarItem disabled={!active} onSelect={() => afterClose(() => requestAppCommand(command))}><Icon />{label}</MenubarItem>
}

const ActionItem = ({ action, label, icon: Icon }: { action: () => void, label: string, icon: LucideIcon }) => (
    <MenubarItem onSelect={() => afterClose(action)}><Icon />{label}</MenubarItem>
)

/**
 * Text menu of the title bar (File, Edit, View, Help), like the desktop programs. Alt alone or F10 moves the focus to it.
 * @category Layout
 */
export const AppMenu = ({ page }: AppMenuProps) => {
    const { t, i18n } = useTranslation()
    const { theme, themes, setTheme } = useTheme()
    const themeGroups = builtinThemeGroups(themes)
    const customThemes = themes.filter(item => !item.builtin)
    const rootRef = useRef<HTMLDivElement>(null)

    // Alt pressed and released alone (or F10) focuses the first menu, and gives the focus back when pressed again
    useEffect(() => {
        let altAlone = false
        let previous: HTMLElement | null = null
        const toggleFocus = () => {
            const root = rootRef.current
            if (!root || isDialogOpen()) return
            if (root.contains(document.activeElement)) {
                previous?.focus()
                previous = null
                return
            }
            previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
            root.querySelector<HTMLElement>("[data-slot='menubar-trigger']")?.focus()
        }
        const onKeyDown = (e: KeyboardEvent) => {
            altAlone = e.key === "Alt" && !e.repeat && !e.ctrlKey && !e.shiftKey && !e.metaKey
            if (e.key === "F10" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
                e.preventDefault()
                toggleFocus()
            }
        }
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key !== "Alt" || !altAlone) return
            altAlone = false
            e.preventDefault()
            toggleFocus()
        }
        const reset = () => { altAlone = false }
        window.addEventListener("keydown", onKeyDown)
        window.addEventListener("keyup", onKeyUp)
        window.addEventListener("mousedown", reset)
        window.addEventListener("blur", reset)
        return () => {
            window.removeEventListener("keydown", onKeyDown)
            window.removeEventListener("keyup", onKeyUp)
            window.removeEventListener("mousedown", reset)
            window.removeEventListener("blur", reset)
        }
    }, [])

    // No category (requestOpenSettings needs one): the settings dialog opens on its first page
    const openSettings = () => { window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: {} })) }
    const exit = () => { getCurrentWindow().close().catch(error => reportError(error)) }
    const releaseNotes = () => { openReleasesPage().catch(error => reportError(error)) }
    const docs = () => { openDocs(i18n.language).catch(error => reportError(error)) }

    useShortcut("open-docs", docs, { allowInInputs: true })

    const { textZoom, setTextZoom } = usePreferences()
    const zoomIn = () => setTextZoom(stepTextZoom(textZoom, 1))
    useShortcut("text-zoom-in", zoomIn, { allowInInputs: true })
    useShortcut("text-zoom-in-alt", zoomIn, { allowInInputs: true })
    useShortcut("text-zoom-out", () => setTextZoom(stepTextZoom(textZoom, -1)), { allowInInputs: true })
    useShortcut("text-zoom-reset", () => setTextZoom(DEFAULT_TEXT_ZOOM), { allowInInputs: true })

    return (
        <Menubar ref={rootRef} aria-label={t("appMenu.label")} className="pl-1">
            <MenubarMenu>
                <MenubarTrigger>{t("appMenu.file")}</MenubarTrigger>
                <MenubarContent>
                    {page === "workspace" ? (
                        <>
                            <ShortcutItem id="new-note" icon={FilePlus} label={t("appMenu.newNote")} />
                            <ShortcutItem id="new-folder" icon={FolderPlus} label={t("appMenu.newFolder")} />
                            <ShortcutItem id="new-group" icon={Rows3} label={t("appMenu.newGroup")} />
                            <CommandItem command="note-from-template" icon={FileText} label={t("appMenu.noteFromTemplate")} />
                            <MenubarSeparator />
                            <CommandItem command="open-templates" icon={LayoutTemplate} label={t("appMenu.templates")} />
                            <CommandItem command="open-archive" icon={Archive} label={t("appMenu.archive")} />
                            <CommandItem command="open-trash" icon={Trash2} label={t("appMenu.trash")} />
                            <CommandItem command="export-workspace" icon={FileDown} label={t("appMenu.exportWorkspace")} />
                            <MenubarSeparator />
                            <ShortcutItem id="close-note" icon={X} label={t("appMenu.closeNote")} />
                            <ShortcutItem id="close-all-notes" icon={CircleX} label={t("appMenu.closeAllNotes")} />
                            <MenubarSeparator />
                            <ShortcutItem id="go-home" icon={House} label={t("appMenu.goHome")} />
                        </>
                    ) : (
                        <>
                            <ShortcutItem id="new-workspace" icon={Plus} label={t("appMenu.newWorkspace")} />
                            <CommandItem command="open-workspace-trash" icon={Trash2} label={t("appMenu.trash")} />
                        </>
                    )}
                    <MenubarSeparator />
                    <ActionItem action={openSettings} icon={Settings} label={t("appMenu.settings")} />
                    <MenubarSeparator />
                    <ActionItem action={exit} icon={LogOut} label={t("appMenu.exit")} />
                </MenubarContent>
            </MenubarMenu>

            {page === "workspace" && (
                <MenubarMenu>
                    <MenubarTrigger>{t("appMenu.edit")}</MenubarTrigger>
                    <MenubarContent>
                        <ShortcutItem id="undo" icon={Undo2} label={t("appMenu.undo")} />
                        <ShortcutItem id="redo" icon={Redo2} label={t("appMenu.redo")} />
                        <MenubarSeparator />
                        <ShortcutItem id="search-notes" icon={Search} label={t("appMenu.searchNotes")} />
                        <ShortcutItem id="search-in-note" icon={Search} label={t("appMenu.searchInNote")} />
                    </MenubarContent>
                </MenubarMenu>
            )}

            <MenubarMenu>
                <MenubarTrigger>{t("appMenu.view")}</MenubarTrigger>
                <MenubarContent>
                    {page === "workspace" && (
                        <>
                            <ShortcutItem id="toggle-sidebar" icon={PanelLeft} label={t("appMenu.leftSidebar")} />
                            <ShortcutItem id="toggle-right-sidebar" icon={PanelRight} label={t("appMenu.rightSidebar")} />
                            <ShortcutItem id="toggle-hide-completed" icon={EyeOff} label={t("appMenu.hideCompleted")} />
                            <ShortcutItem id="toggle-split" icon={Columns2} label={t("appMenu.toggleSplit")} />
                            <ShortcutItem id="move-note-to-other-pane" icon={ArrowRightLeft} label={t("appMenu.moveNoteToOtherPane")} />
                            <MenubarSeparator />
                            <ShortcutItem id="next-note" icon={ArrowRight} label={t("appMenu.nextNote")} />
                            <ShortcutItem id="previous-note" icon={ArrowLeft} label={t("appMenu.previousNote")} />
                            <MenubarSeparator />
                        </>
                    )}
                    <MenubarSub>
                        <MenubarSubTrigger><SunMoon />{t("appMenu.theme")}</MenubarSubTrigger>
                        <MenubarSubContent>
                            <MenubarRadioGroup value={theme} onValueChange={value => { if (isTheme(value, themes)) setTheme(value) }}>
                                {[...themeGroups, ...(customThemes.length > 0 ? [customThemes] : [])].map((group, index) => (
                                    <Fragment key={group[0].id}>
                                        {index > 0 && <MenubarSeparator />}
                                        {group.map(item => {
                                            const Icon = themeIcon(item)
                                            return <MenubarRadioItem key={item.id} value={item.id}><Icon className={RADIO_ICON} />{themeLabel(t, item)}</MenubarRadioItem>
                                        })}
                                    </Fragment>
                                ))}
                            </MenubarRadioGroup>
                            <MenubarSeparator />
                            <ActionItem action={() => requestOpenSettings("appearance")} icon={Palette} label={t("appMenu.manageThemes")} />
                        </MenubarSubContent>
                    </MenubarSub>
                </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
                <MenubarTrigger>{t("appMenu.help")}</MenubarTrigger>
                <MenubarContent>
                    <ShortcutItem id="open-docs" icon={BookOpen} label={t("appMenu.docs")} />
                    <ShortcutItem id="show-shortcuts" icon={Keyboard} label={t("appMenu.shortcuts")} />
                    <ActionItem action={releaseNotes} icon={ScrollText} label={t("appMenu.releaseNotes")} />
                    <MenubarSeparator />
                    <ActionItem action={() => requestOpenSettings("about")} icon={Info} label={t("appMenu.about")} />
                </MenubarContent>
            </MenubarMenu>
        </Menubar>
    )
}
