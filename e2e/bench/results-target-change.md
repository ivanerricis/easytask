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
  without `getComputedStyle` in the write phase); all of that is prepared in the frame after the one that starts the drag (and, if a target changes
  before that, `writeSlot` does it for its own list). Frames and skeletons are released by `clearShifts`.
- `note-dnd-state.ts`: the store has `subscribeHover(key)` and `subscribeActive`: at a change of the target only the row left and the row
  entered are woken (before, the ~600 selectors of the rows of a note ran at every change); a drag starting / ending wakes the `isDragging`
  selectors only.
- `drag-lag.bench.ts`: `LAG_TRACE=1` (trace of the last run, `changeTimes`).

Tried and not kept: `will-change` / `contain: layout` on the wrappers (no gain over the identity transform, `contain` made `Layerize` worse),
one rAF loop for overlay / autoscroll / shifts (the LoAF entries show no forced layout: `forced` 0-4 ms), dropping the overlay follow,
the autoscroll or the hidden-row opacity (no effect on layout/layerize). Preparing the lists one per frame instead of all at once: the first
changes of the drag arrive before the lists are ready and pay the cost anyway.

## 4x CPU throttle (ms), 3 alternated repetitions

| metric | before within | after within | before between | after between | before groups | after groups |
|---|---|---|---|---|---|---|
| p95 frame | 403.4 | 598.8 | 472.5 | 525.9 | 533.6 | 181.6 |
| max frame at target change | 403.4 | 231.3 | 466 | 242.5 | 431.3 | 137.4 |
| long tasks / drag | 44 | 44 | 43 | 44 | 43 | 41 |
| start max frame | 816.8 | 774.5 | 917.5 | 965.1 | 1095.6 | 845.6 |
| start long tasks | 3 | 3 | 4 | 2 | 4 | 2 |
| drop long task sum | 0 | 0 | 1149 | 1115 | 668 | 1111 |
| drop max frame (longest task) | 0 | 0 | 667 | 731 | 370 | 776 |

Per repetition (before / after): p95 within 443, 400, 403 / 566, 599, 645;
between 485, 425, 473 / 532, 316, 526; groups 534, 652, 168 / 468, 145, 182. Max frame at a change after, per run: within 190-317 ms,
between 150-312, groups 91-166; before: within 341-551, between 362-688, groups 100-740 (first repetition of groups, the quiet moment: 100-112 ms
on both builds, the machine slowed down after that).

- **Target change: -43% (within), -48% (between), -68% (groups)**, in every repetition. The `Layout` events with 15+ dirty objects in the window
  went from 56 (5.8 s summed at 4x) to 27 (3.7 s, most of them at the start of the drag); layout per change from 40 to 3.6 ms; the store
  fan-out is no longer in the frame.
- **p95 of the whole drag is worse in `within` (+48%, 403 -> 599) and `between` (+11%)**: the preparation of the lists and skeletons is one more
  long frame right after the start, inside the window the p95 is taken on. The version that did the same work in the start frame (eager) had
  the target change at 203 / 212 / 120 ms and p95 203 / 212 / 152, but the start max frame +30-60% (1050 / 1379 / 1350); the one-frame-per-list
  version had p95 320 / 312 (better than before, 391 / 454) but only -18% / -33% at the change. The shipped version is the trade-off in between:
  the start frame is not worse (775 vs 817, 965 vs 918, 846 vs 1096), one extra frame is.
- Drop is unchanged (PR 4).

## Verified separately

vitest (whole suite, 318 files / 4035 tests), tsc, eslint, e2e:typecheck; e2e on this build: live-drag (11), drop-feedback (8), free-order (9),
split-workspace (8), live-drag-sidebar (5), live-drag-tabs (7). live-drag-scroll: 9 of 10, the same one fails as on the PR 2 build and not on the
baseline 0.24.0 build (10 of 10), see below.

## Found: a regression of PR 2 in live-drag-scroll (not fixed here)

"a group dragged to the right edge ... the drop is where expected" fails (the saved order is unchanged) on `perf/drag-own-pointer` and on this branch,
and passes on the 0.24.0 baseline. A debug build (not kept) showed the pointer parked at x = 208 when released, inside the left band of the row of the
groups: the new autoscroll scrolls back to the start, the group under the pointer goes away (hit-test null) and the drop has no target. dnd-kit's
autoscroll did not do that in the same gesture. The `groups` scenario of this bench (2/15 runs of PR 2 did not move the task) is probably the same
thing (a drag whose pointer ends in an edge band); in the alternated repetitions the drag did not move the task in 2 of 45 runs after (one `groups`,
one `between`) and in 1 of 45 before (`between`, another series): a bench flake or this, not told apart. It needs a
rule like dnd-kit's (scroll only towards where the pointer is moving / the dragged box, not the pointer position alone): its own change.
