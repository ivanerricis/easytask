import type { ScrollPosition, SelectedItem, TabUiStore } from "./tabs-context-object"

const NO_TAGS: readonly number[] = []

/**
 * Creates the store of the per-note UI state.
 * @returns The store.
 * @category Tabs
 */
export function createTabUiStore(): TabUiStore {
    const revealed = new Map<number, Set<string>>()
    const scroll = new Map<number, ScrollPosition>()
    const selected = new Map<number, SelectedItem>()
    const tagFilters = new Map<number, readonly number[]>()
    const listeners = new Set<() => void>()
    const emit = () => listeners.forEach(listener => listener())

    return {
        isRevealed: (noteId, kind, id) => revealed.get(noteId)?.has(`${kind}-${id}`) ?? false,
        setRevealed: (noteId, kind, id, value) => {
            const set = revealed.get(noteId) ?? new Set<string>()
            const key = `${kind}-${id}`
            if (set.has(key) === value) return
            if (value) set.add(key)
            else set.delete(key)
            revealed.set(noteId, set)
            emit()
        },
        clearRevealed: noteId => {
            if (!revealed.get(noteId)?.size) return
            revealed.delete(noteId)
            emit()
        },
        getSelectedItem: noteId => selected.get(noteId) ?? null,
        setSelectedItem: (noteId, item) => {
            const current = selected.get(noteId)
            if (!item) {
                if (!current) return
                selected.delete(noteId)
            } else {
                if (current?.type === item.type && current.id === item.id) return
                selected.set(noteId, { type: item.type, id: item.id })
            }
            emit()
        },
        getTagFilter: noteId => tagFilters.get(noteId) ?? NO_TAGS,
        setTagFilter: (noteId, tagIds) => {
            const current = tagFilters.get(noteId) ?? NO_TAGS
            if (current.length === tagIds.length && current.every((id, index) => id === tagIds[index])) return
            if (tagIds.length === 0) tagFilters.delete(noteId)
            else tagFilters.set(noteId, [...tagIds])
            emit()
        },
        getScroll: noteId => scroll.get(noteId),
        setScroll: (noteId, position) => { scroll.set(noteId, position) },
        retain: keep => {
            const keepSet = new Set(keep)
            for (const id of [...revealed.keys()]) if (!keepSet.has(id)) revealed.delete(id)
            for (const id of [...selected.keys()]) if (!keepSet.has(id)) selected.delete(id)
            for (const id of [...tagFilters.keys()]) if (!keepSet.has(id)) tagFilters.delete(id)
            for (const id of [...scroll.keys()]) if (!keepSet.has(id)) scroll.delete(id)
        },
        subscribe: listener => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
        },
    }
}
