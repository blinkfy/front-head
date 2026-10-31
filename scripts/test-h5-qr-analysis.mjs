import assert from 'node:assert/strict'
import { createQrFrameAnalyzer } from '../src/utils/h5-qr-analysis-core.mjs'

const pixels = () => ({ width: 24, height: 24, data: new Uint8ClampedArray(24 * 24 * 4) })
function harness() {
  const workers = [], timers = new Map(); let sequence = 0, fallbackCalls = 0
  class FakeWorker {
    constructor() { this.requests = []; workers.push(this) }
    postMessage(message, transfer) { this.requests.push({ message, transfer }) }
    terminate() { this.terminated = true }
    reply(id, result) { this.onmessage({ data: { id, result } }) }
  }
  const analyzer = createQrFrameAnalyzer({ workerUrl: 'worker.js', WorkerClass: FakeWorker,
    setTimer(callback) { timers.set(++sequence, callback); return sequence }, clearTimer: id => timers.delete(id),
    fallback: async () => { fallbackCalls++; return { text: 'fallback', candidate: null } } })
  return { analyzer, workers, timers, get fallbackCalls() { return fallbackCalls } }
}
{
  const h = harness(), input = pixels()
  const pending = h.analyzer.analyze(input)
  assert.equal(h.workers.length, 1)
  const { message, transfer } = h.workers[0].requests[0]
  assert.equal(transfer[0], input.data.buffer)
  assert.deepEqual(await h.analyzer.analyze(pixels()), { error: 'BUSY' })
  h.workers[0].reply(message.id + 1, { text: 'late' }); assert.equal(h.timers.size, 1)
  h.workers[0].reply(message.id, { text: 'read', candidate: null })
  assert.equal((await pending).text, 'read'); assert.equal(h.timers.size, 0)
  const retained = pixels(), next = h.analyzer.analyze(retained, { enhance: true, retain: true })
  const request = h.workers[0].requests[1]
  assert.notEqual(request.transfer[0], retained.data.buffer, 'retained sharp-frame buffers must not be detached')
  h.workers[0].reply(request.message.id, { text: '' }); await next
  h.analyzer.close(); assert(h.workers[0].terminated)
  assert.deepEqual(await h.analyzer.analyze(pixels()), { error: 'CANCELLED' })
}
for (const reason of ['close', 'error', 'timeout']) {
  const h = harness(), pending = h.analyzer.analyze(pixels())
  if (reason === 'close') h.analyzer.close()
  else if (reason === 'error') h.workers[0].onerror()
  else [...h.timers.values()][0]()
  assert.equal((await pending).error, reason === 'close' ? 'CANCELLED' : 'ANALYSIS_UNAVAILABLE')
  assert(h.workers[0].terminated); assert.equal(h.timers.size, 0)
  if (reason !== 'close') { assert.equal((await h.analyzer.analyze(pixels())).text, 'fallback'); assert.equal(h.fallbackCalls, 1) }
}
{
  const h = harness()
  assert.equal((await h.analyzer.analyze({ width: 9999, height: 9999 })).error, 'INVALID_IMAGE')
  assert.equal(h.workers.length, 0)
  const analyzer = createQrFrameAnalyzer({ WorkerClass: null, fallback: async () => ({ text: 'compatible' }) })
  assert.equal((await analyzer.analyze(pixels())).text, 'compatible'); analyzer.close()
}
console.log('PASS ordinary QR Worker single-flight, zero-copy transfer, retained frame safety, stale replies, cancellation, timeout and compatibility fallback')
