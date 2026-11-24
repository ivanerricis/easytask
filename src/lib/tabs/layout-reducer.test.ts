import { describe, expect, it } from "vitest"
import {
    findPane,
    focusedPane,
    initialLayoutState,
    layoutReducer,
    normalizeLayout,
    paneOf,
    unionOpenIds,
    type LayoutAction,
    type LayoutState,
} from "./layout-reducer"
import type { TabsState } from "./tabs-reducer"

const tabs = (openIds: number[], activeId: number | null = openIds[0] ?? null): TabsState => ({ openIds, activeId })
const layout = (left: TabsState, right: TabsState | null = null, focused: 0 | 1 = 0): LayoutState => ({ left, right, focused })
const run = (state: LayoutState, ...actions: LayoutAction[]) => actions.reduce(layoutReducer, state)

/** Every note is in at most one pane, the active id is an open id and focused is 0 without right pane. */
const expectValid = (state: LayoutState) => {
    const all = unionOpenIds(state)
    expect(new Set(all).size).toBe(all.length)
    for (const pane of [state.left, state.right]) {
        if (pane) expect(pane.activeId === null ? pane.openIds.length === 0 : pane.openIds.includes(pane.activeId)).toBe(true)
    }
    if (!state.right) expect(state.focused).toBe(0)
}

describe("selettori", () => {
    const state = layout(tabs([1, 2], 2), tabs([3], 3), 1)

    it("paneOf, findPane, unionOpenIds e focusedPane", () => {
        expect(paneOf(state, 0)).toBe(state.left)
        expect(paneOf(state, 1)).toBe(state.right)
        expect(paneOf(initialLayoutState, 1)).toBeNull()
        expect(findPane(state, 2)).toBe(0)
        expect(findPane(state, 3)).toBe(1)
        expect(findPane(state, 9)).toBeNull()
        expect(unionOpenIds(state)).toEqual([1, 2, 3])
        expect(unionOpenIds(initialLayoutState)).toEqual([])
        expect(focusedPane(state)).toBe(state.right)
        expect(focusedPane(layout(tabs([1]), null, 1))).toEqual(tabs([1]))
    })
})

describe("split / unsplit / focus", () => {
    it("split crea un'area destra vuota e la focalizza", () => {
        const next = layoutReducer(layout(tabs([1])), { type: "split" })
        expect(next).toEqual(layout(tabs([1]), tabs([]), 1))
        expect(next.right).toEqual({ openIds: [], activeId: null })
    })

    it("split quando già diviso non cambia nulla", () => {
        const state = layout(tabs([1]), tabs([2]), 0)
        expect(layoutReducer(state, { type: "split" })).toBe(state)
    })

    it("unsplit chiude i tab di destra (non li unisce) e torna a una sola area", () => {
        const next = layoutReducer(layout(tabs([1]), tabs([2, 3]), 1), { type: "unsplit" })
        expect(next).toEqual(layout(tabs([1])))
    })

    it("unsplit senza area destra non cambia nulla", () => {
        const state = layout(tabs([1]))
        expect(layoutReducer(state, { type: "unsplit" })).toBe(state)
    })

    it("focus cambia area, ignora la destra se non c'è e non cambia se uguale", () => {
        const split = layout(tabs([1]), tabs([2]), 0)
        expect(layoutReducer(split, { type: "focus", pane: 1 }).focused).toBe(1)
        expect(layoutReducer(split, { type: "focus", pane: 0 })).toBe(split)
        const single = layout(tabs([1]))
        expect(layoutReducer(single, { type: "focus", pane: 1 })).toBe(single)
    })
})

