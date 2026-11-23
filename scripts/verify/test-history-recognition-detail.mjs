import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { computed, ref } from 'vue'
import { getHistoryImageState } from '../../src/utils/recognition/history-image-state.mjs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const require = createRequire(import.meta.url)
const { initPreContext, preJs, preHtml } = require('@dcloudio/uni-cli-shared')
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const context = {}
runInNewContext(read('../../src/utils/recognition/recognition-sync.js').replace(/^export\s+/gm, '') + '\n' +
  read('../../src/utils/recognition/history-recognition-detail.mjs').replace(/^import .*$/gm, '').replace(/^export\s+/gm, '') +
  '\nthis.normalize = normalizeHistoryRecognitionDetail', context)
const normalize = context.normalize
const plain = value => JSON.parse(JSON.stringify(value))
const imageUrl = 'data:image/png;base64,aGVsbG8='

for (const empty of [null, {}, { version: 2, aiInsights: { disposalAdvice: 'unknown version' } },
  { version: 1, labels: [{ name: '可回收垃圾', confidence: 0.95 }] },
  { version: 1, aiInsights: { upcyclingRecommended: false, disposalAdvice: false, items: [] } }]) {
  const extra = normalize(empty)
  assert.equal(extra.hasContent, false, 'empty or category-only records add no content')
  assert.equal(extra.isLong, false)
}
const short = normalize({ version: 1, labels: [{ name: '可回收垃圾', object_name: '玻璃瓶' }],
  aiInsights: { disposalAdvice: '清空后投放' } })
assert.deepEqual(plain(short.items), ['玻璃瓶'])
assert.equal(short.sections[0].content, '清空后投放')
assert.equal(short.isLong, false, 'short content keeps original image and field sizing')
const structured = normalize({ version: 1, aiInsights: {
  items: [{ name: '塑料瓶' }, { name: '塑料瓶' }],
  expandedUpcycling: { steps: ['先清洁', '再晾干'], safety: '<img src=x onerror=alert(1)>' }
} })
assert.deepEqual(plain(structured.items), ['塑料瓶'])
assert.equal(structured.sections[0].content, '先清洁\n再晾干')
assert.equal(structured.sections[1].content, '<img src=x onerror=alert(1)>')
assert.equal(normalize({ version: 1, aiInsights: { disposalAdvice: '长'.repeat(281) } }).isLong, true)
assert.equal(normalize({ version: 1, aiInsights: {
  expandedUpcycling: '方案名称：收纳盒\n所需材料：纸箱\n操作步骤：裁剪\n安全提醒：小心边缘'
} }).isLong, true, 'multiple content blocks compact original detail')
assert.equal(normalize({ version: 1, upcyclingImageUrl: imageUrl }).imageUrl, imageUrl)
const downloadedImage = 'https://api.example.test/api/recognition_history/upcycling-image/12?token=fixture'
assert.equal(normalize({ version: 1, upcyclingImageUrl: downloadedImage }).imageUrl, downloadedImage)
assert.equal(normalize({ version: 1, upcyclingImageUrl: imageUrl }, true).hasContent, false)
for (const invalidImage of ['javascript:alert(1)', 'https://not-a-saved-image.example/x', 'data:text/html;base64,aGVsbG8=']) {
  assert.equal(normalize({ version: 1, upcyclingImageUrl: invalidImage }).imageUrl, '')
}

function createDetail(platform, dependencies) {
  initPreContext(platform)
  const code = preJs(read('../../src/utils/recognition/use-history-detail.js'))
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '')
  const setup = runInNewContext(code + '\nuseHistoryDetail', {
    ref, computed, getHistoryImageState, normalizeHistoryRecognitionDetail: normalize,
    baseUrl: 'https://api.example.test', ...dependencies
  })
  return setup({ selectMode: ref(false), toggleSelect() {} })
}

