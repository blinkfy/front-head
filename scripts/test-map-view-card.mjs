import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveMapViewCard } from '../src/utils/map-view-card.mjs'

const latest = {
  id: '42', name: '最新点位名', description: '审核后的最新说明', latitude: '25.0412', longitude: '121.5654',
  type: 'smart', image: '/latest.jpg'
}
let requestedId
const platform = await resolveMapViewCard(
  { pointId: '42', lat: '1', lng: '2', name: '聊天快照', address: '旧地址' },
  async id => { requestedId = id; return { code: 0, data: latest } }
)
assert.equal(requestedId, '42', 'platform point lookup uses the requested identity')
assert.deepEqual(platform.point, { ...latest, id: '42', latitude: 25.0412, longitude: 121.5654, sharedLocation: false }, 'platform card uses current approved attributes and coordinates')
assert.deepEqual(platform.location, { latitude: 25.0412, longitude: 121.5654, name: '最新点位名', address: '审核后的最新说明' })

for (const invalidId of ['bad-id', '0', '-1', '12345678901234567']) {
  await assert.rejects(resolveMapViewCard({ pointId: invalidId, lat: 31, lng: 121 }, async () => latest), /无效/)
}
for (const failed of [
  { code: 404 }, { code: 503 }, { code: 0, data: { ...latest, id: '99' } },
  { code: 0, data: { ...latest, latitude: 91 } }
]) {
  await assert.rejects(resolveMapViewCard({ pointId: '42', lat: '1', lng: '2', name: '不能回退的快照' }, async () => failed), /移除或暂不可用/,
    'missing, mismatched, or invalid latest data never falls back to shared coordinates')
}
await assert.rejects(resolveMapViewCard({ pointId: '42' }, async () => { throw new Error('network failure') }), /network failure/)

let genericLookupCount = 0
const shared = await resolveMapViewCard(
  { lat: '25.03', lng: '121.52', name: encodeURIComponent('朋友的位置'), address: encodeURIComponent('附近') },
  async () => { genericLookupCount++; throw new Error('must not load a point') }
)
assert.equal(genericLookupCount, 0, 'ordinary shared coordinates do not query the point API')
assert.deepEqual(shared.point, { id: -2, latitude: 25.03, longitude: 121.52, name: '朋友的位置', description: '附近', sharedLocation: true })

for (const filename of ['../src/pages/map/map.vue', '../src/pages-dark/map/map.vue']) {
  const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8')
  const template = source.slice(source.indexOf('<template>'), source.indexOf('</template>'))
  assert.match(template, /class="info-card"/, `${filename}: view card reuses the existing info card`)
  assert.doesNotMatch(template, /class="view-location-panel"/, `${filename}: old location panel is absent`)
  assert.match(template, /v-if="selectedMarker && !selectMode"/, `${filename}: selected marker controls card visibility`)
  assert.match(template, /v-if="!selectedMarker\.sharedLocation"[^>]*@click="openHistoryImage\(selectedMarker\)"/, `${filename}: shared coordinates hide image action`)
  assert.match(template, /v-if="!selectedMarker\.sharedLocation"[^>]*@click="reportErrorMarker\(selectedMarker\)"/, `${filename}: shared coordinates hide report action`)

  const close = source.match(/function closeInfo\(\)\s*\{([^}]*)\}/)
  assert(close?.[1].includes('selectedMarker.value = null'), `${filename}: closing the card clears its selection`)
  const markerTap = source.match(/function onMarkerTap\(e\)\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(markerTap, /onH5MarkerClicked\(0, viewPoint\.value\)/, `${filename}: marker tap can reselect the viewed point after close`)
  assert.match(source, /function onH5MarkerClicked\([\s\S]*?selectedMarker\.value\s*=\s*\{/, `${filename}: marker selection reopens the info card`)
}

console.log('map view card checks passed: latest approved point, safe failures, shared location, both theme cards and reopen flow')
