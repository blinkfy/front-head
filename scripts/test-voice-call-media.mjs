import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'src/utils/voice-call-media.js')
const source = fs.readFileSync(sourcePath, 'utf8')

function preprocessAppPlus(input) {
  const output = []
  const conditions = []
  let include = true
  for (const line of input.split(/\r?\n/)) {
    const directive = line.match(/^\s*\/\/\s*#(ifdef|ifndef|if|else|endif)\s*(.*)$/)
    if (!directive) { if (include) output.push(line); continue }
    const [, command, expression] = directive
    if (command === 'ifdef' || command === 'ifndef' || command === 'if') {
      const hasApp = expression.includes('APP-PLUS')
      const hasH5 = expression.includes('H5')
      let condition = hasApp && !hasH5
      if (command === 'ifndef') condition = !condition
      conditions.push({ parent: include, condition, alternate: false })
      include = include && condition
    } else if (command === 'else') {
      const current = conditions.at(-1)
      current.alternate = true
      include = current.parent && !current.condition
    } else if (command === 'endif') {
      const current = conditions.pop()
      include = current.parent
    }
  }
  return output.join('\n').replace(/^import .*$/gm, '').replace(/^export const voiceCallMedia =/m, 'const voiceCallMedia =') +
    '\nglobalThis.__voiceCallMedia = voiceCallMedia;'
}

const listenerRegistrations = [], opens = [], signals = [], controls = [], closes = [], permissionRequests = [], featureRequests = [], timers = new Map()
const previewEvents = []
let nextTimer = 0
let videoAvailable = true
let nativeRealtime = true
let permissionGrants = ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA']
const context = {
  plus: {
    os: { name: 'Android' },
    android: { requestPermissions(permissions, success) { permissionRequests.push([...permissions]); success({ granted: permissionGrants }) } }
  },
  requestRealtimePermissions(permissions) {
    return new Promise((resolve, reject) => context.plus.android.requestPermissions(permissions, resolve, reject))
  },
  ensureFeaturePermission(kind, { isCurrent = () => true } = {}) {
    featureRequests.push(kind)
    const permission = { microphone: 'android.permission.RECORD_AUDIO', camera: 'android.permission.CAMERA' }[kind]
    return Promise.resolve(isCurrent() && permissionGrants.includes(permission))
  },
  isPermissionDenied: error => error?.code === 'permission_denied',
  openFeaturePermissionSettings: async () => false,
  voiceRtcAvailable: () => true,
  androidRealtimeAvailable: () => nativeRealtime,
  videoRtcAvailable: () => videoAvailable,
  screenShareRtcAvailable: () => true,
  onVoicePeerEvent(...args) { listenerRegistrations.push(args) },
  openVoicePeer(...args) { opens.push(args); previewEvents.push(['peer', JSON.parse(args[0]).callId]) },
  signalVoicePeer(...args) { signals.push(args) },
  controlVoicePeer(...args) { controls.push(args) },
  closeVoicePeer(...args) { closes.push(args) },
  showOutgoingVideoPreview(options, onCancel) { previewEvents.push(['preview', JSON.parse(options), onCancel]); return true },
  closeOutgoingVideoPreview(callId) { previewEvents.push(['close-preview', callId]) },
  setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id },
  clearTimeout(id) { timers.delete(id) },
  Promise, Map, Set, Error, Object, JSON, String, Array, console
}
vm.runInNewContext(preprocessAppPlus(source), context, { filename: sourcePath })
const media = context.__voiceCallMedia
const tick = () => new Promise(resolve => setImmediate(resolve))
const require = createRequire(import.meta.url)

