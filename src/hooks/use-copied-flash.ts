import { useCallback, useEffect, useRef, useState } from "react"

const COPIED_MS = 1500

/** True for a moment after `flash()`: the copy icon turns into a check to confirm the copy. */
export const useCopiedFlash = () => {
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const flash = useCallback(() => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), COPIED_MS)
    }, [])
    return [copied, flash] as const
}
