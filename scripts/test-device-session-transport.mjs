import assert from 'node:assert/strict'
import { createDeviceSessionTransport } from '../src/utils/device-session-transport.mjs'

function harness(initialToken = 'token-a') {
  let now = 0
  let timerId = 0
  let token = initialToken
  const timers = new Map()
  const sockets = []
  const transport = createDeviceSessionTransport({
    getToken: () => token,
    getBaseUrl: () => 'https://example.test/',
    random: () => .5,
    setTimeout: (callback, delay) => {
      const id = ++timerId
      timers.set(id, { callback, at: now + delay })
      return id
    },
    clearTimeout: id => timers.delete(id),
    connectSocket: options => {
      const handlers = {}
      const task = {
        url: options.url, sent: [], closed: false,
        onOpen: callback => { handlers.open = callback },
        onMessage: callback => { handlers.message = callback },
        onClose: callback => { handlers.close = callback },
        onError: callback => { handlers.error = callback },
        send: ({ data }) => task.sent.push(JSON.parse(data)),
        close: () => { task.closed = true; handlers.close?.({ code: 1000 }) },
        message: value => handlers.message({ data: JSON.stringify(value) }),
        open: () => handlers.open(),
        error: () => handlers.error({})
      }
      sockets.push(task)
      return task
    }
  })
  return {
    transport, sockets, timers,
    token: value => { token = value },
    advance: milliseconds => {
      const end = now + milliseconds
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        now = next[1].at
        timers.delete(next[0])
        next[1].callback()
      }
      now = end
    }
  }
}

const ready = { type: 'ready', version: 1, capabilities: ['device.session.changed'] }
const ack = deviceId => ({ type: 'subscribed', version: 1, deviceId })
const h = harness()
const states = []
let changes = 0
const offA = h.transport.subscribe(14, { onState: state => states.push(state), onChange: () => changes++ })
const offB = h.transport.subscribe(14, { onChange: () => changes++ })
assert.equal(h.sockets.length, 1, 'consumers share a socket')
const first = h.sockets[0]
assert.equal(first.url, 'wss://example.test/ws/device/session?token=token-a')
first.open()
assert.notEqual(states.at(-1), 'online', 'open alone is not protocol support')
first.message(ready)
assert.deepEqual(first.sent, [{ type: 'subscribe', deviceId: '14' }])
first.message(ack(14))
assert.equal(states.at(-1), 'online')
first.message({ type: 'device.session.changed', version: 1, deviceId: '99' })
assert.equal(changes, 0)
first.message({ type: 'device.session.changed', version: 1, deviceId: '14' })
assert.equal(changes, 2)
offA()
assert.equal(first.closed, false, 'one view cannot close another view socket')
const offC = h.transport.subscribe(15, {})
first.message(ack(15))
offB()
assert.deepEqual(first.sent.at(-1), { type: 'unsubscribe', deviceId: '14' })
h.token('token-b')
h.advance(25000)
assert.equal(first.closed, true, 'changing accounts invalidates the previous socket')
h.advance(1000)
assert.equal(h.sockets.length, 2)
assert.match(h.sockets[1].url, /token=token-b$/)
h.sockets[1].message(ready)
h.sockets[1].message(ack(15))
offC()
assert.equal(h.timers.size, 0, 'last consumer releases all timers')

const legacy = harness()
const legacyStates = []
const offLegacy = legacy.transport.subscribe(14, { onState: state => legacyStates.push(state) })
legacy.sockets[0].open()
legacy.advance(5000)
assert.equal(legacyStates.at(-1), 'offline', 'old servers retain polling')
legacy.advance(1000)
assert.equal(legacy.sockets.length, 2)
legacy.advance(5000)
legacy.advance(1999)
assert.equal(legacy.sockets.length, 2, 'reconnect uses exponential backoff')
legacy.advance(1)
assert.equal(legacy.sockets.length, 3)
offLegacy()
assert.equal(legacy.timers.size, 0)

const heartbeat = harness()
const offHeartbeat = heartbeat.transport.subscribe(14, {})
heartbeat.sockets[0].message(ready)
heartbeat.sockets[0].message(ack(14))
heartbeat.advance(25000)
assert.equal(heartbeat.sockets[0].sent.at(-1).type, 'ping')
heartbeat.sockets[0].message({ type: 'pong' })
heartbeat.advance(25000)
assert.equal(heartbeat.sockets[0].closed, false)
heartbeat.advance(10000)
assert.equal(heartbeat.sockets[0].closed, true, 'missing heartbeat falls back')
offHeartbeat()

const auth = harness()
const offAuth = auth.transport.subscribe(14, {})
auth.sockets[0].message({ type: 'error', code: 401 })
auth.advance(120000)
assert.equal(auth.sockets.length, 1, 'invalid credentials do not reconnect repeatedly')
auth.token('replacement-token')
const offNew = auth.transport.subscribe(14, {})
assert.equal(auth.sockets.length, 2)
offAuth()
offNew()
assert.equal(auth.timers.size, 0)

const guest = harness('')
const offGuest = guest.transport.subscribe(14, {})
assert.equal(guest.sockets.length, 0)
offGuest()
console.log('Device transport passed: shared connections, protocol acknowledgement, scoped messages, auth changes, old servers, backoff, heartbeat and cleanup.')
