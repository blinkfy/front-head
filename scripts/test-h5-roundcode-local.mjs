import assert from 'node:assert/strict'
import { createLocalRoundCodeDecoder } from '../src/utils/h5-roundcode-local.mjs'

const validPayload = 'AQIDBAUGBwgJCgsM'

function makePixels() {
  const width = 24
  const height = 24
  const data = new Uint8ClampedArray(width * height * 4)
  // Red opaque, green half-transparent, and transparent black exercise the
  // luminance conversion and compositing against white.
  data.set([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 0, 0])
  return { data, width, height }
}

function makeHarness({ supported = true, setTimer, clearTimer, onProgress } = {}) {
  const workers = []
  class FakeWorker {
    constructor(url) {
      this.url = url
      this.messages = []
      this.terminated = false
      workers.push(this)
    }
    postMessage(message, transfer) {
      this.messages.push({ message, transfer })
    }
    terminate() {
      this.terminated = true
    }
    send(data) {
      this.onmessage?.({ data })
    }
    fail() {
      this.onerror?.(new Error('fake worker error'))
    }
  }
  const decoder = createLocalRoundCodeDecoder({
    workerUrl: '/fake/roundcode-worker.js',
    WorkerClass: FakeWorker,
    supported,
    setTimer,
    clearTimer,
    onProgress,
  })
  return { decoder, workers }
}

function makeClock() {
  const timers = []
  return {
    timers,
    setTimer(callback, ms) {
      const timer = { callback, ms, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimer(timer) {
      if (timer) timer.cleared = true
    },
    fire(timer) {
      timer.callback()
    },
  }
}

async function main() {
  const progress = []
  const { decoder, workers } = makeHarness({ onProgress: phase => progress.push(phase) })
  assert.equal(decoder.available, true)
  assert.equal(decoder.busy, false)

  const pixels = makePixels()
  const first = decoder.decode(pixels)
  assert.equal(decoder.busy, true)
  assert.equal(workers.length, 1)
  assert.equal(workers[0].url, '/fake/roundcode-worker.js')
  assert.equal(workers[0].messages.length, 1)
  const sent = workers[0].messages[0]
  assert.deepEqual(Array.from(sent.message.gray.slice(0, 3)), [76, 202, 255])
  assert.equal(sent.message.width, 24)
  assert.equal(sent.message.height, 24)
  assert.equal(sent.transfer.length, 1)
  assert.equal(sent.transfer[0], sent.message.gray.buffer)
  assert.deepEqual(await decoder.decode(pixels), { error: 'BUSY' })
  assert.equal(workers[0].messages.length, 1)

  let firstSettled = false
  first.then(() => { firstSettled = true })
  workers[0].send({ id: sent.message.id + 1, phase: 'stale-progress' })
  workers[0].send({ id: sent.message.id + 1, result: { scanType: 'WX_CODE', rawBase64: validPayload } })
  await Promise.resolve()
  assert.equal(firstSettled, false)
  workers[0].send({ id: sent.message.id, phase: 'loading-model' })
  assert.deepEqual(progress, ['loading-model'])
  assert.equal(decoder.busy, true)
  workers[0].send({ id: sent.message.id, result: { scanType: 'WX_CODE', rawBase64: validPayload } })
  assert.deepEqual(await first, { scanType: 'WX_CODE', rawBase64: validPayload })
  assert.equal(decoder.busy, false)

  const second = decoder.decode(pixels)
  const secondMessage = workers[0].messages[1].message
  let secondSettled = false
  second.then(() => { secondSettled = true })
  // A late result for an older request must not settle the current request.
  workers[0].send({ id: sent.message.id, result: { scanType: 'WX_CODE', rawBase64: validPayload } })
  await Promise.resolve()
  assert.equal(secondSettled, false)
  workers[0].send({ id: secondMessage.id, result: { error: 'NO_CODE' } })
  assert.deepEqual(await second, { error: 'NO_CODE' })
  assert.equal(workers[0].terminated, false)

  const wrongType = decoder.decode(pixels)
  const wrongTypeMessage = workers[0].messages[2].message
  workers[0].send({ id: wrongTypeMessage.id, result: { scanType: 'QR_CODE', rawBase64: validPayload } })
  assert.deepEqual(await wrongType, { error: 'DECODER_UNAVAILABLE' })
  assert.equal(workers[0].terminated, true)

  const malformed = decoder.decode(pixels)
  const malformedWorker = workers[1]
  const malformedMessage = malformedWorker.messages[0].message
  malformedWorker.send({ id: malformedMessage.id, result: { scanType: 'WX_CODE', rawBase64: 'not-valid-base64?' } })
  assert.deepEqual(await malformed, { error: 'DECODER_UNAVAILABLE' })
  assert.equal(malformedWorker.terminated, true)

  const errorResult = makeHarness()
  const errorResultPending = errorResult.decoder.decode(pixels)
  errorResult.workers[0].send({ id: errorResult.workers[0].messages[0].message.id, result: { error: 'WRONG_CODE_TYPE' } })
  assert.deepEqual(await errorResultPending, { error: 'WRONG_CODE_TYPE' })

  const workerErrorHarness = makeHarness()
  const workerErrorPending = workerErrorHarness.decoder.decode(pixels)
  workerErrorHarness.workers[0].fail()
  assert.deepEqual(await workerErrorPending, { error: 'DECODER_UNAVAILABLE' })
  assert.equal(workerErrorHarness.workers[0].terminated, true)

  const unsupported = makeHarness({ supported: false })
  assert.equal(unsupported.decoder.available, false)
  assert.deepEqual(await unsupported.decoder.decode(pixels), { error: 'UNSUPPORTED' })
  assert.equal(unsupported.workers.length, 0)

  const clock = makeClock()
  const timeoutHarness = makeHarness({ setTimer: clock.setTimer, clearTimer: clock.clearTimer })
  const timeoutPending = timeoutHarness.decoder.decode(pixels)
  const timeoutTimer = clock.timers[0]
  assert.equal(timeoutTimer.ms, 60000)
  clock.fire(timeoutTimer)
  assert.deepEqual(await timeoutPending, { error: 'DECODE_TIMEOUT' })
  assert.equal(timeoutHarness.workers[0].terminated, true)
  assert.equal(timeoutTimer.cleared, true)
  assert.equal(timeoutHarness.decoder.busy, false)

  const closeHarness = makeHarness()
  const closePending = closeHarness.decoder.decode(pixels)
  closeHarness.decoder.close()
  assert.deepEqual(await closePending, { error: 'CANCELLED' })
  assert.equal(closeHarness.workers[0].terminated, true)
  assert.equal(closeHarness.decoder.available, false)
  assert.deepEqual(await closeHarness.decoder.decode(pixels), { error: 'CANCELLED' })

  const invalid = makeHarness()
  assert.deepEqual(await invalid.decoder.decode({ data: new Uint8ClampedArray(4), width: 1, height: 1 }), { error: 'INVALID_IMAGE' })
  assert.equal(invalid.workers.length, 0)

  console.log('h5 local roundcode controller tests passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
