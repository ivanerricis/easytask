# Drag benchmark: the frame at a change of the drop target (perf/drag-target-change)

PR 3 is about the frame in which the drop target changes (the rows step aside, the skeleton moves, the target is highlighted).
Method as results-own-pointer.md: production frontend, viewport 1000x700, 213 tasks, live drag on, `LAG_THROTTLE=4 LAG_RUNS=5`, medians of the
per-run medians over 3 alternated repetitions (before = PR 2 build `perf/drag-own-pointer`, after = this branch, before/after/before/after...).

**The machine was NOT quiet** (a stray `dllhost` kept the CPU at 65-75% for the whole session), so every absolute number here is 3-4x worse
than in results-own-pointer.md (target change 111-125 ms there, 400-470 ms here for the same build). Only the before/after ratio of the
alternated runs means something; the "< 50 ms" criterion could not be checked in absolute terms.

## What the trace says (LAG_TRACE=1, Chrome trace of the frames after a change of target)

In the 130 ms after a change (4x CPU) the time is not in script: it is layout (about 30 ms), layer building (`Layerize`, 40-60 ms), paint and
the React commit of the new target (about 45 ms). With the invalidation tracking category the layouts have two causes, each one enough
to cost the same (that is why removing one alone changed nothing in the first experiments):

1. **A transform that appears or goes away on a task wrapper** (`transform: ""` -> `translate3d(...)` and back) changes what the wrapper is the
   containing block of, which is a layout of the wrapper ("Style changed" on ~20-50 wrappers per change). A step aside is a repaint only if the
   wrapper already has a transform.
2. **The skeleton of the room** (`.live-drag-slot`): a new box in a list, `position: relative` set on the container the first time, and `left` / `top`
   (animated) changed at every move: a layout of the list in the very frame the target changes (75-140 ms at 4x each).

The cause of the "PR 2 is worse at a change" of results-own-pointer.md: not proven. The traces of PR 1 and PR 2 show the same two layout causes,
and PR 2 has more layout (36 vs 16 ms) and `Layerize` (44 vs 32 ms) per change window in the 3 alternated traces; the number of frames in a window
differs between the builds, so this is a hint, not a cause. Both causes were already there before PR 2.

## Changes

- `index.css`: `[data-task-wrap] { transform: translate(0, 0) }` (identity at rest, cause 1).
- `note-dnd-shift.ts`: the shifts are `translate(...)` (2D) instead of `translate3d(...)` (a 3D transform is composited for as long as it is applied,
  a 2D one only while its 150 ms transition runs: fewer layers to build); the skeleton is created once per list and kept hidden, placed with a
  `transform` (size written only when it changes, no `left` / `top` transition), the lists are made `position: relative` once (not per change, and
  without `getComputedStyle` in the write phase); all of that is prepared after the frame that starts the drag, four lists per frame, the list of the dragged item first and then the others by
  their distance from it (and, if a target changes before a list is ready, `writeSlot` does it for that list). Frames and skeletons are released by `clearShifts`.
- `note-dnd-state.ts`: the store has `subscribeHover(key)` and `subscribeActive`: at a change of the target only the row left and the row
  entered are woken (before, the ~600 selectors of the rows of a note ran at every change); a drag starting / ending wakes the `isDragging`
  selectors only.
- `drag-lag.bench.ts`: `LAG_TRACE=1` (trace of the last run, `changeTimes`).

Tried and not kept: `will-change` / `contain: layout` on the wrappers (no gain over the identity transform, `contain` made `Layerize` worse),
one rAF loop for overlay / autoscroll / shifts (the LoAF entries show no forced layout: `forced` 0-4 ms), dropping the overlay follow,
the autoscroll or the hidden-row opacity (no effect on layout/layerize). Preparing the lists one per frame instead of all at once: the first
changes of the drag arrive before the lists are ready and pay the cost anyway.

## 4x CPU throttle (ms), 3 alternated repetitions (final version)

| metric | before within | after within | before between | after between | before groups | after groups |
|---|---|---|---|---|---|---|
| p95 frame | 393.3 | 293.5 | 515.3 | 333.9 | 161.2 | 280 |
| max frame at target change | 393.3 | 222.7 | 519.5 | 332.9 | 133.6 | 139 |
| long tasks / drag | 43 | 43 | 44 | 43 | 45 | 33 |
| start max frame | 842.4 | 773.9 | 894.7 | 859.3 | 896.3 | 828.1 |
| start long tasks | 3 | 3 | 3 | 3 | 4 | 3 |
| drop long task sum | 0 | 0 | 1287 | 1235 | 1159 | 681 |
| drop max frame (longest task) | 0 | 0 | 747 | 734 | 820 | 311 |