describe("open", () => {
    it("apre nell'area focalizzata", () => {
        const state = layout(tabs([1]), tabs([2]), 1)
        expect(layoutReducer(state, { type: "open", id: 3 })).toEqual(layout(tabs([1]), tabs([2, 3], 3), 1))
    })

    it("senza divisione apre nell'area sinistra", () => {
        expect(layoutReducer(initialLayoutState, { type: "open", id: 1 })).toEqual(layout(tabs([1])))
    })

    it("una nota già aperta nell'altra area viene attivata lì e l'area prende il focus", () => {
        const state = layout(tabs([1, 2], 1), tabs([3]), 1)
        expect(layoutReducer(state, { type: "open", id: 2 })).toEqual(layout(tabs([1, 2], 2), tabs([3]), 0))
    })

    it("una nota già attiva nell'area focalizzata non cambia lo stato", () => {
        const state = layout(tabs([1]), null, 0)
        expect(layoutReducer(state, { type: "open", id: 1 })).toBe(state)
    })
})

describe("activate", () => {
    it("attiva la nota nell'area che la contiene e la focalizza", () => {
        const state = layout(tabs([1, 2], 1), tabs([3, 4], 3), 0)
        expect(layoutReducer(state, { type: "activate", id: 4 })).toEqual(layout(tabs([1, 2], 1), tabs([3, 4], 4), 1))
    })

    it("ignora una nota non aperta", () => {
        const state = layout(tabs([1]))
        expect(layoutReducer(state, { type: "activate", id: 9 })).toBe(state)
    })
})

describe("pane", () => {
    it("applica l'azione all'area indicata e la focalizza", () => {
        const state = layout(tabs([1, 2], 1), tabs([3, 4], 3), 0)
        expect(layoutReducer(state, { type: "pane", pane: 1, action: { type: "activate", id: 4 } }))
            .toEqual(layout(tabs([1, 2], 1), tabs([3, 4], 4), 1))
    })

    it("open in un'area sposta la nota dall'altra area", () => {
        const state = layout(tabs([1, 2], 1), tabs([3], 3), 1)
        const next = layoutReducer(state, { type: "pane", pane: 1, action: { type: "open", id: 2 } })
        expect(next).toEqual(layout(tabs([1], 1), tabs([3, 2], 2), 1))
        expectValid(next)
    })

    it("open nell'area destra inesistente la crea", () => {
        const next = layoutReducer(layout(tabs([1, 2], 1)), { type: "pane", pane: 1, action: { type: "open", id: 2 } })
        expect(next).toEqual(layout(tabs([1], 1), tabs([2], 2), 1))
    })

    it("open di una nota già nell'area stessa la attiva", () => {
        const state = layout(tabs([1, 2], 1), tabs([3]), 1)
        expect(layoutReducer(state, { type: "pane", pane: 0, action: { type: "open", id: 2 } }))
            .toEqual(layout(tabs([1, 2], 2), tabs([3]), 0))
    })

    it("open di una nota non aperta la apre nell'area", () => {
        const state = layout(tabs([1]), tabs([3]), 1)
        expect(layoutReducer(state, { type: "pane", pane: 0, action: { type: "open", id: 7 } }))
            .toEqual(layout(tabs([1, 7], 7), tabs([3]), 0))
    })

    it("le altre azioni sull'area destra inesistente non fanno nulla", () => {
        const state = layout(tabs([1]))
        expect(layoutReducer(state, { type: "pane", pane: 1, action: { type: "closeActive" } })).toBe(state)
    })

    it("reorder sposta e attiva il tab nell'area", () => {
        const state = layout(tabs([1]), tabs([2, 3, 4], 2), 0)
        expect(layoutReducer(state, { type: "pane", pane: 1, action: { type: "reorder", from: 0, to: 2 } }))
            .toEqual(layout(tabs([1]), tabs([3, 4, 2], 2), 1))
    })

    it("close dell'ultimo tab a destra chiude l'area destra", () => {
        const state = layout(tabs([1]), tabs([2]), 1)
        expect(layoutReducer(state, { type: "close", id: 2 })).toEqual(layout(tabs([1])))
    })

    it("close dell'ultimo tab a sinistra promuove l'area destra", () => {
        const state = layout(tabs([1]), tabs([2, 3], 3), 0)
        expect(layoutReducer(state, { type: "close", id: 1 })).toEqual(layout(tabs([2, 3], 3)))
    })

    it("l'azione che non cambia nulla mantiene lo stato se l'area è già focalizzata", () => {
        const state = layout(tabs([1, 2], 1), null, 0)
        expect(layoutReducer(state, { type: "pane", pane: 0, action: { type: "activate", id: 1 } })).toBe(state)
    })

    it("l'area destra vuota creata da dividi resta se si chiude un tab a sinistra", () => {
        const state = layout(tabs([1, 2], 1), tabs([]), 1)
        const next = layoutReducer(state, { type: "close", id: 1 })
        expect(next.right).toEqual(tabs([]))
        expect(next.left).toEqual(tabs([2], 2))
    })
})

