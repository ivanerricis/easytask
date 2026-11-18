# Drag lag: whole-column group zones and earlier group swap (158, 159)

Before = `h2` (master 47ee481), after = `h1` (this branch). Debug build of the real app (WebView2), synthetic note of 213 tasks,
`LAG_THROTTLE=4 LAG_RUNS=5`, live drag on, scenarios `within`, `between`, `groups`. Three rounds, alternating h2 / h1 (h2 r1, h1 r1, h2 r2, ...).
Each cell is the median of the 5 drags of the round; "pooled" is the median of all 15 drags.

Noise: the machine was shared with other sessions, so the tail numbers (p95, longest task) move by +-30% between rounds of the SAME exe.
Read the pooled columns and the rounds together; there is no systematic difference in `within` and `between` (the code of the task and section
drag is untouched; only the group zone moved from the card to the column).
`groups` is the scenario the change touches: the swap now starts on entering the column, so the target changes earlier and sometimes less
often (2 instead of 4 in some rounds); the frame at the target change is not worse (87 ms pooled after, 136 ms before).

**within**

| metric | h2 r1 | h2 r2 | h2 r3 | h1 r1 | h1 r2 | h1 r3 | h2 pooled | h1 pooled |
|---|---|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 227.3 | 208.9 | 235.1 | 411.1 | 217.9 | 246.8 | 227.3 | 271.6 |
| max frame at target change (ms) | 232.2 | 232.2 | 181.0 | 235.4 | 209.5 | 245.1 | 230.9 | 235.4 |
| long tasks per drag | 38.0 | 38.0 | 40.0 | 43.0 | 42.0 | 38.0 | 39.0 | 41.0 |
| longest task, drag (ms) | 2461.0 | 3058.0 | 2497.0 | 3729.0 | 2326.0 | 2777.0 | 2520.0 | 2777.0 |
| drop: longest task (ms) | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| target changes per drag | 6.0 | 6.0 | 6.0 | 6.0 | 6.0 | 6.0 | 6.0 | 6.0 |

**between**

| metric | h2 r1 | h2 r2 | h2 r3 | h1 r1 | h1 r2 | h1 r3 | h2 pooled | h1 pooled |
|---|---|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 241.9 | 176.7 | 212.0 | 241.3 | 220.9 | 181.8 | 210.5 | 201.4 |
| max frame at target change (ms) | 264.5 | 267.8 | 269.4 | 310.2 | 254.7 | 201.4 | 267.8 | 235.1 |
| long tasks per drag | 38.0 | 37.0 | 42.0 | 43.0 | 42.0 | 38.0 | 38.0 | 41.0 |
| longest task, drag (ms) | 2973.0 | 2549.0 | 2644.0 | 2500.0 | 2270.0 | 2707.0 | 2741.0 | 2525.0 |
| drop: longest task (ms) | 353.0 | 301.0 | 270.0 | 314.0 | 281.0 | 296.0 | 305.0 | 304.0 |
| target changes per drag | 8.0 | 8.0 | 8.0 | 8.0 | 8.0 | 8.0 | 8.0 | 8.0 |

**groups**

| metric | h2 r1 | h2 r2 | h2 r3 | h1 r1 | h1 r2 | h1 r3 | h2 pooled | h1 pooled |
|---|---|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 203.2 | 157.6 | 180.7 | 187.4 | 176.9 | 248.1 | 178.8 | 201.0 |
| max frame at target change (ms) | 193.0 | 135.7 | 92.3 | 81.7 | 84.1 | 248.1 | 135.7 | 87.3 |
| long tasks per drag | 28.0 | 26.0 | 22.0 | 20.0 | 24.0 | 33.0 | 25.0 | 24.0 |
| longest task, drag (ms) | 3302.0 | 2980.0 | 3360.0 | 3283.0 | 3326.0 | 5884.0 | 3302.0 | 3386.0 |
| drop: longest task (ms) | 290.0 | 282.0 | 330.0 | 321.0 | 349.0 | 357.0 | 288.0 | 349.0 |
| target changes per drag | 4.0 | 4.0 | 2.0 | 2.0 | 2.0 | 4.0 | 4.0 | 2.0 |


## Follow-up: groups only, 3 more alternating rounds (r4-r6)

The `groups` scenario drags a TASK from group 1 to a task row of group 2 (no group reorder, same final place on both exes: a task zone, untouched by this change). The first 3 rounds showed a higher drop longest task after (349 vs 288 ms); in these rounds, run on a busier machine (everything about 2x slower), it is the other way round (612 vs 780 ms). So that difference is noise, not a cost of the column zones (the zone is registered once per group by a layout effect with stable deps: nothing runs on the tree change of a drop).


**groups**

| metric | h2 r4 | h2 r5 | h2 r6 | h1 r4 | h1 r5 | h1 r6 | h2 pooled | h1 pooled |
|---|---|---|---|---|---|---|---|---|
| p95 frame, drag (ms) | 510.9 | 506.8 | 552.1 | 536.9 | 584.0 | 523.2 | 522.2 | 536.9 |
| max frame at target change (ms) | 228.0 | 440.5 | 220.1 | 483.5 | 229.4 | 442.1 | 230.6 | 404.2 |
| long tasks per drag | 42.0 | 44.0 | 43.0 | 42.0 | 43.0 | 43.0 | 43.0 | 43.0 |
| longest task, drag (ms) | 8626.0 | 8407.0 | 8548.0 | 9682.0 | 8923.0 | 9167.0 | 8548.0 | 9219.0 |
| drop: longest task (ms) | 702.0 | 709.0 | 837.0 | 642.0 | 616.0 | 577.0 | 780.0 | 612.0 |
| target changes per drag | 2.0 | 4.0 | 2.0 | 4.0 | 2.0 | 4.0 | 2.0 | 4.0 |

