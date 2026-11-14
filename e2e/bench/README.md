# Drag benchmark

Measures the lag of dragging tasks in the real app (WebdriverIO + tauri-driver, like the e2e suite) on a synthetic
note of 213 tasks (3 groups x 4 sections, 193 top-level tasks + 20 subtasks, seeded with SQL).
Scenarios: `within` (inside a section), `between` (across two sections), `groups` (across two groups), each with
live drag on and off. Per run it records frame gaps (requestAnimationFrame), long tasks, long animation frames,
the frames within 100 ms of a change of the drop target, and the start / drop windows.

It is NOT part of `npm run e2e` and not run by the CI (the e2e config only globs `e2e/specs/**`).

## Build a production-like exe

The measure must use the embedded production frontend (the dev build under `tauri dev` exaggerates everything).
Use a short, shared target dir (long paths fail with LNK1104):

```
CARGO_TARGET_DIR=C:\et-target npm run tauri -- build --debug --no-bundle
```

(cold ~5 min, later ~20 s). The exe is `C:\et-target\debug\EasyTask.exe`. Copy it if you want to keep a baseline
to compare with (e.g. `C:\et-target\bench-master.exe`).

## Run

```
E2E_APP=C:\et-target\debug\EasyTask.exe E2E_SKIP_BUILD=1 LAG_OUT=e2e/bench/results/mine LAG_RUNS=5 npm run bench:drag
```

Environment variables:

- `LAG_OUT`: folder of the result JSON (default `e2e/bench/results`, gitignored).
- `LAG_RUNS`: measured drags per scenario (default 3; one extra warm-up run is not counted).
- `LAG_ONLY`: comma list of `scenario:live` (e.g. `between:true,groups:true`) to run only those.
- `LAG_RENDERS=1`: installs a React devtools hook that counts the components re-rendered per commit (`commits` in the result).
- `LAG_PROFILE=1`: patches `getBoundingClientRect` / `getComputedStyle` and observes mutations (perturbs a little).
- `LAG_CPU=1`: saves a `.cpuprofile` of the last run of each scenario.

Results: `result-profile<false|true>.json` with, per scenario, one entry per run (`drag`, `start1500`, `drop1500`,
`changeAny`, `changeSection`, `longTasksRel`, ...). Other agents/tools using the CPU make the numbers noisy: run every
scenario several times and compare medians. See `results-master.md` for reference numbers.
