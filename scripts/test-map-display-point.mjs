import assert from 'node:assert/strict'
import { toMapDisplayPoint } from '../src/utils/map-display-point.mjs'

const original = { id: 2, latitude: '31.230000000000001', longitude: '121.470000000000000',
  coordinateSystem: 'wgs84', mapType: 'recycling', mapLatitude: 31.228, mapLongitude: 121.474 }
const displayed = toMapDisplayPoint(original)
assert.equal(displayed.latitude, original.mapLatitude)
assert.equal(displayed.longitude, original.mapLongitude)
assert.equal(displayed.sourceLatitude, original.latitude)
assert.equal(displayed.sourceLongitude, original.longitude)
assert.equal(original.latitude, '31.230000000000001')
assert.deepEqual(toMapDisplayPoint(displayed), displayed, 'display normalization must not replace raw coordinates twice')
assert.equal(toMapDisplayPoint({ latitude: 36, longitude: 120 }).latitude, 36)
assert.equal(toMapDisplayPoint({ latitude: 36, longitude: 120, mapLatitude: 'bad', mapLongitude: 120 }).latitude, 36)
console.log('map display coordinate adapter passed: raw precision preserved, display coordinates used, normalization idempotent')
