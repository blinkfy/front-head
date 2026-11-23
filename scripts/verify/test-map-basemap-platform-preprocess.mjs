import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createMapBasemapController, isBinLocationPicker } from '../../src/utils/map/map-basemap-core.mjs'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const { captureSatelliteReference } = await import('../../src/utils/map/bin-satellite-reference.mjs')
const { getTencentBasemapOptions, createSatelliteDetailController } = await import('../../src/utils/map/app-tencent-map.mjs')
const sourcePath = new URL('../../src/utils/map/use-map-basemap.js', import.meta.url)
const source = fs.readFileSync(sourcePath, 'utf8')

const targets = [
  ['MP-WEIXIN', { MP: true, MP_WEIXIN: true, H5: false, APP_PLUS: false }],
  ['APP-PLUS', { MP: false, MP_WEIXIN: false, H5: false, APP_PLUS: true }],
  ['H5', { MP: false, MP_WEIXIN: false, H5: true, APP_PLUS: false }]
]
const compiled = new Map()
for (const [platform, flags] of targets) {
  const code = preprocess(source, flags, { type: 'js' })
  assert.doesNotMatch(code, /^\s*\/\/\s*#(?:ifdef|ifndef|endif)/m, `${platform}: Uni directives are consumed`)
  compiled.set(platform, code)
}

for (const platform of ['MP-WEIXIN', 'APP-PLUS']) {
  const code = compiled.get(platform)
  assert.doesNotMatch(code, /(?:from\s*|import\s*)['"][^'"]*app-tencent-map(?:\.mjs)?['"]/, `${platform}: Tencent web helper is absent from imports`)
  assert.doesNotMatch(code, /(?:from\s*|import\s*)['"][^'"]*bin-satellite-reference(?:\.mjs)?['"]/, `${platform}: H5 satellite capture helper is absent from imports`)
  assert.doesNotMatch(code, /static\/app-map\/renderer(?:\.mjs|\.js)?/, `${platform}: no static renderer dependency remains`)
}
assert.match(compiled.get('H5'), /from\s*['"]\.\/app-tencent-map\.mjs['"]/, 'H5 retains the Tencent map helper import')
assert.match(compiled.get('H5'), /from\s*['"]\.\/bin-satellite-reference\.mjs['"]/, 'H5 retains satellite capture helper import')
assert.match(compiled.get('H5'), /h5Detail\s*=\s*createSatelliteDetailController/, 'H5 retains bindH5Map initialization')
assert.match(compiled.get('H5'), /map\.setBaseMap\(getTencentBasemapOptions\(enabled\)\)/, 'H5 retains map basemap switching')

// Execute MP-WEIXIN's actual preprocessed hook with minimal runtime doubles.
const callbacks = {}
const vue = {
  getCurrentInstance: () => ({ root: { proxy: {} } }),
  nextTick: fn => fn(), onBeforeUnmount: fn => { callbacks.dispose = fn },
  onMounted: fn => { callbacks.mounted = fn }, ref: value => ({ value }), watch() {}
}
const uni = { canIUse: () => true, showToast() {} }
const code = compiled.get('MP-WEIXIN')
  .replace(/^import .*?\r?\n/gm, '')
  .replace('export function useMapBasemap', 'function useMapBasemap')
const factory = new Function('getCurrentInstance', 'nextTick', 'onBeforeUnmount', 'onMounted', 'ref', 'watch',
  'onReady', 'onUnload', 'onShow', 'onHide', 'createMapBasemapController', 'isBinLocationPicker',
  'captureSatelliteReference', 'getTencentBasemapOptions', 'createSatelliteDetailController', 'appManifest',
  'uni', 'process', 'plus', 'console', 'setTimeout', 'clearTimeout',
  `${code}\nreturn useMapBasemap`)
const useMapBasemap = factory(vue.getCurrentInstance, vue.nextTick, vue.onBeforeUnmount, vue.onMounted, vue.ref, vue.watch,
  fn => { callbacks.ready = fn }, fn => { callbacks.unload = fn }, fn => { callbacks.show = fn }, fn => { callbacks.hide = fn },
  args => createMapBasemapController(args), isBinLocationPicker, captureSatelliteReference, getTencentBasemapOptions,
  createSatelliteDetailController, undefined, uni, { env: { UNI_PLATFORM: 'mp-weixin' } }, undefined,
  { warn() {} }, setTimeout, clearTimeout)
const hook = useMapBasemap({ isH5: false, options: { mode: 'browse' } })
callbacks.mounted()
hook.onNativeMapUpdated()
hook.setBasemap(true)
hook.onNativeMapUpdated()
assert.equal(hook.satellite.value, true, 'MP can request satellite mode')
assert.equal(hook.basemapLoading.value, false, 'MP native update completes the basemap request')
callbacks.dispose()

for (const relativePath of [
  '../../src/static/app-map/index.html',
  '../../src/static/app-map/renderer.mjs',
  '../../src/static/app-map/host.mjs'
]) assert.ok(fs.existsSync(new URL(relativePath, import.meta.url)), `App map asset remains: ${relativePath}`)
const appComponent = fs.readFileSync(new URL('../../src/components/map/AppTencentMap.vue', import.meta.url), 'utf8')
assert.match(appComponent, /lang="renderjs"/, 'App renderjs bridge remains')
assert.match(appComponent, /static\/app-map\/index\.html/, 'App iframe still targets the static renderer page')

console.log('PASS map basemap Uni preprocessing for MP-WEIXIN, APP-PLUS and H5; MP runtime and App map assets')
