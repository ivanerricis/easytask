/**
 * The shapes a tag can be drawn with. `pill` is the default (stored as NULL), the others are chosen by the user.
 * @category Utils
 */
export const TAG_SHAPES = ["pill", "rounded", "dot", "tag"] as const

export type TagShape = (typeof TAG_SHAPES)[number]

/** The shape as stored: NULL = the default pill. */
export type StoredTagShape = Exclude<TagShape, "pill"> | null

/** The shape of a stored/imported value: anything unknown (or "pill") is the default, NULL. */
export function toStoredShape(value: unknown): StoredTagShape {
    return typeof value === "string" && value !== "pill" && (TAG_SHAPES as readonly string[]).includes(value) ? value as StoredTagShape : null
}

/** The shape to draw: NULL/unknown = pill. */
export const shapeOf = (value: unknown): TagShape => toStoredShape(value) ?? "pill"
