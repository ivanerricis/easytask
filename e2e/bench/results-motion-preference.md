# Drag benchmark: follow the app animation setting (card 154)

`LAG_THROTTLE=4 LAG_RUNS=5 LAG_ONLY=within:true,between:true,groups:true`, real app (debug build with the embedded production
frontend, `C:\et-target`), executables alternated (baseline, h2, baseline, h2). Each cell is the median of the 5 measured drags of a
round; "pooled" is the median of the 10 drags of the two rounds. The app default speed ("system", resolved from the OS: normal here) is
what is measured, so the shifts keep their 150 ms. The long tasks of the "drag" phase include the ones of the drag start (the 4x
throttle amplifies them); they are of the same size in every executable. Motion "none" was not benchmarked (the bench has no switch).

- h2 = this branch (4a27cee + this change)
- 0.25.0 = tag v0.25.0
- master = 4a27cee, what the branch is built on (it includes what was merged after 0.25.0, so it is the fair baseline for this change)

## h2 vs 0.25.0 (rounds 1 and 2)

**within**

| metric | 0.25.0 r1 | 0.25.0 r2 | h2 r1 | h2 r2 | 0.25.0 pooled | h2 pooled |
|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 254.6 | 182.5 | 196.1 | 218.2 | 200.9 | 217.1 |
| max frame at target change (ms) | 200.9 | 157.7 | 210.1 | 196.8 | 192.5 | 196.8 |
| long tasks per drag | 41 | 36 | 36 | 36 | 38 | 36 |
| longest task, drag (ms) | 2370 | 2801 | 2692 | 2418 | 2552 | 2418 |
| drop: longest task (ms) | 0 | 0 | 0 | 0 | 0 | 0 |

**between**

| metric | 0.25.0 r1 | 0.25.0 r2 | h2 r1 | h2 r2 | 0.25.0 pooled | h2 pooled |
|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 208.6 | 249.5 | 213.3 | 226.2 | 221.3 | 213.3 |
| max frame at target change (ms) | 251.7 | 216.6 | 260.6 | 253.4 | 216.6 | 253.4 |
| long tasks per drag | 41 | 42 | 40 | 39 | 41 | 39 |
| longest task, drag (ms) | 2776 | 3088 | 2730 | 2695 | 2824 | 2695 |
| drop: longest task (ms) | 257 | 258 | 300 | 327 | 257 | 305 |

**groups**

| metric | 0.25.0 r1 | 0.25.0 r2 | h2 r1 | h2 r2 | 0.25.0 pooled | h2 pooled |
|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 166.1 | 167.1 | 147.1 | 171.0 | 166.1 | 167.3 |
| max frame at target change (ms) | 82.1 | 107.0 | 138.4 | 145.5 | 92.0 | 139.0 |
| long tasks per drag | 19 | 31 | 27 | 30 | 25 | 28 |
| longest task, drag (ms) | 3203 | 3479 | 2828 | 3144 | 3451 | 3102 |
| drop: longest task (ms) | 271 | 198 | 304 | 331 | 203 | 304 |

## h2 vs master 4a27cee (rounds 3 and 4)

**within**

| metric | master r3 | master r4 | h2 r3 | h2 r4 | master pooled | h2 pooled |
|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 239.8 | 196.7 | 201.4 | 217.0 | 200.3 | 201.4 |
| max frame at target change (ms) | 216.0 | 162.9 | 202.4 | 205.8 | 191.4 | 202.4 |
| long tasks per drag | 36 | 40 | 36 | 38 | 36 | 36 |
| longest task, drag (ms) | 2554 | 2341 | 2530 | 2677 | 2480 | 2550 |
| drop: longest task (ms) | 0 | 0 | 0 | 0 | 0 | 0 |

**between**

| metric | master r3 | master r4 | h2 r3 | h2 r4 | master pooled | h2 pooled |
|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 235.6 | 239.9 | 201.5 | 184.5 | 235.6 | 184.5 |
| max frame at target change (ms) | 325.5 | 212.4 | 212.0 | 238.8 | 258.9 | 212.0 |
| long tasks per drag | 36 | 41 | 36 | 35 | 36 | 35 |
| longest task, drag (ms) | 2872 | 2350 | 2783 | 2907 | 2435 | 2829 |
| drop: longest task (ms) | 298 | 348 | 286 | 271 | 298 | 274 |

**groups**

| metric | master r3 | master r4 | h2 r3 | h2 r4 | master pooled | h2 pooled |
|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 172.0 | 175.1 | 171.2 | 174.1 | 174.4 | 171.2 |
| max frame at target change (ms) | 173.5 | 81.0 | 156.3 | 148.7 | 88.3 | 148.7 |
| long tasks per drag | 28 | 21 | 29 | 30 | 23 | 29 |
| longest task, drag (ms) | 3046 | 2910 | 3431 | 3198 | 3042 | 3223 |
| drop: longest task (ms) | 352 | 282 | 290 | 271 | 306 | 280 |

## Reading

No regression: the p95 frame, the long tasks per drag and the longest task are within the noise of the machine in both comparisons.
The gaps against 0.25.0 in the drop task (between, groups) are not there against master (h2 is lower), so they come from what was
merged after 0.25.0, not from this change. The max frame at the target change of the groups moves between 81 and 173 ms in the same
executable (master r3 vs r4), so the 88 vs 149 pooled gap is inside that spread.