describe("moveToPane", () => {
    it("sposta la nota a destra creando l'area, attivandola e focalizzandola", () => {
        const next = layoutReducer(layout(tabs([1, 2, 3], 2)), { type: "moveToPane", id: 2, pane: 1 })
        expect(next).toEqual(layout(tabs([1, 3], 3), tabs([2], 2), 1))
        expectValid(next)
    })

    it("applica la regola del vicino all'area di origine", () => {
        const next = layoutReducer(layout(tabs([1, 2, 3], 2), tabs([9])), { type: "moveToPane", id: 2, pane: 1, index: 0 })
        expect(next.left).toEqual(tabs([1, 3], 3))
        expect(next.right).toEqual(tabs([2, 9], 2))
    })

    it("con una sola nota aperta lo spostamento a destra non cambia nulla: l'area sinistra rimasta vuota viene sostituita da quella destra", () => {
        const next = layoutReducer(layout(tabs([1], 1)), { type: "moveToPane", id: 1, pane: 1 })
        expect(next).toEqual(layout(tabs([1], 1)))
    })

    it("sposta a sinistra da destra", () => {
        const state = layout(tabs([1, 2], 1), tabs([3, 4], 4), 1)
        const next = layoutReducer(state, { type: "moveToPane", id: 4, pane: 0, index: 1 })
        expect(next).toEqual(layout(tabs([1, 4, 2], 4), tabs([3], 3), 0))
    })

    it("l'indice viene limitato all'intervallo valido", () => {
        const state = layout(tabs([1, 4]), tabs([2, 3]))
        expect(layoutReducer(state, { type: "moveToPane", id: 1, pane: 1, index: 99 }).right?.openIds).toEqual([2, 3, 1])
        const state2 = layout(tabs([1, 4]), tabs([2, 3]))
        expect(layoutReducer(state2, { type: "moveToPane", id: 1, pane: 1, index: -5 }).right?.openIds).toEqual([1, 2, 3])
    })

    it("spostando l'ultima nota dell'area destra l'area si chiude", () => {
        const state = layout(tabs([1]), tabs([2]), 1)
        expect(layoutReducer(state, { type: "moveToPane", id: 2, pane: 0 })).toEqual(layout(tabs([1, 2], 2)))
    })

    it("spostando l'ultima nota dell'area sinistra a destra, la destra diventa sinistra", () => {
        const state = layout(tabs([1]), tabs([2], 2), 0)
        expect(layoutReducer(state, { type: "moveToPane", id: 1, pane: 1 })).toEqual(layout(tabs([2, 1], 1)))
    })

    it("spostando l'unica nota a destra con una sola area si ottiene una sola area", () => {
        expect(layoutReducer(layout(tabs([1])), { type: "moveToPane", id: 1, pane: 1 })).toEqual(layout(tabs([1])))
    })

    it("nella stessa area riordina se c'è un indice, altrimenti attiva e focalizza", () => {
        const state = layout(tabs([1, 2, 3], 1), tabs([9], 9), 1)
        expect(layoutReducer(state, { type: "moveToPane", id: 3, pane: 0, index: 0 })).toEqual(layout(tabs([3, 1, 2], 3), tabs([9], 9), 0))
        expect(layoutReducer(state, { type: "moveToPane", id: 3, pane: 0 })).toEqual(layout(tabs([1, 2, 3], 3), tabs([9], 9), 0))
    })

    it("nella stessa area, stato invariato se già tutto a posto", () => {
        const state = layout(tabs([1, 2], 2))
        expect(layoutReducer(state, { type: "moveToPane", id: 2, pane: 0 })).toBe(state)
    })

    it("una nota non aperta viene aperta nell'area di destinazione", () => {
        const next = layoutReducer(layout(tabs([1])), { type: "moveToPane", id: 5, pane: 1 })
        expect(next).toEqual(layout(tabs([1]), tabs([5], 5), 1))
    })

    it("è atomico: una sola azione, mai una nota in due aree", () => {
        const state = layout(tabs([1, 2, 3]), tabs([4, 5]), 0)
        for (const id of [1, 2, 3, 4, 5]) {
            for (const pane of [0, 1] as const) expectValid(layoutReducer(state, { type: "moveToPane", id, pane, index: 1 }))
        }
    })
})

