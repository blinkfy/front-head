import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'src/utils/voice-call-media.js')
const source = fs.readFileSync(sourcePath, 'utf8')

function preprocessH5(input) {
  const output = [], stack = []
  let include = true
  for (const line of input.split(/\r?\n/)) {
    const directive = line.match(/^\s*\/\/\s*#(ifdef|ifndef|if|else|endif)\s*(.*)$/)
    if (!directive) { if (include) output.push(line); continue }
    const [, command, expression] = directive
    if (command === 'ifdef' || command === 'ifndef' || command === 'if') {
      const isApp = false, isH5 = true
      const hasApp = expression.includes('APP-PLUS'), hasH5 = expression.includes('H5')
      const condition = command === 'ifdef' ? (hasApp ? isApp : isH5) : command === 'ifndef' ? !isApp || isH5 : !isApp || isH5
      stack.push({ parent: include, condition })
      include = include && condition
    } else if (command === 'else') {
      const current = stack.at(-1)
      include = current.parent && !current.condition
    } else {
      include = stack.pop().parent
    }
  }
  return output.join('\n').replace(/^import .*$/gm, '').replace(/^export const voiceCallMedia =/m, 'const voiceCallMedia =') +
    '\nglobalThis.__voiceCallMedia = voiceCallMedia;'
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const captures = [], peers = [], elements = [], pendingReplacements = [], remotePlayResults = []
class Track {
  constructor(kind) { this.kind = kind; this.enabled = true; this.stopped = false; this.readyState = 'live'; this.id = `${kind}-${Math.random()}` }
  stop() { this.stopped = true; this.readyState = 'ended' }
}
class Stream {
  constructor(tracks = []) { this.tracks = [...tracks] }
  getTracks() { return [...this.tracks] }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  addTrack(track) { if (!this.tracks.includes(track)) this.tracks.push(track) }
  removeTrack(track) { this.tracks = this.tracks.filter(item => item !== track) }
}
class Element {
  constructor(tag) { this.tag = tag; this.dataset = {}; this.style = {}; this.children = []; this.srcObject = null; this.parentNode = null; elements.push(this) }
  setAttribute() {}
  play() {
    if (this.dataset.callVideo === 'remote') {
      this.playCalls = (this.playCalls || 0) + 1
      return (remotePlayResults.shift() || (() => Promise.resolve()))()
    }
    return Promise.resolve()
  }
  appendChild(child) {
    child.parentNode?.removeChild(child)
    this.children.push(child); child.parentNode = this
  }
  removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null }
  remove() { this.parentNode?.removeChild(this); this.removed = true }
}
class PeerConnection {
  constructor() { this.senders = []; this.transceivers = []; this.closed = false; peers.push(this) }
  makeTransceiver(kind, { mid = null, direction = 'sendrecv' } = {}) {
    const sender = { track: null, getParameters: () => ({ encodings: [] }), replaceTrack: async next => { sender.track = next } }
    const item = { mid, direction, sender, receiver: { track: new Track(kind) } }
    this.senders.push(sender); this.transceivers.push(item); return item
  }
  addTrack(track) { const sender = { track, getParameters: () => ({ encodings: [] }), replaceTrack: next => {
    const wait = pendingReplacements.shift()
    return wait ? wait.promise.then(() => { sender.track = next }) : Promise.resolve().then(() => { sender.track = next })
  } }; this.senders.push(sender); this.transceivers.push({ mid: null, direction: 'sendrecv', sender, receiver: { track: new Track(track.kind) } }); return sender }
  addTransceiver(kind, options) { return this.makeTransceiver(kind, options) }
  getTransceivers() { return this.transceivers }
  async createOffer() { return { type: 'offer', sdp: 'offer' } }
  async createAnswer() { return { type: 'answer', sdp: 'answer' } }
  async setRemoteDescription(value) {
    this.remoteDescription = value
    if (value.type === 'offer' && /m=video/.test(value.sdp || '')) this.makeTransceiver('video', { mid: 'offered-video', direction: 'recvonly' })
  }
  async setLocalDescription(value) { this.localDescription = value }
  close() { this.closed = true }
}

const context = {
  isSecureContext: true,
  RTCPeerConnection: PeerConnection,
  MediaStream: Stream,
  navigator: { mediaDevices: { getUserMedia(constraints) { const capture = deferred(); captures.push({ constraints, ...capture }); return capture.promise } } },
  androidRealtimeAvailable: () => false,
  document: null,
  HTMLVideoElement: function HTMLVideoElement() {},
  Promise, Map, Set, Error, Object, JSON, String, Array, console
}
const localHost = new Element('local-host'), remoteHost = new Element('remote-host')
context.document = {
  body: new Element('body'), pictureInPictureEnabled: false,
  createElement: tag => new Element(tag),
  getElementById: id => id === 'call-video-local' ? localHost : id === 'call-video-remote' ? remoteHost : null
}
context.HTMLVideoElement.prototype.requestPictureInPicture = function () { return Promise.resolve() }
vm.runInNewContext(preprocessH5(source), context, { filename: sourcePath })
const media = context.__voiceCallMedia
assert.equal(media.managesConnectionTimeout(), false, 'H5 media keeps the JavaScript connection timeout')
const tick = async () => { for (let i = 0; i < 32; i++) await Promise.resolve() }
const options = (callId, mode = 'video', events = [], cameraEnabled) => ({ callId, mode, ...(typeof cameraEnabled === 'boolean' ? { cameraEnabled } : {}),
  offerer: false, stunUrls: ['stun:stun.example:3478'], isCurrent: () => true, onEvent: event => events.push(event) })

async function openVideo(callId) {
  const index = captures.length
  const opening = media.open(options(callId, 'video'))
  await tick()
  const audio = new Track('audio')
  assert.equal(captures[index].constraints.video, false, 'video calls request microphone first without camera')
  captures[index].resolve(new Stream([audio]))
  await tick()
  assert.equal(captures[index + 1].constraints.audio, false, 'camera is requested separately after microphone access')
  assert.equal(captures[index + 1].constraints.video.facingMode, 'user')
  captures[index + 1].resolve(new Stream([new Track('video')]))
  return opening
}

async function openWithInitialVideo(callId, events = []) {
  const captureIndex = captures.length
  const opening = media.open(options(callId, 'video', events))
  await tick()
  const audio = new Track('audio')
  captures[captureIndex].resolve(new Stream([audio]))
  await tick()
  const cameraIndex = captures.length - 1, video = new Track('video')
  captures[cameraIndex].resolve(new Stream([video]))
  const driver = await opening
  const peer = peers.at(-1), local = elements.find(element => element.dataset.callVideo === 'local' && element.srcObject?.getTracks().includes(audio))
  return { driver, peer, stream: local.srcObject, audio, video, sender: peer.senders.find(sender => sender.track === video) }
}

async function main() {
  assert.equal(media.supported(), true)
  assert.equal(media.supportsVideo(), true)
  assert.equal(media.canPictureInPicture(), false, 'PiP is unavailable when the document does not advertise support')

  const opening = openVideo('camera-race')
  const driver = await opening
  assert.equal(captures[0].constraints.video, false, 'video open first requests microphone only')
  assert.deepEqual(captures[1].constraints.video.facingMode, 'user', 'video open requests the initial front camera separately')
  const callLocalElement = elements.find(element => element.dataset.callVideo === 'local' && element.srcObject)
  const callRemoteElement = elements.find(element => element.dataset.callVideo === 'remote' && element.srcObject)
  assert.ok(callLocalElement && callRemoteElement)
  assert.equal(callLocalElement.parentNode, localHost, 'initial video elements mount into the call page hosts')
  assert.equal(callRemoteElement.parentNode, remoteHost)
  media.unmountVideo('camera-race')
  assert.equal(callLocalElement.parentNode, context.document.body, 'unmount keeps the local video element connected under body')
  assert.equal(callRemoteElement.parentNode, context.document.body, 'unmount keeps the remote video element connected under body')
  media.mountVideo('camera-race')
  assert.equal(callLocalElement.parentNode, localHost, 'remount restores the local video element to its host')
  assert.equal(callRemoteElement.parentNode, remoteHost, 'remount restores the remote video element to its host')
  await assert.rejects(media.pictureInPicture('camera-race'), /不支持视频小窗/,
    'PiP request rejects cleanly when the browser reports PiP unavailable')
  context.document.pictureInPictureEnabled = true
  context.document.pictureInPictureElement = callRemoteElement
  media.unmountVideo('camera-race')
  assert.equal(callRemoteElement.parentNode, context.document.body, 'PiP remote video remains connected under body after unmount')
  assert.equal(callRemoteElement.style.display, '', 'PiP remote video stays displayed after unmount')
  assert.equal(callRemoteElement.style.position, 'fixed', 'PiP remote video is positioned offscreen without display:none')
  assert.equal(callRemoteElement.style.left, '-10000px')
  assert.equal(callRemoteElement.style.width, '1px')
  assert.equal(callRemoteElement.style.height, '1px')
  media.mountVideo('camera-race')
  assert.equal(callRemoteElement.parentNode, remoteHost, 'remount restores PiP video to the call stage')
  assert.equal(callRemoteElement.style.display, '')
  assert.equal(callRemoteElement.style.position, '', 'remount clears offscreen positioning')
  assert.equal(callRemoteElement.style.left, '')
  assert.equal(callRemoteElement.style.width, '100%')
  assert.equal(callRemoteElement.style.height, '100%')
  const stream = captures[0] && [...peers[0].senders].length ? elements.find(element => element.dataset.callVideo === 'local').srcObject : null
  const audioTrack = stream.getAudioTracks()[0], originalVideo = stream.getVideoTracks()[0]
  const initialCaptureCount = captures.length
  const sender = peers[0].senders.find(item => item.track === originalVideo)
  assert.equal(audioTrack.stopped, false)
  assert.equal(originalVideo.stopped, false)

  driver.control({ switchCamera: true })
  await tick()
  assert.equal(captures.length, initialCaptureCount + 1, 'camera switch starts a replacement capture')
  const replacementPromise = captures[initialCaptureCount]
  driver.control({ cameraEnabled: false })
  assert.equal(originalVideo.readyState, 'ended', 'camera off immediately ends the existing video track during a pending switch')
  assert.equal(audioTrack.stopped, false, 'camera off leaves the audio track live')
  const replacementTrack = new Track('video')
  replacementPromise.resolve(new Stream([replacementTrack]))
  await tick()
  assert.equal(replacementTrack.stopped, true, 'late switch track is stopped')
  assert.equal(stream.getVideoTracks().length, 0, 'late replacement is not installed as an active stream track')
  assert.equal(sender.track, null, 'camera off clears the peer sender after the in-flight switch settles')

  driver.control({ cameraEnabled: true })
  await tick()
  assert.equal(captures.length, initialCaptureCount + 2, 'camera on captures a new replacement')
  const reopened = new Track('video')
  captures[initialCaptureCount + 1].resolve(new Stream([reopened]))
  await tick()
  assert.equal(stream.getVideoTracks()[0], reopened, 'camera on restores a live video track')
  assert.equal(sender.track, reopened, 'the peer sender is restored with the new track')

  driver.control({ switchCamera: true })
  await tick()
  assert.equal(captures.length, initialCaptureCount + 3)
  const lateCapture = captures[initialCaptureCount + 2]
  driver.close()
  assert.equal(callLocalElement.parentNode, null, 'ending the call removes the mounted local video element')
  assert.equal(callRemoteElement.parentNode, null, 'ending the call removes the mounted remote video element')
  assert.equal(audioTrack.stopped, true, 'closing the driver stops audio immediately')
  assert.equal(reopened.stopped, true, 'closing the driver stops the active camera track')
  assert.equal(peers[0].closed, true, 'closing the driver closes the peer connection')
  const tooLate = new Track('video')
  lateCapture.resolve(new Stream([tooLate]))
  await tick()
  assert.equal(tooLate.stopped, true, 'a camera capture resolving after close is stopped')

  // A stale switch that resolves after off/on must be discarded, then current intent is reconciled.
  const rapid = await openWithInitialVideo('camera-off-on-race')
  rapid.driver.control({ switchCamera: true })
  await tick()
  const staleCapture = captures.at(-1)
  rapid.driver.control({ cameraEnabled: false })
  rapid.driver.control({ cameraEnabled: true })
  const staleTrack = new Track('video')
  staleCapture.resolve(new Stream([staleTrack]))
  await tick()
  assert.equal(staleTrack.readyState, 'ended', 'stale switch replacement is stopped after off/on')
  const currentCapture = captures.at(-1)
  assert.notEqual(currentCapture, staleCapture, 'latest camera intent requests a fresh capture')
  const currentTrack = new Track('video')
  currentCapture.resolve(new Stream([currentTrack]))
  await tick()
  assert.equal(rapid.sender.track, currentTrack)
  assert.equal(rapid.stream.getVideoTracks()[0], currentTrack, 'sender and stream agree on the active replacement')
  assert.equal(currentTrack.readyState, 'live')
  rapid.driver.close()

  // A candidate is privacy-stopped immediately even while replaceTrack itself is pending.
  const replacing = await openWithInitialVideo('camera-replace-pending-off')
  replacing.driver.control({ switchCamera: true })
  await tick()
  const candidateCapture = captures.at(-1)
  const replaceGate = deferred(); pendingReplacements.push(replaceGate)
  const candidate = new Track('video')
  candidateCapture.resolve(new Stream([candidate]))
  await tick()
  assert.equal(replacing.sender.track, replacing.video, 'sender replacement is still awaiting completion')
  replacing.driver.control({ cameraEnabled: false })
  assert.equal(candidate.readyState, 'ended', 'camera off immediately ends a pending replacement candidate')
  assert.equal(replacing.video.readyState, 'ended', 'camera off immediately ends the existing track')
  assert.equal(replacing.audio.readyState, 'live', 'camera off preserves audio during pending replaceTrack')
  replaceGate.resolve()
  await tick()
  assert.equal(replacing.sender.track, null, 'off intent clears sender after pending replacement settles')
  replacing.driver.close()

  // Closing while replaceTrack is pending stops candidate and all current media; late resolution cannot restore live video.
  const closing = await openWithInitialVideo('camera-replace-pending-close')
  closing.driver.control({ switchCamera: true })
  await tick()
  const closeCapture = captures.at(-1)
  const closeGate = deferred(); pendingReplacements.push(closeGate)
  const closeCandidate = new Track('video')
  closeCapture.resolve(new Stream([closeCandidate]))
  await tick()
  closing.driver.close()
  assert.equal(closeCandidate.readyState, 'ended', 'close immediately ends a candidate awaiting replaceTrack')
  assert.equal(closing.video.readyState, 'ended')
  assert.equal(closing.audio.readyState, 'ended')
  assert.equal(closing.peer.closed, true)
  closeGate.resolve()
  await tick()
  assert.equal(closeCandidate.readyState, 'ended', 'late replaceTrack completion cannot revive the candidate')
  assert.equal(closing.stream.getVideoTracks().some(track => track.readyState === 'live'), false)

  // Remote audio/video tracks share one stable stream; AbortError is harmless and autoplay denial is recoverable.
  const remoteEvents = []
  const remoteCall = await openWithInitialVideo('remote-playback', remoteEvents)
  const remoteElement = elements.find(element => element.dataset.callVideo === 'remote' && !element.removed)
  const stableRemoteStream = remoteElement.srcObject
  remotePlayResults.push(() => Promise.reject(Object.assign(new Error('play interrupted'), { name: 'AbortError' })))
  const remoteAudio = new Track('audio')
  remoteCall.peer.ontrack({ track: remoteAudio, streams: [new Stream([remoteAudio])] })
  await tick()
  assert.equal(remoteElement.srcObject, stableRemoteStream, 'remote srcObject is assigned once and remains stable')
  assert.equal(remoteEvents.some(event => event.type === 'error'), false, 'AbortError never becomes a fatal media error')
  assert.equal(remoteEvents.some(event => event.type === 'playback' && event.blocked), false, 'AbortError is not reported as blocked playback')
  const remoteVideo = new Track('video')
  remoteCall.peer.ontrack({ track: remoteVideo, streams: [new Stream([remoteVideo])] })
  await tick()
  assert.equal(remoteElement.srcObject, stableRemoteStream)
  assert.deepEqual(stableRemoteStream.getTracks(), [remoteAudio, remoteVideo], 'separate remote tracks accumulate in the same MediaStream')
  remoteCall.driver.close()

  const blockedEvents = []
  const blockedCall = await openWithInitialVideo('remote-playback-blocked', blockedEvents)
  const blockedRemote = elements.find(element => element.dataset.callVideo === 'remote' && !element.removed)
  remotePlayResults.push(() => Promise.reject(Object.assign(new Error('user gesture required'), { name: 'NotAllowedError' })))
  blockedCall.peer.ontrack({ track: new Track('audio'), streams: [] })
  await tick()
  assert.ok(blockedEvents.some(event => event.type === 'playback' && event.blocked === true), 'NotAllowedError reports blocked playback')
  assert.equal(blockedEvents.some(event => event.type === 'error'), false, 'blocked autoplay does not end the call')
  assert.equal(blockedCall.peer.closed, false)
  remotePlayResults.push(() => Promise.resolve())
  blockedCall.driver.control({ resumePlayback: true })
  await tick()
  assert.ok(blockedEvents.some(event => event.type === 'playback' && event.blocked === false), 'user gesture can resume remote playback')
  assert.equal(blockedCall.peer.closed, false, 'playback recovery leaves the peer connection open')
  assert.ok(blockedRemote.playCalls >= 2)
  blockedCall.driver.close()

  const audioCaptureIndex = captures.length
  const audioOpening = media.open(options('audio-only', 'audio'))
  await tick()
  assert.equal(captures.length, audioCaptureIndex + 1)
  assert.equal(captures[audioCaptureIndex].constraints.video, false, 'audio-only open never requests video')
  const audioOnlyStream = new Stream([new Track('audio')])
  captures[audioCaptureIndex].resolve(audioOnlyStream)
  const audioDriver = await audioOpening
  audioDriver.close()
  assert.equal(audioOnlyStream.getAudioTracks()[0].stopped, true)

  const cameraOffIndex = captures.length
  const cameraOffEvents = []
  const cameraOffOpening = media.open(options('camera-off-audio-first', 'video', cameraOffEvents, false))
  await tick()
  assert.equal(typeof captures[cameraOffIndex].constraints.audio, 'object', 'camera-off video acquires microphone')
  assert.equal(captures[cameraOffIndex].constraints.video, false, 'camera-off video does not request camera during open')
  const cameraOffAudio = new Track('audio')
  captures[cameraOffIndex].resolve(new Stream([cameraOffAudio]))
  const cameraOffDriver = await cameraOffOpening
  assert.equal(cameraOffAudio.readyState, 'live')
  const cameraOffPeer = peers.at(-1)
  assert.equal(cameraOffPeer.transceivers.some(item => item.receiver.track.kind === 'video'), false,
    'answerer does not pre-create an unassociated video transceiver before receiving offer')
  cameraOffDriver.signal({ type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' })
  await tick()
  const offeredCameraOffVideo = cameraOffPeer.transceivers.find(item => item.mid === 'offered-video')
  assert.ok(offeredCameraOffVideo, 'remote description creates the offered video transceiver')
  assert.equal(offeredCameraOffVideo.direction, 'sendrecv', 'offered transceiver is made bidirectional for later camera enable')
  assert.equal(cameraOffPeer.transceivers.filter(item => item.receiver.track.kind === 'video').length, 1,
    'answerer uses one offered transceiver instead of adding an orphan')
  const laterCameraIndex = captures.length
  cameraOffDriver.control({ cameraEnabled: true })
  await tick()
  assert.equal(captures[laterCameraIndex].constraints.audio, false, 'later camera enable does not reacquire microphone')
  assert.equal(typeof captures[laterCameraIndex].constraints.video, 'object', 'camera enable requests video separately')
  const laterCamera = new Track('video')
  captures[laterCameraIndex].resolve(new Stream([laterCamera]))
  await tick()
  assert.equal(offeredCameraOffVideo.sender.track, laterCamera, 'camera control replaces the negotiated offered sender')
  assert.equal(cameraOffPeer.transceivers.filter(item => item.receiver.track.kind === 'video').length, 1,
    'later camera enable does not create an orphan video transceiver')
  cameraOffDriver.close()

  const deniedCameraIndex = captures.length
  const deniedCameraEvents = []
  const deniedCameraOpening = media.open(options('camera-denied-audio-kept', 'video', deniedCameraEvents))
  const retainedAudio = new Track('audio')
  captures[deniedCameraIndex].resolve(new Stream([retainedAudio]))
  await tick()
  captures[deniedCameraIndex + 1].reject(new Error('camera denied'))
  const deniedCameraDriver = await deniedCameraOpening
  const deniedCameraPeer = peers.at(-1)
  assert.equal(retainedAudio.readyState, 'live', 'camera denial leaves microphone audio available')
  assert.equal(deniedCameraPeer.senders.some(sender => sender.track === retainedAudio), true)
  assert.ok(deniedCameraEvents.some(event => event.type === 'camera' && event.cameraEnabled === false), 'camera denial reports audio-only state')
  assert.equal(deniedCameraPeer.transceivers.some(item => item.receiver.track.kind === 'video'), false,
    'camera-denied answerer waits for the remote video offer instead of pre-creating a sender')
  deniedCameraDriver.signal({ type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' })
  await tick()
  const offeredDeniedVideo = deniedCameraPeer.transceivers.find(item => item.mid === 'offered-video')
  assert.ok(offeredDeniedVideo, 'camera-denied call receives the offered video transceiver')
  assert.equal(offeredDeniedVideo.direction, 'sendrecv', 'camera-denied call can still receive video and enable its camera later')
  assert.equal(deniedCameraPeer.transceivers.filter(item => item.receiver.track.kind === 'video').length, 1,
    'camera-denied answerer has no orphan video transceiver')
  deniedCameraDriver.close()

  console.log('Video-call H5 camera adapter tests passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
