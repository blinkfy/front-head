import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createNativeDisposalController } from '../src/utils/native-nearby-disposal.mjs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src')
const passed = []
const failed = []

function check(name, run) {
  try {
    run()
    passed.push(name)
  } catch (error) {
    failed.push({ name, error })
  }
}

async function checkAsync(name, run) {
  try {
    await run()
    passed.push(name)
  } catch (error) {
    failed.push({ name, error })
  }
}

function createHarness(id, windowInfo = { windowWidth: 390, windowHeight: 844, safeAreaInsets: { bottom: 34 } }) {
  const calls = { styles: [], shows: [], hides: [], published: [], heights: [], closing: [], selected: [], navigated: [] }
  const nativeWindow = {
    setStyle: value => calls.styles.push(value),
    show: (...args) => calls.shows.push(args),
    hide: (...args) => calls.hides.push(args)
  }
  const controller = createNativeDisposalController({
    windowInfo: () => windowInfo,
    publish: value => calls.published.push(value),
    height: value => calls.heights.push(value),
    closing: value => calls.closing.push(value),
    select: point => calls.selected.push(point),
    navigate: point => calls.navigated.push(point)
  })
  controller.attach(nativeWindow)
  controller.activate(true)
  controller.update({ visible: true, dark: id.endsWith('dark'), points: [
    { id: 'one', name: 'Point One', distance: '100m', address: 'First address', description: 'First desc', type: 'smart', image: 'resolved-image', imagePath: 'A'.repeat(4096), adminOnly: true },
    { id: 'two', name: 'Point Two', distance: '200m', address: 'Second address', description: 'Second desc', type: 'normal', image: 'second-image' }
  ] })
  return { controller, nativeWindow, calls }
}

const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const pendingTimers = new Map()
const clearedTimers = []
let nextTimer = 0
globalThis.setTimeout = callback => {
  const handle = { id: ++nextTimer, callback }
  pendingTimers.set(handle, callback)
  return handle
}
globalThis.clearTimeout = handle => {
  if (handle !== undefined) clearedTimers.push(handle)
  pendingTimers.delete(handle)
}

try {
  check('native frame stays within sheet and pill bounds; select and navigate remain distinct', () => {
    const { controller, calls } = createHarness('nearby-disposal-light')
    const point = { id: 'one', name: 'Point One', distance: '100m', address: 'First address', description: 'First desc', type: 'smart', image: 'resolved-image', imagePath: 'A'.repeat(4096), adminOnly: true }
    controller.action({ type: 'select', id: 'one' })
    controller.action({ type: 'navigate', id: 'one' })
    assert.deepEqual(calls.selected, [point])
    assert.deepEqual(calls.navigated, [point])
    assert.deepEqual(Object.keys(calls.published.at(-1).points[0]).sort(), ['id', 'name', 'distance', 'address', 'description', 'type', 'image'].sort())

    const sheet = calls.styles.at(-1)
    assert.equal(sheet.width, '390px')
    assert.equal(sheet.height, '316px')
    assert.ok(Number.parseInt(sheet.top, 10) > 0)
    assert.ok(Number.parseInt(sheet.height, 10) < 844)
    assert.equal(sheet.background, 'transparent')
    controller.action({ type: 'resize', height: 350 })
    assert.equal(Object.hasOwn(calls.published.at(-1), 'points'), false, 'resize must not resend point images')

    controller.action({ type: 'collapse' })
    const timer = [...pendingTimers.keys()].at(-1)
    assert.ok(timer)
    pendingTimers.get(timer)()
    pendingTimers.delete(timer)
    const pill = calls.styles.at(-1)
    assert.equal(pill.width, '144px')
    assert.equal(pill.height, '52px')
    assert.ok(Number.parseInt(pill.top, 10) > 0)
    assert.ok(Number.parseInt(pill.height, 10) < 844)

    controller.action({ type: 'open' })
    assert.equal(calls.styles.at(-1).height, '316px')
    assert.deepEqual(calls.shows.at(-1), ['fade-in', 280])
  })

  check('resize grows to the bounded maximum and shrinking below threshold auto-collapses', () => {
    const { controller, calls } = createHarness('nearby-disposal-light')
    controller.action({ type: 'resize', height: 1000 })
    assert.equal(calls.styles.at(-1).height, '590.8px')
    controller.action({ type: 'resize', height: 70 })
    assert.equal(calls.heights.at(-1), 0)
    assert.equal(calls.closing.at(-1), true)
    assert.equal(calls.hides.at(-1)[0], 'slide-out-bottom')
    controller.dispose()
  })

  check('wide-window frame is bounded to sheet and pill sizes', () => {
    const { controller, calls } = createHarness('nearby-disposal-dark', { windowWidth: 1200, windowHeight: 900, safeAreaInsets: { bottom: 0 } })
    const sheet = calls.styles.at(-1)
    assert.equal(sheet.width, '400px')
    assert.equal(sheet.height, '316px')
    assert.equal(sheet.left, '24px')
    assert.equal(sheet.top, '130px')
    controller.action({ type: 'collapse' })
    const timer = [...pendingTimers.keys()].at(-1)
    pendingTimers.get(timer)()
    pendingTimers.delete(timer)
    const pill = calls.styles.at(-1)
    assert.equal(pill.width, '144px')
    assert.equal(pill.height, '52px')
    assert.equal(pill.left, '24px')
    controller.dispose()
  })

  check('hide and dispose cancel pending animation timers', () => {
    const { controller, calls } = createHarness('nearby-disposal-light')
    controller.action({ type: 'collapse' })
    const hideTimer = [...pendingTimers.keys()].at(-1)
    assert.ok(pendingTimers.has(hideTimer))
    controller.activate(false)
    assert.equal(pendingTimers.has(hideTimer), false)
    assert.ok(clearedTimers.includes(hideTimer))

    controller.activate(true)
    controller.update({ visible: true, points: [{ id: 'one' }, { id: 'two' }] })
    controller.action({ type: 'collapse' })
    const leaveTimer = [...pendingTimers.keys()].at(-1)
    assert.ok(pendingTimers.has(leaveTimer))
    controller.dispose()
    assert.equal(pendingTimers.has(leaveTimer), false)
    assert.ok(clearedTimers.includes(leaveTimer))
    assert.equal(calls.hides.at(-1)[0], 'none')
  })

  check('light and dark subNVue IDs have isolated controller state', () => {
    const light = createHarness('nearby-disposal-light')
    const dark = createHarness('nearby-disposal-dark')
    light.controller.action({ type: 'collapse' })
    const lightTimer = [...pendingTimers.keys()].at(-1)
    pendingTimers.get(lightTimer)()
    pendingTimers.delete(lightTimer)
    assert.equal(light.calls.published.at(-1).collapsed, true)
    assert.equal(dark.calls.published.at(-1).collapsed, false)
    light.controller.dispose()
    dark.controller.dispose()
  })
} finally {
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
}

