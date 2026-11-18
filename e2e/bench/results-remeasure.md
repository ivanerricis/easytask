# Drag benchmark: zones and live shifts measured again when a row changes size (perf/drag-remeasure)

PR 1 is about correctness: during a note drag the hit zones and the live-shift snapshot are measured again when a row changes height
(image loaded, text wrapped). The bench cannot exercise that path (nothing changes size in the synthetic note), so it only checks that
watching the zones and the shifted wrappers with the ResizeObserver costs nothing: **no regression within the noise**.

Method as results-baseline-0.24.md: production frontend, viewport 1000x700, 213 tasks, live drag on, `LAG_THROTTLE=4 LAG_RUNS=5`,
medians of the per-run medians over 3 alternated repetitions (baseline, new, baseline, new, ...). Machine shared and slow today
(about 3x slower than in results-hit-test.md), see the note in results-baseline-0.24.md.

## 4x CPU throttle (ms)

| metric | baseline within | new within | baseline between | new between | baseline groups | new groups |
|---|---|---|---|---|---|---|
| p95 frame | 550.4 | 568.6 | 715.4 | 693.1 | 710.5 | 528.3 |
| max frame at target change | 258.7 | 279 | 391 | 411.8 | 384.5 | 306.7 |
| long tasks / drag | 62 | 62 | 60 | 62 | 59 | 58 |
| start max frame | 623.8 | 667.6 | 3137.6 | 3174.5 | 2369.4 | 2435.9 |
| start long tasks | 2 | 2 | 1 | 1 | 1 | 1 |
| drop long task sum | 4566 | 4464 | 5303 | 4845 | 6198 | 6134 |
| drop max frame (longest task) | 4566 | 4464 | 5303 | 4845 | 6198 | 6134 |

Per repetition (baseline / new):

| metric | within | between | groups |
|---|---|---|---|
| p95 frame | 401, 608, 550 / 337, 611, 569 | 695, 724, 715 / 487, 787, 693 | 743, 691, 711 / 528, 282, 739 |
| max frame at target change | 176, 285, 259 / 200, 279, 292 | 391, 434, 391 / 308, 432, 412 | 427, 363, 385 / 307, 238, 426 |
| drop long task sum | 2825, 4566, 4958 / 2627, 4464, 5080 | 6343, 5230, 5303 / 2901, 4845, 5295 | 6256, 6198, 5385 / 3651, 6203, 6134 |

The spread between repetitions (a factor 2 on the same build) is bigger than any difference between the builds: the first
repetition of both is the fast one, the machine slowed down afterwards. Differences of the new build in the later repetitions are
within +-5% in either direction.

## Verified separately

vitest (hit zones after a resize, snapshot without the applied shifts, a row gliding back, the provider re-syncing the rows) and the
e2e specs live-drag (11), drop-feedback (8) and free-order (9) pass on the new build. live-drag-scroll could not run on this machine: its
setup fails on the baseline build too ("the window did not reach 1200x800: inner size 0x0").
