import { shuffle } from './_fisherYatesShuffle.js'
import { NamedError } from './_NamedError.js'
import type { Selectable, SelectableAttemptResult } from './channel-api.js'

export type SelectOpsMap = Record<string, NullableSelectOp>

export type NullableSelectOp = 
    | SelectOp
    | null

export type SelectOp =
    | Selectable<unknown>
    | Promise<unknown>
    | ((signal: AbortSignal) => Promise<unknown>)

export type SelectResult<TArgs extends SelectOpsMap> = ({
    [K in StringKeyof<TArgs>]: {
        type: K
        value: InferSelectOpResult<TArgs[K]>
    }
})[StringKeyof<TArgs>]

type StringKeyof<T> = Extract<keyof T, string>

type InferSelectOpResult<T> =
    T extends Selectable<infer U>
        ? U
    : T extends Promise<infer U>
        ? U
    : T extends (signal: AbortSignal) => Promise<infer U>
        ? U
    : never

export class SelectError extends NamedError {
    constructor(readonly argName: string, cause: unknown) {
        super(`Error in operation ${argName}`, { cause })
    }
}

/**
 * Like `select {}` statement in Go: allows to concurrently try to write into/read from
 * multiple channels, whichever is writable/readable first
 * 
 * Extended to support any promises: takes in operations (those can be 
 * of different types, e.g. `Promise`), waits for the first one to complete,
 * returns its result, and *cancels* the remaining ones
 * 
 * Operation types:
 * 
 * - `Promise<T>` - waits for the promise to resolve/reject. Cannot be cancelled
 * 
 * - `(signal: AbortSignal) => Promise<T>` - called "abortable function". 
 * Wait for the returned promise. Can be cancelled: when this operation looses
 * the race, `signal` is aborted
 * 
 * - `Selectable<T>` - used by {@link ReadableChannel.raceRead}, {@link WritableChannel.raceWrite}.
 * 
 * - `null` - noop that never wins the race. Useful for conditional operations,
 * e.g. `select({ maybeOp: doOp ? op() : null })`
 * 
 * ### Examples:
 * 
 * #### Reading from/writing into channels
 * 
 * Read from channel `a` or `b`, whichever is readable first:
 * 
 * ```ts
 * await select({ a: a.raceRead(), b: b.raceRead() })
 * ```
 * 
 * Compare this to: 
 * 
 * ```ts
 * await Promise.race([a.read(), b.read()])
 * ```
 * 
 * The former reads either from `a` or `b`, but never from both. The later *reads* 
 * from both, *returns* the value of the one that wins the race, but 
 * *does not cancel the read*. If `a` wins, a value from `b` is **lost**
 * 
 * {@link ReadableChannel.raceRead} returns a {@link Selectable} which 
 * allows cancellation, unlike {@link ReadableChannel.read}, which returns
 * a `Promise` and cannot be cancelled
 * 
 * Similarly, writes can be raced with 
 * 
 * ```ts
 * await select({ a: a.raceWrite(value1), b: b.raceWrite(value2) })
 * ```
 * 
 * #### Read from `a` or time out
 * 
 * ```ts
 * await select({ 
 *  didRead: a.raceRead(), 
 *  timedOut: s => sleep(1000, undefined, s)
 * })
 * ```
 * 
 * Note that this aborts the timer if reading wins the race. If you want
 * to keep the timeout for multiple operations, pass `Promise` instead of function:
 * 
 * ```ts
 * const timeout = sleep(1000, undefined)
 * 
 * while (true) {
 *  await select({ 
 *    didRead: a.raceRead(), 
 *    timedOut: timeout 
 *  })
 * }
 * ```
 * 
 * #### Read from `a` or abort on signal
 * 
 * ```ts
 * await select({
 *   didRead: a.raceRead(),
 *   aborted: returnOnAbort(signal),
 * })
 * ```
 * 
 * #### Fairly select between settled promises:
 * 
 * ```ts
 * await select({ a: promiseA, b: promiseB })
 * ```
 * 
 * Compare with:
 * 
 * ```ts
 * await Promise.race([promiseA, promiseB])
 * ```
 * 
 * If `promiseA` and `promiseB` are both settled, `Promise.race` will always
 * choose `promiseA`, whereas `select` will choose at random
 * 
 * ### Detailed semantics
 * 
 * - Similar to `Promise.race`, resolves once any operation completes successfully,
 * rejects one any operation fails (throws)
 * 
 * - "Operation fails" means: 
 *   - for `Promise<T>` - promise rejects
 *   - for `(signal?: AbortSignal) => Promise<T>` - the returned promise rejects
 *   - for `Selectable<T>` - {@link Selectable.wait} or {@link Selectable.attempt}
 *  throw
 *   - `null` operations never complete, therefore never fail
 * 
 * - Exception thrown by operation is wrapped in {@link SelectError}, which
 * has {@link SelectError.argName} to tell which operation has failed
 * 
 * - If multiple operations are ready, randomly selects which one wins the race
 * 
 * - "Operation is ready" means:
 *   - for `Promise<T>` - promise is settled
 *   - for `(signal?: AbortSignal) => Promise<T> - the returned promise is settled
 *   - for `Selectable<T>` - promise returned by {@link Selectable.wait} is settled
 *   - `null` operations are never ready
 */