describe("close / closeMany / closeActive", () => {
    it("close chiude la nota nell'area che la contiene e mantiene il focus", () => {
        const state = layout(tabs([1, 2], 1), tabs([3, 4], 3), 1)
        expect(layoutReducer(state, { type: "close", id: 2 })).toEqual(layout(tabs([1], 1), tabs([3, 4], 3), 1))
    })

    it("close di una nota non aperta non cambia lo stato", () => {
        const state = layout(tabs([1]), tabs([2]))
        expect(layoutReducer(state, { type: "close", id: 9 })).toBe(state)
    })

    it("closeMany attraversa le due aree e collassa quella svuotata", () => {
        const state = layout(tabs([1, 2], 1), tabs([3, 4], 3), 1)
        expect(layoutReducer(state, { type: "closeMany", ids: [3, 4, 2] })).toEqual(layout(tabs([1], 1)))
    })

    it("closeMany che svuota la sinistra promuove la destra", () => {
        const state = layout(tabs([1, 2]), tabs([3], 3), 1)
        expect(layoutReducer(state, { type: "closeMany", ids: [1, 2] })).toEqual(layout(tabs([3], 3)))
    })

    it("closeMany che svuota tutto lascia un'unica area vuota", () => {
        const state = layout(tabs([1]), tabs([2]), 1)
        const next = layoutReducer(state, { type: "closeMany", ids: [1, 2] })
        expect(next.right).toBeNull()
        expect(unionOpenIds(next)).toEqual([])
        expectValid(next)
    })

    it("closeActive agisce sull'area focalizzata", () => {
        const state = layout(tabs([1, 2], 1), tabs([3, 4], 4), 1)
        expect(layoutReducer(state, { type: "closeActive" })).toEqual(layout(tabs([1, 2], 1), tabs([3], 3), 1))
    })

    it("closeActive dell'ultimo tab a destra chiude l'area destra", () => {
        const state = layout(tabs([1]), tabs([3]), 1)
        expect(layoutReducer(state, { type: "closeActive" })).toEqual(layout(tabs([1])))
    })

    it("closeActive senza tab attivi non cambia lo stato", () => {
        expect(layoutReducer(initialLayoutState, { type: "closeActive" })).toBe(initialLayoutState)
    })

    it("closeActive su una destra vuota (appena divisa) non la chiude", () => {
        const state = layout(tabs([1]), tabs([]), 1)
        expect(layoutReducer(state, { type: "closeActive" })).toBe(state)
    })
})

describe("cycle", () => {
    it("scorre i tab dell'area focalizzata", () => {
        const state = layout(tabs([1, 2], 1), tabs([3, 4, 5], 3), 1)
        expect(layoutReducer(state, { type: "cycle", direction: 1 }).right?.activeId).toBe(4)
        expect(layoutReducer(state, { type: "cycle", direction: -1 }).right?.activeId).toBe(5)
        expect(layoutReducer(state, { type: "cycle", direction: 1 }).left).toBe(state.left)
    })

    it("non fa nulla con un solo tab", () => {
        const state = layout(tabs([1]), tabs([2]), 0)
        expect(layoutReducer(state, { type: "cycle", direction: 1 })).toBe(state)
    })
})

