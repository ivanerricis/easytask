import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import type { TaskFile } from "@/types/types"
import { makeUndoRecorderMock } from "@/test/mocks"
import { openTaskFile, useTaskFileMutations } from "./use-task-file-mutations"

vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }))

const actions = { attachTaskFiles: vi.fn(), setTaskFiles: vi.fn() }
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => actions }))
const rollback = vi.fn()
const note = { patchTask: vi.fn(() => rollback) }
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => note }))
const recorder = makeUndoRecorderMock()
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))

const file = (id: number, name: string, path = `/x/${name}`): TaskFile => ({ id, taskID: 5, name, path, position: id })
const a = file(1, "a.pdf")
const b = file(2, "b.docx")
const task = { id: 5, text: "Task", files: [a, b] }
const mutations = (files = task.files) => renderHook(() => useTaskFileMutations({ ...task, files })).result.current

beforeEach(() => {
    vi.clearAllMocks()
    actions.attachTaskFiles.mockResolvedValue([a, b, file(3, "c.zip")])
    actions.setTaskFiles.mockImplementation(async (_id: number, list: TaskFile[]) => list)
})

describe("useTaskFileMutations", () => {
    it("attaches the picked files, patches the note with the stored list and records ONE step", async () => {
        vi.mocked(open).mockResolvedValueOnce(["/x/c.zip"])
        await mutations().attach()
        expect(actions.attachTaskFiles).toHaveBeenCalledWith(5, ["/x/c.zip"])
        expect(note.patchTask).toHaveBeenCalledWith(5, { files: [a, b, file(3, "c.zip")] })
        expect(recorder.taskFiles).toHaveBeenCalledWith(5, "Task", "attach", [a, b], [a, b, file(3, "c.zip")])
        expect(toast.success).toHaveBeenCalled()
    })

    it("does nothing when the dialog is cancelled or there are no paths", async () => {
        vi.mocked(open).mockResolvedValueOnce(null)
        await mutations().attach()
        await mutations().attachPaths([])
        expect(actions.attachTaskFiles).not.toHaveBeenCalled()
        expect(recorder.taskFiles).not.toHaveBeenCalled()
    })

    it("a single path from the dialog is accepted and a failure is told, without a step", async () => {
        vi.mocked(open).mockResolvedValueOnce("/x/one.txt")
        actions.attachTaskFiles.mockRejectedValueOnce(new Error("no"))
        await mutations().attach()
        expect(actions.attachTaskFiles).toHaveBeenCalledWith(5, ["/x/one.txt"])
        expect(toast.error).toHaveBeenCalled()
        expect(recorder.taskFiles).not.toHaveBeenCalled()
        vi.mocked(open).mockRejectedValueOnce(new Error("dialog"))
        await mutations().attach()
        expect(toast.error).toHaveBeenCalledTimes(2)
    })

    it("removes a file at once, records the step and puts the note back if the write fails", async () => {
        await mutations().remove(a)
        expect(note.patchTask).toHaveBeenNthCalledWith(1, 5, { files: [b] })
        expect(actions.setTaskFiles).toHaveBeenCalledWith(5, [b])
        expect(recorder.taskFiles).toHaveBeenCalledWith(5, "Task", "remove", [a, b], [b])
        actions.setTaskFiles.mockRejectedValueOnce(new Error("no"))
        await mutations().remove(b)
        expect(rollback).toHaveBeenCalledTimes(1)
        expect(recorder.taskFiles).toHaveBeenCalledTimes(1)
        expect(toast.error).toHaveBeenCalled()
    })

    it("a task without files starts from an empty list", async () => {
        await renderHook(() => useTaskFileMutations({ id: 5, text: "Task" })).result.current.attachPaths(["/x/c.zip"])
        expect(recorder.taskFiles).toHaveBeenCalledWith(5, "Task", "attach", [], expect.anything())
    })

    it("relinks a file to the picked path, keeping its name", async () => {
        vi.mocked(open).mockResolvedValueOnce("/new/place/a.pdf")
        await mutations().relink(a)
        expect(actions.setTaskFiles).toHaveBeenCalledWith(5, [{ ...a, path: "/new/place/a.pdf" }, b])
        expect(recorder.taskFiles).toHaveBeenCalledWith(5, "Task", "relink", [a, b], [{ ...a, path: "/new/place/a.pdf" }, b])
        vi.mocked(open).mockResolvedValueOnce(null)
        await mutations().relink(a)
        expect(actions.setTaskFiles).toHaveBeenCalledTimes(1)
        vi.mocked(open).mockRejectedValueOnce(new Error("x"))
        await mutations().relink(a)
        expect(toast.error).toHaveBeenCalled()
    })
})

describe("openTaskFile", () => {
    it("opens through the Rust command and tells a refusal", async () => {
        vi.mocked(invoke).mockResolvedValueOnce(undefined)
        await openTaskFile("/x/a.pdf")
        expect(invoke).toHaveBeenCalledWith("open_task_file", { path: "/x/a.pdf" })
        expect(toast.error).not.toHaveBeenCalled()
        vi.mocked(invoke).mockRejectedValueOnce("blocked")
        await openTaskFile("/x/run.exe")
        vi.mocked(invoke).mockRejectedValueOnce("file not found")
        await openTaskFile("/x/gone.pdf")
        expect(toast.error).toHaveBeenCalledTimes(2)
    })
})
