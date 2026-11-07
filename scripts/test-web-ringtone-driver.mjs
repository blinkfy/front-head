import assert from 'node:assert/strict'
import { createWebRingtoneDriver } from '../src/utils/web-ringtone-driver.mjs'
import { createIncomingRingtone } from '../src/utils/incoming-ringtone-core.mjs'

function setup({ loadBuffer = async () => ({ decoded: true }), resume = () => Promise.resolve(), state = 'running' } = {}) {
  let now = 0, nextTimer = 1
  const timers = new Map(), events = { loads: 0, audibleStarts: 0, sourceStops: 0, sourceDisconnects: 0, gainDisconnects: 0 }
  let context
  class FakeContext {
    constructor() { this.state = state; this.sampleRate = 48000; this.destination = {}; this.sources = [] }
    resume() { return resume(this) }
    createBuffer() { return { silent: true } }
    createBufferSource() {
      const item = { buffer: null, loop: false, onended: null, stopped: false,
        connect() {}, disconnect() { events.sourceDisconnects++ },
        start() { if (!this.buffer?.silent) events.audibleStarts++ },
        stop() { this.stopped = true; events.sourceStops++; this.onended?.() } }
      this.sources.push(item)
      return item
    }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() { events.gainDisconnects++ } } }
  }
  const driver = createWebRingtoneDriver({
    createContext: () => (context = new FakeContext()),
    async loadBuffer(ctx) { events.loads++; return loadBuffer(ctx) },
    setTimer(callback, delay) { const id = nextTimer++; timers.set(id, { callback, at: now + delay }); return id },
    clearTimer(id) { timers.delete(id) },
  })
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  const advance = async ms => {
    const end = now + ms
    while (true) {
      const due = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      const [id, item] = due; timers.delete(id); now = item.at; item.callback(); await flush()
    }
    now = end; await flush()
  }
  return { driver, events, timers, flush, advance, get context() { return context } }
}

async function run() {
  {
    const test = setup()
    test.driver.prime(); await test.flush()
    let allowed = true
    await test.driver.play(() => allowed)
    assert.equal(test.events.loads, 1, 'prime decodes once and play reuses the cached buffer')
    assert.equal(test.events.audibleStarts, 1, 'play starts an audible source')
    assert.equal(test.context.sources.find(source => !source.buffer?.silent).loop, true, 'ringtone source loops')
    allowed = false
    test.driver.stop()
    assert.equal(test.events.sourceStops, 1, 'stop stops the active source')
    assert.ok(test.events.sourceDisconnects >= 1, 'stop releases the active source')
    assert.equal(test.events.gainDisconnects, 1, 'stop releases the active gain')
  }

  {
    let resolveResume
    let hang = true
    const test = setup({ state: 'suspended', resume: ctx => hang
      ? new Promise(resolve => { resolveResume = () => { ctx.state = 'running'; resolve() } })
      : (ctx.state = 'running', Promise.resolve()) })
    let settled = false
    const attempt = test.driver.play(() => true).finally(() => { settled = true })
    await test.flush()
    assert.equal(settled, false, 'play waits while resume is pending')
    await test.advance(1200)
    await assert.rejects(attempt, error => error.name === 'NotAllowedError', 'pending resume times out at 1200 ms')
    assert.equal(test.events.audibleStarts, 0, 'timed out resume does not start audio')
    test.driver.stop()
    // A later gesture can resolve resume and make a fresh attempt succeed.
    hang = false
    test.driver.unlock()
    await test.flush()
    await test.driver.play(() => true)
    assert.equal(test.events.audibleStarts, 1, 'a fresh play succeeds after resume becomes available')
  }

  {
    let resolveBuffer
    const test = setup({ loadBuffer: () => new Promise(resolve => { resolveBuffer = resolve }) })
    const pending = test.driver.play(() => true)
    await test.flush()
    test.driver.stop()
    resolveBuffer({ decoded: true })
    await pending
    assert.equal(test.events.audibleStarts, 0, 'stop during decode prevents a late source start')
  }

  {
    const test = setup()
    const attempts = []
    const ringtone = createIncomingRingtone({
      driver: { play() { return new Promise((resolve, reject) => attempts.push({ resolve, reject })) }, stop() {} },
      getOwner: () => 'user', enabled: () => true,
      setTimer() { return 1 }, clearTimer() {},
    })
    ringtone.update({ phase: 'incoming', callId: 'old-call' })
    ringtone.update({ phase: 'incoming', callId: 'new-call' })
    attempts[0].reject(new Error('late old failure'))
    await test.flush()
    assert.deepEqual(ringtone.state(), { blocked: false, callId: 'new-call' }, 'old call promise cannot change the newer call state')
    attempts[1].resolve(); await test.flush()
    assert.equal(ringtone.state().callId, 'new-call')
  }

  {
    let resolveResume
    let resumePromise
    const test = setup({ state: 'suspended', resume: () => resumePromise ||= new Promise(resolve => { resolveResume = resolve }) })
    const pending = test.driver.play(() => true)
    await test.flush()
    // Model a user gesture arriving while automatic play is pending.
    test.driver.unlock()
    resolveResume(); test.context.state = 'running'
    await pending
    assert.equal(test.events.audibleStarts, 1, 'unlock during pending play allows it to start')
  }

  {
    const test = setup()
    await test.driver.play(() => true)
    test.driver.unlock()
    await test.driver.play(() => true)
    assert.equal(test.events.audibleStarts, 1, 'repeated play and page gestures keep only one looping source')
    assert.equal(test.context.sources.filter(source => !source.buffer?.silent).length, 1)
  }

  console.log('Web ringtone driver tests passed.')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
