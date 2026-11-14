import { useTranslation } from "react-i18next"
import { useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react"
import { ChevronLeft, ChevronRight, FileWarning } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { getMediaKind } from "@/db/queries/media"
import type { MediaFile } from "@/types/types"

const MIN_ZOOM = 1
const MAX_ZOOM = 10
const ZOOM_STEP = 1.15

type Offset = { x: number, y: number }

/** An image with zoom (mouse wheel), pan (drag while zoomed) and reset (double click). Keyed by file: a new file starts at 100%. */
const ViewerImage = ({ file, src, onError }: { file: MediaFile, src: string, onError: () => void }) => {
    const { t } = useTranslation()
    const [zoom, setZoom] = useState(MIN_ZOOM)
    const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
    const [drag, setDrag] = useState<{ pointer: number, from: Offset, start: Offset } | null>(null)

    const handleWheel = (event: WheelEvent) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)))
        setZoom(next)
        if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 })
    }
    const reset = () => {
        setZoom(MIN_ZOOM)
        setOffset({ x: 0, y: 0 })
    }
    const handlePointerDown = (event: PointerEvent) => {
        if (zoom === MIN_ZOOM) return
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setDrag({ pointer: event.pointerId, from: { x: event.clientX, y: event.clientY }, start: offset })
    }
    const handlePointerMove = (event: PointerEvent) => {
        if (!drag || drag.pointer !== event.pointerId) return
        setOffset({ x: drag.start.x + event.clientX - drag.from.x, y: drag.start.y + event.clientY - drag.from.y })
    }

    return (
        <div
            className="flex size-full items-center justify-center overflow-hidden"
            data-testid="media-viewer-stage"
            title={t("media.viewer.zoomHint")}
            onWheel={handleWheel}
            onDoubleClick={reset}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
        >
            <img
                src={src}
                alt={file.name}
                draggable={false}
                onError={onError}
                data-zoom={zoom}
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
                className={`max-h-full max-w-full select-none object-contain ${zoom > MIN_ZOOM ? (drag ? "cursor-grabbing" : "cursor-grab") : ""}`}
            />
        </div>
    )
}

type MediaViewerProps = {
    /** The images and videos of the group, in order. */
    files: readonly MediaFile[]
    /** URL of each file by path (a file without one is missing). */
    sources: Readonly<Record<string, string>>
    /** The shown file (index in `files`), null when the viewer is closed. */
    index: number | null
    onIndexChange: (index: number) => void
    onClose: () => void
}

/**
 * Full-window viewer of the images and videos of a group: an image with wheel zoom, a video with the native controls.
 * Left/Right arrows (and the buttons) move through the files of the group, Esc closes.
 * @category Group
 */
export const MediaViewer = ({ files, sources, index, onIndexChange, onClose }: MediaViewerProps) => {
    const { t } = useTranslation()
    // The files that failed to load, by path: shown as a message instead of a broken image
    const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
    const file = index === null ? undefined : files[index]
    // The last shown file stays while the dialog fades out
    const [last, setLast] = useState<{ file: MediaFile, index: number } | null>(null)
    if (file && index !== null && (last?.file !== file || last.index !== index)) setLast({ file, index })
    const shown = file ?? last?.file
    const position = index ?? last?.index ?? 0
    if (!shown) return null

    const src = sources[shown.path]
    const kind = getMediaKind(shown.name)
    const hasPrevious = position > 0
    const hasNext = position < files.length - 1
    const go = (step: -1 | 1) => {
        if (step < 0 ? hasPrevious : hasNext) onIndexChange(position + step)
    }

    // Capture: the arrows move through the files even when the video has the focus (it would seek instead)
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        event.preventDefault()
        event.stopPropagation()
        go(event.key === "ArrowLeft" ? -1 : 1)
    }

    return (
        <Dialog open={index !== null} onOpenChange={isOpen => { if (!isOpen) onClose() }}>
            <DialogContent
                onKeyDownCapture={handleKeyDown}
                className="top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-0 bg-black/95 p-0 text-white sm:max-w-none"
            >
                <DialogTitle className="sr-only">{t("media.viewer.title")}</DialogTitle>
                <DialogDescription className="sr-only">
                    {t("media.viewer.description", { name: shown.name, current: position + 1, total: files.length })}
                </DialogDescription>
                <div className="flex items-center gap-3 py-3 pl-4 pr-14 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={shown.path}>{shown.name}</span>
                    <span className="shrink-0 tabular-nums text-white/70">
                        {t("media.viewer.position", { current: position + 1, total: files.length })}
                    </span>
                </div>
                <div className="relative min-h-0 px-16 pb-4">
                    {!src
                        ? <Notice text={t("media.viewer.missing")} />
                        : failed.has(shown.path)
                            ? <Notice text={t("media.viewer.loadError")} />
                            : kind === "video"
                                ? <video
                                    key={shown.id}
                                    src={src}
                                    controls
                                    onError={() => setFailed(previous => new Set(previous).add(shown.path))}
                                    className="size-full object-contain"
                                />
                                : <ViewerImage
                                    key={shown.id}
                                    file={shown}
                                    src={src}
                                    onError={() => setFailed(previous => new Set(previous).add(shown.path))}
                                />}
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label={t("media.viewer.previous")}
                        disabled={!hasPrevious}
                        onClick={() => go(-1)}
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                    >
                        <ChevronLeft />
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label={t("media.viewer.next")}
                        disabled={!hasNext}
                        onClick={() => go(1)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                        <ChevronRight />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const Notice = ({ text }: { text: string }) => (
    <div role="status" className="flex size-full flex-col items-center justify-center gap-2 text-sm text-white/80">
        <FileWarning className="size-8" aria-hidden />
        <p>{text}</p>
    </div>
)
