import { useTranslation } from "react-i18next"
import { useState } from "react"
import { AudioLines, Music, Pause, Square, TriangleAlert } from "lucide-react"
import { ButtonInPopover } from "@/components/button-in-popover"
import { DialogDeleteItem } from "@/components/dialogs/dialog-delete"
import { DialogRenameItem } from "@/components/dialogs/dialog-rename"
import { MenuGroup } from "@/components/menu-kind"
import { Separator } from "@/components/ui/separator"
import { ItemMenu, ItemMenuButton } from "@/components/item-menu"
import { useItemMenuState } from "@/hooks/use-item-menu-state"
import { useAudio, useGroupAudioFiles } from "@/contexts/use-audio"
import { useMissingPaths } from "@/contexts/use-media"
import { useShowAudioInfo } from "../rightbar/use-right-panel"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/a11y"
import type { AudioFile } from "@/types/types"

type AudioFileRowProps = {
    file: AudioFile
    groupId: number
    /** The file is no longer at its saved path. */
    missing?: boolean
}

const AudioFileRow = ({ file, groupId, missing = false }: AudioFileRowProps) => {
    const { t } = useTranslation()
    const { track, playbackState, playFile, relinkFile, refresh } = useAudio()
    const [isRenameOpen, setRenameOpen] = useState(false)
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const menu = useItemMenuState()
    const showAudioInfo = useShowAudioInfo()
    const isCurrent = track?.audioId === file.id
    // What the icon says: playing (animated bars), paused (pause), played to the end (stop), or not loaded (note)
    const state = isCurrent ? playbackState : null
    const StateIcon = state === "playing" ? AudioLines : state === "paused" ? Pause : state === "ended" ? Square : Music

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
            {showAudioInfo && (
                <ButtonInPopover
                    text={t("details.showTask")}
                    type="details"
                    onClick={() => {
                        menu.close()
                        showAudioInfo(file)
                    }}
                />
            )}
            <ButtonInPopover
                text={t("audio.updatePath")}
                type="relink"
                highlight={missing}
                onClick={() => {
                    menu.close()
                    void relinkFile(file)
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
                itemType="audio_file"
                isOpen={isRenameOpen}
                onOpenChange={setRenameOpen}
                getItemId={groupId}
                getItemData={reload}
            />
            <DialogDeleteItem
                item={file}
                itemType="audio_file"
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
                className={cn(
                    "group flex items-center gap-1 border pl-2 pr-1 bg-background hover:bg-secondary rounded-xs text-xs",
                    isCurrent && "border-primary"
                )}
            >
                <button
                    type="button"
                    aria-current={isCurrent ? "true" : undefined}
                    title={file.path}
                    onClick={() => void playFile(file)}
                    className={cn(focusRing, "flex min-w-0 flex-1 items-center gap-2 py-1 rounded-xs cursor-pointer text-left")}
                >
                    <StateIcon className={cn("shrink-0", state === "ended" ? "size-3.5 mx-px fill-current" : "size-4", isCurrent ? "text-primary" : "text-muted-foreground", state === "playing" && "motion-safe:animate-pulse")} />
                    <span className={cn("flex-1 truncate", missing && "text-muted-foreground")}>{file.name}</span>
                    {missing && <TriangleAlert className="size-4 shrink-0 text-destructive" role="img" aria-label={t("audio.missing.title")} />}
                    {state && <span className="sr-only">{t(`audio.${state === "playing" ? "nowPlaying" : state}`)}</span>}
                </button>
                <div className="flex items-center leading-none shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <ItemMenuButton name={file.name} />
                </div>
            </div>
        </ItemMenu>
    )
}

type GroupAudioFilesProps = {
    groupId: number
}

/**
 * Compact list of the audio files attached to a group. A file plays only when it is clicked.
 * @category Group
 */
export const GroupAudioFiles = ({ groupId }: GroupAudioFilesProps) => {
    const { t } = useTranslation()
    const files = useGroupAudioFiles(groupId)
    const missing = useMissingPaths(files)
    if (files.length === 0) return null

    return (
        <div role="list" className="flex flex-col gap-1" aria-label={t("audio.files")}>
            {files.map(file => (
                <AudioFileRow key={file.id} file={file} groupId={groupId} missing={missing.has(file.path)} />
            ))}
        </div>
    )
}
