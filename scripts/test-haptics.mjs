import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { vibrateHaptic, vibrateHapticPattern, vibrateScan } from '../src/utils/haptics.mjs'

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
for (const file of ['../src/utils/app-qr-scanner.js', '../src/utils/h5-qr-scanner.js']) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  assert.equal((source.match(/vibrateScan\(\)/g) || []).length, 1, `${file} should pulse once per successful scan`)
}

const doubleCalls = []
await vibrateHapticPattern(2, { plus: { device: { vibrate: duration => doubleCalls.push(duration) } } })
assert.deepEqual(doubleCalls, [100, 100])
const notificationSource = await readFile(new URL('../src/utils/notification.js', import.meta.url), 'utf8')
assert.match(notificationSource, /if \(vibrate\)\s*\{\s*vibrateNotification\(0\)/)

console.log('haptics dispatch, fallback, scan pulse, and bounded notification pattern passed')