export async function select<TOps extends SelectOpsMap>(
    ops: TOps
): Promise<SelectResult<TOps>> {
    const c = new AbortController()

    const nameAndOp = Object.entries(ops)
    shuffle(nameAndOp)

    const promises: Promise<WaitResult>[] = []

    nameAndOp.forEach(([name, op], index) => {
        if (op === null) {
            return
        }

        const p = waitForOp(op, name, index, c.signal)
        promises.push(p)
    })

    if (promises.length === 0) {
        throw new Error(
            `select() requires at least one non-null operation. Received: ${JSON.stringify(ops)}`
        )
    }

    try {
        while (true) {
            const winner = await Promise.race(promises)

            if (winner.type === 'promise') {
                const r = {
                    type: winner.name,
                    value: winner.value,
                }

                //@ts-expect-error
                return r
            }

            let attemptResult: SelectableAttemptResult<unknown>

            try {
                attemptResult = winner.self.attempt()
            }
            catch (exception) {
                throw new SelectError(winner.name, exception)
            }

            if (attemptResult.ok) {
                const r = {
                    type: winner.name,
                    value: attemptResult.value,
                }

                //@ts-expect-error
                return r
            }
            
            promises[winner.index] = winner.self.wait(winner, c.signal)
        }
    }
    finally {
        c.abort()
    }
}

/**
 * NOTE: implementation should make best effort to ensure that each `arg`
 * uses the same number of `.then()`/`catch()`/`await` on each arg. This
 * is needed to ensure fairness
 * 
 * Any added `then()` delays settling of the promise, so if 
 * user passed two resolved operations of different types, say o1: Promise and 
 * o2: Selectable, but this function uses different number  of `then()`s for each, 
 * one with the least `then()`s will always win the race:
 * 
 * This always prints 2:
 * 
 * ```ts
 * console.log(await Promise.race([
 *  Promise.resolve(1).then().then(),
 *  Promise.resolve(2).then(),
 * ]))
 * ```
 * 
 * As users don't see the machinery of `select()`, for them it would be
 * confusing
 */
function waitForOp(
    op: SelectOp,
    name: string,
    index: number,
    signal: AbortSignal
): Promise<WaitResult> {
    if (op instanceof Promise) {
        return op
            .then(
                value => ({ type: 'promise', name, value }),

                error => {
                    throw new SelectError(name, error)
                },
            )
    }

    if (typeof op === 'function') {
        return op(signal).then(
            value => ({ type: 'promise', name, value }),

            error => {
                throw new SelectError(name, error)
            },
        )
    }

    return op.wait(
        { type: 'selectable', name, index, self: op }, 
        signal
    )
    .catch(error => {
        throw new SelectError(name, error)
    })
}

type WaitResult =
    | { type: 'promise', name: string, value: unknown }
    | { type: 'selectable', name: string, index: number, self: Selectable<unknown> }
