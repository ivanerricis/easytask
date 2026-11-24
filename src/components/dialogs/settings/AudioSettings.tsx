import { useState } from "react"
import { useTranslation } from "react-i18next"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { usePreferences } from "@/contexts/use-preferences"
import { AUDIO_PLAYER_SCALES, MIN_AUDIO_PLAYER_OPACITY, type AudioPlayerScale } from "@/lib/store/preferences"
import { SettingsCard, SettingsPanel, SettingsRow, SettingsSwitchRow } from "./SettingsRow"
import { SegmentedSetting } from "./SegmentedSetting"
import { SectionResetButton } from "./SectionResetButton"

/** Width of the controls of this page (the segmented one, the sliders): they all start at the same place, in every language. */
const CONTROL_WIDTH = "w-56"

const SIZE_KEYS: Record<AudioPlayerScale, "small" | "normal" | "large"> = { 0.85: "small", 1: "normal", 1.2: "large" }

const PercentRange = ({ label, value, min, onChange }: { label: string, value: number, min: number, onChange: (value: number) => void }) => {
    // The value shown while the thumb is dragged: the preference is set on release
    const [draft, setDraft] = useState<number | null>(null)
    const percent = Math.round((draft ?? value) * 100)
    return (
        <div className={`flex items-center gap-2 ${CONTROL_WIDTH}`}>
            <Slider
                min={min * 100}
                max={100}
                step={1}
                value={[percent]}
                deferChange
                onValueDrag={([next]) => setDraft(next / 100)}
                onValueChange={([next]) => onChange(next / 100)}
                onValueCommit={() => setDraft(null)}
                aria-label={label}
                aria-valuetext={`${percent}%`}
                className="flex-1 min-w-0"
            />
            <span aria-hidden className="w-10 text-right text-xs text-muted-foreground tabular-nums">{percent}%</span>
        </div>
    )
}

export const AudioSettings = () => {
    const { t } = useTranslation()
    const {
        resetPlayerPosition, resetAudioSettings,
        audioVolume, setAudioVolume,
        audioPlayerVisible, setAudioPlayerVisible,
        audioPlayerPinned, setAudioPlayerPinned,
        audioRepeat, setAudioRepeat,
        audioResume, setAudioResume,
        audioLoudnessMeter, setAudioLoudnessMeter,
        audioPlayerScale, setAudioPlayerScale,
        audioPlayerOpacity, setAudioPlayerOpacity,
    } = usePreferences()

    return (
        <SettingsPanel
            title={t("settings.audio.title")}
            action={<SectionResetButton title={t("settings.audio.resetAll.description")} onClick={resetAudioSettings} />}
        >
            <SettingsCard>
                <SettingsRow label={t("settings.audio.volume.label")} description={t("settings.audio.volume.description")}>
                    <PercentRange label={t("settings.audio.volume.label")} value={audioVolume} min={0} onChange={setAudioVolume} />
                </SettingsRow>
                <SettingsSwitchRow
                    label={t("settings.audio.playerVisible.label")}
                    description={t("settings.audio.playerVisible.description")}
                    checked={audioPlayerVisible}
                    onCheckedChange={setAudioPlayerVisible}
                />
                <SettingsSwitchRow
                    label={t("settings.audio.playerPinned.label")}
                    description={t("settings.audio.playerPinned.description")}
                    checked={audioPlayerPinned}
                    onCheckedChange={setAudioPlayerPinned}
                />
                <SegmentedSetting
                    label={t("settings.audio.playerSize.label")}
                    description={t("settings.audio.playerSize.description")}
                    value={String(audioPlayerScale)}
                    options={AUDIO_PLAYER_SCALES.map(value => ({ value: String(value), label: t(`settings.audio.playerSize.${SIZE_KEYS[value]}`) }))}
                    onChange={value => setAudioPlayerScale(Number(value) as AudioPlayerScale)}
                    className={CONTROL_WIDTH}
                />
                <SettingsRow label={t("settings.audio.playerOpacity.label")} description={t("settings.audio.playerOpacity.description")}>
                    <PercentRange label={t("settings.audio.playerOpacity.label")} value={audioPlayerOpacity} min={MIN_AUDIO_PLAYER_OPACITY} onChange={setAudioPlayerOpacity} />
                </SettingsRow>
                <SettingsSwitchRow
                    label={t("settings.audio.repeat.label")}
                    description={t("settings.audio.repeat.description")}
                    checked={audioRepeat}
                    onCheckedChange={setAudioRepeat}
                />
                <SettingsSwitchRow
                    label={t("settings.audio.resume.label")}
                    description={t("settings.audio.resume.description")}
                    checked={audioResume}
                    onCheckedChange={setAudioResume}
                />
                <SettingsSwitchRow
                    label={t("settings.audio.loudnessMeter.label")}
                    description={t("settings.audio.loudnessMeter.description")}
                    checked={audioLoudnessMeter}
                    onCheckedChange={setAudioLoudnessMeter}
                />
                <SettingsRow label={t("settings.audio.resetPlayer.label")} description={t("settings.audio.resetPlayer.description")}>
                    <Button variant="outline" size="sm" onClick={resetPlayerPosition}>
                        <RotateCcw />
                        {t("settings.audio.resetPlayer.button")}
                    </Button>
                </SettingsRow>
            </SettingsCard>
        </SettingsPanel>
    )
}
