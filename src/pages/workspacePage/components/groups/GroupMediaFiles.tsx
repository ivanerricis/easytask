import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Play, TriangleAlert } from "lucide-react"
import { ButtonInPopover } from "@/components/button-in-popover"
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete"
import { DialogRenameItem } from "@/components/dialogs/dialog-rename"
import { MenuGroup } from "@/components/menu-kind"
import { Separator } from "@/components/ui/separator"
import { ItemMenu, ItemMenuButton } from "@/components/item-menu"
import { useItemMenuState } from "@/hooks/use-item-menu-state"
import { useAudioActions } from "@/contexts/use-audio"
import { useGroupMediaFiles, useMediaSources, useMissingPaths } from "@/contexts/use-media"
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
}

const Thumbnail = ({ file, src, missing }: { file: MediaFile, src: string | undefined, missing: boolean }) => {
    const video = getMediaKind(file.name) === "video"
    const frame = cn("relative size-9 shrink-0 overflow-hidden rounded-xs bg-muted", missing && "opacity-40 grayscale")
    if (!src || missing) return <span aria-hidden className={frame} data-testid="media-thumbnail" />
    return (
        <span aria-hidden className={frame} data-testid="media-thumbnail">
            {video
                // #t: asks for a frame a little after the start, so the thumbnail is not black
                ? <video src={`${src}#t=0.1`} preload="metadata" muted tabIndex={-1} className="size-full object-cover" />
                : <img src={src} alt="" loading="lazy" draggable={false} className="size-full object-cover" />}
            {video && <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                <Play className="size-3.5 fill-current" />
            </span>}
        </span>
    )
}

const MediaFileRow = ({ file, groupId, src, missing, onOpen }: MediaFileRowProps) => {
    const { t } = useTranslation()
    const { relinkMediaFile, refresh } = useAudioActions()
    const [isRenameOpen, setRenameOpen] = useState(false)
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const menu = useItemMenuState()

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
                    <Thumbnail file={file} src={src} missing={missing} />
                    <span className={cn("flex-1 truncate", missing && "text-muted-foreground")}>{file.name}</span>
                    {missing && <TriangleAlert className="size-4 shrink-0 text-destructive" role="img" aria-label={t("audio.missing.title")} />}
                </button>
                <div className="flex items-center leading-none shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <ItemMenuButton name={file.name} />
                </div>
            </div>
        </ItemMenu>
    )
}

type GroupMediaFilesProps = {
    groupId: number
}

/**
 * The images and videos attached to a group, one under the other with a thumbnail, right under the audio files.
 * A click opens the viewer (a missing file opens the "file not found" dialog instead).
 * @category Group
 */
export const GroupMediaFiles = ({ groupId }: GroupMediaFilesProps) => {
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
            <div role="list" className="flex flex-col gap-1" aria-label={t("media.files")}>
                {files.map((file, index) => (
                    <MediaFileRow
                        key={file.id}
                        file={file}
                        groupId={groupId}
                        src={sources[file.path]}
                        missing={missing.has(file.path)}
                        onOpen={() => open(index)}
                    />
                ))}
            </div>
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