describe("closeAll", () => {
    it("chiude entrambe le aree e collassa", () => {
        expect(layoutReducer(layout(tabs([1]), tabs([2]), 1), { type: "closeAll" })).toEqual(initialLayoutState)
    })

    it("chiude anche un'area destra vuota", () => {
        expect(layoutReducer(layout(tabs([]), tabs([]), 1), { type: "closeAll" })).toEqual(initialLayoutState)
    })

    it("non cambia lo stato iniziale", () => {
        expect(layoutReducer(initialLayoutState, { type: "closeAll" })).toBe(initialLayoutState)
    })
})

describe("prune", () => {
    it("chiude le note inesistenti in entrambe le aree", () => {
        const state = layout(tabs([1, 2], 2), tabs([3, 4], 3), 1)
        expect(layoutReducer(state, { type: "prune", existing: new Set([1, 4]) })).toEqual(layout(tabs([1], 1), tabs([4], 4), 1))
    })

    it("collassa un'area svuotata", () => {
        const state = layout(tabs([1]), tabs([3], 3), 1)
        expect(layoutReducer(state, { type: "prune", existing: new Set([1]) })).toEqual(layout(tabs([1])))
        expect(layoutReducer(state, { type: "prune", existing: new Set([3]) })).toEqual(layout(tabs([3], 3)))
    })

    it("non cambia lo stato se tutte le note esistono", () => {
        const state = layout(tabs([1]), tabs([3]))
        expect(layoutReducer(state, { type: "prune", existing: new Set([1, 3]) })).toBe(state)
    })

    it("non chiude l'area destra vuota creata da dividi", () => {
        const state = layout(tabs([1]), tabs([]), 1)
        expect(layoutReducer(state, { type: "prune", existing: new Set([1]) })).toBe(state)
    })
})

describe("restore / hydrate", () => {
    it("restore sostituisce tutto e normalizza", () => {
        const next = layoutReducer(layout(tabs([9])), { type: "restore", state: layout(tabs([1, 2], 1), tabs([2, 3], 2), 1) })
        expect(next).toEqual(layout(tabs([1, 2], 1), tabs([3], 3), 1))
        expectValid(next)
    })

    it("restore di uno stato senza destra azzera il focus", () => {
        expect(layoutReducer(initialLayoutState, { type: "restore", state: layout(tabs([1]), null, 1) }).focused).toBe(0)
    })

    it("hydrate si applica solo se non ci sono note aperte", () => {
        const saved = layout(tabs([1]), tabs([2]), 1)
        expect(layoutReducer(initialLayoutState, { type: "hydrate", state: saved })).toEqual(saved)
        const open = layout(tabs([7]))
        expect(layoutReducer(open, { type: "hydrate", state: saved })).toBe(open)
        const onlyRight = layout(tabs([]), tabs([8]))
        expect(layoutReducer(onlyRight, { type: "hydrate", state: saved })).toBe(onlyRight)
    })

    it("hydrate tiene la prima occorrenza da sinistra a destra", () => {
        const next = layoutReducer(initialLayoutState, { type: "hydrate", state: layout(tabs([1, 2], 1), tabs([2, 3], 2), 1) })
        expect(next).toEqual(layout(tabs([1, 2], 1), tabs([3], 3), 1))
    })

    it("hydrate di uno stato con la sinistra vuota promuove la destra", () => {
        expect(layoutReducer(initialLayoutState, { type: "hydrate", state: layout(tabs([]), tabs([4], 4), 1) })).toEqual(layout(tabs([4], 4)))
    })
})

