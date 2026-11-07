import assert from 'node:assert/strict'
import { chooseMiniPoint, chooseMiniShippingAddress, createMiniLocationWatcher } from '../src/utils/mini-location-core.mjs'

const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
const coords = { latitude: 31.23, longitude: 121.47, accuracy: 12 }
const apiPoint = { ...coords, name: '测试地点', address: '测试路1号' }
const fail = message => options => options.fail({ errMsg: message })
let fallbackCalls = 0
const chooser = {
  chooseLocation: fail('chooseLocation:fail not support'),
  choosePoi(options) { fallbackCalls++; options.success({ ...apiPoint, type: 2 }) }
}
assert.equal((await chooseMiniPoint(chooser)).name, '测试地点')
assert.equal(fallbackCalls, 1)
for (const reason of ['chooseLocation:fail cancel', 'chooseLocation:fail auth deny', 'chooseLocation:fail privacy authorization required']) {
  chooser.chooseLocation = fail(reason)
  await assert.rejects(chooseMiniPoint(chooser))
}
assert.equal(fallbackCalls, 1, 'cancel/permission refusal does not open a second picker')
chooser.chooseLocation = fail('not support')
await assert.rejects(chooseMiniPoint(chooser, { enhanced: false }))
assert.equal(fallbackCalls, 1, 'rollback retains the original chooser only')
chooser.choosePoi = options => options.success({ type: 1, name: '上海', latitude: 31, longitude: 121 })
await assert.rejects(chooseMiniPoint(chooser), /具体地点/)
let pendingChoice, current = true
const choice = chooseMiniPoint({ chooseLocation(options) { pendingChoice = options } }, { isCurrent: () => current })
current = false; pendingChoice.success(apiPoint)
await assert.rejects(choice, error => error.code === 'cancelled', 'late selection cannot update an exited page')
const address = await chooseMiniShippingAddress({ chooseAddress: options => options.success({ provinceName: '上海市', cityName: '上海市', countyName: '徐汇区', detailInfo: '测试路1号', userName: '张三', telNumber: '13800000000' }) })
assert.equal(address.address, '上海市徐汇区测试路1号')
assert.equal(address.recipientName, '张三')
assert.equal(address.parts.district, '徐汇区')

function native() {
  const changes = new Set(), errors = new Set(), starts = [], stops = [], gets = [], timers = new Map()
  let next = 0
  const api = {
    onLocationChange: cb => changes.add(cb), offLocationChange: cb => changes.delete(cb),
    onLocationChangeError: cb => errors.add(cb), offLocationChangeError: cb => errors.delete(cb),
    startLocationUpdate: options => starts.push(options), stopLocationUpdate: options => { stops.push(options); options.success({}) },
    getLocation: options => gets.push(options)
  }
  return { api, changes, errors, starts, stops, gets, timers,
    setTimer: (cb, delay) => { const id = ++next; timers.set(id, { cb, delay }); return id },
    clearTimer: id => timers.delete(id) }
}
{
  const n = native(), points = [], errors = []
  const watch = createMiniLocationWatcher(n)
  const stop = watch(p => points.push(p), e => errors.push(e))
  await flush()
  assert.equal(n.starts[0].type, 'wgs84')
  n.starts[0].success({}); await flush()
  n.gets[0].success(coords); await flush()
  assert.equal(points[0].coordinateSystem, 'wgs84')
  const callback = [...n.changes][0]
  stop(); await flush()
  callback(coords)
  assert.equal(points.length, 1)
  assert.equal(n.changes.size, 0); assert.equal(n.errors.size, 0)
  assert.equal(n.stops.length, 1); assert.equal(errors.length, 0)
}
{
  const n = native(), points = [], errors = []
  const stop = createMiniLocationWatcher(n)(p => points.push(p), e => errors.push(e))
  await flush(); n.starts[0].success({}); await flush()
  ;[...n.changes][0](coords)
  n.gets[0].fail({ errMsg: 'getLocation:fail timeout' }); await flush()
  assert.equal(points.length, 1)
  assert.equal(errors.length, 0, 'a late prime failure cannot stop a healthy continuous stream')
  stop(); await flush()
}
{
  const n = native(), points = [], errors = []
  const stop = createMiniLocationWatcher(n)(p => points.push(p), e => errors.push(e))
  await flush(); n.starts[0].success({}); await flush()
  n.gets[0].fail({ errMsg: 'getLocation:fail frequency limit' }); await flush()
  assert.equal(errors.length, 0, 'prime failure waits for the stream/first-fix timeout')
  ;[...n.changes][0](coords)
  assert.equal(points.length, 1)
  stop(); await flush()
}
{
  const n = native(), watch = createMiniLocationWatcher(n)
  const stopA = watch(() => {}, () => {})
  await flush()
  stopA()
  const stopB = watch(() => {}, () => {})
  await flush()
  assert.equal(n.starts.length, 1, 'successor waits for late native start and stop')
  n.starts[0].success({}); await flush()
  assert.equal(n.stops.length, 1)
  assert.equal(n.starts.length, 2)
  assert.equal(n.changes.size, 1)
  n.starts[1].success({}); await flush()
  stopB(); await flush()
  assert.equal(n.changes.size, 0); assert.equal(n.stops.length, 2)
}
for (const enhanced of [true, false]) {
  const n = native(), points = [], errors = []
  const watch = createMiniLocationWatcher({ ...n, enhanced: () => enhanced })
  const stop = watch(p => points.push(p), e => errors.push(e))
  await flush()
  if (enhanced) { n.starts[0].fail({ errMsg: 'startLocationUpdate:fail not support' }); await flush() }
  assert.equal(n.changes.size, 0)
  n.gets[0].success(coords); await flush()
  assert.equal(points.length, 1)
  assert.equal([...n.timers.values()][0].delay, 15000)
  const timer = [...n.timers.values()][0]
  n.timers.clear(); timer.cb(); await flush()
  assert.equal(n.gets.length, 2)
  stop(); n.gets[1].success(coords); await flush()
  assert.equal(points.length, 1); assert.equal(n.timers.size, 0)
  assert.equal(errors.length, 0)
}
{
  const n = native(), errors = []
  const stop = createMiniLocationWatcher(n)(() => {}, e => errors.push(e))
  await flush()
  n.starts[0].fail({ errMsg: 'startLocationUpdate:fail auth deny' }); await flush()
  assert.equal(errors[0].code, 'permission_denied')
  assert.equal(n.gets.length, 0, 'denied stream does not restart positioning via fallback')
  stop()
}
console.log('PASS mini location selection, address book, foreground watch, rollback and async cleanup')
