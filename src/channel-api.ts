import { NamedError } from './_NamedError.js'

/**
 * `undefined` cannot be written into channels as {@link ReadableChannel.read}
 * uses `undefined` as a special value. That's why channel interfaces have 
 * `T extends NotUndefined` constraint
 * 
 * `null` is allowed
 */
export type NotUndefined = {} | null

export interface HasClosed {
    /**
     * Returns `true` after {@link WritableChannel.close} was called on the channel.
     * See {@link WritableChannel.close} for the explanation of what are closed
     * channels
     */
    get closed(): boolean
}

/**
 * Channel that can be read from. Implements `AsyncIterable`, hence can be
 * used with `for await` loop
 */
export interface ReadableChannel<T extends NotUndefined> extends HasClosed, AsyncIterable<T> {
    /**
     * Reads a value from the channel. If there are no values, blocks until
     * there is
     * 
     * If channel is buffered, takes next value from the buffer. This unblocks
     * first of blocked {@link WritableChannel.write} calls if there are any
     * 
     * If channel is unbuffered, simply unblocks the first of blocked 
     * {@link WritableChannel.write}
     * 
     * If the channel is closed and has no values left in the buffer, 
     * returns `undefined`
     * 
     * Concurrent calls are allowed - each read will get own value (no 
     * two reads will get the same value). If multiple calls are blocked,
     * they will unblock one-by-one in unspecified order
     * 
     * > Note: each blocked call occupies memory, and there is no limit on 
     * how many calls there can be at once. Typically, programs have a fixed
     * or a finite number of reads, so this should not be a problem
     */
    read: () => Promise<T | undefined>

    /**
     * Non-blocking version of {@link ReadableChannel.read}. Unlike 
     * {@link ReadableChannel.read}, if channel has no values, returns `undefined`
     * 
     * This means `undefined` is returned in two cases: (1) the channel is open
     * but has no values, and the channel is closed and has no values. Use
     * {@link ReadableChannel.closed} to tell those apart
     */
    tryRead: () => T | undefined

    /**
     * Blocks until the channel is "readable", meaning that it either:
     * 
     * - Has a value (value in the buffer or a blocked {@link WritableChannel.write} call)
     * - Is closed
     * 
     * Intuitively, a channel is "readable", when the next 
     * {@link ReadableChannel.read} call on it will not block
     * 
     * @param value Specify value that will be returned once the wait unblocks
     * 
     * @param signal Use the signal to cancel the wait. This frees up memory
     * occupied by it. After cancelling, the wait will throw {@link AbortedError}
     */
    waitUntilReadable: <const R>(value: R, signal?: AbortSignal) => Promise<R>

    /**
     * Returns the number of currently blocked {@link ReadableChannel.waitUntilReadable}
     * calls
     */
    get readableWaitsCount(): number

    /**
     * Like {@link ReadableChannel.read}, but can be used with {@link select}
     */
    raceRead: () => Selectable<T | undefined>
}

/**
 * Channel that can be written into
 */
export interface WritableChannel<T extends NotUndefined> extends HasClosed {
    /**
     * Writes value to the channel. If there is no free space in the channel,
     * blocks until there is. This gives backpressure: if writer is faster than 
     * reader, the channel buffer will eventually fill up and the writer will 
     * start to block
     * 
     * If channel is buffered, tries to write value in the buffer, and blocks
     * if the buffer is full. If channel is unbuffered, waits for 
     * {@link ReadableChannel.read} call (resolved immediately if there is a
     * blocked {@link ReadableChannel.read} call already)
     * 
     * If the channel was closed before the call, or became closed while
     * the call was blocked, throws {@link CannotWriteIntoClosedChannel}
     * 
     * Order of values is guaranteed for sequential writes: after 
     * `await ch.write(1); await ch.write(2)`, `1` is guaranteed to be read
     * before `2`. Order is not guaranteed for concurrent writes: after
     * `await Promise.race([ch.write(1), ch.write(2)])`, `1` and `2` can appear
     * in any order when reading
     * 
     * > Note: in current implementation, order of values is the same as 
     * order of calls to `write()`, so example above will always give `1, 2`. 
     * This will change in future if `worker_threads` support will be implemented.
     * It is not advisable to rely on this
     */
    write: (value: T) => Promise<void>

    /**
     * Non-blocking version of {@link WritableChannel.write}. Returns `true`
     * is the value was written into the channel. Returns `false` when
     * {@link WritableChannel.write} would block. **Throws** if the channel 
     * is closed
     */ 
    tryWrite: (value: T) => boolean

