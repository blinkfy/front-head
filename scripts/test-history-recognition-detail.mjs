import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const context = {}
runInNewContext(read('../src/utils/recognition-sync.js').replace(/^export\s+/gm, '') + '\n' +
  read('../src/utils/history-recognition-detail.mjs').replace(/^import .*$/gm, '').replace(/^export\s+/gm, '') +
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
assert.equal(normalize({ version: 1, upcyclingImageUrl: imageUrl }, true).hasContent, false)
for (const invalidImage of ['javascript:alert(1)', 'https://not-a-saved-image.example/x', 'data:text/html;base64,aGVsbG8=']) {
  assert.equal(normalize({ version: 1, upcyclingImageUrl: invalidImage }).imageUrl, '')
}

for (const pagePath of ['../src/pages/history/history.vue', '../src/pages-dark/history/history.vue']) {
  const source = read(pagePath)
  const script = parse(source).descriptor.scriptSetup.content
  const names = new Set(['detailRecognition', 'detailExtraImageFailed', 'detailExtra', 'detailRecognitionRequest',
    'viewDetail', 'loadDetailRecognition', 'closeDetail'])
  const nodes = parseJavaScript(script, { sourceType: 'module' }).program.body.filter(node =>
    (node.type === 'FunctionDeclaration' && names.has(node.id.name)) ||
    (node.type === 'VariableDeclaration' && node.declarations.some(item => names.has(item.id.name))))
  const pending = []
  const imageLoads = []
  const state = {
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter() } }),
    normalizeHistoryRecognitionDetail: normalize,
    imagePreviewVisible: { value: true }, detailItem: { value: {} }, detailVisible: { value: false },
    detailImageFailed: { value: false }, detailImageLoading: { value: false }, detailImageRequest: 0,
    loadDetailImage: item => imageLoads.push(item.id),
    getHistoryRecognitionDetail: id => new Promise((resolve, reject) => pending.push({ id, resolve, reject }))
  }
  runInNewContext(nodes.map(node => script.slice(node.start, node.end)).join('\n') +
    '\nthis.api = { viewDetail, closeDetail, loadDetailRecognition, read: () => detailExtra.value }', state)
  const item = (id, hasDetails) => ({ id, hasDetails, category: '可回收垃圾', confidence: 0.9, time: '2026-10-24', source: 'online' })
  for (const hasDetails of [undefined, false, 1, 'true']) state.api.viewDetail(item(1, hasDetails))
  assert.equal(pending.length, 0, `${pagePath} legacy records never fetch detail`)
  assert.equal(state.api.read().hasContent, false)
  state.api.viewDetail(item(2, true))
  state.api.viewDetail(item(3, true))
  const response = name => ({ code: 0, data: { details: { version: 1, aiInsights: { items: [name] } } } })
  pending[1].resolve(response('current'))
  await new Promise(resolve => setImmediate(resolve))
  pending[0].resolve(response('stale'))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(plain(state.api.read().items), ['current'], `${pagePath} late response cannot replace selected record`)
  state.api.viewDetail(item(4, true))
  state.api.closeDetail()
  pending[2].resolve(response('closed'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.api.read().hasContent, false, `${pagePath} close invalidates outstanding requests`)
  state.api.viewDetail(item(5, true))
  pending[3].reject(new Error('offline'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.detailVisible.value, true)
  assert.equal(state.detailItem.value.category, '可回收垃圾')
  assert.equal(state.api.read().hasContent, false, `${pagePath} fetch failure leaves basic detail intact`)
  assert.ok(imageLoads.includes(5), 'original photo loading still runs independently')
  state.api.viewDetail(item(6, true))
  pending[4].resolve(response('prior'))
  await new Promise(resolve => setImmediate(resolve))
  state.api.viewDetail(item(7, false))
  assert.equal(state.api.read().hasContent, false, 'switching to an ordinary record clears prior extras')
}

const apiState = { uni: { getStorageSync: () => 'test-token' }, request: options => options }
runInNewContext(read('../src/api/history.js').replace(/^import .*$/gm, '').replace(/^export\s+/gm, '') +
  '\nthis.fetchDetail = getHistoryRecognitionDetail', apiState)
const options = await apiState.fetchDetail(12)
assert.equal(options.url, '/api/recognition_history/detail/12')
assert.equal(options.silent, true)

const componentPath = '../src/components/HistoryRecognitionExtra.vue'
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

for (const path of ['../src/pages/history/history.vue', '../src/pages-dark/history/history.vue', componentPath]) {
  const source = read(path)
  for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
    const { descriptor, errors } = parse(source, { filename: path })
    assert.deepEqual(errors, [], `${path} ${target} parses`)
    const id = `history-detail-${target}-${path}`
    const script = compileScript(descriptor, { id })
    const template = compileTemplate({ source: descriptor.template.content, filename: path, id,
      compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [], `${path} ${target} template compiles`)
  }
}
console.log('History detail normalization, asynchronous VM behavior, image preview, and three-target SFC checks passed.')
