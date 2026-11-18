import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { AutoTextarea } from "@/components/auto-textarea"
import { InlineErrorTooltip } from "@/components/inline-error-tooltip"
import { cn } from "@/lib/utils"
import { SearchedTaskText } from "./SearchedTaskText"
import { TASK_TEXT_CLASS, TASK_TEXT_WRAP } from "./task-row-styles"
import type { useInlineEdit } from "@/hooks/use-inline-edit"

type InlineEdit = ReturnType<typeof useInlineEdit<HTMLTextAreaElement>>

type TaskRowTextProps = {
    text: string
    completed: boolean
    /** The text size of the density. */
    textClass: string
    editing: boolean
    error: string | null
    inputProps: InlineEdit["inputProps"]
    /** Search in the note: while it has a query the text is drawn with the matches highlighted. */
    searchQuery: string
    searchActive: number
    renameOnClick: boolean
    startEdit: () => void
    /** Tab index of the text: undefined on the tab stop of the list, -1 on the other rows. */
    inner: number | undefined
    /** Enter / Escape in the rename field: the row takes the focus back when the field is gone. */
    onEditEnd: () => void
}

const isPlainEnter = (e: { key: string, shiftKey: boolean }) => e.key === "Enter" && !e.shiftKey

/**
 * A press of a button other than the main one (the right click that opens the menu) must not put the focus in the
 * read only text: the field would show its caret / focus look for a moment, like an editable one. The focus goes to the
 * row, as the click on the text does, so the task is still shown in the details.
 */
const keepFocusOnRow = (e: MouseEvent<HTMLTextAreaElement>) => {
    if (e.button === 0) return
    e.preventDefault()
    e.currentTarget.closest<HTMLElement>("[role='treeitem']")?.focus()
}

/** The text of a task in one of its three states: highlighted by the search, read only, or being renamed. */
export function TaskRowText({ text, completed, textClass, editing, error, inputProps, searchQuery, searchActive, renameOnClick, startEdit, inner, onEditEnd }: TaskRowTextProps) {
    const { t } = useTranslation()
    if (editing) return (
        <InlineErrorTooltip message={error}><AutoTextarea
            {...inputProps}
            onKeyDown={e => {
                if (isPlainEnter(e) || e.key === "Escape") onEditEnd()
                inputProps.onKeyDown(e)
            }}
            onPointerDown={e => e.stopPropagation()}
            minRows={1}
            className={cn(TASK_TEXT_CLASS, textClass)}
        /></InlineErrorTooltip>
    )
    const onClick = renameOnClick ? startEdit : undefined
    // Enter always renames (the way for the keyboard when the click does not)
    const onKeyDown = (e: { key: string, shiftKey: boolean, preventDefault: () => void }) => {
        if (isPlainEnter(e)) {
            e.preventDefault()
            startEdit()
        }
    }
    const state = cn(!renameOnClick && "cursor-default", completed && "line-through text-muted-foreground")
    if (searchQuery) return (
        <SearchedTaskText
            text={text}
            query={searchQuery}
            active={searchActive}
            label={t("tasks.editText")}
            tabIndex={inner ?? 0}
            onClick={onClick}
            onKeyDown={onKeyDown}
            className={cn(TASK_TEXT_WRAP, textClass, state)}
        />
    )
    return (
        <AutoTextarea
            onClick={onClick}
            onKeyDown={onKeyDown}
            aria-label={t("tasks.editText")}
            onMouseDown={keepFocusOnRow}
            tabIndex={inner}
            value={text}
            // Read only until the click opens the editing: a right click here opens the menu of the task, not the one of a text field
            readOnly
            className={cn(TASK_TEXT_CLASS, textClass, state)}
        />
    )
}
