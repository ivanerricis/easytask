# Drag benchmark: master vs the drop work (branch perf/note-drag-drop)

Production frontend in a `tauri build --debug --no-bundle` exe, viewport 1000x700, synthetic note of 213 tasks, live drag on,
6 measured drags per scenario after a warm-up. Cells are medians of the per-run medians over several repetitions (master x4,
drop x4 unthrottled; x6 each at 4x), the builds alternated (A B A B...). The machine was shared with other builds and test runs: at
1x the noise is as big as the effect (a 17 ms frame is the vsync), so the 4x CPU-throttled columns (`LAG_THROTTLE=4`) are the
main criteria. Master is 0.23.0 + #115 (a2fdf92 without #116, which does not touch the note).

What the branch changes (nothing about dnd-kit):
- `TaskTabStopProvider` gave a new `{ listKey, store }` object to its context on every render, so every row of a list re-rendered
  when the list did (a drop re-renders the two lists it touches: ~36 rows with all their Radix tooltips/menus). Now the value is memoized.
- The "+" insert lines read `dragging` from the drag store: all ~200 re-rendered (and were rebuilt with their Button and icon)
  when a drag ended. Now they are always rendered and hidden by CSS (`body[data-note-dragging]`, set by the DragCursor).
- The refocus after a row left a list uses `focus({ preventScroll: true })`.

Render counts of the commit of the drop (`LAG_RENDERS=1`, between): 4123 fibers on master, 857 with this branch (the 193 task
shells, re-rendered by the dnd-kit draggables context, remain). The next commits (undo of the benchmark) are the same.

## 1x (ms)

| metric | master within | master between | drop within | drop between |
|---|---|---|---|---|
| p95 frame | 19.5 | 21.2 | 20.2 | 24.1 |
| max frame at target change | 32 | 34.1 | 29 | 31.9 |
| long tasks / drag | 2 | 2 | 2 | 2 |
| start max frame | 111.7 | 88.7 | 90.9 | 78.2 |
| drop long task sum | 188 | 171 | 131 | 135 |
| drop max frame | 196.7 | 175.3 | 148.3 | 144.8 |

## 4x CPU throttle (ms)

| metric | master within | master between | drop within | drop between |
|---|---|---|---|---|
| p95 frame | 184.5 | 211.1 | 181.7 | 204.4 |
| max frame at target change | 92.4 | 111.7 | 92 | 116.9 |
| long tasks / drag | 28 | 36 | 29 | 36 |
| start max frame | 645.5 | 652 | 614.6 | 631.2 |
| drop long task sum | 1546 | 1561 | 1413 | 1413 |
| drop max frame | 1135 | 1279 | 1032 | 1015 |

Reading: the drop work gives about -25% at 1x and -9% (long task sum) / -10..20% (max frame) at 4x on the drop. It does not touch the drag
itself. The drop is still ~1.4 s of long tasks at 4x (about 350 ms real): what is left is not dnd: the replacement of the tree re-renders
the moved lists, the dnd-kit draggables (193 shells) re-render when the drag ends, and the browser lays out the changed lists
(the CPU profile at the drop is mostly `(program)`, i.e. style/layout/paint, and React work).
