import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createRoundCodeTransport, readGeneratedCodeTask, isGeneratedCodeUrl } from '../src/utils/roundcode-client-core.mjs'
import { createRoundCodeWorker } from '../src/utils/roundcode-worker-core.mjs'
import { createScanDebugAccess } from '../src/utils/scan-debug.mjs'

const base = 'https://example.test', url = base + '/api/registration/wechat-qrcode'
const task = { id: 'rq_' + 'a'.repeat(24), ticket: 'b'.repeat(64), expiresAt: Date.now() + 120000 }
const header = Buffer.from(JSON.stringify(task)).toString('base64url')
const fromBase64 = value => Buffer.from(value, 'base64').toString('ascii')
assert.deepEqual(readGeneratedCodeTask({ 'X-Round-Code-Task': header }, fromBase64), task)
assert.deepEqual(readGeneratedCodeTask({ 'x-round-code-task': header }, fromBase64), task)
assert.equal(readGeneratedCodeTask({ 'X-Round-Code-Task': header }, fromBase64, () => task.expiresAt), null)
assert.equal(readGeneratedCodeTask({ 'X-Round-Code-Task': '%%%' }, fromBase64), null)
assert.equal(readGeneratedCodeTask({}, fromBase64), null)
assert(isGeneratedCodeUrl(url + '?v=1', base))
assert(isGeneratedCodeUrl(base + '/api/registration/sessions/r_' + 'a'.repeat(24) + '/qrcode', base))
for (const bad of ['https://example.test.evil/api/registration/wechat-qrcode', base + '/api/registration/../private', 'file:///qr.png']) assert(!isGeneratedCodeUrl(bad, base))

const requests = []
let response = { statusCode: 200, data: { code: 0, data: { task: null } } }
const transport = createRoundCodeTransport({ baseUrl: base, runtime: { request(options) { requests.push(options); options.success(response) } } })
await transport.claim('admin-token')
assert.equal(requests[0].header.Authorization, 'Bearer admin-token')
assert(!requests[0].url.includes('token'))
await transport.register({ taskId: task.id, ticket: task.ticket, rawBase64: 'YWFhYWFhYWE=' })
assert.deepEqual(Object.keys(requests[1].data).sort(), ['rawBase64', 'taskId', 'ticket'])
response = { statusCode: 501, data: { code: 501, reason: 'ROUND_CODE_UNSUPPORTED' } }
await assert.rejects(transport.claim('old-backend'), e => e.httpStatus === 501)
response = { statusCode: 200, data: { code: 1 } }
await assert.rejects(transport.claim('not-admin'), e => e.httpStatus === 403)
await assert.rejects(transport.image('https://evil.test/image'), /INVALID_QR_IMAGE_URL/)
response = { statusCode: 200, data: new ArrayBuffer(512 * 1024 + 1) }
await assert.rejects(transport.image(url), /INVALID_QR_IMAGE/)

