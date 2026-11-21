import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse } from '@vue/compiler-sfc'
import { createPcm16Resampler, encodePcmWav } from '../../src/utils/web-asr-audio.mjs'
import { createWebAsrSession } from '../../src/utils/web-asr-session.mjs'

function bytes(buffer) { return [...new Uint8Array(buffer)] }
function join(chunks) { const result = new Uint8Array(chunks.reduce((n, x) => n + x.byteLength, 0)); let offset = 0; for (const chunk of chunks) { result.set(new Uint8Array(chunk), offset); offset += chunk.byteLength } return result }
function samples(rate, count) { const result = new Float32Array(count); for (let i = 0; i < count; i++) result[i] = i < Math.floor(count / 2) ? -1 : 0.5; return result }

// Audio conversion retains fractional timing across arbitrarily split callback blocks.
for (const rate of [48000, 44100]) {
  const input = samples(rate, rate / 100)
  const whole = createPcm16Resampler(rate)(input)
  const resample = createPcm16Resampler(rate), chunks = []
  for (let start = 0; start < input.length;) { const end = Math.min(input.length, start + 37); chunks.push(resample(input.subarray(start, end))); start = end }
  assert.deepEqual([...join(chunks)], bytes(whole), `${rate}Hz split blocks match one continuous input`)
  assert.equal(whole.byteLength, 320, `${rate}Hz produces 160 mono 16kHz samples per 10ms`)
  const pcm = new DataView(whole)
  assert.equal(pcm.getInt16(0, true), -32768)
  assert.ok(Math.abs(pcm.getInt16(whole.byteLength - 2, true) - 16384) <= 1)
}
const wav = encodePcmWav([new Uint8Array([0, 128]).buffer, new Uint8Array([255, 127]).buffer])
const wavView = new DataView(wav)
assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF')
assert.equal(wavView.getUint32(4, true), 40)
assert.equal(new TextDecoder().decode(wav.slice(8, 12)), 'WAVE')
assert.equal(wavView.getUint16(20, true), 1)
assert.equal(wavView.getUint16(22, true), 1)
assert.equal(wavView.getUint32(24, true), 16000)
assert.equal(wavView.getUint32(28, true), 32000)
assert.equal(wavView.getUint16(32, true), 2)
assert.equal(wavView.getUint16(34, true), 16)
assert.equal(new TextDecoder().decode(wav.slice(36, 40)), 'data')
assert.equal(wavView.getUint32(40, true), 4)
assert.deepEqual(bytes(wav.slice(44)), [0, 128, 255, 127], 'PCM samples are concatenated little-endian')

