import { Check, Copy } from "lucide-react"

/** The copy icon, or a check that zooms in right after a copy (the zoom follows the animation speed; with "none" it just swaps). */
export const CopyIcon = ({ copied }: { copied: boolean }) => copied
    ? <Check data-copied className="animate-in zoom-in-50 fade-in-0" />
    : <Copy />
