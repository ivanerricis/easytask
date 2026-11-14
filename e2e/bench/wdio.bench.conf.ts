import path from "node:path"
import { fileURLToPath } from "node:url"
import { config as base } from "../wdio.conf"

/**
 * WebdriverIO configuration of the drag benchmark (`npm run bench:drag`): it reuses everything of the e2e
 * configuration (temporary EASYTASK_DATA_DIR, tauri-driver, msedgedriver, optional build) but runs only the benchmark.
 * It is not part of `npm run e2e` nor of the CI (they glob e2e/specs/**).
 */
const here = path.dirname(fileURLToPath(import.meta.url))

export const config: typeof base = {
    ...base,
    specs: [path.join(here, "drag-lag.bench.ts")],
    mochaOpts: { ...base.mochaOpts, timeout: 3_600_000 },
}