const adapterPath = path.join(src, 'components', 'AppNearbyDisposalPanel.vue')
const contentPath = path.join(src, 'components', 'NearbyDisposalNativeContent.vue')
const lightPath = path.join(src, 'pages', 'map', 'nearby-panel.nvue')
const darkPath = path.join(src, 'pages-dark', 'map', 'nearby-panel.nvue')
const mapPaths = [path.join(src, 'pages', 'map', 'map.vue'), path.join(src, 'pages-dark', 'map', 'map.vue')]

function compileSfc(filename, type) {
  const vueCompiler = require('@vue/compiler-sfc')
  const { descriptor, errors } = vueCompiler.parse(fs.readFileSync(filename, 'utf8'), { filename })
  if (errors.length) throw errors[0]

  if (descriptor.script || descriptor.scriptSetup) {
    vueCompiler.compileScript(descriptor, { id: `nearby-${path.basename(filename)}` })
  }
  if (descriptor.template) {
    const { uniOptions } = require('@dcloudio/uni-app-vite/dist/plugin/uni')
    const result = vueCompiler.compileTemplate({
      filename,
      id: `nearby-${path.basename(filename)}`,
      source: descriptor.template.content,
      compiler: require('@vue/compiler-dom'),
      compilerOptions: { ...uniOptions(type).compilerOptions, hoistStatic: false, mode: 'module' }
    })
    if (result.errors.length) throw result.errors[0]
  }

  for (const style of descriptor.styles) {
    if (type === 'nvue') continue
    const result = vueCompiler.compileStyle({
      filename,
      id: 'nearby-map-check',
      source: style.content,
      scoped: style.scoped
    })
    if (result.errors.length) throw result.errors[0]
  }
}

for (const filename of [contentPath, lightPath, darkPath]) {
  await checkAsync(`App nvue SFC compile: ${path.relative(root, filename)}`, async () => {
    const source = fs.readFileSync(filename, 'utf8')
    const compiler = require('@dcloudio/vite-plugin-uni/dist/utils/nvue').createNVueCompiler()
    const { descriptor, errors } = compiler.parse(source, { filename })
    if (errors.length) throw errors[0]
    if (descriptor.script || descriptor.scriptSetup) compiler.compileScript(descriptor, { id: `nvue-${path.basename(filename)}` })
    if (descriptor.template) {
      const { uniOptions } = require('@dcloudio/uni-app-vite/dist/plugin/uni')
      const result = compiler.compileTemplate({
        filename,
        id: `nvue-${path.basename(filename)}`,
        source: descriptor.template.content,
        compiler: require('@vue/compiler-dom'),
        compilerOptions: { ...uniOptions('nvue').compilerOptions, hoistStatic: false, mode: 'module' }
      })
      if (result.errors.length) throw result.errors[0]
    }
    const styler = require('@dcloudio/uni-nvue-styler')
    for (const style of descriptor.styles) {
      const result = await styler.parse(style.content, { filename, type: 'nvue', logLevel: 'ERROR' })
      const error = result.messages.find(message => message.type === 'error')
      if (error) throw error
    }
  })
}

