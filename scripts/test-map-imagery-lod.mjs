import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSatelliteDetailTiles, createSatelliteDetailLoader, createSatelliteDetailController,
  createAppTencentMap
} from '../src/static/app-map/renderer.mjs'

const EMPTY = 'data:image/png;base64,transparent'
const flush = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function tileImage({ closeable = true, ...overrides } = {}) {
  const image = { naturalWidth: 256, naturalHeight: 256, src: 'loaded', closed: 0, ...overrides }
  if (closeable) image.close = () => { image.closed++ }
  return image
}
function pixels(color) {
  const data = new Uint8ClampedArray(64 * 64 * 4)
  for (let i = 0; i < data.length; i += 4) {
    data.set([...(color || (i % 8 ? [20, 70, 160] : [210, 150, 30])), 255], i)
  }
  return { data }
}
function loaderFixture({ load, color, highResolution = true, unavailableContext = false, exportValue } = {}) {
  const images = [], canvases = [], urls = [], events = [], exports = []
  function createCanvas() {
    const id = canvases.length
    const canvas = { width: 0, height: 0, draws: [],
      getContext() { return unavailableContext ? null : {
        drawImage(...args) { canvas.draws.push(args) },
        getImageData: () => pixels(typeof color === 'function' ? color(canvas.draws.at(-1)?.[0]) : color)
      } },
      toDataURL(...args) { assert.deepEqual([canvas.width, canvas.height], [512, 512]); exports.push(args); return exportValue ?? `data:${args[0]};base64,tile-${id}` }
    }
    canvases.push(canvas)
    return canvas
  }
  const loader = createSatelliteDetailLoader({ empty: EMPTY, createCanvas, highResolution,
    onEvent: (...args) => events.push(args),
    loadImage(url) {
      const index = urls.push(url) - 1
      const image = tileImage(); images.push(image)
      return load ? load(url, index, image) : Promise.resolve(image)
    }
  })
  return { loader, images, canvases, urls, events, exports }
}
function assertReleased(h) {
  assert.ok(h.canvases.length > 0)
  for (const canvas of h.canvases) assert.deepEqual([canvas.width, canvas.height], [0, 0])
  for (const image of h.images) assert.equal(image.closed, 1)
}
function sourceCoordinate(tile) {
  const match = new URL(tile.url).pathname.match(/\/sateTiles\/(\d+)\/(\d+)\/(\d+)\/(\d+)_(\d+)\.jpg$/)
  assert.ok(match)
  const [, z, blockX, blockY, x, y] = match.map(Number)
  assert.equal(blockX, Math.floor(x / 16)); assert.equal(blockY, Math.floor(y / 16))
  return { x, y, z }
}
function drawRegion(args) { return args.slice(-4) }
function assertSource(source, xyzX, xyzY, level, crop) {
  assert.deepEqual(Object.keys(source).sort(), ['level', 'sh', 'sw', 'sx', 'sy', 'url'])
  assert.equal(source.level, level)
  const coordinate = sourceCoordinate(source)
  assert.equal(coordinate.z, level)
  assert.equal(coordinate.x, xyzX)
  assert.equal(coordinate.y, 2 ** level - 1 - xyzY)
  assert.deepEqual([source.sx, source.sy, source.sw, source.sh], crop)
}

test('XYZ children and source candidates cover the same geography with one TMS flip', () => {
  for (const [x, y, z] of [[6, 2, 3], [109254, 37491, 17]]) {
    const result = getSatelliteDetailTiles(x, y, z)
    assert.equal(result.id, `${z}/${x}/${y}`)
    assert.equal(result.children.length, 4)
    result.children.forEach((child, index) => {
      const column = index % 2, row = Math.floor(index / 2)
      assert.deepEqual([child.x, child.y, child.size], [column * 256, row * 256, 256])
      const childX = x * 2 + column, childY = y * 2 + row
      assert.equal(child.sources.length, Math.min(4, z + 1 - 3) + 1)
      child.sources.forEach((source, depth) => {
        const level = z + 1 - depth, divisor = 2 ** depth, size = 256 / divisor
        assertSource(source, Math.floor(childX / divisor), Math.floor(childY / divisor), level,
          [(childX % divisor) * size, (childY % divisor) * size, size, size])
      })
      const source = sourceCoordinate(child.sources[0])
      const xyzY = 2 ** source.z - 1 - source.y
      // Normalized world bounds prove the mosaic does not move or scale geography.
      assert.equal(source.x / 2 ** source.z, (x + column / 2) / 2 ** z)
      assert.equal(xyzY / 2 ** source.z, (y + row / 2) / 2 ** z)
      assert.equal((source.x + 1) / 2 ** source.z, (x + (column + 1) / 2) / 2 ** z)
      assert.equal((xyzY + 1) / 2 ** source.z, (y + (row + 1) / 2) / 2 ** z)
    })
  }
})

