import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { focusRing } from "@/lib/a11y"
import { GROUP_MAX_WIDTH, GROUP_MIN_WIDTH, clampGroupWidth, groupWidthForKey } from "@/lib/group-width"

/** Repeated key presses are saved once, after this pause. */
const KEY_COMMIT_DELAY_MS = 400

type GroupResizeHandleProps = {
    /** The width the group is rendered at right now (read when a drag or a key press starts). */
    getWidth: () => number
    /** The width set by the user (null = automatic, driven by the content). */
    width: number | null
    /** Live width while resizing (the caller applies it to the group); null = back to the automatic width. */
    onResize: (width: number | null) => void
    /** Final width: once at the end of a drag, after a pause for the keyboard, on reset. null = automatic. */
    onCommit: (width: number | null) => void
}

/**
 * Vertical resize handle on the right edge of a group (the parent must be `relative`).
 * Drag it, use Arrows/Home/End when focused, or double-click it to go back to the automatic width.
 */
export const GroupResizeHandle = ({ getWidth, width, onResize, onCommit }: GroupResizeHandleProps) => {
    const { t } = useTranslation()
    const [dragWidth, setDragWidth] = useState<number | null>(null)
    const isResizing = dragWidth !== null
    const dragRef = useRef<{ startX: number, startWidth: number, width: number } | null>(null)
    const pendingKey = useRef<{ timer: ReturnType<typeof setTimeout>, width: number } | null>(null)
    // The latest callback, so the window listeners and the timer never use a stale one
    const commitRef = useRef(onCommit)
    useEffect(() => { commitRef.current = onCommit })

    const flushKey = useCallback(() => {
        const pending = pendingKey.current
        if (!pending) return
        clearTimeout(pending.timer)
        pendingKey.current = null
        commitRef.current(pending.width)
    }, [])
    // A pause still running when the group goes away is saved at once
    useEffect(() => flushKey, [flushKey])

    // The automatic width is measured after the render (and again when the handle gets the focus, the content can have changed
    // the group since), never during it: reading the layout in the render forces a reflow in every commit that touches the group
    const [autoWidth, setAutoWidth] = useState<number | null>(null)
    const getWidthRef = useRef(getWidth)
    useEffect(() => { getWidthRef.current = getWidth })
    useEffect(() => { if (width === null) setAutoWidth(getWidthRef.current()) }, [width])

    const currentWidth = clampGroupWidth(dragWidth ?? width ?? autoWidth ?? GROUP_MIN_WIDTH)

    const startResizing = (e: React.MouseEvent) => {
        // A press here must not start the drag of the group
        e.stopPropagation()
        e.preventDefault()
        flushKey()
        const startWidth = clampGroupWidth(width ?? getWidth())
        dragRef.current = { startX: e.clientX, startWidth, width: startWidth }
        setDragWidth(startWidth)
    }

    useEffect(() => {
        if (!isResizing) return
        const move = (e: MouseEvent) => {
            const drag = dragRef.current
            if (!drag) return
            drag.width = clampGroupWidth(drag.startWidth + e.clientX - drag.startX)
            setDragWidth(drag.width)
            onResize(drag.width)
        }
        const stop = () => {
            const drag = dragRef.current
            dragRef.current = null
            setDragWidth(null)
            if (drag) commitRef.current(drag.width)
        }
        window.addEventListener("mousemove", move)
        window.addEventListener("mouseup", stop)
        return () => {
            window.removeEventListener("mousemove", move)
            window.removeEventListener("mouseup", stop)
        }
    }, [isResizing, onResize])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Measured now, not at the last render: the automatic width follows the content, which can have changed since
        const base = clampGroupWidth(dragWidth ?? width ?? getWidth())
        const next = groupWidthForKey(e.key, base, e.shiftKey)
        if (next === null) return
        e.preventDefault()
        if (next === base) return
        onResize(next)
        if (pendingKey.current) clearTimeout(pendingKey.current.timer)
        pendingKey.current = { width: next, timer: setTimeout(flushKey, KEY_COMMIT_DELAY_MS) }
    }

    const reset = () => {
        if (pendingKey.current) {
            clearTimeout(pendingKey.current.timer)
            pendingKey.current = null
        }
        onResize(null)
        onCommit(null)
    }

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("groups.width.handle")}
            aria-valuemin={GROUP_MIN_WIDTH}
            aria-valuemax={GROUP_MAX_WIDTH}
            aria-valuenow={currentWidth}
            aria-valuetext={width === null && !isResizing ? t("groups.width.auto") : t("groups.width.value", { width: currentWidth })}
            tabIndex={0}
            data-testid="group-resize-handle"
            className={`${focusRing} absolute -right-1.5 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-accent ${isResizing ? "bg-accent" : ""}`}
            onPointerDown={e => e.stopPropagation()}
            onMouseDown={startResizing}
            onDoubleClick={reset}
            onFocus={() => { if (width === null) setAutoWidth(getWidth()) }}
            onKeyDown={handleKeyDown}
        />
    )
}
