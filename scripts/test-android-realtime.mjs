import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createChatEventsTransport } from '../src/utils/chat-events-transport.mjs'

function loadAndroidRealtime(context) {
  let source = fs.readFileSync(new URL('../src/utils/android-realtime.js', import.meta.url), 'utf8')
    .replace(/^import \{[\s\S]*?\} from '@\/uni_modules\/ftx-voice-call'\s*$/m, '')
    .replace(/^import .* from .*$/gm, '')
  const conditions = []
  let active = true
  source = source.split(/\r?\n/).filter(line => {
    const directive = line.match(/^\s*\/\/\s*#(ifdef|ifndef)\s+(.+)\s*$/)
    if (directive) {
      const [, kind, expression] = directive
      const enabled = expression.trim().split(/\s+/).some(token => context[token] === true)
      conditions.push({ parent: active, branch: kind === 'ifdef' ? enabled : !enabled })
      active = active && conditions.at(-1).branch
      return false
    }
    if (/^\s*\/\/\s*#endif\s*$/.test(line)) {
      active = conditions.pop().parent
      return false
    }
    return active
  }).join('\n').replace(/\bexport function\b/g, 'function')
  assert.equal(conditions.length, 0, 'preprocessor blocks close')
  source += '\nglobalThis.androidRealtime = { androidRealtimeAvailable, androidBackgroundMask, androidVideoVisible, setAndroidRealtimeForeground, syncAndroidMessagingPreference, connectChatEventsSocket, watchAndroidRealtimeLocation, handleAndroidRealtimeReturn, stopAndroidIncomingAlert, controlAndroidAnsweredCall };'
  vm.createContext(context)
  vm.runInContext(source, context)
  return context.androidRealtime
}

const calls = { opened: [], sent: [], closed: 0, watches: [], clears: [], foreground: [], messaging: [], preferenceWrites: [], toasts: [], stoppedAlerts: [], nativeControls: [], navigation: [], emitted: [], socketEvents: [], locationEvents: [] }
let socketAlive = true, socketSuspended = false, permissionRequest, routeUnderTest = '', pagesUnderTest = []
const context = {
  'APP-PLUS': true,
  plus: { os: { name: 'Android' }, android: { requestPermissions(permissions, success, failure) { permissionRequest = { permissions, success, failure } } } },
  requestRealtimePermissions(permissions) {
    return new Promise((resolve, reject) => context.plus.android.requestPermissions(permissions, resolve, reject))
  },
  BACKGROUND_MESSAGES_KEY: 'chat:background-messages',
  getOrCreatePushInstallationId: () => 'install_android_test_123456',
  readBackgroundMessagesEnabled: () => false,
  writeBackgroundMessagesEnabled: value => { calls.preferenceWrites.push(value); calls.emitted.push(['chat:background-messages-changed', value]) },
  areUiSoundsEnabled: () => false,
  realtimeMessagingPaused: () => false,
  takeIncomingCallAcceptance: () => false,
  controlNativeAnsweredCall: (id, options) => calls.nativeControls.push({ id, options: JSON.parse(options) }),
  stopIncomingCallAlert: id => calls.stoppedAlerts.push(id),
  configureRealtimeMessaging: value => calls.messaging.push(JSON.parse(value)),
  syncNativeRecordingConfiguration() {},
  realtimeAvailable: () => true,
  realtimeSocketAlive: () => socketAlive,
  realtimeSocketSuspended: () => socketSuspended,
  realtimeBackgroundMask: () => 3,
  realtimeVideoVisible: () => true,
  openRealtimeSocket: (url, channel) => calls.opened.push({ url, channel }),
  sendRealtimeSocket: value => calls.sent.push(value),
  closeRealtimeSocket: () => { calls.closed++ },
  setRealtimeForeground: value => calls.foreground.push(value),
  watchRealtimeLocation: channel => { calls.watches.push(channel); return 9 },
  clearRealtimeLocation: id => calls.clears.push(id),
  onRealtimeSocketEvent: callback => { calls.socketEvents.push(callback) },
  onRealtimeLocationEvent: callback => { calls.locationEvents.push(callback) },
  takeRealtimeRoute: () => routeUnderTest,
  getCurrentPages: () => pagesUnderTest,
  uni: { navigateTo: value => calls.navigation.push(value), $emit: (...args) => calls.emitted.push(args),
    showToast: value => calls.toasts.push(value), getStorageSync() { return false }, setStorageSync() {} }
}
context.globalThis = context
const realtime = loadAndroidRealtime(context)

assert.equal(realtime.androidRealtimeAvailable(), true)
assert.equal(realtime.androidBackgroundMask(), 3)
assert.equal(realtime.androidVideoVisible(), true)
realtime.stopAndroidIncomingAlert('incoming-alert-test01')
assert.deepEqual(calls.stoppedAlerts, ['incoming-alert-test01'], 'Android alert-stop wrapper forwards the matching call ID')
realtime.controlAndroidAnsweredCall('native-call-test01', { hangup: true })
assert.deepEqual(calls.nativeControls, [{ id: 'native-call-test01', options: { hangup: true } }], 'native answered-call controls are serialized and forwarded')
realtime.setAndroidRealtimeForeground(false)
assert.deepEqual(calls.foreground, [false])

const socket = realtime.connectChatEventsSocket({ url: 'wss://example.test/ws/chat/events' })
assert.deepEqual(calls.messaging, [{ enabled: false, sound: false, installationId: 'install_android_test_123456' }],
  'native socket applies the persisted background preference, alert setting and installation identity')
const firstSocketChannel = calls.opened[0].channel
let received, closeEvents = 0
socket.onMessage(value => { received = value })
socket.onClose(() => { closeEvents++ })
assert.equal(socket.isAlive(), true)
assert.deepEqual(calls.opened[0], { url: 'wss://example.test/ws/chat/events', channel: firstSocketChannel })
calls.socketEvents[0](JSON.stringify({ channel: firstSocketChannel, event: JSON.stringify({ type: 'message', data: '{"type":"pong"}' }) }))
assert.deepEqual(JSON.parse(JSON.stringify(received)), { data: '{"type":"pong"}' })
socket.send({ data: '{"type":"ping"}' })
assert.deepEqual(calls.sent, ['{"type":"ping"}'])
socket.close()
assert.equal(socket.isAlive(), false)
assert.equal(calls.closed, 1)
calls.socketEvents[0](JSON.stringify({ channel: firstSocketChannel, event: JSON.stringify({ type: 'close', code: 1000 }) }))
assert.equal(closeEvents, 0, 'disposed socket ignores late native events')

const replacementSocket = realtime.connectChatEventsSocket({ url: 'wss://example.test/ws/chat/events' })
const replacementChannel = calls.opened.at(-1).channel
let replacementMessages = 0
replacementSocket.onMessage(() => { replacementMessages++ })
calls.socketEvents.at(-1)(JSON.stringify({ channel: firstSocketChannel,
  event: JSON.stringify({ type: 'message', data: '{"type":"stale"}' }) }))
assert.equal(replacementMessages, 0, 'old socket channel events cannot reach a replacement socket listener')
calls.socketEvents.at(-1)(JSON.stringify({ channel: replacementChannel,
  event: JSON.stringify({ type: 'message', data: '{"type":"current"}' }) }))
assert.equal(replacementMessages, 1, 'replacement socket channel remains active')
calls.socketEvents.at(-1)(JSON.stringify({ channel: replacementChannel,
  event: JSON.stringify({ type: 'status', data: 'SERVICE_UNAVAILABLE' }) }))
assert.deepEqual(calls.preferenceWrites, [false], 'native service failure disables the persisted background preference')
assert.equal(calls.toasts.at(-1).title, '后台接收服务未能启动，已关闭此模式', 'service startup failure informs the user')
assert.ok(calls.emitted.some(args => args[0] === 'chat:background-messages-changed' && args[1] === false),
  'automatic disablement emits the preference change event for settings listeners')
calls.socketEvents.at(-1)(JSON.stringify({ channel: replacementChannel,
  event: JSON.stringify({ type: 'status', data: 'PAUSED' }) }))
assert.deepEqual(calls.preferenceWrites, [false, false], 'native pause also disables the persisted background preference')
assert.equal(calls.toasts.length, 1, 'pause status does not show the startup-failure toast')
replacementSocket.close()

// A suspended native socket owns its reconnect and must survive repeated JS transport ticks.
{
  const scheduled = new Map()
  let timerId = 0
  let clock = Date.now()
  const transport = createChatEventsTransport({
    getToken: () => 'test-token', getBaseUrl: () => 'https://example.test',
    connectSocket: options => realtime.connectChatEventsSocket(options), onEvent() {},
    setTimer(fn) { const timer = { id: ++timerId, fn }; scheduled.set(timer.id, timer); return timer.id },
    clearTimer(id) { scheduled.delete(id) }
  })
  const opensBefore = calls.opened.length, closesBefore = calls.closed
  const realNow = Date.now
  socketAlive = false
  socketSuspended = true
  transport.setActive(true)
  assert.equal(calls.opened.length, opensBefore + 1, 'active transport opens one native socket')
  Date.now = () => clock + 60000
  try {
    scheduled.values().next().value.fn()
    scheduled.values().next().value.fn()
    assert.equal(calls.closed, closesBefore, 'suspended native socket is not closed by JS timeout detection')
    assert.equal(calls.opened.length, opensBefore + 1, 'suspended native reconnect is not duplicated by JS ticks')
  } finally {
    Date.now = realNow
    socketAlive = true
    socketSuspended = false
    transport.setActive(false)
  }
}

// A queued failure belongs to the socket that submitted the frame.
{
  let token = 'first'
  const sockets = []
  const transport = createChatEventsTransport({
    getToken: () => token, getBaseUrl: () => 'https://example.test',
    connectSocket() {
      const peer = {
        onMessage(handler) { this.message = handler },
        onClose() {}, onError() {},
        send(frame) { this.fail = frame.fail },
        close({ code }) { this.closed = code }
      }
      sockets.push(peer)
      return peer
    },
    setTimer: () => 1, clearTimer() {}
  })
  transport.setActive(true)
  sockets[0].message({ data: '{"type":"connected"}' })
  assert.equal(transport.send({ type: 'voice.end' }), true)
  const oldFailure = sockets[0].fail
  token = 'second'
  transport.setActive(true)
  assert.equal(sockets[0].closed, 1000, 'account change closes the socket deliberately')
  sockets[1].message({ data: '{"type":"connected"}' })
  oldFailure()
  assert.equal(sockets[1].closed, undefined, 'late send failure cannot close a new account connection')
  assert.equal(transport.isConnected(), true)
  sockets[1].send = () => { throw new Error('native socket closed') }
  assert.equal(transport.send({ type: 'location.leave' }), false)
  assert.equal(sockets[1].closed, 4101, 'a transport failure requests ring recovery')
  assert.equal(transport.isConnected(), false, 'synchronous failure closes only the affected connection')
  transport.setActive(false)
}

routeUnderTest = '/pages-nonTheme/chat?chatId=42&userId=9'
pagesUnderTest = [{ route: 'pages-nonTheme/chat', options: { chatId: '41', userId: '3' } }]
realtime.handleAndroidRealtimeReturn()
assert.equal(calls.navigation.at(-1).url, '/pages-nonTheme/chat?chatId=42&userId=9',
  'notification route navigates when chat page is open for a different chat and preserves userId')
routeUnderTest = '/pages-nonTheme/voice-call?incomingCallId=incoming_42'
pagesUnderTest = [{ route: 'pages-nonTheme/voice-call', options: { incomingCallId: 'other_call' } }]
realtime.handleAndroidRealtimeReturn()
assert.deepEqual(calls.emitted.at(-1), ['voice-call:notification-opened', 'incoming_42'],
  'notification route signals an already-open voice-call page')
routeUnderTest = ''
pagesUnderTest = []

let lateSuccess = 0, lateFailure = 0
const stopPending = realtime.watchAndroidRealtimeLocation(() => { lateSuccess++ }, () => { lateFailure++ })
assert.ok(permissionRequest.permissions.includes('android.permission.ACCESS_COARSE_LOCATION'))
assert.ok(permissionRequest.permissions.includes('android.permission.ACCESS_FINE_LOCATION'))
stopPending()
permissionRequest.success({ granted: ['android.permission.ACCESS_FINE_LOCATION'] })
await Promise.resolve()
assert.equal(calls.watches.length, 0, 'permission completion after cancellation does not start a native watch')
assert.equal(lateSuccess + lateFailure, 0)

let fixes = [], errors = []
const stopLocation = realtime.watchAndroidRealtimeLocation(value => fixes.push(value), error => errors.push(error))
permissionRequest.success({ granted: ['android.permission.ACCESS_COARSE_LOCATION'] })
await Promise.resolve()
assert.equal(calls.watches.length, 1)
const firstLocationChannel = calls.watches[0]
calls.locationEvents[0](JSON.stringify({ channel: firstLocationChannel,
  event: JSON.stringify({ latitude: 31.23, longitude: 121.47, accuracy: 4 }) }))
assert.deepEqual(JSON.parse(JSON.stringify(fixes)), [{ coords: { latitude: 31.23, longitude: 121.47, accuracy: 4 } }])
stopLocation()
assert.deepEqual(calls.clears, [9])
const replacementFixes = []
const stopReplacementLocation = realtime.watchAndroidRealtimeLocation(value => replacementFixes.push(value), () => {})
permissionRequest.success({ granted: ['android.permission.ACCESS_FINE_LOCATION'] })
await Promise.resolve()
assert.equal(calls.watches.length, 2)
const replacementLocationChannel = calls.watches[1]
calls.locationEvents.at(-1)(JSON.stringify({ channel: firstLocationChannel,
  event: JSON.stringify({ latitude: 1, longitude: 2, accuracy: 1 }) }))
assert.equal(replacementFixes.length, 0, 'old watch channel events cannot reach a replacement location listener')
calls.locationEvents.at(-1)(JSON.stringify({ channel: replacementLocationChannel,
  event: JSON.stringify({ latitude: 31.24, longitude: 121.48, accuracy: 5 }) }))
assert.equal(replacementFixes.length, 1)
stopReplacementLocation()
calls.locationEvents[0](JSON.stringify({ channel: firstLocationChannel,
  event: JSON.stringify({ latitude: 1, longitude: 2, accuracy: 1 }) }))
assert.equal(fixes.length, 1, 'native location events after stop are ignored')

let denied
realtime.watchAndroidRealtimeLocation(() => {}, error => { denied = error })
permissionRequest.success({ granted: [] })
await Promise.resolve()
assert.equal(denied.code, 1, 'permission denial is reported to the tracker')
assert.equal(calls.watches.length, 2, 'permission denial does not start a native watch')

let requestFailure
realtime.watchAndroidRealtimeLocation(() => {}, error => { requestFailure = error })
permissionRequest.failure(new Error('denied'))
await Promise.resolve()
assert.equal(requestFailure.code, 1, 'permission request failure is reported')

const nativeFile = name => fs.readFileSync(new URL(`../src/uni_modules/ftx-voice-call/utssdk/app-android/${name}`, import.meta.url), 'utf8')
const nativeManifest = nativeFile('AndroidManifest.xml')
const nativeBridge = nativeFile('VoiceCallBridge.kt')
const nativeView = nativeFile('VideoCallView.kt')
const nativeScreenAudio = nativeFile('CallScreenAudio.kt')
assert.match(nativeManifest, /android\.permission\.FOREGROUND_SERVICE_MEDIA_PROJECTION/)
assert.match(nativeManifest, /ScreenShareService"[^>]+android:foregroundServiceType="mediaProjection"/)
assert.match(nativeBridge, /if \(!expectsScreenShare\(id, request\)\) return@execute[\s\S]*?s\.screenConsent = consent/,
  'a permission result cannot start projection after the matching call request ends')
assert.match(nativeBridge, /s\.closed = true[\s\S]*?stopScreenShare\(s, ending = true\)[\s\S]*?dispose\(s\)/,
  'hangup clears projection before disposing the peer connection')
assert.match(nativeBridge, /setTrack\(if \(ending\) null else s\.videoTrack, false\)[\s\S]*?if \(s\.cameraEnabled\)/,
  'the existing camera track is restored and only a previously active camera is restarted')
assert.match(nativeView, /remoteCameraEnabled \|\| remoteScreenSharing/)
assert.match(nativeView, /showSelfInMain get\(\) = localVideo && !remoteScreenSharing/)
assert.match(nativeView, /fit\(mainRenderer, mainFrameWidth, mainFrameHeight, root\.width, root\.height, Gravity\.CENTER\)/,
  'remote screen is the main frame and uses the original aspect ratio')
assert.match(nativeFile('VideoCallActivity.kt'), /MediaProjectionConfig\.createConfigForDefaultDisplay\(\)/,
  'Android 14 requests whole-display consent to match the device-wide audio capture')
assert.match(nativeScreenAudio, /addMatchingUsage\(AudioAttributes\.USAGE_MEDIA\)\.addMatchingUsage\(AudioAttributes\.USAGE_GAME\)[\s\S]*?excludeUid\(Process\.myUid\(\)\)/,
  'shared playback excludes the call app and communication or notification usages')
assert.match(nativeBridge, /setMicrophoneMute\(s\.muted\)[\s\S]*?s\.track\?\.setEnabled\(!s\.muted \|\| s\.screenAudio != null\)/,
  'microphone mute stays in ADM while playback can continue on the same sender')
assert.match(nativeBridge, /s\.screenSharing = false\s+stopScreenAudio\(s\)[\s\S]*?s\.screenCapture\?\.close\(\)/,
  'screen stop releases playback capture before the projection')

const nativeOutgoingPreview = nativeFile('OutgoingVideoPreview.kt')
assert.match(nativeOutgoingPreview, /requested !== request/, 'a cancelled mount cannot open the camera late')
assert.match(nativeOutgoingPreview, /onActivityPaused\(host: Activity\) \{ if \(host === activity\) close\(\) \}/,
  'the outgoing preview stops when its host goes to the background')
assert.match(nativeOutgoingPreview, /preview\.close\(\)\.get\(1500, TimeUnit\.MILLISECONDS\)/,
  'the call camera waits for local preview release')
assert.match(nativeBridge, /OutgoingVideoPreview\.releaseBeforePeer\(\)[\s\S]*?s\.cameraEnabled = previewReleased/,
  'if preview release cannot be confirmed, connect without opening a competing camera')
assert.doesNotMatch(nativeOutgoingPreview, /PeerConnection|VideoTrack|\.send\(/, 'waiting preview owns no network transport')

console.log('PASS Android realtime lifecycle, outgoing video preview, location callbacks and screen sharing wiring including playback audio')
