import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { androidChatAlertPolicy, createChatFeedback } from '../src/utils/chat-feedback-core.mjs'

const require = createRequire(import.meta.url)
const babel = require('@babel/parser')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function preprocess(source, target) {
  const active = [true]
  const output = []
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\s*\/\/\s*#(ifdef|ifndef)\s+([\w-]+)/)
    if (directive) {
      const matches = directive[2] === target
      active.push(active.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
      continue
    }
    if (/^\s*\/\/\s*#endif\b/.test(line)) { active.pop(); continue }
    if (/^\s*\/\/\s*#else\b/.test(line)) {
      const parent = active.at(-2)
      active[active.length - 1] = parent && !active.at(-1)
      continue
    }
    if (active.at(-1)) output.push(line)
  }
  return output.join('\n')
}

function testAndroidPolicyAndCoreFeedback() {
  const base = { notificationsEnabled: true, interruptionFilter: 1, ringerMode: 2, notificationVolume: 4, vibrateWhenRinging: true }
  assert.deepEqual(androidChatAlertPolicy(base), { sound: true, vibrate: true }, 'normal Android ring mode allows notification sound and configured vibration')
  assert.deepEqual(androidChatAlertPolicy({ ...base, ringerMode: 1 }), { sound: false, vibrate: true }, 'Android vibrate mode vibrates without sound')
  assert.deepEqual(androidChatAlertPolicy({ ...base, ringerMode: 0 }), { sound: false, vibrate: false }, 'Android silent mode suppresses both cues')
  assert.deepEqual(androidChatAlertPolicy({ ...base, interruptionFilter: 2 }), { sound: false, vibrate: false }, 'priority and other DND filters stay quiet')
  assert.deepEqual(androidChatAlertPolicy({ ...base, interruptionFilter: 0 }), { sound: false, vibrate: false }, 'unknown DND filter stays quiet')
  assert.deepEqual(androidChatAlertPolicy({ ...base, notificationsEnabled: false }), { sound: false, vibrate: false }, 'disabled notification permission suppresses both cues')
  assert.deepEqual(androidChatAlertPolicy({ ...base, notificationVolume: 0 }), { sound: false, vibrate: true }, 'zero notification volume keeps permitted vibration')
  assert.deepEqual(androidChatAlertPolicy({ ...base, vibrateWhenRinging: false }), { sound: true, vibrate: false }, 'ring vibration honors the system setting')

  let enabled = false, current = 10000, buzzes = 0
  const played = []
  const driver = { warm() {}, stop() { this.stops = (this.stops || 0) + 1 }, async play(kind, volume, canStart) { played.push({ kind, volume, canStart: canStart() }); return canStart() } }
  const policy = () => ({ sound: true, vibrate: true })
  const feedback = createChatFeedback({ policy, enabled: () => enabled, driver, vibrate: () => buzzes++, now: () => current })
  feedback.setActive(true)
  feedback.receive()
  assert.equal(buzzes, 1, 'existing sound switch off disables audio but preserves system vibration')
  assert.equal(played.length, 0)
  enabled = true
  current += 1200
  feedback.receive({ quiet: true })
  assert.equal(buzzes, 1, 'quiet current conversation does not vibrate')
  assert.equal(played.at(-1).volume, 0.36, 'quiet conversation may play the lower volume cue')
  current += 1200
  feedback.receive()
  assert.equal(buzzes, 2)
  assert.equal(played.at(-1).volume, 0.68)
  current += 1199
  feedback.receive()
  assert.equal(buzzes, 2, 'received cues are throttled for 1200 ms')
  current += 1
  feedback.receive()
  assert.equal(buzzes, 3, 'received cue is allowed again at the 1200 ms boundary')

  const sentCount = played.length
  feedback.sent('account:chat:message')
  assert.equal(played.length, sentCount + 1, 'successful-send caller can request a send cue')
  assert.equal(played.at(-1).kind, 'sent')
  assert.equal(buzzes, 3, 'sent cues never vibrate')
  feedback.sent('account:chat:message')
  assert.equal(played.length, sentCount + 1, 'the same successful message does not sound twice')

  const pending = []
  const delayedDriver = { warm() {}, stop() { this.stops = (this.stops || 0) + 1 }, play(kind, volume, canStart) { return new Promise(resolve => pending.push(() => resolve(canStart()))) } }
  const delayed = createChatFeedback({ policy, enabled: () => true, driver: delayedDriver, vibrate() {}, now: () => current })
  delayed.setActive(true)
  const late = delayed.receive()
  delayed.setBlocked('recording', true)
  pending.shift()()
  return late.then(result => {
    assert.equal(result, false, 'recording/background block cancels a delayed audio start')
    assert.ok(delayedDriver.stops >= 2, 'blocking also stops a cue already handed to the driver')
    let owner = 'account-a', start
    const ownerDriver = { warm() {}, stop() {}, play(kind, volume, canStart) { return new Promise(resolve => { start = () => resolve(canStart()) }) } }
    const ownerBound = createChatFeedback({ policy, enabled: () => true, driver: ownerDriver, vibrate() {}, getOwner: () => owner, now: () => current })
    ownerBound.setActive(true)
    const staleOwnerCue = ownerBound.receive()
    owner = 'account-b'
    start()
    return staleOwnerCue.then(staleResult => assert.equal(staleResult, false, 'account change during audio preparation cancels the old account cue'))
  })
}

function testNativeAndroidBridge() {
  const source = fs.readFileSync(path.join(root, 'src/utils/chat-feedback.js'), 'utf8')
  const coreSource = fs.readFileSync(path.join(root, 'src/utils/chat-feedback-core.mjs'), 'utf8')
  const eventsSource = fs.readFileSync(path.join(root, 'src/utils/chat-events.js'), 'utf8')
  for (const [name, text] of [['chat-feedback.js', source], ['chat-feedback-core.mjs', coreSource], ['chat-events.js', eventsSource]]) {
    babel.parse(text, { sourceType: 'unambiguous', plugins: ['optionalChaining', 'objectRestSpread', 'dynamicImport'] })
    const preprocessed = text.replace(/^\s*\/\/\s*#(?:if|ifdef|ifndef|else|endif).*$/gm, '')
    babel.parse(preprocessed, { sourceType: 'unambiguous', plugins: ['optionalChaining', 'objectRestSpread', 'dynamicImport'] })
    console.log(`PASS ${name} H5/APP preprocessor syntax`)
  }

  const operations = [], players = [], copied = [], volumeMutations = []
  const audio = { getRingerMode: () => 2, getStreamVolume: stream => { assert.equal(stream, 5); return 7 }, shouldVibrate: () => true }
  const notifications = { areNotificationsEnabled: () => true, getCurrentInterruptionFilter: () => 1 }
  class MockPlayer {
    constructor() { this.calls = []; players.push(this) }
    setAudioStreamType(stream) { operations.push(['stream', stream]) }
    setDataSource(sourcePath) { operations.push(['source', sourcePath]) }
    setLooping(loop) { operations.push(['loop', loop]) }
    prepare() { operations.push(['prepare']) }
    setVolume(left, right) { volumeMutations.push([left, right]) }
    seekTo(position) { operations.push(['seek', position]) }
    start() { operations.push(['start']) }
    pause() { operations.push(['pause']) }
    isPlaying() { return false }
    release() { operations.push(['release']) }
  }
  const entry = { toLocalURL: () => 'file:///private/chat-feedback.mp3' }
  const directory = {
    getFile(name, options, success, fail) { operations.push(['cache-check', name, options.create]); fail(new Error('cache miss')) },
    toLocalURL: () => 'file:///private/chat-feedback-v1/'
  }
  const rootEntry = { getDirectory(name, options, success) { operations.push(['directory', name, options.create]); success(directory) } }
  const plus = {
    os: { name: 'Android' },
    android: { runtimeMainActivity: () => ({ getSystemService: name => name === 'audio' ? audio : notifications }),
      importClass(value) { if (value === 'android.media.MediaPlayer') return MockPlayer; if (value === 'android.os.Build$VERSION') return { SDK_INT: 35 }; return value } },
    io: { convertLocalFileSystemURL: url => url, resolveLocalFileSystemURL(url, success) {
      operations.push(['resolve', url])
      if (url === '_doc/') success(rootEntry)
      else success({ copyTo(dir, name, done) { copied.push({ dir, name }); done(entry) } })
    } },
    device: { vibrate() {} }
  }
  const sourceForEval = preprocess(source, 'APP-PLUS').replace(/^import .*$/gm, '').replace(/^export /gm, '') +
    '\nglobalThis.__feedbackExports={receiveChatFeedback,sentChatFeedback,setChatFeedbackActive,setChatFeedbackBlocked};'
  const context = { plus, uni: { getStorageSync() { return 'acct' }, createInnerAudioContext() { throw new Error('Android must use MediaPlayer') } },
    androidChatAlertPolicy, createChatFeedback, areUiSoundsEnabled: () => true, Promise, Date, Map, Set, Number, Object, console }
  vm.runInNewContext(sourceForEval, context)
  const api = context.__feedbackExports
  api.setChatFeedbackActive(true)
  return api.receiveChatFeedback().then(result => {
    assert.equal(result, true, `native Android driver starts notification sound (operations: ${JSON.stringify(operations)})`)
    assert.ok(operations.some(([op, value]) => op === 'stream' && value === 5), 'MediaPlayer uses STREAM_NOTIFICATION')
    assert.ok(operations.some(([op]) => op === 'source'), 'MediaPlayer reads its private cached copy')
    assert.ok(operations.some(([op, value]) => op === 'directory' && value === 'chat-feedback-v1'), 'sound files are cached under the private app documents directory')
    assert.ok(copied.length >= 1, 'bundled sound is copied into private cache on first use')
    assert.deepEqual(volumeMutations[0], [0.68, 0.68], 'only player-local volume changes; system stream volume is untouched')
    assert.ok(players.length >= 1, 'warm-up can prepare both native sound files')
    assert.ok(!operations.some(([op, value]) => op === 'resolve' && String(value).startsWith('http')), 'native cue makes no server request')
  })
}

async function testH5AndVoiceScanGates() {
  const raw = fs.readFileSync(path.join(root, 'src/utils/chat-feedback.js'), 'utf8')
  const webSource = preprocess(raw, 'H5').replace(/^import .*$/gm, '').replace(/^export /gm, '') +
    '\nglobalThis.__feedbackExports={receiveChatFeedback,setChatFeedbackActive};'
  const audioContexts = []
  let contexts = 0, buzzes = 0
  let clock = 1000
  const media = { paused: false, ended: false, muted: false, src: 'https://media.example/other.mp3' }
  const document = { hidden: false, querySelectorAll: () => [media] }
  const uni = { getStorageSync() { return 'acct' }, createInnerAudioContext() { contexts++; const audio = { onPlay(callback) { this.played = callback }, onError() {}, play() { this.played?.() }, stop() {} }; audioContexts.push(audio); return audio } }
  let routes = []
  const context = { document, uni, baseUrl: 'https://api.example/', getCurrentPages: () => routes.map(route => ({ route })),
    areUiSoundsEnabled: () => true, androidChatAlertPolicy, createChatFeedback: options => createChatFeedback({ ...options, now: () => clock }), Promise, Date: { now: () => clock }, Map, Set, Number, Object, console }
  vm.runInNewContext(webSource, context)
  context.__feedbackExports.setChatFeedbackActive(true)
  assert.equal(await context.__feedbackExports.receiveChatFeedback(), false, 'unmuted background audio/video suppresses chat feedback')
  assert.equal(contexts, 0, 'blocked media does not instantiate an audio context')
  media.src = 'https://app.example/static/app/sounds/07-message-received.mp3'
  clock += 1200
  assert.equal(await context.__feedbackExports.receiveChatFeedback(), true, 'the chat feedback audio asset does not block itself on H5')
  assert.equal(contexts, 1)
  assert.equal(audioContexts[0].src, 'https://api.example/audio/ui-sounds/07-message-received.mp3')
  media.src = 'https://api.example/audio/ui-sounds/07-message-received.mp3?version=1'
  clock += 1200
  assert.equal(await context.__feedbackExports.receiveChatFeedback(), true, 'backend-hosted feedback must not block itself')
  media.src = 'https://media.example/other.mp3'
  clock += 1200
  assert.equal(await context.__feedbackExports.receiveChatFeedback(), false, 'other active media still blocks feedback after player warm-up')
  media.paused = true
  document.hidden = true
  clock += 1200
  assert.equal(await context.__feedbackExports.receiveChatFeedback(), false, 'hidden H5 tab suppresses chat feedback')
  document.hidden = false
  routes = ['pages-nonTheme/voice-scan']
  clock += 1200
  assert.equal(await context.__feedbackExports.receiveChatFeedback(), false, 'voice-scan page suppresses chat feedback')
  assert.equal(contexts, 1)
}

async function testSendDispatchFeedback() {
  const source = fs.readFileSync(path.join(root, 'src/pages-nonTheme/chat/send-methods.js'), 'utf8')
  babel.parse(source, { sourceType: 'unambiguous', plugins: ['optionalChaining', 'objectRestSpread'] })
  const calls = [], cues = []
  let responseCode = 0, pendingMode = false, resolveSend
  const chatApi = new Proxy({}, { get: (_, name) => (...args) => {
    calls.push({ name, args })
    return pendingMode ? new Promise(resolve => { resolveSend = resolve }) : Promise.resolve({ code: responseCode })
  } })
  const sourceForEval = source.replace(/^import .*$/gm, '').replace(/^export const /gm, 'const ') +
    '\nglobalThis.__sendMethods=messageSendMethods;'
  let account = 'acct-a'
  const uni = { getStorageSync: key => key === 'token' ? account : undefined }
  const context = { chatApi, uni, sentChatFeedback: key => { cues.push(key); return Promise.resolve(true) }, Promise }
  vm.runInNewContext(sourceForEval, context)
  const send = context.__sendMethods.sendCreatedMessage
  const types = ['text', 'image', 'voice', 'video', 'file', 'location']
  for (const isGroupChat of [false, true]) for (const type of types) {
    const message = { id: `id-${type}`, clientMessageId: `id-${type}`, refId: 'quote-9', type, content: 'data', duration: 3,
      thumbnail: 'thumb', fileName: 'f.txt', fileSize: 12, locationName: 'place', locationAddress: 'street', latitude: 1, longitude: 2 }
    await send.call({ isGroupChat, isChatPageActive: true, groupId: 'g', chatId: 'c', otherUserId: 'u' }, message, () => {})
  }
  assert.equal(calls.length, 12, 'all direct and group send methods dispatch')
  assert.equal(cues.length, 12, 'each successful dispatch receives one sound cue')
  const expectedNames = ['sendTextMessage', 'sendImageMessage', 'sendVoiceMessage', 'sendVideoMessage', 'sendFileMessage', 'sendLocationMessage',
    'sendGroupTextMessage', 'sendGroupImageMessage', 'sendGroupVoiceMessage', 'sendGroupVideoMessage', 'sendGroupFileMessage', 'sendGroupLocationMessage']
  for (const name of expectedNames) assert.equal(calls.filter(call => call.name === name).length, 1, `${name} dispatches once`)
  const byName = Object.fromEntries(calls.map(call => [call.name, call.args]))
  const plain = value => JSON.parse(JSON.stringify(value))
  assert.deepEqual(Object.keys(byName.sendTextMessage[0]).sort(), ['chatId', 'clientMessageId', 'content', 'refId', 'targetUserId'].sort())
  assert.deepEqual(plain(byName.sendTextMessage[0]), { chatId: 'c', targetUserId: 'u', content: 'data', clientMessageId: 'id-text', refId: 'quote-9' })
  assert.equal(byName.sendImageMessage[0], 'c'); assert.equal(byName.sendImageMessage[1], 'u'); assert.equal(byName.sendImageMessage[2], 'data')
  assert.deepEqual(plain(byName.sendImageMessage[3]), { clientMessageId: 'id-image', refId: 'quote-9' })
  assert.deepEqual(plain(byName.sendVoiceMessage.slice(0, 4)), ['c', 'u', 'data', 3]); assert.deepEqual(plain(byName.sendVoiceMessage[4]), { clientMessageId: 'id-voice', refId: 'quote-9' })
  assert.deepEqual(plain(byName.sendVideoMessage.slice(0, 5)), ['c', 'u', 'data', 'thumb', 3]); assert.equal(typeof byName.sendVideoMessage[5], 'function')
  assert.deepEqual(plain(byName.sendVideoMessage[6]), { clientMessageId: 'id-video', refId: 'quote-9' })
  assert.deepEqual(plain(byName.sendFileMessage.slice(0, 5)), ['c', 'u', 'data', 'f.txt', 12]); assert.equal(typeof byName.sendFileMessage[5], 'function')
  assert.deepEqual(plain(byName.sendFileMessage[6]), { clientMessageId: 'id-file', refId: 'quote-9' })
  assert.deepEqual(plain(byName.sendLocationMessage), ['c', 'u', 'place', 'street', 1, 2, { clientMessageId: 'id-location', refId: 'quote-9' }])
  assert.deepEqual(plain(byName.sendGroupTextMessage), ['g', 'data', 'quote-9', 'id-text'])
  assert.deepEqual(plain(byName.sendGroupImageMessage), ['g', 'data', 'quote-9', 'id-image'])
  assert.deepEqual(plain(byName.sendGroupVoiceMessage), ['g', 'data', 3, 'quote-9', 'id-voice'])
  assert.deepEqual(plain(byName.sendGroupVideoMessage.slice(0, 5)), ['g', 'data', 'thumb', 3, 'quote-9']); assert.equal(typeof byName.sendGroupVideoMessage[5], 'function')
  assert.deepEqual(byName.sendGroupVideoMessage[6], 'id-video')
  assert.deepEqual(plain(byName.sendGroupFileMessage.slice(0, 5)), ['g', 'data', 'f.txt', 12, 'quote-9']); assert.equal(typeof byName.sendGroupFileMessage[5], 'function')
  assert.deepEqual(byName.sendGroupFileMessage[6], 'id-file')
  assert.deepEqual(plain(byName.sendGroupLocationMessage), ['g', { clientMessageId: 'id-location', refId: 'quote-9', locationName: 'place', locationAddress: 'street', latitude: 1, longitude: 2 }])

  responseCode = 500
  await assert.doesNotReject(send.call({ isGroupChat: false, isChatPageActive: true, chatId: 'c', otherUserId: 'u' },
    { type: 'text', content: 'fail', clientMessageId: 'failed-id' }))
  assert.equal(cues.length, 12, 'failed server result does not sound')
  responseCode = 0

  pendingMode = true
  const pending = send.call({ isGroupChat: false, isChatPageActive: true, chatId: 'c', otherUserId: 'u' },
    { type: 'text', content: 'old account', clientMessageId: 'switch-id' })
  account = 'acct-b'
  resolveSend({ code: 0 })
  await pending
  assert.equal(cues.length, 12, 'account switch before send acknowledgement suppresses stale-account audio')
}

function testSoundDistribution() {
  const raw = fs.readFileSync(path.join(root, 'src/utils/chat-feedback.js'), 'utf8')
  const urlSource = raw.slice(raw.indexOf('function soundUrl('), raw.indexOf('const android ='))
  for (const target of ['APP-PLUS', 'H5', 'MP-WEIXIN']) {
    const context = { baseUrl: 'https://api.example///' }
    vm.runInNewContext(preprocess(urlSource, target) + '\nglobalThis.resolveSound = soundUrl;', context)
    for (const file of ['07-message-received.mp3', '08-message-sent.mp3']) {
      assert.equal(context.resolveSound(file), target === 'APP-PLUS' ? `/static/app/sounds/${file}` : `https://api.example/audio/ui-sounds/${file}`)
    }
  }
  for (const file of fs.readdirSync(path.join(root, 'src/static/app/sounds')).filter(file => file.endsWith('.mp3'))) {
    const app = fs.readFileSync(path.join(root, 'src/static/app/sounds', file))
    const web = fs.readFileSync(path.join(root, '../back-end/public/audio/ui-sounds', file))
    assert(app.equals(web), `${file}: App and backend audio bytes must match`)
  }
  console.log('PASS APP/H5/MP sound URLs and all audio resource copies')
}

async function main() {
  testSoundDistribution()
  await testAndroidPolicyAndCoreFeedback()
  console.log('PASS Android policy, sound preference, quiet mode, throttling, dedupe, and cancellation')
  await testNativeAndroidBridge()
  console.log('PASS Android MediaPlayer notification stream and private file cache')
  await testH5AndVoiceScanGates()
  console.log('PASS H5 background/media and voice-scan quiet gates')
  await testSendDispatchFeedback()
  console.log('PASS send dispatch feedback and account isolation')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
