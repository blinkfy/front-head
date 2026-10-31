import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { getPointFocusCenter, offsetMapCenter } from '../src/utils/map-point-focus.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { parse: parseSfc } = require('@vue/compiler-sfc')
const babel = require('@babel/parser')
const zoom = 16
const worldSize = 256 * 2 ** zoom

function mercatorY(latitude) {
  const sin = Math.sin(latitude * Math.PI / 180)
  return .5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
}

function close(actual, expected, message, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`)
}

const north = { latitude: 45, longitude: 12 }
const south = { latitude: -35, longitude: 140 }
for (const point of [north, south]) {
  const original = { ...point }
  const lift = 137
  const center = offsetMapCenter(point, zoom, lift)
  assert.deepEqual(point, original, 'offsetMapCenter does not mutate its point')
  assert.equal(center.longitude, point.longitude)
  assert.ok(center.latitude < point.latitude, 'positive pixel lift moves camera center south at north and south latitudes')
  close((mercatorY(center.latitude) - mercatorY(point.latitude)) * worldSize, lift,
    'inverse Mercator projection recovers pixel displacement')
}
console.log('PASS [math] north/south camera offsets move south by the requested pixels without mutating the point')

const page = { proxy: { id: 'map-page' } }
async function selectorCase({ windowHeight, map, card }) {
  const requested = []
  globalThis.uni = {
    getWindowInfo: () => ({ windowHeight }),
    createSelectorQuery() {
      const query = {
        in(proxy) { assert.equal(proxy, page.proxy); return query },
        select(selector) {
          requested.push(selector)
          return {
            boundingClientRect() { return this },
            fields(options) { assert.deepEqual(options, { size: true, computedStyle: ['bottom'] }); return this }
          }
        },
        exec(callback) { callback([map, card]) }
      }
      return query
    }
  }
  const point = { latitude: 31.23, longitude: 121.47, extra: 'preserved' }
  const original = { ...point }
  const center = await getPointFocusCenter(point, zoom, page)
  assert.deepEqual(requested, ['.map-canvas', '.info-card'])
  assert.deepEqual(point, original, 'getPointFocusCenter does not mutate its point')
  const lift = (mercatorY(center.latitude) - mercatorY(point.latitude)) * worldSize
  const markerScreenY = map.top + map.height / 2 - lift
  const cardTop = windowHeight - (parseFloat(card.bottom) || 0) - card.height
  assert.ok(markerScreenY < cardTop, `focused point (${markerScreenY}) sits above card (${cardTop})`)
  return { center, lift, markerScreenY, cardTop }
}

const noHeader = await selectorCase({ windowHeight: 900, map: { top: 0, height: 600 }, card: { height: 200, bottom: '24px' } })
close(noHeader.lift, 0, 'unobstructed no-header map keeps its center')
close(noHeader.center.latitude, 31.23, 'unobstructed no-header camera latitude is unchanged')

const withHeader = await selectorCase({ windowHeight: 900, map: { top: 80, height: 600 }, card: { height: 200, bottom: '24px' } })
close(withHeader.lift, 40, 'header-only offset is half the header height')

const cardObstruction = await selectorCase({ windowHeight: 900, map: { top: 0, height: 600 }, card: { height: 550, bottom: '24px' } })
close(cardObstruction.lift, 38, 'card obstruction applies only the clearance needed')
close(cardObstruction.markerScreenY, cardObstruction.cardTop - 64, 'obstructed point stops at the card clearance boundary')

const compactViewport = await selectorCase({ windowHeight: 500, map: { top: 0, height: 400 }, card: { height: 250, bottom: '20px' } })
close(compactViewport.lift, 34, 'compact viewport uses its own card boundary')

const topLimit = await selectorCase({ windowHeight: 900, map: { top: 0, height: 600 }, card: { height: 820, bottom: '20px' } })
close(topLimit.markerScreenY, 48, 'camera does not lift the point above mapTop + 48')
close(topLimit.lift, 252, 'top limit bounds the maximum lift')
console.log('PASS [selector] no-header center, header offset, minimum card avoidance and mapTop + 48 limit')

globalThis.uni = {
  getWindowInfo: () => ({ windowHeight: 500 }),
  createSelectorQuery() {
    return {
      in() { return this },
      select() { return { boundingClientRect() { return this }, fields() { return this } } },
      exec(callback) { callback([null, null]) }
    }
  }
}
const fallbackPoint = { latitude: 20, longitude: 110 }
const fallbackOriginal = { ...fallbackPoint }
const fallback = await getPointFocusCenter(fallbackPoint, zoom, page)
assert.deepEqual(fallback, offsetMapCenter(fallbackPoint, zoom, 90), 'invalid viewport uses the capped window-height fallback')
assert.deepEqual(fallbackPoint, fallbackOriginal)
console.log('PASS [fallback] invalid selector geometry falls back without throwing or changing the point')

for (const relative of ['src/pages/map/map.vue', 'src/pages-dark/map/map.vue']) {
  const filename = path.join(root, relative)
  const { descriptor, errors } = parseSfc(fs.readFileSync(filename, 'utf8'), { filename })
  assert.equal(errors.length, 0, `${relative} SFC parse`)
  assert.ok(descriptor.scriptSetup, `${relative} script setup exists`)
  babel.parse(descriptor.scriptSetup.content, { sourceType: 'module', plugins: ['dynamicImport', 'optionalChaining'] })
  console.log(`PASS [SFC] ${relative} parses; script setup syntax is valid`)
}
