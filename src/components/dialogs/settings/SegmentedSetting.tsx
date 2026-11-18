import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { segmentedGroupClass, segmentedItemClass } from "@/components/ui/toggle-variants"
import { cn } from "@/lib/utils"
import { SettingsRow } from "./SettingsRow"

type SegmentedSettingProps<T extends string> = {
    label: string
    description?: string
    value: T
    options: readonly { value: T, label: string }[]
    onChange: (value: T) => void
    /** Classes of the segmented control, e.g. a fixed width (its options always share it equally). */
    className?: string
}

/** A setting with a few mutually exclusive values, as a row with a segmented control (a ToggleGroup: arrows move between the values). */
export function SegmentedSetting<T extends string>({ label, description, value, options, onChange, className }: SegmentedSettingProps<T>) {
    return (
        <SettingsRow label={label} description={description}>
            {({ id, labelId, descriptionId }) => (
                <ToggleGroup
                    id={id}
                    type="single"
                    variant="outline"
                    size="sm"
                    value={value}
                    // Pressing the selected value again would leave the group empty: a setting always has a value
                    onValueChange={next => { if (next) onChange(next as T) }}
                    aria-labelledby={labelId}
                    aria-describedby={descriptionId}
                    className={cn(segmentedGroupClass, className)}
                >
                    {options.map(option => (
                        <ToggleGroupItem key={option.value} value={option.value} className={segmentedItemClass}>
                            {option.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            )}
        </SettingsRow>
    )
}
