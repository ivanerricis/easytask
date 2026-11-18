import { describe, expect, it } from "vitest"
import { isNetworkError } from "./update-errors"

describe("isNetworkError", () => {
    it.each([
        "error sending request for url (https://github.com/x/releases/latest/download/latest.json)",
        "dns error: No such host is known. (os error 11001)",
        "tcp connect error: A socket operation was attempted to an unreachable network",
        "operation timed out",
        "Network is unreachable",
        "You appear to be offline",
    ])("recognises %s", message => {
        expect(isNetworkError(message)).toBe(true)
    })

    it.each([
        "Could not fetch a valid release JSON from the remote",
        "the signature is not valid",
        "boom",
        "",
    ])("does not take %j for a missing connection", message => {
        expect(isNetworkError(message)).toBe(false)
    })
})
