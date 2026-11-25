import assert from 'node:assert/strict'
import { createMapPointList, createMapZoomSetter } from '../../src/utils/map/point-list.mjs'
import { clusterMapMarkers } from '../../src/utils/map/marker-clusters.mjs'

function bounds(minLat, maxLat, minLng, maxLng) {
  const point = (lat, lng) => ({ getLat: () => lat, getLng: () => lng })
  return { getNorthEast: () => point(maxLat, maxLng), getSouthWest: () => point(minLat, minLng) }
}

function setup({ initialPoints = [], loadMapBins, getNativeMap, webMap = { getBounds: () => bounds(.3, .7, .3, .7), getZoom: () => 12 } } = {}) {
  const points = { value: initialPoints }
  const userLocation = { value: { latitude: 0.5, longitude: 0.5 } }
  const mapScale = { value: 12 }
  const updates = []
  const errors = []
  const list = createMapPointList({
    points, userLocation, mapScale, getWebMap: () => webMap, getNativeMap,
    isNavigationMode: () => false,
    loadMapBins: loadMapBins || (async () => ({ code: 0, data: [] })),
    resolveImage: path => path || '', onUpdate: () => updates.push(points.value.length), onError: error => errors.push(error)
  })
  return { ...list, points, mapScale, updates, errors }
}

{
  const initialPoints = [{ id: 1, latitude: 36, longitude: 120 }, { id: 2, latitude: 36, longitude: 120.0003 }]
  let scaleCallback, requests = 0
  const list = setup({ initialPoints, webMap: null,
    getNativeMap: () => ({ getScale: ({ success }) => { scaleCallback = success } }),
    loadMapBins: async () => { requests++; return { code: 0, data: [] } }
  })
  const groups = () => clusterMapMarkers(list.points.value, list.mapScale.value)
  assert.equal(groups().length, 1)
  list.syncNativeViewport({ type: 'regionchange', causedBy: 'gesture', detail: { scale: 18 } })
  assert.equal(groups().length, 1, 'gesture start does not apply an unfinished viewport')
  list.syncNativeViewport({ type: 'regionchange', causedBy: 'scale', detail: { scale: 18, centerLocation: initialPoints[0] } })
  assert.equal(groups().length, 2, 'a WeChat zoom event immediately splits cached points')
  assert.equal(requests, 0, 'regrouping does not wait for the viewport request')
  list.cancelViewportReload()
  list.syncNativeViewport({ type: 'regionchange', detail: { causedBy: 'scale' } })
  scaleCallback({ scale: 12 })
  assert.equal(groups().length, 1, 'native getScale restores grouping when scale is absent from the event')
  list.syncNativeViewport({ type: 'regionchange', detail: { causedBy: 'scale' } })
  list.syncNativeViewport({ type: 'end', detail: { scale: 18 } })
  scaleCallback({ scale: 12 })
  assert.equal(groups().length, 2, 'a late read cannot override a newer viewport')
}

{
  const requests = []
  const list = setup({ loadMapBins: async request => {
    requests.push(request)
    return { code: 0, data: Array.from({ length: 50 }, (_, index) => ({ id: `${request.page}-${index}`, latitude: .5, longitude: .5 })) }
  } })
  await list.loadTrashBinList({ latitude: .5, longitude: .5 }, 12)
  assert.equal(requests.length, 6, 'a full viewport load is capped at six pages')
  assert.deepEqual(requests.map(({ page, pageSize }) => [page, pageSize]), Array.from({ length: 6 }, (_, index) => [index + 1, 50]))
  assert.equal(list.points.value.length, 300)
  assert.deepEqual(list.errors, [])
}

