import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DialogAutomations } from "./dialog-automations"
import { createDBAutomation, deleteDBAutomation, getDBAutomations, setDBAutomationEnabled, updateDBAutomation } from "@/db/queries/automation"
import { getDBNoteData } from "@/db/queries/note"
import type { Automation } from "@/lib/automations/types"

vi.mock("@/db/queries/automation", () => ({
    getDBAutomations: vi.fn(),
    createDBAutomation: vi.fn(),
    updateDBAutomation: vi.fn(),
    deleteDBAutomation: vi.fn(),
    setDBAutomationEnabled: vi.fn(),
}))
vi.mock("@/db/queries/note", () => ({ getDBNoteData: vi.fn() }))
vi.mock("@/db/queries/tag", () => ({ getDBTags: vi.fn(async () => []), getDBNoteTags: vi.fn(async () => []) }))
const sync = vi.fn()
vi.mock("@/hooks/use-automations", () => ({ useAutomations: () => ({ dispatch: vi.fn(), sync }) }))

const dates = { creation_date: "", creation_time: "", edit_date: "", edit_time: "" }
const noteData = {
    groups: [{ id: 1, noteID: 1, position: 0, name: "Flusso" }, { id: 2, noteID: 1, position: 1, name: null }],
    sections: [
        { id: 1, groupID: 1, title: "Doing", position: 0, ...dates },
        { id: 2, groupID: 1, title: "Done", position: 1, ...dates },
    ],
    tasks: [],
}

const rule = (over: Partial<Automation> = {}): Automation => ({
    id: 10, noteId: 1, name: "Chiudi", enabled: true, position: 0,
    trigger: { type: "task.completed", sectionId: 1 },
    actions: [{ type: "moveTo", sectionId: 2, at: "bottom" }],
    ...over,
})

const mocked = vi.mocked

const renderDialog = (onOpenChange = vi.fn(), groupId?: number) => {
    render(<DialogAutomations noteId={1} isOpen onOpenChange={onOpenChange} groupId={groupId} />)
    return onOpenChange
}

const click = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(screen.getByRole("button", { name }))

const pick = async (user: ReturnType<typeof userEvent.setup>, label: string, option: string) => {
    await user.click(screen.getByRole("combobox", { name: label }))
    await user.click(await screen.findByRole("option", { name: option }))
}

beforeEach(() => {
    vi.resetAllMocks()
    mocked(getDBNoteData).mockResolvedValue(noteData as never)
    mocked(getDBAutomations).mockResolvedValue([])
    mocked(createDBAutomation).mockResolvedValue(undefined as never)
    mocked(updateDBAutomation).mockResolvedValue(undefined as never)
    mocked(deleteDBAutomation).mockResolvedValue(undefined as never)
    mocked(setDBAutomationEnabled).mockResolvedValue(undefined as never)
    sync.mockResolvedValue(undefined)
})

