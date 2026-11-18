/**
 * How the tasks of a section are put in order on screen (a view only: the stored order never changes):
 * - `manual`: the stored order, set by hand;
 * - `open-first`: the open tasks, then the completed ones;
 * - `done-first`: the completed tasks, then the open ones.
 * @category Note
 */
export const TASK_ORDERS = ["manual", "open-first", "done-first"] as const

export type TaskOrder = typeof TASK_ORDERS[number]

/** Whether a value read from the database or from a file is one of the orders. */
export const isTaskOrder = (value: unknown): value is TaskOrder =>
    typeof value === "string" && (TASK_ORDERS as readonly string[]).includes(value)

/**
 * The order a section is drawn in: its own choice (`section.task_order`) when it has one, otherwise the global preference
 * "completed tasks last" (the tasks put directly in a group have no choice and always follow it).
 * @category Note
 */
export const effectiveTaskOrder = (sectionOrder: TaskOrder | string | null | undefined, completedLast: boolean): TaskOrder =>
    isTaskOrder(sectionOrder) ? sectionOrder : completedLast ? "open-first" : "manual"

/**
 * Whether the user chose an order for the section that is not the manual one: the tasks are then drawn in a fixed order,
 * so they cannot be dragged (a drop would have no visible place).
 * @category Note
 */
export const isTaskOrderLocked = (sectionOrder: TaskOrder | string | null | undefined): boolean =>
    isTaskOrder(sectionOrder) && sectionOrder !== "manual"
