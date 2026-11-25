import { MAX_NAME_LENGTH } from "@/lib/names"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { useWorkspaceActions } from "@/contexts/workspace-data"
import { useActiveNoteId } from "@/contexts/use-tabs"
import { useActiveNoteActions } from "@/contexts/use-active-note"
import { useUndoRecorder } from "@/contexts/undo/use-undo"
import { useState, useRef, useEffect, useCallback } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import { toast } from "sonner"
import { reportError } from "@/lib/report-error"
import { getErrorMessage } from "@/lib/utils"
import { AddButton } from "./AddButton"
import { useShortcut } from "@/hooks/use-shortcut"
import { useAppCommand } from "@/lib/app-commands"
import { useSubmitOnce } from "@/hooks/use-submit-once"

type AddSectionFormProps = {
    inGroup?: boolean
    groupId?: number
    /**
     * Controlled mode (used by the group, which opens the form from its menu): the form is shown while this is true and
     * nothing is rendered while it is false (no "new section" button). It is focused and scrolled into view when it opens.
     */
    open?: boolean
    /** Controlled mode: called when the form is dismissed or submitted. */
    onClose?: () => void
}

export const AddSection = ({ inGroup, groupId, open, onClose }: AddSectionFormProps) => {
    const { t } = useTranslation()
    const controlled = open !== undefined
    const [innerOpen, setInnerOpen] = useState(false)
    const isOpen = controlled ? open : innerOpen
    const setOpen = useCallback((next: boolean) => {
        if (!controlled) setInnerOpen(next)
        else if (!next) onClose?.()
    }, [controlled, onClose])
    const [name, setName] = useState("")
    const { createGroup, createSectionInGroup } = useWorkspaceActions()
    const activeId = useActiveNoteId()
    const { appendGroup, appendSection } = useActiveNoteActions()
    const recorder = useUndoRecorder()
    const formRef = useRef<HTMLFormElement>(null)
    const { saving, run } = useSubmitOnce()

    const handleOpen = useCallback(() => {
        setOpen(!isOpen)
        setName("")
    }, [isOpen, setOpen])

    useShortcut("new-group", handleOpen, { enabled: !inGroup, allowInInputs: true })

    // The "New group" buttons (path bar, empty note) and the background menu ask for the same form (it only opens it)
    // The form sits at the end of a possibly long horizontal list: when asked from elsewhere it is scrolled into view
    const revealForm = useRef(false)
    useAppCommand("new-group", () => { revealForm.current = true; setOpen(true); setName("") }, { enabled: !inGroup })

    useEffect(() => {
        if (!isOpen || !(revealForm.current || controlled)) return
        revealForm.current = false
        // In a group the list is vertical: only the vertical position matters
        formRef.current?.scrollIntoView(controlled ? { block: "nearest" } : { inline: "end", block: "nearest" })
    }, [isOpen, controlled])

    // The listener reads the name through a ref, so it is not registered again at every keystroke
    const nameRef = useRef(name)
    useEffect(() => { nameRef.current = name }, [name])

    useEffect(() => {
        if (!isOpen) return
        const handleClickOutside = (event: MouseEvent) => {
            // Typed text is never lost with a click elsewhere: only an empty field closes
            if (formRef.current && !formRef.current.contains(event.target as Node) && !nameRef.current.trim()) {
                setOpen(false)
                setName("")
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [isOpen, setOpen])

    // Escape closes the form and discards the text, like a click outside
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Escape") return
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        setName("")
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        await run(async () => {
            try {
                if (activeId === null) return

                if (inGroup) {
                    if (!groupId) {
                        toast.error(t("errors.missingGroupId"))
                        return
                    }
                    const id = await createSectionInGroup(groupId, name.trim())
                    appendSection(id, groupId, name.trim())
                    recorder.create("section", id, name.trim())
                } else {
                    const { groupId: id, defaultSectionId } = await createGroup(activeId, name.trim())
                    appendGroup(id, activeId, name.trim(), defaultSectionId)
                    recorder.create("section_group", id, name.trim())
                }

                handleOpen()
            } catch (error) {
                reportError(error, getErrorMessage(error) || (inGroup ? t("errors.createSection") : t("errors.createGroup")))
            }
        })
    }

    if (!isOpen && controlled) return null

    // The group form has no button: it is asked for by the "new group" command (path bar button, shortcut, menus)
    if (!isOpen && !inGroup) return null

    return !isOpen ? (
        <AddButton onClick={handleOpen} />
    ) : (
        <form
            ref={formRef}
            onSubmit={handleSubmit}
            className={`animate-in fade-in-0 flex items-center bg-background border ${inGroup ? 'w-full' : 'w-fit'}`}
        >
            <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={inGroup ? t("sections.titlePlaceholder") : t("groups.namePlaceholder")}
                    aria-label={inGroup ? t("sections.titleLabel") : t("groups.nameLabel")}
                    autoFocus
                    maxLength={MAX_NAME_LENGTH}
                    readOnly={saving}
                    className={`rounded-none border-none text-sm ${inGroup ? 'flex-1' : 'w-fit'}`}
                />
        </form>
    )
}