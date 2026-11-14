import { useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Archive } from "lucide-react"
import type { AskIncludeFiles, LinkedFilesInfo } from "@/lib/workspace-transfer"
import { formatFileSize } from "@/lib/audio-metadata"
import { ConfirmDialog } from "@/components/dialogs/dialog-confirm"
import { ExportFilesContext } from "./export-files-context-object"

type Pending = { info: LinkedFilesInfo, resolve: (answer: boolean | null) => void }

/**
 * Hosts the question "include the linked files (audio, images and videos)?" that every export asks when the exported notes
 * link files that exist. Mounted once around the pages, so the home and the workspace exports share it.
 * @category Contexts
 */
export function ExportFilesProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
    const [pending, setPending] = useState<Pending | null>(null)
    // The answer is given once: "Annulla", Esc and the close button all end up in onOpenChange(false)
    const answered = useRef(false)

    const ask = useCallback<AskIncludeFiles>(info => new Promise(resolve => {
        answered.current = false
        setPending({ info, resolve })
    }), [])

    const answer = (value: boolean | null) => {
        if (answered.current || !pending) return
        answered.current = true
        pending.resolve(value)
        setPending(null)
    }

    return (
        <ExportFilesContext.Provider value={ask}>
            {children}
            {pending && (
                <ConfirmDialog
                    open
                    onOpenChange={open => { if (!open) answer(null) }}
                    autoClose={false}
                    title={t("transfer.includeFilesTitle")}
                    description={t("transfer.includeFilesDescription", { count: pending.info.count, size: formatFileSize(pending.info.bytes) })}
                    confirm={{ label: t("transfer.includeFilesYes"), icon: Archive, onClick: () => answer(true) }}
                    secondary={{ label: t("transfer.includeFilesNo"), onClick: () => answer(false) }}
                />
            )}
        </ExportFilesContext.Provider>
    )
}

/** The function that asks whether to include the linked files in an export (undefined outside the provider: paths only). */
// eslint-disable-next-line react-refresh/only-export-components
export const useAskIncludeFiles = () => useContext(ExportFilesContext)
