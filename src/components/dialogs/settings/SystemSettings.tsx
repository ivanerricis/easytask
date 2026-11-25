import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart"
import { toast } from "sonner"
import { reportError } from "@/lib/report-error"
import { isPortable } from "@/db/appPaths"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { relaunch } from "@tauri-apps/plugin-process"
import {
    getAlwaysOnTop, getCloseToTray, getDueNotifications, saveDueNotifications, getHardwareAcceleration, getRememberWindowState, saveAlwaysOnTop, saveCloseToTray, saveHardwareAcceleration,
    saveRememberWindowState,
} from "@/lib/store/preferences"
import { flushStore } from "@/lib/store/save-soon"
import { notifyCloseToTrayChanged } from "@/lib/tray"
import { getErrorMessage } from "@/lib/utils"
import { SettingsCard, SettingsPanel, SettingsSwitchRow } from "./SettingsRow"
import { useStoredSwitch } from "./use-stored-switch"

const setAutostart = (value: boolean) => value ? enable() : disable()

/** Start with Windows: the state lives in the system (a registry entry on Windows), so it is read from there. */
const AutostartSetting = () => {
    const { t } = useTranslation()
    const { checked, ready, change } = useStoredSwitch(isEnabled, setAutostart, {
        revertOnError: true,
        onError: error => {
            reportError(error)
            toast.error(t("settings.system.autostart.error", { message: getErrorMessage(error) }))
        },
    })

    return (
        <SettingsSwitchRow
            label={t("settings.system.autostart.label")}
            description={t("settings.system.autostart.description")}
            checked={checked}
            // Off until the system has answered, so the switch cannot be flipped on stale data
            disabled={!ready}
            onCheckedChange={value => void change(value)}
        />
    )
}

const saveCloseToTrayAndNotify = async (value: boolean) => {
    notifyCloseToTrayChanged(value)
    await saveCloseToTray(value)
}

const CloseToTraySetting = () => {
    const { t } = useTranslation()
    const { checked, change } = useStoredSwitch(getCloseToTray, saveCloseToTrayAndNotify)

    return (
        <SettingsSwitchRow
            label={t("settings.system.closeToTray.label")}
            description={t("settings.system.closeToTray.description")}
            checked={checked}
            onCheckedChange={value => void change(value)}
        />
    )
}

/** Notifications of the due dates (a task with a time at that time, the others in one summary when the app opens). */
const DueNotificationsSetting = () => {
    const { t } = useTranslation()
    const { checked, change } = useStoredSwitch(getDueNotifications, saveDueNotifications, { initial: true })

    return (
        <SettingsSwitchRow
            label={t("settings.system.dueNotifications.label")}
            description={t("settings.system.dueNotifications.description")}
            checked={checked}
            onCheckedChange={value => void change(value)}
        />
    )
}

/** Keep position and size of the window between runs. Applied by the Rust side at the next start; not available in portable mode. */
const RememberWindowStateSetting = () => {
    const { t } = useTranslation()
    const { checked, change } = useStoredSwitch(getRememberWindowState, saveRememberWindowState, { initial: true })
    const [portable, setPortable] = useState(false)

    useEffect(() => {
        let cancelled = false
        void isPortable().then(value => { if (!cancelled) setPortable(value) }).catch(error => reportError(error))
        return () => { cancelled = true }
    }, [])

    return (
        <SettingsSwitchRow
            label={t("settings.system.rememberWindowState.label")}
            description={t(portable ? "settings.system.rememberWindowState.portable" : "settings.system.rememberWindowState.description")}
            checked={checked && !portable}
            disabled={portable}
            onCheckedChange={value => void change(value)}
        />
    )
}

const applyAlwaysOnTop = async (value: boolean) => {
    await getCurrentWindow().setAlwaysOnTop(value)
    await saveAlwaysOnTop(value)
}

/**
 * Keep the window above the others. Applied to the window at once; the Rust side reads the same saved value at
 * startup (key "alwaysOnTop" in settings.dat) to create the window already on top.
 */
const AlwaysOnTopSetting = () => {
    const { t } = useTranslation()
    const { checked, change } = useStoredSwitch(getAlwaysOnTop, applyAlwaysOnTop, {
        revertOnError: true,
        onError: error => reportError(error, t("settings.system.alwaysOnTop.error", { message: getErrorMessage(error) })),
    })

    return (
        <SettingsSwitchRow
            label={t("settings.system.alwaysOnTop.label")}
            description={t("settings.system.alwaysOnTop.description")}
            checked={checked}
            onCheckedChange={value => void change(value)}
        />
    )
}

/**
 * Use the graphics card to draw the app. The Rust side reads the saved value (key "hardwareAcceleration" in settings.dat)
 * when it creates the webview, so a change applies at the next start: the toast offers to restart now.
 */
const HardwareAccelerationSetting = () => {
    const { t } = useTranslation()
    const restart = async () => {
        try {
            await flushStore()
            await relaunch()
        } catch (error) {
            reportError(error, t("settings.system.hardwareAcceleration.restartError", { message: getErrorMessage(error) }))
        }
    }

    const { checked, change } = useStoredSwitch(getHardwareAcceleration, async (value: boolean) => {
        await saveHardwareAcceleration(value)
        toast(t("settings.system.hardwareAcceleration.restartToast"), {
            action: { label: t("settings.system.hardwareAcceleration.restartNow"), onClick: () => void restart() },
        })
    }, { initial: true, revertOnError: true })

    return (
        <SettingsSwitchRow
            label={t("settings.system.hardwareAcceleration.label")}
            description={t("settings.system.hardwareAcceleration.description")}
            checked={checked}
            onCheckedChange={value => void change(value)}
        />
    )
}

/** Integration with the operating system: start with Windows, close to the notification area. */
export const SystemSettings = () => {
    const { t } = useTranslation()
    return (
        <SettingsPanel title={t("settings.system.title")}>
            <SettingsCard>
                <AutostartSetting />
                <CloseToTraySetting />
                <DueNotificationsSetting />
                <RememberWindowStateSetting />
                <AlwaysOnTopSetting />
                <HardwareAccelerationSetting />
            </SettingsCard>
        </SettingsPanel>
    )
}
