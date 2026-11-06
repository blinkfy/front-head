import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const sourcePath = fileURLToPath(new URL('../src/utils/chat-events.js', import.meta.url))
const source = fs.readFileSync(sourcePath, 'utf8')

function preprocess(input, platform) {
  const output = [], stack = []
  let include = true
  for (const line of input.split(/\r?\n/)) {
    const match = line.match(/^\s*\/\/\s*#(ifdef|ifndef|else|endif)\s*(.*)$/)
    if (!match) { if (include) output.push(line); continue }
    const [, directive, expression] = match
    if (directive === 'ifdef' || directive === 'ifndef') {
      const selected = expression.trim() === 'H5' ? platform === 'H5' : false
      const condition = directive === 'ifdef' ? selected : !selected
      stack.push({ parent: include, condition })
      include = include && condition
    } else if (directive === 'else') {
      const current = stack.at(-1)
      include = current.parent && !current.condition
    } else {
      include = stack.pop().parent
    }
  }
  return output.join('\n').replace(/^import .* from .*$/gm, '')
    .replace(/^export function /gm, 'function ')
}

function harness({ platform, web = true, backgroundMask = 0 }) {
  const calls = { voice: [], location: [], transport: [], feedback: [], catchup: [], foreground: [], refresh: 0,
    mask: [], videoVisible: 0, androidReturn: 0, listeners: {}, uniEvents: [] }
  const transport = {
    setActive(value) { calls.transport.push(value) }, isConnected: () => false,
    send: () => true
  }
  const context = {
    console, Promise, Map, Set, String, JSON, Error, encodeURIComponent,
    baseUrl: 'https://example.test',
    webCallsAvailable: () => web, refreshWebCallAlert: () => calls.refresh++,
    syncChatPush() {},
    messageBus: { emit() {} }, triggerMessageNotification: async () => {},
    initChatNotificationNavigation() {}, showNotification() {}, userNotificationUrl: () => '',
    createNotificationCatchup: () => ({ setActive(value) { calls.catchup.push(value) }, check: async () => {}, seen: () => true }),
    receiveChatFeedback: async () => {}, setChatFeedbackActive(value) { calls.feedback.push(value) },
    voiceCalls: { setActive(value) { calls.voice.push(value) }, handle() {}, connection() {} },
    installVoiceCallSender() {},
    liveLocationState: { offers: {} }, liveLocations: { setActive(value) { calls.location.push(value) }, handle() {}, connection() {} },
    installLiveLocationSender() {},
    createChatEventsTransport: () => transport,
    connectChatEventsSocket() {}, androidBackgroundMask: () => { calls.mask.push(true); return backgroundMask },
    androidVideoVisible: () => { calls.videoVisible++; return false },
    setAndroidRealtimeForeground(value) { calls.foreground.push(value) },
    handleAndroidRealtimeReturn() { calls.androidReturn++ }, syncAndroidMessagingPreference() {},
    uni: { getStorageSync: () => '', setStorageSync() {}, request() {}, navigateTo() {}, $on(name, callback) { calls.uniEvents.push([name, callback]) } }
  }
  if (platform === 'H5') {
    const document = { hidden: false, handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback } }
    const window = { handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback } }
    context.document = document; context.window = window
    context.__surfaces = { document, window }
  } else {
    Object.defineProperty(context, 'document', { get() { throw new Error('document accessed in MP build') } })
    Object.defineProperty(context, 'window', { get() { throw new Error('window accessed in MP build') } })
  }
  vm.createContext(context)
  const compiled = preprocess(source, platform)
  vm.runInContext(`${compiled}\nglobalThis.__chatEvents = { setChatEventsActive, isChatEventsConnected }`, context, { filename: sourcePath })
  return { api: context.__chatEvents, calls, ...context.__surfaces }
}

function last(values) { return values.at(-1) }

function testH5Lifecycle() {
  const { api, calls, document, window } = harness({ platform: 'H5', web: true })
  api.setChatEventsActive(false)
  assert.equal(last(calls.voice), true, 'H5 background retains voice calls for browser incoming calls')
  assert.equal(last(calls.transport), true, 'H5 background retains the existing signaling transport')
  assert.equal(last(calls.location), false, 'H5 background stops live location sessions')
  assert.equal(last(calls.foreground), false)

  document.hidden = true
  document.handlers.visibilitychange()
  assert.equal(last(calls.voice), true, 'hidden visibility state retains H5 voice calls')
  assert.equal(last(calls.transport), true, 'hidden visibility state retains H5 signaling')
  assert.equal(last(calls.location), false)
  assert.equal(calls.refresh, 1, 'visibility changes refresh the active web call alert')

  document.hidden = false
  document.handlers.visibilitychange()
  assert.equal(last(calls.voice), true, 'visible visibilitychange restores voice calls')
  assert.equal(last(calls.transport), true, 'visible visibilitychange restores signaling')
  assert.equal(last(calls.location), true, 'visible visibilitychange restores live location')

  window.handlers.pagehide()
  assert.equal(last(calls.voice), false, 'pagehide explicitly stops voice calls')
  assert.equal(last(calls.location), false, 'pagehide explicitly stops live location')
  assert.equal(last(calls.transport), false, 'pagehide explicitly stops the signaling transport')

  window.handlers.pageshow()
  assert.equal(last(calls.voice), true, 'pageshow restores H5 voice calls')
  assert.equal(last(calls.transport), true, 'pageshow restores signaling')
  assert.equal(last(calls.location), true, 'pageshow restores foreground live location sessions')
}

function testAndroidBackgroundMask() {
  const bitOne = harness({ platform: 'MP', web: false, backgroundMask: 1 })
  bitOne.api.setChatEventsActive(false)
  assert.equal(last(bitOne.calls.voice), true, 'Android background mask bit 1 retains voice calls')
  assert.equal(last(bitOne.calls.location), false, 'Android background mask bit 1 does not retain location')
  assert.equal(last(bitOne.calls.transport), true, 'any Android background mask bit retains transport')

  const bitTwo = harness({ platform: 'MP', web: false, backgroundMask: 2 })
  bitTwo.api.setChatEventsActive(false)
  assert.equal(last(bitTwo.calls.voice), false, 'Android background mask bit 2 does not retain voice calls')
  assert.equal(last(bitTwo.calls.location), true, 'Android background mask bit 2 retains location')
  assert.equal(last(bitTwo.calls.transport), true)
}

testH5Lifecycle()
testAndroidBackgroundMask()
console.log('Chat-events H5 and Android lifecycle tests passed.')
