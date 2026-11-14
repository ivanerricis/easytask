import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Loader2, Plus, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "./dialog-confirm"
import { createDBAutomation, deleteDBAutomation, setDBAutomationEnabled, updateDBAutomation } from "@/db/queries/automation"
import { automationName } from "@/lib/automations/describe"
import type { Automation, AutomationDraft, AutomationTrigger } from "@/lib/automations/types"
import { useSubmitOnce } from "@/hooks/use-submit-once"
import { useAutomations } from "@/hooks/use-automations"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { FormError } from "@/components/form-error"
import { AutomationEmpty, AutomationList } from "./automations/automation-list"
import { AutomationEditor } from "./automations/automation-editor"
import { EditorButtons } from "./automations/editor-buttons"
import { StepIndicator } from "./automations/step-indicator"
import { useAutomationDialogData } from "./automations/use-automation-dialog-data"
import { LAST_STEP, defaultActions, stepReachable, stepValid, type Step } from "./automations/model"

type DialogAutomationsProps = {
    noteId: number
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    /** Opened from a section: a new rule starts on it. */
    sectionId?: number
    /** Opened from a group: a new rule starts on it ("all its tasks are completed, archive it"). */
    groupId?: number
}

/**
 * The automations of a note: list (on/off, edit, delete) and the "When … Then …" editor.
 * The rules are read and written directly in the database: the next task action of the note uses them.
 * @category Dialogs
 */