test('z3..18 boundaries, dateline wrapping, and direct mode never request z19+', () => {
  assert.deepEqual(getSatelliteDetailTiles(-1, 0, 3), getSatelliteDetailTiles(7, 0, 3))
  assert.deepEqual(getSatelliteDetailTiles(8, 7, 3), getSatelliteDetailTiles(0, 7, 3))
  for (const args of [[0, -1, 3], [0, 8, 3], [0, 0, 2], [0, 0, 19], [0, 0, 17.5], [NaN, 0, 17]]) {
    assert.equal(getSatelliteDetailTiles(...args), null)
  }
  const last = getSatelliteDetailTiles(131071, 131071, 17)
  assert.ok(last.children.every(child => child.sources[0].level === 18))
  assert.deepEqual(last.children.map(child => sourceCoordinate(child.sources[0]).y), [1, 1, 0, 0])
  for (const [x, y, z, highResolution] of [[3, 5, 18, true], [3, 5, 18, false], [3, 5, 17, false], [0, 0, 3, false]]) {
    const tiles = getSatelliteDetailTiles(x, y, z, highResolution)
    assert.equal(tiles.children.length, 1)
    const child = tiles.children[0]
    assert.deepEqual([child.x, child.y, child.size], [0, 0, 512])
    assert.equal(child.sources.length, Math.min(4, z - 3) + 1)
    child.sources.forEach((source, depth) => {
      const divisor = 2 ** depth, size = 256 / divisor, level = z - depth
      assertSource(source, Math.floor(x / divisor), Math.floor(y / divisor), level,
        [(x % divisor) * size, (y % divisor) * size, size, size])
      assert.ok(level <= 18)
    })
  }
})

test('loader deduplicates pending/wrapped requests and exports a 512 JPEG with four complete quadrants', async () => {
  const h = loaderFixture()
  try {
    const first = h.loader.getTileUrl(1, 2, 17)
    assert.strictEqual(h.loader.getTileUrl(1 + 2 ** 17, 2, 17), first)
    assert.match(await first, /^data:image\/jpeg/)
    assert.equal(h.urls.length, 4)
    assert.deepEqual(h.canvases[0].draws.map(drawRegion), [
      [0, 0, 256, 256], [256, 0, 256, 256], [0, 256, 256, 256], [256, 256, 256, 256]
    ])
    assert.deepEqual(h.exports, [['image/jpeg', .95]])
    assert.deepEqual(h.events, [['ready', { displayLevel: 17, dataLevel: 18, tileSize: 512 }]])
    await h.loader.getTileUrl(1, 2, 17)
    assert.equal(h.urls.length, 4, 'cached tile does not load again')
    assertReleased(h)
  } finally { h.loader.destroy() }
})

