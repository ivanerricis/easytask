import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeTree } from "@/test/automation-fixtures"
import { finishOpenTask, markOpenTaskReady, openTaskStore, requestOpenTask } from "@/lib/open-task-request"

const mocks = vi.hoisted(() => ({
    openNote: vi.fn(),
    selectTask: vi.fn(),
    setRevealed: vi.fn(),
    activeId: 7 as number | null,
    tree: null as unknown,
}))
vi.mock("@/contexts/use-tabs", () => ({
    useActiveNoteId: () => mocks.activeId,
    useSelectTask: () => mocks.selectTask,
    useTabsActions: () => ({ openNote: mocks.openNote }),
    useTabUiStore: () => ({ setRevealed: mocks.setRevealed }),
}))
vi.mock("@/contexts/use-active-note", () => ({ useActiveNote: () => ({ noteDataTree: mocks.tree }) }))
vi.mock("@/contexts/use-layout", () => ({ usePaneRoot: () => () => document }))

import { OpenTaskEffect } from "./OpenTaskEffect"

const frame = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })

beforeEach(() => {
    vi.clearAllMocks()
    finishOpenTask()
    mocks.activeId = 7
    mocks.tree = makeTree({ 1: [{ id: 10, subs: [{ id: 11 }] }] })
    document.body.innerHTML = ""
})

describe("OpenTaskEffect", () => {
    it("waits for the workspace, then opens the note once", async () => {
        render(<OpenTaskEffect />)
        act(() => requestOpenTask({ workspaceId: 1, noteId: 7, taskId: 11 }))
        expect(mocks.openNote).not.toHaveBeenCalled()
        act(() => markOpenTaskReady())
        expect(mocks.openNote).toHaveBeenCalledTimes(1)
        expect(mocks.openNote).toHaveBeenCalledWith(7)
    })

    it("selects the task, opens what hides it and ends when its row is drawn", async () => {
        const row = document.createElement("div")
        row.dataset.taskId = "11"
        row.scrollIntoView = vi.fn()
        document.body.append(row)
        render(<OpenTaskEffect />)
        act(() => { requestOpenTask({ workspaceId: 1, noteId: 7, taskId: 11 }); markOpenTaskReady() })
        await frame()
        expect(mocks.selectTask).toHaveBeenCalledWith(11)
        expect(mocks.setRevealed).toHaveBeenCalledWith(7, "section", 1, true)
        expect(mocks.setRevealed).toHaveBeenCalledWith(7, "task", 10, true)
        expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest" })
        expect(openTaskStore.getState()).toBeNull()
    })

    it("gives up when the task is not in the note", async () => {
        render(<OpenTaskEffect />)
        act(() => { requestOpenTask({ workspaceId: 1, noteId: 7, taskId: 999 }); markOpenTaskReady() })
        await frame()
        expect(mocks.selectTask).not.toHaveBeenCalled()
        expect(openTaskStore.getState()).toBeNull()
    })

    it("does not select in a pane whose active note is another one", async () => {
        mocks.activeId = 8
        render(<OpenTaskEffect />)
        act(() => { requestOpenTask({ workspaceId: 1, noteId: 7, taskId: 11 }); markOpenTaskReady() })
        await frame()
        expect(mocks.selectTask).not.toHaveBeenCalled()
    })
})
