import type { Translation } from "../it"

export const common: Translation["common"] = {
    cancel: "Cancel",
    dontAskAgain: "Don't ask again",
    selected: "selected",
    delete: "Delete",
    save: "Save",
    rename: "Rename",
    system: "System",
    close: "Close",
    retry: "Try again",
    loading: "Loading…",
    noResults: "No results",
    counts: {
        group_one: "{{count}} group",
        group_other: "{{count}} groups",
        section_one: "{{count}} section",
        section_other: "{{count}} sections",
        task_one: "{{count}} task",
        task_other: "{{count}} tasks",
    },
    breadcrumb: "Breadcrumb",
    more: "More",
    openMenu: "Open menu",
    menuOf: "Menu: {{name}}",
    workspaceRoot: "Workspace root",
    name: "Name",
    addColor: "Add color",
    creationDate: "Created on {{date}} at {{time}}",
    editDate: "Modified on {{date}} at {{time}}",
    colors: {
        c1: "Red",
        c2: "Green",
        c3: "Yellow",
        c4: "Blue",
        c5: "Orange",
        c6: "Purple",
        c7: "Cyan",
        c8: "Magenta",
        c9: "Lime",
        c10: "Pink",
        c11: "Teal",
        c12: "Lavender",
        c13: "Brown",
        c14: "Cream",
        c15: "Navy",
        custom: "Custom color",
    },
}

export const ui: Translation["ui"] = {
    commandTitle: "Command Palette",
    commandDescription: "Search for a command to run…",
}

export const layout: Translation["layout"] = {
    resizeSidebar: "Resize the sidebar",
    resizeValue: "{{width}} pixels",
    showSidebar: "Show the sidebar",
    hideSidebar: "Hide the sidebar",
}

export const dnd: Translation["dnd"] = {
    unknownItem: "item",
    instructions: {
        keyboard: "To move the item press Space, then use the arrow keys to pick the position and press Space again to drop it. Press Esc to cancel.",
        pointer: "Drag the item with the mouse, or use the \"Move to…\" menu to move it with the keyboard (for a task also Alt+Up or Alt+Down).",
    },
    start: "Picked up {{name}}.",
    over: "{{name}} is over {{target}}.",
    overNone: "{{name}} is not over a valid target.",
    end: "{{name}} was dropped on {{target}}.",
    endNone: "{{name}} was dropped outside a valid target.",
    cancel: "Moving {{name}} cancelled.",
    audioPlayer: "Audio player",
    tabMovedToPane: "{{name}} moved to: {{pane}}.",
}