describe("DialogAutomations", () => {
    it("lists the rules with their description", async () => {
        mocked(getDBAutomations).mockResolvedValue([rule(), rule({ id: 11, name: null, trigger: { type: "task.created", sectionId: null }, actions: [{ type: "setPriority", value: true }] })])
        renderDialog()
        // Waits for the list itself: the close button of the dialog is there from the start, while the rules load
        expect(await screen.findByText("Quando un task viene completato in \"Doing\", sposta in fondo a \"Done\"")).toBeInTheDocument()
        expect(screen.getByText("Quando un task viene creato, aggiungi la priorità")).toBeInTheDocument()
    })

    it("shows the empty state", async () => {
        renderDialog()
        expect(await screen.findByText("Nessuna automazione in questa nota.")).toBeInTheDocument()
        expect(screen.getByText(/Ad esempio/)).toBeInTheDocument()
        expect(screen.getAllByRole("button", { name: "Nuova automazione" })).toHaveLength(1)
    })

    it("scrive la descrizione della regola in text-sm (non più piccola)", async () => {
        mocked(getDBAutomations).mockResolvedValue([rule()])
        renderDialog()
        const description = await screen.findByText("Quando un task viene completato in \"Doing\", sposta in fondo a \"Done\"")
        expect(description).toHaveClass("text-sm")
        expect(description).not.toHaveClass("text-xs")
    })

    it("il caricamento è annunciato come occupato e lo spinner si ferma con movimento ridotto", async () => {
        mocked(getDBNoteData).mockReturnValue(new Promise(() => { /* never */ }))
        renderDialog()
        const status = await screen.findByRole("status")
        expect(status).toHaveAttribute("aria-busy", "true")
        expect(status).toHaveTextContent("Caricamento…")
        expect(status.querySelector("svg")).toHaveClass("motion-reduce:animate-none")
    })

    it("annuncia il passo corrente in una regione aria-live", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        const live = screen.getByText("Passo 1 di 3: Quando")
        expect(live).toHaveAttribute("aria-live", "polite")
        await pick(user, "In quale sezione", "Doing")
        await click(user, "Avanti")
        expect(screen.getByText("Passo 2 di 3: Allora")).toBe(live)
    })

    it("limita il nome dell'automazione a 120 caratteri", async () => {
        mocked(getDBAutomations).mockResolvedValue([rule()])
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: /Modifica l'automazione/ }))
        expect(screen.getByLabelText("Nome (facoltativo)")).toHaveAttribute("maxlength", "120")
    })

    it("creates a rule from the editor", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        // Step 1: the trigger
        expect(screen.getByRole("button", { name: /Quando/ })).toHaveAttribute("aria-current", "step")
        expect(screen.queryByRole("button", { name: "Indietro" })).not.toBeInTheDocument()
        await pick(user, "In quale sezione", "Doing")
        await click(user, "Avanti")
        // Step 2: the actions
        expect(screen.getByRole("button", { name: /Allora/ })).toHaveAttribute("aria-current", "step")
        await pick(user, "Sposta in", "Done")
        await click(user, "Avanti")
        // Step 3: the summary
        expect(screen.getByRole("button", { name: /Riepilogo/ })).toHaveAttribute("aria-current", "step")
        expect(screen.getByText("Quando un task viene completato in \"Doing\", sposta in fondo a \"Done\"")).toBeInTheDocument()
        expect(screen.getByRole("switch", { name: "Regola attiva" })).toBeChecked()
        expect(screen.queryByRole("button", { name: "Avanti" })).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(createDBAutomation).toHaveBeenCalledTimes(1))
        expect(createDBAutomation).toHaveBeenCalledWith(1, {
            name: null,
            enabled: true,
            trigger: { type: "task.completed", sectionId: 1 },
            actions: [{ type: "moveTo", sectionId: 2, at: "bottom" }],
        })
    })

    it("toggles a rule", async () => {
        const user = userEvent.setup()
        mocked(getDBAutomations).mockResolvedValue([rule()])
        renderDialog()
        await user.click(await screen.findByRole("switch", { name: "Automazione \"Chiudi\"" }))
        await waitFor(() => expect(setDBAutomationEnabled).toHaveBeenCalledWith(10, false))
    })

    it("asks for confirmation before deleting a rule", async () => {
        const user = userEvent.setup()
        mocked(getDBAutomations).mockResolvedValue([rule()])
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Elimina l'automazione \"Chiudi\"" }))
        expect(deleteDBAutomation).not.toHaveBeenCalled()
        expect(await screen.findByText("Eliminare l'automazione?")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Elimina" }))
        await waitFor(() => expect(deleteDBAutomation).toHaveBeenCalledWith(10))
    })

    it("disables Next when the rule has no actions", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await click(user, "Avanti")
        await click(user, "Rimuovi azione")
        expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled()
        // The summary cannot be reached from the indicator either
        expect(screen.getByRole("button", { name: /Riepilogo/ })).toBeDisabled()
        await click(user, "Aggiungi azione")
        expect(screen.getByRole("button", { name: "Avanti" })).toBeEnabled()
    })

    it("moves the focus to the first control of the step", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await click(user, "Avanti")
        await waitFor(() => expect(screen.getByRole("combobox", { name: "Tipo di azione" })).toHaveFocus())
        await click(user, "Avanti")
        await waitFor(() => expect(screen.getByLabelText("Nome (facoltativo)")).toHaveFocus())
    })

    it("edits a rule starting from its summary and jumps back through the indicator", async () => {
        const user = userEvent.setup()
        mocked(getDBAutomations).mockResolvedValue([rule()])
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Modifica l'automazione \"Chiudi\"" }))
        expect(screen.getByRole("button", { name: /Riepilogo/ })).toHaveAttribute("aria-current", "step")
        expect(screen.getByLabelText("Nome (facoltativo)")).toHaveValue("Chiudi")
        expect(screen.getByText("Quando un task viene completato in \"Doing\", sposta in fondo a \"Done\"")).toBeInTheDocument()

        await click(user, "Allora")
        await pick(user, "Sposta in", "Doing")
        await user.click(screen.getByRole("button", { name: /Quando/ }))
        await pick(user, "In quale sezione", "Done")
        await click(user, "Riepilogo")
        await user.click(screen.getByRole("switch", { name: "Regola attiva" }))
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(updateDBAutomation).toHaveBeenCalledTimes(1))
        expect(updateDBAutomation).toHaveBeenCalledWith(10, {
            name: "Chiudi",
            enabled: false,
            trigger: { type: "task.completed", sectionId: 2 },
            actions: [{ type: "moveTo", sectionId: 1, at: "bottom" }],
        })
        expect(createDBAutomation).not.toHaveBeenCalled()
    })

    it("goes back with Indietro", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await click(user, "Avanti")
        await click(user, "Indietro")
        expect(screen.getByRole("combobox", { name: "In quale sezione" })).toBeInTheDocument()
    })

    it("asks before discarding an edited draft on Cancel", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await click(user, "Avanti")
        await click(user, "Avanti")
        await user.type(screen.getByLabelText("Nome (facoltativo)"), "Mia regola")
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(await screen.findByText("Scartare le modifiche?")).toBeInTheDocument()

        // Cancelling the confirmation stays in the editor
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        await waitFor(() => expect(screen.queryByText("Scartare le modifiche?")).not.toBeInTheDocument())
        expect(screen.getByLabelText("Nome (facoltativo)")).toHaveValue("Mia regola")

        await user.click(screen.getByRole("button", { name: "Annulla" }))
        await user.click(await screen.findByRole("button", { name: "Scarta" }))
        expect(await screen.findByText("Nessuna automazione in questa nota.")).toBeInTheDocument()
        expect(createDBAutomation).not.toHaveBeenCalled()
    })

    it("cancels an untouched draft without asking", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await user.click(screen.getByRole("button", { name: "Annulla" }))
        expect(screen.queryByText("Scartare le modifiche?")).not.toBeInTheDocument()
        expect(await screen.findByText("Nessuna automazione in questa nota.")).toBeInTheDocument()
    })

    it("re-aligns the open note after saving, toggling and deleting a rule", async () => {
        const user = userEvent.setup()
        mocked(getDBAutomations).mockResolvedValue([rule()])
        renderDialog()
        await user.click(await screen.findByRole("switch", { name: "Automazione \"Chiudi\"" }))
        await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))

        await user.click(screen.getByRole("button", { name: "Elimina l'automazione \"Chiudi\"" }))
        await user.click(await screen.findByRole("button", { name: "Elimina" }))
        await waitFor(() => expect(sync).toHaveBeenCalledTimes(2))

        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await click(user, "Avanti")
        await click(user, "Avanti")
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(sync).toHaveBeenCalledTimes(3))
    })

    describe("state rules", () => {
        const SECTION_TRIGGER = "una sezione non ha task da completare"
        const SECTION_HAS = "una sezione ha almeno un task da completare"
        const GROUP_NONE = "un gruppo non ha task da completare"

        it("offers the four state triggers after the existing ones", async () => {
            const user = userEvent.setup()
            renderDialog()
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            await user.click(screen.getByRole("combobox", { name: "Quando" }))
            const options = (await screen.findAllByRole("option")).map(option => option.textContent)
            expect(options.slice(-4)).toEqual([SECTION_TRIGGER, SECTION_HAS, GROUP_NONE, "un gruppo ha almeno un task da completare"])
        })

        it("shows the section select (any allowed) and only the color action", async () => {
            const user = userEvent.setup()
            renderDialog()
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            await pick(user, "Quando", SECTION_TRIGGER)
            await user.click(screen.getByRole("combobox", { name: "In quale sezione" }))
            expect(await screen.findByRole("option", { name: "Qualsiasi sezione" })).toBeInTheDocument()
            await user.keyboard("{Escape}")

            await click(user, "Avanti")
            // The only action is the color: no second type to add
            expect(screen.getByRole("combobox", { name: "Tipo di azione" })).toHaveTextContent("Colore")
            expect(screen.queryByRole("button", { name: "Aggiungi azione" })).not.toBeInTheDocument()
            await user.click(screen.getByRole("combobox", { name: "Tipo di azione" }))
            expect((await screen.findAllByRole("option")).map(option => option.textContent)).toEqual(["Colore"])
        })

        it("shows the group select for a group state trigger", async () => {
            const user = userEvent.setup()
            renderDialog()
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            await pick(user, "Quando", GROUP_NONE)
            expect(screen.queryByRole("combobox", { name: "In quale sezione" })).not.toBeInTheDocument()
            expect(screen.getByRole("combobox", { name: "Gruppo" })).toHaveTextContent("Qualsiasi gruppo")
            await click(user, "Avanti")
            expect(screen.getByRole("combobox", { name: "Colore" })).toBeInTheDocument()
        })

        it("saves section.noOpenTasks -> green", async () => {
            const user = userEvent.setup()
            renderDialog()
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            await pick(user, "Quando", SECTION_TRIGGER)
            await click(user, "Avanti")
            await pick(user, "Colore", "Verde")
            await click(user, "Avanti")
            await user.click(screen.getByRole("button", { name: "Salva" }))
            await waitFor(() => expect(createDBAutomation).toHaveBeenCalledTimes(1))
            expect(createDBAutomation).toHaveBeenCalledWith(1, {
                name: null,
                enabled: true,
                trigger: { type: "section.noOpenTasks", sectionId: null },
                actions: [{ type: "setColor", color: "#3cb44b" }],
            })
        })

        it("resets the actions between an event trigger and a state trigger", async () => {
            const user = userEvent.setup()
            renderDialog()
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            await pick(user, "Quando", SECTION_TRIGGER)
            await click(user, "Avanti")
            await user.click(screen.getByRole("button", { name: /Quando/ }))
            await pick(user, "Quando", "un task viene completato")
            await click(user, "Avanti")
            expect(screen.getByRole("combobox", { name: "Tipo di azione" })).toHaveTextContent("Sposta in")
            expect(screen.getByRole("button", { name: "Aggiungi azione" })).toBeInTheDocument()
        })
    })

    describe("group rules", () => {
        const groupRule = (over: Partial<Automation> = {}): Automation => rule({
            id: 20, name: null, trigger: { type: "group.completed", groupId: 1 }, actions: [{ type: "archiveGroup" }], ...over,
        })
        const GROUP_TRIGGER = "tutti i task di un gruppo sono completati"

        it("shows the group select and only the group actions for the group trigger", async () => {
            const user = userEvent.setup()
            renderDialog()
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            await pick(user, "Quando", GROUP_TRIGGER)
            expect(screen.queryByRole("combobox", { name: "In quale sezione" })).not.toBeInTheDocument()
            await user.click(screen.getByRole("combobox", { name: "Gruppo" }))
            expect(await screen.findByRole("option", { name: "Qualsiasi gruppo" })).toBeInTheDocument()
            expect(screen.getByRole("option", { name: "Flusso" })).toBeInTheDocument()
            expect(screen.getByRole("option", { name: "Gruppo 2" })).toBeInTheDocument()
            await user.keyboard("{Escape}")

            await click(user, "Avanti")
            await user.click(screen.getByRole("combobox", { name: "Tipo di azione" }))
            const options = (await screen.findAllByRole("option")).map(option => option.textContent)
            expect(options).toEqual(["Colore", "Sposta il gruppo", "Archivia il gruppo"])
        })

        it("resets the actions when the subject changes but not between two task triggers", async () => {
            const user = userEvent.setup()
            renderDialog()
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            await click(user, "Avanti")
            await pick(user, "Tipo di azione", "Priorità")
            await user.click(screen.getByRole("button", { name: /Quando/ }))
            await pick(user, "Quando", "un task viene creato")
            await click(user, "Avanti")
            expect(screen.getByRole("combobox", { name: "Tipo di azione" })).toHaveTextContent("Priorità")

            await user.click(screen.getByRole("button", { name: /Quando/ }))
            await pick(user, "Quando", GROUP_TRIGGER)
            await click(user, "Avanti")
            expect(screen.getByRole("combobox", { name: "Tipo di azione" })).toHaveTextContent("Archivia il gruppo")
            expect(screen.getAllByRole("combobox", { name: "Tipo di azione" })).toHaveLength(1)
            // Many select clicks: it takes ~15s with the whole suite running in parallel, so it gets more than the default
        }, 30_000)

        it("describes a group rule with the name of the group and pauses it when the group is missing", async () => {
            mocked(getDBAutomations).mockResolvedValue([
                groupRule(),
                groupRule({ id: 21, trigger: { type: "group.completed", groupId: 99 } }),
            ])
            renderDialog()
            expect(await screen.findByText(/tutti i task del gruppo "Flusso" sono completati/)).toBeInTheDocument()
            expect(screen.getAllByText("In pausa: gruppo eliminato")).toHaveLength(1)
            expect(screen.getByText(/tutti i task del gruppo "\(gruppo eliminato\)" sono completati/)).toBeInTheDocument()
        })

        it("saves a group rule", async () => {
            const user = userEvent.setup()
            renderDialog()
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            await pick(user, "Quando", GROUP_TRIGGER)
            await pick(user, "Gruppo", "Flusso")
            await click(user, "Avanti")
            await pick(user, "Tipo di azione", "Sposta il gruppo")
            await pick(user, "Sposta il gruppo", "In cima")
            await click(user, "Avanti")
            await user.click(screen.getByRole("button", { name: "Salva" }))
            await waitFor(() => expect(createDBAutomation).toHaveBeenCalledTimes(1))
            expect(createDBAutomation).toHaveBeenCalledWith(1, {
                name: null,
                enabled: true,
                trigger: { type: "group.completed", groupId: 1 },
                actions: [{ type: "moveGroup", at: "top" }],
            })
        })

        it("starts on the group trigger when opened from a group", async () => {
            const user = userEvent.setup()
            renderDialog(vi.fn(), 2)
            await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
            expect(screen.getByRole("combobox", { name: "Quando" })).toHaveTextContent(GROUP_TRIGGER)
            expect(screen.getByRole("combobox", { name: "Gruppo" })).toHaveTextContent("Gruppo 2")
            await click(user, "Avanti")
            expect(screen.getByRole("combobox", { name: "Tipo di azione" })).toHaveTextContent("Archivia il gruppo")
            await click(user, "Avanti")
            await user.click(screen.getByRole("button", { name: "Salva" }))
            await waitFor(() => expect(createDBAutomation).toHaveBeenCalledWith(1, expect.objectContaining({
                trigger: { type: "group.completed", groupId: 2 },
                actions: [{ type: "archiveGroup" }],
            })))
        })
    })
})

