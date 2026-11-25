import { useTranslation } from "react-i18next"
import React, { useState, useEffect, useLayoutEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useShortcutLabel } from "@/contexts/use-shortcuts"
import { focusRing } from "@/lib/a11y"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { PanelLeft, PanelRight } from "lucide-react"
import {
    SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, clampSidebarWidth, maxSidebarWidth, widthForKey,
} from "@/lib/sidebar-layout"

const OVERLAY_OPENED_EVENT = "easytask:sidebar-overlay-opened"

type SideBarProps = {
    children: React.ReactNode
    position?: "left" | "right"
    className?: string
    bottomContainer?: React.ReactNode
    open: boolean
    onOpenChange: (value: boolean) => void
    /** Width of the panel in pixels (clamped to the allowed range). */
    width?: number
    onWidthChange?: (value: number) => void
    /** Compact mode: the panel floats over the content instead of pushing it, and is not resizable. */
    overlay?: boolean
    /** Shortcut shown in the tooltip of the toggle button (default: the left sidebar one). */
    toggleShortcut?: string
    /** Texts of the toggle button (default: the generic sidebar ones). */
    toggleLabels?: { toggle: string, show: string, hide: string }
}

export const SideBar = ({
    children, position = "left", className, bottomContainer,
    open, onOpenChange, width = SIDEBAR_DEFAULT_WIDTH, onWidthChange, overlay = false,
    toggleShortcut = "toggle-sidebar", toggleLabels,
}: SideBarProps) => {
    const { t } = useTranslation()
    const sidebarRef = useRef<HTMLDivElement>(null)
    const toggleRef = useRef<HTMLButtonElement>(null)
    const railRef = useRef<HTMLDivElement>(null)
    // Width of the little sidebar: the compact overlay starts after it, so the toggle stays visible and clickable
    const [railWidth, setRailWidth] = useState(0)
    const toggleLabel = useShortcutLabel(toggleShortcut)
    const [dragWidth, setDragWidth] = useState<number | null>(null)
    const dragWidthRef = useRef<number | null>(null)
    const isResizing = dragWidth !== null
    const direction = position === "left" ? 1 : -1

    const currentWidth = clampSidebarWidth(dragWidth ?? width, window.innerWidth)

    // The handle captures the pointer, so move and up events keep coming to it even outside its few pixels
    const startResizing = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragWidthRef.current = currentWidth
        setDragWidth(currentWidth)
    }

    const resize = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragWidthRef.current === null || !sidebarRef.current) return
        const rect = sidebarRef.current.getBoundingClientRect()
        const next = position === "left" ? e.clientX - rect.left : rect.right - e.clientX
        const clamped = clampSidebarWidth(next, window.innerWidth)
        dragWidthRef.current = clamped
        setDragWidth(clamped)
    }

    const stopResizing = () => {
        const final = dragWidthRef.current
        if (final === null) return
        dragWidthRef.current = null
        setDragWidth(null)
        onWidthChange?.(final)
    }

    const handleResizerKeyDown = (e: React.KeyboardEvent) => {
        const next = widthForKey(e.key, currentWidth, window.innerWidth, e.shiftKey, direction)
        if (next === null) return
        e.preventDefault()
        if (next !== currentWidth) onWidthChange?.(next)
    }

    // Compact mode: only one overlay at a time (the left sidebar and the right panel close each other)
    useEffect(() => {
        if (!overlay) return
        const onOther = (e: Event) => {
            if ((e as CustomEvent<string>).detail !== position) onOpenChange(false)
        }
        window.addEventListener(OVERLAY_OPENED_EVENT, onOther)
        return () => window.removeEventListener(OVERLAY_OPENED_EVENT, onOther)
    }, [overlay, position, onOpenChange])
    useEffect(() => {
        if (overlay && open) window.dispatchEvent(new CustomEvent(OVERLAY_OPENED_EVENT, { detail: position }))
    }, [overlay, open, position])

    useLayoutEffect(() => {
        if (railRef.current) setRailWidth(railRef.current.offsetWidth)
    }, [overlay])

    // The left bar is the navigation of the notes (the tree), the right one the complementary details of the open note
    const landmarkRole = position === "left" ? "navigation" : "complementary"
    const landmarkLabel = position === "left" ? t("layout.leftLandmark") : t("layout.rightLandmark")
    const flexDirection = position === "left" ? "flex-row-reverse" : "flex-row"
    const borderClass = position === "left" ? "border-r" : "border-l"
    const resizerPosition = position === "left" ? "right-0" : "left-0"
    const toggleText = open ? (toggleLabels?.hide ?? t("layout.hideSidebar")) : (toggleLabels?.show ?? t("layout.showSidebar"))

    return (
        <div className={`flex ${flexDirection} relative h-full z-20 shrink-0 ${className || ""}`}>

            {/* Compact mode: a modal Sheet over the content (focus trapped, Esc and a click outside close it) */}
            {overlay && (
                <Sheet open={open} onOpenChange={onOpenChange}>
                    <SheetContent
                        side={position}
                        showCloseButton={false}
                        data-testid="sidebar-panel"
                        aria-describedby={undefined}
                        // Focus goes to the panel itself, not to its first button: that one would show its tooltip over the toggle
                        onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).focus() }}
                        // Focus goes back to the toggle button, which is where the panel is opened from
                        onCloseAutoFocus={e => { e.preventDefault(); toggleRef.current?.focus() }}
                        // A press on the toggle is not a dismissal: its click closes the panel (otherwise it would close and reopen)
                        onPointerDownOutside={e => { if (toggleRef.current?.contains(e.target as Node)) e.preventDefault() }}
                        overlayStyle={{ [position]: railWidth }}
                        className="w-auto gap-0 overflow-hidden bg-secondary p-0 sm:max-w-none"
                        style={{ width: currentWidth, maxWidth: `calc(100vw - ${railWidth + 80}px)`, [position]: railWidth }}
                    >
                        <SheetHeader className="sr-only">
                            <SheetTitle>{toggleLabels?.toggle ?? t("sidebar.toggle")}</SheetTitle>
                        </SheetHeader>
                        <div role={landmarkRole} aria-label={landmarkLabel} className="flex h-full min-h-0 flex-col">{children}</div>
                    </SheetContent>
                </Sheet>
            )}

            {/* Big Sidebar */}
            {!overlay && <div
                ref={sidebarRef}
                data-testid="sidebar-panel"
                className={`relative flex flex-col h-full bg-secondary ${isResizing ? "transition-none" : "transition-[width]"} ${open ? borderClass : ""}`}
                style={{
                    width: open ? currentWidth : 0,
                    minWidth: 0,
                    overflow: "hidden",
                }}
            >
                {/* Laid out at its final width from the first frame: while the panel opens (or closes) it is only revealed, so the text does not reflow */}
                {open && (
                    <div
                        role={landmarkRole}
                        aria-label={landmarkLabel}
                        className={`flex h-full min-h-0 shrink-0 flex-col ${position === "left" ? "self-start" : "self-end"}`}
                        style={{ width: currentWidth }}
                    >
                        {children}
                    </div>
                )}
                {open && (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={t("layout.resizeSidebar")}
                        aria-valuemin={SIDEBAR_MIN_WIDTH}
                        aria-valuemax={maxSidebarWidth(window.innerWidth)}
                        aria-valuenow={currentWidth}
                        aria-valuetext={t("layout.resizeValue", { width: currentWidth })}
                        tabIndex={0}
                        className={`${focusRing} focus-visible:ring-inset absolute top-0 h-full w-1.5 cursor-col-resize touch-none before:absolute before:inset-y-0 before:-inset-x-1 before:content-[''] hover:bg-accent ${isResizing ? "bg-accent" : ""} ${resizerPosition}`}
                        onPointerDown={startResizing}
                        onPointerMove={resize}
                        onPointerUp={stopResizing}
                        onPointerCancel={stopResizing}
                        onDoubleClick={() => onWidthChange?.(SIDEBAR_DEFAULT_WIDTH)}
                        onKeyDown={handleResizerKeyDown}
                    />
                )}
            </div>}

            {/* Little Sidebar */}
            <div ref={railRef} className={`pointer-events-auto flex flex-col items-center justify-between p-1 bg-background ${borderClass}`}>
                <div className="h-full w-full flex flex-col">
                    <TooltipCustom text={toggleText} shortcut={toggleLabel} side={position === "left" ? "right" : "left"}>
                        <Button
                            ref={toggleRef}
                            onClick={() => onOpenChange(!open)}
                            aria-label={toggleLabels?.toggle ?? t("sidebar.toggle")}
                            aria-expanded={open}
                            size="icon"
                            variant="ghost"
                        >
                            {position === "left" ? <PanelLeft /> : <PanelRight />}
                        </Button>
                    </TooltipCustom>
                </div>
                <div className="h-full w-full flex flex-col-reverse">{bottomContainer}</div>
            </div>
        </div>
    )
}
