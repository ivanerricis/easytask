import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import type { TaskFile } from "@/types/types"
import { TaskFilesButton, TaskFilesList } from "./TaskFilesButton"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const mutations = { attach: vi.fn(), remove: vi.fn(), relink: vi.fn(), attachPaths: vi.fn() }
const openTaskFile = vi.fn()
vi.mock("@/hooks/use-task-file-mutations", () => ({ useTaskFileMutations: () => mutations, openTaskFile: (path: string) => openTaskFile(path) }))

const file = (id: number, name: string): TaskFile => ({ id, taskID: 1, name, path: `/x/${name}`, position: id })
const task = { id: 1, text: "T", files: [file(1, "a.pdf"), file(2, "gone.docx")] }

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(invoke).mockImplementation(async (_command: string, args?: unknown) =>
        (args as { paths: string[] }).paths.map(path => !path.includes("gone")))
})

describe("TaskFilesButton", () => {
    it("shows nothing without files and the number of files with them", () => {
        const { rerender } = render(<TaskFilesButton task={{ ...task, files: [] }} />)
        expect(screen.queryByTestId("task-files-badge")).not.toBeInTheDocument()
        rerender(<TaskFilesButton task={task} />)
        expect(screen.getByTestId("task-files-badge")).toHaveTextContent("2")
        expect(screen.getByRole("button", { name: "2 file allegati" })).toBeInTheDocument()
    })

    it("opens the list: a file opens with the system app, a missing one is marked and relinked, a file is removed, more are added", async () => {
        const user = userEvent.setup()
        render(<TaskFilesButton task={task} />)
        await user.click(screen.getByTestId("task-files-badge"))
        await waitFor(() => expect(screen.getAllByTestId("task-file")[1]).toHaveAttribute("data-missing", "true"))
        expect(invoke).toHaveBeenCalledWith("task_files_exist", { paths: ["/x/a.pdf", "/x/gone.docx"] })

        await user.click(screen.getByRole("button", { name: "Apri a.pdf" }))
        expect(openTaskFile).toHaveBeenCalledWith("/x/a.pdf")
        await user.click(screen.getByRole("button", { name: /Apri gone.docx/ }))
        expect(mutations.relink).toHaveBeenCalledWith(task.files[1])
        await user.click(screen.getByRole("button", { name: "Rimuovi a.pdf" }))
        expect(mutations.remove).toHaveBeenCalledWith(task.files[0])
        await user.click(screen.getByRole("button", { name: "Aggiungi file" }))
        expect(mutations.attach).toHaveBeenCalled()
    })
})

describe("TaskFilesList", () => {
    it("says so when the task has no files", () => {
        render(<TaskFilesList task={{ ...task, files: undefined }} />)
        expect(screen.getByText("Nessun file allegato.")).toBeInTheDocument()
    })

    it("the update path button of a missing file relinks it", async () => {
        const user = userEvent.setup()
        render(<TaskFilesList task={task} />)
        await user.click(await screen.findByRole("button", { name: "Aggiorna percorso" }))
        expect(mutations.relink).toHaveBeenCalledWith(task.files[1])
    })
})
