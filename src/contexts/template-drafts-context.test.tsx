import { useState } from "react"
import { act, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { TabsProvider } from "./tabs-context"
import { ActiveNoteProvider } from "./active-note-context"
import { TemplateDraftsProvider } from "./template-drafts-context"
import { useTabs, useTabsActions } from "./use-tabs"
import { useLayout, useLayoutActions } from "./use-layout"
import { useActiveNoteActions } from "./use-active-note"
import { useTemplateDraftActions, useTemplateDrafts } from "./use-template-drafts"
import { createVersionsStore, WorkspaceVersionsContext } from "./workspace-data/versions"
import { createDBTemplateDraft, deleteDBTemplateDraft, getDBTemplateDraft, getDBTemplateDrafts, saveDBTemplateDraft, type TemplateDraft } from "@/db/queries/template-draft"
import { getDBNoteData } from "@/db/queries/note"
import { getReopenNotes } from "@/lib/store/preferences"
import { getWorkspaceTabs, saveWorkspaceTabs } from "@/lib/store/tabs"
import { draftToNote } from "@/lib/template-draft"
import { makeGroup, makeNote, makeSection, makeTask } from "@/test/ui-fixtures"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/db/queries/template-draft", () => ({
    createDBTemplateDraft: vi.fn(), saveDBTemplateDraft: vi.fn(), deleteDBTemplateDraft: vi.fn(), getDBTemplateDrafts: vi.fn(), getDBTemplateDraft: vi.fn(),
}))
vi.mock("@/db/queries/note", () => ({ getDBNoteData: vi.fn() }))
vi.mock("@/lib/store/preferences", () => ({ getReopenNotes: vi.fn() }))
vi.mock("@/lib/store/tabs", () => ({ getWorkspaceTabs: vi.fn(), saveWorkspaceTabs: vi.fn().mockResolvedValue(undefined) }))

const WORKSPACE = 7
const draft = (noteId: number, templateId: number, overrides: Partial<TemplateDraft> = {}): TemplateDraft =>
    ({ noteId, templateId, templateName: `Template ${templateId}`, color: null, trashed: false, ...overrides })

// What the database holds: the mocks read and write it like the real queries
let dbDrafts: TemplateDraft[]

const noteData = (noteId: number) => ({
    groups: [makeGroup({ id: noteId * 10, noteID: noteId })],
    sections: [makeSection({ id: noteId * 100, groupID: noteId * 10 })],
    tasks: [makeTask({ id: noteId * 1000, sectionID: noteId * 100, completed: false, priority: false })],
})

type Api = ReturnType<typeof useTabs> & ReturnType<typeof useTabsActions> & ReturnType<typeof useActiveNoteActions>
    & ReturnType<typeof useTemplateDraftActions> & { drafts: TemplateDraft[], layout: ReturnType<typeof useLayout>, layoutActions: ReturnType<typeof useLayoutActions> }

function setup(initial: TemplateDraft[] = []) {
    const latest: { current: Api } = { current: undefined as never }
    const whenIdle = () => Promise.resolve()
    const versions = createVersionsStore()
    function Probe() {
        latest.current = { ...useTabs(), ...useTabsActions(), ...useActiveNoteActions(), ...useTemplateDraftActions(), drafts: useTemplateDrafts(), layout: useLayout(), layoutActions: useLayoutActions() }
        return null
    }
    function Host() {
        const [drafts, setDrafts] = useState(initial)
        const notes = [makeNote({ id: 1 }), ...drafts.filter(candidate => !candidate.trashed).map(draftToNote)]
        return (
            <WorkspaceVersionsContext.Provider value={versions}>
                <TabsProvider notes={notes} workspaceId={WORKSPACE}>
                    <ActiveNoteProvider>
                        <TemplateDraftsProvider workspaceId={WORKSPACE} drafts={drafts} setDrafts={setDrafts} whenIdle={whenIdle}>
                            <Probe />
                        </TemplateDraftsProvider>
                    </ActiveNoteProvider>
                </TabsProvider>
            </WorkspaceVersionsContext.Provider>
        )
    }
    render(<Host />)
    return latest
}

