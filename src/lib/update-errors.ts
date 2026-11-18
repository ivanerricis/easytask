/** Fragments of the messages the updater plugin (reqwest) gives when the update server cannot be reached. */
const NETWORK_ERROR_PATTERN = /error sending request|dns|connect|timed out|timeout|network|offline|unreachable|no such host|os error 1100[0-9]|os error 10051/i

/**
 * True when an updater error message means that the computer has no (working) internet connection, as opposed to a
 * problem of the release itself. The "valid release json" message (no published release) is not a network error.
 * @category Updates
 */
export function isNetworkError(message: string): boolean {
    if (/valid release json/i.test(message)) return false
    return NETWORK_ERROR_PATTERN.test(message)
}
