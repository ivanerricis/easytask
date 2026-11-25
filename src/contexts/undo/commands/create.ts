import { createUndoHelpers } from "./helpers"
import { itemCommands } from "./item"
import { pageCommands } from "./page"
import { sectionCommands } from "./section"
import { tagCommands } from "./tag"
import { taskCommands } from "./task"
import { treeCommands } from "./tree"
import type { UndoDeps } from "./types"

/**
 * Builds the commands (an action and its inverse, both on stable ids) of every undoable user action.
 * Every inverse applies the same optimistic update as the original action, so no full reload is needed, and
 * rolls it back when the write fails (the error then reaches the history, which reports it).
 * @category Undo
 */
export function createUndoCommands(deps: UndoDeps) {
    const helpers = createUndoHelpers(deps)
    return {
        ...itemCommands(helpers),
        ...treeCommands(helpers),
        ...sectionCommands(helpers),
        ...taskCommands(helpers),
        ...tagCommands(helpers),
        ...pageCommands(),
    }
}
