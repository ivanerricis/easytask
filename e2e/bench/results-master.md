# Drag benchmark: master (0.23.0, 25797e9)

Production frontend in a `tauri build --debug --no-bundle` exe, viewport 1000x700 (the window does not reach 1440x900 on
the dev machine), synthetic note of 213 tasks, 5 measured drags per scenario after a warm-up, medians. Windows 11,
WebView2 157. Reproduce: see README.md, then `node e2e/bench/summarize.mjs e2e/bench/results/<dir>/result-profilefalse.json`.

Columns: scenario | live drag on/off. "Target change" = the 100 ms after the pointer enters another task/section.
"Drop" = the 1.5 s from the release. In the `groups` scenario the end of the path falls under the details panel
(the viewport is small): it is a horizontal autoscroll drag, the task is not really moved.

## Quiet machine

| metric | within live | between live | groups live | within off | between off | groups off |
|---|---|---|---|---|---|---|
| p95 frame (drag) ms | 17.7 | 20.9 | 17.4 | 18.7 | 18.6 | 17.7 |
| max frame at target change ms | 18.5 | 21.6 | 17.4 | 20.3 | 20.9 | 17.5 |
| max frame, section change ms | - | 17.2 | 17.4 | - | 17.7 | 17.5 |
| long tasks per drag | 2 | 2 | 2 | 2 | 2 | 2 |
| start: long tasks in 1.5 s | 1 | 1 | 1 | 1 | 1 | 1 |
| start: max frame in 1.5 s ms | 88 | 77 | 75 | 85 | 77 | 78 |
| drop: long task sum ms | 133 | 150 | 189 | 174 | 182 | 190 |
| drop: max frame in 1.5 s ms | 137 | 163 | 196 | 186 | 187 | 203 |

## Beware of other processes

A first run of the same exe, made while other agents ran vitest/builds on the machine, gave p95 27-45 ms, max frame at
a target change 32-51 ms and 3-4 long tasks (within/between, live on): the noise is of the same size as the effect.
Measure on a quiet machine, interleave the builds you compare (A B A B) and use `LAG_THROTTLE=4` (CDP CPU throttling) to
amplify the differences. 4x throttle, master (within | between, live on): p95 163 | 191 ms, max frame at target change
92 | 107 ms, long tasks per drag 27 | 32, start max frame 542 | 572 ms, drop long task sum 1419 | 1445 ms.
