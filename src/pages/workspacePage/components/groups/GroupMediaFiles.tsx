import { useTranslation } from "react-i18next"
import { useState } from "react"
import { ExternalLink, FileWarning, Play, TriangleAlert } from "lucide-react"
import { ButtonInPopover } from "@/components/button-in-popover"
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete"
import { DialogRenameItem } from "@/components/dialogs/dialog-rename"
import { MenuGroup } from "@/components/menu-kind"
import { Button } from "@/components/ui/button"
import { TooltipCustom } from "@/components/tooltip-custom"
import { Separator } from "@/components/ui/separator"
import { ItemMenu, ItemMenuButton } from "@/components/item-menu"
import { useItemMenuState } from "@/hooks/use-item-menu-state"
import { useAudioActions } from "@/contexts/use-audio"
import { fileStillExists, openWithDefaultApp, useGroupMediaFiles, useMediaSources, useMissingPaths } from "@/contexts/use-media"
import { getMediaKind } from "@/db/queries/media"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/a11y"
import type { MediaFile } from "@/types/types"
import { MediaViewer } from "./MediaViewer"

type MediaFileRowProps = {
    file: MediaFile
    groupId: number
    /** URL of the thumbnail (undefined when the file cannot be shown). */
    src: string | undefined
    missing: boolean
    onOpen: () => void
    /** "strip": only a small square thumbnail button, for the strip of a closed group; the menu opens with the right click. */
    variant?: "row" | "strip"
}

const Thumbnail = ({ file, src, missing, unsupported, onUnsupported, size = "size-9" }: {
    file: MediaFile, src: string | undefined, missing: boolean, unsupported: boolean, onUnsupported: () => void, size?: string
}) => {
    const { t } = useTranslation()
    const video = getMediaKind(file.name) === "video"
    const frame = cn("relative shrink-0 overflow-hidden", size, " rounded-xs bg-muted", missing && "opacity-40 grayscale")
    if (!src || missing) return <span aria-hidden className={frame} data-testid="media-thumbnail" />
    // The file is there but the webview cannot decode it (e.g. HEVC without the codec)
    if (unsupported) return (
        <span className={cn(frame, "flex items-center justify-center text-muted-foreground")} data-testid="media-thumbnail">
            <FileWarning className="size-4" role="img" aria-label={t("media.unsupported")} />
        </span>
    )
    return (
        <span aria-hidden className={frame} data-testid="media-thumbnail">
            {video
                // #t: asks for a frame a little after the start, so the thumbnail is not black
                ? <video src={`${src}#t=0.1`} preload="metadata" muted tabIndex={-1} onError={onUnsupported} className="size-full object-cover" />
                : <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={onUnsupported} className="size-full object-cover" />}
            {video && <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                <Play className="size-3.5 fill-current" />
            </span>}
        </span>
    )
}

