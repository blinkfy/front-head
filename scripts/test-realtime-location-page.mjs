import assert from 'node:assert/strict'
import fs from 'node:fs'
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
