/**
 * Producer with graceful shutdown: after shutdown, it writes "Bye" message
 * and closes the channel. Shutdown is triggered on Ctrl+C using AbortSignal
 */

import type { ReadableChannel } from '../channel-api.js'
import { Channel } from '../Channel.js'
import { select } from '../select.js'
import { assertNever, returnOnAbort, sleep } from '../select-helpers.js'

void main()

async function main() {
    const controller = new AbortController()

    process.once('SIGINT', () => {
        console.log('Got Ctrl+C')
        controller.abort()
    })

    const values = producer(controller.signal)

    for await (const v of values) {
        console.log(v)
        await sleep(1000)
    }
}

function producer(signal: AbortSignal): ReadableChannel<number | 'Bye'> {
    const ch = new Channel<number | 'Bye'>(0)

    void (async () => {
        for (let i = 0;; ++i) {
            const result = await select({
                wrote: ch.raceWrite(i),
                aborted: returnOnAbort(signal),
            })

            if (result.type === 'aborted') {
                break
            }

            if (result.type === 'wrote') {
                continue
            }

            assertNever(result)
        }

        await ch.write('Bye')
        ch.close()
    })()

    return ch
}
