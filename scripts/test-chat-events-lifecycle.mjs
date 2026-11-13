import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { stripWebCallTicket } from '../src/utils/web-call-entry.mjs'

const sourcePath = fileURLToPath(new URL('../src/utils/chat-events.js', import.meta.url))
const source = fs.readFileSync(sourcePath, 'utf8')
const require = createRequire(import.meta.url)

function preprocess(input, platform) {
  const output = [], stack = []
  let include = true
  for (const line of input.split(/\r?\n/)) {
    const match = line.match(/^\s*\/\/\s*#(ifdef|ifndef|else|endif)\s*(.*)$/)
    if (!match) { if (include) output.push(line); continue }
    const [, directive, expression] = match
    if (directive === 'ifdef' || directive === 'ifndef') {
      const selected = expression.trim() === platform
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
    mask: [], videoVisible: 0, androidReturn: 0, listeners: {}, uniEvents: [], lifecycle: [], visible: [], notifications: [], bus: [], miniAlerts: [], messages: [] }
  let permissionPending = false
  let eventHandlers = null
  const transport = {
    setActive(value) { calls.transport.push(value) }, isConnected: () => false,
    send: () => true
  }
  const context = {
    console, Promise, Map, Set, String, JSON, Error, encodeURIComponent,
    baseUrl: 'https://example.test',
    webCallsAvailable: () => web, refreshWebCallAlert: () => calls.refresh++,
    syncChatPush() {},
    messageBus: { emit(name, event) { calls.bus.push([name, event]) } }, triggerMessageNotification: async (message, options) => calls.messages.push({ message, options }),
    realtimeActivityCard: () => null,
    initChatNotificationNavigation() {}, showNotification() {}, userNotificationUrl: () => '',
    createNotificationCatchup: () => ({ setActive(value) { calls.catchup.push(value) }, check: async () => {}, seen: () => true }),
    receiveChatFeedback: async () => {}, setChatFeedbackActive(value) { calls.feedback.push(value) },
    voiceCalls: { setActive(value) { calls.voice.push(value) }, handle() {}, connection() {} },
    installVoiceCallSender() {},
    liveLocationState: { offers: {} }, liveLocations: {
      setActive(value) { calls.location.push(value); calls.lifecycle.push('location-active') },
      setVisible(value) { calls.visible.push(value) }, handle(event) {
        if (event.type === 'location.offer') this.state.offers[String(event.from.id)] = { sessionId: event.sessionId }
      }, connection() {}, state: null
    },
    installLiveLocationSender() {},
    createChatEventsTransport: handlers => { eventHandlers = handlers; return transport },
    connectChatEventsSocket() {}, androidBackgroundMask: () => { calls.mask.push(true); return backgroundMask },
    androidVideoVisible: () => { calls.videoVisible++; return false },
    realtimePermissionPending: () => permissionPending,
    webLocationAvailable: () => platform === 'H5' && web,
    miniLocationAvailable: () => false,
    miniIncomingCalls: { handle: () => false, foreground(value) { calls.miniAlerts.push(value) } }, installMiniIncomingSender() {},
    setAndroidRealtimeForeground(value) { calls.foreground.push(value); calls.lifecycle.push('native-foreground') },
    handleAndroidRealtimeReturn() { calls.androidReturn++ }, syncAndroidMessagingPreference() {},
    uni: { getStorageSync: key => key === 'token' ? 'test-token' : key === 'userInfo' ? { id: 2 } : '', setStorageSync() {}, request() {}, navigateTo() {}, $on(name, callback) { calls.uniEvents.push([name, callback]) } },
    showNotification: notification => calls.notifications.push(notification)
  }
  context.liveLocations.state = context.liveLocationState
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
  vm.runInContext(`${compiled}\nglobalThis.__chatEvents = { setChatEventsActive, delegateMiniCallAlerts, isChatEventsConnected, setActiveChatConversation }`, context, { filename: sourcePath })
  return { api: context.__chatEvents, calls, handlers: eventHandlers, setPermissionPending: value => { permissionPending = value }, ...context.__surfaces }
}

function last(values) { return values.at(-1) }

function testH5Lifecycle() {
  const bfcache = harness({ platform: 'H5', web: true })
  bfcache.api.setChatEventsActive(true)
  const locationCallsBeforeBfcacheHide = bfcache.calls.location.length
  bfcache.window.handlers.pagehide({ persisted: true })
  assert.equal(bfcache.calls.location.length, locationCallsBeforeBfcacheHide,
    'BFCache pagehide preserves the live-location session')
  assert.equal(last(bfcache.calls.visible), false, 'BFCache pagehide pauses location visibility for restoration')

  const { api, calls, document, window } = harness({ platform: 'H5', web: true })
  api.setChatEventsActive(false)
  assert.equal(last(calls.voice), true, 'H5 background retains voice calls for browser incoming calls')
  assert.equal(last(calls.transport), true, 'H5 background retains the existing signaling transport')
  assert.equal(last(calls.location), true, 'H5 background retains live location sessions')
  assert.equal(last(calls.foreground), false)

  document.hidden = true
  document.handlers.visibilitychange()
  assert.equal(last(calls.visible), false, 'hidden visibility pauses live location tracking')
  assert.equal(last(calls.voice), true, 'hidden visibility state retains H5 voice calls')
  assert.equal(last(calls.transport), true, 'hidden visibility state retains H5 signaling')
  assert.equal(last(calls.location), true)
  assert.equal(calls.refresh, 1, 'visibility changes refresh the active web call alert')

  document.hidden = false
  document.handlers.visibilitychange()
  assert.equal(last(calls.visible), true, 'visible visibility resumes live location tracking')
  assert.equal(last(calls.voice), true, 'visible visibilitychange restores voice calls')
  assert.equal(last(calls.transport), true, 'visible visibilitychange restores signaling')
  assert.equal(last(calls.location), true, 'visible visibilitychange restores live location')

  const permission = harness({ platform: 'H5', web: false })
  permission.setPermissionPending(true)
  permission.api.setChatEventsActive(false)
  assert.equal(last(permission.calls.foreground), true, 'permission prompt temporarily retains foreground lifecycle')
  assert.equal(last(permission.calls.location), true, 'permission prompt does not end location sharing')
  assert.equal(last(permission.calls.transport), true, 'permission prompt does not close the signaling socket')
  permission.setPermissionPending(false)
  permission.calls.uniEvents.find(([name]) => name === 'realtime:permission-changed')[1]()
  assert.equal(last(permission.calls.location), false, 'permission completion releases the temporary foreground hold')

  window.handlers.pagehide()
  assert.equal(last(calls.voice), false, 'pagehide explicitly stops voice calls')
  assert.equal(last(calls.location), false, 'pagehide explicitly stops live location')
  assert.equal(last(calls.transport), false, 'pagehide explicitly stops the signaling transport')

  window.handlers.pageshow()
  assert.equal(last(calls.visible), true, 'pageshow restores foreground live location tracking')
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
  assert.ok(bitTwo.calls.lifecycle.indexOf('native-foreground') < bitTwo.calls.lifecycle.indexOf('location-active'),
    'native foreground state is updated before location capability can be announced')
}

function testDelegatedWebCallLifecycle() {
  const foreground = harness({ platform: 'MP-WEIXIN', web: false })
  foreground.api.setChatEventsActive(true)
  const release = foreground.api.delegateMiniCallAlerts()
  assert.equal(last(foreground.calls.miniAlerts), false, 'delegating the web-call page pauses only the native call alerts')
  assert.equal(last(foreground.calls.transport), true, 'native chat and location keep the outer socket')
  assert.equal(last(foreground.calls.visible), true, 'delegation does not pause native location tracking')
  foreground.api.setChatEventsActive(true)
  assert.equal(last(foreground.calls.miniAlerts), false, 'App onShow cannot reactivate native alerts while delegated')
  const releaseSecond = foreground.api.delegateMiniCallAlerts()
  release()
  release()
  assert.equal(last(foreground.calls.miniAlerts), false, 'another live WebView still owns alerts after the first releases')
  releaseSecond()
  assert.equal(last(foreground.calls.miniAlerts), true, 'releasing delegation restores native call alerts')

  const background = harness({ platform: 'MP-WEIXIN', web: false })
  background.api.setChatEventsActive(false)
  const releaseBackground = background.api.delegateMiniCallAlerts()
  assert.equal(last(background.calls.transport), false)
  releaseBackground()
  assert.equal(last(background.calls.transport), false, 'releasing delegation while backgrounded keeps the socket closed')
}

function testActivityMessageVersionKeepsSingleLocationNotification() {
  const current = harness({ platform: 'H5', web: true })
  current.api.setChatEventsActive(true)
  current.handlers.onConnected({ activityMessagesVersion: 1 })
  const offer = { type: 'location.offer', from: { id: 9, name: 'Peer' }, sessionId: 'session_1234567890' }
  current.handlers.onEvent(offer)
  assert.equal(current.calls.notifications.length, 0, 'server activity cards suppress the legacy location.offer toast')
  const changed = { type: 'chat.changed', kind: 'message', conversationId: '9', message: { id: 101, senderId: 9, type: 'others' } }
  current.handlers.onEvent(changed)
  assert.ok(current.calls.bus.some(([name, event]) => name === 'chat.changed' && event === changed),
    'new activity messages continue through the existing chat.changed notification')

  const legacy = harness({ platform: 'H5', web: true })
  legacy.api.setChatEventsActive(true)
  legacy.handlers.onConnected({ activityMessagesVersion: 0 })
  legacy.handlers.onEvent(offer)
  assert.equal(legacy.calls.notifications.length, 1, 'older servers retain the location offer toast fallback')
  assert.match(legacy.calls.notifications[0].content, /点击进入/)

  const fallback = harness({ platform: 'H5', web: true })
  fallback.api.setChatEventsActive(true)
  fallback.handlers.onConnected({ activityMessagesVersion: 1 })
  const recovered = { ...offer, sessionId: 'session_fallback_1234', messageFallback: true }
  fallback.handlers.onEvent(recovered)
  fallback.handlers.onEvent(recovered)
  assert.equal(fallback.calls.notifications.length, 1,
    'messageFallback bypasses new-server activity suppression but seen session id prevents replay duplicates')

  const inConversation = harness({ platform: 'H5', web: true })
  inConversation.api.setChatEventsActive(true)
  inConversation.handlers.onConnected({ activityMessagesVersion: 1 })
  inConversation.api.setActiveChatConversation('9')
  inConversation.handlers.onEvent({ ...recovered, sessionId: 'session_current_1234' })
  assert.equal(inConversation.calls.notifications.length, 0, 'fallback does not toast for the open conversation')
}

function testWebviewCompilation() {
  const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
  const source = fs.readFileSync(fileURLToPath(new URL('../src/pages-nonTheme/webview.vue', import.meta.url)), 'utf8')
  const parsed = parse(source, { filename: 'src/pages-nonTheme/webview.vue' })
  assert.equal(parsed.errors.length, 0, 'webview SFC parses')
  for (const [platform, context] of [['H5', { H5: true }], ['MP-WEIXIN', { MP: true, MP_WEIXIN: true }]]) {
    const scriptSetup = parsed.descriptor.scriptSetup
    const script = preprocess(scriptSetup.content, context, { type: 'js' })
    const compiledScript = compileScript({ ...parsed.descriptor, scriptSetup: { ...scriptSetup, content: script } }, { id: `webview-${platform}` })
    assert.ok(compiledScript.content.length > 0, `webview script compiles for ${platform}`)
    const template = preprocess(parsed.descriptor.template.content, context, { type: 'html' })
    const compiledTemplate = compileTemplate({ source: template, filename: 'webview.vue', id: `webview-${platform}` })
    assert.deepEqual(compiledTemplate.errors, [], `webview template compiles for ${platform}`)
  }
}

async function testWebviewRetry() {
  const { preprocess: preprocessUni } = require('@dcloudio/uni-cli-shared/lib/preprocess')
  const source = fs.readFileSync(new URL('../src/pages-nonTheme/webview.vue', import.meta.url), 'utf8')
  const script = preprocessUni(parse(source).descriptor.scriptSetup.content, { MP: true, MP_WEIXIN: true }, { type: 'js' })
    .replace(/^import .* from .*$/gm, '')
  const baseUrl = 'https://example.test'
  const oldTicket = 'a'.repeat(64)
  const newTicket = 'b'.repeat(64)
  let activeLeases = 0
  let resolveTicket
  const context = vm.createContext({
    baseUrl, stripWebCallTicket, ref: value => ({ value }), computed: getter => ({ get value() { return getter() } }),
    onMounted() {}, onBeforeUnmount() {}, setTimeout: () => 1, clearTimeout() {},
    uni: { getStorageSync: () => 'account' },
    delegateMiniCallAlerts() { activeLeases++; return () => { activeLeases-- } },
    requestWebCallTicket: () => new Promise(resolve => { resolveTicket = resolve })
  })
  const page = vm.runInContext(`${script}\n;({
    open(value) { src.value = value; standaloneWebview = callWebview.value = true; beginContentLoad() },
    onLoad, onLoadError, retryLoad, get url() { return src.value }, get key() { return webviewKey.value },
    get fallback() { return showCallFallback.value }
  })`, context)
  const entry = `${baseUrl}/web/call/index.html#?peerId=7&ticket=${oldTicket}&nativeChat=1`
  page.open(entry)
  assert.equal(activeLeases, 1)
  page.onLoad({ detail: { src: stripWebCallTicket(entry) } })
  assert.equal(page.fallback, false, 'removing the ticket leaves the call page loaded')
  page.onLoad({ detail: { src: `${baseUrl}/error.html` } })
  assert.equal(page.fallback, true, 'a same-origin error page triggers the native fallback')
  assert.equal(activeLeases, 0)
  const retry = page.retryLoad()
  resolveTicket(newTicket)
  await retry
  assert.equal(page.url, `${baseUrl}/web/call/index.html#?peerId=7&nativeChat=1&ticket=${newTicket}`)
  assert.equal(page.key, 1)
  assert.equal(activeLeases, 1)
  page.onLoadError()
  const recovered = page.retryLoad()
  page.onLoad()
  assert.equal(page.fallback, true, 'a late load event does not hide the fallback while requesting a new ticket')
  resolveTicket(oldTicket)
  await recovered
  assert.equal(page.key, 2)
  assert.equal(activeLeases, 1)
}

for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const h = harness({ platform, web: platform === 'H5' })
  h.api.setChatEventsActive(true)
  const sender = { id: 9, nickname: '小明', avatar: '/static/avatars/9.webp' }
  h.handlers.onEvent({ type: 'chat.changed', kind: 'message', conversationId: '9', title: '备注名', sender,
    message: { id: 9001, senderId: 9, type: 'text', content: '你好' } })
  assert.equal(h.calls.messages.at(-1).message.senderAvatar, sender.avatar)
  assert.equal(h.calls.messages.at(-1).message.senderName, '备注名')
  h.handlers.onEvent({ type: 'chat.changed', kind: 'message', conversationId: 'group:5', groupId: 5, title: '测试群', sender,
    message: { id: 9002, senderId: 9, type: 'image', content: '{}' } })
  assert.equal(h.calls.messages.at(-1).message.senderLabel, '小明')
  assert.equal(h.calls.messages.at(-1).message.senderName, '测试群')
  h.api.setActiveChatConversation('9')
  h.handlers.onEvent({ type: 'chat.changed', kind: 'message', conversationId: '9', sender,
    message: { id: 9003, senderId: 9, type: 'text', content: '当前聊天' } })
  assert.equal(h.calls.messages.at(-1).options.showNotification, false)
  const count = h.calls.messages.length
  h.handlers.onEvent({ type: 'chat.changed', kind: 'message', conversationId: '9', muted: true, sender,
    message: { id: 9004, senderId: 9, type: 'text', content: '免打扰' } })
  assert.equal(h.calls.messages.length, count)
}

testH5Lifecycle()
testAndroidBackgroundMask()
testDelegatedWebCallLifecycle()
testActivityMessageVersionKeepsSingleLocationNotification()
testWebviewCompilation()
await testWebviewRetry()
console.log('Chat-events H5, Android, delegated web-call, activity message compatibility, and webview compilation tests passed.')
