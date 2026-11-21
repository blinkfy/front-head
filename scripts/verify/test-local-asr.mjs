import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseJavaScript } from '@babel/parser'
import { assertAsrCurrent, localFirstAsr } from '../../src/utils/local-asr-core.mjs'
import { createWebLocalAsr, supportsLocalAudioTrack, transcribeWebLocalFiles, webLocalAsrAvailable } from '../../src/utils/web-local-asr.mjs'

function browser(SpeechRecognition, userAgent = 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36') {
  return { SpeechRecognition, navigator: { userAgent }, AbortController }
}

class FakeRecognition {
  static instances = []
  static availability = 'available'
  static availableOptions = []
  static available = async options => {
    FakeRecognition.availableOptions.push(options)
    return FakeRecognition.availability
  }
  static reset() {
    FakeRecognition.instances = []
    FakeRecognition.availableOptions = []
    FakeRecognition.availability = 'available'
  }
  constructor() {
    FakeRecognition.instances.push(this)
    this.aborts = 0
    this.stops = 0
    this.starts = 0
  }
  start(track) {
    this.starts++
    this.track = track
    queueMicrotask(() => this.onstart?.())
  }
  stop() { this.stops++ }
  abort() { this.aborts++ }
  result(text, isFinal) {
    this.results([{ text, final: isFinal }])
  }
  results(items) {
    const results = items.map(item => {
      const result = [{ transcript: item.text }]
      result.isFinal = item.final
      return result
    })
    this.onresult?.({ results })
  }
  end() { this.onend?.() }
  error() { this.onerror?.({ error: 'network' }) }
}
FakeRecognition.prototype.processLocally = false

function recognitionEnv() {
  FakeRecognition.reset()
  return browser(FakeRecognition)
}

function findMethod(object, name) {
  const property = object.properties.find(item => item.key?.name === name || item.key?.value === name)
  assert.ok(property, `expected method ${name}`)
  return property
}

function vueMethod(file, methodName, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: file })
  assert.deepEqual(errors, [])
  const ast = parseJavaScript(descriptor.script.content, { sourceType: 'module' })
  const exported = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration
  const methods = findMethod(exported, 'methods').value
  const method = findMethod(methods, methodName)
  const snippet = descriptor.script.content.slice(method.start, method.end)
  return vm.runInNewContext(`({${snippet}})[${JSON.stringify(methodName)}]`, globals)
}

function exportedObjectMethod(file, objectName, methodName, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const ast = parseJavaScript(source, { sourceType: 'module' })
  const declaration = ast.program.body.find(node => node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration' &&
    node.declaration.declarations.some(item => item.id.name === objectName))?.declaration
  const object = declaration?.declarations.find(item => item.id.name === objectName)?.init
  const method = findMethod(object, methodName)
  const snippet = source.slice(method.start, method.end)
  return vm.runInNewContext(`({${snippet}})[${JSON.stringify(methodName)}]`, globals)
}

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function testAvailabilityRequiresLocalTrackApi() {
  const env = recognitionEnv()
  assert.equal(supportsLocalAudioTrack(env), true)
  assert.equal(await webLocalAsrAvailable(env), true)
  assert.deepEqual(FakeRecognition.availableOptions[0], { langs: ['zh-CN'], processLocally: true })

  class LegacyRecognition {}
  assert.equal(await webLocalAsrAvailable(browser(LegacyRecognition)), false, 'legacy WebKit recognition is not local ASR')
  class NoAvailability extends FakeRecognition {}
  NoAvailability.available = undefined
  assert.equal(supportsLocalAudioTrack(browser(NoAvailability)), false)
  assert.equal(supportsLocalAudioTrack(browser(FakeRecognition, 'Mozilla/5.0 Chrome/138.0.0.0')), false)
  FakeRecognition.availability = 'downloadable'
  assert.equal(await webLocalAsrAvailable(env), false, 'does not install a pack or switch to cloud')
}

