import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript, compileStyle, compileTemplate } from '@vue/compiler-sfc'
import { parse as parseJavaScript } from '@babel/parser'
import mpCompiler from '@dcloudio/uni-mp-compiler'
import { gcj02ToWgs84, wgs84ToGcj02, normalizePoint, bookingToleranceMeters, coversServiceLocation } from '../src/pages-nonTheme/utils/recycling-geometry.mjs'

const require = createRequire(import.meta.url)
const backendGeometry = require('../../back-end/utils/recyclingGeometry.js')
const geometryPath = new URL('../src/pages-nonTheme/utils/recycling-geometry.mjs', import.meta.url)
const bookingPath = new URL('../src/pages-nonTheme/booking.vue', import.meta.url)
const pickerPath = new URL('../src/pages-nonTheme/components/shop/ShopAddressPicker.vue', import.meta.url)
const locationAddressPath = new URL('../src/utils/location-address.js', import.meta.url)
const draftPath = new URL('../src/pages-nonTheme/utils/booking-draft-methods.js', import.meta.url)
const geometrySource = await readFile(geometryPath, 'utf8')
const bookingSource = await readFile(bookingPath, 'utf8')
const pickerSource = await readFile(pickerPath, 'utf8')
const locationAddressSource = await readFile(locationAddressPath, 'utf8')
const draftSource = await readFile(draftPath, 'utf8')

function offsetMeters(point, north, east) {
  return { latitude: point.latitude + north / 111195, longitude: point.longitude + east / (111195 * Math.cos(point.latitude * Math.PI / 180)) }
}

const center = { latitude: 25.033, longitude: 121.5654 }
const circle = { type: 'circle', coordinateSystem: 'wgs84', center, radiusMeters: 1000 }
const polygon = { type: 'polygon', coordinateSystem: 'wgs84', points: [
  { latitude: 25.03, longitude: 121.56 }, { latitude: 25.04, longitude: 121.56 },
  { latitude: 25.04, longitude: 121.57 }, { latitude: 25.03, longitude: 121.57 }
] }
assert.equal(bookingToleranceMeters(undefined), 50)
assert.equal(bookingToleranceMeters(0), 50)
assert.equal(bookingToleranceMeters(85), 85)
assert.equal(bookingToleranceMeters(900), 200)

for (const shape of [circle, polygon]) {
  const edge = shape.type === 'circle' ? offsetMeters(center, 1000, 0) : polygon.points[0]
  for (const distance of [30, 150, 210]) {
    const outside = shape.type === 'circle'
      ? offsetMeters(center, 1000 + distance, 0)
      : offsetMeters(edge, -distance, 0)
    for (const accuracy of [undefined, 50, 200, 900]) {
      const location = { ...outside, ...(accuracy == null ? {} : { accuracyMeters: accuracy }) }
      const front = coversServiceLocation(shape, location)
      const backend = backendGeometry.coversServiceLocation(shape, location)
      assert.equal(front, backend, `${shape.type} at ${distance}m, accuracy ${accuracy}: frontend/backend parity`)
      const tolerance = accuracy == null ? 50 : Math.max(50, Math.min(200, accuracy))
      assert.equal(front, distance <= tolerance, `${shape.type} at ${distance}m, tolerance ${tolerance}`)
    }
  }
}
for (const accuracy of [undefined, 50, 200, 900]) {
  const vertex = polygon.points[0]
  const location = { ...offsetMeters(vertex, -30 / Math.SQRT2, -30 / Math.SQRT2), ...(accuracy == null ? {} : { accuracyMeters: accuracy }) }
  assert.equal(coversServiceLocation(polygon, location), backendGeometry.coversServiceLocation(polygon, location))
}
console.log('ok frontend/backend tolerance parity for circles and polygon edges/vertices at 30/150/210m')

// Re-run the geometry API in a realm without Array.prototype.at.
const noAtSource = geometrySource
  .replace("import { wgs84ToGcj02 as convertWgs84ToGcj02 } from '../../utils/live-location-coordinates.mjs'", '')
  .replaceAll('export function ', 'function ')
  .replaceAll('export const ', 'const ')