async function testWebMedia() {
  const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
  const webSource = preprocess(source, { H5: true }, 'js')
    .replace(/^import .*$/gm, '').replace(/^export const voiceCallMedia =/m, 'globalThis.media =')
  let streamRequests, resumeCamera, displayRequests
  class Stream {
    constructor(tracks = []) { this.tracks = tracks }
    getTracks() { return [...this.tracks] }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
    addTrack(track) { this.tracks.push(track) }
    removeTrack(track) { this.tracks = this.tracks.filter(item => item !== track) }
  }
  const track = (kind, id) => ({
    kind, id, enabled: true, readyState: 'live', stop() { this.readyState = 'ended' },
    addEventListener(type, callback) { this[type] = callback },
    removeEventListener(type, callback) { if (this[type] === callback) delete this[type] }
  })
  const mic = track('audio', 'mic'), camera = track('video', 'cam')
  const elements = []
  const audioContexts = []
  const offeredSender = { track: null, async replaceTrack(value) { this.track = value } }
  let peer
  const context = {
    isSecureContext: true,
    navigator: { mediaDevices: { getUserMedia: constraints => streamRequests(constraints),
      getDisplayMedia: constraints => displayRequests(constraints) } },
    MediaStream: Stream,
    AudioContext: class {
      constructor() { this.inputs = []; audioContexts.push(this) }
      async resume() { this.state = 'running' }
      async close() { this.state = 'closed' }
      createMediaStreamSource(stream) { this.inputs.push(stream.getAudioTracks()[0]); return { connect() {} } }
      createMediaStreamDestination() { return { stream: new Stream([track('audio', 'mixed')]) } }
      createGain() { return { gain: {}, connect() {} } }
    },
    RTCPeerConnection: class {
      constructor() { peer = this; this.added = [] }
      addTrack(value) {
        this.added.push(value)
        return this.audioSender = { track: value, async replaceTrack(next) { this.track = next } }
      }
      async setRemoteDescription() {}
      getTransceivers() { return [{ mid: '1', receiver: { track: camera }, sender: offeredSender }] }
      async createAnswer() { return { sdp: 'answer' } }
      async setLocalDescription(value) { this.localDescription = value }
      close() { this.closed = true }
    },
    document: {
      body: { appendChild(element) { element.parentNode = this } },
      getElementById() { return null },
      createElement(tag) {
        const element = { tag, dataset: {}, style: {}, setAttribute() {}, async play() {}, remove() { this.parentNode = null } }
        elements.push(element)
        return element
      }
    }
  }
  vm.runInNewContext(webSource, context, { filename: sourcePath })
  const { media } = context
  streamRequests = ({ audio }) => audio ? Promise.resolve(new Stream([mic])) : new Promise(resolve => { resumeCamera = resolve })
  const permission = media.permission('pending-web-video', 'video')
  const cancelled = assert.rejects(permission, error => error?.code === 'permission_denied')
  await tick()
  media.cancel('pending-web-video')
  assert.equal(mic.readyState, 'ended', 'hangup releases granted microphone while camera prompt is pending')
  resumeCamera(new Stream([camera]))
  await cancelled
  assert.equal(camera.readyState, 'ended', 'late camera authorization releases the newly acquired stream')

  const mic2 = track('audio', 'mic2'), camera2 = track('video', 'cam2')
  let captures = 0
  streamRequests = async ({ audio }) => { captures++; return new Stream([audio ? mic2 : camera2]) }
  const events = []
  const previewHost = { appendChild(element) { element.parentNode = this } }
  context.document.getElementById = () => previewHost
  await media.prepareOutgoing('web-video-answer', 'video')
  assert.equal(await media.prepareOutgoingPreview('web-video-answer', { name: 'Peer' }, {
    isCurrent: () => true, onUnavailable() {}
  }), true)
  media.mountVideo('web-video-answer')
  const waitingVideo = elements.find(element => element.dataset.callVideo === 'local')
  assert.equal(peer, undefined, 'waiting preview does not open a WebRTC peer')
  assert.equal(waitingVideo.parentNode, previewHost)
  assert.deepEqual(waitingVideo.srcObject.getTracks(), [camera2], 'waiting preview contains no microphone track')
  const driver = await media.open(options('web-video-answer', events, 'video'))
  assert.deepEqual(peer.added, [mic2], 'answerer waits for the offered video transceiver')
  driver.signal({ type: 'offer', sdp: 'offer' })
  await tick()
  assert.equal(offeredSender.track, camera2, 'answer attaches the already-granted camera to the offered video channel')
  assert.equal(captures, 2, 'answer does not reacquire the camera')
  assert.ok(events.some(event => event.type === 'answer'))
  peer.iceConnectionState = 'completed'
  peer.oniceconnectionstatechange()
  assert.ok(events.some(event => event.type === 'state' && event.state === 'connected'))
  const audio = elements.find(element => element.tag === 'audio')
  const remoteVideo = elements.find(element => element.dataset.callVideo === 'remote')
  const localVideo = elements.find(element => element.dataset.callVideo === 'local')
  assert.equal(localVideo, waitingVideo, 'acceptance reuses the local preview element and camera')
  const remoteMic = track('audio', 'remote-mic'), remoteCam = track('video', 'remote-cam')
  peer.ontrack({ track: remoteMic })
  peer.ontrack({ track: remoteCam })
  media.unmountVideo('web-video-answer')
  assert.deepEqual(audio.srcObject.getTracks(), [remoteMic], 'moving the video never moves or detaches the audio stream')
  assert.deepEqual(remoteVideo.srcObject.getTracks(), [remoteCam])
  assert.equal(audio.parentNode, context.document.body)

  assert.equal(media.supportsScreenShare(), true)
  const screen = track('video', 'display')
  screen.getSettings = () => ({ displaySurface: 'browser' })
  const playback = track('audio', 'display-audio')
  let picked = 0
  displayRequests = async ({ audio, systemAudio, selfBrowserSurface }) => {
    assert.equal(audio, true)
    assert.equal(systemAudio, 'exclude', 'system loopback requires own-call audio exclusion')
    assert.equal(selfBrowserSurface, 'exclude')
    picked++
    return new Stream([screen, playback])
  }
  driver.control({ screenSharing: true })
  assert.equal(picked, 0, 'sharing requires peer support')
  driver.control({ screenShareSupported: true, screenSharing: true })
  assert.equal(picked, 1, 'screen picker starts in the same user activation')
  await tick()
  assert.equal(offeredSender.track, screen)
  assert.deepEqual(localVideo.srcObject.getVideoTracks(), [screen])
  assert.equal(localVideo.style.transform, '')
  assert.equal(camera2.enabled, false, 'camera is paused while sharing')
  assert.equal(mic2.enabled, true, 'screen sharing does not change the microphone')
  const mixed = peer.audioSender.track
  assert.equal(mixed.id, 'mixed', 'display audio reuses the negotiated audio sender')
  assert.deepEqual(audioContexts[0].inputs, [mic2, playback], 'mixes local inputs only')
  assert.equal(events.findLast(event => event.type === 'screen_audio').screenAudioSharing, true)
  driver.control({ muted: true })
  assert.equal(mic2.enabled, false, 'microphone mute stays independent')
  assert.equal(playback.enabled, true)
  assert.equal(mixed.enabled, true)
  assert.equal(events.filter(event => event.type === 'screen').at(-1).screenSharing, true)
  driver.control({ cameraEnabled: false, switchCamera: true })
  assert.equal(offeredSender.track, screen, 'camera controls cannot replace the shared track')
  screen.stop(); screen.ended()
  await tick()
  assert.equal(offeredSender.track, camera2, 'browser stop restores the same camera')
  assert.equal(camera2.enabled, true)
  assert.equal(peer.audioSender.track, mic2, 'stopping sharing restores the original microphone sender')
  assert.equal(mic2.enabled, false, 'restoration preserves mute')
  assert.equal(mixed.readyState, 'ended')
  assert.equal(playback.readyState, 'ended')
  assert.equal(audioContexts[0].state, 'closed')
  assert.equal(events.findLast(event => event.type === 'screen_audio').screenAudioSharing, false)
  assert.equal(localVideo.style.transform, 'scaleX(-1)')
  assert.equal(events.filter(event => event.type === 'screen').at(-1).screenSharing, false)
  assert.equal(captures, 2, 'stop does not reacquire a usable camera')

  camera2.getSettings = () => ({ deviceId: 'usb-camera' })
  const recoveredCamera = track('video', 'recovered-camera')
  streamRequests = async ({ video }) => {
    assert.equal(video.deviceId.exact, 'usb-camera', 'camera restore asks for the previously selected device')
    captures++
    return new Stream([recoveredCamera])
  }
  displayRequests = async () => new Stream([track('video', 'camera-recovery-display')])
  driver.control({ screenSharing: true })
  await tick()
  camera2.stop()
  driver.control({ screenSharing: false })
  await tick()
  assert.equal(offeredSender.track, recoveredCamera)
  assert.equal(captures, 3)

  driver.control({ cameraEnabled: false })
  await tick()
  const secondScreen = track('video', 'display2')
  secondScreen.getSettings = () => ({ displaySurface: 'monitor' })
  const unsafePlayback = track('audio', 'unsafe-loopback')
  displayRequests = async () => new Stream([secondScreen, unsafePlayback])
  driver.control({ screenSharing: true })
  await tick()
  assert.equal(offeredSender.track, secondScreen, 'unsafe audio falls back to sharing the picture')
  assert.equal(unsafePlayback.readyState, 'ended')
  assert.equal(peer.audioSender.track, mic2)
  driver.control({ screenSharing: false })
  await tick()
  assert.equal(secondScreen.readyState, 'ended')
  assert.equal(offeredSender.track, null, 'camera-off calls stay camera-off after sharing')
  assert.equal(captures, 3)

  context.navigator.mediaDevices.getSupportedConstraints = () => ({ restrictOwnAudio: true })
  const monitor = track('video', 'safe-monitor')
  monitor.getSettings = () => ({ displaySurface: 'monitor' })
  const safePlayback = track('audio', 'safe-loopback')
  safePlayback.getSettings = () => ({ restrictOwnAudio: true })
  displayRequests = async ({ audio, systemAudio }) => {
    assert.equal(audio.restrictOwnAudio, true)
    assert.equal(systemAudio, 'include')
    return new Stream([monitor, safePlayback])
  }
  driver.control({ screenSharing: true })
  await tick()
  assert.equal(peer.audioSender.track.id, 'mixed')
  safePlayback.stop(); safePlayback.ended()
  await tick()
  assert.equal(peer.audioSender.track, mic2, 'the picker can end only the captured audio')
  assert.equal(offeredSender.track, monitor, 'audio loss does not stop screen video')
  driver.control({ screenSharing: false })
  await tick()

  let restoreMicrophone
  peer.audioSender.replaceTrack = async function (next) {
    if (next === mic2 && !restoreMicrophone) await new Promise(resolve => { restoreMicrophone = resolve })
    this.track = next
  }
  displayRequests = async () => {
    const tab = track('video', 'rapid-tab')
    tab.getSettings = () => ({ displaySurface: 'browser' })
    return new Stream([tab, track('audio', 'rapid-tab-audio')])
  }
  driver.control({ screenSharing: true }); await tick()
  driver.control({ screenSharing: false }); await tick()
  assert.equal(typeof restoreMicrophone, 'function')
  driver.control({ screenSharing: true }); await tick()
  restoreMicrophone(); await tick()
  assert.equal(audioContexts.at(-1).inputs[0], mic2, 'rapid restart mixes the original microphone, even while its restoration was pending')
  driver.control({ screenSharing: false }); await tick()
  assert.equal(peer.audioSender.track, mic2)

  const interrupted = track('video', 'interrupted-display')
  const screenEvents = events.filter(event => event.type === 'screen').length
  let installScreen
  offeredSender.replaceTrack = async value => {
    if (value === interrupted) await new Promise(resolve => { installScreen = resolve })
    offeredSender.track = value
  }
  displayRequests = async () => new Stream([interrupted])
  driver.control({ screenSharing: true })
  await tick()
  driver.control({ screenSharing: false })
  assert.equal(interrupted.readyState, 'ended', 'stop releases display immediately during a pending sender replacement')
  installScreen()
  await tick()
  assert.equal(offeredSender.track, null)
  assert.equal(events.filter(event => event.type === 'screen').length, screenEvents, 'a cancelled swap never publishes sharing')

  displayRequests = async () => { throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }) }
  driver.control({ screenSharing: true })
  await tick()
  assert.equal(events.findLast(event => event.type === 'screen_error').reason, 'screen_cancelled')
  assert.equal(events.findLast(event => event.type === 'screen_pending').screenSharingPending, false)

  let pickDisplay
  displayRequests = () => new Promise(resolve => { pickDisplay = resolve })
  driver.control({ screenSharing: true })
  driver.close()
  const lateScreen = track('video', 'late-display')
  pickDisplay(new Stream([lateScreen]))
  await tick()
  assert.equal(lateScreen.readyState, 'ended', 'hangup releases a late display picker result')
  assert.equal(peer.closed, true)
  assert.equal(audio.parentNode, null)

  const cancelledMic = track('audio', 'waiting-mic'), cancelledCam = track('video', 'waiting-camera')
  streamRequests = async ({ audio }) => new Stream([audio ? cancelledMic : cancelledCam])
  await media.prepareOutgoing('cancelled-preview', 'video')
  await media.prepareOutgoingPreview('cancelled-preview', { name: 'Peer' }, { isCurrent: () => true, onUnavailable() {} })
  media.mountVideo('cancelled-preview')
  const cancelledPreview = elements.at(-1)
  media.cancel('cancelled-preview')
  assert.equal(cancelledPreview.srcObject, null)
  assert.equal(cancelledPreview.parentNode, null)
  assert.equal(cancelledCam.readyState, 'ended', 'cancel releases the waiting camera')
  assert.equal(cancelledMic.readyState, 'ended', 'cancel releases the preflight microphone')
}