describe("reopen", () => {
    it("riapre nell'area dello snapshot le note chiuse nel frattempo", () => {
        const snapshot = layout(tabs([1, 2], 2), tabs([3, 4], 4), 1)
        const current = layout(tabs([1], 1), tabs([3], 3), 0)
        const next = layoutReducer(current, { type: "reopen", state: snapshot })
        expect(next).toEqual(layout(tabs([1, 2], 2), tabs([3, 4], 4), 0))
        expectValid(next)
    })

    it("ripristina la divisione se lo snapshot aveva la destra e ora è chiusa", () => {
        const snapshot = layout(tabs([1]), tabs([2, 3], 3), 1)
        const next = layoutReducer(layout(tabs([1])), { type: "reopen", state: snapshot })
        expect(next.right).toEqual(tabs([2, 3], 3))
        expect(next.left).toEqual(tabs([1], 1))
        expectValid(next)
    })

    it("non crea la divisione se non c'è nulla da riaprire a destra", () => {
        const snapshot = layout(tabs([1, 2]), tabs([]), 1)
        const next = layoutReducer(layout(tabs([1])), { type: "reopen", state: snapshot })
        expect(next.right).toBeNull()
        expect(next.left.openIds).toEqual([1, 2])
    })

    it("non duplica una nota ora aperta nell'altra area", () => {
        const snapshot = layout(tabs([1, 2], 2), tabs([3], 3), 0)
        // la nota 2 era a sinistra, ora è stata spostata a destra
        const current = layout(tabs([1], 1), tabs([3, 2], 2), 1)
        const next = layoutReducer(current, { type: "reopen", state: snapshot })
        expect(next).toBe(current)
        expectValid(next)
    })

    it("mantiene le note aperte nel frattempo e non cambia l'area attiva se non era chiusa", () => {
        const snapshot = layout(tabs([1, 2], 1))
        const current = layout(tabs([1, 5], 5))
        const next = layoutReducer(current, { type: "reopen", state: snapshot })
        expect(next.left.openIds).toEqual([1, 2, 5])
        expect(next.left.activeId).toBe(5)
    })

    it("dopo la promozione della destra (nota sinistra eliminata) ripristina le due aree", () => {
        const snapshot = layout(tabs([1]), tabs([2]), 1)
        const collapsed = layoutReducer(snapshot, { type: "close", id: 1 })
        expect(collapsed).toEqual(layout(tabs([2]), null, 0))
        const next = layoutReducer(collapsed, { type: "reopen", state: snapshot })
        expect(next.left).toEqual(tabs([1]))
        expect(next.right).toEqual(tabs([2]))
        expectValid(next)
    })

    it("caso simmetrico: la destra svuotata si chiude e torna con la sua nota", () => {
        const snapshot = layout(tabs([1]), tabs([2]), 1)
        const collapsed = layoutReducer(snapshot, { type: "close", id: 2 })
        expect(collapsed.right).toBeNull()
        const next = layoutReducer(collapsed, { type: "reopen", state: snapshot })
        expect(next.left).toEqual(tabs([1]))
        expect(next.right).toEqual(tabs([2]))
        expectValid(next)
    })

    it("la promozione con più tab riporta ogni nota nella sua area e nella posizione originale", () => {
        const snapshot = layout(tabs([1, 3], 1), tabs([2, 4], 4), 0)
        const collapsed = layoutReducer(snapshot, { type: "closeMany", ids: [1, 3] })
        expect(collapsed.right).toBeNull()
        const next = layoutReducer(collapsed, { type: "reopen", state: snapshot })
        expect(next.left).toEqual(tabs([1, 3], 1))
        expect(next.right).toEqual(tabs([2, 4], 4))
        expectValid(next)
    })

    it("una nota aperta nel frattempo resta dov'è", () => {
        const snapshot = layout(tabs([1]), tabs([2]), 1)
        const collapsed = layoutReducer(snapshot, { type: "close", id: 1 })
        const withNew = layoutReducer(collapsed, { type: "pane", pane: 0, action: { type: "open", id: 9 } })
        expect(withNew.left.openIds).toEqual([2, 9])
        const next = layoutReducer(withNew, { type: "reopen", state: snapshot })
        expect(next.left.openIds).toEqual([1, 9])
        expect(next.right?.openIds).toEqual([2])
        expectValid(next)
    })

    it("conserva il focus corrente", () => {
        const snapshot = layout(tabs([1]), tabs([2]), 1)
        const collapsed = layoutReducer(snapshot, { type: "close", id: 1 })
        expect(collapsed.focused).toBe(0)
        expect(layoutReducer(collapsed, { type: "reopen", state: snapshot }).focused).toBe(0)
        const split = layout(tabs([1]), tabs([2, 3], 2), 1)
        const current = layout(tabs([1]), tabs([2], 2), 1)
        expect(layoutReducer(current, { type: "reopen", state: split }).focused).toBe(1)
    })

    it("senza note chiuse non cambia lo stato", () => {
        const state = layout(tabs([1]), tabs([2]), 1)
        expect(layoutReducer(state, { type: "reopen", state })).toBe(state)
    })

    it("dopo la chiusura di tutto riporta entrambe le aree", () => {
        const snapshot = layout(tabs([1, 2], 1), tabs([3], 3), 1)
        const next = layoutReducer(initialLayoutState, { type: "reopen", state: snapshot })
        expect(next.left.openIds).toEqual([1, 2])
        expect(next.right?.openIds).toEqual([3])
        expectValid(next)
    })
})

