import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { addDays, toDueDate } from "@/lib/due-date"

const mocks = vi.hoisted(() => ({
    updateTaskDue: vi.fn(),
    patchTask: vi.fn(),
    rollback: vi.fn(),
    recorder: { taskDue: vi.fn() },
    markDueSeen: vi.fn(),
}))
vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
vi.mock("@/contexts/workspace-data", () => ({ useWorkspaceActions: () => ({ updateTaskDue: mocks.updateTaskDue }) }))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNoteActions: () => ({ patchTask: mocks.patchTask }) }))
vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => mocks.recorder }))
vi.mock("@/lib/due-notify", () => ({ markDueSeen: mocks.markDueSeen }))

import { DialogTaskDue } from "./DialogTaskDue"
import { DueField } from "@/pages/workspacePage/components/rightbar/details/DueField"
import { useSetTaskDue } from "./use-set-task-due"

const today = toDueDate(new Date())
const task = { id: 4, text: "Pay", due_date: null as string | null, due_time: null as string | null }

beforeEach(() => {
    vi.clearAllMocks()
    mocks.patchTask.mockReturnValue(mocks.rollback)
    mocks.updateTaskDue.mockResolvedValue(undefined)
})

const Probe = ({ after }: { after: { date: string | null, time: string | null } }) => {
    const setDue = useSetTaskDue()
    return <button onClick={() => { void setDue(task, after) }}>go</button>
}

describe("useSetTaskDue", () => {
    it("updates the open note at once, saves, records the undo step and remembers a past date as seen", async () => {
        render(<Probe after={{ date: "2020-01-01", time: null }} />)
        await userEvent.click(screen.getByText("go"))
        await waitFor(() => expect(mocks.recorder.taskDue).toHaveBeenCalledWith(4, "Pay", { date: null, time: null }, { date: "2020-01-01", time: null }))
        expect(mocks.patchTask).toHaveBeenCalledWith(4, { due_date: "2020-01-01", due_time: null })
        expect(mocks.updateTaskDue).toHaveBeenCalledWith(4, "2020-01-01", null)
        expect(mocks.markDueSeen).toHaveBeenCalledWith({ id: 4, due_date: "2020-01-01", due_time: null })
    })

    it("does nothing when the value did not change", async () => {
        render(<Probe after={{ date: null, time: null }} />)
        await userEvent.click(screen.getByText("go"))
        expect(mocks.updateTaskDue).not.toHaveBeenCalled()
    })

    it("restores the note and tells the user when the write fails", async () => {
        mocks.updateTaskDue.mockRejectedValue(new Error("boom"))
        render(<Probe after={{ date: "2030-01-01", time: "10:00" }} />)
        await userEvent.click(screen.getByText("go"))
        await waitFor(() => expect(mocks.rollback).toHaveBeenCalled())
        expect(toast.error).toHaveBeenCalled()
        expect(mocks.recorder.taskDue).not.toHaveBeenCalled()
    })
})

describe("DialogTaskDue", () => {
    it("saves the picked day and closes", async () => {
        const onOpenChange = vi.fn()
        render(<DialogTaskDue open onOpenChange={onOpenChange} task={task} />)
        await userEvent.click(screen.getByRole("button", { name: "Domani" }))
        await userEvent.click(screen.getByRole("button", { name: "Imposta" }))
        await waitFor(() => expect(mocks.updateTaskDue).toHaveBeenCalledWith(4, addDays(today, 1), null))
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("removes an existing date", async () => {
        const onOpenChange = vi.fn()
        render(<DialogTaskDue open onOpenChange={onOpenChange} task={{ ...task, due_date: addDays(today, 3) }} />)
        await userEvent.click(screen.getByRole("button", { name: "Rimuovi scadenza" }))
        await waitFor(() => expect(mocks.updateTaskDue).toHaveBeenCalledWith(4, null, null))
    })
})

describe("DueField", () => {
    it("shows no due date, opens the picker and saves", async () => {
        render(<DueField task={{ ...task } as never} />)
        expect(screen.getByText("Nessuna scadenza")).toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Scadenza" }))
        await userEvent.click(await screen.findByRole("button", { name: "Oggi" }))
        await userEvent.click(screen.getByRole("button", { name: "Imposta" }))
        await waitFor(() => expect(mocks.updateTaskDue).toHaveBeenCalledWith(4, today, null))
    })

    it("shows the badge of an existing date", () => {
        render(<DueField task={{ ...task, due_date: addDays(today, 30) } as never} />)
        expect(screen.getByTestId("due-badge")).toBeInTheDocument()
    })
})