{
  const { setInterval, clearInterval, setTimeout, clearTimeout, uni } = globalThis
  const requests = []
  let sample, reload, pendingScale, centerReads = 0
  const center = { latitude: 36, longitude: 120 }
  const points = [{ id: 1, ...center }, { id: 2, ...center, longitude: 120.0003 }]
  globalThis.uni = { getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 800 }) }
  globalThis.setInterval = callback => { sample = callback; return 1 }
  globalThis.clearInterval = () => { sample = null }
  globalThis.setTimeout = callback => { reload = callback; return 2 }
  globalThis.clearTimeout = () => { reload = null }
  const list = setup({ initialPoints: points, webMap: null,
    getNativeMap: () => ({
      getScale: ({ success }) => { pendingScale = success },
      getCenterLocation: ({ success }) => { centerReads++; success(center) }
    }),
    loadMapBins: async request => { requests.push(request); return { code: 0, data: [] } }
  })
  try {
    const cameraScale = { value: list.mapScale.value }
    const afterRender = []
    const setMapZoom = createMapZoomSetter(list.mapScale, cameraScale, callback => afterRender.push(callback))
    setMapZoom(18)
    await list.loadTrashBinList(center, 18)
    const stop = list.watchDevtoolsZoom(() => true)
    sample()
    pendingScale({ scale: 12 })
    assert.equal(clusterMapMarkers(points, list.mapScale.value).length, 1, 'zoom-out merges points without regionchange')
    assert.equal(cameraScale.value, 18, 'the simulator gesture does not write the map scale prop')
    assert.equal(centerReads, 1, 'a missing event center comes from the native map')
    assert.equal(requests.length, 1, 'the request is still debounced')
    reload()
    await Promise.resolve()
    assert.equal(requests.length, 2)
    assert.ok(requests[1].minLng < requests[0].minLng && requests[1].maxLng > requests[0].maxLng)

    sample()
    pendingScale({ scale: 18 })
    assert.equal(clusterMapMarkers(points, list.mapScale.value).length, 2, 'zoom-in splits points without regionchange')
    list.cancelViewportReload()
    sample()
    stop()
    pendingScale({ scale: 12 })
    assert.equal(list.mapScale.value, 18, 'a pending zoom read is ignored after closing the observer')
    assert.equal(sample, null)

    list.syncNativeViewport({ type: 'end', detail: { scale: 12, centerLocation: center } })
    assert.equal(cameraScale.value, 18, 'regionchange also leaves the camera prop alone')
    setMapZoom(18)
    assert.equal(cameraScale.value, 12, 'a repeated command first binds the actual scale')
    afterRender.shift()()
    assert.equal(cameraScale.value, 18, 'a repeated command is sent again after the prop update')
    assert.equal(list.mapScale.value, 18)
    list.cancelViewportReload()
  } finally {
    Object.assign(globalThis, { setInterval, clearInterval, setTimeout, clearTimeout, uni })
  }
}

{
  let viewport = bounds(.25, .65, .25, .65)
  const requests = []
  const list = setup({ webMap: { getBounds: () => viewport, getZoom: () => 12 }, loadMapBins: async request => {
    requests.push(request)
    return { code: 0, data: requests.length === 1 ? [] : Array.from({ length: 50 }, (_, index) => ({ id: `increment-${index}`, latitude: .8, longitude: 1.05 })) }
  } })
  await list.loadTrashBinList({ latitude: .5, longitude: .5 }, 12)
  viewport = bounds(.35, .75, .35, .75)
  await list.loadTrashBinList({ latitude: .6, longitude: .6 }, 12)
  assert.equal(requests.length, 5, 'each uncovered incremental strip is capped at two pages')
  const incrementalRects = new Map()
  for (const { page, pageSize, ...rect } of requests.slice(1)) {
    const key = JSON.stringify(rect)
    incrementalRects.set(key, [...(incrementalRects.get(key) || []), [page, pageSize]])
  }
  assert.equal(incrementalRects.size, 2, 'the shifted viewport requests only its two uncovered strips')
  for (const pages of incrementalRects.values()) assert.deepEqual(pages, [[1, 50], [2, 50]])
  assert.equal(list.points.value.length, 50, 'duplicate identities across incremental pages are merged')
}

{
  const initial = Array.from({ length: 5001 }, (_, index) => ({
    id: String(index), latitude: index === 0 ? 20 : .5 + index / 1e8, longitude: .5,
    name: `old-${index}`
  }))
  const list = setup({ initialPoints: initial, loadMapBins: async () => ({ code: 0, data: [{ id: '1', latitude: .5, longitude: .5, name: 'updated' }] }) })
  await list.loadTrashBinList({ latitude: .5, longitude: .5 }, 12)
  assert.equal(list.points.value.length, 5000, 'the cache is bounded to five thousand nearest points')
  assert.equal(list.points.value.some(point => point.id === '0'), false, 'far points are evicted first')
  assert.equal(list.points.value.filter(point => point.id === '1').length, 1, 'fetched points replace matching cached identities')
  assert.equal(list.points.value.find(point => point.id === '1').name, 'updated')
}