test('mixed high-detail and parent quadrants reuse one parent and retain a full JPEG', async () => {
  const tiles = getSatelliteDetailTiles(1, 2, 17)
  const invalid = tiles.children[0].sources[0].url
  const placeholder = tiles.children[1].sources[0].url
  const parent = tiles.children[0].sources[1].url
  const h = loaderFixture({
    load(url, _index, image) { if (url === invalid) image.naturalWidth = 255; image.placeholder = url === placeholder; return Promise.resolve(image) },
    color: image => image?.placeholder ? [160, 176, 160] : undefined
  })
  try {
    assert.match(await h.loader.getTileUrl(1, 2, 17), /^data:image\/jpeg/)
    assert.equal(h.urls.filter(url => url === parent).length, 1, 'siblings share the same parent decode')
    assert.equal(h.urls.length, 5)
    const draws = h.canvases[0].draws
    assert.deepEqual(draws.slice(0, 2).map(args => args.slice(1)), [
      [0, 0, 128, 128, 0, 0, 256, 256], [128, 0, 128, 128, 256, 0, 256, 256]
    ])
    assert.deepEqual(draws.slice(2).map(drawRegion), [[0, 256, 256, 256], [256, 256, 256, 256]])
    assert.deepEqual(h.exports, [['image/jpeg', .95]])
    assertReleased(h)
  } finally { h.loader.destroy() }
})

test('z18 missing source descends through z17 to a cropped z16 tile', async () => {
  const h = loaderFixture({ load(url, _index, image) {
    const level = sourceCoordinate({ url }).z
    if (level === 18) { const error = new Error('HTTP 404'); error.status = 404; throw error }
    if (level === 17) image.naturalHeight = 255
    return Promise.resolve(image)
  } })
  try {
    assert.match(await h.loader.getTileUrl(7, 11, 18), /^data:image\/jpeg/)
    assert.deepEqual(h.urls.map(url => sourceCoordinate({ url }).z), [18, 17, 16])
    assert.deepEqual(h.canvases[0].draws[0].slice(1), [192, 192, 64, 64, 0, 0, 512, 512])
    assert.equal(h.canvases[0].draws.length, 1)
    assert.equal(h.images[1].closed, 1)
    assert.equal(h.images[2].closed, 1)
    assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0))
  } finally { h.loader.destroy() }
})

test('direct mode uses one z17 source and crops its z16 parent when unavailable', async () => {
  const h = loaderFixture({ highResolution: false, load(url, _index, image) {
    if (sourceCoordinate({ url }).z === 17) image.naturalWidth = 255
    return Promise.resolve(image)
  } })
  try {
    assert.match(await h.loader.getTileUrl(3, 5, 17), /^data:image\/jpeg/)
    assert.deepEqual(h.urls.map(url => sourceCoordinate({ url }).z), [17, 16])
    assert.deepEqual(h.canvases[0].draws.map(args => args.slice(1)), [[128, 128, 128, 128, 0, 0, 512, 512]])
    assertReleased(h)
  } finally { h.loader.destroy() }
})

test('failed sibling candidates are reused once, with distinct crop coordinates at z16', async () => {
  const h = loaderFixture({ load(url, _index, image) {
    if (sourceCoordinate({ url }).z > 16) image.naturalWidth = 255
    return Promise.resolve(image)
  } })
  try {
    assert.match(await h.loader.getTileUrl(1, 2, 17), /^data:image\/jpeg/)
    assert.deepEqual(h.urls.map(url => sourceCoordinate({ url }).z), [18, 17, 16, 18, 18, 18])
    assert.deepEqual(h.canvases[0].draws.map(args => args.slice(1, 5)), [
      [128, 0, 64, 64], [192, 0, 64, 64], [128, 64, 64, 64], [192, 64, 64, 64]
    ])
    assertReleased(h)
  } finally { h.loader.destroy() }
})

test('loader bounds pending jobs at 12 and concurrent image decodes at two', async () => {
  const requests = []
  let active = 0, maxActive = 0
  const h = loaderFixture({ load(_url, _index, image) {
    const request = deferred(); active++; maxActive = Math.max(maxActive, active)
    requests.push({ ...request, image, settled: false })
    return request.promise.finally(() => active--)
  } })
  try {
    const jobs = Array.from({ length: 12 }, (_, x) => h.loader.getTileUrl(x, 2, 17))
    assert.equal(requests.length, 2)
    assert.equal(await h.loader.getTileUrl(12, 2, 17), EMPTY, 'overflow immediately falls through to SDK base')
    for (let round = 0; requests.length < 48 || requests.some(request => !request.settled); round++) {
      assert.ok(round < 30, 'queue must finish in bounded rounds')
      for (const request of requests.filter(request => !request.settled)) {
        request.settled = true; request.resolve(request.image)
      }
      await flush()
    }
    assert.ok((await Promise.all(jobs)).every(value => value !== EMPTY))
    assert.equal(requests.length, 48)
    assert.equal(maxActive, 2)
    assert.equal(active, 0)
    assertReleased(h)
  } finally { h.loader.destroy() }
})

