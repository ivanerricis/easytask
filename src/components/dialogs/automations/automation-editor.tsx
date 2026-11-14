import { useTranslation } from "react-i18next"
import { useEffect, useId, useRef } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TooltipCustom } from "@/components/tooltip-custom"
import type { Tag } from "@/types/types"
import { PALETTE_COLORS } from "@/lib/colors"
import { MAX_NAME_LENGTH } from "@/lib/names"
import { actionLabel, colorName, describeAutomation, triggerLabel, type SectionName } from "@/lib/automations/describe"
import {
    TRIGGER_TYPES, actionsForTrigger, isGroupTrigger, isStateTrigger, triggerSubject,
    type AutomationAction, type AutomationDraft, type AutomationTrigger,
} from "@/lib/automations/types"
import { cn } from "@/lib/utils"
import { defaultAction, defaultActions, defaultTrigger, sameActions, type GroupOption, type SectionOption, type Step } from "./model"

type AutomationEditorProps = {
    step: Step
    draft: AutomationDraft
    groups: GroupOption[]
    sections: SectionOption[]
    titleOf: (id: number) => SectionName | undefined
    groupLabelOf: (id: number) => string | undefined
    /** The tags of the workspace of the note, for the tag actions. */
    tags: Tag[]
    tagNameOf: (id: number) => string | undefined
    /** The section / group the dialog was opened for: where a new state trigger starts. */
    openedSectionId: number | null
    openedGroupId: number | null
    onChange: (draft: AutomationDraft) => void
}

// Radix Select items cannot have an empty value: these stand for "any section" and "no color"
const ANY = "any"
const NO_COLOR = "none"

/** A select whose value is a section id (grouped by group); a missing section is shown as such instead of silently picking another one. */
const SectionSelect = ({ value, groups, sections, onChange, allowAny, noDirect, label, className, id }: {
    value: number | null, groups: GroupOption[], sections: SectionOption[], onChange: (id: number | null) => void,
    /** `noDirect` leaves out the direct area of the groups (the state triggers color the visible sections only). */
    allowAny?: boolean, noDirect?: boolean, label: string, className?: string, id?: string,
}) => {
    const { t } = useTranslation()
    const missing = value !== null && !sections.some(section => section.id === value)
    return (
        <Select value={value === null ? ANY : String(value)} onValueChange={next => onChange(next === ANY ? null : Number(next))}>
            <SelectTrigger id={id} aria-label={label} className={cn("w-full", className)}><SelectValue /></SelectTrigger>
            <SelectContent>
                {allowAny && <SelectItem value={ANY}>{t("automations.anySection")}</SelectItem>}
                {missing && <SelectItem value={String(value)}>{t("automations.describe.missingSection")}</SelectItem>}
                {groups.filter(group => group.sections.length > 0 || (group.direct && !noDirect)).map(group => (
                    <SelectGroup key={group.id}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.direct && !noDirect && <SelectItem value={String(group.direct.id)}>{group.direct.title}</SelectItem>}
                        {group.sections.map(section => <SelectItem key={section.id} value={String(section.id)}>{section.title}</SelectItem>)}
                    </SelectGroup>
                ))}
            </SelectContent>
        </Select>
    )
}

/** A select whose value is a group of the note ("any group" = null); a missing group is shown as such. */
const GroupSelect = ({ value, groups, onChange, label, id }: {
    value: number | null, groups: GroupOption[], onChange: (id: number | null) => void, label: string, id?: string,
}) => {
    const { t } = useTranslation()
    const missing = value !== null && !groups.some(group => group.id === value)
    return (
        <Select value={value === null ? ANY : String(value)} onValueChange={next => onChange(next === ANY ? null : Number(next))}>
            <SelectTrigger id={id} aria-label={label} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
                <SelectItem value={ANY}>{t("automations.anyGroup")}</SelectItem>
                {missing && <SelectItem value={String(value)}>{t("automations.describe.missingGroup")}</SelectItem>}
                {groups.map(group => <SelectItem key={group.id} value={String(group.id)}>{group.label}</SelectItem>)}
            </SelectContent>
        </Select>
    )
}