describe("TemplateDraftsProvider", () => {
    beforeEach(() => {
        // Fake (advancing) timers: the autosave timers of a test never fire in the middle of another
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true })
        vi.resetAllMocks()
        vi.spyOn(console, "error").mockImplementation(() => {})
        dbDrafts = []
        vi.mocked(getReopenNotes).mockResolvedValue(true)
        vi.mocked(getWorkspaceTabs).mockResolvedValue({ left: { openIds: [], activeId: null }, right: null, focused: 0 })
        vi.mocked(saveWorkspaceTabs).mockResolvedValue(undefined)
        vi.mocked(getDBNoteData).mockImplementation(async id => noteData(id) as never)
        vi.mocked(getDBTemplateDrafts).mockImplementation(async () => dbDrafts)
        vi.mocked(getDBTemplateDraft).mockImplementation(async noteId => dbDrafts.find(candidate => candidate.noteId === noteId) ?? null)
        vi.mocked(createDBTemplateDraft).mockImplementation(async templateId => {
            const existing = dbDrafts.find(candidate => candidate.templateId === templateId)
            if (existing) return existing.noteId
            dbDrafts = [...dbDrafts, draft(50 + dbDrafts.length, templateId)]
            return dbDrafts.at(-1)!.noteId
        })
        vi.mocked(saveDBTemplateDraft).mockResolvedValue("unchanged")
        vi.mocked(deleteDBTemplateDraft).mockImplementation(async noteId => { dbDrafts = dbDrafts.filter(candidate => candidate.noteId !== noteId) })
    })

    afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()
    })

    it("opens the editor of a template in a tab, reusing the draft that exists", async () => {
        const latest = setup()
        await waitFor(() => expect(latest.current.restored).toBe(true))

        await act(async () => { await latest.current.openTemplateEditor({ id: 3, name: "Template 3" }) })
        expect(latest.current.openIds).toEqual([50])
        expect(latest.current.activeId).toBe(50)
        expect(latest.current.drafts.map(candidate => candidate.noteId)).toEqual([50])
        expect(latest.current.currentNote).toMatchObject({ id: 50, name: "Template 3", templateID: 3, workspaceID: null })

        // A second click on "Edit" finds the same draft: no second tab
        await act(async () => { await latest.current.openTemplateEditor({ id: 3, name: "Template 3" }) })
        expect(latest.current.openIds).toEqual([50])
        expect(latest.current.drafts).toHaveLength(1)
    })

    it("saves and deletes the draft when its tab closes", async () => {
        const latest = setup()
        await waitFor(() => expect(latest.current.restored).toBe(true))
        await act(async () => { await latest.current.openTemplateEditor({ id: 3, name: "Template 3" }) })

        act(() => latest.current.closeNote(50))
        await waitFor(() => expect(deleteDBTemplateDraft).toHaveBeenCalledWith(50))
        expect(saveDBTemplateDraft).toHaveBeenCalledWith(50)
        expect(vi.mocked(saveDBTemplateDraft).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deleteDBTemplateDraft).mock.invocationCallOrder[0])
        await waitFor(() => expect(latest.current.drafts).toEqual([]))
    })

    it("moving the editor tab to the other pane keeps the draft: it is neither saved nor deleted", async () => {
        const latest = setup()
        await waitFor(() => expect(latest.current.restored).toBe(true))
        act(() => latest.current.openNote(1))
        await act(async () => { await latest.current.openTemplateEditor({ id: 3, name: "Template 3" }) })
        act(() => latest.current.layoutActions.split())
        expect(latest.current.layout.isSplit).toBe(true)

        // The union of the open notes does not change: the draft must survive the move
        act(() => latest.current.layoutActions.moveToPane(50, 1))
        await act(async () => { await Promise.resolve() })
        expect(latest.current.layout.right?.openIds).toEqual([50])
        expect(latest.current.layout.left.openIds).toEqual([1])
        expect(latest.current.drafts.map(candidate => candidate.noteId)).toEqual([50])
        expect(saveDBTemplateDraft).not.toHaveBeenCalled()
        expect(deleteDBTemplateDraft).not.toHaveBeenCalled()

        // ...and back again
        act(() => latest.current.layoutActions.moveToPane(50, 0))
        await act(async () => { await Promise.resolve() })
        expect(latest.current.drafts).toHaveLength(1)
        expect(saveDBTemplateDraft).not.toHaveBeenCalled()
        expect(deleteDBTemplateDraft).not.toHaveBeenCalled()
    })

    it("keeps the draft when it could not be saved", async () => {
        const latest = setup()
        await waitFor(() => expect(latest.current.restored).toBe(true))
        await act(async () => { await latest.current.openTemplateEditor({ id: 3, name: "Template 3" }) })
        vi.mocked(saveDBTemplateDraft).mockRejectedValue(new Error("disk"))

        act(() => latest.current.closeNote(50))
        await waitFor(() => expect(saveDBTemplateDraft).toHaveBeenCalled())
        await act(async () => { await Promise.resolve() })
        expect(deleteDBTemplateDraft).not.toHaveBeenCalled()
        expect(dbDrafts.map(candidate => candidate.noteId)).toEqual([50])
    })

    it("a template deleted while its editor is open closes the tab, and the draft is saved into the trashed template", async () => {
        dbDrafts = [draft(50, 3)]
        vi.mocked(getWorkspaceTabs).mockResolvedValue({ left: { openIds: [50], activeId: 50 }, right: null, focused: 0 })
        const latest = setup(dbDrafts)
        await waitFor(() => expect(latest.current.openIds).toEqual([50]))

        // The template goes to the trash: the draft is no longer listed, so its tab is closed
        dbDrafts = [draft(50, 3, { trashed: true })]
        await act(async () => { await latest.current.refreshDrafts() })
        await waitFor(() => expect(latest.current.openIds).toEqual([]))
        await waitFor(() => expect(deleteDBTemplateDraft).toHaveBeenCalledWith(50))
        expect(saveDBTemplateDraft).toHaveBeenCalledWith(50)
    })

    describe("at startup", () => {
        it("keeps the editor open when its tab is restored", async () => {
            dbDrafts = [draft(50, 3)]
            vi.mocked(getWorkspaceTabs).mockResolvedValue({ left: { openIds: [50], activeId: 50 }, right: null, focused: 0 })
            const latest = setup(dbDrafts)

            await waitFor(() => expect(latest.current.restored).toBe(true))
            expect(latest.current.openIds).toEqual([50])
            expect(deleteDBTemplateDraft).not.toHaveBeenCalled()
            expect(saveDBTemplateDraft).not.toHaveBeenCalled()
        })

        it("saves a draft whose tab does not come back into its template, with a notice when that changed it", async () => {
            dbDrafts = [draft(50, 3), draft(51, 4)]
            vi.mocked(getReopenNotes).mockResolvedValue(false)
            vi.mocked(saveDBTemplateDraft).mockImplementation(async noteId => noteId === 50 ? "written" : "unchanged")
            const latest = setup(dbDrafts)

            await waitFor(() => expect(deleteDBTemplateDraft).toHaveBeenCalledTimes(2))
            expect(saveDBTemplateDraft).toHaveBeenCalledWith(50)
            expect(saveDBTemplateDraft).toHaveBeenCalledWith(51)
            expect(toast.info).toHaveBeenCalledTimes(1)
            expect(toast.info).toHaveBeenCalledWith("Modifiche al template «Template 3» recuperate")
            await waitFor(() => expect(latest.current.drafts).toEqual([]))
        })

        it("recovers the draft of a template that is in the trash too", async () => {
            dbDrafts = [draft(50, 3, { trashed: true })]
            vi.mocked(saveDBTemplateDraft).mockResolvedValue("written")
            setup(dbDrafts)

            await waitFor(() => expect(deleteDBTemplateDraft).toHaveBeenCalledWith(50))
            expect(saveDBTemplateDraft).toHaveBeenCalledWith(50)
        })
    })

    describe("autosave", () => {
        it("saves the draft after a change, once, and flushTemplate saves at once", async () => {
            const latest = setup()
            await waitFor(() => expect(latest.current.restored).toBe(true))
            await act(async () => { await latest.current.openTemplateEditor({ id: 3, name: "Template 3" }) })
            await waitFor(() => expect(latest.current.getNoteTree()).not.toBeNull())
            // Loading the note is not a change: nothing is scheduled by it
            await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
            expect(saveDBTemplateDraft).not.toHaveBeenCalled()
            vi.mocked(saveDBTemplateDraft).mockClear()

            act(() => { latest.current.patchGroup(500, { name: "Cambiato" }) })
            act(() => { latest.current.patchGroup(500, { name: "Ancora" }) })
            await act(async () => { await vi.advanceTimersByTimeAsync(700) })
            expect(saveDBTemplateDraft).not.toHaveBeenCalled()

            await act(async () => { await vi.advanceTimersByTimeAsync(200) })
            expect(saveDBTemplateDraft).toHaveBeenCalledTimes(1)
            expect(saveDBTemplateDraft).toHaveBeenCalledWith(50)

            act(() => { latest.current.patchGroup(500, { name: "Finale" }) })
            let ok = false
            await act(async () => { ok = await latest.current.flushTemplate(3) })
            expect(ok).toBe(true)
            expect(saveDBTemplateDraft).toHaveBeenCalledTimes(2)
        })

        it("flushTemplate and flushAll do nothing for a template without an open editor", async () => {
            const latest = setup()
            await waitFor(() => expect(latest.current.restored).toBe(true))

            await expect(latest.current.flushTemplate(99)).resolves.toBe(true)
            await expect(latest.current.flushAll()).resolves.toBe(true)
            expect(saveDBTemplateDraft).not.toHaveBeenCalled()
        })
    })
})