export const DialogAutomations = ({ noteId, isOpen, onOpenChange, sectionId, groupId }: DialogAutomationsProps) => {
    const { t } = useTranslation()
    const { rules, setRules, groups, loaded, error, setError, sections, titleOf, groupLabelOf, tags, tagNameOf, reload } = useAutomationDialogData(noteId, isOpen)
    // The rule being edited (id null = a new one), null while the list is shown; `initial` is the draft as the editor opened
    const [editing, setEditing] = useState<{ id: number | null, draft: AutomationDraft, initial: string, step: Step } | null>(null)
    const [deleting, setDeleting] = useState<Automation | null>(null)
    // Closing or cancelling an edited draft asks first: which of the two is waiting for the answer
    const [discarding, setDiscarding] = useState<"close" | "cancel" | null>(null)
    const { saving, run } = useSubmitOnce()
    const { sync } = useAutomations()
    // The state rules (colors by open tasks) align the open note right away; not awaited, the list does not wait for it
    const resync = () => { sync().catch(err => reportError(err, getErrorMessage(err))) }

    const openEditor = (id: number | null, draft: AutomationDraft) => {
        setError(null)
        // A new rule starts from the trigger, an existing one from its summary
        setEditing({ id, draft, initial: JSON.stringify(draft), step: id === null ? 0 : LAST_STEP })
    }
    const dirty = editing !== null && JSON.stringify(editing.draft) !== editing.initial

    const startNew = () => {
        const trigger: AutomationTrigger = groupId !== undefined
            ? { type: "group.completed", groupId }
            : { type: "task.completed", sectionId: sectionId ?? null }
        const avoid = "sectionId" in trigger ? trigger.sectionId : null
        openEditor(null, { name: null, enabled: true, trigger, actions: defaultActions(trigger.type, sections, avoid) })
    }

    const goTo = (step: Step) => {
        if (!editing || !stepReachable(step, editing.draft)) return
        setError(null)
        setEditing({ ...editing, step })
    }

    const save = () => run(async () => {
        if (!editing) return
        if (editing.draft.actions.length === 0) {
            setError(t("automations.errors.noActions"))
            return
        }
        if (!stepValid(1, editing.draft)) return
        try {
            if (editing.id === null) await createDBAutomation(noteId, editing.draft)
            else await updateDBAutomation(editing.id, editing.draft)
            toast.success(t("automations.saved"))
            setEditing(null)
            resync()
            await reload()
        } catch (err) {
            setError(getErrorMessage(err))
        }
    })

    const toggle = (rule: Automation, enabled: boolean) => run(async () => {
        setRules(list => list.map(item => item.id === rule.id ? { ...item, enabled } : item))
        try {
            await setDBAutomationEnabled(rule.id, enabled)
            resync()
        } catch (err) {
            setRules(list => list.map(item => item.id === rule.id ? { ...item, enabled: rule.enabled } : item))
            setError(getErrorMessage(err))
        }
    })

    const remove = (rule: Automation) => run(async () => {
        try {
            await deleteDBAutomation(rule.id)
            toast.success(t("automations.deletedToast"))
            resync()
            await reload()
        } catch (err) {
            setError(getErrorMessage(err))
        }
    })

    const handleOpenChange = (open: boolean) => {
        if (!open && dirty) {
            setDiscarding("close")
            return
        }
        if (!open) {
            setEditing(null)
            setError(null)
        }
        onOpenChange(open)
    }

    const cancelEditing = () => {
        if (dirty) setDiscarding("cancel")
        else { setEditing(null); setError(null) }
    }

    const discard = () => {
        const wasClosing = discarding === "close"
        setEditing(null)
        setError(null)
        if (wasClosing) onOpenChange(false)
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                {/* The header and the footer stay visible: only the editor scrolls when the rule is taller than the window */}
                <DialogContent className="sm:max-w-xl flex flex-col max-h-[min(640px,85vh)] min-h-[min(480px,85vh)] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="size-4" />
                            {editing ? t(editing.id === null ? "automations.add" : "automations.editTitle") : t("automations.title")}
                        </DialogTitle>
                        <DialogDescription>{t("automations.description")}</DialogDescription>
                    </DialogHeader>

                    {!loaded ? (
                        <div role="status" aria-busy="true" className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> {t("common.loading")}
                        </div>
                    ) : editing ? (
                        <>
                            <StepIndicator step={editing.step} draft={editing.draft} onSelect={goTo} />
                            {/* Enter in the name field (the only text input) saves on the last step, goes on otherwise */}
                            <form className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 py-1"
                                onSubmit={event => {
                                    event.preventDefault()
                                    if (editing.step === LAST_STEP) void save()
                                    else goTo((editing.step + 1) as Step)
                                }}>
                                <AutomationEditor
                                    step={editing.step}
                                    draft={editing.draft}
                                    groups={groups}
                                    sections={sections}
                                    titleOf={titleOf}
                                    groupLabelOf={groupLabelOf}
                                    tags={tags}
                                    tagNameOf={tagNameOf}
                                    openedSectionId={sectionId ?? null}
                                    openedGroupId={groupId ?? null}
                                    onChange={draft => { setError(null); setEditing({ ...editing, draft }) }}
                                />
                            </form>
                            {!stepValid(editing.step, editing.draft) && (
                                <p className="text-xs text-muted-foreground">
                                    {t(editing.draft.actions.length === 0 ? "automations.errors.noActions" : "automations.errors.invalidActions")}
                                </p>
                            )}
                        </>
                    ) : sections.length === 0 ? (
                        <p className="py-6 text-center text-muted-foreground text-sm">{t("automations.noSections")}</p>
                    ) : rules.length === 0 ? (
                        <AutomationEmpty onAdd={startNew} />
                    ) : (
                        <AutomationList
                            rules={rules}
                            titleOf={titleOf}
                            groupLabelOf={groupLabelOf}
                            tagNameOf={tagNameOf}
                            onToggle={(rule, checked) => void toggle(rule, checked)}
                            onEdit={rule => openEditor(rule.id, { name: rule.name, enabled: rule.enabled, trigger: rule.trigger, actions: rule.actions })}
                            onDelete={setDeleting}
                        />
                    )}

                    {error && <FormError>{error}</FormError>}

                    {/* mt-auto: with few or no rules the buttons stay at the bottom of the (minimum height) dialog */}
                    <DialogFooter className={editing ? "mt-auto sm:justify-between" : "mt-auto"}>
                        {editing ? (
                            <>
                                <EditorButtons
                                    step={editing.step}
                                    valid={stepValid(editing.step, editing.draft)}
                                    saving={saving}
                                    onCancel={cancelEditing}
                                    onGoTo={goTo}
                                    onSave={() => void save()}
                                />
                            </>
                        ) : (
                            <>
                                <Button variant="outline" type="button" onClick={() => handleOpenChange(false)}>
                                    {t("common.close")}
                                </Button>
                                {/* The empty state has its own "new" button */}
                                {loaded && (rules.length > 0 || sections.length === 0) && (
                                    <Button type="button" onClick={startNew} disabled={sections.length === 0}>
                                        <Plus />
                                        {t("automations.add")}
                                    </Button>
                                )}
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ConfirmDialog
                open={discarding !== null}
                onOpenChange={open => { if (!open) setDiscarding(null) }}
                title={t("automations.discardConfirm.title")}
                description={t("automations.discardConfirm.description")}
                destructive
                irreversible
                confirm={{ label: t("automations.discardConfirm.confirm"), icon: Trash2, onClick: discard }}
            />
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={open => { if (!open) setDeleting(null) }}
                title={t("automations.deleteConfirm.title")}
                description={deleting ? automationName(deleting, titleOf, groupLabelOf, tagNameOf) : undefined}
                destructive
                irreversible
                confirm={{ label: t("common.delete"), icon: Trash2, onClick: () => { if (deleting) return remove(deleting) } }}
            />
        </>
    )
}