const noAtContext = vm.createContext({ convertWgs84ToGcj02: (lat, lng) => wgs84ToGcj02(lat, lng) })
vm.runInContext('Array.prototype.at = undefined', noAtContext)
vm.runInContext(`${noAtSource}\nglobalThis.coversServiceLocation = coversServiceLocation`, noAtContext)
assert.equal(noAtContext.coversServiceLocation(circle, { ...center, accuracyMeters: 50 }), true)
console.log('ok tolerance API remains usable without Array.prototype.at')

function extractMethod(source, name, nextName) {
  const start = source.indexOf(`${name}(`)
  assert.notEqual(start, -1, `${name} method exists`)
  const end = source.indexOf(`${nextName}(`, start)
  assert.notEqual(end, -1, `${nextName} follows ${name}`)
  return source.slice(start, end).trim().replace(/,$/, '').replace(/\nfunction\s*$/, '')
}

const placeMethodSource = pickerSource.slice(pickerSource.indexOf('function selectPlace(place) {'), pickerSource.indexOf('function confirm()'))
assert.match(pickerSource, /accuracy:\s*selection\.accuracy/)
assert.match(pickerSource, /selectedCoordinates = \{ latitude, longitude, accuracy \}/)
assert.doesNotMatch(placeMethodSource, /accuracy/, 'manual search places do not add GPS accuracy')
const pickedAddress = { address: '台北市中正區忠孝路一號', latitude: 25.033, longitude: 121.5654, accuracy: 76, coordinateSystem: 'wgs84' }

const applyAddressMethod = extractMethod(bookingSource, 'applyLocatedAddress', 'extractData')
const applyAddress = new Function('deps', `const { splitShopAddress, normalizePoint, gcj02ToWgs84, uni } = deps; return ({ ${applyAddressMethod} }).applyLocatedAddress`)(
  { splitShopAddress: () => ({ region: ['台北市', '中正區', ''], detail: '忠孝路一號' }), normalizePoint, gcj02ToWgs84, uni: { setStorageSync() {} } }
)
const booking = {
  submitting: false,
  addressRegion: [], addressDetail: '', addressCoordinates: null,
  get address() { return [...this.addressRegion, this.addressDetail].filter(Boolean).join('') },
  set address(value) { this.addressRegion = ['台北市', '中正區', '']; this.addressDetail = value.replace(/^台北市中正區/, '') },
  syncServiceCoverage() {},
  bookingLocationOwner() { return '' },
  uni: { setStorageSync() {} }
}
applyAddress.call(booking, pickedAddress)
assert.equal(booking.addressCoordinates.accuracyMeters, 76)

const queryLine = bookingSource.split(/\r?\n/).find(line => line.includes('getAvailableTimeSlots(dateStr'))
assert.ok(queryLine, 'booking slot query exists')
const queryMatch = queryLine.match(/this\.selectedTypes,\s*(\{.*\})\s*\);/)
assert.ok(queryMatch, 'slot query has an options object')
const bookingPoint = { ...normalizePoint(booking.addressCoordinates), accuracyMeters: booking.addressCoordinates.accuracyMeters }
const queryOptions = new Function(`return (function(){ return (${queryMatch[1]}) }).call({ bookingPoint: ${JSON.stringify(bookingPoint)} })`)()
assert.equal(queryOptions.addressAccuracy, 76)

const draftCode = draftSource
  .replace(/^import .*;?\s*$/gm, '')
  .replace('export const bookingDraftMethods', 'const bookingDraftMethods')
