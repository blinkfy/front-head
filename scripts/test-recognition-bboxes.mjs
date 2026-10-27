import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parse, compileTemplate } from '@vue/compiler-sfc'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const sourcePath = path.join(root, 'src/utils/use-recognition-bboxes.js')
const source = fs.readFileSync(sourcePath, 'utf8')
const watches = []
const unloadCallbacks = []
let selectorRects = []
let selectorCallback = null
let deferSelectorCallback = false
let queryCount = 0
const scope = { proxy: {} }

function ref(value) { return { value } }
function computed(getter) { return { get value() { return getter() } } }
function watch(sources, callback) { watches.push({ sources, callback }) }
function runWatch(sourceRef) {
  for (const item of watches) {
    if (item.sources === sourceRef || (Array.isArray(item.sources) && item.sources.includes(sourceRef))) item.callback()
  }
}
const vueStub = { ref, computed, watch, nextTick: async () => {}, getCurrentInstance: () => scope,
  onBeforeUnmount: callback => unloadCallbacks.push(callback) }
const sandbox = {
  module: { exports: {} },
  exports: {},
  mapBboxToDisplay: null,
  getBboxColor: null,
  ref,
  computed,
  watch,
  nextTick: async () => {},
  getCurrentInstance: () => scope,
  onBeforeUnmount: callback => unloadCallbacks.push(callback),
  require(id) { if (id === 'vue') return vueStub; throw new Error(`Unexpected module: ${id}`) },
  setTimeout,
  clearTimeout,
  uni: {
    getWindowInfo: () => ({ windowWidth: 400 }),
    createSelectorQuery() {
      queryCount += 1
      const query = {
        in() { return query },
        select() { return { boundingClientRect() { return query } } },
        boundingClientRect() { return query },
        exec(callback) {
          selectorCallback = callback
          if (!deferSelectorCallback) callback(selectorRects)
        }
      }
      return query
    }
  }
}
const recognitionSyncPath = path.join(root, 'src/utils/recognition-sync.js')
let syncSource = fs.readFileSync(recognitionSyncPath, 'utf8').replace(/^export /gm, '')
syncSource += '\nmodule.exports = { getBboxColor, mapBboxToDisplay };'
const syncModule = { exports: {} }
vm.runInNewContext(syncSource, { module: syncModule, exports: syncModule.exports, require, console }, { filename: recognitionSyncPath })
sandbox.mapBboxToDisplay = syncModule.exports.mapBboxToDisplay
sandbox.getBboxColor = syncModule.exports.getBboxColor
sandbox.require = id => id === 'vue' ? vueStub : id === './recognition-sync' ? syncModule.exports : (() => { throw new Error(`Unexpected module: ${id}`) })()
let helperSource = source.replace(/^import .*\n/gm, '').replace(/^export /gm, '')
helperSource += '\nmodule.exports = { useRecognitionBboxes, buildDisplayBboxes };'
vm.runInNewContext(helperSource, sandbox, { filename: sourcePath })
const { useRecognitionBboxes, buildDisplayBboxes } = sandbox.module.exports
const { getBboxColor } = syncModule.exports

