import { vi, type Mock } from "vitest"
import type { UndoRecorder } from "@/contexts/undo/commands"

/** The spies behind the `sonner` mock: assert on them (`toastMock.error`) and clear them with `vi.clearAllMocks()`. */
export const toastMock = Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
})

/**
 * Factory for `vi.mock("sonner", ...)`: a superset of the shapes hand-written in the tests (`toast` is callable and has
 * the usual methods; `Toaster` renders nothing).
 *
 * @example
 * vi.mock("sonner", async () => (await import("@/test/mocks")).sonnerMock())
 * // in a test:
 * const { toastMock } = await import("@/test/mocks")
 * expect(toastMock.error).toHaveBeenCalled()
 */
export const sonnerMock = () => ({ toast: toastMock, Toaster: () => null })

/** Every method of the real `UndoRecorder` (src/contexts/undo/commands.ts); the compile-time check below keeps the list in sync. */
const UNDO_RECORDER_METHODS = [
    "rename", "color", "background", "taskCompletion", "taskPriority", "taskDescription", "remove", "create", "archive", "unarchive", "archiveMany",
    "treeMove", "removeMany", "colorMany", "colorContent", "treeMoveMany", "sectionMove", "directMove", "sectionMoveToNewGroup",
    "taskMove", "taskMoveMany", "tagCreate", "tagDelete", "tagRename", "tagColor", "tagAssign", "record",
] as const satisfies readonly (keyof UndoRecorder)[]
const _allUndoMethodsListed: Exclude<keyof UndoRecorder, typeof UNDO_RECORDER_METHODS[number] | "track"> extends never ? true : never = true
void _allUndoMethodsListed

type UndoRecorderMock = Record<typeof UNDO_RECORDER_METHODS[number] | "track", Mock>

/**
 * A recorder for `vi.mock("@/contexts/undo/use-undo", ...)`: every method is a `vi.fn()` (`track` returns the write it is
 * given, like the real one outside a pending undo). Pass the spies a test keeps its own reference to as `overrides`.
 *
 * @example
 * const recorder = makeUndoRecorderMock()
 * vi.mock("@/contexts/undo/use-undo", () => ({ useUndoRecorder: () => recorder }))
 */
export const makeUndoRecorderMock = (overrides: Partial<UndoRecorderMock> = {}): UndoRecorderMock => ({
    ...Object.fromEntries(UNDO_RECORDER_METHODS.map(name => [name, vi.fn()])) as Record<typeof UNDO_RECORDER_METHODS[number], Mock>,
    track: vi.fn(<T,>(write: Promise<T>) => write),
    ...overrides,
})

/** Factory for the whole `use-undo` module with a stable recorder (and no UndoProvider: `useOptionalUndo` is null). */
export const undoModuleMock = (recorder: UndoRecorderMock = makeUndoRecorderMock()) => ({
    useUndoRecorder: () => recorder,
    useOptionalUndo: () => null,
})

/**
 * Factory for `vi.mock("@/lib/report-error", ...)` when the test does not need the real dedupe: both exports are spies.
 * (Tests that only silence `reportError` keep spreading `importOriginal()`.)
 */
export const reportErrorMock = () => ({ reportError: vi.fn(), resetReportErrorDedupe: vi.fn() })
