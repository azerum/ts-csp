/**
 * select() infers its return type based on arguments. select() can mix
 * and match channel reads, writes, promises, promise-returning functions, 
 * and `null`. This example shows how the return type is inferred in each case
 */

import { Channel } from '../Channel.js'
import { select } from '../select.js'

void main()

async function main() {
    const ch1 = new Channel<number>(0)
    const ch2 = new Channel<boolean>(0)
    
    const result = await select({
        readCh1: ch1.raceRead(),
        readCh2: ch2.raceRead(),
        writeCh1: ch1.raceWrite(1),
        writeCh2: ch2.raceWrite(true),
        promise: Promise.resolve('abc' as const),
        fn: async () => 42 as const,
        null: null,
        maybeNull: someBoolean() ? ch1.raceRead() : null,
    })
    
    // This is the result type
    //
    // 'type' tells which operation has won the race. `value` is the result of
    // the operation
    //
    // Explanation of each case:
    //
    // readCh1, readCh2: `raceRead()` returns either a value read from the channel or 
    // `undefined` if channel has closed - just like regular `read()` on channel
    //
    // writeCh1, writeCh2: value is `void`, since writes don't return results.
    // `void` is practically the same as `undefined`
    //
    // promise: the type of the promise is used - `'abc'`
    //
    // fn: the awaited return type of the async function is used - `42`
    //
    // null: `null` is a no-op that never wins the race, so it is not even 
    // mentioned in the result type
    //
    // maybeNull: this operation may be either a no-op or a read from `ch1`,
    // depending on some condition. Therefore it is included in the result
    // type. The result is the same as for readCh1

    type Expected = 
        | { type: 'readCh1', value: number | undefined }
        | { type: 'readCh2', value: boolean | undefined }
        | { type: 'writeCh1', value: void }
        | { type: 'writeCh2', value: void }
        | { type: 'promise', value: 'abc' }
        | { type: 'fn', value: 42 }
        | { type: 'maybeNull', value: number | undefined }
    
    // Type-level test to keep the example correct: check that Actual=Expected
    type Actual = typeof result
    
    assertIsSubtype<Actual, Expected>()
    assertIsSubtype<Expected, Actual>()
}

function assertIsSubtype<_T extends S, S>() {}

function someBoolean(): boolean {
    return true
}
