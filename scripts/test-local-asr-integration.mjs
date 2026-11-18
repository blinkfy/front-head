import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse } from '@vue/compiler-sfc'
import { createWebAsrSession } from '../src/utils/web-asr-session.mjs'
import { localFirstAsr, createAsrController, assertAsrCurrent } from '../src/utils/local-asr-core.mjs'

class Socket {
  static instances = []
  constructor() { this.readyState = 0; this.sent = []; Socket.instances.push(this) }
  send(value) { this.sent.push(value) }
  close() { this.readyState = 3 }
  ready() { this.readyState = 1; this.onopen?.({}); this.onmessage?.({ data: JSON.stringify({ type: 'ready' }) }) }
  done(text = 'cloud result') { this.onmessage?.({ data: JSON.stringify({ type: 'done', text }) }) }
  error() { this.onerror?.(new Error('offline mock failure')) }
}
const frame = value => { const b = new ArrayBuffer(2); new DataView(b).setInt16(0, value, true); return b }
const tick = () => new Promise(resolve => setImmediate(resolve))
function web(options = {}) {
  Socket.instances = []
  const calls = { uploads: [], frames: [], localDisposals: 0 }
  let deliverFrame = () => {}
  const capture = { start: async () => options.captureStart !== false, stop: async () => {}, dispose() {},
    getAudioTrack: () => ({ kind: 'audio' }), frame(value) { calls.frames.push(value); deliverFrame(value) } }
  const session = createWebAsrSession({ url: 'wss://offline.invalid', environment: { WebSocket: Socket, Blob, AbortController },
    isCurrent: options.isCurrent ?? (() => true),
    localAvailable: async () => options.available !== false, createCapture: input => { deliverFrame = input.onFrame; return capture },
    createLocal: input => { calls.failLocal = input.onFailure; return { start: async () => options.localStart !== false,
      stop() { return Promise.resolve(options.localStop === undefined ? { text: 'local result', local: true } :
        (typeof options.localStop === 'function' ? options.localStop() : options.localStop)) },
      dispose() { calls.localDisposals++ }, fail: () => input.onFailure() } },
    transcribe: async (blob, name) => { calls.uploads.push({ blob, name }); return { data: { text: 'wav result' } } } })
  return { session, calls, capture }
}

// Local success uses the captured track and never opens a WebSocket or uploads.
{
  const h = web(); assert.equal(await h.session.start(), true)
  h.capture.frame(frame(7));
  const result = await h.session.stop()
  assert.deepEqual(result, { text: 'local result', local: true })
  assert.equal(Socket.instances.length, 0)
  assert.equal(h.calls.uploads.length, 0)
}

// Local startup and mid-record failures open cloud ASR and replay all PCM frames.
for (const mode of ['startup', 'during']) {
  const h = web({ localStart: mode !== 'startup' }); await h.session.start(); h.capture.frame(frame(9))
  if (mode === 'during') h.calls.failLocal()
  const socket = Socket.instances[0]; assert.ok(socket)
  socket.ready()
  assert.deepEqual(socket.sent.map(value => [...new Uint8Array(value)]), [[9, 0]], `${mode}: first PCM frame is replayed`)
  const stopping = h.session.stop(); await tick(); socket.done('cloud result')
  assert.deepEqual(await stopping, { text: 'cloud result', usage: null })
  assert.equal(h.calls.uploads.length, 0)
}

// Empty local stop falls back to one WAV request; a stream failure also uploads once.
{
  const h = web({ localStop: async () => null }); await h.session.start(); h.capture.frame(frame(3))
  const result = await h.session.stop()
  assert.equal(result.fallback, true); assert.equal(h.calls.uploads.length, 1)
  assert.equal(h.calls.uploads[0].name, 'audio.wav'); assert.equal(h.calls.uploads[0].blob.type, 'audio/wav')
}
{
  const h = web({ localStop: async () => { throw new Error('local stop failed') } })
  await h.session.start(); h.capture.frame(frame(5))
  const result = await h.session.stop()
  assert.equal(result.fallback, true, 'local stop errors should fall back to recorded WAV')
  assert.equal(h.calls.uploads.length, 1)
}
{
  const h = web({ localStop: () => { throw new Error('sync local stop failed') } })
  await h.session.start(); h.capture.frame(frame(5))
  const result = await h.session.stop()
  assert.equal(result.fallback, true, 'synchronous local stop errors should fall back to recorded WAV')
  assert.equal(h.calls.uploads.length, 1)
}
{
  const h = web({ available: false }); await h.session.start(); h.capture.frame(frame(4))
  const socket = Socket.instances[0]; socket.ready(); const stopping = h.session.stop(); await tick(); socket.error()
  assert.equal((await stopping).fallback, true); assert.equal(h.calls.uploads.length, 1)
}

// Disposal and an expired owner do not initiate a cloud request.
{
  let current = true
  const h = web({ isCurrent: () => current })
  // A stale owner during an active recording cannot start cloud or WAV upload.
  assert.equal(await h.session.start(), true); h.capture.frame(frame(6)); current = false
  assert.equal(await h.session.stop(), null); assert.equal(Socket.instances.length, 0); assert.equal(h.calls.uploads.length, 0)
  const d = web(); await d.session.start(); d.capture.frame(frame(8)); d.session.dispose()
  assert.equal(d.calls.uploads.length, 0); assert.equal(Socket.instances.length, 0)
}

// Chat transcription method: load its actual method object in an isolated VM.
const audioPath = new URL('../src/pages-nonTheme/chat/audio-methods.js', import.meta.url)
let audioSource = fs.readFileSync(audioPath, 'utf8').replace(/^import .*$/gm, '')
  .replace(/^export const /gm, 'const ')
