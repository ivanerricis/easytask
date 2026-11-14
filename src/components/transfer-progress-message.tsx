import { Progress } from "@/components/ui/progress"

/**
 * Content of the toast shown while the linked files are copied into (or out of) a zip: a label and a progress bar.
 * @param label What is going on ("Exporting the files...").
 * @param done Bytes copied so far.
 * @param total Bytes to copy.
 * @category Components
 */
export function TransferProgressMessage({ label, done, total }: { label: string, done: number, total: number }) {
    const percent = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0
    return (
        <div className="flex w-full flex-col gap-2" data-transfer-progress>
            <div className="flex items-center justify-between gap-4 text-sm">
                <span>{label}</span>
                <span className="tabular-nums text-muted-foreground">{percent}%</span>
            </div>
            <Progress value={percent} aria-label={label} />
        </div>
    )
}
