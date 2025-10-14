/**
 * select() can be used even without channels. Here, first prompt 
 * with `readline/promises` times out after 2s
 */

import { createInterface } from 'readline/promises'
import { select } from '../select.js'
import { sleep } from '../select-helpers.js'

void main()

async function main() {
    const rl = createInterface(process.stdin, process.stdout)
    
    const result = await select({
        line: s => rl.question('Type within 2s > ', { signal: s }),
        timeout: s => sleep(2000, undefined, s)
    })

    console.log(result)

    console.log(await rl.question('Another question works > '))
    rl.close()
}