audioSource += '\nglobalThis.__methods = voiceTranscriptionMethods'
function chatHarness(config = {}) {
  const calls = { api: 0, available: 0, downloads: 0, local: 0, saves: 0 }
  let alive = true, owner = 'owner'
  const context = { createAsrController, assertAsrCurrent,
    localFirstAsr, localAsrAvailable: async () => { calls.available++; return config.availabilityGate ? config.availabilityGate : (config.capable ?? true) },
    transcribeLocalAudio: async () => { calls.local++; return config.localPromise ||
      (Object.hasOwn(config, 'localResult') ? config.localResult : { text: 'local words' }) },
    chatApi: { transcribeVoiceMessage: async () => { calls.api++; return { data: { toText: 'cloud words' } } } },
    baseUrl: 'https://offline.invalid', uni: { getStorageSync: () => owner, showToast() {} },
    String, Map, AbortController, console }
  vm.createContext(context); vm.runInContext(audioSource, context)
  const page = { otherUserId: 'peer', chatId: 'peer', isChatPageDestroyed: false, isChatPageActive: true,
    messages: [{ id: 'm1', type: 'voice', content: 'file.mp3' }], transcribingVoiceIds: {}, _voiceTranscriptions: new Map(),
    getCurrentUserId: () => owner, getHeldChatMediaSource: () => '',
    getChatMediaSource: async () => { calls.downloads++; return config.cached ?? '/cache/audio.mp3' },
    $set: (obj, key, value) => { obj[key] = value }, saveMessagesToStorage: () => calls.saves++ }
  Object.assign(page, Object.fromEntries(Object.entries(context.__methods).map(([key, fn]) => [key, fn.bind(page)])))
  return { page, calls, hide() { page.isChatPageActive = false }, changeOwner() { owner = 'other' } }
}
{
  const h = chatHarness(); await h.page.transcribeVoiceMessage(h.page.messages[0])
  assert.equal(h.calls.api, 0); assert.equal(h.calls.local, 1)
}
{
  const h = chatHarness({ capable: false }); await h.page.transcribeVoiceMessage(h.page.messages[0])
  assert.equal(h.calls.api, 1); assert.equal(h.calls.downloads, 0)
}
for (const config of [{ capable: true, cached: '' }, { capable: true, localResult: null }]) {
  const h = chatHarness(config); await h.page.transcribeVoiceMessage(h.page.messages[0])
  assert.equal(h.calls.api, 1, JSON.stringify({ config, calls: h.calls })); assert.equal(h.calls.downloads, 1)
}
for (const stale of ['hide', 'owner']) {
  let release; const gate = new Promise(resolve => { release = resolve })
  const h = chatHarness({ capable: true, availabilityGate: gate })
  // Expire after availability begins, before local-file cache lookup.
  const available = h.page.transcribeVoiceMessage(h.page.messages[0])
  await tick(); h[stale === 'hide' ? 'hide' : 'changeOwner'](); release(true)
  await available
  assert.equal(h.calls.api, 0); assert.equal(h.calls.downloads, 0)
}
for (const mutation of ['withdraw', 'replace']) {
  let release; const localPromise = new Promise(resolve => { release = resolve })
  const h = chatHarness({ capable: true, localPromise })
  const message = h.page.messages[0]
  const task = h.page.transcribeVoiceMessage(message)
  while (!h.calls.local) await tick()
  if (mutation === 'withdraw') message.isWithdraw = true
  else message.content = 'replacement.mp3'
  release({ text: 'stale transcript' })
  await task
  assert.equal(message.voiceText, undefined, `${mutation}: stale transcript is not written`)
  assert.equal(h.calls.saves, 0, `${mutation}: stale transcript is not persisted`)
  assert.equal(h.calls.api, 0, `${mutation}: stale local work does not continue to cloud`)
}

// Platform preprocessing ensures the native plugin import cannot leak to H5 or mini programs.
function preprocess(source, platform) {
  const stack = [true], output = []
  for (const line of source.split(/\r?\n/)) {
    const m = line.match(/^\s*\/\/\s*#(ifdef|ifndef|endif)\s*(.*)$/)
    if (!m) { if (stack.at(-1)) output.push(line); continue }
    if (m[1] === 'endif') stack.pop()
    else stack.push(stack.at(-1) && (m[1] === 'ifdef' ? m[2].split('||').map(x => x.trim()).includes(platform) : !m[2].split('||').map(x => x.trim()).includes(platform)))
  }
  assert.deepEqual(stack, [true]); return output.join('\n')
}
const localSource = fs.readFileSync(new URL('../src/utils/local-asr.js', import.meta.url), 'utf8')
for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const result = preprocess(localSource, platform)
  assert.equal(result.includes("@/uni_modules/ftx-local-asr"), platform === 'APP-PLUS', `${platform} native plugin boundary`)
  assert.equal(result.includes("./web-local-asr.mjs"), platform === 'H5', `${platform} browser ASR boundary`)
  new vm.Script(result.replace(/^import .*$/gm, '').replace(/^export /gm, ''), { filename: `local-asr.${platform}.js` })
}
const voiceVue = fs.readFileSync(new URL('../src/pages-nonTheme/voice-scan.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(voiceVue, { filename: 'voice-scan.vue' }); assert.deepEqual(errors, [])
for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const result = preprocess(descriptor.script.content, platform)
  assert.equal(result.includes('web-asr-session.mjs'), platform === 'H5', `${platform} realtime web ASR boundary`)
  assert.equal(result.includes('ftx-local-asr'), false, `${platform} page has no direct native import`)
}

console.log('local ASR integration tests passed')
