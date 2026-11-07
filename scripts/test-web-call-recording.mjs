import assert from 'node:assert/strict'
import { createWebCallRecording } from '../src/utils/web-call-recording.mjs'

const tick = () => new Promise(resolve => setImmediate(resolve))

async function scenario(failure) {
  let encoder, row, removed = false, stoppedTracks = 0, time = 1000, appends = 0
  const reports = [], chunks = []
  const node = () => ({ connect() {}, disconnect() {} })
  const stream = { getAudioTracks: () => [{}], getTracks: () => [{ stop() { stoppedTracks++ } }] }
  class AudioContext {
    state = 'running'
    resume() { return Promise.resolve() }
    close() { return Promise.resolve() }
    createMediaStreamDestination() { return { ...node(), stream } }
    createMediaStreamSource() { return node() }
    createGain() { return { ...node(), gain: { value: 1 } } }
  }
  class MediaRecorder {
    static isTypeSupported() { return true }
    constructor() { encoder = this }
    mimeType = 'audio/webm'
    state = 'inactive'
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      if (failure === 'stop') throw new Error('Encoder stopped unexpectedly')
      queueMicrotask(() => this.onstop?.())
    }
  }
  const storage = {
    async create(value) { row = value },
    async append(id, index, blob) {
      if (failure === 'storage' && ++appends === 2) throw new Error('Full')
      chunks.push({ index, blob })
    },
    async finish(id, patch) { assert.equal(id, row.id); Object.assign(row, patch) },
    async remove() { removed = true },
  }
  const recording = createWebCallRecording({ local: stream, remote: stream, storage,
    metadata: { admin: true, owner: '1', peerName: '分投侠官方', callId: 'call-recovery-test' },
    environment: { AudioContext, MediaRecorder, indexedDB: {}, MediaStream: class {} },
    now: () => time, changed: event => reports.push(event) })
  recording.control({ connected: true })
  await recording.start()
  const sample = () => { time += 1000; encoder.ondataavailable({ data: new Blob(['audio-frame']) }) }
  sample()
  await tick()
  if (failure === 'storage') { sample(); sample() }
  if (failure === 'encoder') encoder.onerror()
  await tick()
  await recording.close()
  assert.equal(row.status, failure ? 'interrupted' : 'saved')
  assert.equal(row.size, chunks.reduce((sum, chunk) => sum + chunk.blob.size, 0))
  assert.equal(row.durationMs, 1000)
  assert.equal(row.callId, 'call-recovery-test')
  assert.equal(removed, false)
  assert.equal(stoppedTracks, 1)
  assert.ok(reports.some(event => event.saved))
  if (failure === 'storage') assert.equal(chunks.length, 1, 'retain the contiguous prefix before a failed write')
}

for (const failure of ['', 'encoder', 'stop', 'storage']) await scenario(failure)
console.log('PASS Web call recording close, encoder interruption, stop failure and partial storage recovery')
