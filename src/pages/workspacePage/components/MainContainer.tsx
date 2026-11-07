import { useCallback, useEffect, useMemo, type ReactNode } from "react"
import { CenterContainer } from "./CenterContainer"
import { SideBarLeft } from "./sidebar/SideBarLeft"
import { SideBarRight } from "./rightbar/SideBarRight"
import { RightPanelProvider } from "./rightbar/right-panel-context"
import { DndContext, type DragEndEvent } from "@dnd-kit/core"
import { restrictToParentElement } from "@dnd-kit/modifiers"
import { DraggableAudioPlayer } from "@/components/draggable-audio-player"
import { useTranslation } from "react-i18next"
import { buildDndAccessibility } from "@/lib/dnd-accessibility"
import { AUDIO_PLAYER_MEASURING } from "@/lib/audio-player-dnd"
import { usePreference } from "@/contexts/use-preference"
import { useTabShortcuts } from "@/hooks/use-tab-shortcuts"
import { useAutoCloseSidebars } from "./use-auto-close-sidebars"
import { WhatsNewTrigger } from "./whats-new/WhatsNewTrigger"


/** The audio player and the DnD that moves it: it follows the position, the rest of the container (children) does not. */
const AudioPlayerDnd = ({ children }: { children: ReactNode }) => {
    const { t } = useTranslation()
    const audioPlayerPosition = usePreference(p => p.audioPlayerPosition)
    const setAudioPlayerPosition = usePreference(p => p.setAudioPlayerPosition)
    const resetPlayerPosition = usePreference(p => p.resetPlayerPosition)
    const accessibility = useMemo(
        () => buildDndAccessibility(entry => entry.id === "audio-player" ? t("dnd.audioPlayer") : undefined, { keyboard: false }),
        [t])
    const modifiers = useMemo(() => [restrictToParentElement], [])

    useEffect(() => {
        if (audioPlayerPosition.x === 0 && audioPlayerPosition.y === 0)
            resetPlayerPosition()
    }, [audioPlayerPosition, resetPlayerPosition])

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        if (event.active.id === "audio-player") {
            setAudioPlayerPosition({
                x: audioPlayerPosition.x + event.delta.x,
                y: audioPlayerPosition.y + event.delta.y,
                scaleX: 1,
                scaleY: 1
            })
        }
    }, [audioPlayerPosition, setAudioPlayerPosition])

    return (
        <DndContext accessibility={accessibility} onDragEnd={handleDragEnd} modifiers={modifiers} measuring={AUDIO_PLAYER_MEASURING}>
            {children}
            <DraggableAudioPlayer position={audioPlayerPosition} />
        </DndContext>
    )
}

export const MainContainer = () => {
    const audioPlayerContainerRef = usePreference(p => p.audioPlayerContainerRef)
    useTabShortcuts()
    useAutoCloseSidebars()

    return (
        <div ref={audioPlayerContainerRef} className="flex flex-1 w-full h-full relative">
            <WhatsNewTrigger />
            <SideBarLeft />
            <RightPanelProvider>
                <AudioPlayerDnd>
                    <CenterContainer />
                </AudioPlayerDnd>
                <SideBarRight />
            </RightPanelProvider>
        </div >
    )
}
