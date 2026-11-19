import type { Translation } from "../it"

export const templateEditor: Translation["templateEditor"] = {
    badge: "Template",
    tab: "Template: {{name}}",
    edit: "Edit",
    editAria: "Edit the template {{name}}",
    pathRoot: "Template",
    saving: "Saving",
    saved: "Saved",
    saveError: "Could not save",
    retry: "Retry",
    refreshBlocked: "Close the template editor to refresh it from a note",
    recovered: "Changes to the template \"{{name}}\" recovered",
    moreAria: "More actions for {{name}}",
    moreTooltip: "More actions",
    duplicate: "Duplicate",
    duplicated: "Template duplicated",
    refreshFromOther: "Refresh from another note…",
    pickOther: {
        title: "Choose the note",
        description: "The content of the template will be replaced with the one of the chosen note, which becomes the source note.",
        placeholder: "Search the note to refresh the template from…",
    },
    refreshOtherDescription: "The content of the template \"{{name}}\" will be replaced with the current content of the note \"{{note}}\", which becomes its source note. Notes already created from the template do not change.",
    deleted: "Deleted",
    undoBlocked: "Open the template editor to undo this change",
    tabMenu: {
        rename: "Rename template",
        createNote: "Create note from this template",
        closeEditor: "Close editor",
    },
}
