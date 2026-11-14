import { useCallback, useEffect, useMemo, useState } from "react"
import { getErrorMessage } from "@/lib/utils"
import type { SectionName } from "@/lib/automations/describe"
import type { Automation } from "@/lib/automations/types"
import type { Tag } from "@/types/types"
import { loadDialogData, type DialogData, type GroupOption } from "./model"

/**
 * The rules and the groups / sections of a note, loaded at every opening of the dialog (and again on `reload`).
 * `error` is shared with the dialog, which sets it for its own failures too.
 */
export function useAutomationDialogData(noteId: number, isOpen: boolean) {
    const [rules, setRules] = useState<Automation[]>([])
    const [groups, setGroups] = useState<GroupOption[]>([])
    const [tags, setTags] = useState<Tag[]>([])
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const sections = useMemo(() => groups.flatMap(group => group.direct ? [group.direct, ...group.sections] : group.sections), [groups])
    const titleOf = useCallback((id: number): SectionName | undefined => {
        const section = sections.find(candidate => candidate.id === id)
        return section?.group !== undefined ? { group: section.group } : section?.title
    }, [sections])
    const groupLabelOf = useCallback((id: number) => groups.find(group => group.id === id)?.label, [groups])
    const tagNameOf = useCallback((id: number) => tags.find(tag => tag.id === id)?.name, [tags])

    const reload = useCallback(() => loadDialogData(noteId).then((data: DialogData) => {
        setRules(data.rules)
        setGroups(data.groups)
        setTags(data.tags)
        setError(null)
    }, (err: unknown) => setError(getErrorMessage(err))), [noteId])

    // Closing resets the editor (handleOpenChange): every opening shows the list, reloaded
    useEffect(() => {
        if (!isOpen) return
        void reload().finally(() => setLoaded(true))
        return () => setLoaded(false)
    }, [isOpen, reload])

    return { rules, setRules, groups, loaded, error, setError, sections, titleOf, groupLabelOf, tags, tagNameOf, reload }
}
