import type { Translation } from "../it"

export const home: Translation["home"] = {
    loading: "Loading workspaces…",
    welcome: "Welcome back!",
    import: "Import a workspace",
    recent: "Open a recent workspace",
    viewGrid: "View as grid",
    viewList: "View as list",
    sort: {
        label: "Sort",
        by: "Sort by",
        direction: "Direction",
        edited: "Last edited",
        created: "Creation date",
        name: "Name",
        nameAsc: "A to Z",
        nameDesc: "Z to A",
        dateAsc: "Oldest first",
        dateDesc: "Newest first",
    },
    createWorkspace: {
        title: "Create workspace",
        name: "Name",
        open: "New workspace",
    },
    workspace: {
        open: "Open the workspace {{name}}",
    },
    noWorkspacesHint: "Create your first workspace to get started.",
}

export const workspace: Translation["workspace"] = {
    loading: "Loading workspace data…",
    combobox: {
        select: "Select workspace…",
        search: "Search a workspace…",
        empty: "No workspace found.",
        label: "Workspace: {{name}}",
    },
    backHome: "Back to home",
}

export const notes: Translation["notes"] = {
    blank: {
        title: "No open notes",
    },
    hints: {
        allShortcuts: "All shortcuts",
        newGroup: "New group or section",
        search: "Search a note",
    },
    empty: {
        title: "Empty note",
    },
    closeAll: "Close all notes",
    split: {
        split: "Split into two areas",
        close: "Close the split",
        divider: "Resize the two areas",
        dividerValue: "{{percent}}% left",
        emptyTitle: "Empty area",
        emptyHint: "Drag a tab here or use \"Open on the right\" from a note's menu.",
        leftPane: "Left area",
        rightPane: "Right area",
        openTabsPane: "Open notes, {{pane}}",
    },
    search: {
        placeholder: "Search a note…",
        empty: "No results.",
        suggestions: "Suggestions",
        short: "Search…",
    },
    noteSearch: {
        inNote: "Search in the note",
        placeholder: "Search in the note…",
        counter: "{{current}} of {{total}}",
        next: "Next result",
        previous: "Previous result",
        close: "Close the search",
    },
    hideCompleted: "Hide completed tasks",
    showCompleted: "Show completed tasks",
    path: {
        label: "Note path",
        reveal: "Show {{name}} in the sidebar",
    },
    closeCurrent: "Close current note",
    close: "Close note",
    openTabs: "Open notes",
    moveTabLeft: "Move tab left",
    moveTabRight: "Move tab right",
}

export const groups: Translation["groups"] = {
    defaultLabel: "Group {{index}}",
    directTasks: "Group tasks",
    addTask: "New task",
    collapse: "Collapse group",
    expand: "Expand group",
    renameAria: "Group name: {{name}}, press Enter to rename",
    nameLabel: "Group name",
    renameError: "Could not change the group name: {{message}}",
    namePlaceholder: "Group name…",
    progress: "Group progress",
    audioCount_one: "{{count}} audio file",
    audioCount_other: "{{count}} audio files",
    width: {
        handle: "Resize the group",
        value: "{{width}} pixels",
        auto: "automatic width",
    },
}

export const sidebar: Translation["sidebar"] = {
    addFolder: "New folder",
    addNote: "New note",
    addNoteFromTemplate: "New note from template",
    importItems: "Import a note or folder",
    trashBadge_one: "{{count}} item in the trash",
    trashBadge_other: "{{count}} items in the trash",
    archiveBadge_one: "{{count}} item in the archive",
    archiveBadge_other: "{{count}} items in the archive",
    expandAll: "Expand all folders",
    collapseAll: "Collapse all folders",
    info: {
        description: "Description",
        placeholder: "Write something to describe the task…",
    },
    toggle: "Show or hide the sidebar",
    emptyTree: "No folders or notes",
    emptyTreeHint: "Create a note or a folder to get started.",
    treeLabel: "Folders and notes",
    holdsOpenNote: "Contains the open note",
}

export const templates: Translation["templates"] = {
    badge_one: "{{count}} template",
    badge_other: "{{count}} templates",
}

export const sections: Translation["sections"] = {
    new: "New section",
    titlePlaceholder: "Section title…",
    untitled: "Untitled section",
    renameAria: "Section title: {{name}}, press Enter to rename",
    titleLabel: "Section title",
    renameError: "Could not change the section title: {{message}}",
    collapse: "Collapse section",
    expand: "Expand section",
    progress: "Section progress",
}
