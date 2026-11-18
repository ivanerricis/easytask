# Drag benchmark: note drag without dnd-kit hooks (perf/drag-own-pointer)

PR 2 removes `useDraggable` from every row of the note (task, section, group) and the `DndContext` / `DragOverlay` from the note provider:
a stable `onPointerDown`, an own pointer controller (note-dnd-pointer.ts), own preview (translate3d in rAF) and own autoscroll. Sidebar and
tabs stay on dnd-kit.

Method as results-remeasure.md: production frontend, viewport 1000x700, 213 tasks, live drag on, `LAG_THROTTLE=4 LAG_RUNS=5`, medians of the
per-run medians over 3 alternated repetitions (before = PR 1 build `perf/drag-remeasure`, after = this branch, before/after/before/after...).
The machine was much faster and quiet today than when results-remeasure.md was written (absolute numbers are not comparable with it).

## 4x CPU throttle (ms)

| metric | before within | after within | before between | after between | before groups | after groups |
|---|---|---|---|---|---|---|
| p95 frame | 128.6 | 108.9 | 146.1 | 121.1 | 156 | 139 |
| max frame at target change | 94.4 | 111.4 | 101.8 | 124.6 | 84 | 114.9 |
| long tasks / drag | 16 | 23 | 23 | 24 | 16 | 19 |
| start max frame | 311.5 | 180.7 | 373.3 | 228.7 | 488.1 | 244 |
| start long tasks | 5 | 11 | 4 | 9 | 1 | 5 |
| drop long task sum | 1287 | 346 | 1276 | 298 | 1307 | 186 |
| drop max frame (longest task) | 930 | 193 | 943 | 172 | 1136 | 105 |

Per repetition (before / after): p95 frame within 129, 126, 161 / 109, 102, 121; drop long task sum within 1273, 1287, 1387 / 346, 338, 347;
between 1253, 1276, 1283 / 308, 298, 243; groups 1250, 1346, 1307 / 155, 186, 244.

## React renders (`LAG_RENDERS=1`, 3 runs, fibers re-rendered per commit)

| | before | after |
|---|---|---|
| start of the drag | 337 + 230 (+ two 11) | 136 |
| drop | 801-993 + 261 | 286 (the move in the tree) |

## Reading the numbers

- Clear gain at the start (max frame -40 to -50%) and at the drop (long task sum -73 to -86%, longest task -80%): the 193 task shells no
  longer re-render when dnd-kit's `active` changes, and at the drop the draggables context no longer re-renders them either.
  p95 of the drag is 5-17% better.
- NOT better: the max frame in the 100 ms after a change of target is 15-40% worse in all three repetitions of all three scenarios
  (94 -> 111, 102 -> 125, 84 -> 115), and the long tasks per drag / at the start are more numerous (smaller ones: their sum is lower).
  The cause was not found: the loaf entries show the same style/layout share; the autoscroll no longer reads the layout every frame
  (rects measured once). It belongs to point 1 of the card (change of target), the next PR.
- The `groups` scenario (a horizontal autoscroll drag on a small window) is sensitive to the autoscroll speed: with a time based step
  at 4x it scrolled past the target group. The step is now capped (a frame longer than 34 ms scrolls one 5 ms step, like dnd-kit's
  interval after a long task); 2 of the 15 runs of `groups` after still did not move the task (1 of 15 before).
- The first repetition of the first session (machine busy) is not used.

## Verified separately

vitest (whole suite), tsc, eslint, e2e:typecheck; e2e on this build: live-drag (11), drop-feedback (8), free-order (9), split-workspace (8),
live-drag-sidebar (5), sidebar-keyboard (3), collapsed-state (7), group-width (7), live-drag-tabs (7 in the first run). live-drag-scroll
fails in its setup ("inner size 0x0") as on the baseline. Later live-drag-tabs fails 6 of 7 ("move target out of bounds") also on the PR 1
build: the window of this machine changed, not the code.
