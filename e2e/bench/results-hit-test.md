# Drag benchmark: master vs the drop work vs the hit-test

Same method as results-drop.md (production frontend, viewport 1000x700, 213 tasks, live drag on, 6 drags per scenario, medians of the
per-run medians over alternated repetitions; the machine was shared, 1x is noise-limited, 4x CPU throttle is the main criterion).

- master: 0.23.0 + #115
- drop: branch perf/note-drag-drop (stable tab stop context, insert lines hidden by CSS, refocus without scroll)
- hit-test: this branch = drop + own hit-test (no dnd-kit droppables in the note DndContext; note-dnd-hit.ts), the task shells read a
  constant `active`, screen reader announcements from the hit-test, scroll of every ancestor + re-measure on resize

## 4x CPU throttle (ms), 6 repetitions each

| metric | master within | master between | drop within | drop between | hit-test within | hit-test between |
|---|---|---|---|---|---|---|
| p95 frame | 184.5 | 211.1 | 181.7 | 204.4 | 144.9 | 160.7 |
| max frame at target change | 92.4 | 111.7 | 92 | 116.9 | 96.3 | 115.1 |
| long tasks / drag | 28 | 36 | 29 | 36 | 19 | 26 |
| start max frame | 645.5 | 652 | 614.6 | 631.2 | 337.5 | 387.3 |
| start long tasks | 5 | 7 | 5 | 6 | 6 | 5 |
| drop long task sum | 1546 | 1561 | 1413 | 1413 | 1367 | 1384 |
| drop max frame | 1135 | 1279 | 1032 | 1015 | 961 | 1073 |

## 1x (ms), 4 repetitions each (noisy)

| metric | master within | master between | drop within | drop between | hit-test within | hit-test between |
|---|---|---|---|---|---|---|
| p95 frame | 19.5 | 21.2 | 20.2 | 24.1 | 18.5 | 26.6 |
| max frame at target change | 32 | 34.1 | 29 | 31.9 | 20.4 | 33.4 |
| long tasks / drag | 2 | 2 | 2 | 2 | 2 | 3 |
| start max frame | 111.7 | 88.7 | 90.9 | 78.2 | 70.7 | 65.8 |
| drop long task sum | 188 | 171 | 131 | 135 | 168 | 221 |
| drop max frame | 196.7 | 175.3 | 148.3 | 144.8 | 187.4 | 224.2 |

## What each branch gains

- drop: the commit of the drop goes from 4123 re-rendered fibers to 857; about -25% of the drop at 1x, -9% long-task sum and -10..20%
  max frame at 4x. Nothing during the drag.
- hit-test on top: the start of the drag (max frame 650 -> 340-390 ms at 4x, 90-110 -> 65-70 ms at 1x), p95 of the drag at 4x
  (-20 to -24% vs drop), long tasks per drag at 4x (28-36 -> 19-26), and the ~250-render commit at every change of the target is
  gone (see below). Not better than the drop branch at the drop; at 1x the `between` drop numbers of this build are not better
  than master within the noise (a repetition ran while the machine was busy).
- Still not met by either: max frame at a target change (~92-117 ms at 4x in all builds) and the drop (~1.4 s of long tasks at 4x,
  ~350 ms real): the target-change frame is dominated by something that is not React re-rendering (the live shifts writing transforms
  and the layout of the shifted rows, the DragOverlay); the drop by the replacement of the tree (857 fibers), the dnd-kit draggables
  re-render and the layout.

React renders per commit (`LAG_RENDERS=1`, between): master: start 527 (193 x 2), a 252-fiber commit at every change of the target, drop 4123.
drop: start 334 + 252 at each change of the target, drop 857. hit-test: start 334 + 227, no 252 commits at the changes, drop 857.