class MockSocket {
  static instances = []
  constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; MockSocket.instances.push(this) }
  send(data) { this.sent.push(data) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.({}) }
  message(data) { this.onmessage?.({ data: JSON.stringify(data) }) }
  error() { this.onerror?.(new Error('socket failed')) }
}
function setup(options = {}) {
  MockSocket.instances = []
  const calls = { frames: [], texts: [], states: [], limits: 0, uploads: [], disposed: 0 }
  let current = true
  const environment = { WebSocket: MockSocket, Blob, AbortController }
  const session = createWebAsrSession({
    url: 'wss://offline.invalid/asr', environment, maxDurationMs: options.maxDurationMs ?? 60000,
    readyTimeoutMs: options.readyTimeoutMs ?? 1000, finishTimeoutMs: options.finishTimeoutMs ?? 1000,
    isCurrent: () => current,
    onText: text => calls.texts.push(text), onState: state => calls.states.push(state), onLimit: () => calls.limits++,
    transcribe: async (blob, name, request) => { calls.uploads.push({ blob, name, request }); return { data: { text: 'backup result' } } },
    createCapture: ({ onFrame, onEnded }) => {
      const capture = {
        start: async () => options.startResult ?? true,
        stop: async () => {},
        dispose: () => { calls.disposed++ },
        frame: buffer => { calls.frames.push(buffer); onFrame(buffer) },
        ended: () => onEnded()
      }
      calls.capture = capture
      return capture
    }
  })
  return { session, calls, socket: () => MockSocket.instances[0], setCurrent: value => { current = value } }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const pcmFrame = (...values) => { const buffer = new ArrayBuffer(values.length * 2), view = new DataView(buffer); values.forEach((n, i) => view.setInt16(i * 2, n, true)); return buffer }

// Frames received before the task-ready event are queued and flushed in order.
{
  const h = setup(); await h.session.start(); const socket = h.socket()
  h.calls.capture.frame(pcmFrame(1)); h.calls.capture.frame(pcmFrame(2))
  assert.deepEqual(socket.sent, [])
  socket.open(); socket.message({ type: 'ready' })
  assert.deepEqual(socket.sent.map(bytes), [[1, 0], [2, 0]])
  socket.message({ type: 'partial', text: '临时' })
  const stopping = h.session.stop(); await tick()
  assert.deepEqual(socket.sent.slice(-1), [JSON.stringify({ type: 'finish' })])
  let settled = false; stopping.then(() => { settled = true }); await tick()
  assert.equal(settled, false, 'partial text never resolves the final transcript')
  socket.message({ type: 'done', text: '最终文本' })
  assert.deepEqual(await stopping, { text: '最终文本', usage: null })
  assert.deepEqual(h.calls.texts, ['临时', '最终文本'])
}

// Stop may precede ready; the queued audio and finish marker still retain order.
{
  const h = setup(); await h.session.start(); const socket = h.socket()
  h.calls.capture.frame(pcmFrame(4)); const stopping = h.session.stop(); await tick()
  socket.open(); socket.message({ type: 'ready' }); await tick()
  assert.deepEqual(socket.sent.map(value => value instanceof ArrayBuffer ? bytes(value) : value), [[4, 0], JSON.stringify({ type: 'finish' })])
  socket.message({ type: 'done', text: 'ok' }); assert.equal((await stopping).text, 'ok')
}

// A failed websocket falls back to the recorded WAV once, even after partial text.
{
  const h = setup(); await h.session.start(); const socket = h.socket(); socket.open(); socket.message({ type: 'ready' })
  h.calls.capture.frame(pcmFrame(11, -12)); socket.message({ type: 'partial', text: 'partial only' })
  const stopping = h.session.stop(); await tick(); socket.error()
  const result = await stopping
  assert.deepEqual(result, { text: 'backup result', fallback: true })
  assert.equal(h.calls.uploads.length, 1)
  assert.equal(h.calls.uploads[0].name, 'audio.wav')
  assert.equal(h.calls.uploads[0].blob.type, 'audio/wav')
  assert.equal(h.calls.uploads[0].blob.size, 48)
}

// A premature done response fails the stream, while later microphone frames
// still enter the WAV backup and are not lost from the eventual upload.
{
  const h = setup(); await h.session.start(); const socket = h.socket()
  h.calls.capture.frame(pcmFrame(21))
  socket.message({ type: 'done', text: 'premature result' })
  h.calls.capture.frame(pcmFrame(22))
  const result = await h.session.stop()
  assert.deepEqual(result, { text: 'backup result', fallback: true })
  assert.equal(h.calls.uploads.length, 1)
  assert.equal(h.calls.uploads[0].blob.size, 48, 'WAV includes frames recorded before and after premature done')
}

// A pending microphone request can be canceled without opening a socket or uploading.
{
  MockSocket.instances = []
  let resolveStart
  const calls = { uploads: 0, states: 0 }
  const session = createWebAsrSession({ url: 'ws://offline.invalid', environment: { WebSocket: MockSocket, Blob, AbortController },
    createCapture: () => ({ start: () => new Promise(resolve => { resolveStart = resolve }), dispose() {}, stop() {} }),
    transcribe: async () => { calls.uploads++; return {} }, onState: () => calls.states++ })
  const starting = session.start(); await tick(); session.dispose(); resolveStart(true)
  assert.equal(await starting, false)
  assert.equal(MockSocket.instances.length, 0)
  assert.equal(calls.uploads, 0)
  assert.equal(calls.states, 0)
}

// Owner changes during capture prevent result writes and fallback requests.
{
  const h = setup(); await h.session.start(); h.calls.capture.frame(pcmFrame(1)); h.setCurrent(false)
  assert.equal(await h.session.stop(), null)
  assert.equal(h.calls.uploads.length, 0)
  assert.equal(h.calls.texts.length, 0)
}

// Any capture callback observes an expired owner and immediately disposes its session.
for (const trigger of [h => h.calls.capture.frame(pcmFrame(1)), h => h.calls.capture.ended()]) {
  const h = setup(); await h.session.start(); h.setCurrent(false); trigger(h)
  assert.equal(h.calls.disposed, 1)
  assert.equal(h.calls.uploads.length, 0)
}
{
  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout
  const activeTimers = new Map(); let nextTimer = 0
  globalThis.setTimeout = callback => { const timer = ++nextTimer; activeTimers.set(timer, callback); return timer }
  globalThis.clearTimeout = timer => activeTimers.delete(timer)
  try {
    const h = setup(); await h.session.start(); h.setCurrent(false)
    const maxDuration = activeTimers.values().next().value
    maxDuration()
    assert.equal(h.calls.disposed, 1, 'max-duration callback disposes an expired owner')
    assert.equal(h.calls.uploads.length, 0)
    assert.equal(activeTimers.size, 0)
  } finally { globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout }
}

// Stop clears ready and finish timeouts when the normal done response arrives.
{
  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout
  const activeTimers = new Set(); let nextTimer = 0
  globalThis.setTimeout = callback => { const timer = { id: ++nextTimer, callback }; activeTimers.add(timer); return timer }
  globalThis.clearTimeout = timer => activeTimers.delete(timer)
  try {
    const h = setup(); await h.session.start(); const socket = h.socket()
    socket.open(); socket.message({ type: 'ready' })
    const stopping = h.session.stop(); await tick()
    socket.message({ type: 'done', text: 'done' }); await stopping
    assert.equal(activeTimers.size, 0, 'completed session leaves no timeout handles')
  } finally { globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout }
}

// Sample and queue caps both stop unbounded recording work.
{
  const h = setup({ maxDurationMs: 10 }); await h.session.start()
  h.calls.capture.frame(new ArrayBuffer(322))
  assert.equal(h.calls.limits, 1, 'sample duration cap invokes onLimit')
  h.session.dispose()
}
{
  const h = setup(); await h.session.start(); h.calls.capture.frame(new ArrayBuffer(512 * 1024 + 2))
  assert.equal(h.socket().readyState, 3, 'pre-ready queue cap closes the websocket')
  assert.equal(h.calls.uploads.length, 0)
  h.session.dispose()
}

// SFC platform preprocessing leaves browser-only imports out of native scripts,
// and every resulting script remains parseable JavaScript.
function preprocess(source, platform) {
  const stack = [true], output = []
  for (const line of source.split(/\r?\n/)) {
    const marker = line.match(/^\s*\/\/\s*#(ifdef|ifndef|endif)\s*(.*)$/)
    if (!marker) { if (stack.at(-1)) output.push(line); continue }
    const [, kind, expression] = marker
    if (kind === 'endif') stack.pop()
    else {
      const matches = expression.split('||').map(value => value.trim()).includes(platform)
      stack.push(stack.at(-1) && (kind === 'ifdef' ? matches : !matches))
    }
  }
  assert.deepEqual(stack, [true], `${platform}: balanced platform blocks`)
  return output.join('\n')
}
const vue = fs.readFileSync(new URL('../../src/pages-nonTheme/voice-scan.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(vue, { filename: 'voice-scan.vue' })
assert.deepEqual(errors, [])
for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const preprocessed = preprocess(descriptor.script.content, platform)
  const hasWebImports = preprocessed.includes('web-asr-audio.mjs') || preprocessed.includes('web-asr-session.mjs')
  assert.equal(hasWebImports, platform === 'H5', `${platform}: browser ASR modules are H5-only`)
  const script = preprocessed.replace(/^import .*$/gm, '').replace(/^export default /gm, 'const __component = ')
  new vm.Script(script, { filename: `voice-scan.${platform}.js` })
}

// Old recorder callbacks are detached on hide and cannot finish work after a
// later show; a fresh binding still accepts a normal start/stop pair.
{
  const script = preprocess(descriptor.script.content, 'MP-WEIXIN')
    .replace(/^import .*$/gm, '').replace(/^export default /gm, 'const __component = ')
  const managers = []
  const uni = {
    getAppBaseInfo: () => ({ uniPlatform: 'app' }),
    getStorageSync: key => key === 'token' ? 'owner-1' : '',
    getRecorderManager() {
      const events = new Map(), history = new Map()
      const manager = { events, history, start() {}, stop() {} }
      for (const name of ['Start', 'Stop', 'Error']) {
        events.set(name, []); history.set(name, [])
        manager[`on${name}`] = callback => { events.get(name).push(callback); history.get(name).push(callback) }
        manager[`off${name}`] = callback => events.set(name, events.get(name).filter(item => item !== callback))
      }
      manager.onFrameRecorded = callback => { events.set('FrameRecorded', [callback]); manager.history.set('FrameRecorded', [callback]) }
      manager.offFrameRecorded = callback => events.set('FrameRecorded', events.get('FrameRecorded').filter(item => item !== callback))
      managers.push(manager); return manager
    },
    showToast() {}
  }
  const context = { console, uni, ManifestIcon: {}, LocalSpeechButton: {}, refreshLocalSpeech() {}, stopLocalSpeech() {},
    setTimeout, clearTimeout, Promise, Object, Array, String, Number, Error, JSON }
  vm.createContext(context); vm.runInContext(`${script}\nglobalThis.__component = __component`, context)
  const component = context.__component
  const page = { voiceRun: 1, recordingOwner: 'owner-1', recordHeld: true, isListening: false,
    permissionPageClosed: false, recognitionPageHidden: false, realtimeSocket: null, realtimeReady: false,
    realtimeFrameQueue: [], realtimeSocketState: 'closed', realtimeStopping: false, realtimeDone: false,
    realtimeFailed: false, appSegmentMode: false, statusText: '', finishCalls: [] }
  for (const [name, method] of Object.entries(component.methods)) page[name] = method.bind(page)
  page.finishRealtimeOrFallback = path => page.finishCalls.push(path)

  page.initRecorder()
  const oldStop = managers[0].history.get('Stop')[0]
  component.onHide.call(page)
  component.onShow.call(page)
  page.voiceRun++
  page.recordHeld = true
  page.initRecorder()
  oldStop({ tempFilePath: 'old.wav' })
  assert.deepEqual(page.finishCalls, [], 'detached old onStop callback cannot finish after hide/show')

  const freshStart = managers[1].events.get('Start')[0]
  const freshStop = managers[1].events.get('Stop')[0]
  freshStart()
  page.recordHeld = false
  freshStop({ tempFilePath: 'fresh.wav' })
  assert.deepEqual(page.finishCalls, ['fresh.wav'], 'current onStart and released onStop still complete')

  const speechResults = []
  const classification = { ...component.data(), canSpeakLocally: true, permissionAttempt: 1,
    $nextTick: fn => fn(), $refs: { classificationSpeech: { play: () => speechResults.push(classification.currentResult.category) } } }
  for (const [name, method] of Object.entries(component.methods)) classification[name] = method.bind(classification)
  classification.addToHistory = () => {}
  context.recognizeByText = async () => ({ category: '有害垃圾' })
  await classification.classifyRecognizedText('废电池')
  assert.deepEqual(speechResults, ['有害垃圾'], 'a final category is read once without a preference')
  classification.canSpeakLocally = false
  await classification.classifyRecognizedText('废电池')
  assert.deepEqual(speechResults, ['有害垃圾'], 'without a local voice, classification is text only')
  classification.canSpeakLocally = true
  let finishRecognition
  context.recognizeByText = () => new Promise(resolve => { finishRecognition = resolve })
  const classificationPending = classification.classifyRecognizedText('报纸')
  classification.permissionAttempt++
  finishRecognition({ category: '可回收物' })
  await classificationPending
  assert.deepEqual(speechResults, ['有害垃圾'], 'an intervening microphone press suppresses late automatic playback')

  const mergePage = { appSegmentWindowText: '', appSegmentWindowStartIndex: 0,
    appSegmentCumulativeText: '', textInput: '', appSegmentBaseText: '' }
  for (const name of ['mergeAppSegmentWindowText', 'mergeAppSegmentCumulativeText', 'joinAppSegmentText']) {
    mergePage[name] = component.methods[name].bind(mergePage)
  }
  assert.equal(mergePage.mergeAppSegmentWindowText('早期识别窗口旧文本', 0), '早期识别窗口旧文本')
  assert.equal(mergePage.mergeAppSegmentWindowText('短句', 0), '短句', 'start-zero correction can replace and shorten the transcript')

  mergePage.appSegmentCumulativeText = ''; mergePage.appSegmentWindowText = ''; mergePage.appSegmentWindowStartIndex = 0
  assert.equal(mergePage.mergeAppSegmentWindowText('前缀重复段', 0), '前缀重复段')
  assert.equal(mergePage.mergeAppSegmentWindowText('重复段新增内容', 1), '前缀重复段新增内容', 'a shifted window retains its earlier prefix')

  mergePage.appSegmentWindowText = ''; mergePage.appSegmentWindowStartIndex = 0
  mergePage.appSegmentCumulativeText = '已确认前缀重复段旧后缀'
  mergePage.textInput = mergePage.appSegmentCumulativeText
  assert.equal(mergePage.mergeAppSegmentWindowText('旧后缀', 3), '已确认前缀重复段旧后缀')
  assert.equal(mergePage.mergeAppSegmentWindowText('修正后缀', 3), '已确认前缀重复段修正后缀', 'same shifted window replaces only its suffix')
}

console.log('Offline web ASR audio, session, and H5/native SFC checks passed.')
