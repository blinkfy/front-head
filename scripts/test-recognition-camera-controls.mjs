import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from '@vue/compiler-sfc'

const source = await readFile(new URL('../src/pages-nonTheme/recognition-camera.vue', import.meta.url), 'utf8')
const parsed = parse(source, { filename: 'src/pages-nonTheme/recognition-camera.vue' })
assert.equal(parsed.errors.length, 0, 'camera SFC parses')
const script = parsed.descriptor.scriptSetup.content.replace(/^import\s.+from\s.+;?\s*$/gm, '')
const passed = []

function harness({ rect = { width: 390, height: 560 }, holdMeasurements = false, throwSetZoom = false, throwQuery = false } = {}) {
  const hooks = {}
  const measurements = []
  const zoomCalls = []
  const photoCalls = []
  const toasts = []
  const emitted = []
  const context = { rect, holdMeasurements, throwSetZoom, throwQuery, zoomCalls, photoCalls, toasts, emitted }
  const ref = value => ({ value })
  const computed = get => ({ get value() { return get() } })
  const nextTick = () => Promise.resolve()
  const getCurrentInstance = () => ({ proxy: { getOpenerEventChannel: () => ({ emit: (...args) => emitted.push(args) }) } })
  const lifecycle = name => fn => { hooks[name] = fn }
  const uni = {
    getSystemInfoSync: () => ({ statusBarHeight: 24 }),
    createSelectorQuery() {
      const query = {
        in() { return this },
        select() { return this },
        boundingClientRect(callback) { this.callback = callback; return this },
        exec() {
          if (context.throwQuery) throw new Error('selector query unavailable')
          if (context.holdMeasurements) measurements.push(this.callback)
          else this.callback(context.rect)
        }
      }
      return query
    },
    createCameraContext: () => ({
      setZoom(options) {
        if (context.throwSetZoom) throw new Error('setZoom unavailable')
        zoomCalls.push(options)
      },
      takePhoto: options => photoCalls.push(options)
    }),
    showToast: value => toasts.push(value),
    navigateBack: options => { context.navigateBack = options }
  }
  const factory = new Function(
    'computed', 'getCurrentInstance', 'nextTick', 'ref', 'onHide', 'onResize', 'onShow', 'onUnload', 'uni',
    `${script}\nreturn { statusBarHeight, cameraActive, cameraVersion, ready, viewportStyle, zoomBusy, devicePosition, flash, zoom, maxZoom, capturing, committed, errorMessage, zoomChoices, flashLabel, resetCamera, onCameraReady, onCameraError, retryCamera, toggleFlash, switchCamera, setZoom, takePhoto }`
  )
  const state = factory(computed, getCurrentInstance, nextTick, ref, lifecycle('hide'), lifecycle('resize'), lifecycle('show'), lifecycle('unload'), uni)
  return { state, hooks, measurements, zoomCalls, photoCalls, toasts, emitted, context }
}

async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
async function scenario(name, run) { await run(); passed.push(name) }
async function shownHarness(options) {
  const h = harness(options)
  h.hooks.show()
  await flush()
  return h
}
function settleZoom(call, result = { zoom: 1 }) { call.success?.(result); call.complete?.() }

await scenario('portrait viewport fits wide and short stages in 3:4', async () => {
  const wide = await shownHarness({ rect: { width: 390, height: 560 } })
  assert.deepEqual(wide.state.viewportStyle.value, { width: '390px', height: '520px' })
  const short = await shownHarness({ rect: { width: 390, height: 360 } })
  assert.deepEqual(short.state.viewportStyle.value, { width: '270px', height: '360px' })
})

await scenario('stale viewport measurement after hide does not mount camera', async () => {
  const h = harness({ holdMeasurements: true })
  h.hooks.show()
  await flush()
  assert.equal(h.measurements.length, 1)
  h.hooks.hide()
  h.measurements[0]({ width: 390, height: 560 })
  assert.equal(h.state.cameraActive.value, false)
  assert.equal(h.state.ready.value, false)
})

await scenario('synchronous viewport measurement error falls back to mounting camera', async () => {
  const h = harness({ throwQuery: true })
  h.hooks.show()
  await flush()
  assert.equal(h.state.cameraActive.value, true)
})

await scenario('initdone applies zoom 1 and successful zoom settles busy state', async () => {
  const h = await shownHarness()
  h.state.onCameraReady({ detail: { maxZoom: 5 } })
  assert.equal(h.state.ready.value, true)
  assert.equal(h.state.maxZoom.value, 5)
  assert.equal(h.zoomCalls[0].zoom, 1)
  assert.equal(h.state.zoomBusy.value, true)
  settleZoom(h.zoomCalls[0], { zoom: 1 })
  assert.equal(h.state.zoomBusy.value, false)
  h.state.setZoom(2)
  assert.equal(h.state.zoomBusy.value, true)
  settleZoom(h.zoomCalls[1], { zoom: 2 })
  assert.equal(h.state.zoom.value, 2)
  assert.equal(h.state.zoomBusy.value, false)
})