test('eight-entry cache refreshes hits and evicts the least recently used tile', async () => {
  const h = loaderFixture()
  try {
    for (let x = 0; x < 8; x++) await h.loader.getTileUrl(x, 2, 17)
    await h.loader.getTileUrl(0, 2, 17)
    assert.equal(h.urls.length, 32)
    await h.loader.getTileUrl(8, 2, 17)
    await h.loader.getTileUrl(0, 2, 17)
    assert.equal(h.urls.length, 36, 'recent hit survives eviction')
    await h.loader.getTileUrl(1, 2, 17)
    assert.equal(h.urls.length, 40, 'oldest untouched tile must load again')
  } finally { h.loader.destroy() }
})

test('a network-failed child stays transparent while completed siblings remain in a PNG', async () => {
  const loaded = []
  const h = loaderFixture({ load(_url, index, image) {
    if (index === 2) throw new Error('network_failed')
    loaded.push(image); return Promise.resolve(image)
  } })
  try {
    assert.match(await h.loader.getTileUrl(1, 2, 17), /^data:image\/png/)
    assert.equal(h.urls.length, 3)
    assert.ok(h.urls.every(url => sourceCoordinate({ url }).z === 18))
    assert.equal(h.canvases[0].draws.length, 2)
    assert.deepEqual(h.exports, [['image/png', .95]])
    assert.deepEqual(h.events, [
      ['fallback', { reason: 'network_failed' }],
      ['ready', { displayLevel: 17, dataLevel: 18, tileSize: 512 }]
    ])
    assert.ok(loaded.every(image => image.closed === 1))
    assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0))
  } finally { h.loader.destroy() }
})

test('exhausted invalid/placeholder sources and canvas/export failures return empty safely', async () => {
  for (const options of [
    { load(_url, _index, image) { image.naturalWidth = 255; return Promise.resolve(image) } },
    { color: [160, 176, 160] }, { unavailableContext: true },
    { exportValue: 'not-an-image' }, { exportValue: 'data:image/jpeg;base64,' + 'x'.repeat(512 * 1024) }
  ]) {
    const h = loaderFixture(options)
    try {
      assert.equal(await h.loader.getTileUrl(1, 2, 17), EMPTY)
      assert.equal(h.events[0][0], 'fallback')
      assertReleased(h)
    } finally { h.loader.destroy() }
  }
  const h = loaderFixture({ load(_url, _index, image) { delete image.close; return Promise.resolve(image) } })
  try {
    assert.notEqual(await h.loader.getTileUrl(1, 2, 17), EMPTY)
    assert.ok(h.images.every(image => image.src === ''), 'HTMLImage resources released without close()')
  } finally { h.loader.destroy() }
})

test('destroy drains queued jobs; late success/failure releases resources without cache or events', async () => {
  const requests = []
  const h = loaderFixture({ load(_url, _index, image) {
    const request = deferred(); requests.push({ ...request, image }); return request.promise
  } })
  const first = h.loader.getTileUrl(1, 2, 17), second = h.loader.getTileUrl(2, 2, 17)
  const queued = h.loader.getTileUrl(3, 2, 17)
  h.loader.destroy(); h.loader.destroy()
  assert.equal(await queued, EMPTY)
  requests[0].resolve(requests[0].image); requests[1].reject(new Error('late failure'))
  assert.deepEqual(await Promise.all([first, second]), [EMPTY, EMPTY])
  assert.equal(requests[0].image.closed, 1)
  assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0))
  assert.deepEqual(h.events, [])
  assert.equal(await h.loader.getTileUrl(1, 2, 17), EMPTY)
  assert.equal(h.urls.length, 2, 'late completion cannot restart work or populate a reusable cache')
})

