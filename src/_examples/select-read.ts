/**
 * Two producers produce values with random delays. One consumer reads
 * values one-by-one, whichever comes first, using select()
 */

import type { ReadableChannel } from '../channel-api.js'
import { Channel } from '../Channel.js'
import { sleep } from '../select-helpers.js'
import { select } from '../select.js'

void main()

async function main() {
    const first = producer('first-producer')
    const second = producer('second-producer')

    await consumer(first, second)
}

function producer(name: string): ReadableChannel<number> {
    const ch = new Channel<number>(0)

    void (async () => {
        for (let i = 0;; ++i) {
            await ch.write(i)
            console.log(`${name} wrote: ${i}`)

            await sleep(Math.random() * 5000)
        }
    })()

    return ch
}

async function consumer(
    first: ReadableChannel<number>,
    second: ReadableChannel<number>
) {
    while (true) {
        const result = await select({
            first: first.raceRead(),
            second: second.raceRead()
        })

        console.log(`Got from ${result.type}: ${result.value}`)
    }
}
