import { handleDBError } from "@/types/error"
import { getDB } from "./dbManager"
import { TransactionError, runTransactionOn, type TxRef, type TxResult, type TxStatement } from "./transaction-core"

export { TransactionError }
export type { TxRef, TxStatement }

/**
 * In the catch of `tx.run()`: when the failing statement is `statementIndex` (the row the user can get wrong, e.g. the
 * note with a clashing name) translates the driver error into the usual `<codePrefix>_EXISTS` / `_CHECK_FAILED` / ... error
 * and throws it; any other error returns, so the caller throws its own generic error.
 * @category Database
 */
export function rethrowTxError(error: unknown, statementIndex: number, codePrefix: string, messages: Parameters<typeof handleDBError>[2] = {}): void {
    if (error instanceof TransactionError && error.statementIndex === statementIndex)
        handleDBError(error, codePrefix, messages)
}

// SQLite rows per multi-row INSERT (keeps the number of bound parameters far below the SQLite limit)
const INSERT_CHUNK = 500

/**
 * Runs the statements in ONE real SQLite transaction (Rust command `db_transaction`, single connection):
 * all of them are committed together or none is.
 * @param statements The statements, in execution order.
 * @returns The result of every statement, in order.
 * @throws A TransactionError (with the failing statement index) when a statement fails; the transaction is rolled back.
 * @category Database
 */
export async function runTransaction(statements: TxStatement[]): Promise<TxResult[]> {
    if (statements.length === 0) return []
    return runTransactionOn(await getDB(), statements)
}

/**
 * Collects statements and runs them atomically.
 * ```ts
 * const tx = new Transaction()
 * const note = tx.add("INSERT INTO note ...", [...])
 * tx.add("INSERT INTO section_group (noteID, position) VALUES (?, ?)", [tx.idOf(note), 0])
 * await tx.run()
 * ```
 * @category Database
 */
export class Transaction {
    private readonly statements: TxStatement[] = []

    /** Number of statements collected so far. */
    get length() {
        return this.statements.length
    }

    /**
     * Appends a statement.
     * @returns Its index, to be used with `idOf` in later statements.
     */
    add(sql: string, params: unknown[] = []): number {
        this.statements.push({ sql, params })
        return this.statements.length - 1
    }

    /**
     * A param that stands for the lastInsertId of an earlier statement.
     * @param index Index returned by `add`.
     * @param offset Subtracted from that id (used to address the earlier rows of a multi-row INSERT).
     */
    idOf(index: number, offset = 0): TxRef {
        if (!Number.isInteger(index) || index < 0 || index >= this.statements.length)
            throw new Error(`Transaction reference ${index} does not point to an earlier statement`)
        return { $ref: index, offset }
    }

    /**
     * Appends multi-row INSERT statements (chunked) and returns a reference to the id of every row, in order.
     * A single INSERT runs under the SQLite write lock, so its rows get consecutive rowids and
     * lastInsertId is the id of the last one: row i of a chunk of n is `last - (n - 1 - i)`.
     * @param table Table name (fixed by the callers, never user input).
     * @param columns Column names.
     * @param rows Values of every row (params can be TxRef).
     */
    insertRows(table: string, columns: string[], rows: unknown[][]): TxRef[] {
        const refs: TxRef[] = []
        const placeholders = `(${columns.map(() => "?").join(", ")})`
        for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
            const chunk = rows.slice(start, start + INSERT_CHUNK)
            const index = this.add(
                `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${chunk.map(() => placeholders).join(", ")}`,
                chunk.flat())
            for (let i = 0; i < chunk.length; i++) refs.push(this.idOf(index, chunk.length - 1 - i))
        }
        return refs
    }

    /**
     * Runs every collected statement in one transaction.
     * @throws A TransactionError when a statement fails (nothing is written).
     */
    run(): Promise<TxResult[]> {
        return runTransaction(this.statements)
    }
}
