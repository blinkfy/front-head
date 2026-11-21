import assert from 'node:assert/strict'
import { createMapPointList } from '../../src/utils/map/point-list.mjs'

function bounds(minLat, maxLat, minLng, maxLng) {
  const point = (lat, lng) => ({ getLat: () => lat, getLng: () => lng })
  return { getNorthEast: () => point(maxLat, maxLng), getSouthWest: () => point(minLat, minLng) }
}

function setup({ initialPoints = [], loadMapBins, webMap = { getBounds: () => bounds(0, 1, 0, 1), getZoom: () => 12 } } = {}) {
  const points = { value: initialPoints }
  const userLocation = { value: { latitude: 0.5, longitude: 0.5 } }
  const mapScale = { value: 12 }
  const updates = []
  const errors = []
  const list = createMapPointList({
    points, userLocation, mapScale, getWebMap: () => webMap,
    isNavigationMode: () => false,
    loadMapBins: loadMapBins || (async () => ({ code: 0, data: [] })),
    resolveImage: path => path || '', onUpdate: () => updates.push(points.value.length), onError: error => errors.push(error)
  })
  return { ...list, points, updates, errors }
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
  let viewport = bounds(0, 1, 0, 1)
  const requests = []
  const list = setup({ webMap: { getBounds: () => viewport, getZoom: () => 12 }, loadMapBins: async request => {
    requests.push(request)
    return { code: 0, data: requests.length === 1 ? [] : Array.from({ length: 50 }, (_, index) => ({ id: `increment-${index}`, latitude: .8, longitude: 1.05 })) }
  } })
  await list.loadTrashBinList({ latitude: .5, longitude: .5 }, 12)
  viewport = bounds(.1, 1.1, .1, 1.1)
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
  const initial = Array.from({ length: 1001 }, (_, index) => ({
    id: String(index), latitude: index === 0 ? 20 : .5 + index / 1e8, longitude: .5,
    name: `old-${index}`
  }))
  const list = setup({ initialPoints: initial, loadMapBins: async () => ({ code: 0, data: [{ id: '1', latitude: .5, longitude: .5, name: 'updated' }] }) })
  await list.loadTrashBinList({ latitude: .5, longitude: .5 }, 12)
  assert.equal(list.points.value.length, 1000, 'the cache is bounded to one thousand nearest points')
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
    list.cancelViewportReload()
    assert.deepEqual([...timers.keys()], [])
    assert.deepEqual(cleared, [1, 3], 'explicit cancellation clears the pending timer')
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }
}

console.log('map point list checks passed: full/incremental page caps, cache deduplication and eviction, viewport timer cancellation')
