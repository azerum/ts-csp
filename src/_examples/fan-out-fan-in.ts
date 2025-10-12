/**
 * Distribute a stream of work across N worker routines (fan-out), then 
 * merge results in one channel (fan-in). All with backpressure handling - 
 * `worker()` is the slowest part in the chain
 */

import type { ReadableChannel } from '../channel-api.js'
import { Channel } from '../Channel.js'
import { merge } from '../merge.js'
import { sleep } from '../select-helpers.js'

void main()

async function main() {
    const tasks = producer()

    // Start 3 workers
    const outputs = Array(3).fill(undefined).map((_, i) => worker(tasks, i))

    const results = merge(outputs, 0)
    await printer(results)
}

function producer(): ReadableChannel<number> {
    // For pipelines, you may want to use capacity=1, so
    // producer goes on to produce next value immediately

    const ch = new Channel<number>(1)

    void (async () => {
        for (let i = 0; i < 32; ++i) {
            await ch.write(i)
        }

        ch.close()
    })()

    return ch
}

function worker(tasks: ReadableChannel<number>, index: number) {
    const output = new Channel<number>(1)

    void (async () => {
        for await (const value of tasks) {
            const result = await slowProcessing(value)
            await output.write(result)

            console.log(`worker ${index} processed ${value}`)
        }

        output.close()
    })()

    return output
}

async function slowProcessing(value: number) {
    await sleep(Math.random() * 500 + 1000)
    return value
}

async function printer(results: ReadableChannel<number>) {
    for await (const value of results) {
        console.log(`printer got ${value}`)
    }
}
