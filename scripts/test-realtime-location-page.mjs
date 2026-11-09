import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { realtimeRouteName } from '../src/utils/realtime-route.mjs'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')

assert.equal(realtimeRouteName('%E5%BC%A0%E4%B8%89'), '张三', 'encoded route names are decoded')
assert.equal(realtimeRouteName('张三'), '张三', 'already-decoded names stay intact')
assert.equal(realtimeRouteName('100%'), '100%', 'literal percent names survive invalid escape sequences')
assert.equal(realtimeRouteName('A'.repeat(90)).length, 80, 'route names are bounded')

const source = fs.readFileSync(new URL('../src/pages-nonTheme/live-location.vue', import.meta.url), 'utf8')
assert.match(source, /await liveLocationTracker\.permission\(\{ isCurrent \}\)/, 'explicit retry waits for a current page/account permission result')
assert.match(source, /async retrySharing\(\)/, 'permission denial leaves an in-page retry action')
assert.match(source, /if \(!isCurrent\(\)\) return/, 'a late permission result cannot enter after page exit or account change')
assert.match(source, /canMinimize && this\.state\.phase === 'sharing'/, 'sharing pages can return to chat without an explicit leave')
assert.match(source, /liveLocations\.end\('left'\)/, 'explicit stop ends the owned session')
assert.match(source, /location-person\.png/, 'peer map marker uses the person marker asset')

const activeLocation = { supported: true, phase: 'sharing', sessionId: 'session_active', peer: { id: '2' },
  selfPoint: { latitude: 1 }, peerPoint: { latitude: 2 }, offers: {} }
let mask = 0, ended = 0, back = 0
const context = {
  ManifestIcon: {}, AppTencentMap: {}, liveLocationState: activeLocation, ThemeManager: { getTheme: () => 'light' },
  androidRealtimeAvailable: () => true, webLocationAvailable: () => false, miniLocationAvailable: () => false,
  androidBackgroundMask: () => mask, uni: { getStorageSync: () => 'owner' }, clearInterval, clearTimeout,
  liveLocations: { enter() { throw new Error('已有实时位置共享，请先结束') }, end() { ended++ } }
}
vm.createContext(context)
vm.runInContext(parse(source).descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'globalThis.page ='), context)
function openedPage(peerId) {
  const { data, computed, methods } = context.page
  const instance = { ...data(), ...methods, peer: { id: peerId }, entryOwner: 'owner', pageVisible: true, prepared: true }
  instance.navigateBack = () => { back++ }
  Object.defineProperty(instance, 'state', { get: () => computed.state.call(instance) })
  Object.defineProperty(instance, 'canMinimize', { get: () => computed.canMinimize.call(instance) })
  instance.tryEnter()
  return instance
}
const unrelated = openedPage('3')
assert.equal(unrelated.state.peerPoint, null, 'a different peer page never shows another session coordinates')
assert.equal(unrelated.ownedId, '', 'a rejected enter cannot claim the existing session')
context.page.onUnload.call(unrelated)
assert.equal(ended, 0, 'a different peer page cannot end the current share')
const same = openedPage('2')
assert.equal(same.state.peerPoint, activeLocation.peerPoint, 'reopening the same share reuses its current coordinates')
assert.equal(context.page.onBackPress.call(same), false, 'hardware back can exit if the Android background service is unavailable')
assert.equal(ended, 1)
mask = 2
const minimized = openedPage('2')
assert.equal(context.page.onBackPress.call(minimized), true)
assert.equal(back, 1)
context.page.onUnload.call(minimized)
assert.equal(ended, 1, 'intentional minimization preserves the current share')

for (const filename of ['../src/pages-nonTheme/live-location.vue', '../src/components/RealtimeActivityEntry.vue', '../src/pages-nonTheme/chat.vue',
  '../src/pages-nonTheme/settings.vue', '../src/pages-nonTheme/voice-scan.vue', '../src/pages-nonTheme/recognition-camera.vue',
  '../src/pages/map/map.vue', '../src/pages-dark/map/map.vue', '../src/pages-nonTheme/components/shop/ShopAddressPicker.vue']) {
  const path = new URL(filename, import.meta.url)
  const content = fs.readFileSync(path, 'utf8')
  const parsed = parse(content, { filename })
  assert.equal(parsed.errors.length, 0, `${filename} parses as an SFC`)
  for (const [platform, context] of [['H5', { H5: true }], ['APP-PLUS', { APP: true, APP_PLUS: true }],
    ['MP-WEIXIN', { MP: true, MP_WEIXIN: true }]]) {
    if (parsed.descriptor.script || parsed.descriptor.scriptSetup) {
      const selected = parsed.descriptor.scriptSetup || parsed.descriptor.script
      const isSetup = !!parsed.descriptor.scriptSetup
      const script = preprocess(selected.content, context, { type: 'js' })
      const descriptor = isSetup ? { ...parsed.descriptor, scriptSetup: { ...selected, content: script } } :
        { ...parsed.descriptor, script: { ...selected, content: script } }
      assert.ok(compileScript(descriptor, { id: `${platform}-${filename}` }).content.length > 0,
        `${filename} script compiles for ${platform}`)
    }
    const template = preprocess(parsed.descriptor.template.content, context, { type: 'html' })
    const compiled = compileTemplate({ source: template, filename, id: `${platform}-${filename}` })
    assert.deepEqual(compiled.errors, [], `${filename} template compiles for ${platform}`)
  }
}

console.log('Realtime location, permission recovery, and H5/App/MP SFC tests passed.')
