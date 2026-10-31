import assert from 'node:assert/strict'
import { createWebGeneratedCodeRegistrar } from '../src/utils/h5-generated-roundcode-core.mjs'

const baseUrl = 'https://example.test'
const url = baseUrl + '/api/registration/sessions/r_' + 'a'.repeat(24) + '/qrcode'
const rawBase64 = Buffer.from('opaque-circle-payload').toString('base64')
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
function harness({ headers = true, available = true, decode, register } = {}) {
  let time = 1000, identity = '', opened = 0, closed = 0, active = 0, maxActive = 0
  const events = [], task = { id: 'rq_' + 'b'.repeat(24), ticket: 'c'.repeat(64), expiresAt: 180000 }
  const response = { data: new ArrayBuffer(8), header: { 'Content-Type': 'image/png',
    ...(headers ? { 'X-Round-Code-Task': Buffer.from(JSON.stringify(task)).toString('base64url') } : {}) } }
  const client = createWebGeneratedCodeRegistrar({ baseUrl, getIdentity: () => identity, now: () => time,
    decodeBase64: encoded => Buffer.from(encoded, 'base64').toString('ascii'), encodeImage: () => 'iVBORw==',
    transport: { image: async source => { events.push(['image', source]); return response },
      register: async data => { events.push(['register', data]); if (register) await register(data) } },
    createDecoder() {
      opened++; active++; maxActive = Math.max(maxActive, active)
      let done = false, cancel
      return { available,
        decode: (encoded, mime, isCurrent) => {
          assert.equal(encoded, 'iVBORw=='); assert.equal(mime, 'image/png')
          const work = decode ? decode(isCurrent) : Promise.resolve({ scanType: 'WX_CODE', rawBase64 })
          return Promise.race([work, new Promise(resolve => { cancel = resolve })])
        },
        close() { if (done) return; done = true; closed++; active--; cancel?.({ error: 'CANCELLED' }) }
      }
    }
  })
  client.setActive(true)
  return { client, events, task, response, setTime: value => { time = value }, setIdentity: value => { identity = value },
    get opened() { return opened }, get closed() { return closed }, get maxActive() { return maxActive } }
}
const registers = h => h.events.filter(([name]) => name === 'register')
{
  const h = harness(); await h.client.registerImage(url)
  assert.equal(registers(h).length, 1)
  assert.deepEqual(registers(h)[0][1], { taskId: h.task.id, ticket: h.task.ticket, rawBase64 })
  assert.equal(h.closed, 1, 'Worker is released after successful own-image registration')
  await h.client.registerImage(url); assert.equal(h.opened, 1, 'same URL is deduplicated until task expiry')
}
for (const options of [{ headers: false }, { available: false }]) {
  const h = harness(options); await h.client.registerImage(url)
  assert.equal(registers(h).length, 0)
  if (!options.headers && options.headers !== undefined) assert.equal(h.opened, 0, 'old backend never loads the decoder')
  await h.client.registerImage(url); assert.equal(h.events.filter(([name]) => name === 'image').length, 1)
}
for (const reason of ['hidden', 'refresh', 'account', 'expiry', 'unmount']) {
  let complete, current = true
  const h = harness({ decode: () => new Promise(resolve => { complete = resolve }) })
  const pending = h.client.registerImage(url, () => current); await flush()
  assert.equal(h.opened, 1)
  if (reason === 'hidden') h.client.setActive(false)
  else if (reason === 'refresh') h.client.forget(url)
  else if (reason === 'account') h.setIdentity('new-login')
  else if (reason === 'expiry') h.setTime(h.task.expiresAt)
  else current = false
  complete({ scanType: 'WX_CODE', rawBase64 }); await pending
  assert.equal(registers(h).length, 0, reason + ': no late registration')
  assert.equal(h.closed, 1)
}
{
  const finishes = [], h = harness({ decode: () => new Promise(resolve => { finishes.push(resolve) }) })
  const first = h.client.registerImage(url + '?v=1'), second = h.client.registerImage(url + '?v=2')
  await flush(); assert.equal(finishes.length, 1)
  finishes[0]({ scanType: 'WX_CODE', rawBase64 }); await first; await flush()
  assert.equal(finishes.length, 2)
  finishes[1]({ scanType: 'WX_CODE', rawBase64 }); await second
  assert.equal(h.maxActive, 1, 'different displayed URLs share one decoder lane')
  assert.equal(registers(h).length, 2); assert.equal(h.closed, 2)
}
{
  let current = true
  const h = harness({ decode: () => new Promise(() => {}) })
  const pending = h.client.registerImage(url, () => current); await flush()
  const release = h.client.prioritize(); await pending
  assert.equal(h.closed, 1, 'camera priority immediately terminates own-image decoding')
  await h.client.registerImage(url); assert.equal(h.opened, 1)
  current = false; release(); release(); await flush()
  assert.equal(h.opened, 1, 'closing a stale camera does not revive an obsolete code')
}
{
  const h = harness({ register: () => { throw new Error('old server') } })
  await h.client.registerImage(url); assert.equal(h.closed, 1, 'registration failure still releases resources')
}
for (const bad of [baseUrl + '.evil/api/registration/wechat-qrcode', 'file:///image.png']) {
  const h = harness(); await h.client.registerImage(bad); assert.equal(h.events.length, 0)
}
console.log('PASS H5 own-generated registration, anonymous receipt, old backend, single lane, expiry/lifecycle/account guards, scanner priority and resource cleanup')