const MediaFileRow = ({ file, groupId, src, missing, onOpen, variant = "row" }: MediaFileRowProps) => {
    const { t } = useTranslation()
    const { relinkMediaFile, refresh } = useAudioActions()
    const [isRenameOpen, setRenameOpen] = useState(false)
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const menu = useItemMenuState()
    const [unsupported, setUnsupported] = useState(false)

    // The dialogs call this with the id they were given after the change is stored
    const reload = async () => refresh()

    const items = (
        <MenuGroup className="flex flex-col gap-1">
            <ButtonInPopover
                text={t("common.rename")}
                type="rename"
                onClick={() => {
                    setRenameOpen(true)
                    menu.close()
                }}
            />
            <ButtonInPopover
                text={t("audio.updatePath")}
                type="relink"
                highlight={missing}
                onClick={() => {
                    menu.close()
                    void relinkMediaFile(file)
                }}
            />
            <Separator />
            <ButtonInPopover
                text={t("common.delete")}
                type="delete"
                destructive
                onClick={() => {
                    setDeleteOpen(true)
                    menu.close()
                }}
            />
        </MenuGroup>
    )

    const dialogs = (
        <>
            <DialogRenameItem
                item={file}
                itemType="media_file"
                isOpen={isRenameOpen}
                onOpenChange={setRenameOpen}
                getItemId={groupId}
                getItemData={reload}
            />
            <DialogDeleteItem
                item={file}
                itemType="media_file"
                isOpen={isDeleteOpen}
                onOpenChange={setDeleteOpen}
                getItemId={groupId}
                getItemData={reload}
            />
        </>
    )

    if (variant === "strip") return (
        <ItemMenu state={menu} items={items} dialogs={dialogs} contentClassName="p-1 rounded-xs">
            <div role="listitem" data-missing={missing ? "true" : undefined} className="relative">
                <TooltipCustom text={file.name}>
                    <button
                        type="button"
                        aria-label={missing ? `${t("media.open", { name: file.name })} (${t("audio.missing.title")})` : t("media.open", { name: file.name })}
                        onClick={onOpen}
                        className={cn(focusRing, "block size-7 shrink-0 cursor-pointer overflow-hidden rounded-xs border bg-background", missing && "border-destructive")}>
                        <Thumbnail file={file} src={src} missing={missing} unsupported={unsupported} size="size-full" onUnsupported={() => { void fileStillExists(file.path).then(exists => { if (exists) setUnsupported(true) }) }} />
                    </button>
                </TooltipCustom>
                {missing && <TriangleAlert className="pointer-events-none absolute -right-1 -top-1 size-3 text-destructive" role="img" aria-label={t("audio.missing.title")} />}
            </div>
        </ItemMenu>
    )

    return (
        <ItemMenu state={menu} items={items} dialogs={dialogs} contentClassName="p-1 rounded-xs">
            <div
                role="listitem"
                data-missing={missing ? "true" : undefined}
                className="group flex items-center gap-1 border pl-1 pr-1 bg-background hover:bg-secondary rounded-xs text-xs"
            >
                <button
                    type="button"
                    title={file.path}
                    // The state is part of the name: the icon inside is not read when the label replaces the content
                    aria-label={missing ? `${t("media.open", { name: file.name })} (${t("audio.missing.title")})` : t("media.open", { name: file.name })}
                    onClick={onOpen}
                    className={cn(focusRing, "flex min-w-0 flex-1 items-center gap-2 py-1 rounded-xs cursor-pointer text-left")}
                >
                    <Thumbnail file={file} src={src} missing={missing} unsupported={unsupported} onUnsupported={() => { void fileStillExists(file.path).then(exists => { if (exists) setUnsupported(true) }) }} />
                    <span className={cn("flex-1 truncate", missing && "text-muted-foreground")}>{file.name}</span>
                    {missing && <TriangleAlert className="size-4 shrink-0 text-destructive" role="img" aria-label={t("audio.missing.title")} />}
                </button>
                {unsupported && !missing && <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={t("media.openWithDefault")}
                    aria-label={t("media.openWithDefault")}
                    onClick={() => void openWithDefaultApp(file.path)}
                    className="size-6 shrink-0 text-muted-foreground hover:text-foreground">
                    <ExternalLink />
                </Button>}
                <div className="flex items-center leading-none shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <ItemMenuButton name={file.name} />
                </div>
            </div>
        </ItemMenu>
    )
}

type GroupMediaFilesProps = {
    groupId: number
    /** "strip": small square thumbnails instead of rows (closed group, vertical layout). */
    variant?: "row" | "strip"
    /** The most files shown (all when omitted); the viewer still goes through all of them. */
    max?: number
}

/**
 * The images and videos attached to a group, one under the other with a thumbnail, right under the audio files.
 * A click opens the viewer (a missing file opens the "file not found" dialog instead).
 * @category Group
 */
export const GroupMediaFiles = ({ groupId, variant = "row", max }: GroupMediaFilesProps) => {
    const { t } = useTranslation()
    const { reportMissingMedia } = useAudioActions()
    const files = useGroupMediaFiles(groupId)
    const missing = useMissingPaths(files)
    const sources = useMediaSources(files)
    const [viewing, setViewing] = useState<number | null>(null)
    if (files.length === 0) return null

    const open = (index: number) => {
        if (missing.has(files[index].path)) reportMissingMedia(files[index])
        else setViewing(index)
    }

    return (
        <>
            {(max === undefined || max > 0) && <div role="list" className={cn("flex flex-col gap-1", variant === "strip" && "items-center")} aria-label={t("media.files")}>
                {(max === undefined ? files : files.slice(0, max)).map((file, index) => (
                    <MediaFileRow
                        key={file.id}
                        file={file}
                        groupId={groupId}
                        src={sources[file.path]}
                        missing={missing.has(file.path)}
                        onOpen={() => open(index)}
                        variant={variant}
                    />
                ))}
            </div>}
            <MediaViewer
                files={files}
                sources={sources}
                index={viewing !== null && viewing < files.length ? viewing : null}
                onIndexChange={setViewing}
                onClose={() => setViewing(null)}
            />
        </>
    )
}
