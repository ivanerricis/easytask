import { useCallback, useState, type ReactNode } from "react"
import type { ChooseImportNames, ImportName } from "@/lib/workspace-transfer"
import { DialogImportNames } from "@/components/dialogs/dialog-import-names"
import { ImportNamesContext } from "./import-names-context-object"

type PendingRequest = {
    proposed: ImportName[]
    submit: (names: string[]) => Promise<unknown>
    resolve: (result: unknown) => void
}

/**
 * Hosts the dialog that shows the names of what an import creates (proposed, editable) before importing.
 * Mounted once around the pages, so the home and the workspace import share it.
 * @category Contexts
 */
export function ImportNamesProvider({ children }: { children: ReactNode }) {
    const [request, setRequest] = useState<PendingRequest | null>(null)

    const choose = useCallback<ChooseImportNames>((proposed, submit) => new Promise(resolve => {
        setRequest({ proposed, submit, resolve: resolve as (result: unknown) => void })
    }), [])

    const close = (result: unknown) => {
        request?.resolve(result)
        setRequest(null)
    }

    return (
        <ImportNamesContext.Provider value={choose}>
            {children}
            {request && (
                <DialogImportNames
                    proposed={request.proposed}
                    onSubmit={async names => close(await request.submit(names))}
                    onCancel={() => close(null)}
                />
            )}
        </ImportNamesContext.Provider>
    )
}

