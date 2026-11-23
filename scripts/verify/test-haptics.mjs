import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { vibrateHaptic, vibrateHapticPattern, vibrateScan } from '../../src/utils/haptics.mjs'
import { createChatFeedback } from '../../src/utils/realtime/chat-feedback-core.mjs'

// The shared feedback core must vibrate before handing audio to a slow driver.
let releaseCoreAudio
const coreOrder = []
const feedback = createChatFeedback({
  policy: () => ({ sound: true, vibrate: true }), enabled: () => true,
  driver: { warm() {}, stop() {}, play() { coreOrder.push('audio'); return new Promise(resolve => { releaseCoreAudio = resolve }) } },
  vibrate: () => coreOrder.push('vibration')
})
feedback.setActive(true)
const coreCue = feedback.receive()
assert.deepEqual(coreOrder, ['vibration', 'audio'], 'the feedback core vibrates before waiting for audio')
releaseCoreAudio(true)
await coreCue

const appCalls = []
const appRuntime = {
  plus: { device: { vibrate: duration => appCalls.push(['plus', duration]) } },
  uni: { vibrateShort: () => appCalls.push(['uni-short']), vibrateLong: () => appCalls.push(['uni-long']) }
}
assert.equal(await vibrateHaptic(160, appRuntime), true)
assert.deepEqual(appCalls, [['plus', 160]])

const h5Calls = []
assert.equal(await vibrateHaptic(100, { navigator: { vibrate: duration => { h5Calls.push(duration); return true } } }), true)
assert.deepEqual(h5Calls, [100])

const miniCalls = []
const miniRuntime = { uni: {
  vibrateShort: options => { miniCalls.push(['short', options.type]); options.success() },
  vibrateLong: () => miniCalls.push(['long'])
} }
assert.equal(await vibrateHaptic(120, miniRuntime), true)
assert.deepEqual(miniCalls, [['short', 'heavy']])

const fallbackCalls = []
const fallbackRuntime = { uni: {
  vibrateShort: options => { fallbackCalls.push('short'); options.fail(new Error('unsupported')) },
  vibrateLong: options => { fallbackCalls.push('long'); options.success() }
} }
assert.equal(await vibrateHaptic(120, fallbackRuntime), true)
assert.deepEqual(fallbackCalls, ['short', 'long'])

let scanPulses = 0
await vibrateScan({ plus: { device: { vibrate: duration => { assert.equal(duration, 160); scanPulses++ } } } })
assert.equal(scanPulses, 1)
for (const file of ['../../src/utils/scan/app-qr-scanner.js', '../../src/utils/scan/h5-qr-scanner.js']) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  assert.equal((source.match(/vibrateScan\(\)/g) || []).length, 1, `${file} should pulse once per successful scan`)
}

const doubleCalls = []
await vibrateHapticPattern(2, { plus: { device: { vibrate: duration => doubleCalls.push(duration) } } })
assert.deepEqual(doubleCalls, [100, 100])
const notificationSource = await readFile(new URL('../../src/utils/realtime/notification.js', import.meta.url), 'utf8')
assert.match(notificationSource, /receiveChatFeedback\(\{ sound: playSound, vibrate, quiet: options\.quiet \}\)/)

// A slow or unavailable audio callback must never delay message vibration.
let releaseSound
const slowSound = new Promise(resolve => { releaseSound = resolve })
const alerts = []
let feedbackOptions
// Locate the exported function without depending on the source file's newline style.
const sourceTail = notificationSource.slice(notificationSource.indexOf('export async function notifyNewMessage')).split(/\r?\n\/\*\*/)[0]
const notify = vm.runInNewContext(sourceTail.replace('export ', '') + '; notifyNewMessage', {
  showSystemNotification: () => alerts.push('notification'),
  showNotification: () => alerts.push('banner'),
  receiveChatFeedback: options => {
    feedbackOptions = options
    return slowSound
  },
  openChatNotification() {}
})
const pendingNotice = notify({ content: 'message' })
assert.deepEqual(alerts, ['banner'], 'message notification delegates its cues to shared chat feedback')
assert.equal(feedbackOptions.sound, true, 'notification delegates sound to shared chat feedback')
assert.equal(feedbackOptions.vibrate, true, 'notification delegates vibration to shared chat feedback')
releaseSound()
await pendingNotice
alerts.length = 0
await notify({ content: 'silent' }, { playSound: false, vibrate: false, showNotification: false })
assert.deepEqual(alerts, [], 'muted options remain respected')

console.log('haptics dispatch, fallback, scan pulse, and bounded notification pattern passed')