// Actual APP adapter with mocked native bridge: foreground, late result and scanner priority.
const source = (await readFile(new URL('../src/utils/roundcode-client.js', import.meta.url), 'utf8'))
  .replace(/\/\/ #ifdef H5\r?\n[\s\S]*?\/\/ #endif\r?\n/g, '')
  .replace(/^import .*\r?\n/gm, '').replace(/export (async )?function /g, '$1function ')
  + '\nglobalThis.client = { setRoundCodeClientActive, registerGeneratedCodeImage, prioritizeRoundCodeScanner };'
function appHarness() {
  const calls = [], callbacks = [], timers = new Map(); let timerId = 0
  const storage = { token: '', userInfo: { isAdmin: false } }
  const image = Uint8Array.from([137,80,78,71,13,10,26,10]).buffer
  const context = {
    baseUrl: base, createRoundCodeTransport, readGeneratedCodeTask, isGeneratedCodeUrl, createRoundCodeWorker, createScanDebugAccess,
    Date, Promise, Set, Map, Array, Uint8Array, ArrayBuffer, String, Object,
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId }, clearInterval: id => timers.delete(id),
    decodeGeneratedImage(encoded, callback) { calls.push('decode'); callbacks.push(callback) },
    uni: { getStorageSync: key => storage[key], getSystemInfoSync: () => ({ platform: 'android' }),
      base64ToArrayBuffer: value => { const b = Buffer.from(value, 'base64'); return Uint8Array.from(b).buffer },
      arrayBufferToBase64: value => Buffer.from(value).toString('base64'),
      request(options) {
        calls.push(options.url)
        if (options.method === 'GET') options.success({ statusCode: 200, data: image, header: { 'Content-Type': 'image/png', 'X-Round-Code-Task': header } })
        else options.success({ statusCode: 200, data: { code: 0, data: { registered: true, task: null } } })
      }
    }
  }
  vm.runInNewContext(source, context)
  return { ...context.client, callbacks, calls, storage, timers }
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const countRegisters = h => h.calls.filter(x => x.endsWith('/register-generated')).length
const rawResult = JSON.stringify({ scanType: 'WX_CODE', rawBase64: Buffer.from('opaque-test-payload').toString('base64') })
{
  const h = appHarness(); h.setRoundCodeClientActive(true)
  const pending = h.registerGeneratedCodeImage(url); await flush()
  assert.equal(h.callbacks.length, 1); h.callbacks[0](rawResult); await pending
  assert.equal(countRegisters(h), 1)
  await h.registerGeneratedCodeImage(url); assert.equal(h.callbacks.length, 1, 'same displayed URL is bounded/deduplicated')
  h.setRoundCodeClientActive(false); assert.equal(h.timers.size, 0)
}
for (const reason of ['hidden', 'account', 'gone']) {
  const h = appHarness(); let current = true; h.setRoundCodeClientActive(true)
  const pending = h.registerGeneratedCodeImage(url, () => current); await flush()
  if (reason === 'hidden') h.setRoundCodeClientActive(false)
  else if (reason === 'account') h.storage.token = 'different-account'
  else current = false
  h.callbacks[0](rawResult); await pending
  assert.equal(countRegisters(h), 0, reason + ' must discard late native result')
  h.setRoundCodeClientActive(false)
}
{
  const h = appHarness(); h.setRoundCodeClientActive(true)
  const pending = h.registerGeneratedCodeImage(url); await flush()
  let cameraReady = false
  const priority = h.prioritizeRoundCodeScanner().then(release => { cameraReady = true; return release })
  await flush(); assert.equal(cameraReady, false)
  h.callbacks[0](rawResult); await pending
  const release = await priority; assert.equal(cameraReady, true); assert.equal(countRegisters(h), 1, 'finish useful registration before opening the camera')
  release(); release(); h.setRoundCodeClientActive(false); assert.equal(h.timers.size, 0)
}
{
  const h = appHarness(); h.setRoundCodeClientActive(true)
  const pending = h.registerGeneratedCodeImage(url); await flush()
  h.callbacks[0](JSON.stringify({ error: 'UNAVAILABLE' })); await pending
  assert.equal(countRegisters(h), 0); h.setRoundCodeClientActive(false)
}
// Multiple clients/URLs share one native lane, and a brief app hide releases pending dedup.
{
  const h = appHarness(); h.setRoundCodeClientActive(true)
  const first = h.registerGeneratedCodeImage(url + '?v=1')
  const second = h.registerGeneratedCodeImage(url + '?v=2')
  await flush(); assert.equal(h.callbacks.length, 1)
  h.callbacks[0](rawResult); await first; await flush()
  assert.equal(h.callbacks.length, 2); h.callbacks[1](rawResult); await second
  assert.equal(countRegisters(h), 2); h.setRoundCodeClientActive(false)
}
{
  const h = appHarness(); h.setRoundCodeClientActive(true)
  const first = h.registerGeneratedCodeImage(url); await flush()
  h.setRoundCodeClientActive(false); h.setRoundCodeClientActive(true)
  const resumed = h.registerGeneratedCodeImage(url); await flush()
  h.callbacks[0](rawResult); await first; await flush()
  assert.equal(h.callbacks.length, 2, 'same URL can resume after background cancellation')
  h.callbacks[1](rawResult); await resumed
  assert.equal(countRegisters(h), 1); h.setRoundCodeClientActive(false)
}
console.log('PASS generated QR transport/header, old backend, bounds, APP own registration, lifecycle/account guards and camera priority')
