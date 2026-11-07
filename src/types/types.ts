export type Workspace = {
    id: number
    name: string
    color?: string
    creation_date: string
    creation_time: string
    edit_date: string
    edit_time: string
    deleted_at?: string | null
}

export type Folder = {
    id: number
    workspaceID: number | null
    folderID: number | null
    name: string
    position: number
    creation_date: string
    creation_time: string
    edit_date: string
    edit_time: string
    deleted_at?: string | null
    /** Set while the item is archived (hidden from the note/sidebar without being trashed); null/undefined = visible. */
    archived_at?: string | null
    color?: string
    subfolders: Folder[]
    notes: Note[]
}


export type Note = {
    id: number
    workspaceID: number | null
    folderID: number | null
    name: string
    position: number
    creation_date: string
    creation_time: string
    edit_date: string
    edit_time: string
    deleted_at?: string | null
    /** Set while the item is archived (hidden from the note/sidebar without being trashed); null/undefined = visible. */
    archived_at?: string | null
    color?: string
    /** Optional background color of the note area (hex); null/undefined = the default background. */
    bg_color?: string | null
    /** Set on the working copy (draft) of a template while it is edited: the template it belongs to. Such a note has no workspace. */
    templateID?: number | null
    groups: Group[]
}

export type Group = {
    id: number
    noteID: number
    position: number
    /** Optional name of the group; null/undefined = unnamed (shown as "Gruppo N"). */
    name?: string | null
    /** Optional color of the group (hex); null/undefined = no color. */
    color?: string | null
    /** Set while the item is archived (hidden from the note/sidebar without being trashed); null/undefined = visible. */
    archived_at?: string | null
    /** Width in pixels set by the user; null/undefined = the default width. */
    width?: number | null
    /** Hidden default section that holds the tasks created directly in the group (kept out of `sections`); null/undefined = not loaded. */
    defaultSection?: Section | null
    /**
     * How many of the sections come before the default section (the list of the direct tasks) in the order of the group:
     * 0 = on top (the default), sections.length = after all of them. Absent = 0. Always kept in sync with the database order.
     */
    defaultIndex?: number
    /** Saved state of the group: true (or 1 from the database) = closed; absent/false = open. A state of the view: undo, templates, exports and copies do not carry it. */
    collapsed?: boolean | number
    sections: Section[]
}

export type Section = {
    id: number
    groupID: number
    title: string
    position: number
    creation_date: string
    creation_time: string
    edit_date: string
    edit_time: string
    deleted_at?: string | null
    color?: string | null
    /** Set while the item is archived (hidden from the note/sidebar without being trashed); null/undefined = visible. */
    archived_at?: string | null
    /** The hidden default section of a group (true, or 1 from the database); absent/false = a normal section. */
    is_default?: boolean | number
    /** Saved state of the section: true (or 1 from the database) = closed; absent/false = open. A state of the view: undo, templates, exports and copies do not carry it. */
    collapsed?: boolean | number
    tasks: Task[]
}

export type Task = {
    id: number
    sectionID: number | null
    taskID: number | null
    position: number
    creation_date: string
    creation_time: string
    edit_date: string
    edit_time: string
    deleted_at?: string | null
    /** Set while the task is archived (hidden from the note without being trashed, with its subtasks); null/undefined = visible. */
    archived_at?: string | null
    color?: string | null
    text: string
    completed: boolean
    priority: boolean
    description: string
    /** Saved state of the subtasks of the task (closed = hidden): true (or 1 from the database) = closed; absent/false = open. A state of the view: undo, templates, exports and copies do not carry it. */
    collapsed?: boolean | number
    subtasks: Task[]
}

/**
 * An item moved to the trash, as returned by getDBTrash.
 * `context` is the parent folder name or "Nota X › Sezione Y", empty string for root items.
 * `summary` describes what the item contained ("2 gruppi · 3 sezioni · 5 task"), empty when there is nothing to say.
 */
export type TrashItem = {
    type: "workspace" | "folder" | "note" | "section_group" | "section" | "task" | "audio_file" | "note_template"
    id: number
    name: string
    context: string
    summary: string
    deleted_at: string
}

/** The items that can be archived. */
export type ArchiveItemType = "folder" | "note" | "section_group" | "section" | "task"

/**
 * An archived item, as returned by getDBArchive. Only the items archived directly are listed (what they contain is
 * archived with them). `context` is the parent folder name or "Nota X" (empty string for root items), `name` of an unnamed
 * group is "Gruppo di N sezioni" like in the trash, `summary` describes the content ("2 gruppi · 3 sezioni · 5 task").
 */
export type ArchiveItem = {
    type: ArchiveItemType
    id: number
    name: string
    context: string
    summary: string
    archived_at: string
}

/** A trashed workspace with the summary of what it contains (see TrashItem.summary). */
export type TrashedWorkspace = Workspace & { summary: string }

export type WorkspaceDataTree = {
    rootFolders: Folder[]
    rootNotes: Note[]
}

export type NoteDataTree = {
    groups: Group[]
}

/**
 * An audio file attached to a group. Only its path is stored: the file itself stays where the user keeps it.
 */
export type AudioFile = {
    id: number
    section_groupID: number
    name: string
    path: string
    position: number
    creation_date: string
    creation_time: string
}

export type AudioPlayerPosition = {
    x: number,
    y: number,
    scaleX: number,
    scaleY: number
}