await scenario('failed zoom reports a toast and clears busy state', async () => {
  const h = await shownHarness()
  h.state.ready.value = true
  h.state.maxZoom.value = 5
  h.state.setZoom(2)
  h.zoomCalls[0].fail()
  h.zoomCalls[0].complete()
  assert.equal(h.state.zoomBusy.value, false)
  assert.equal(h.toasts.length, 1)
  assert.match(h.toasts[0].title, /倍率/)
})

await scenario('zoom result arriving after hide is ignored', async () => {
  const h = await shownHarness()
  h.state.onCameraReady({ detail: { maxZoom: 5 } })
  settleZoom(h.zoomCalls[0])
  h.state.setZoom(2)
  const stale = h.zoomCalls[1]
  h.hooks.hide()
  stale.success({ zoom: 4 })
  stale.complete()
  assert.equal(h.state.zoom.value, 1)
  assert.equal(h.state.zoomBusy.value, false)
})

await scenario('old zoom callbacks cannot affect camera while a new mount is measuring', async () => {
  const h = harness({ holdMeasurements: true })
  h.hooks.show()
  await flush()
  h.measurements[0]({ width: 390, height: 560 })
  h.state.onCameraReady({ detail: { maxZoom: 5 } })
  settleZoom(h.zoomCalls[0])
  h.state.setZoom(2)
  const stale = h.zoomCalls[1]
  h.state.switchCamera()
  await flush()
  assert.equal(h.measurements.length, 2)
  stale.success({ zoom: 4 })
  stale.complete()
  assert.equal(h.state.zoom.value, 1)
  h.measurements[1]({ width: 390, height: 360 })
  assert.equal(h.state.cameraActive.value, true)
  assert.equal(h.state.zoomBusy.value, false)
})

await scenario('camera error clears busy zoom and torch state', async () => {
  const h = await shownHarness()
  h.state.ready.value = true
  h.state.zoomBusy.value = true
  h.state.flash.value = 'torch'
  h.state.onCameraError()
  assert.equal(h.state.ready.value, false)
  assert.equal(h.state.zoomBusy.value, false)
  assert.equal(h.state.flash.value, 'off')
  assert.equal(h.state.cameraActive.value, false)
})

await scenario('torch toggles only on rear camera; switching front resets flash', async () => {
  const h = await shownHarness()
  h.state.onCameraReady({ detail: { maxZoom: 1 } })
  settleZoom(h.zoomCalls[0])
  h.state.toggleFlash()
  assert.equal(h.state.flash.value, 'torch')
  assert.equal(h.state.flashLabel.value, '补光常亮')
  h.state.devicePosition.value = 'front'
  h.state.flash.value = 'off'
  h.state.toggleFlash()
  assert.equal(h.state.flash.value, 'off')
})

await scenario('camera switch and lifecycle hide/unload reset transient state', async () => {
  const h = await shownHarness()
  h.state.ready.value = true
  h.state.flash.value = 'torch'
  h.state.switchCamera()
  assert.equal(h.state.devicePosition.value, 'front')
  assert.equal(h.state.flash.value, 'off')
  h.state.zoomBusy.value = true
  h.state.capturing.value = true
  h.hooks.hide()
  assert.equal(h.state.ready.value, false)
  assert.equal(h.state.cameraActive.value, false)
  assert.equal(h.state.capturing.value, false)
  assert.equal(h.state.zoomBusy.value, false)
  h.state.flash.value = 'torch'
  h.hooks.unload()
  assert.equal(h.state.flash.value, 'off')
  assert.equal(h.emitted[0][0], 'cameraCancelled')
})

await scenario('zoom and shutter are blocked while zoom is busy; duplicate shutter is ignored', async () => {
  const h = await shownHarness()
  h.state.onCameraReady({ detail: { maxZoom: 5 } })
  const initZoom = h.zoomCalls[0]
  assert.equal(h.state.zoomBusy.value, true)
  h.state.setZoom(2)
  h.state.takePhoto()
  assert.equal(h.zoomCalls.length, 1)
  assert.equal(h.photoCalls.length, 0)
  settleZoom(initZoom)
  h.state.takePhoto()
  h.state.takePhoto()
  assert.equal(h.photoCalls.length, 1)
  assert.equal(h.state.capturing.value, true)
  h.photoCalls[0].complete?.()
  assert.equal(h.state.capturing.value, false)
})

for (const name of passed) console.log(`PASS ${name}`)
console.log(`${passed.length} recognition camera control checks passed`)
