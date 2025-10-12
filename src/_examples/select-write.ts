/**
 * One producer writes values into channels for two slow consumers. It writes
 * values one-by-one, to whichever channel is writable first
 */

import type { ReadableChannel } from '../channel-api.js'
import { Channel } from '../Channel.js'
import { sleep } from '../select-helpers.js'
import { select } from '../select.js'

void main()

async function main() {
    const [first, second] = producer()

    await Promise.all([
        consumer('first-consumer', first),
        consumer('second-consumer', second),
    ])
}

function producer(): [ReadableChannel<number>, ReadableChannel<number>] {
    const first = new Channel<number>(0)
    const second = new Channel<number>(0)

    void (async () => {
        for (let i = 0;; ++i) {
            const result = await select({
                first: first.raceWrite(i),
                second: second.raceWrite(i),
            })

            console.log(`producer wrote ${i} into ${result.type}`)
        }
    })()

    return [first, second]
}

async function consumer(name: string, values: ReadableChannel<number>) {
    for await (const v of values) {
        console.log(`${name} got ${v}`)
        await sleep(Math.random() * 3000)
    }
}
