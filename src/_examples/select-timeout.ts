/**
 * Consumer reads values from slow producer. If there are no values for more
 * than 2s, it prints "Alive" message. So consumer prints something at least
 * once 2s
 */

import type { ReadableChannel } from '../channel-api.js'
import { Channel } from '../Channel.js'
import { select } from '../select.js'
import { assertNever, sleep } from '../select-helpers.js'

void main()

async function main() {
    const values = producer()
    await consumer(values)
}

function producer(): ReadableChannel<number> {
    const ch = new Channel<number>(0)

    void (async () => {
        for (let i = 0;; ++i) {
            await ch.write(i)
            console.log(`Wrote ${i}`)

            await sleep(Math.random() * 6000)
        }
    })()

    return ch
}

async function consumer(values: ReadableChannel<number>) {
    while (true) {
        const result = await select({
            value: values.raceRead(),
            timedOut: s => sleep(2000, undefined, s),
        })

        switch (result.type) {
            case 'value': {
                console.log(`Got ${result.value}`)
                continue
            }

            case 'timedOut': {
                console.log('Alive')
                continue
            }

            default:
                assertNever(result)
        }
    }
}