for (const filename of [adapterPath, ...mapPaths]) {
  await checkAsync(`App Vue SFC compile: ${path.relative(root, filename)}`, () => compileSfc(filename, 'vue'))
}

check('App adapter page lifecycle hooks target the root page and clean up listeners', () => {
  const source = fs.readFileSync(adapterPath, 'utf8')
  assert.match(source, /const page = getCurrentInstance\(\)\.root/)
  for (const hook of ['onReady', 'onShow', 'onHide', 'onUnload']) {
    assert.match(source, new RegExp(`${hook}\\([^\\n]*,\\s*page\\)`), `${hook} must target the root page`)
  }
  assert.match(source, /uni\.\$off\(`\$\{topic\}:action`,\s*receive\)/)
  assert.match(source, /uni\.offWindowResize\?\.\(controller\.refresh\)/)
})

check('native content removes its state listener on unmount', () => {
  const source = fs.readFileSync(contentPath, 'utf8')
  assert.match(source, /uni\.\$on\(`\$\{topic\}:state`,\s*update\)/)
  assert.match(source, /onBeforeUnmount\(\(\) => uni\.\$off\(`\$\{topic\}:state`,\s*update\)\)/)
  assert.match(source, /function moveResize[\s\S]*?drag\.height \+ \(y - drag\.y\) \* \(layout\.value\.wide \? 1 : -1\)/)
  const listEnd = source.indexOf('</scroll-view>')
  const wideGrip = source.indexOf('<view v-if="layout.wide" class="grip"')
  assert.ok(listEnd >= 0 && wideGrip > listEnd, 'wide-screen resize grip must sit below the list')
  assert.match(source, /:style="\{ backgroundColor: dark \? 'rgba\(22,43,49,0\.82\)' : 'rgba\(252,254,254,0\.82\)' \}"/)
})

check('App pages preprocessing registers existing light and dark nvue wrappers', () => {
  const shared = require('@dcloudio/uni-cli-shared')
  const pages = shared.parsePagesJson(src, 'app')
  const expected = new Map([
    ['nearby-disposal-light', path.join(src, 'pages', 'map', 'nearby-panel.nvue')],
    ['nearby-disposal-dark', path.join(src, 'pages-dark', 'map', 'nearby-panel.nvue')]
  ])
  const registrations = []
  const pathErrors = []
  for (const page of pages.pages) {
    for (const subNVue of page.style?.subNVues || []) {
      registrations.push(subNVue)
      const expectedFile = expected.get(subNVue.id)
      if (!expectedFile) continue
      const processedFile = path.resolve(src, `${subNVue.path}.nvue`)
      if (processedFile !== expectedFile || !fs.existsSync(processedFile)) {
        pathErrors.push(`${subNVue.id}: ${path.relative(root, processedFile)} (expected ${path.relative(root, expectedFile)})`)
      }
    }
  }
  assert.deepEqual(new Set(registrations.map(item => item.id)), new Set(expected.keys()))
  const previousInputDir = process.env.UNI_INPUT_DIR
  process.env.UNI_INPUT_DIR = src
  let appConfig
  try {
    appConfig = shared.normalizeAppConfigService(pages, shared.parseManifestJson(src))
  } finally {
    if (previousInputDir === undefined) delete process.env.UNI_INPUT_DIR
    else process.env.UNI_INPUT_DIR = previousInputDir
  }
  for (const id of expected.keys()) assert.ok(appConfig.includes(id), `App config contains ${id}`)
  assert.deepEqual(pathErrors, [], `processed subNVue paths must resolve to source wrappers: ${pathErrors.join('; ')}`)
})

check('theme wrappers and map adapters use isolated App panel IDs', () => {
  const light = fs.readFileSync(lightPath, 'utf8')
  const dark = fs.readFileSync(darkPath, 'utf8')
  const lightMap = fs.readFileSync(mapPaths[0], 'utf8')
  const darkMap = fs.readFileSync(mapPaths[1], 'utf8')
  assert.match(light, /nearby-disposal-light/)
  assert.match(dark, /nearby-disposal-dark/)
  assert.match(lightMap, /panel-id="nearby-disposal-light"/)
  assert.match(darkMap, /panel-id="nearby-disposal-dark"/)
})

for (const name of passed) console.log(`PASS ${name}`)
for (const item of failed) console.error(`FAIL ${item.name}\n${item.error?.stack || item.error}`)
console.log(`\n${passed.length} passed, ${failed.length} failed`)
if (failed.length) process.exitCode = 1
