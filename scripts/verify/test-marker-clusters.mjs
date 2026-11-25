import assert from 'node:assert/strict'
import { clusterMapMarkers } from '../../src/utils/map/marker-clusters.mjs'

const point = (id, latitude, longitude) => ({ id, latitude, longitude })
const first = point(1, 36, 120.38)
const second = point(2, '36.0', '120.381')
const distant = point(3, 36, 120.5)
const points = [first, second, distant]

const [cluster, single] = clusterMapMarkers(points, 12)
assert.equal(cluster.type, 'cluster')
assert.equal(cluster.count, 2)
assert.deepEqual(cluster.members, [first, second])
assert.ok(Math.abs(cluster.latitude - 36) < 1e-9)
assert.ok(Math.abs(cluster.longitude - 120.3805) < 1e-9)
assert.equal(single.point, distant)
assert.deepEqual(clusterMapMarkers([distant, second, first], 12), [cluster, single])
assert.equal(clusterMapMarkers(points, 13)[0].id, cluster.id)
assert.equal(clusterMapMarkers(points, cluster.expansionZoom - 1)[0].type, 'cluster')
const split = clusterMapMarkers(points, cluster.expansionZoom)
assert.deepEqual(split.map(marker => marker.point), points)
assert.equal(split[1].latitude, 36)
assert.equal(split[1].longitude, 120.381)

const sameLocation = [first, point(4, '36', '120.380'), point(5, 36, 120.380000001)]
const [overlap, nearby] = clusterMapMarkers(sameLocation, 18, { maxZoom: 18 })
assert.equal(overlap.count, 2)
assert.equal(overlap.expansionZoom, null)
assert.deepEqual(overlap.members.map(member => member.id), [1, 4])
assert.equal(nearby.point, sameLocation[2])
assert.equal(clusterMapMarkers(sameLocation, 17.25, { maxZoom: 18 })[0].expansionZoom, 18)

// At street-level zoom nearby, nonidentical points split; exact overlaps stay selectable.
const streetPoints = [point(1, 22.5, 114.05), point(2, 22.5, 114.050001), point(3, 22.5, 114.05)]
assert.equal(clusterMapMarkers(streetPoints, 17)[0].count, 3)
const streetGroups = clusterMapMarkers(streetPoints, 18)
assert.deepEqual(streetGroups.map(group => group.members.map(member => member.id)), [[1, 3], [2]])
assert.equal(streetGroups[0].expansionZoom, null)

const sameLocationWithCategories = [
  { ...point(1, 36, 120.38), type: 'paper', mapType: 'waste_basket' },
  { ...point(2, 36, 120.38), type: 'paper', mapType: 'waste_basket' },
  { ...point(3, 36, 120.38), type: 'plastic', mapType: 'waste_basket' },
  { ...point(4, 36, 120.38), type: 'paper', mapType: 'recycling' },
  { ...point(5, 36, 120.38), type: 'paper' },
  { ...point(6, 36, 120.38), type: 'paper', mapType: null },
  { ...point(7, 36, 120.38), mapType: 'waste_basket' },
  { ...point(8, 36, 120.38), type: null, mapType: 'waste_basket' }
]
for (const zoom of [12, 20]) {
  const groups = clusterMapMarkers(sameLocationWithCategories, zoom)
  assert.deepEqual(groups.map(marker => marker.members.map(member => member.id)), [[1, 2], [3], [4], [5, 6], [7, 8]])
}

const boundaryZoom = 12
const longitudePerPixel = 360 / (256 * 2 ** boundaryZoom)
for (const [distance, groupCount] of [[27.99, 1], [28, 1], [28.01, 2]]) {
  const boundaryPoints = [point(1, 0, -180), point(2, 0, -180 + distance * longitudePerPixel)]
  assert.equal(clusterMapMarkers(boundaryPoints, boundaryZoom).length, groupCount)
}

const dateLine = [point(6, 0, 179.999), point(7, 0, -179.999)]
const [seamCluster] = clusterMapMarkers(dateLine, 12)
assert.equal(seamCluster.count, 2)
assert.ok(Math.abs(Math.abs(seamCluster.longitude) - 180) < 1e-9)
assert.equal(clusterMapMarkers(dateLine, seamCluster.expansionZoom).length, 2)
assert.equal(clusterMapMarkers([point(6, 0, 180), point(7, 0, -180)], 20)[0].count, 2)

assert.equal(clusterMapMarkers([point(1, 0, 0), point(2, 0.002, 0)], 14).length, 1)
assert.equal(clusterMapMarkers([point(1, 75, 0), point(2, 75.002, 0)], 14).length, 2)
const chain = [point(1, 0, 0), point(2, 0, 0.035), point(3, 0, 0.07)]
assert.deepEqual(clusterMapMarkers(chain, 10).map(marker => marker.count), [2, 1])
assert.equal(clusterMapMarkers(chain, 10, { radius: 24 }).length, 3)

const valid = point('zero', 0, 0)
const invalid = [null, point(1, null, 0), point(2, false, 0), point(3, '', 0),
  point(4, '0.0bad', 0), point(5, 0, 181), point(6, -91, 0), point(7, 0, Infinity)]
assert.deepEqual(clusterMapMarkers([...invalid, valid], 0).map(marker => marker.point), [valid])
assert.deepEqual(clusterMapMarkers([], 12), [])

console.log('map marker clusters passed: 28 px radius, categories, zoom expansion, overlap, antimeridian, and invalid coordinates')
