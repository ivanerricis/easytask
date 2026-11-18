import { createContext, useContext } from "react"

/**
 * The element of the column of a group (the full height wrapper of GroupContainer), or null before it is mounted / outside a column.
 * Things that must span the whole column, not only the card (the resize handle), are drawn in it with a portal.
 */
export const GroupColumnContext = createContext<HTMLElement | null>(null)

export const useGroupColumn = () => useContext(GroupColumnContext)