function fakeClock() {
  let now = 0, serial = 0
  const tasks = new Map()
  return {
    setTimeout(fn, delay) { const id = ++serial; tasks.set(id, { fn, at: now + delay }); return id },
    clearTimeout(id) { tasks.delete(id) },
    tick(ms) {
      const end = now + ms
      for (;;) {
        const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        tasks.delete(next[0]); now = next[1].at; next[1].fn()
      }
      now = end
    },
    get pending() { return tasks.size }
  }
}
function controllerFixture({ zoom = 17, dpr = 2, memory = 8, oldSdk = false, unknownMemory = false } = {}) {
  const clock = fakeClock(), handlers = new Map(), layers = [], images = [], canvases = [], logs = []
  const map = { zoom, latitude: 35.9443, longitude: 120.1697, rotation: 0, pitch: 0,
    getZoom() { return this.zoom },
    getCenter() { return { getLat: () => this.latitude, getLng: () => this.longitude } },
    getRotation() { return this.rotation }, getPitch() { return this.pitch },
    on(type, fn) { const set = handlers.get(type) || new Set(); set.add(fn); handlers.set(type, set) },
    off(type, fn) { handlers.get(type)?.delete(fn) },
    fire(type) { for (const fn of [...(handlers.get(type) || [])]) fn() }
  }
  const view = { devicePixelRatio: dpr, navigator: unknownMemory ? {} : { deviceMemory: memory },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    console: { info: (...args) => logs.push(args) },
    Image: class {
      constructor() { this.naturalWidth = this.naturalHeight = 256; images.push(this) }
      set src(value) { this.url = value }
      get src() { return this.url }
    }
  }
  const document = { defaultView: view, createElement(tag) {
    assert.equal(tag, 'canvas')
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => pixels() }),
      toDataURL: (format = 'image/png') => `data:${format};base64,fixture` }
    canvases.push(canvas); return canvas
  } }
  const sdk = oldSdk ? {} : { ImageTileLayer: class {
    constructor(options) { this.options = options; this.destroyed = 0; layers.push(this) }
    destroy() { this.destroyed++ }
  } }
  const container = { ownerDocument: document, clientWidth: 800, clientHeight: 600 }
  const controller = createSatelliteDetailController({ sdk, map, container })
  return { controller, sdk, map, container, clock, handlers, layers, images, canvases, logs }
}

test('old SDK is a no-op; low DPR/memory use direct tiles while unknown memory allows detail', () => {
  const old = controllerFixture({ oldSdk: true })
  old.controller.setActive(true); old.map.fire('tilesloaded'); old.clock.tick(500)
  assert.equal(old.layers.length, 0); assert.equal(old.clock.pending, 0); assert.equal(old.handlers.size, 0)
  old.controller.destroy(); old.controller.destroy()
  for (const options of [{ dpr: 1.25 }, { memory: 2 }]) {
    const h = controllerFixture(options)
    h.controller.setActive(true); h.map.fire('tilesloaded'); h.clock.tick(120)
    assert.equal(h.layers.length, 1)
    h.layers[0].options.getTileUrl(1, 2, 17)
    assert.equal(h.images.length, 1, 'direct mode requests one z17 source')
    assert.equal(sourceCoordinate({ url: h.images[0].src }).z, 17)
    h.controller.destroy()
  }
  const h = controllerFixture({ unknownMemory: true })
  h.controller.setActive(true); h.map.fire('tilesloaded'); h.clock.tick(120)
  assert.equal(h.layers.length, 1)
  h.controller.destroy()
})