/** A select of fixed choices (label = translated text). */
function ChoiceSelect<T extends string>({ value, options, onChange, label, className }: {
    value: T, options: readonly { value: T, label: string }[], onChange: (value: T) => void, label: string, className?: string,
}) {
    return (
        <Select value={value} onValueChange={next => onChange(next as T)}>
            <SelectTrigger aria-label={label} className={cn("w-full", className)}><SelectValue /></SelectTrigger>
            <SelectContent>
                {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
        </Select>
    )
}

const ColorDot = ({ color }: { color: string | null }) => (
    // Inline so the trigger can truncate its value; inside the list the item already spaces it with a gap
    <span aria-hidden className="inline-block size-3.5 shrink-0 rounded-full align-[-0.2em] ring-1 ring-inset ring-foreground/20 in-data-[slot=select-value]:me-2" style={color ? { backgroundColor: color } : undefined} />
)

export const AutomationEditor = ({ step, draft, groups, sections, titleOf, groupLabelOf, tags, tagNameOf, openedSectionId, openedGroupId, onChange }: AutomationEditorProps) => {
    const { t } = useTranslation()
    const nameId = useId()
    const enabledId = useId()
    const whereId = useId()
    const container = useRef<HTMLDivElement>(null)
    const { trigger, actions } = draft
    const groupTrigger = isGroupTrigger(trigger.type)
    // A workspace without tags offers no tag action (unless the rule already has one: it is shown as a missing tag)
    const allowedActions = actionsForTrigger(trigger.type).filter(type => (type !== "addTag" && type !== "removeTag") || tags.length > 0 || actions.some(action => action.type === type))
    // The section of the trigger: a group trigger has none
    const triggerSection = "sectionId" in trigger ? trigger.sectionId : null
    // A state trigger only has the color: the "add action" button goes away once it is used
    const canAddAction = !isStateTrigger(trigger.type) || allowedActions.some(type => !actions.some(action => action.type === type))

    // Every step starts with the focus on its first control
    useEffect(() => {
        container.current?.querySelector<HTMLElement>("input, [role='combobox'], button:not(:disabled)")?.focus()
    }, [step])

    const setAction = (index: number, action: AutomationAction) =>
        onChange({ ...draft, actions: actions.map((item, i) => i === index ? action : item) })

    return (
        <div ref={container} className="flex flex-col gap-4">
            {step === 0 && (
                <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">{t("automations.whenHint")}</p>
                    <div className="grid gap-3">
                        <ChoiceSelect label={t("automations.steps.when")} value={trigger.type}
                            options={TRIGGER_TYPES.map(type => ({ value: type, label: triggerLabel(type) }))}
                            onChange={type => {
                                // A state trigger starts on the section / group the dialog was opened for
                                const next = defaultTrigger(type, triggerSection ?? openedSectionId, sections, openedGroupId)
                                // Other subject or kind: the actions of the old trigger no longer apply
                                if (sameActions(type, trigger.type)) onChange({ ...draft, trigger: next })
                                else onChange({ ...draft, trigger: next, actions: defaultActions(type, sections, null) })
                            }} />
                        <div className="grid gap-1.5">
                        <Label htmlFor={whereId}>{t(groupTrigger ? "automations.group" : "automations.where")}</Label>
                        {"groupId" in trigger ? (
                            <GroupSelect
                                id={whereId}
                                label={t("automations.group")}
                                value={trigger.groupId}
                                groups={groups}
                                onChange={id => onChange({ ...draft, trigger: { type: trigger.type, groupId: id } as AutomationTrigger })}
                            />
                        ) : (
                            <SectionSelect
                                id={whereId}
                                label={t("automations.where")}
                                value={trigger.sectionId}
                                groups={groups}
                                sections={sections}
                                allowAny={trigger.type !== "task.movedInto"}
                                noDirect={isStateTrigger(trigger.type)}
                                onChange={id => onChange({ ...draft, trigger: defaultTrigger(trigger.type, id, sections) })}
                            />
                        )}
                        </div>
                    </div>
                </div>
            )}

            {step === 1 && (
                <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">{t("automations.thenHint")}</p>
                    {actions.map((action, index) => (
                        // One block per action: the type on the first line, its parameters on the second, so the layout never
                        // depends on the chosen action or on the length of the section names
                        <div key={index} className="grid gap-2 rounded-xs border p-2">
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                <ChoiceSelect label={t("automations.actionType")} value={action.type}
                                    options={allowedActions.map(type => ({ value: type, label: actionLabel(type) }))}
                                    onChange={type => setAction(index, defaultAction(type, sections, triggerSection, tags))} />
                                <TooltipCustom text={t("automations.removeAction")}>
                                    <Button variant="ghost" size="icon" type="button" aria-label={t("automations.removeAction")}
                                        onClick={() => onChange({ ...draft, actions: actions.filter((_, i) => i !== index) })}>
                                        <X />
                                    </Button>
                                </TooltipCustom>
                            </div>
                            <ActionParams action={action} groups={groups} sections={sections} tags={tags} onChange={next => setAction(index, next)} />
                        </div>
                    ))}
                    {tags.length === 0 && triggerSubject(trigger.type) === "task" && !isStateTrigger(trigger.type) && (
                        <p className="text-xs text-muted-foreground">{t("automations.noTags")}</p>
                    )}
                    {canAddAction && (
                        <Button variant="outline" size="sm" type="button" className="justify-self-start"
                            onClick={() => {
                                const type = isStateTrigger(trigger.type)
                                    ? allowedActions.find(candidate => !actions.some(action => action.type === candidate)) ?? "setColor"
                                    : triggerSubject(trigger.type) === "group" ? "setColor" : "setPriority"
                                onChange({ ...draft, actions: [...actions, defaultAction(type, sections, triggerSection)] })
                            }}>
                            <Plus />
                            {t("automations.addAction")}
                        </Button>
                    )}
                </div>
            )}

            {step === 2 && (
                <>
                    <div className="grid gap-2">
                        <span className="text-sm font-medium">{t("automations.summaryTitle")}</span>
                        <p className="rounded-xs border bg-muted/40 p-3 text-sm break-words">{describeAutomation(draft, titleOf, groupLabelOf, tagNameOf)}</p>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor={nameId}>{t("automations.name")}</Label>
                        <Input id={nameId} value={draft.name ?? ""} maxLength={MAX_NAME_LENGTH}
                            onChange={e => onChange({ ...draft, name: e.target.value || null })} />
                    </div>
                    <div className="flex items-center gap-2 min-h-6">
                        <Switch id={enabledId} checked={draft.enabled} onCheckedChange={enabled => onChange({ ...draft, enabled })} />
                        <Label htmlFor={enabledId}>{t("automations.enabled")}</Label>
                    </div>
                </>
            )}
        </div>
    )
}

const ActionParams = ({ action, groups, sections, tags, onChange }: {
    action: AutomationAction, groups: GroupOption[], sections: SectionOption[], tags: Tag[], onChange: (action: AutomationAction) => void,
}) => {
    const { t } = useTranslation()
    const label = actionLabel(action.type)
    switch (action.type) {
        case "moveTo":
            return (
                <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
                    <SectionSelect label={label} value={action.sectionId} groups={groups} sections={sections}
                        onChange={id => { if (id !== null) onChange({ ...action, sectionId: id }) }} />
                    <ChoiceSelect label={t("automations.position")} value={action.at}
                        options={[{ value: "top", label: t("settings.notes.newTaskPosition.top") }, { value: "bottom", label: t("settings.notes.newTaskPosition.bottom") }]}
                        onChange={at => onChange({ ...action, at })} />
                </div>
            )
        case "setCompleted":
            return (
                <ChoiceSelect label={label} value={String(action.value)}
                    options={[{ value: "true", label: t("automations.values.completed") }, { value: "false", label: t("automations.values.open") }]}
                    onChange={value => onChange({ ...action, value: value === "true" })} />
            )
        case "setPriority":
            return (
                <ChoiceSelect label={label} value={String(action.value)}
                    options={[{ value: "true", label: t("tasks.menu.addPriority") }, { value: "false", label: t("tasks.menu.removePriority") }]}
                    onChange={value => onChange({ ...action, value: value === "true" })} />
            )
        case "setColor": {
            // A color picked elsewhere (not in the palette) stays selectable
            const colors: string[] = [...PALETTE_COLORS]
            if (action.color && !colors.includes(action.color)) colors.unshift(action.color)
            return (
                <Select value={action.color ?? NO_COLOR} onValueChange={color => onChange({ ...action, color: color === NO_COLOR ? null : color })}>
                    <SelectTrigger aria-label={label} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NO_COLOR}><ColorDot color={null} />{t("automations.values.noColor")}</SelectItem>
                        {colors.map(color => <SelectItem key={color} value={color}><ColorDot color={color} />{colorName(color)}</SelectItem>)}
                    </SelectContent>
                </Select>
            )
        }
        case "addTag":
        case "removeTag": {
            const missing = !tags.some(tag => tag.id === action.tagId)
            return (
                <Select value={String(action.tagId)} onValueChange={value => onChange({ ...action, tagId: Number(value) })}>
                    <SelectTrigger aria-label={t("automations.tag")} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {missing && <SelectItem value={String(action.tagId)}>{t("automations.describe.missingTag")}</SelectItem>}
                        {tags.map(tag => <SelectItem key={tag.id} value={String(tag.id)}><ColorDot color={tag.color} />{tag.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            )
        }
        case "moveGroup":
            return (
                <ChoiceSelect label={label} value={action.at}
                    options={[{ value: "top", label: t("settings.notes.newTaskPosition.top") }, { value: "bottom", label: t("settings.notes.newTaskPosition.bottom") }]}
                    onChange={at => onChange({ ...action, at })} />
            )
        case "completeSubtasks":
        case "archiveGroup":
            return null
    }
}
