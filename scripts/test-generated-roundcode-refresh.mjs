import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createRoundCodePreparationProgress, roundCodePreparationText } from '../src/utils/roundcode-preparation-progress.mjs'

const sourceText = (await readFile(new URL('../src/utils/use-generated-roundcode.js', import.meta.url), 'utf8'))
  .replace(/^import .*\r?\n/gm, '')

function preprocess(source, platform) {
  const kept = []; let include = [true]
  for (const line of source.split(/\r?\n/)) {
    const directive = /^\s*\/\/\s*#(ifdef|ifndef)\s+(.+?)\s*$/.exec(line)
    if (directive) {
      const matches = directive[2].split('||').map(value => value.trim()).includes(platform)
      include.push(include.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
      continue
    }
    if (/^\s*\/\/\s*#endif\s*$/.test(line)) { include.pop(); continue }
    if (include.at(-1)) kept.push(line)
  }
  return kept.join('\n').replace('export function useGeneratedRoundCode',
    'globalThis.useGeneratedRoundCode = function useGeneratedRoundCode')
}
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

function harness({ register, platform = 'H5', getImageInfo } = {}) {
  const calls = [], forgotten = [], timers = new Map(), images = []
  const lifecycle = { show: [], hide: [], unload: [], mounted: [], unmount: [] }
  let timerId = 0, defaultRegister = async () => ({ status: 'registered' })
  const context = {
    ref: value => ({ value }),
    watch: () => {},
    onShow: callback => lifecycle.show.push(callback), onHide: callback => lifecycle.hide.push(callback),
    onUnload: callback => lifecycle.unload.push(callback), onMounted: callback => lifecycle.mounted.push(callback),
    onBeforeUnmount: callback => lifecycle.unmount.push(callback),
    registerGeneratedCodeImage: (url, isCurrent, onProgress) => {
      calls.push({ url, isCurrent, onProgress })
      return (register || defaultRegister)(url, isCurrent, onProgress)
    },
    forgetGeneratedCodeImage: url => forgotten.push(url),
    createRoundCodePreparationProgress,
    uni: { getImageInfo: options => getImageInfo?.(options) },
    Image: class {
      constructor() { this.onload = null; this.onerror = null; this.src = ''; images.push(this) }
    },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id },
    clearTimeout: id => timers.delete(id),
    Promise
  }
  vm.runInNewContext(preprocess(sourceText, platform), context, { filename: `use-generated-roundcode-${platform}.js` })
  const source = { value: 'old-image' }
  let ready = true
  const api = context.useGeneratedRoundCode(source, () => ready)
  return { api, source, calls, forgotten, timers, images, lifecycle,
    setReady: value => { ready = value }, setRegister: fn => { defaultRegister = fn } }
}

// A registered receipt does not switch the visible URL before its image loads.
{
  const candidate = deferred(), h = harness({ register: async url => url === 'old-image'
    ? { status: 'registered' } : candidate.promise })
  h.lifecycle.show[0](); await tick(); assert.equal(h.api.state.value, 'registered')
  const preparing = h.api.prepareRefresh('next-image', () => true)
  await tick(); candidate.resolve({ status: 'registered' }); await tick()
  assert.equal(h.source.value, 'old-image')
  assert.equal(h.images.length, 1); assert.equal(h.images[0].src, 'next-image')
  assert.equal(h.timers.size, 1)
  const text = roundCodePreparationText(h.api.state.value, h.api.progress.value, h.api.phase.value, true)
  assert.match(text, /^正在刷新二维码 · /); assert(!text.includes('APP')); assert(!text.includes('100%'))
  assert(h.api.progress.value < 100, 'image load is part of refresh readiness')
  h.images[0].onload(); assert.equal((await preparing).status, 'registered')
  assert.equal(h.source.value, 'old-image', 'the caller swaps only after preparation resolves')
  h.source.value = 'next-image'; assert.equal(h.source.value, 'next-image')
}

// A registered old code cannot be replaced by an unsupported candidate.
{
  const h = harness({ register: async url => ({ status: url === 'old-image' ? 'registered' : 'unsupported' }) })
  h.lifecycle.show[0](); await tick()
  const result = await h.api.prepareRefresh('next-image', () => true)
  assert.equal(result.status, 'failed'); assert.equal(h.source.value, 'old-image')
  assert.equal(h.images.length, 0, 'known unsupported candidate does not start a visible swap')
  await tick(); assert.equal(h.api.state.value, 'registered', 'finally offer restores readiness for the old code')
}

// If the old code was unsupported, WeChat fallback is allowed only after the image loads.
{
  const h = harness({ register: async url => ({ status: 'unsupported' }) })
  h.lifecycle.show[0](); await tick(); assert.equal(h.api.state.value, 'unsupported')
  const preparing = h.api.prepareRefresh('next-image', () => true); await tick()
  assert.equal(h.images.length, 1); assert.equal(h.source.value, 'old-image')
  h.images[0].onload(); assert.equal((await preparing).status, 'unsupported')
  assert.equal(h.source.value, 'old-image')
}

// Decode failure and image errors leave the old URL displayed.
{
  const decodeFailure = harness({ register: async url => ({ status: url === 'old-image' ? 'registered' : 'failed' }) })
  decodeFailure.lifecycle.show[0](); await tick()
  assert.equal((await decodeFailure.api.prepareRefresh('decode-bad', () => true)).status, 'failed')
  assert.equal(decodeFailure.source.value, 'old-image'); assert.equal(decodeFailure.images.length, 0)

  const imageFailure = harness({ register: async () => ({ status: 'registered' }) })
  imageFailure.lifecycle.show[0](); await tick()
  const preparing = imageFailure.api.prepareRefresh('broken-image', () => true); await tick()
  imageFailure.images[0].onerror(); assert.equal((await preparing).status, 'failed')
  assert.equal(imageFailure.source.value, 'old-image')
}

// Hiding during decode invalidates the candidate before it can register or start image loading.
{
  const decoding = deferred(), h = harness({ register: async url => url === 'old-image'
    ? { status: 'registered' } : decoding.promise })
  h.lifecycle.show[0](); await tick()
  const preparing = h.api.prepareRefresh('hidden-candidate', () => true); await tick()
  h.lifecycle.hide[0](); decoding.resolve({ status: 'registered' }); await tick()
  assert.equal((await preparing).status, 'inactive')
  assert.equal(h.images.length, 0); assert(h.forgotten.includes('hidden-candidate'))
  assert.equal(h.source.value, 'old-image')
}

// Hiding or unmounting while awaiting Image.onload cancels its timer and prevents completion.
for (const event of ['hide', 'unmount']) {
  const h = harness({ register: async () => ({ status: 'registered' }) })
  h.lifecycle.show[0](); await tick()
  const preparing = h.api.prepareRefresh('loading-candidate', () => true); await tick()
  assert.equal(h.images.length, 1); assert.equal(h.timers.size, 1)
  if (event === 'hide') h.lifecycle.hide[0]()
  else h.lifecycle.unmount[0]()
  assert.equal(h.timers.size, 0, event + ' clears image load timeout')
  assert.equal(h.images[0].src, '', event + ' aborts image loading')
  assert.equal((await preparing).status, 'failed')
  assert.equal(h.source.value, 'old-image'); assert(h.forgotten.includes('loading-candidate'))
}

// APP-PLUS preprocessed code uses uni.getImageInfo and remains safe without DOM globals.
{
  let imageInfo
  const h = harness({ platform: 'APP-PLUS', register: async () => ({ status: 'registered' }),
    getImageInfo: options => { imageInfo = options } })
  h.lifecycle.show[0](); await tick()
  const preparing = h.api.prepareRefresh('native-candidate', () => true); await tick()
  assert.equal(h.images.length, 0); assert.equal(typeof imageInfo?.success, 'function')
  imageInfo.success({ width: 100, height: 100 })
  assert.equal((await preparing).status, 'registered'); assert.equal(h.source.value, 'old-image')
}

{
  const h = harness({ platform: 'APP-PLUS', register: async () => ({ status: 'registered' }),
    getImageInfo: () => {} })
  h.lifecycle.show[0](); await tick()
  const preparing = h.api.prepareRefresh('native-timeout', () => true); await tick()
  assert.equal(h.timers.size, 1)
  const timeout = [...h.timers.values()][0]; timeout()
  assert.equal((await preparing).status, 'failed'); assert.equal(h.timers.size, 0)
  assert.equal(h.source.value, 'old-image')
}

{
  let imageInfo
  const h = harness({ platform: 'APP-PLUS', register: async () => ({ status: 'registered' }),
    getImageInfo: options => { imageInfo = options } })
  h.lifecycle.show[0](); await tick()
  const preparing = h.api.prepareRefresh('native-hidden', () => true); await tick()
  assert.equal(h.timers.size, 1); h.lifecycle.hide[0]()
  assert.equal(h.timers.size, 0); assert(h.forgotten.includes('native-hidden'))
  assert.equal((await preparing).status, 'failed'); assert.equal(h.source.value, 'old-image')
  imageInfo.success({ width: 100, height: 100 }); assert.equal(h.source.value, 'old-image')
}

console.log('PASS H5 and APP generated-code refresh require registration/image load, preserve old source on failure, and cancel lifecycle work')