test('controller waits for base tilesloaded plus 120ms and does not rebuild on equivalent events', () => {
  const h = controllerFixture()
  try {
    h.controller.setActive(true); h.map.fire('zoom'); h.clock.tick(1000)
    assert.equal(h.layers.length, 0)
    h.map.fire('tilesloaded'); h.map.fire('tilesloaded'); h.controller.setActive(true)
    assert.equal(h.clock.pending, 1)
    h.clock.tick(119); assert.equal(h.layers.length, 0)
    h.clock.tick(1); assert.equal(h.layers.length, 1)
    assert.strictEqual(h.layers[0].options.map, h.map)
    assert.deepEqual([h.layers[0].options.minZoom, h.layers[0].options.maxZoom, h.layers[0].options.maxDataZoom], [12, 20, 18])
    for (const zoom of [17, 17.5, 17.99, 18, 19, 20]) {
      h.map.zoom = zoom; h.map.fire('zoom'); h.map.fire('tilesloaded'); h.controller.setActive(true); h.clock.tick(120)
      assert.equal(h.layers.length, 1); assert.equal(h.layers[0].destroyed, 0)
    }
    h.map.zoom = 20.01; h.map.fire('zoom')
    assert.equal(h.layers[0].destroyed, 1); assert.equal(h.clock.pending, 0)
  } finally { h.controller.destroy() }
})

test('controller enforces 12 <= zoom <= 20 and cancels a scheduled attach outside range', () => {
  for (const [zoom, expected] of [[11.99, 0], [12, 1], [17, 1], [17.5, 1], [17.99, 1], [18, 1], [19, 1], [20, 1], [20.01, 0]]) {
    const h = controllerFixture({ zoom })
    h.controller.setActive(true); h.map.fire('tilesloaded'); h.clock.tick(120)
    assert.equal(h.layers.length, expected, `zoom ${zoom}`)
    h.controller.destroy()
  }
  const h = controllerFixture()
  h.controller.setActive(true); h.map.fire('tilesloaded'); h.clock.tick(119)
  h.map.zoom = 20.01; h.map.fire('zoom'); h.clock.tick(1)
  assert.equal(h.layers.length, 0); assert.equal(h.clock.pending, 0)
  h.controller.destroy()
})

test('same-view cached satellite return reuses genuine readiness without another tilesloaded event', () => {
  const h = controllerFixture()
  const originalView = () => [h.map.latitude, h.map.longitude, h.map.zoom,
    h.container.clientWidth, h.container.clientHeight, h.map.rotation, h.map.pitch]
  const initial = originalView()
  try {
    // Vector readiness alone must never authorize the first satellite overlay.
    h.map.fire('tilesloaded')
    h.controller.setActive(true); h.clock.tick(500)
    assert.equal(h.layers.length, 0)
    h.map.fire('tilesloaded'); h.clock.tick(120)
    assert.equal(h.layers.length, 1)
    for (let index = 0; index < 3; index++) {
      h.controller.setActive(false)
      assert.equal(h.layers[index].destroyed, 1)
      assert.equal(h.clock.pending, 0)
      h.controller.setActive(true)
      assert.equal(h.clock.pending, 1, 'same loaded view may schedule without a fresh event')
      h.clock.tick(119)
      assert.equal(h.layers.length, index + 1)
      h.clock.tick(1)
      assert.equal(h.layers.length, index + 2)
      h.controller.setActive(true); h.map.fire('zoom'); h.clock.tick(120)
      assert.equal(h.layers.length, index + 2, 'equivalent events retain one live layer')
      assert.deepEqual(originalView(), initial, 'cache reuse does not modify the camera or viewport')
    }
  } finally { h.controller.destroy() }
  assert.ok(h.layers.every(layer => layer.destroyed === 1))
  assert.equal(h.clock.pending, 0)
})

test('view changes in vector mode cannot reuse satellite readiness, even after vector tilesloaded', () => {
  const changes = [
    ['latitude', h => { h.map.latitude += .001 }],
    ['longitude', h => { h.map.longitude += .001 }],
    ['zoom', h => { h.map.zoom = 17.5 }],
    ['width', h => { h.container.clientWidth += 1 }],
    ['height', h => { h.container.clientHeight += 1 }],
    ['rotation', h => { h.map.rotation = 10 }],
    ['pitch', h => { h.map.pitch = 10 }]
  ]
  for (const [name, change] of changes) {
    const h = controllerFixture()
    try {
      h.controller.setActive(true); h.map.fire('tilesloaded'); h.clock.tick(120)
      assert.equal(h.layers.length, 1, name)
      h.controller.setActive(false); change(h); h.map.fire('zoom'); h.map.fire('tilesloaded')
      h.controller.setActive(true); h.clock.tick(500)
      assert.equal(h.layers.length, 1, `${name}: previous satellite view cannot authorize the changed view`)
      assert.equal(h.clock.pending, 0, name)
      h.map.fire('tilesloaded'); h.clock.tick(119)
      assert.equal(h.layers.length, 1, name)
      h.clock.tick(1)
      assert.equal(h.layers.length, 2, `${name}: genuine satellite readiness enables the new view`)
    } finally { h.controller.destroy() }
    assert.ok(h.layers.every(layer => layer.destroyed === 1), name)
    assert.equal(h.clock.pending, 0, name)
  }
})

