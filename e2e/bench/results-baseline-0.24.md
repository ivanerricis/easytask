# Drag benchmark: baseline of master 0.24.0

Starting point of the live-drag perf work (card 132). Same method as results-hit-test.md: production frontend (`tauri build --debug --no-bundle`
of master at 0.24.0), viewport 1000x700, 213 tasks, live drag on, `LAG_THROTTLE=4 LAG_RUNS=5` (5 drags per scenario after one warm-up),
medians of the per-run medians over 3 repetitions (every repetition is one wdio process with the three scenarios, run alternated with
the build under test).

## 4x CPU throttle (ms)

| metric | within | between | groups |
|---|---|---|---|
| p95 frame | 550.4 | 715.4 | 710.5 |
| max frame at target change | 258.7 | 391 | 384.5 |
| long tasks / drag | 62 | 60 | 59 |
| start max frame | 623.8 | 3137.6 | 2369.4 |
| start long tasks | 2 | 1 | 1 |
| drop long task sum | 4566 | 5303 | 6198 |
| drop max frame | 4566 | 5303 | 6198 |

"drop max frame" is the longest task of the drop window: the drop is a single task that blocks the frames, so there is no frame to
measure inside it (the harness reports 0 frames there).

Per repetition (p95 frame / drop long task sum): within 401, 608, 550 / 2825, 4566, 4958; between 695, 724, 715 / 6343, 5230, 5303;
groups 743, 691, 711 / 6256, 6198, 5385.

## Reading the numbers

- The machine was shared and much slower than when results-hit-test.md was written: the absolute values here are about 3x higher than
  the 0.24.0 numbers of that file at the same 4x (p95 145-160 ms, drop ~1.4 s there) and the first repetition is clearly faster than the
  next two (the machine drifted). Compare builds only inside a run of alternated repetitions, never against another file.
- `start max frame` of `between` and `groups` (2.4-3.1 s) is the first frame after the drag activates: with 193 task shells
  re-rendering twice for `useDraggable`, this is the biggest single stall.
- What is still far from the card's goals (frame at a target change < 50 ms, drop well under 400 ms) is unchanged from 0.24.0: the targets
  of the next steps are the start of the drag, the target-change frame and the drop.
