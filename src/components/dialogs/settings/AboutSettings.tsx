import { useTranslation } from "react-i18next"
import { Fragment, useEffect, useState, type ReactNode } from "react"
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app"
import { ensureAppFolder } from "@/db/appPaths"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/utils"
import { docsUrl } from "@/lib/docs"
import { Button } from "@/components/ui/button"
import { TooltipCustom } from "@/components/tooltip-custom"
import { SettingsCard, SettingsPanel } from "./SettingsRow"
import { UpdateSection } from "./UpdateSection"

const REPO_URL = "https://github.com/ivanerricis/easytask"
const DB_FILE = "easytask.db"
const EMPTY = "—"

type AboutInfo = { name: string, version: string, tauri: string, dbPath: string }

const settle = async (fn: () => Promise<string>) => {
    try {
        return (await fn()) || EMPTY
    } catch {
        return EMPTY
    }
}

/** A row of the About page: the label on the left, the value (any content) on the right. */
const AboutRow = ({ label, children }: { label: string, children: ReactNode }) => (
    <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-muted-foreground shrink-0">{label}</span>
        {children}
    </div>
)

const InfoRow = ({ label, value }: { label: string, value: string }) => (
    <AboutRow label={label}>
        <span className="text-right break-all">{value}</span>
    </AboutRow>
)

/** Copies `text` to the clipboard, with the result in a toast. */
const useCopy = (successKey: "settings.about.copied" | "settings.about.pathCopied") => {
    const { t } = useTranslation()
    return async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success(t(successKey))
        } catch (err) {
            toast.error(t("settings.about.copyError", { message: getErrorMessage(err) }))
        }
    }
}

/** A path that wraps only after its separators, never in the middle of a name. */
const WrappablePath = ({ path }: { path: string }) => (
    <>
        {path.split(/([\\/])/).map((part, index) => (
            <Fragment key={index}>
                {part}
                {(part === "\\" || part === "/") && <wbr />}
            </Fragment>
        ))}
    </>
)

const DatabaseRow = ({ path }: { path: string }) => {
    const { t } = useTranslation()
    const copy = useCopy("settings.about.pathCopied")
    return (
        <AboutRow label={t("settings.about.database")}>
            <span className="flex min-w-0 items-center gap-1.5 text-right">
                <span className="min-w-0 select-text"><WrappablePath path={path} /></span>
                {path !== EMPTY && (
                    <TooltipCustom text={t("settings.about.copyPath")}>
                        <Button type="button" variant="ghost" size="icon" onClick={() => void copy(path)} aria-label={t("settings.about.copyPath")} className="shrink-0 self-center text-muted-foreground">
                            <Copy />
                        </Button>
                    </TooltipCustom>
                )}
            </span>
        </AboutRow>
    )
}

/** A link that opens in the browser, with a button that copies it. */
const LinkRow = ({ label, url }: { label: string, url: string }) => {
    const { t } = useTranslation()
    const handleOpen = async () => {
        try {
            await openUrl(url)
        } catch (err) {
            toast.error(t("settings.about.openError", { message: getErrorMessage(err) }))
        }
    }

    const copy = useCopy("settings.about.copied")
    const handleCopy = () => copy(url)

    return (
        <AboutRow label={label}>
            <span className="flex items-center gap-1.5 text-right">
                <TooltipCustom text={t("settings.about.openInBrowser")}>
                    <Button
                        type="button"
                        variant="link"
                        onClick={handleOpen}
                        className="h-auto whitespace-normal p-0 text-right font-normal break-all text-foreground underline decoration-primary"
                    >
                        {url}
                    </Button>
                </TooltipCustom>
                <TooltipCustom text={t("settings.about.copyLink")}>
                    <Button type="button" variant="ghost" size="icon" onClick={() => void handleCopy()} aria-label={t("settings.about.copyLink")} className="self-center text-muted-foreground">
                        <Copy />
                    </Button>
                </TooltipCustom>
            </span>
        </AboutRow>
    )
}

export const AboutSettings = () => {
    const { t, i18n } = useTranslation()
    const [info, setInfo] = useState<AboutInfo>({ name: EMPTY, version: EMPTY, tauri: EMPTY, dbPath: EMPTY })

    useEffect(() => {
        let cancelled = false
        Promise.all([
            settle(getName),
            settle(getVersion),
            settle(getTauriVersion),
            settle(async () => {
                const dir = await ensureAppFolder()
                const sep = dir.includes("\\") ? "\\" : "/"
                return `${dir}${sep}${DB_FILE}`
            }),
        ]).then(([name, version, tauri, dbPath]) => {
            if (!cancelled) setInfo({ name, version, tauri, dbPath })
        })
        return () => { cancelled = true }
    }, [])

    return (
        <SettingsPanel title={t("settings.about.title")}>
            <p className="text-sm text-muted-foreground">
                {t("settings.about.description")}
            </p>
            <SettingsCard>
                <InfoRow label={t("settings.about.application")} value={info.name} />
                <InfoRow label={t("settings.about.version")} value={info.version} />
                <InfoRow label={t("settings.about.tauriVersion")} value={info.tauri} />
                <InfoRow label={t("settings.about.author")} value="Ivan Erricis" />
                <LinkRow label={t("settings.about.repository")} url={REPO_URL} />
                <LinkRow label={t("settings.about.docs")} url={docsUrl(i18n.language)} />
                <DatabaseRow path={info.dbPath} />
            </SettingsCard>
            <UpdateSection />
        </SettingsPanel>
    )
}