test('switching to vector cancels images; reactivation waits for fresh base readiness; destroy ignores late events', async () => {
  const h = controllerFixture()
  h.controller.setActive(true); h.map.fire('tilesloaded'); h.clock.tick(120)
  const result = h.layers[0].options.getTileUrl(1, 2, 17)
  assert.equal(h.images.length, 1)
  const image = h.images[0], lateLoad = image.onload
  assert.equal(image.crossOrigin, 'anonymous')
  h.controller.setActive(false)
  assert.equal(h.layers[0].destroyed, 1); assert.equal(image.src, '')
  assert.equal(image.onload, null); assert.equal(image.onerror, null); assert.equal(h.clock.pending, 0)
  lateLoad(); assert.equal(await result, 'data:image/png;base64,fixture')
  h.map.longitude += .001 // A changed view still requires new satellite readiness.
  h.controller.setActive(true); h.clock.tick(200)
  assert.equal(h.layers.length, 1)
  h.map.fire('tilesloaded'); h.clock.tick(120)
  assert.equal(h.layers.length, 2)
  const lateEvents = [...h.handlers.values()].flatMap(set => [...set])
  h.controller.destroy(); h.controller.destroy()
  const logCount = h.logs.length
  lateEvents.forEach(fn => fn()); h.controller.setActive(true); h.clock.tick(5000)
  assert.equal(h.layers.length, 2); assert.equal(h.layers[1].destroyed, 1)
  assert.equal(h.logs.length, logCount); assert.equal(h.clock.pending, 0)
  assert.ok([...h.handlers.values()].every(set => set.size === 0))
  assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0))
})

test('controller image timeout returns transparency after four seconds and clears handlers', async () => {
  const h = controllerFixture()
  try {
    h.controller.setActive(true); h.map.fire('tilesloaded'); h.clock.tick(120)
    const result = h.layers[0].options.getTileUrl(1, 2, 17)
    h.clock.tick(3999)
    assert.equal(h.images[0].src === '', false)
    h.clock.tick(1)
    assert.equal(await result, 'data:image/png;base64,fixture')
    assert.equal(h.images[0].src, ''); assert.equal(h.images[0].onload, null)
    assert.equal(h.clock.pending, 0)
  } finally { h.controller.destroy() }
})

test('App renderer keeps imagery controller alive through marker updates and disposes it with the renderer', () => {
  const h = controllerFixture()
  h.controller.destroy()
  class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng } getLat() { return this.lat } getLng() { return this.lng } }
  Object.assign(h.sdk, { LatLng, Map: class { constructor() { return h.map } },
    MarkerStyle: class {}, MultiMarker: class { on() {} setMap() {} } })
  h.map.setBaseMap = () => {}; h.map.destroy = () => {}
  const renderer = createAppTencentMap({ sdk: h.sdk, container: h.container, emit() {} })
  const props = { latitude: 35.9443, longitude: 120.1697, scale: 17, satellite: true, markers: [] }
  try {
    renderer.update(props); h.map.fire('tilesloaded'); h.clock.tick(120)
    assert.equal(h.layers.length, 1, 'initial marker creation must not destroy imagery controller')
    renderer.update({ ...props, markers: [{ id: 1, latitude: 35.9443, longitude: 120.1697 }] })
    assert.equal(h.layers[0].destroyed, 0, 'marker changes preserve imagery layer')
  } finally { renderer.destroy() }
  assert.equal(h.layers[0]?.destroyed, 1)
  assert.ok([...h.handlers.values()].every(set => set.size === 0))
})