describe("DialogAutomations with the direct area of a group", () => {
    // Every group has its hidden default section (the direct area): 7 in "Flusso", 8 in the unnamed group
    const withDirect = {
        ...noteData,
        sections: [
            { id: 7, groupID: 1, title: null, position: 0, is_default: 1, ...dates },
            ...noteData.sections,
            { id: 8, groupID: 2, title: null, position: 0, is_default: 1, ...dates },
        ],
    }

    beforeEach(() => {
        mocked(getDBNoteData).mockResolvedValue(withDirect as never)
    })

    it("offers one entry per group, labelled with the group, ahead of its sections", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await user.click(screen.getByRole("combobox", { name: "In quale sezione" }))
        const options = (await screen.findAllByRole("option")).map(option => option.textContent)
        expect(options).toEqual(["Qualsiasi sezione", "Flusso, task diretti", "Doing", "Done", "Gruppo 2, task diretti"])
    })

    it("saves a rule that moves into the direct tasks of a group and describes it", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await pick(user, "In quale sezione", "Doing")
        await click(user, "Avanti")
        await pick(user, "Sposta in", "Gruppo 2, task diretti")
        await click(user, "Avanti")
        expect(screen.getByText("Quando un task viene completato in \"Doing\", sposta in fondo ai task diretti di \"Gruppo 2\"")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(createDBAutomation).toHaveBeenCalledWith(1, {
            name: null, enabled: true,
            trigger: { type: "task.completed", sectionId: 1 },
            actions: [{ type: "moveTo", sectionId: 8, at: "bottom" }],
        }))
    })

    it("uses the direct area as the place of the trigger", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await pick(user, "In quale sezione", "Flusso, task diretti")
        await click(user, "Avanti")
        await click(user, "Avanti")
        await user.click(screen.getByRole("button", { name: "Salva" }))
        await waitFor(() => expect(createDBAutomation).toHaveBeenCalledWith(1, expect.objectContaining({
            trigger: { type: "task.completed", sectionId: 7 },
        })))
    })

    it("lists a saved rule on the direct area with its sentence", async () => {
        mocked(getDBAutomations).mockResolvedValue([rule({
            name: null, trigger: { type: "task.movedInto", sectionId: 7 }, actions: [{ type: "moveTo", sectionId: 2, at: "top" }],
        })])
        renderDialog()
        expect(await screen.findByText("Quando un task arriva nei task diretti di \"Flusso\", sposta in cima a \"Done\"")).toBeInTheDocument()
        expect(screen.queryByText("In pausa: sezione eliminata")).not.toBeInTheDocument()
    })

    it("does not offer the direct area to the state triggers (they color the visible sections)", async () => {
        const user = userEvent.setup()
        renderDialog()
        await user.click(await screen.findByRole("button", { name: "Nuova automazione" }))
        await pick(user, "Quando", "una sezione non ha task da completare")
        await user.click(screen.getByRole("combobox", { name: "In quale sezione" }))
        const options = (await screen.findAllByRole("option")).map(option => option.textContent)
        expect(options).toEqual(["Qualsiasi sezione", "Doing", "Done"])
    })

    it("a note whose groups have no section still lets a rule be created on the direct areas", async () => {
        mocked(getDBNoteData).mockResolvedValue({ groups: noteData.groups, sections: [withDirect.sections[0]], tasks: [] } as never)
        renderDialog()
        expect(await screen.findByRole("button", { name: "Nuova automazione" })).toBeEnabled()
    })
})
