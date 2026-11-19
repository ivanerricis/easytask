import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { GroupAudioFiles } from "./GroupAudioFiles"
import type { AudioFile } from "@/types/types"

const files: AudioFile[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Traccia ${i + 1}`, path: `C:/audio/${i + 1}.mp3` }) as AudioFile)
vi.mock("@/contexts/use-audio", () => ({
    useGroupAudioFiles: () => files,
    useAudio: () => ({ track: null, playbackState: null, playFile: vi.fn(), relinkFile: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/components/dialogs/dialog-rename", () => ({ DialogRenameItem: () => null }))
vi.mock("@/components/dialogs/dialog-delete", () => ({ DialogDeleteItem: () => null }))
const skippable = vi.hoisted(() => ({ request: vi.fn(), options: undefined as unknown }))
vi.mock("@/components/dialogs/use-delete-item", () => ({ useSkippableDelete: (options: unknown) => { skippable.options = options; return { request: skippable.request } } }))
vi.mock("../rightbar/use-right-panel", () => ({ useShowAudioInfo: () => null }))

describe("GroupAudioFiles", () => {
    it("shows every file and never scrolls by itself", () => {
        render(<GroupAudioFiles groupId={1} />)
        const list = screen.getByRole("list")
        const classes = list.className.split(/\s+/)
        expect(classes).not.toContain("overflow-y-auto")
        expect(classes.some(token => token.startsWith("max-h-"))).toBe(false)
        expect(screen.getAllByRole("listitem")).toHaveLength(12)
    })

    it("the delete entry of a file asks through the skippable delete, with the 'media-remove' key", async () => {
        render(<GroupAudioFiles groupId={1} />)
        fireEvent.contextMenu(screen.getAllByRole("listitem")[0])
        await userEvent.click(await screen.findByText("Elimina"))
        expect(skippable.request).toHaveBeenCalledTimes(1)
        expect(skippable.options).toMatchObject({ itemType: "audio_file", skipKey: "media-remove" })
    })
})
