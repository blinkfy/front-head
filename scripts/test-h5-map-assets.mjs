import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { resolveH5MapAssets } from '../src/utils/h5-map-assets.mjs'

const moduleUrls = [
  ['http://localhost:3000/src/components/AppTencentMap.vue?vue&type=script', 'http://localhost:3000/src/'],
  ['https://example.test/assets/pages-nonTheme-live-location.hash.js', 'https://example.test/'],
  ['https://example.test/web/assets/pages-nonTheme-live-location.hash.js', 'https://example.test/web/']
]
const source = fs.readFileSync(new URL('../src/components/AppTencentMap.vue', import.meta.url), 'utf8')
assert.match(source, /<map[\s\S]*?@updated="\$emit\('updated', \$event\)"/, 'Fallback readiness clears the page error state')
assert.match(source, /<map[\s\S]*?@error="\$emit\('error', \$event\)"/, 'Fallback failure remains visible')
const options = source.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1]
function loadOptions(platform, moduleUrl) {
  const compiled = options.replace(/\/\/ #ifdef (H5|APP-PLUS)\r?\n([\s\S]*?)\/\/ #endif/g,
    (_, target, content) => target === platform ? content : '')
    .replace(/^import .*\r?\n/gm, '')
    .replaceAll('import.meta.url', 'moduleUrl').replace('export default', 'component =')
  const context = { moduleUrl, resolveH5MapAssets, baseUrl: 'https://different-api.test', mapConfig: {}, manifest: {}, Date }
  vm.runInNewContext(compiled, context)
  return context.component
}
for (const [url, root] of moduleUrls) {
  const assets = resolveH5MapAssets(url)
  assert.deepEqual(assets, { assetBase: root, frameUrl: root + 'static/app-map/index.html' })
  const data = loadOptions('H5', url).data()
  assert.equal(data.frameUrl, assets.frameUrl, 'H5 iframe follows its deployed frontend instead of API host')
  assert.equal(data.assetBase, assets.assetBase)
}
const appData = loadOptions('APP-PLUS', 'file:///not-used.js').data()
assert.equal(appData.frameUrl, 'https://different-api.test/web/static/app-map/index.html', 'App fallback address stays compatible')

const manifest = JSON.parse(fs.readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'))
const configSource = fs.readFileSync(new URL('../src/api/map-config.js', import.meta.url), 'utf8').replace('export const', 'const')
const primaryKey = vm.runInNewContext(configSource + '; mapConfig.qqMapKey')
assert.ok(primaryKey)
assert.equal(manifest.h5.sdkConfigs.maps.tencent.key, primaryKey, 'Uni H5 fallback uses the same configured web map key')
console.log('PASS: dev / root / subpath H5 assets, different API origin, App compatibility, H5 fallback key')