function close(actual, expected, label) { assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`) }

// CSS-pixel box placement includes centered aspectFit letterboxing, without DPR scaling.
const landscapeMetrics = { displayWidth: 300, displayHeight: 300, naturalWidth: 1200, naturalHeight: 600, objectFit: 'contain' }
const landscape = buildDisplayBboxes([{ bbox: [120, 60, 600, 300], label: { name: 'bottle' }, index: 0 }], landscapeMetrics, 'pixel', false, 5, 7)[0]
assert.equal(landscape.boxStyle.left, '35px')
assert.equal(landscape.boxStyle.top, '97px')
assert.equal(landscape.boxStyle.width, '120px')
assert.equal(landscape.boxStyle.height, '60px')
const normalized = buildDisplayBboxes([{ bbox: [0.1, 0.2, 0.5, 0.6], label: { name: 'can' }, index: 0 }],
  { displayWidth: 200, displayHeight: 400, naturalWidth: 400, naturalHeight: 800, objectFit: 'contain' }, 'normalized', false)[0]
assert.equal(normalized.boxStyle.left, '20px')
assert.equal(normalized.boxStyle.top, '80px')
const portraitLetterbox = buildDisplayBboxes([{ bbox: [100, 100, 300, 300], label: { name: 'item' }, index: 0 }],
  { displayWidth: 400, displayHeight: 200, naturalWidth: 200, naturalHeight: 400, objectFit: 'contain' }, 'pixel', false)[0]
assert.equal(portraitLetterbox.boxStyle.left, '200px')
assert.equal(portraitLetterbox.boxStyle.top, '50px')

// Category colors are fixed for supported names, English aliases and class ids.
const colorSamples = [
  [{ name: '可回收垃圾' }, '#2563eb'], [{ name: '有害垃圾' }, '#dc2626'],
  [{ category: '厨余垃圾' }, '#15803d'], [{ class_id: 0 }, '#64748b']
]
for (const [label, expected] of colorSamples) assert.equal(getBboxColor(label, 1), expected)
assert.equal(getBboxColor({ source_name: 'recyclable' }, 2), '#2563eb', 'English category aliases resolve to fixed colors')
assert.equal(getBboxColor({ name: 'unmapped-class' }, 2), getBboxColor({ name: 'unmapped-class' }, 2),
  'unknown fallback color remains stable for the same label')
assert.equal(new Set(colorSamples.map(([label]) => getBboxColor(label, 0))).size, colorSamples.length,
  'four supported categories have distinct colors')

function globalLabelRect(item) {
  const number = value => Number.parseFloat(value) || 0
  return {
    left: number(item.boxStyle.left) + 2 + number(item.labelStyle.left),
    top: number(item.boxStyle.top) + 2 + number(item.labelStyle.top),
    width: number(item.labelStyle.width), height: number(item.labelStyle.height)
  }
}
function overlaps(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left &&
    a.top < b.top + b.height && a.top + a.height > b.top
}
const crowded = [
  { name: '可回收垃圾', confidence: 0.91 }, { name: '厨余垃圾', confidence: 0.89 }
].map((label, index) => ({ bbox: [140, 130, 340, 330], label, index }))
const crowdedResult = buildDisplayBboxes(crowded,
  { displayWidth: 400, displayHeight: 400, naturalWidth: 400, naturalHeight: 400, objectFit: 'contain' }, 'pixel', false)
const crowdedRects = crowdedResult.map(globalLabelRect)
assert.equal(crowdedResult[0].labelStyle.background, '#2563eb')
assert.equal(crowdedResult[1].labelStyle.background, '#15803d')
assert.equal(overlaps(crowdedRects[0], crowdedRects[1]), false, 'feasible colliding labels should be staggered apart')
assert.ok(crowdedRects.every(rect => rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= 400 && rect.top + rect.height <= 400),
  'label rectangles stay clamped inside the image component')

const edgeAndMany = buildDisplayBboxes(Array.from({ length: 32 }, (_, index) => ({
  bbox: index < 2 ? [0, 0, 30, 30] : [index % 400, index % 300, index % 400 + 1, index % 300 + 1],
  label: { name: `项目${index}` }, index
})), { displayWidth: 400, displayHeight: 300, naturalWidth: 400, naturalHeight: 300, objectFit: 'contain' }, 'pixel', true)
assert.equal(edgeAndMany.length, 32, 'overcrowded layers retain all valid target labels')
assert.ok(edgeAndMany.every(item => {
  const rect = globalLabelRect(item)
  return [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= 400 && rect.top + rect.height <= 300
}), 'many labels and edge boxes remain finite and within bounds')
assert.equal(buildDisplayBboxes([], landscapeMetrics, 'pixel', false).length, 0, 'empty input emits no labels')

const sourceRef = ref('A')
const boxesRef = ref([{ bbox: [120, 60, 600, 300], label: { name: 'bottle' }, index: 0 }])
const spaceRef = ref('pixel')
const overlay = useRecognitionBboxes(sourceRef, boxesRef, spaceRef)
const rects = [{ left: 10, top: 20, width: 320, height: 320 }, { left: 20, top: 30, width: 300, height: 300 }]
selectorRects = rects
const staleA = overlay.bboxImage.value
const staleAKey = staleA.key
staleA.onLoad({ detail: { width: 1200, height: 600 } })
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(overlay.displayBboxes.value.length, 1)
assert.equal(overlay.displayBboxes.value[0].boxStyle.left, '40px')

// A query already in flight must be discarded if the image source changes before its callback.
deferSelectorCallback = true
overlay.queueRefreshDisplayBboxes()
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(typeof selectorCallback, 'function')
const staleMeasurement = selectorCallback
sourceRef.value = 'B'; runWatch(sourceRef)
deferSelectorCallback = false
staleMeasurement(rects)
assert.equal(overlay.displayBboxes.value.length, 0)
sourceRef.value = 'A'; runWatch(sourceRef)
const afterMeasurementChange = overlay.bboxImage.value
afterMeasurementChange.onLoad({ detail: { width: 1200, height: 600 } })
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(overlay.displayBboxes.value.length, 1)

// A -> B -> A must reject the first A's delayed load callback.
sourceRef.value = 'B'; runWatch(sourceRef)
sourceRef.value = 'A'; runWatch(sourceRef)
staleA.onLoad({ detail: { width: 1200, height: 600 } })
const currentAfterRoundTrip = overlay.bboxImage.value
currentAfterRoundTrip.onLoad({ detail: { width: 1200, height: 600 }, currentTarget: { dataset: { bboxKey: staleAKey } } })
assert.equal(overlay.displayBboxes.value.length, 0)
const currentA = currentAfterRoundTrip
currentA.onLoad({ detail: { width: 1200, height: 600 } })
// A newer measurement invalidates an already queued selector result.
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(overlay.displayBboxes.value.length, 1)

// Invalid image geometry/error and empty boxes clear overlays.
currentA.onError()
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(overlay.displayBboxes.value.length, 0)
currentA.onLoad({ detail: { width: 1200, height: 600 } })
selectorRects = [rects[0], { left: 20, top: 30, width: 0, height: 300 }]
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(overlay.displayBboxes.value.length, 0)
selectorRects = rects
boxesRef.value = []; runWatch(boxesRef)
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(overlay.displayBboxes.value.length, 0)

// Resize and page-show queue entry point refreshes geometry; unmount cancels work.
boxesRef.value = [{ bbox: [120, 60, 600, 300], label: { name: 'bottle' }, index: 0 }]; runWatch(boxesRef)
currentA.onLoad({ detail: { width: 1200, height: 600 } })
await new Promise(resolve => setTimeout(resolve, 80))
assert.ok(queryCount > 0)
overlay.queueRefreshDisplayBboxes()
unloadCallbacks[0]()
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(overlay.displayBboxes.value.length, 0)

for (const page of ['src/pages/home/home.vue', 'src/pages-dark/home/home.vue']) {
  const filename = path.join(root, page)
  const parsed = parse(fs.readFileSync(filename, 'utf8'), { filename })
  assert.equal(parsed.errors.length, 0, `${page} SFC parse`)
  const compiled = compileTemplate({ source: parsed.descriptor.template.content, filename, id: page })
  assert.equal(compiled.errors.length, 0, `${page} template compile`)
}

// Both multipart transports include the opt-in renderer capability only when requested.
const apiPath = path.join(root, 'src/api/recognize.js')
const apiSource = fs.readFileSync(apiPath, 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  .concat('\nthis.recognizeImage = recognizeImage')
const uploadContext = {
  baseUrl: 'https://example.test', request() {}, console: { error() {}, warn() {} },
  uni: {
    getStorageSync: key => key === 'token' ? 'session-token' : '',
    getDeviceInfo: () => ({ platform: 'android' }), getAppBaseInfo: () => ({ uniPlatform: 'mp-weixin' }),
    uploadFile(options) { uploadContext.uploadOptions = options }, showToast() {}, request() {}
  }
}
vm.runInNewContext(apiSource, uploadContext, { filename: apiPath })
const miniRequest = uploadContext.recognizeImage('/tmp/image.jpg', { bboxRenderer: 'client' })
assert.equal(uploadContext.uploadOptions.formData.bboxRenderer, 'client')
uploadContext.uploadOptions.success({ data: JSON.stringify({ code: 0, data: { ok: true } }) })
await miniRequest

class TestFile { constructor() { this.path = '/tmp/image.jpg' } }
class TestFormData { constructor() { this.fields = {} } append(name, value) { this.fields[name] = value } }
let fetchedForm
const h5Context = {
  baseUrl: 'https://example.test', request() {}, File: TestFile, FormData: TestFormData,
  console: { error() {}, warn() {} },
  uni: {
    getStorageSync: key => key === 'token' ? 'session-token' : '',
    getDeviceInfo: () => ({ platform: 'desktop' }), getAppBaseInfo: () => ({ uniPlatform: 'web' }),
    showToast() {}, request() {}
  },
  fetch(_url, options) {
    fetchedForm = options.body
    return Promise.resolve({ ok: true, json: async () => ({ code: 0, data: { ok: true } }) })
  }
}
vm.runInNewContext(apiSource, h5Context, { filename: apiPath })
const h5File = vm.runInNewContext('new File()', h5Context)
await h5Context.recognizeImage(h5File, { bboxRenderer: 'client' })
assert.equal(fetchedForm.fields.bboxRenderer, 'client')

process.stdout.write('Recognition bbox verification passed.\n')