Per repetition (before / after): p95 within 416, 393, 362 / 294, 279, 316; between 542, 515, 509 / 289, 342, 334; groups 161, 158, 530 / 303, 280, 276.
Max frame at a change per run: within before 350-427, after 196-273; between before 443-571, after 170-602 (most 300-360); groups before 105-144
(repetition 3: 401-455, the machine was slower then), after 122-160.

- **p95 of the drag: -25% (within), -35% (between)**, no longer worse than before. **Target change: -43% (within), -36% (between), groups the same
  (134 vs 139; the third `before` repetition was a slow one, 422).** The start frame is not worse (774 vs 842, 859 vs 895, 828 vs 896).
- `groups`: p95 is worse (161 -> 280). Not comparable run for run: with the autoscroll fix the drag makes 4 target changes instead of 2 in two of the
  three `before` repetitions (the old autoscroll scrolled back past the target), so more changes fall in the p95 window. All drags moved the task:
  45 of 45 runs after, 45 of 45 before (the misses of PR 2 did not show up in these series).
- Drop is unchanged (PR 4).

### How the preparation is scheduled (the second round)

The first version of this PR prepared every list in one task after the start (results: target change -43% / -48% / -68% but p95 +48% / +11% in
`within` / `between`: one more long frame). Variants measured against the PR 2 build, all with the same machine load:

| variant | p95 within / between / groups | max frame at change within / between / groups |
|---|---|---|
| all lists in one task after the start | 599 / 526 / 182 (before 403 / 473 / 534) | 231 / 243 / 137 (before 403 / 466 / 431) |
| one list per frame, document order | 320 / 312 / - (before 391 / 454) | 309 / 295 / - (before 376 / 438) |
| one list per frame, source list first then by distance | 346 / 327 / 289 (before 409 / 560 / 184) | 353 / 322 / 290 (before 402 / 594 / 132) |
| **four lists per frame, source list first then by distance (shipped)** | **294 / 334 / 280 (before 393 / 515 / 161)** | **223 / 333 / 139 (before 393 / 520 / 134)** |

Time-sliced preparation by a budget of script time would not work here: the cost is the layout of each list, which is done at the end of the
frame, not in the script.

## Verified separately

vitest (whole suite, 318 files / 4035 tests), tsc, eslint, e2e:typecheck; e2e on the final build: live-drag (11), drop-feedback (8), free-order (9),
split-workspace (8), live-drag-sidebar (5); live-drag-tabs passed 7 of 7 on the first build of this PR and failed in the last run ("move target out of bounds", the window of this
machine, as on earlier builds); live-drag-scroll: 9 of 10, see below.

## The autoscroll regression of PR 2 (commit `fix(dnd): autoscroll only a container the pointer is over...`)

live-drag-scroll "a group dragged to the right edge ... the drop is where expected" failed on `perf/drag-own-pointer` (nothing was saved) and passes on the
0.24.0 baseline. Debug builds (not kept) showed the cause: the row of the groups spans x 301-899, the test then moves the pointer to x = 208 (the
place of the *shifted* last column, outside the row, on the left of it), and the new autoscroll scrolled the row back to the start because it
treated a pointer beside the container as being in its band: the group under the pointer went away, the hit-test returned null, no drop. The fix is
dnd-kit's rule: the pointer has to be over the container along the axis, and a direction scrolls only once the pointer has moved that way (sticky
intent, like dnd-kit's `useScrollIntent`), with unit tests. Now the group is dropped, **but one slot early** (G2 G3 G1 G4 instead of G2 G3 G4 G1): the last
test of the spec still fails, 9 of 10, as it did on the build with only the first fix. What is left: the pointer crosses the left band of the row
(x 301-421) on its way to x = 208 and the row scrolls back about 76 px (1314 -> 1238), so at x = 208 the hit is the right half of G3 (= before G4); without
that scroll the point is over no group and the drop keeps "before G4". Why the baseline ends "after G4" was not found (its hit-test is the same, by
pointer; its autoscroll is dnd-kit's, rect based). It is a gesture that ends outside the visible row, on a column that has been shifted out of it.
