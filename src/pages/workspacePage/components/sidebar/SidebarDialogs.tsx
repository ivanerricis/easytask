import { useState } from "react"
import { lazyNamed, preloadWhenIdle } from "@/lib/lazy-preload"
import { LazyMount } from "@/components/lazy-mount"
import { useAppCommand } from "@/lib/app-commands"
import type { NoteTemplate } from "@/types/template"

const DialogTrash = lazyNamed(() => import("@/components/dialogs/dialog-trash"), "DialogTrash")
const DialogArchive = lazyNamed(() => import("@/components/dialogs/dialog-archive"), "DialogArchive")
const DialogTemplates = lazyNamed(() => import("@/components/dialogs/dialog-templates"), "DialogTemplates")
const DialogPickTemplate = lazyNamed(() => import("@/components/dialogs/dialog-pick-template"), "DialogPickTemplate")
const DialogNoteFromTemplate = lazyNamed(() => import("@/components/dialogs/dialog-note-from-template"), "DialogNoteFromTemplate")
preloadWhenIdle(DialogTrash, DialogArchive, DialogTemplates, DialogPickTemplate, DialogNoteFromTemplate)

/**
 * Trash, archive, templates and note-from-template dialogs of the workspace. They are opened with the app commands (from the
 * sidebar buttons or the app menu) and live outside the sidebar panel, so they work while the sidebar is closed.
 * @category Sidebar
 */
export const SidebarDialogs = () => {
    const [trashOpen, setTrashOpen] = useState(false)
    const [archiveOpen, setArchiveOpen] = useState(false)
    const [templatesOpen, setTemplatesOpen] = useState(false)
    const [picking, setPicking] = useState(false)
    const [template, setTemplate] = useState<NoteTemplate | null>(null)
    useAppCommand("open-trash", () => setTrashOpen(true))
    useAppCommand("open-archive", () => setArchiveOpen(true))
    useAppCommand("open-templates", () => setTemplatesOpen(true))
    useAppCommand("note-from-template", () => setPicking(true))

    return (
        <>
            <LazyMount active={trashOpen}>
                <DialogTrash isOpen={trashOpen} onOpenChange={setTrashOpen} />
            </LazyMount>
            <LazyMount active={archiveOpen}>
                <DialogArchive isOpen={archiveOpen} onOpenChange={setArchiveOpen} />
            </LazyMount>
            <LazyMount active={templatesOpen}>
                <DialogTemplates isOpen={templatesOpen} onOpenChange={setTemplatesOpen} />
            </LazyMount>
            <LazyMount active={picking}>
                <DialogPickTemplate isOpen={picking} onOpenChange={setPicking} onPick={setTemplate} />
            </LazyMount>
            <LazyMount active={template !== null}>
                {template && (
                    <DialogNoteFromTemplate
                        key={template.id}
                        template={template}
                        isOpen
                        onOpenChange={open => { if (!open) setTemplate(null) }}
                    />
                )}
            </LazyMount>
        </>
    )
}