const draftContext = vm.createContext({ Date, Number, Object, String, Math, JSON })
vm.runInContext(`${draftCode}\nglobalThis.bookingDraftMethods = bookingDraftMethods`, draftContext)
const methods = draftContext.bookingDraftMethods
Object.assign(booking, {
  address: '台北市中正區忠孝路一號', serviceAreaId: 7, addressRegion: ['台北市', '中正區', ''],
  addressCoordinates: { ...booking.addressCoordinates }, selectedTypes: [3], itemWeights: { 3: 2 },
  timeSlotsDate: '2026-11-07', selectedTimeSlot: '10:00-12:00', contactPhone: '0912345678', remark: '',
  syncServiceCoverage() {}, async loadTimeSlots() {},
  dateValues: { today: '2026-11-07', tomorrow: '2026-11-08', custom: '' },
  draftId: 'draft-1', draftLoading: false, draftError: '', draftExpired: false, draftReceipt: null, draft: null,
  draftLoading: false, selectedDate: 'today', selectedDate: 'today', draftError: '', draftExpired: false,
  timeSlots: [{ available: true, time: '10:00-12:00' }], selectedTimeSlot: '',
})
await methods.loadBookingDraft.call(booking, { data: { id: 'draft-1', type: 'booking', status: 'pending', expiresAt: new Date(Date.now() + 60000).toISOString(), payload: {
  address: booking.address, addressLat: 25.033, addressLng: 121.5654, addressCoordinateSystem: 'wgs84', addressAccuracy: 76,
  items: [{ typeId: 3, weight: 2 }], appointmentDate: '2026-11-07', appointmentTimeSlot: '10:00-12:00', contactPhone: '0912345678'
} } })
assert.equal(booking.addressCoordinates.accuracyMeters, 76, 'AI draft restore keeps address accuracy')
assert.equal(methods.getBookingPayload.call(booking).addressAccuracy, 76, 'AI draft payload retains address accuracy')
assert.ok(bookingPoint.accuracyMeters === 76)
console.log('ok picker accuracy contract and booking slot query, payload, and AI draft restore keep accuracy')

function preprocess(source, platform) {
  const output = [], active = [true]
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\s*(?:\/\/|<!--|\/\*)\s*#(ifdef|ifndef)\s+([\w-]+)\s*(?:-->|\*\/)?\s*$/)
    if (directive) { const matches = directive[2] === platform; active.push(active.at(-1) && (directive[1] === 'ifdef' ? matches : !matches)); continue }
    if (/^\s*(?:\/\/|<!--|\/\*)\s*#endif\s*(?:-->|\*\/)?\s*$/.test(line)) { active.pop(); continue }
    if (active.at(-1)) output.push(line)
  }
  assert.equal(active.length, 1)
  return output.join('\n')
}
for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  parseJavaScript(preprocess(locationAddressSource, platform), { sourceType: 'module' })
  for (const url of [bookingPath, pickerPath]) {
    const filename = url.pathname.replace(/^\//, '')
    const original = await readFile(url, 'utf8')
    const source = original
      .replace(/<template>([\s\S]*?)<\/template>/, (_, body) => `<template>${preprocess(body, platform)}</template>`)
      .replace(/<script( setup)?>([\s\S]*?)<\/script>/, (_, setup = '', body) => `<script${setup}>${preprocess(body, platform)}</script>`)
      .replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (_, attrs, body) => `<style${attrs}>${preprocess(body, platform)}</style>`)
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [])
    if (descriptor.script || descriptor.scriptSetup) compileScript(descriptor, { id: `tol-${platform}` })
    if (descriptor.template) {
      const result = platform === 'MP-WEIXIN'
        ? mpCompiler.compile(descriptor.template.content, { filename, mode: 'module', miniProgram: { class: { array: true }, slot: { fallbackContent: true } } })
        : compileTemplate({ source: descriptor.template.content, filename, id: `tol-${platform}` })
      assert.deepEqual(result.errors || [], [])
    }
    for (const style of descriptor.styles) {
      const result = compileStyle({ source: style.content, filename, id: `tol-${platform}`, scoped: style.scoped })
      assert.deepEqual(result.errors, [])
    }
  }
  console.log(`ok H5/App/MP local SFC ${platform}`)
}