const pending = []
const imageLoads = []
const detail = createDetail('h5', {
  getHistoryImage: async id => {
    imageLoads.push(id)
    return { code: 0, data: { image: '/history.jpg' } }
  },
  getHistoryRecognitionDetail: id => new Promise((resolve, reject) => pending.push({ id, resolve, reject }))
})
const item = (id, hasDetails) => ({
  id, hasDetails, hasImage: true, category: '可回收垃圾', confidence: 0.9, time: '2026-10-24', source: 'online'
})
const response = name => ({ code: 0, data: { details: { version: 1, aiInsights: { items: [name] } } } })
const settle = () => new Promise(resolve => setImmediate(resolve))
for (const hasDetails of [undefined, false, 1, 'true']) detail.viewDetail(item(1, hasDetails))
assert.equal(pending.length, 0, 'legacy records never fetch detail')
assert.equal(detail.detailExtra.value.hasContent, false)
detail.viewDetail(item(2, true))
detail.viewDetail(item(3, true))
pending[1].resolve(response('current'))
await settle()
pending[0].resolve(response('stale'))
await settle()
assert.deepEqual(plain(detail.detailExtra.value.items), ['current'], 'late response cannot replace selected record')
detail.viewDetail(item(4, true))
detail.closeDetail()
pending[2].resolve(response('closed'))
await settle()
assert.equal(detail.detailExtra.value.hasContent, false, 'close invalidates outstanding requests')
detail.viewDetail(item(5, true))
pending[3].reject(new Error('offline'))
await settle()
assert.equal(detail.detailVisible.value, true)
assert.equal(detail.detailItem.value.category, '可回收垃圾')
assert.equal(detail.detailExtra.value.hasContent, false, 'fetch failure leaves basic detail intact')
assert.ok(imageLoads.includes(5), 'original photo loading still runs independently')
detail.viewDetail(item(6, true))
pending[4].resolve(response('prior'))
await settle()
detail.viewDetail(item(7, false))
assert.equal(detail.detailExtra.value.hasContent, false, 'switching to an ordinary record clears prior extras')

const nativeImageCalls = []
const nativeDetail = createDetail('app', {
  uni: { getStorageSync: () => 'token fixture' },
  getHistoryImage: async id => {
    nativeImageCalls.push(id)
    return { code: 0, data: { image: '/fallback.jpg' } }
  }
})
nativeDetail.viewDetail(item(8, false))
assert.match(nativeDetail.detailItem.value.image, /image\/8\?raw=1&token=token%20fixture&retry=0$/)
assert.deepEqual(nativeImageCalls, [])
nativeDetail.onDetailImageError()
await settle()
assert.deepEqual(nativeImageCalls, [8])
assert.equal(nativeDetail.detailItem.value.image, 'https://api.example.test/fallback.jpg')
assert.equal(nativeDetail.detailImageLoading.value, false)

const apiState = { uni: { getStorageSync: () => 'test-token' }, request: options => options }
runInNewContext(read('../../src/api/history.js').replace(/^import .*$/gm, '').replace(/^export\s+/gm, '') +
  '\nthis.fetchDetail = getHistoryRecognitionDetail', apiState)
const options = await apiState.fetchDetail(12)
assert.equal(options.url, '/api/recognition_history/detail/12')
assert.equal(options.silent, true)

const componentPath = '../../src/components/HistoryRecognitionExtra.vue'
const component = read(componentPath)
assert.doesNotMatch(component, /v-html|rich-text/, 'saved model text is rendered through escaped text nodes')
assert.match(component, /@error="emit\('image-error'\)"/)
const componentScript = parse(component).descriptor.scriptSetup.content
const webpImageUrl = 'data:image/webp;base64,UklGRgAAAABXRUJQ'
const componentState = { defineProps: () => ({ extra: { imageUrl: webpImageUrl } }), defineEmits: () => () => {},
  previewStoredImage: async value => { componentState.preview = value },
  uni: { showToast: options => { componentState.toast = options } } }
runInNewContext(componentScript.replace(/^import .*$/gm, '') + '\nthis.previewImage = previewImage', componentState)
await componentState.previewImage()
assert.equal(componentState.preview, webpImageUrl, 'stored WebP DataURL reaches the platform-aware preview unchanged')
componentState.previewStoredImage = async () => { throw new Error('unsupported preview') }
await componentState.previewImage()
assert.deepEqual(plain(componentState.toast), { title: '图片暂时无法预览', icon: 'none' })

for (const path of ['../../src/pages/history/history.vue', '../../src/pages-dark/history/history.vue', componentPath]) {
  const source = read(path)
  for (const target of ['h5', 'app', 'mp-weixin']) {
    initPreContext(target)
    const { descriptor, errors } = parse(preJs(preHtml(source)), { filename: path })
    assert.deepEqual(errors, [], `${path} ${target} parses`)
    const id = `history-detail-${target}-${path}`
    const script = compileScript(descriptor, { id })
    if (path !== componentPath) {
      assert.match(script.content, /__expose\(\{ onLoad \}\)/, `${path} ${target} exposes onLoad`)
      for (const binding of ['viewDetail', 'detailExtra', 'retryDetailImage', 'thumbUrl', 'setFilter', 'batchDelete', 'goBack']) {
        assert.ok(script.bindings[binding], `${path} ${target} exposes template binding ${binding}`)
      }
    }
    const template = compileTemplate({ source: descriptor.template.content, filename: path, id,
      compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [], `${path} ${target} template compiles`)
  }
}
console.log('History detail normalization, asynchronous VM behavior, image preview, and three-target SFC checks passed.')
