import { toast } from "sonner"
import { TransferProgressMessage } from "@/components/transfer-progress-message"
import type { TransferProgress } from "@/lib/workspace-transfer"

/**
 * A toast with a progress bar for a transfer of linked files. It appears with the first progress report (a transfer that
 * copies no file shows nothing) and stays until `dismiss`.
 * @param label What is going on ("Exporting the files...").
 * @category Utilities
 */
export function createProgressToast(label: string) {
    let id: string | number | undefined
    return {
        update({ done, total }: TransferProgress) {
            id = toast.loading(<TransferProgressMessage label={label} done={done} total={total} />, { id, duration: Infinity })
        },
        dismiss() {
            if (id !== undefined) toast.dismiss(id)
            id = undefined
        },
    }
}
