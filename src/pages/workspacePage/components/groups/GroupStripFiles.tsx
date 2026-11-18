import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { TooltipCustom } from "@/components/tooltip-custom"
import { useGroupAudioFiles } from "@/contexts/use-audio"
import { useGroupMediaFiles } from "@/contexts/use-media"
import { GroupAudioFiles } from "./GroupAudioFiles"
import { GroupMediaFiles } from "./GroupMediaFiles"

/** At most this many files (the audio ones first) are shown as buttons; the rest is a "+N" button that opens the group. */
export const STRIP_MAX_FILES = 5

type GroupStripFilesProps = {
    groupId: number
    /** Opens the group (the "+N" button). */
    onOpen: () => void
}

/**
 * The audio, image and video files of a group closed as a strip: small square buttons one over the other (Play/Music icon or thumbnail),
 * and "+N" for the files that do not fit. Nothing is drawn (not even the gap) when the group has no files.
 * @category Group
 */
export const GroupStripFiles = ({ groupId, onOpen }: GroupStripFilesProps) => {
    const { t } = useTranslation()
    const audioCount = useGroupAudioFiles(groupId).length
    const mediaCount = useGroupMediaFiles(groupId).length
    const audioShown = Math.min(audioCount, STRIP_MAX_FILES)
    const mediaShown = Math.min(mediaCount, STRIP_MAX_FILES - audioShown)
    const more = audioCount + mediaCount - audioShown - mediaShown
    if (audioCount + mediaCount === 0) return null

    return (
        <div data-group-strip-files className="flex flex-col items-center gap-1">
            <GroupAudioFiles groupId={groupId} variant="strip" max={audioShown} />
            <GroupMediaFiles groupId={groupId} variant="strip" max={mediaShown} />
            {more > 0 && <TooltipCustom text={t("groups.moreFiles", { count: more })}>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onOpen}
                    aria-label={t("groups.moreFiles", { count: more })}
                    className="size-7 shrink-0 text-xs tabular-nums">
                    +{more}
                </Button>
            </TooltipCustom>}
        </div>
    )
}
