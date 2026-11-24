import type { NoteTemplateContent, TemplateGroup, TemplateSection, TemplateTag, TemplateTask } from "@/types/template"
import { isHiddenTask } from "@/pages/workspacePage/components/section/hide-completed"

export type NoteExportOptions = {
    /** Leaves out the completed tasks (the rule of "hide completed tasks": a completed task with an open subtask stays). */
    hideCompleted: boolean
    /** The title of a group that has no name; `index` counts from 0. */
    groupLabel: (index: number) => string
    /** The title of a section that has none. */
    untitledSection: string
    /** The name of the note: becomes the `#` title of the document; absent = no title. */
    title?: string
}

/** The visible tasks of a list, as the note draws them. */
export const exportableTasks = (tasks: readonly TemplateTask[], hideCompleted: boolean): TemplateTask[] =>
    tasks.filter(task => !isHiddenTask(task, hideCompleted))

/** The sections of a group in the order of the note, with its direct tasks (an entry without a section) at their place. */
export type GroupBlock = { section: TemplateSection | null, tasks: readonly TemplateTask[] }

export function groupBlocks(group: TemplateGroup): GroupBlock[] {
    const blocks: GroupBlock[] = group.sections.map(section => ({ section, tasks: section.tasks }))
    const direct = group.tasks ?? []
    if (direct.length > 0) {
        const index = Math.min(Math.max(group.directIndex ?? 0, 0), blocks.length)
        blocks.splice(index, 0, { section: null, tasks: direct })
    }
    return blocks
}

const tagsLine = (tags: readonly TemplateTag[] | undefined) =>
    (tags ?? []).map(tag => `\`${tag.name.replaceAll("`", "'")}\``).join(" ")

// Every line of a multi-line text goes under the item: indented, so Markdown keeps it in the list entry
const continuation = (text: string, indent: string) =>
    text.split(/\r?\n/).map(line => line.trim() === "" ? "" : `${indent}${line}`)

function taskLines(task: TemplateTask, depth: number, hideCompleted: boolean): string[] {
    const indent = "  ".repeat(depth)
    const [first = "", ...rest] = task.text.split(/\r?\n/)
    const tags = tagsLine(task.tags)
    const lines = [`${indent}- [${task.completed ? "x" : " "}] ${first}${tags ? ` ${tags}` : ""}`.trimEnd(), ...rest.flatMap(line => continuation(line, `${indent}  `))]
    const description = task.description?.trim()
    if (description) lines.push(...continuation(description, `${indent}  `))
    for (const subtask of exportableTasks(task.subtasks, hideCompleted)) lines.push(...taskLines(subtask, depth + 1, hideCompleted))
    return lines
}

/**
 * A note as Markdown: the groups are `##`, the sections `###`, the tasks `- [ ]` / `- [x]` with the subtasks indented by two
 * spaces per level, their description under them and their tags between backticks. The tasks of a group that are not in a
 * section come right under the group, as in the note.
 * @param tree The content of the note (what a template stores).
 * @category Note
 */
export function noteToMarkdown(tree: NoteTemplateContent, options: NoteExportOptions): string {
    const blocks: string[] = []
    if (options.title) blocks.push(`# ${options.title}`)
    tree.groups.forEach((group, index) => {
        const heading = [`## ${group.name?.trim() || options.groupLabel(index)}`]
        const groupTags = tagsLine(group.tags)
        if (groupTags) heading.push("", groupTags)
        blocks.push(heading.join("\n"))
        for (const { section, tasks } of groupBlocks(group)) {
            if (section) {
                const lines = [`### ${section.title.trim() || options.untitledSection}`]
                const sectionTags = tagsLine(section.tags)
                if (sectionTags) lines.push("", sectionTags)
                blocks.push(lines.join("\n"))
            }
            const lines = exportableTasks(tasks, options.hideCompleted).flatMap(task => taskLines(task, 0, options.hideCompleted))
            if (lines.length > 0) blocks.push(lines.join("\n"))
        }
    })
    return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : ""
}