function options(callId, events, mode = 'audio', cameraEnabled = mode === 'video') {
  return { callId, offerer: false, mode, cameraEnabled, peerName: 'Peer Name', stunUrls: ['stun:stun.example:3478', 'turn:relay.example'], isCurrent: () => true,
    onEvent: event => events.push(event) }
}
function emit(callId, event) { listenerRegistrations[0][0](JSON.stringify({ callId, ...event })) }

async function main() {
  assert.equal(media.supported(), true, 'APP-PLUS Android support delegates to native availability')
  assert.equal(media.managesConnectionTimeout(), true, 'Android media delegates connection timeout ownership to native')
  nativeRealtime = false
  assert.equal(media.managesConnectionTimeout(), false, 'older or non-realtime runtime keeps JavaScript timeout ownership')
  nativeRealtime = true
  assert.equal(media.supportsVideo(), true, 'new Android runtime exposes independent video RTC capability')
  assert.equal(media.supportsScreenShare(), true, 'Android enables screen capture when native video is supported')
  assert.equal(media.supportsScreenShareReceive(), true)
  const screenAvailability = context.screenShareRtcAvailable
  context.screenShareRtcAvailable = undefined
  assert.equal(media.supportsScreenShare(), false, 'older native bases do not expose screen sharing')
  assert.equal(media.supportsScreenShareReceive(), false, 'older native bases do not advertise screen reception')
  context.screenShareRtcAvailable = screenAvailability

  const firstEvents = []
  const firstPromise = media.open(options('call-one', firstEvents))
  await tick()
  assert.equal(listenerRegistrations.length, 1, 'the lifecycle native event listener is installed once')
  assert.equal(listenerRegistrations[0].length, 1, 'listener registration uses exactly one persistent callback')
  assert.equal(opens.length, 1)
  assert.equal(opens[0].length, 1, 'native open is one-shot and receives options only')
  assert.deepEqual(JSON.parse(opens[0][0]), { callId: 'call-one', offerer: false, stunUrls: ['stun:stun.example:3478'] })
  assert.deepEqual(featureRequests.slice(0, 1), ['microphone'], 'audio preflight requests microphone only')
  emit('call-one', { type: 'ready' })
  const firstDriver = await firstPromise
  for (let index = 0; index < 2; index++) {
    emit('call-one', { type: 'offer', sdp: `offer-${index}` })
    emit('call-one', { type: 'ice', candidate: { candidate: `ice-${index}` } })
    emit('call-one', { type: 'state', state: index ? 'connected' : 'connecting' })
  }
  assert.equal(firstEvents.filter(event => event.type === 'offer').length, 2)
  assert.equal(firstEvents.filter(event => event.type === 'ice').length, 2)
  assert.equal(firstEvents.filter(event => event.type === 'state').length, 2, 'native events continue after ready and multiple state events arrive')
  firstDriver.signal({ type: 'answer', sdp: 'answer' })
  firstDriver.control({ muted: true })
  assert.equal(JSON.parse(signals[0][1]).type, 'answer')
  assert.deepEqual(JSON.parse(controls[0][1]), { muted: true })
  firstDriver.close()
  assert.deepEqual(closes, [['call-one']])

  const secondEvents = []
  const secondResult = media.open(options('call-two', secondEvents)).then(() => null, error => error)
  await tick()
  assert.equal(opens.length, 2)
  assert.equal(listenerRegistrations.length, 1, 'second sequential call reuses the lifecycle listener')
  emit('call-one', { type: 'offer', sdp: 'stale-after-cancel' })
  assert.equal(secondEvents.length, 0, 'events for a cancelled callId cannot reach the next session')

  media.cancel('call-two')
  const error = await secondResult
  assert.ok(error instanceof Error || error?.name === 'Error')
  assert.match(error.message, /Cancelled/)
  assert.deepEqual(closes, [['call-one'], ['call-two']], 'cancelling pending native open closes the native peer')
  assert.equal(timers.size, 0, 'cancel clears the pending open timeout')
  emit('call-two', { type: 'ready' })
  assert.equal(secondEvents.length, 0, 'cancelled pending call no longer routes native events')

  const videoEvents = []
  const videoPromise = media.open({ ...options('call-video', videoEvents, 'video'), screenShareSupported: true })
  await tick()
  assert.deepEqual(featureRequests.slice(-2), ['microphone', 'camera'], 'video call requests microphone and camera permission')
  assert.equal(opens.length, 3)
  assert.deepEqual(JSON.parse(opens[2][0]), { callId: 'call-video', offerer: false, mode: 'video', cameraEnabled: true, cameraRequested: true,
    remoteCameraEnabled: true, speaker: true, peerName: 'Peer Name', screenShareSupported: true, stunUrls: ['stun:stun.example:3478'] },
    'native video open carries mode and peer name while excluding TURN')
  emit('call-video', { type: 'ready' })
  const videoDriver = await videoPromise
  videoDriver.control({ cameraEnabled: false, switchCamera: true, remoteCameraEnabled: false })
  assert.deepEqual(JSON.parse(controls.at(-1)[1]), { cameraEnabled: false, switchCamera: true, remoteCameraEnabled: false },
    'camera, switch and remote-camera controls are passed to the native peer')
  videoDriver.control({ screenSharing: true, screenShareSupported: true, remoteScreenSharing: true })
  assert.deepEqual(JSON.parse(controls.at(-1)[1]), { screenSharing: true, screenShareSupported: true, remoteScreenSharing: true })
  videoDriver.close()

  const cameraOffPromise = media.open(options('video-camera-off', [], 'video', false))
  await tick()
  assert.deepEqual(featureRequests.slice(-1), ['microphone'], 'video opened camera-off requests microphone only')
  assert.deepEqual(JSON.parse(opens.at(-1)[0]), { callId: 'video-camera-off', offerer: false, mode: 'video', cameraEnabled: false,
    cameraRequested: false, remoteCameraEnabled: false, speaker: false, peerName: 'Peer Name', stunUrls: ['stun:stun.example:3478'] },
  'camera-off video still negotiates video with native peer')
  emit('video-camera-off', { type: 'ready' })
  const cameraOffDriver = await cameraOffPromise
  cameraOffDriver.control({ cameraEnabled: true })
  await tick()
  assert.deepEqual(JSON.parse(controls.at(-1)[1]), { cameraEnabled: true }, 'driver can enable camera after audio-only opening')
  cameraOffDriver.close()

  const cachedStart = featureRequests.length
  await Promise.all([media.prepareOutgoing('cached-permission', 'video'), media.permission('cached-permission', 'video')])
  assert.equal(featureRequests.length, cachedStart + 2, 'outgoing preflight and media open share one microphone and camera check per call')
  const onCancel = () => {}
  let ringing = true
  assert.equal(await media.prepareOutgoingPreview('cached-permission', { name: 'Peer' }, { isCurrent: () => ringing, onCancel }), true)
  media.mountVideo('cached-permission')
  assert.deepEqual(previewEvents.at(-1), ['preview', { callId: 'cached-permission', peerName: 'Peer' }, onCancel])
  media.unmountVideo('cached-permission')
  assert.deepEqual(previewEvents.at(-1), ['close-preview', 'cached-permission'])
  media.mountVideo('cached-permission')
  ringing = false
  const waitingNativeCall = media.open(options('cached-permission', [], 'video'))
  await tick()
  assert.deepEqual(previewEvents.slice(-2), [['close-preview', 'cached-permission'], ['peer', 'cached-permission']])
  emit('cached-permission', { type: 'ready' })
  ;(await waitingNativeCall).close()

  videoAvailable = false
  assert.equal(media.supportsVideo(), false, 'older native runtime does not advertise video')
  const opensBeforeUnsupported = opens.length, permissionsBeforeUnsupported = featureRequests.length
  await assert.rejects(media.open(options('unsupported-video', [], 'video')), error => error?.code === 'unsupported')
  assert.equal(opens.length, opensBeforeUnsupported, 'unsupported native version never opens a video peer')
  assert.equal(featureRequests.length, permissionsBeforeUnsupported, 'unsupported video does not request camera permission')
  videoAvailable = true

  permissionGrants = ['android.permission.RECORD_AUDIO']
  await media.permission('audio-only-video', 'video')
  assert.deepEqual(featureRequests.slice(-2), ['microphone', 'camera'],
    'video permission flow requests microphone and optional camera without failing when camera is denied')
  const audioOnlyVideo = media.open(options('camera-denied-audio-kept', [], 'video'))
  await tick()
  assert.equal(JSON.parse(opens.at(-1)[0]).cameraEnabled, false, 'camera refusal opens the video call in audio-only mode')
  emit('camera-denied-audio-kept', { type: 'ready' })
  ;(await audioOnlyVideo).close()
  permissionGrants = []
  await assert.rejects(media.permission('microphone-denied', 'audio'), error => error?.code === 'permission_denied',
    'microphone denial still rejects the call because audio is required')
  console.log('Voice-call Android adapter tests passed.')
  await testWebMedia()
  console.log('Voice-call web adapter tests passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
