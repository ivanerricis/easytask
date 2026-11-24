import { useCallback, useEffect, useMemo, useRef } from "react"
import { useDraggable } from "@dnd-kit/core"
import { AudioPlayer } from "./audio-player"
import { useAudio } from "@/contexts/use-audio"
import { usePreferences } from "@/contexts/use-preferences"
import { trackPath } from "@/lib/audio-track-path"
import { useShortcut } from "@/hooks/use-shortcut"

type Props = {
    position: { x: number; y: number, scaleX: number, scaleY: number }
}

export const DraggableAudioPlayer = ({ position }: Props) => {
    const { track, filesCache, closePlayer, reportPlaybackError, toggleSeq, setPlaybackState, togglePlayback } = useAudio()
    const { audioVolume, setAudioVolume, audioPlayerVisible, audioPlayerPinned, setAudioPlayerPinned, audioPlayerScale, audioPlayerOpacity, reportAudioPlayerSize, audioPlaybackRate, setAudioPlaybackRate, audioRepeat, audioResume, audioLoudnessMeter } = usePreferences()
    const path = useMemo(() => track && filesCache ? trackPath(track, filesCache) : null, [track, filesCache])
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: "audio-player",
        disabled: audioPlayerPinned,
    })

    const nodeRef = useRef<HTMLDivElement | null>(null)
    const setRefs = useCallback((node: HTMLDivElement | null) => {
        nodeRef.current = node
        setNodeRef(node)
    }, [setNodeRef])
    const visible = track !== null && audioPlayerVisible

    // The real size (zoom included: the outer box has no zoom of its own) keeps the default and the clamped positions inside the window
    useEffect(() => {
        const node = nodeRef.current
        if (!visible || !node) return
        const measure = () => reportAudioPlayerSize({ width: node.offsetWidth, height: node.offsetHeight })
        measure()
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
        observer?.observe(node)
        return () => {
            observer?.disconnect()
            reportAudioPlayerSize(null)
        }
    }, [visible, reportAudioPlayerSize])

    // Play / pause from anywhere in the workspace while the player is open
    useShortcut("toggle-audio", togglePlayback, { enabled: visible })

    // Only the transform places the box (top/left stay 0): at the drop nothing is promoted to or demoted from a compositor layer
    // and no layout property changes, so the box cannot show one frame at the old position
    const style = {
        position: "absolute" as const,
        top: 0,
        left: 0,
        transform: `translate3d(${position.x + (transform?.x ?? 0)}px, ${position.y + (transform?.y ?? 0)}px, 0)`,
        willChange: "transform" as const,
        zIndex: 50,
    }

    // Nothing is shown until the user clicks an audio file (nothing autoplays); the player can also be turned off in the settings
    if (!track || !audioPlayerVisible) return null

    return (
        <div ref={setRefs} style={style}>
            {/* zoom (not transform) resizes the layout box, so the dnd-kit modifiers keep the real size inside the window */}
            <div style={{ zoom: audioPlayerScale, opacity: audioPlayerOpacity }} data-testid="audio-player-frame">
                <AudioPlayer
                    src={track.src}
                    fileName={track.name}
                    autoPlayKey={track.playId}
                    toggleKey={toggleSeq}
                    onStateChange={setPlaybackState}
                    onClose={closePlayer}
                    onError={reportPlaybackError}
                    listenersHandle={listeners}
                    attributesHandle={attributes}
                    volume={audioVolume}
                    onVolumeChange={setAudioVolume}
                    pinned={audioPlayerPinned}
                    onPinnedChange={setAudioPlayerPinned}
                    playbackRate={audioPlaybackRate}
                    onPlaybackRateChange={setAudioPlaybackRate}
                    repeat={audioRepeat}
                    audioId={track.audioId}
                    resume={audioResume}
                    path={path ?? undefined}
                    loudnessMeter={audioLoudnessMeter}
                />
            </div>
        </div>
    )
}