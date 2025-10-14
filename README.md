<span>
  <a href="" title="View this project on NPM">
    <img src="https://img.shields.io/npm/v/@azerum/ts-csp.svg" alt="NPM version" />
  </a>
</span><br/><br/>

Go-style/CSP-style channels for TypeScript with `async`/`await`. Features:

- `async`/`await` friendly API, `for await`, `AbortSignal`
for cancellation

- Buffered & unbuffered channels

- [`select()`](https://azerum.github.io/ts-csp/functions/select.html) like `select{}` statement 
in Go, for **reads & writes**

- `select()` can also take **any `Promise`** or **any async function that takes `AbortSignal`**

- Timeout operations with `select()` + `sleep()`; abort 
via `AbortSignal` with `select()` + `returnOnAbort()`

- The return type of `select()` is inferred for nice exhaustive matching 

- Operators: [`merge()`](https://azerum.github.io/ts-csp/functions/merge.html),
[`partitionTime()`](https://azerum.github.io/ts-csp/functions/partitionTime.html)

- Works in Node.js and browsers; relies on global `setTimeout`, `AbortController`,
`AbortSignal`

- Zero dependencies

- Thoroughly tested

For details see [API docs](https://azerum.github.io/ts-csp/classes/Channel.html)

### Install

```shell
npm install -E @azerum/ts-csp
```

### Stability

Experimental: breaking changes to API are expected

### Examples

See `src/_examples` directory:

- [Ping-pong](./src/_examples/ping-pong.ts): common introductory example of channels in Go

- [Fast producer and slow consumer](./src/_examples/fast-producer-slow-consumer.ts): demonstrates how backpressure works
  
- [Fan-out, fan-in](./src/_examples/fan-out-fan-in.ts): a common pattern to distribute work among N workers and merge the results back

- `select()`:
  - [Read from multiple channels](./src/_examples/select-read.ts)
  - [Write into multiple channels](./src/_examples/select-write.ts)
  - [Cancel read by timeout](./src/_examples/select-timeout.ts)
  - [Abort reads/writes with AbortSignal](./src/_examples/select-abort.ts)
  - [Example usage without channels](./src/_examples/select-without-channels.ts): `readline` prompt with timeout

- [Batch processing](./src/_examples/batch-processing.ts): use of `partitionTime()`: 
process channel in groups of N items. Useful e.g. to save data in DB in batches

### Inspired by

- Go channels
- Communicating Sequential Processes - CSP
- [@thi.ng/csp](thi.ng/csp) - design of return values of
`read()` and `tryRead()`
