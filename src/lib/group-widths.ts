/**
 * Last width of each group while it was open. A group is as wide as its widest section (or its header), so it would
 * shrink to the header as soon as it is collapsed: with the horizontal layout the collapsed group keeps this width instead.
 */
const openWidths = new Map<number, number>()

export const getOpenGroupWidth = (groupId: number): number | undefined => openWidths.get(groupId)

export const setOpenGroupWidth = (groupId: number, width: number): void => { openWidths.set(groupId, width) }

/** Drops the width of a group that was deleted (the map would only grow otherwise). */
export const forgetOpenGroupWidth = (groupId: number): void => { openWidths.delete(groupId) }