async function testLocalFirstFallbackAndCancellation() {
  let cloudCalls = 0
  const cloud = async () => { cloudCalls++; return { text: 'cloud' } }
  const localResult = await localFirstAsr(async () => ({ text: '  本地结果  ' }), cloud)
  assert.deepEqual(localResult, { text: '本地结果', local: true })
  assert.equal(cloudCalls, 0, 'local success never calls cloud')

  for (const local of [async () => null, async () => ({ text: '  ' }), async () => { throw new Error('local failure') }]) {
    const result = await localFirstAsr(local, cloud)
    assert.deepEqual(result, { text: 'cloud' })
  }
  assert.equal(cloudCalls, 3, 'unsupported, empty, and failed local ASR each fall back once')

  const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
  await assert.rejects(localFirstAsr(async () => { throw abort }, cloud), { name: 'AbortError' })
  assert.equal(cloudCalls, 3, 'cancelled work never calls cloud')

  let current = true
  await assert.rejects(localFirstAsr(async () => { current = false; return { text: 'late' } }, cloud,
    { isCurrent: () => current }), { name: 'AbortError' })
  assert.equal(cloudCalls, 3, 'stale identity never calls cloud')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(localFirstAsr(async () => assert.fail('local should not start'), cloud,
    { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(cloudCalls, 3)
}

async function testTrackPartialAndFinalResults() {
  const env = recognitionEnv()
  const track = { kind: 'audio', readyState: 'live' }
  const seen = []
  const session = createWebLocalAsr({ track, environment: env, onText: text => seen.push(text) })
  assert.equal(await session.start(), true)
  const recognition = FakeRecognition.instances[0]
  assert.equal(recognition.track, track, 'start receives the decoded audio track')
  recognition.result('暂时', false)
  assert.deepEqual(seen, ['暂时'])
  const stopped = session.stop()
  recognition.result('最终文字', true)
  recognition.end()
  assert.deepEqual(await stopped, { text: '最终文字', local: true })
  session.dispose()
}

async function testPartialOnlyEarlyEndAndErrorFallBack() {
  const partialEnv = recognitionEnv()
  const partialSession = createWebLocalAsr({ track: { kind: 'audio', readyState: 'live' }, environment: partialEnv })
  await partialSession.start()
  const partialRecognition = FakeRecognition.instances[0]
  partialRecognition.result('只有临时结果', false)
  const partialStop = partialSession.stop()
  partialRecognition.end()
  assert.equal(await partialStop, null, 'partial hypotheses are not final transcription')
  partialSession.dispose()

  for (const endEarly of [false, true]) {
    const env = recognitionEnv()
    let cloudCalls = 0
    let localFailures = 0
    const local = async () => {
      const session = createWebLocalAsr({ track: { kind: 'audio', readyState: 'live' }, environment: env,
        onFailure: () => { localFailures++ } })
      const started = session.start()
      const recognition = FakeRecognition.instances[0]
      if (endEarly) recognition.end()
      else recognition.error()
      assert.equal(await started, false)
      session.dispose()
      return null
    }
    const result = await localFirstAsr(local, async () => { cloudCalls++; return { text: 'cloud' } })
    assert.deepEqual(result, { text: 'cloud' })
    assert.equal(cloudCalls, 1, endEarly ? 'early end falls back once' : 'recognition error falls back once')
    assert.equal(localFailures, 1)
  }
}

async function testPendingTrailingPhraseIsNotReturnedAsFinal() {
  const env = recognitionEnv()
  const session = createWebLocalAsr({ track: { kind: 'audio', readyState: 'live' }, environment: env })
  await session.start()
  const recognition = FakeRecognition.instances[0]
  recognition.results([{ text: '已经确认', final: true }, { text: '尚未确认', final: false }])
  const stopped = session.stop()
  recognition.end()
  assert.equal(await stopped, null, 'a trailing interim phrase prevents returning a truncated final prefix')
  session.dispose()

  const nextEnv = recognitionEnv()
  const completed = createWebLocalAsr({ track: { kind: 'audio', readyState: 'live' }, environment: nextEnv })
  await completed.start()
  const nextRecognition = FakeRecognition.instances[0]
  nextRecognition.result('尚未确认', false)
  nextRecognition.result('尚未确认', true)
  const completeResult = completed.stop()
  nextRecognition.end()
  assert.deepEqual(await completeResult, { text: '尚未确认', local: true }, 'a later final result completes the phrase')
  completed.dispose()
}

async function testDisposeAbortsRecognition() {
  const env = recognitionEnv()
  const session = createWebLocalAsr({ track: { kind: 'audio', readyState: 'live' }, environment: env })
  const started = session.start()
  const recognition = FakeRecognition.instances[0]
  session.dispose()
  assert.equal(await started, false)
  assert.equal(await session.stop(), null)
  assert.equal(recognition.aborts, 1, 'dispose aborts active recognition')
  assert.equal(recognition.onresult, null, 'dispose detaches event handlers')
}

async function testQuickH5ReleaseWhileStartingCanRecordAgain() {
  for (const startup of ['false', 'reject']) {
    const startGate = deferred(), stopGate = deferred()
    let factoryCalls = 0
    const globals = {
      uni: { getStorageSync: () => 'token', showToast() {} },
      webAsrCaptureSupported: () => true,
      isPermissionDenied: () => false,
      transcribeAudioBlob: async () => ({ data: { text: '' } }),
      openFeaturePermissionSettings: async () => {},
      createWebAsrSession() {
        factoryCalls++
        if (factoryCalls > 1) return { start: async () => false, stop: async () => null, dispose() {} }
        return { start: () => startGate.promise, stop: () => stopGate.promise, dispose() {} }
      }
    }
    const begin = vueMethod('../../src/pages-nonTheme/voice-scan.vue', 'startH5Recording', globals)
    const stop = vueMethod('../../src/pages-nonTheme/voice-scan.vue', 'stopH5Recording', globals)
    const state = {
      isListening: false, h5AsrPending: false, voiceRun: 0, permissionPageClosed: false,
      recognitionPageHidden: false, _h5AsrSession: null, realtimeText: '', statusText: '', recordHeld: true,
      getRealtimeWsUrl: () => 'ws://test'
    }
    const starting = begin.call(state)
    const stopping = stop.call(state)
    assert.equal(state.h5AsrPending, true, 'release waits for transcription finalization')
    if (startup === 'false') startGate.resolve(false)
    else startGate.reject(new Error('start failed'))
    await starting
    stopGate.resolve(null)
    await stopping
    assert.equal(state.h5AsrPending, false, `${startup}: pending state clears after quick release`)
    assert.equal(state._h5AsrSession, null, `${startup}: no stale session remains`)
    await begin.call(state)
    assert.equal(factoryCalls, 2, `${startup}: another recording can start`)
  }
}

function fakeAudioEnvironment({ interruptPlayback = false, neverResume = false } = {}) {
  const env = recognitionEnv()
  let closeCalls = 0, sourceStarts = 0, resumeCalls = 0
  class AudioContextMock {
    constructor() { this.state = 'suspended'; this.currentTime = 0 }
    decodeAudioData() { return Promise.resolve({ duration: 1 }) }
    createMediaStreamDestination() {
      const track = { kind: 'audio', readyState: 'live', stop() {} }
      this.track = track
      return { stream: { getAudioTracks: () => [track], getTracks: () => [track] } }
    }
    resume() {
      resumeCalls++
      if (neverResume) return new Promise(() => {})
      this.state = 'running'
      return Promise.resolve()
    }
    createBufferSource() {
      return {
        connect() {},
        start: () => {
          sourceStarts++
          if (interruptPlayback) queueMicrotask(() => FakeRecognition.instances[0]?.error())
        },
        stop() {}, disconnect() {}, onended: null
      }
    }
    async close() { closeCalls++; this.state = 'closed' }
  }
  env.AudioContext = AudioContextMock
  return { env, counts: () => ({ closeCalls, sourceStarts, resumeCalls }) }
}

async function testWebAudioPlaybackErrorAndResumeTimeoutCancel() {
  const playback = fakeAudioEnvironment({ interruptPlayback: true })
  const result = await transcribeWebLocalFiles([{ arrayBuffer: async () => new ArrayBuffer(8) }], { environment: playback.env })
  assert.equal(result, null, 'recognition failure interrupts source playback and returns to fallback')
  assert.deepEqual(playback.counts(), { closeCalls: 1, sourceStarts: 1, resumeCalls: 1 })
  assert.equal(FakeRecognition.instances[0].aborts, 1, 'recognition error disposes local recognizer')

  const resume = fakeAudioEnvironment({ neverResume: true })
  const nativeSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay === 2000 ? 0 : delay, ...args)
  try {
    const timedOut = await transcribeWebLocalFiles([{ arrayBuffer: async () => new ArrayBuffer(8) }], { environment: resume.env })
    assert.equal(timedOut, null, 'resume timeout cancels the local attempt')
    assert.deepEqual(resume.counts(), { closeCalls: 1, sourceStarts: 0, resumeCalls: 1 })
    assert.equal(FakeRecognition.instances[0].starts, 0, 'recognition does not start after timed-out resume')
  } finally { globalThis.setTimeout = nativeSetTimeout }
}

function testChatTranscriptMergeProtectionAndRetranscribe() {
  const mergeMessages = vueMethod('../../src/pages-nonTheme/chat.vue', 'mergeMessages')
  const runMerge = (local, server) => {
    const state = { messages: [local], imageRetryNonces: {}, saveMessagesToStorage() {}, clearLoadedOriginalImage() {} }
    mergeMessages.call(state, [server])
    return state.messages[0]
  }
  const local = { id: 7, type: 'voice', content: 'audio-A', voiceText: '本机结果', voiceTextSource: 'local', timestamp: 1 }
  const sameAudio = runMerge(local, { ...local, voiceText: '旧服务端结果', voiceTextSource: 'cloud' })
  assert.equal(sameAudio.voiceText, '本机结果', 'same audio keeps the local device transcript')
  assert.equal(sameAudio.voiceTextSource, 'local')
  const changedAudio = runMerge(local, { ...local, content: 'audio-B', voiceText: '新音频', voiceTextSource: 'cloud' })
  assert.equal(changedAudio.voiceText, '新音频', 'different audio discards the previous local transcript')
  assert.equal(changedAudio.voiceTextSource, 'cloud')
  const withdrawnLocal = { ...local, voiceTextSource: undefined }
  const withdrawn = runMerge(withdrawnLocal, { ...withdrawnLocal, isWithdraw: true, voiceText: '' })
  assert.equal(withdrawn.voiceText, '', 'withdrawn voice does not retain local text')
  assert.equal(withdrawn.voiceTextSource, undefined)

  let apiCalls = 0
  const transcribeVoiceMessage = exportedObjectMethod('../../src/pages-nonTheme/chat/audio-methods.js',
    'voiceTranscriptionMethods', 'transcribeVoiceMessage', {
      uni: { getStorageSync: () => 'token', showToast() {} },
      chatApi: { transcribeVoiceMessage: async () => { apiCalls++; return { data: { toText: '重新识别结果' } } } },
      localAsrAvailable: async () => false,
      transcribeLocalAudio: async () => null,
      assertAsrCurrent,
      localFirstAsr,
      createAsrController: () => new AbortController(),
      baseUrl: 'https://example.test'
    })
  const existing = { id: 8, type: 'voice', content: 'existing-audio', voiceText: '旧文字', voiceTextSource: 'local' }
  const state = {
    messages: [existing], transcribingVoiceIds: {}, _voiceTranscriptions: new Map(), isChatPageDestroyed: false,
    isChatPageActive: true, otherUserId: 'peer', getCurrentUserId: () => 'user', saveMessagesToStorage() {},
    $set: (object, key, value) => { object[key] = value },
    getHeldChatMediaSource: () => '', getChatMediaSource: async () => ''
  }
  return transcribeVoiceMessage.call(state, existing).then(() => {
    assert.equal(apiCalls, 1, 'existing transcript does not prevent an explicit re-transcription')
    assert.equal(existing.voiceText, '重新识别结果')
    assert.equal(existing.voiceTextSource, 'cloud')
  })
}

function testIosAsrAvailabilityGuard() {
  const source = readFileSync(new URL('../../src/uni_modules/ftx-local-asr/utssdk/app-ios/LocalAsrBridge.swift', import.meta.url), 'utf8')
  const config = JSON.parse(readFileSync(new URL('../../src/uni_modules/ftx-local-asr/utssdk/app-ios/config.json', import.meta.url), 'utf8'))
  assert.equal(config.deploymentTarget, '12.0')
  assert.match(source, /#available\(iOS 13\.0,\s*\*\)/)
}

await testAvailabilityRequiresLocalTrackApi()
await testLocalFirstFallbackAndCancellation()
await testTrackPartialAndFinalResults()
await testPartialOnlyEarlyEndAndErrorFallBack()
await testPendingTrailingPhraseIsNotReturnedAsFinal()
await testDisposeAbortsRecognition()
await testQuickH5ReleaseWhileStartingCanRecordAgain()
await testWebAudioPlaybackErrorAndResumeTimeoutCancel()
await testChatTranscriptMergeProtectionAndRetranscribe()
testIosAsrAvailabilityGuard()
console.log('local ASR tests passed')
