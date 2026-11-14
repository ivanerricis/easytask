import type { Translation } from "../it"

export const media: Translation["media"] = {
    add: "Add image or video",
    files: "Images and videos",
    dialogFilter: "Images and videos",
    added_one: "Media file added",
    added_other: "{{count}} media files added",
    addError: "Could not add the images or videos: {{message}}",
    open: "Open {{name}}",
    missing: {
        description: "The file is no longer at the saved path: it may have been moved or deleted. You can pick the new path or delete the reference.",
    },
    viewer: {
        title: "Viewer",
        description: "{{name}} ({{current}} of {{total}})",
        previous: "Previous",
        next: "Next",
        position: "{{current}} / {{total}}",
        missing: "File not found: update the path from the file menu.",
        loadError: "Could not show the file (unsupported format or unreadable file).",
        zoomHint: "Mouse wheel to zoom, double click to reset the size",
    },
}
