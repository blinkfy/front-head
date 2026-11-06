import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createLiveLocationController } from '../src/utils/live-location-core.mjs'
import { wgs84ToGcj02 } from '../src/utils/live-location-coordinates.mjs'
import mapCoordinates from '../../back-end/utils/mapCoordinates.js'
import { createChatEventsTransport } from '../src/utils/chat-events-transport.mjs'

const failures = []
async function check(name, run) {
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.message}`) }
}

function fakeClock() {
  let time = 1000, next = 1
  const tasks = new Map()
  return {
    now: () => time,
    setTimer(fn, delay) { const id = next++; tasks.set(id, { at: time + delay, fn }); return id },
    clearTimer(id) { tasks.delete(id) },
    pending: () => tasks.size,
    advance(ms) {
      const target = time + ms
      while (true) {
        let selectedId, selected
        for (const [id, task] of tasks) if (task.at <= target && (!selected || task.at < selected.at)) { selectedId = id; selected = task }
        if (!selected) break
        time = selected.at; tasks.delete(selectedId); selected.fn()
      }
      time = target
    }
  }
}

function harness({ managesTimeout = false } = {}) {
  const clock = fakeClock(), sent = [], watches = []
  let owner = 'owner-a'
  const tracker = {
    supported: () => true,
    managesTimeout: () => managesTimeout,
    watch(success, failure) {
      const handle = { success, failure, stopped: 0 }
      watches.push(handle)
      return () => { handle.stopped++ }
    }
  }
  const controller = createLiveLocationController({
    send: event => { sent.push(event); return true }, tracker,
    getOwner: () => owner, getSelfId: () => '1', now: clock.now,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer, createId: () => 'session_1234567890'
  })
  controller.setActive(true)
  controller.connection(true, 1)
  controller.handle({ type: 'location.ready', version: 1 })
  return { controller, sent, watches, clock, setOwner: value => { owner = value } }
}

const peer = { id: '2', name: 'Peer' }
const point = (latitude = 31.23, longitude = 121.47, accuracy = 5) => ({ latitude, longitude, accuracy, coordinateSystem: 'wgs84' })
const joined = sessionId => ({ type: 'location.joined', sessionId, people: [] })
function enterAndAck(h = harness()) {
  h.controller.enter(peer)
  const start = h.sent.find(event => event.type === 'location.start')
  h.controller.handle(joined(start.sessionId))
  return { ...h, sessionId: start.sessionId }
}

await check('offer and ready do not locate; entry joins only after explicit enter and ack', () => {
  const h = harness(), offer = { type: 'location.offer', sessionId: 'offer_123456789', from: peer, to: { id: '1' } }
  h.controller.handle(offer)
  assert.equal(h.watches.length, 0, 'an offer alone must not start GPS')
  assert.equal(h.sent.filter(event => event.type === 'location.join').length, 0)
  h.controller.enter(peer, offer.sessionId)
  assert.equal(h.sent.at(-1).type, 'location.join')
  assert.equal(h.watches.length, 0, 'join request must wait for server joined ack')
  h.controller.handle(joined(offer.sessionId))
  assert.equal(h.watches.length, 1)
})

await check('peer point updates state without being persisted or re-broadcast', () => {
  const h = enterAndAck(), before = h.sent.length, peerPoint = point(31.24, 121.48)
  h.controller.handle({ type: 'location.point', sessionId: h.sessionId, userId: '2', point: peerPoint })
  assert.deepEqual(h.controller.state().peerPoint, peerPoint)
  assert.equal(h.sent.length, before, 'incoming peer point is never echoed')
  assert.equal(h.controller.state().peerJoined, true)
})

await check('self-only joined update clears departed peer while local GPS keeps running', () => {
  const h = enterAndAck(), id = h.sessionId, watch = h.watches[0]
  h.controller.handle({ type: 'location.point', sessionId: id, userId: '2', point: point(31.24, 121.48) })
  assert.equal(h.controller.state().peerJoined, true)
  assert.ok(h.controller.state().peerPoint)
  h.controller.handle({ type: 'location.joined', sessionId: id, people: [{ userId: '1', point: point() }] })
  assert.equal(h.controller.state().peerJoined, false)
  assert.equal(h.controller.state().peerPoint, null)
  assert.equal(h.controller.state().locating, true, 'peer departure does not stop this member GPS')
  assert.equal(h.watches.length, 1, 'peer departure does not restart or replace the local watch')
  assert.equal(watch.stopped, 0)
})

await check('ended session can be explicitly rejoined after a replayed offer', () => {
  const h = enterAndAck(), id = h.sessionId
  h.controller.end('left')
  h.controller.handle({ type: 'location.offer', sessionId: id, from: peer, to: { id: '1' } })
  assert.equal(h.watches[0].stopped, 1, 'an offer does not resume GPS automatically')
  assert.equal(h.sent.filter(event => event.type === 'location.join' && event.sessionId === id).length, 0)
  h.controller.enter(peer, id)
  assert.equal(h.sent.filter(event => event.type === 'location.join' && event.sessionId === id).length, 1,
    'explicit enter sends a new join for the existing session')
  assert.equal(h.watches.length, 1, 'GPS waits for the new joined acknowledgement')
  h.controller.handle(joined(id))
  assert.equal(h.watches.length, 2, 'the explicit rejoin acknowledgement starts GPS again')
})

await check('end while join ack is pending sends leave and late joined cannot restart GPS', () => {
  const h = harness()
  h.controller.enter(peer)
  const id = h.sent.find(event => event.type === 'location.start').sessionId
  h.controller.end('left')
  assert(h.sent.some(event => event.type === 'location.leave' && event.sessionId === id))
  h.controller.handle(joined(id))
  assert.equal(h.watches.length, 0)
})

await check('disconnect, background, and end stop tracker and ignore late callbacks', () => {
  for (const stop of [h => h.controller.connection(false), h => h.controller.setActive(false), h => h.controller.end('left')]) {
    const h = enterAndAck(), watch = h.watches[0]
    stop(h)
    watch.success(point())
    assert.equal(watch.stopped, 1)
    assert.equal(h.sent.filter(event => event.type === 'location.point').length, 0)
  }
})

await check('owner invalidation stops tracking and late callbacks cannot send', () => {
  const h = enterAndAck(), watch = h.watches[0]
  h.setOwner('owner-b')
  watch.success(point())
  assert.equal(watch.stopped, 1, 'invalid owner must release the active GPS watch')
  assert.equal(h.sent.filter(event => event.type === 'location.point').length, 0)
})

await check('permission denial ends session and stops tracker', () => {
  const h = enterAndAck(), watch = h.watches[0]
  watch.failure({ code: 1 })
  assert.equal(watch.stopped, 1)
  assert.equal(h.controller.state().reason, 'permission_denied')
  assert.equal(h.controller.state().locating, false)
})

await check('native tracker owns first-fix timeout while H5 keeps the JS timeout', () => {
  const native = enterAndAck(harness({ managesTimeout: true }))
  assert.equal(native.clock.pending(), 0, 'native watcher manages its own first-fix deadline')
  native.watches[0].success(point())
  assert.deepEqual(native.controller.state().selfPoint && { ...native.controller.state().selfPoint, updatedAt: undefined },
    { ...point(), updatedAt: undefined })

  const h5 = enterAndAck()
  assert.equal(h5.clock.pending(), 1, 'web tracker still schedules the first-fix timeout')
  h5.clock.advance(20000)
  assert.equal(h5.controller.state().reason, 'unavailable', 'web tracker still stops when no fix arrives')
})

await check('points merge to latest during five second throttle without interval polling', () => {
  const h = enterAndAck(), watch = h.watches[0], id = h.sessionId
  watch.success(point())
  assert.equal(h.sent.filter(event => event.type === 'location.point').length, 1)
  h.clock.advance(1000)
  watch.success(point(31.231, 121.471))
  h.clock.advance(2000)
  watch.success(point(31.232, 121.472))
  h.clock.advance(2000)
  const points = h.sent.filter(event => event.type === 'location.point')
  assert.equal(points.length, 2)
  assert.equal(points[1].sessionId, id)
  assert.equal(points[1].point.latitude, 31.232, 'flush must send the latest merged location')
  assert.equal(h.clock.pending(), 0, 'there is no recurring interval timer')
})

await check('movement under ten metres is suppressed for thirty seconds without polling', () => {
  const h = enterAndAck(), watch = h.watches[0]
  watch.success(point())
  h.clock.advance(1000)
  watch.success(point(31.23001, 121.47001))
  h.clock.advance(4000)
  assert.equal(h.sent.filter(event => event.type === 'location.point').length, 1)
  assert.equal(h.clock.pending(), 0, 'suppressed movement schedules no periodic work')
  h.clock.advance(26000)
  assert.equal(h.sent.filter(event => event.type === 'location.point').length, 1)
  watch.success(point(31.23002, 121.47002))
  assert.equal(h.sent.filter(event => event.type === 'location.point').length, 2, 'a new GPS fix after 30s can send')
})

await check('duplicate peer joined status does not clear first-fix timeout; no point means waiting', () => {
  const h = harness()
  h.controller.enter(peer)
  const id = h.sent.find(event => event.type === 'location.start').sessionId
  h.controller.handle({ type: 'location.joined', sessionId: id, people: [{ userId: '2' }] })
  assert.equal(h.controller.state().peerJoined, true)
  assert.equal(h.watches.length, 1)
  assert.equal(h.controller.state().selfPoint, null, 'joined status alone is not a location fix')
  h.clock.advance(19000)
  h.controller.handle({ type: 'location.joined', sessionId: id, people: [{ userId: '2' }] })
  h.clock.advance(1000)
  assert.equal(h.controller.state().reason, 'unavailable')
  assert.equal(h.watches[0].stopped, 1)
})

function preprocessTracker(platform) {
  const source = fs.readFileSync(new URL('../src/utils/live-location-tracker.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
  const conditions = [], output = []
  let active = true
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\s*\/\/\s*#(ifdef|ifndef)\s+(.+)\s*$/)
    if (directive) {
      const [, kind, expression] = directive
      const tokens = expression.trim().split(/\s+/)
      const result = tokens.some(token => platform[token] === true)
      conditions.push({ parent: active, branch: kind === 'ifdef' ? result : !result })
      active = active && conditions.at(-1).branch
      continue
    }
    if (/^\s*\/\/\s*#endif\s*$/.test(line)) {
      const item = conditions.pop()
      active = item.parent
      continue
    }
    if (active) output.push(line)
  }
  assert.equal(conditions.length, 0, 'all conditional compilation blocks must close')
  return output.join('\n').replace('export const liveLocationTracker =', 'const liveLocationTracker =') + '\nglobalThis.liveLocationTracker = liveLocationTracker;'
}

function loadTracker(platform, context) {
  context.androidRealtimeAvailable ??= () => false
  context.watchAndroidRealtimeLocation ??= () => () => {}
  vm.createContext(context)
  vm.runInContext(preprocessTracker(platform), context)
  return context.liveLocationTracker
}

await check('H5 tracker uses secure WGS84 watch, clearWatch, denial and ignores late callbacks', () => {
  let success, failure, cleared = []
  const context = { globalThis: null, isSecureContext: true, navigator: { geolocation: {
    watchPosition(ok, fail, options) { success = ok; failure = fail; context.options = options; return 41 },
    clearWatch(id) { cleared.push(id) }
  } } }
  context.globalThis = context
  const tracker = loadTracker({ 'APP-PLUS': false, H5: true }, context)
  assert.equal(tracker.supported(), true)
  assert.equal(tracker.managesTimeout(), false, 'H5 tracker leaves first-fix timeout to JavaScript')
  const fixes = [], errors = []
  const stop = tracker.watch(value => fixes.push(value), error => errors.push(error))
  success({ coords: { latitude: 31.23, longitude: 121.47, accuracy: 8 } })
  assert.deepEqual(JSON.parse(JSON.stringify(fixes[0])), { latitude: 31.23, longitude: 121.47, accuracy: 8, coordinateSystem: 'wgs84' })
  assert.equal(context.options.enableHighAccuracy, true)
  failure({ code: 1 })
  assert.equal(errors.length, 1)
  stop(); success({ coords: { latitude: 1, longitude: 2, accuracy: 1 } })
  assert.equal(cleared[0], 41)
  assert.equal(fixes.length, 1, 'late callbacks after stop are ignored')
})

await check('H5 tracker reports unsupported outside secure context', () => {
  const context = { globalThis: null, isSecureContext: false, navigator: { geolocation: { watchPosition() {} } } }
  context.globalThis = context
  assert.equal(loadTracker({ 'APP-PLUS': false, H5: true }, context).supported(), false)
})

await check('App tracker uses GPS WGS84 watch and clearWatch, ignores late callbacks', () => {
  let success, cleared = []
  const context = { globalThis: null, plus: { geolocation: {
    watchPosition(ok, _fail, options) { success = ok; context.options = options; return 'watch-id' },
    clearWatch(id) { cleared.push(id) }
  } } }
  context.globalThis = context
  const tracker = loadTracker({ 'APP-PLUS': true, H5: false }, context)
  assert.equal(tracker.managesTimeout(), false, 'non-native App GPS keeps the controller timeout')
  assert.equal(tracker.supported(), true)
  const fixes = [], stop = tracker.watch(value => fixes.push(value), () => {})
  assert.equal(context.options.coordsType, 'gps')
  success({ coords: { latitude: 31.23, longitude: 121.47, accuracy: 4 } })
  assert.equal(fixes[0].coordinateSystem, 'wgs84')
  stop(); success({ coords: { latitude: 1, longitude: 2, accuracy: 1 } })
  assert.deepEqual(cleared, ['watch-id'])
  assert.equal(fixes.length, 1)
})

await check('Android App tracker selects native realtime location watch', () => {
  let nativeSuccess, stopped = 0, fallbackWatches = 0
  const context = { globalThis: null, plus: { os: { name: 'Android' }, geolocation: {
    watchPosition() { fallbackWatches++; return 42 }, clearWatch() {}
  } }, androidRealtimeAvailable: () => true,
  watchAndroidRealtimeLocation(success) { nativeSuccess = success; return () => { stopped++ } } }
  context.globalThis = context
  const tracker = loadTracker({ 'APP-PLUS': true, H5: false }, context)
  assert.equal(tracker.managesTimeout(), true, 'native Android tracker owns its timeout')
  const fixes = [], errors = []
  const stop = tracker.watch(value => fixes.push(value), error => errors.push(error))
  nativeSuccess({ coords: { latitude: 31.23, longitude: 121.47, accuracy: 4 } })
  assert.deepEqual(JSON.parse(JSON.stringify(fixes[0])), { latitude: 31.23, longitude: 121.47, accuracy: 4, coordinateSystem: 'wgs84' })
  assert.equal(errors.length, 0)
  stop()
  assert.equal(stopped, 1)
  assert.equal(fallbackWatches, 0, 'Android uses the native location subscription')
})

await check('WGS84 to GCJ02 matches backend map coordinate conversion', () => {
  for (const location of [{ latitude: 31.23, longitude: 121.47 }, { latitude: 39.9, longitude: 116.4 }, { latitude: 40.7, longitude: -74.0 }]) {
    const expected = mapCoordinates.wgs84ToGcj02(location.latitude, location.longitude)
    const actual = wgs84ToGcj02(location.latitude, location.longitude)
    assert(Math.abs(actual.latitude - expected.latitude) < 1e-10)
    assert(Math.abs(actual.longitude - expected.longitude) < 1e-10)
  }
})

await check('shared transport forwards location events only on the current authenticated account', () => {
  let owner = 'account-a', socket
  const events = []
  const transport = createChatEventsTransport({ getToken: () => owner, getBaseUrl: () => 'https://example.test',
    connectSocket() {
      socket = { sent: [], onMessage(fn) { this.message = fn }, onClose() {}, onError() {}, close() {}, send(value) { this.sent.push(value) } }
      return socket
    }, onEvent: value => events.push(value), setTimer: () => 1, clearTimer() {} })
  transport.setActive(true)
  assert.equal(transport.send({ type: 'location.join' }), false)
  socket.message({ data: JSON.stringify({ type: 'connected', liveLocationVersion: 1 }) })
  const offer = { type: 'location.offer', sessionId: 'location-session-1', from: { id: 2 }, to: { id: 1 } }
  socket.message({ data: JSON.stringify(offer) })
  assert.deepEqual(events, [offer])
  assert.equal(transport.send({ type: 'location.join', sessionId: offer.sessionId }), true)
  owner = 'account-b'
  assert.equal(transport.send({ type: 'location.point' }), false)
  socket.message({ data: JSON.stringify({ type: 'location.point', point: { latitude: 1 } }) })
  assert.equal(events.length, 1, 'old-account positions are never delivered after switching accounts')
  transport.setActive(false)
})

await check('native heartbeat keeps a healthy transport alive across suspended JavaScript time', () => {
  const realNow = Date.now
  let now = realNow(), scheduled, socket, closed = 0, owner = 'account-native'
  const transport = createChatEventsTransport({ getToken: () => owner, getBaseUrl: () => 'https://example.test',
    connectSocket() {
      socket = { alive: true, sent: [], isAlive() { return this.alive }, onMessage(fn) { this.message = fn },
        onClose(fn) { this.closeHandler = fn }, onError(fn) { this.errorHandler = fn },
        close() { closed++ }, send(value) { this.sent.push(value) } }
      return socket
    }, setTimer(fn) { scheduled = fn; return 1 }, clearTimer() {} })
  try {
    Date.now = () => now
    transport.setActive(true)
    socket.message({ data: JSON.stringify({ type: 'connected', realtimeBackgroundVersion: 1 }) })
    now += 60000
    transport.setActive(true) // Foreground resume rechecks the same native socket.
    assert.equal(transport.isConnected(), true, 'native alive signal refreshes the pong age')
    assert.equal(closed, 0, 'foreground resume does not close a healthy native socket')
    assert.equal(transport.send({ type: 'ping' }), true)
    socket.alive = false
    now += 45001
    scheduled()
    assert.equal(transport.isConnected(), false, 'a dead native socket still expires after heartbeat grace')
    assert.equal(closed, 1)
  } finally {
    Date.now = realNow
    transport.setActive(false)
  }
})

if (failures.length) {
  console.error(`\n${failures.length} live-location check(s) failed.`)
  process.exitCode = 1
} else console.log('\nAll live-location checks passed.')
