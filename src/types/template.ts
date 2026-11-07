/**
 * Snapshot of a task (and, recursively, of its subtasks) stored in a template.
 * @category Types
 */
export type TemplateTask = {
    /** Archive date: only in the export files (a template never contains archived items). */
    archived_at?: string | null
    text: string
    description: string | null
    completed: boolean
    priority: boolean
    color: string | null
    position: number
    subtasks: TemplateTask[]
}

/**
 * Snapshot of a section stored in a template.
 * @category Types
 */
export type TemplateSection = {
    title: string
    color: string | null
    /** Archive date: only in the export files (a template never contains archived items). */
    archived_at?: string | null
    position: number
    tasks: TemplateTask[]
}

/**
 * Snapshot of a group of sections stored in a template.
 * @category Types
 */
export type TemplateGroup = {
    name: string | null
    /** Absent in templates and export files created before groups had a color. */
    color?: string | null
    /** Archive date: only in the export files (a template never contains archived items). */
    archived_at?: string | null
    /** Width in pixels; absent when the group has the default width. */
    width?: number | null
    /** Tasks directly in the group (its hidden default section); absent when there are none. */
    tasks?: TemplateTask[]
    /** How many of the sections come before the list of the direct tasks (0..sections.length); absent = 0, the list is on top. */
    directIndex?: number
    position: number
    sections: TemplateSection[]
}

/**
 * Versioned JSON stored in `note_template.content`: an exact copy of the (non deleted) content of a note.
 * Soft deleted items and audio files are not included.
 * @category Types
 */
export type NoteTemplateContent = {
    version: 1
    groups: TemplateGroup[]
}

/**
 * A note template of a workspace.
 * `sourceNoteName` is null when the source note no longer exists (or is in the trash): the template can no longer be refreshed.
 * @category Types
 */
export type NoteTemplate = {
    id: number
    workspaceID: number
    sourceNoteID: number | null
    sourceNoteName: string | null
    name: string
    color: string | null
    /** Background color of the note, copied by the notes created from the template. */
    bg_color?: string | null
    content: NoteTemplateContent
    creation_date: string
    creation_time: string
    edit_date: string
    edit_time: string
    deleted_at?: string | null
}

/**
 * Counts the groups, sections and tasks (subtasks at any depth included) of a template.
 * @param content The template content.
 * @category Types
 */
export function countTemplateContent(content: NoteTemplateContent) {
    let sections = 0
    let tasks = 0
    const countTasks = (list: TemplateTask[]) => {
        for (const task of list) {
            tasks += 1
            countTasks(task.subtasks)
        }
    }
    for (const group of content.groups) {
        sections += group.sections.length
        countTasks(group.tasks ?? [])
        for (const section of group.sections) countTasks(section.tasks)
    }
    return { groups: content.groups.length, sections, tasks }
}
