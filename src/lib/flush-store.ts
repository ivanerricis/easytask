import { reportError } from "./report-error"
import { store } from "./store/initStore"
import { flushStore } from "./store/save-soon"

/**
 * Saves the pending preference changes (see flushStore) and reports a failure instead of swallowing it. The failed save is
 * retried once straight on the store (flushStore has nothing left to do after it fails), because a closing app has no
 * other chance to write them.
 * @category Store
 */
export async function flushStoreReporting(): Promise<void> {
    try {
        await flushStore()
    } catch {
        try {
            await store.save()
        } catch (error) {
            reportError(error)
        }
    }
}
