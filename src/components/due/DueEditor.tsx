import { useState } from "react"
import { useTranslation } from "react-i18next"
import { enUS, it } from "react-day-picker/locale"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addDays, fromDueDate, isValidDueDate, isValidDueTime, toDueDate, type DueValue } from "@/lib/due-date"

type DueEditorProps = {
    /** The current due date and time of the task (null date = none). */
    value: DueValue
    /** Sets the picked date and optional time. */
    onSave: (value: DueValue) => void
    onClear: () => void
    saving?: boolean
}

/** The picker of a due date: a calendar, quick days, an optional time. Nothing is saved until "Set". */
export function DueEditor({ value, onSave, onClear, saving = false }: DueEditorProps) {
    const { t, i18n } = useTranslation()
    const [date, setDate] = useState<string | null>(isValidDueDate(value.date) ? value.date : null)
    const [time, setTime] = useState<string>(isValidDueTime(value.time) ? value.time : "")
    const today = toDueDate(new Date())
    const pick = (day: string) => setDate(day)
    const validTime = time === "" || isValidDueTime(time)

    return (
        <div className="flex flex-col gap-3" data-testid="due-editor">
            <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => pick(today)}>{t("tasks.due.today")}</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => pick(addDays(today, 1))}>{t("tasks.due.tomorrow")}</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => pick(addDays(today, 7))}>{t("tasks.due.nextWeek")}</Button>
            </div>
            <Calendar
                mode="single"
                locale={i18n.language.startsWith("it") ? it : enUS}
                selected={date ? fromDueDate(date) : undefined}
                defaultMonth={date ? fromDueDate(date) : undefined}
                onSelect={day => setDate(day ? toDueDate(day) : null)}
                className="mx-auto p-0"
            />
            <div className="flex items-center gap-2">
                <Label htmlFor="due-time" className="shrink-0 text-sm">{t("tasks.due.time")}</Label>
                <Input
                    id="due-time"
                    type="time"
                    value={time}
                    onChange={event => setTime(event.target.value)}
                    aria-invalid={!validTime}
                    className="w-32"
                />
                {time !== "" &&
                    <Button type="button" variant="ghost" size="sm" onClick={() => setTime("")}>{t("tasks.due.removeTime")}</Button>}
            </div>
            <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={saving || !value.date} onClick={onClear}>{t("tasks.due.clear")}</Button>
                <Button type="button" size="sm" disabled={saving || !date || !validTime} onClick={() => { if (date) onSave({ date, time: time === "" ? null : time }) }}>{t("tasks.due.save")}</Button>
            </div>
        </div>
    )
}
