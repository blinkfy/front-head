import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createChatEnvironment, toChatMapLocation } from '../src/pages-nonTheme/utils/ai-chat-environment.mjs'
import mapCoordinates from '../../back-end/utils/mapCoordinates.js'
import { normalizeChatDisposalPoints } from '../src/pages-nonTheme/utils/ai-chat-disposal.mjs'

async function testSuccessCacheAndSanitization() {
  let clock = Date.parse('2026-11-04T03:00:00.000Z')
  let locateCalls = 0, reverseCalls = 0, nearbyCalls = 0
  let requestOrigin
  const env = createChatEnvironment({
    now: () => clock,
    coordinateSystem: 'wgs84',
    locate: async () => { locateCalls++; return { latitude: 31.23, longitude: 121.47 } },
    reverseGeocode: async origin => {
      reverseCalls++; requestOrigin = origin
      throw new Error('address unavailable')
    },
    loadNearby: async origin => {
      nearbyCalls++; requestOrigin = origin
      return { code: 0, data: [
        ...Array.from({ length: 4 }, (_, i) => ({ id: i, name: `点位${i}`, description: 'x'.repeat(180), latitude: origin.latitude + (i + 1) * .0001, longitude: origin.longitude })),
        { id: 5, name: '超出5km', latitude: origin.latitude + .1, longitude: origin.longitude }
      ] }
    }
  })

  await Promise.all(Array.from({ length: 20 }, () => env.prepare()))
  const context = await env.forRequest(1)
  assert.equal(context.location.status, 'available')
  assert.equal(context.location.nearbyStatus, 'available', 'nearby results survive reverse-geocoder failure')
  assert.equal(context.location.nearby.length, 3, 'only three nearest results are exposed')
  assert(context.location.nearby.every(point => point.distanceMeters <= 5000))
  assert(context.location.nearby.every(point => point.description.length <= 120))
  assert.deepEqual(context.location.area, {}, 'failed address lookup leaves area unset while preserving nearby results')
  assert.equal('latitude' in context.location, false)
  assert.equal('longitude' in context.location, false)
  assert.deepEqual(requestOrigin, toChatMapLocation({ latitude: 31.23, longitude: 121.47 }, 'wgs84'))
  const serialized = JSON.stringify(context)
  assert(!serialized.includes('31.23') && !serialized.includes('121.47'), 'exact coordinates must not enter request context')
  assert.equal(locateCalls, 1)
  await Promise.all(Array.from({ length: 20 }, () => env.prepare()))
  assert.equal(locateCalls, 1, 'prepared environment is cached before expiry')
  assert.equal(reverseCalls, 1)
  assert.equal(nearbyCalls, 1)
  clock += 5 * 60 * 1000
  await env.prepare()
  assert.equal(locateCalls, 2, 'environment refreshes at five-minute expiry')
  env.dispose()
}

async function testAreaContextSurvivesConsecutiveRequests() {
  let locateCalls = 0, reverseCalls = 0, nearbyCalls = 0
  const env = createChatEnvironment({
    coordinateSystem: 'gcj02',
    locate: async () => { locateCalls++; return { latitude: 36.08, longitude: 120.18 } },
    reverseGeocode: async () => {
      reverseCalls++
      return { code: 0, data: { address_component: { province: '山东省', city: '青岛市', district: '黄岛区' } } }
    },
    loadNearby: async () => { nearbyCalls++; throw new Error('nearby lookup unavailable') }
  })

  await env.prepare()
  const first = await env.forRequest(1)
  const second = await env.forRequest(1)
  assert.equal(first.location.status, 'available')
  assert.equal(first.location.area.city, '青岛市')
  assert.equal(first.location.area.district, '黄岛区')
  assert.deepEqual(second.location.area, first.location.area, 'the next request retains the resolved city and district')
  assert.equal(second.location.nearbyStatus, 'unavailable', 'nearby lookup failure does not invalidate location area')
  assert.deepEqual(second.location.nearby, [])
  assert.equal(locateCalls, 1, 'consecutive requests reuse the cached location')
  assert.equal(reverseCalls, 1, 'consecutive requests reuse the cached reverse-geocoded area')
  assert.equal(nearbyCalls, 1)
  env.dispose()
}