describe("normalizeLayout", () => {
    it("restituisce lo stesso oggetto se è già valido", () => {
        const state = layout(tabs([1]), tabs([2]), 1)
        expect(normalizeLayout(state)).toBe(state)
        expect(normalizeLayout(initialLayoutState)).toBe(initialLayoutState)
    })

    it("una nota in entrambe le aree resta nella sinistra", () => {
        expect(normalizeLayout(layout(tabs([1, 2], 1), tabs([2, 3], 2), 1))).toEqual(layout(tabs([1, 2], 1), tabs([3], 3), 1))
    })

    it("toglie i duplicati dentro un'area", () => {
        expect(normalizeLayout(layout(tabs([1, 1, 2], 2)))).toEqual(layout(tabs([1, 2], 2)))
    })

    it("un id attivo non aperto ricade sul primo tab, e null se non ce ne sono", () => {
        expect(normalizeLayout(layout(tabs([1, 2], 9)))).toEqual(layout(tabs([1, 2], 1)))
        expect(normalizeLayout(layout({ openIds: [], activeId: 4 }))).toEqual(initialLayoutState)
    })

    it("azzera il focus senza area destra", () => {
        expect(normalizeLayout(layout(tabs([1]), null, 1)).focused).toBe(0)
    })

    it("una destra che resta vuota dopo la rimozione dei duplicati resta (ma non è promossa)", () => {
        const next = normalizeLayout(layout(tabs([1]), tabs([1]), 1))
        expect(next).toEqual(layout(tabs([1]), tabs([]), 1))
    })

    it("la sinistra vuota viene sostituita dalla destra con i tab", () => {
        expect(normalizeLayout(layout(tabs([]), tabs([2, 3], 3), 1))).toEqual(layout(tabs([2, 3], 3)))
    })

    it("mantiene la destra vuota creata da dividi", () => {
        const state = layout(tabs([1]), tabs([]), 1)
        expect(normalizeLayout(state)).toBe(state)
    })
})

describe("invarianti su sequenze di azioni", () => {
    it("restano validi dopo una sequenza mista", () => {
        const actions: LayoutAction[] = [
            { type: "open", id: 1 }, { type: "open", id: 2 }, { type: "open", id: 3 },
            { type: "moveToPane", id: 2, pane: 1 },
            { type: "open", id: 4 },
            { type: "pane", pane: 0, action: { type: "open", id: 4 } },
            { type: "cycle", direction: -1 },
            { type: "moveToPane", id: 1, pane: 1, index: 0 },
            { type: "closeActive" },
            { type: "prune", existing: new Set([2, 3, 4]) },
            { type: "unsplit" },
        ]
        let state = initialLayoutState
        for (const action of actions) {
            state = layoutReducer(state, action)
            expectValid(state)
        }
        expect(run(state, { type: "closeAll" })).toEqual(initialLayoutState)
    })
})