    /**
     * Closes the channel. Closed channels cannot be written to. They can
     * still be read from if there are values left in the buffer
     * 
     * More precisely, after close:
     * 
     * - Blocked calls to {@link WritableChannel.write} will unblock by throwing
     * {@link CannotWriteIntoClosedChannel}
     * 
     * - Future calls to {@link WritableChannel.write} will throw {@link CannotWriteIntoClosedChannel}
     * immediately
     * 
     * - Calls to {@link ReadableChannel.read} will consume the values left
     * in the buffer before returning `undefined` 
     * 
     * Unlike in Go, this method is idempotent
     */
    close: () => void

    /**
     * Blocks until the channel is "writable", meaning that it either:
     * 
     * - Is closed
     * - Has a free space in the buffer
     * - Has a blocked {@link ReadableChannel.read} call
     * 
     * Intuitively, a channel is "writable", when the next 
     * {@link WritableChannel.write} call on it will not block (will resolve
     * or reject immediately)
     * 
     * @param value Specify value that will be returned once the wait unblocks
     * 
     * @param signal Use the signal to cancel the wait. This frees up memory
     * occupied by it. After cancelling, the wait will throw {@link AbortedError}
     */
    waitUntilWritable: <const R>(value: R, signal?: AbortSignal) => Promise<R>

    /**
     * Returns the number of currently blocked {@link WritableChannel.waitUntilWritable}
     * calls
     */
    get writableWaitsCount(): number

    /**
     * Like {@link WritableChannel.write}, but can be used with {@link select}
     */
    raceWrite: (value: T) => Selectable<void> 
}

export class CannotWriteIntoClosedChannel extends NamedError {}

/**
 * Operation that can be used with {@link select}. Implemented by 
 * {@link ReadableChannel.raceRead} and {@link WritableChannel.raceWrite}
 * 
 * Those operations cannot be modeled as a simple `Promise` as we have
 * to separate "wait until operation can be performed" from "perform the operation", 
 * so {@link select} can choose which operation is performed. See Motivation section
 * for details
 * 
 * Has two stages:
 * 
 * - Wait until the operation can be performed using {@link Selectable.wait}.
 * E.g. for read from a channel, wait until the channel is readable
 * 
 * - Attempt to perform the operation using {@link Selectable.attempt}.
 *  This may fail due to races, when somebody else performs the operation
 *  between the wait and the attempt
 * 
 * If {@link Selectable.attempt} fails, {@link select} re-runs {@link Selectable.wait}
 * and tries again
 * 
 * #### Motivation
 * 
 * Once `Promise` resolves, there is not easy way to cancel it. For example,
 * once {@link ReadableChannel.read} resolves, there is no way to put the 
 * value back into the channel, into the exact same place in the buffer
 * 
 * When we want to read from one of the two channels, whichever is first, 
 * we can't use `select({ a: a.read(), b: b.read() })` for this reason:
 * if both `a.read()` and `b.read()` resolve at the same time, {@link select}
 * has no way to cancel one of them
 * 
 * Note that passing `AbortSignal` into {@link ReadableChannel.read} 
 * helps to cancel the read, but does not help here: if both `a.read()` and
 * `b.read()` resolve at the same time, before signal is aborted, we have the
 * same problem
 * 
 * Instead, we separate "wait until operation can be done" and "perform operation".
 * Then select can wait for all reads, select one of them, and perform only 
 * one. That's what `select({ a: a.raceRead(), b: raceRead() })` does
 * 
 * {@link Selectable} is an interface for such a two-step operation
 * 
 * Note that due to the separation, race conditions are possible when 
 * between the "wait" and "perform" somebody else does the operation. 
 * E.g. channel read is implemented as
 * 
 * - Wait - {@link ReadableChannel.waitUntilReadable}
 * - Attempt - {@link ReadableChannel.tryRead}
 * 
 * Race is possible:
 * 
 * 1. `channel` is empty
 * 2. Wait: `channel.waitUntilReadable().then(() => channel.tryRead())`
 * 3. Somebody writes a value into `channel`. It is now readable
 * 4. `waitUntilReadable()` resolves. It schedules the callback into the microtask queue
 * 5. Somebody else does `channel.read()`, stealing the written value
 * 6. Attempt: the callback runs `tryRead()`, but that returns `undefined` as 
 * `channel` is now empty
 */
export interface Selectable<T> {
    /**
     * Waits until operation can be performed. Should resolve with value `value`.
     * If `signal` is aborted, should throw error, preferably {@link AbortedError}
     * for consistent style with other selectables
     */
    wait: <const R>(value: R, signal: AbortSignal) => Promise<R>

    /**
     * Tries to perform the operation. Returns either successful result with
     * a value or a failed result
     * 
     * Note: callers **must not mutate** the returned value. The allows implementors
     * to cache values
     */
    attempt: () => SelectableAttemptResult<T>
}

export type SelectableAttemptResult<T> = 
    | { readonly ok: true, readonly value: T }
    | { readonly ok: false }