async function testPermissionFailureAndTimeoutDoNotBlock() {
  const denied = createChatEnvironment({ locate: async () => { throw new Error('permission denied') }, timeoutMs: 20 })
  const deniedStarted = Date.now()
  await denied.prepare()
  assert(Date.now() - deniedStarted < 250)
  assert.equal((await denied.forRequest(1)).location.status, 'unavailable')
  denied.dispose()

  const timedOut = createChatEnvironment({ locate: () => new Promise(() => {}), timeoutMs: 20 })
  const started = Date.now()
  await timedOut.prepare()
  assert(Date.now() - started < 250, 'unresolved geolocation is bounded')
  assert.equal((await timedOut.forRequest(1)).location.status, 'unavailable')
  timedOut.dispose()

  const slow = createChatEnvironment({ locate: () => new Promise(() => {}), timeoutMs: 500 })
  const requestStarted = Date.now()
  const context = await slow.forRequest(15)
  assert(Date.now() - requestStarted < 150, 'forRequest returns before slow geolocation completes')
  assert.equal(context.location.status, 'locating')
  slow.dispose()
}

async function testStopCancelsPendingPreparation() {
  const source = fs.readFileSync(new URL('../src/pages-nonTheme/ai-chat.vue', import.meta.url), 'utf8')
  const sendStart = source.indexOf('async function onSend() {')
  const stopStart = source.indexOf('function onStop() {', sendStart)
  const lifecycleStart = source.indexOf('// ─── 生命周期', stopStart)
  assert(sendStart >= 0 && stopStart > sendStart && lifecycleStart > stopStart)
  const sendSource = source.slice(sendStart, stopStart)
  const stopSource = source.slice(stopStart, lifecycleStart)
  const pending = []
  const streamed = []
  const pushed = []
  const context = {
    isStreaming: { value: false }, imagePreparing: { value: false }, promptText: { value: 'test' },
    pickedImageDataUrl: { value: '' }, pickedImageLocalPath: { value: '' }, streamingMessageId: { value: '' },
    streamingText: { value: '' }, streamingReasoning: { value: '' }, isDeepThinking: { value: false },
    streamingSearch: { value: null }, isSearchEnabled: { value: true }, finalizeChatSearch: value => value, normalizeChatDisposalPoints,
    pendingMessagePreparation: null, abortCtrl: null, wsSocket: null, streamStopRequested: false,
    createMessageId: () => 'id', dataUrlByteLength: () => 0, MAX_IMAGE_BYTES: 100,
    extractPendingPersistMessages: async () => [], extractHistoryForRequest: () => [],
    getStorage: () => 'token', chatEnvironment: { forRequest: () => new Promise(resolve => pending.push(resolve)) },
    pushMessageToActive: (...args) => pushed.push(args), clearPickedImage() {},
    streamChat: async () => { streamed.push(true); return { content: 'ok', reasoning: '' } },
    markPendingPersistMessagesSaved() {}, uni: { showToast() {} }
  }
  vm.createContext(context)
  vm.runInContext(`${sendSource}\n${stopSource}\nglobalThis.runSend = onSend; globalThis.runStop = onStop;`, context)

  const oldRequest = context.runSend()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(pending.length, 1, 'first send reached asynchronous environment preparation')
  context.runStop()
  assert.equal(context.isStreaming.value, false)

  context.promptText.value = 'next request'
  const newRequest = context.runSend()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(pending.length, 2)
  pending[0]({ location: { status: 'unavailable' } })
  await oldRequest
  assert.equal(context.isStreaming.value, true, 'old canceled finally must not reset the newer request state')
  assert.equal(context.pendingMessagePreparation?.canceled, false)
  assert.equal(streamed.length, 0, 'canceled request must not be sent')

  pending[1]({ location: { status: 'unavailable' } })
  await newRequest
  assert.equal(streamed.length, 1)
  assert.equal(pushed.length, 2)
  assert.equal(context.isStreaming.value, false)
}

const location = { latitude: 31.23, longitude: 121.47 }
const expected = mapCoordinates.wgs84ToGcj02(location.latitude, location.longitude)
const actual = toChatMapLocation(location, 'wgs84')
assert(Math.abs(actual.latitude - expected.latitude) < 1e-10)
assert(Math.abs(actual.longitude - expected.longitude) < 1e-10)
assert.deepEqual(toChatMapLocation(location, 'gcj02'), location)
await testSuccessCacheAndSanitization()
await testAreaContextSurvivesConsecutiveRequests()
await testPermissionFailureAndTimeoutDoNotBlock()
await testStopCancelsPendingPreparation()
console.log('ai-chat-environment frontend checks passed')
