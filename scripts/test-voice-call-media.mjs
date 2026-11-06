import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
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

const listenerRegistrations = [], opens = [], signals = [], controls = [], closes = [], permissionRequests = [], timers = new Map()
let nextTimer = 0
let videoAvailable = true
let nativeRealtime = true
let permissionGrants = ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA']
const context = {
  plus: {
    os: { name: 'Android' },
    android: { requestPermissions(permissions, success) { permissionRequests.push([...permissions]); success({ granted: permissionGrants }) } }
  },
  voiceRtcAvailable: () => true,
  androidRealtimeAvailable: () => nativeRealtime,
  videoRtcAvailable: () => videoAvailable,
  onVoicePeerEvent(...args) { listenerRegistrations.push(args) },
  openVoicePeer(...args) { opens.push(args) },
  signalVoicePeer(...args) { signals.push(args) },
  controlVoicePeer(...args) { controls.push(args) },
  closeVoicePeer(...args) { closes.push(args) },
  setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id },
  clearTimeout(id) { timers.delete(id) },
  Promise, Map, Set, Error, Object, JSON, String, Array, console
}
vm.runInNewContext(preprocessAppPlus(source), context, { filename: sourcePath })
const media = context.__voiceCallMedia
const tick = () => new Promise(resolve => setImmediate(resolve))

function options(callId, events, mode = 'audio') {
  return { callId, offerer: false, mode, peerName: 'Peer Name', stunUrls: ['stun:stun.example:3478', 'turn:relay.example'], isCurrent: () => true,
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

  const firstEvents = []
  const firstPromise = media.open(options('call-one', firstEvents))
  await tick()
  assert.equal(listenerRegistrations.length, 1, 'the lifecycle native event listener is installed once')
  assert.equal(listenerRegistrations[0].length, 1, 'listener registration uses exactly one persistent callback')
  assert.equal(opens.length, 1)
  assert.equal(opens[0].length, 1, 'native open is one-shot and receives options only')
  assert.deepEqual(JSON.parse(opens[0][0]), { callId: 'call-one', offerer: false, stunUrls: ['stun:stun.example:3478'] })
  assert.deepEqual(permissionRequests[0], ['android.permission.RECORD_AUDIO', 'android.permission.POST_NOTIFICATIONS'],
    'audio requests microphone and notification permission without requesting camera')
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
  const videoPromise = media.open(options('call-video', videoEvents, 'video'))
  await tick()
  assert.deepEqual(permissionRequests.at(-1), ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS'],
    'video call requests both microphone and camera permission')
  assert.equal(opens.length, 3)
  assert.deepEqual(JSON.parse(opens[2][0]), { callId: 'call-video', offerer: false, mode: 'video', peerName: 'Peer Name', stunUrls: ['stun:stun.example:3478'] },
    'native video open carries mode and peer name while excluding TURN')
  emit('call-video', { type: 'ready' })
  const videoDriver = await videoPromise
  videoDriver.control({ cameraEnabled: false, switchCamera: true, remoteCameraEnabled: false })
  assert.deepEqual(JSON.parse(controls.at(-1)[1]), { cameraEnabled: false, switchCamera: true, remoteCameraEnabled: false },
    'camera, switch and remote-camera controls are passed to the native peer')
  videoDriver.close()

  videoAvailable = false
  assert.equal(media.supportsVideo(), false, 'older native runtime does not advertise video')
  const opensBeforeUnsupported = opens.length, permissionsBeforeUnsupported = permissionRequests.length
  await assert.rejects(media.open(options('unsupported-video', [], 'video')), error => error?.code === 'unsupported')
  assert.equal(opens.length, opensBeforeUnsupported, 'unsupported native version never opens a video peer')
  assert.equal(permissionRequests.length, permissionsBeforeUnsupported, 'unsupported video does not request camera permission')
  videoAvailable = true

  permissionGrants = ['android.permission.RECORD_AUDIO']
  const deniedVideoPermission = media.permission('denied-video', 'video')
  await assert.rejects(deniedVideoPermission, error => error?.code === 'permission_denied')
  assert.deepEqual(permissionRequests.at(-1), ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS'],
    'missing camera grant rejects video permission')
  console.log('Voice-call Android adapter tests passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
