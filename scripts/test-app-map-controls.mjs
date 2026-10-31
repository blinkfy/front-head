import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appMapControlsLayout, createAppMapControlsController, hasValidMapCoordinates } from '../src/utils/app-map-controls.mjs'
import { pageSubNVue } from '../src/utils/page-subnvue.mjs'

const pageA = { proxy: {} }
const pageB = { proxy: {} }
const childA = { id: 'map-controls' }
const childB = { id: 'map-controls' }
const pageOwners = [
  { $vm: pageA.proxy, $getAppWebview: () => ({ children: () => [childA] }) },
  { $vm: pageB.proxy, $getAppWebview: () => ({ children: () => [childB] }) }
]
assert.equal(pageSubNVue(pageA, 'map-controls', { pages: () => pageOwners }), childA, 'same-id subNVue resolves from its owning page')
assert.equal(pageSubNVue(pageB, 'map-controls', { pages: () => pageOwners }), childB, 'same-id subNVue resolves independently for another page')

let globalLookups = 0
const globalChild = { id: 'map-controls' }
const globalFallback = () => { globalLookups++; return globalChild }
const ownerNotReady = { ...pageA, proxy: { ...pageA.proxy } }
assert.equal(pageSubNVue(ownerNotReady, 'map-controls', {
  pages: () => [{ $vm: ownerNotReady.proxy, $getAppWebview: () => null }],
  fallback: globalFallback
}), null, 'known owner without ready native children does not use global lookup')
assert.equal(globalLookups, 0, 'global lookup is skipped while the current page owner is known')
assert.equal(pageSubNVue({ proxy: {} }, 'map-controls', {
  pages: () => [],
  fallback: globalFallback
}), globalChild, 'older environments without an owner use global lookup')
assert.equal(globalLookups, 1, 'legacy fallback runs once')

assert.deepEqual(appMapControlsLayout({ selectMode: false, top: 24, windowWidth: 375, windowHeight: 800 }), {
  left: 6, top: 24, width: 132, height: 44
})
assert.deepEqual(appMapControlsLayout({ selectMode: true, top: 700, windowWidth: 375, windowHeight: 667 }), {
  left: 12, top: 449, width: 351, height: 218
})
assert.equal(appMapControlsLayout({ selectMode: true, top: 500, windowWidth: 600, windowHeight: 200 }).width, 420)
assert.equal(appMapControlsLayout({ selectMode: true, top: 500, windowWidth: 600, windowHeight: 200 }).top, 0)
assert.equal(hasValidMapCoordinates(null, 0), false)
assert.equal(hasValidMapCoordinates('', 0), false)
assert.equal(hasValidMapCoordinates(91, 0), false)
assert.equal(hasValidMapCoordinates(31.2, 121.5), true)

const actions = []
const published = []
const windowLog = { shown: 0, hidden: 0, closed: 0, styles: [] }
const nativeWindow = {
  setStyle(style) { windowLog.styles.push(style) },
  show() { windowLog.shown++ },
  hide() { windowLog.hidden++ },
  close() { windowLog.closed++ }
}
let size = { width: 375, height: 800 }
const controller = createAppMapControlsController({
  getSize: () => size,
  publish: state => published.push(state),
  onAction: (...args) => actions.push(args)
})

controller.update({ visible: true, selectMode: true, top: 80, satellite: false, latitude: null, longitude: null })
controller.activate(true)
assert.equal(windowLog.shown, 0, 'controller waits for the subNVue window')
controller.attach(nativeWindow)
assert.equal(windowLog.shown, 1, 'attach shows the active visible window')
assert.equal(windowLog.styles.at(-1).width, '351px')
assert.equal(windowLog.styles.at(-1).height, '218px')
assert.deepEqual(published.at(-1).layout, { left: 12, top: 80, width: 351, height: 218 })

const publishCount = published.length
controller.action({ type: 'ready' })
assert.equal(published.length, publishCount + 1, 'ready handshake republishes current state')

controller.action({ type: 'basemap', value: true })
controller.action({ type: 'cancel' })
controller.action({ type: 'confirm' })
assert.deepEqual(actions, [['basemap', true], ['cancel']], 'selection actions filter invalid confirm coordinates')

controller.update({ latitude: 31.2, longitude: 121.5 })
controller.action({ type: 'confirm' })
assert.deepEqual(actions.at(-1), ['confirm'], 'valid coordinates allow confirmation')

controller.update({ selectMode: false })
controller.action({ type: 'basemap', value: false })
controller.action({ type: 'cancel' })
controller.action({ type: 'center' })
controller.action({ type: 'locate' })
controller.action({ type: 'confirm' })
assert.deepEqual(actions.slice(-1), [['basemap', false]], 'nonselect mode accepts basemap only')

controller.update({ visible: false })
assert.ok(windowLog.hidden > 0, 'hidden state hides native window')
const hiddenActionCount = actions.length
controller.action({ type: 'basemap', value: true })
controller.action({ type: 'locate' })
assert.equal(actions.length, hiddenActionCount, 'hidden window ignores actions')
controller.update({ visible: true })
controller.activate(false)
const inactiveActionCount = actions.length
controller.action({ type: 'basemap', value: true })
assert.equal(actions.length, inactiveActionCount, 'inactive page ignores actions')

size = { width: 600, height: 200 }
controller.update({ visible: true, selectMode: true, top: 500 })
controller.activate(true)
assert.deepEqual(published.at(-1).layout, { left: 90, top: 0, width: 420, height: 218 }, 'layout caps width and clamps top to short window')
assert.equal(windowLog.styles.at(-1).width, '420px')

controller.dispose()
controller.dispose()
assert.equal(windowLog.closed, 0, 'dispose must not close the page-owned subNVue window')
const disposedActionCount = actions.length
controller.action({ type: 'ready' })
controller.action({ type: 'basemap', value: true })
assert.equal(actions.length, disposedActionCount, 'disposed controller ignores messages')

const root = fileURLToPath(new URL('..', import.meta.url))
const pagesSource = readFileSync(resolve(root, 'src/pages.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
const pages = JSON.parse(pagesSource)
const subNVues = []
function collectSubNVues(value) {
  if (Array.isArray(value)) { value.forEach(collectSubNVues); return }
  if (!value || typeof value !== 'object') return
  subNVues.push(...(value.style?.['app-plus']?.subNVues || []))
  Object.values(value).forEach(collectSubNVues)
}
collectSubNVues(pages)
for (const [id, path, file, controlId] of [
  ['map-controls-light', 'pages/map/controls', 'src/pages/map/controls.nvue', 'map-controls-light'],
  ['map-controls-dark', 'map/controls', 'src/pages-dark/map/controls.nvue', 'map-controls-dark']
]) {
  assert.ok(subNVues.some(entry => entry.id === id && entry.path === path), `${id} is registered in pages.json`)
  assert.ok(existsSync(resolve(root, file)), `${file} exists`)
  const entry = readFileSync(resolve(root, file), 'utf8')
  assert.match(entry, /AppMapControlsNativeContent/)
  assert.ok(entry.includes(`control-id="${controlId}"`), `${file} uses its registered control id`)
}

console.log('app-map-controls controller and subNVue registration checks passed')