{
  const timers = new Map()
  const cleared = []
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  let nextId = 0
  globalThis.setTimeout = callback => { const id = ++nextId; timers.set(id, callback); return id }
  globalThis.clearTimeout = id => { if (id != null) { cleared.push(id); timers.delete(id) } }
  try {
    const requests = []
    const list = setup({ loadMapBins: async request => { requests.push(request); return { code: 0, data: [] } } })
    list.scheduleViewportReload({ latitude: .5, longitude: .5 }, 12)
    list.scheduleViewportReload({ latitude: .51, longitude: .51 }, 12)
    assert.deepEqual(cleared, [1], 'a newer viewport movement cancels the prior debounce timer')
    assert.deepEqual([...timers.keys()], [2])
    timers.get(2)()
    timers.delete(2)
    await new Promise(resolve => realSetTimeout(resolve, 0))
    assert.equal(requests.length, 1, 'only the latest debounced viewport is loaded')
    list.scheduleViewportReload({ latitude: .6, longitude: .6 }, 12)
    list.scheduleViewportReload({ latitude: .51, longitude: .51 }, 12)
    assert.deepEqual([...timers.keys()], [])
    assert.deepEqual(cleared, [1, 3], 'returning to the loaded view cancels the pending request for a different area')
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }
}

{
  const points = [
    { id: 'west', latitude: .5, longitude: .05 },
    { id: 'north', latitude: .95, longitude: .5 },
    { id: 'middle', latitude: .5, longitude: .5 },
    { id: 'east', latitude: .5, longitude: .95 }
  ]
  const requests = []
  const list = setup({ webMap: { getBounds: () => bounds(0, 1, 0, 1), getZoom: () => 9 },
    loadMapBins: async rect => {
      requests.push(rect)
      return { code: 0, data: points.filter(point => point.latitude >= rect.minLat && point.latitude <= rect.maxLat &&
        point.longitude >= rect.minLng && point.longitude <= rect.maxLng) }
    }
  })
  await list.loadTrashBinList()
  assert.equal(requests.length, 9)
  assert.ok(requests.every(rect => rect.maxLat - rect.minLat <= .5 && rect.maxLng - rect.minLng <= .5))
  assert.deepEqual(new Set(list.points.value.map(point => point.id)), new Set(points.map(point => point.id)))
}

for (const [height, width, expectedWidth] of [[.8, 3.2, 3.2], [30, 30, 1.8]]) {
  const requests = []
  const list = setup({ webMap: { getBounds: () => bounds(0, height, 0, width), getZoom: () => 8 },
    loadMapBins: async rect => { requests.push(rect); return { code: 0, data: [] } }
  })
  await list.loadTrashBinList({ latitude: height / 2, longitude: width / 2 }, 8)
  assert.equal(requests.length, 16)
  const loadedWidth = Math.max(...requests.map(rect => rect.maxLng)) - Math.min(...requests.map(rect => rect.minLng))
  assert.ok(Math.abs(loadedWidth - expectedWidth) < 1e-9)
}

for (const fail of [true, false]) {
  let viewport = bounds(.25, .65, .25, .65)
  const requests = []
  const list = setup({ webMap: { getBounds: () => viewport, getZoom: () => 12 },
    loadMapBins: async rect => {
      requests.push(rect)
      if (rect.minLat < .3) {
        if (fail) throw new Error('request failed')
        return { code: 0, data: [], pagination: { total: 301 } }
      }
      return { code: 0, data: [{ id: 'recovered', latitude: .5, longitude: .5 }] }
    }
  })
  await list.loadTrashBinList({ latitude: .45, longitude: .45 }, 12)
  assert.equal(requests.length, fail ? 1 : 6, 'a known total continues paging even when an adapted page is short')
  viewport = bounds(.35, .75, .35, .75)
  await list.loadTrashBinList({ latitude: .55, longitude: .55 }, 12)
  const last = requests.at(-1)
  assert.ok(last.minLat < .4 && last.minLng < .4, 'the old overlap still needs a query')
  assert.ok(list.points.value.some(point => point.id === 'recovered'))
}

{
  let viewport = bounds(.25, .65, .25, .65)
  let resolveOld
  const list = setup({ webMap: { getBounds: () => viewport, getZoom: () => 12 }, loadMapBins: rect =>
    rect.minLat < .5 ? new Promise(resolve => { resolveOld = resolve }) :
      Promise.resolve({ code: 0, data: [{ id: 'latest', latitude: 1, longitude: 1 }] })
  })
  const old = list.loadTrashBinList({ latitude: .45, longitude: .45 }, 12)
  viewport = bounds(.8, 1.2, .8, 1.2)
  await list.loadTrashBinList({ latitude: 1, longitude: 1 }, 12)
  resolveOld({ code: 0, data: [{ id: 'old', latitude: .5, longitude: .5 }] })
  await old
  assert.deepEqual(list.points.value.map(point => point.id), ['latest'])
  assert.equal(list.updates.length, 1)
}

console.log('map point list checks passed: wide viewport coverage, paging, cache eviction, and stale viewport cancellation')
