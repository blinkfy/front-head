import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { initPreContext, preHtml, preJs } from '@dcloudio/uni-cli-shared/dist/preprocess/index.js'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const source = fs.readFileSync(new URL('../../src/utils/tab-page-transition.js', import.meta.url), 'utf8')
const appMotionSource = fs.readFileSync(new URL('../../src/utils/app-tab-motion.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const appHandoffSource = fs.readFileSync(new URL('../../src/utils/app-tab-handoff.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')

for (const path of ['../../src/pages/home/home.vue', '../../src/pages-dark/home/home.vue', '../../src/components/map/AppMapControls.vue', '../../src/components/map/AppNearbyDisposalPanel.vue']) {
  const content = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const platform of ['h5', 'app', 'mp-weixin']) {
    initPreContext(platform)
    const { descriptor, errors } = parse(content, { filename: path })
    assert.equal(errors.length, 0)
    descriptor.scriptSetup.content = preJs(descriptor.scriptSetup.content, path)
    compileScript(descriptor, { id: `${platform}-${path}` })
    const template = compileTemplate({ source: preHtml(descriptor.template.content, path), filename: path, id: `${platform}-${path}` })
    assert.equal(template.errors.length, 0, `${platform}: ${path} compiles`)
  }
}

function harness(platform) {
  const hooks = {}, storage = new Map(), timers = new Map(), idle = [], loads = [], marked = []
  let mapPreloadPageUses = 0
  let serial = 0
  const code = preprocess(source, { [platform.replaceAll('-', '_')]: true }, { type: 'js' })
    .replace(/^import .*$/gm, '')
    .replace(/import\('(@\/[^']+)'\)/g, (_, path) => `loadPage('${path}')`)
    .replace(/^export /gm, '')
  const context = vm.createContext({
    getAppTabShell: () => null, useAppTabContext: () => null,
    ref: value => ({ value }), nextTick: fn => fn(), Date, Map, Set, Promise,
    ...Object.fromEntries(['onHide', 'onReady', 'onShow', 'onUnload'].map(name => [name, fn => { hooks[name] = fn }])),
    setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id },
    clearTimeout: id => timers.delete(id),
    window: { requestIdleCallback: fn => idle.push(fn) },
    uni: { getStorageSync: key => storage.get(key), removeStorageSync: key => storage.delete(key) },
    getCurrentPages: () => [{ route: 'pages/home/home' }],
    createAppMapTabCache: () => ({}), playAppTabEntrance: () => true,
    useAppMapPreloadPage: () => { mapPreloadPageUses++ },
    markH5PagePreloaded: route => marked.push(route),
    loadPage: path => new Promise((resolve, reject) => loads.push({ path, resolve, reject }))
  })
  vm.runInContext(code, context)
  return { context, hooks, storage, timers, idle, loads, marked,
    get mapPreloadPageUses() { return mapPreloadPageUses },
    pending(direction = 'left') { storage.set('bottomTabTransition', { targetRoute: 'pages/home/home', direction, createdAt: Date.now() }) },
    finish() { const tasks = [...timers.values()]; timers.clear(); tasks.forEach(task => task.fn()) }
  }
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const h = harness(platform)
  for (const route of ['pages/shop/shop', 'pages-dark/profile/profile', 'pages/home/home', 'pages-dark/map/map']) {
    h.context.useTabPageTransition(route)
  }
  assert.equal(h.mapPreloadPageUses, platform === 'APP-PLUS' ? 2 : 0)
}

for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const h = harness(platform)
  h.pending()
  const page = h.context.useTabPageTransition('pages/home/home')
  assert.equal(page.tabPageClass.value, 'tab-page-enter-left', `${platform}: CSS offset is ready before first render`)
  assert.equal(h.storage.has('bottomTabTransition'), false)
  h.hooks.onShow()
  assert.equal(page.tabPageClass.value, 'tab-page-enter-left', `${platform}: onShow does not restart the entrance`)
  assert.equal(h.timers.size, 0, 'initial cleanup waits for page readiness')
  h.hooks.onReady()
  assert.equal(h.timers.size, 1)
  assert.equal([...h.timers.values()][0].delay, platform === 'APP-PLUS' ? 1120 : 220)
  h.finish()
  assert.equal(page.tabPageClass.value, '')
  h.hooks.onHide()
  h.pending('right')
  h.hooks.onShow()
  assert.equal(page.tabPageClass.value, 'tab-page-enter-right', `${platform}: retained page uses fresh direction`)
  assert.equal(h.timers.size, 1, 'a retained page does not need another onReady')
  h.hooks.onUnload()
  assert.equal(h.timers.size, 0)
  assert.equal(page.tabPageClass.value, '')
  assert.equal(vm.runInContext('activeTabTransitions', h.context), 0)
}

{
  const h = harness('APP-PLUS')
  const page = h.context.useTabPageTransition('pages/home/home')
  h.hooks.onReady()
  h.pending()
  h.storage.get('bottomTabTransition').preparedByAppView = true
  h.hooks.onShow()
  assert.equal(page.tabPageClass.value, '', 'a cached return does not replay the WebView entrance')
}

{
  const attrs = new Map(), storage = new Map(), frames = new Map(), timers = new Map()
  const view = { id: 'map' }
  let laidOut = true, coverVisible = false, releases = 0
  const document = { visibilityState: 'visible', querySelector: () => ({ getBoundingClientRect() {},
    querySelector: () => ({ getBoundingClientRect: () => ({ width: laidOut ? 375 : 0 }) }) }),
    documentElement: { setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key) } }
  let top = { id: 'shop' }, serial = 0
  const plus = { storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    nativeObj: { View: { getViewById: () => ({ isVisible: () => coverVisible, close() { coverVisible = false; releases++ } }) },
      Bitmap: { getBitmapById: () => null } },
    webview: { currentWebview: () => view, getTopWebview: () => top } }
  const render = vm.createContext({ window: { plus }, document,
    requestAnimationFrame: fn => { const id = ++serial; frames.set(id, fn); return id },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id },
    clearTimeout: id => timers.delete(id) })
  view.evalJS = script => vm.runInContext(script, render)
  const releaseAppTabCover = vm.runInNewContext(`${appHandoffSource}\nreleaseAppTabCover`)
  const service = vm.createContext({ plus, releaseAppTabCover })
  vm.runInContext(appMotionSource, service)
  const page = { $getAppWebview: () => view }
  const tickFrame = () => { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn()) }
  let prepared = false
  service.prepareAppMapTabEntrance(page, 'right', 180, cancel => { prepared = typeof cancel === 'function' })
  assert.equal(prepared, true)
  assert.equal(attrs.get('data-app-map-tab-entry'), 'right')
  tickFrame()
  assert.equal(attrs.has('data-app-tab-entry-playing'), false, 'the map stays at its starting offset under the previous view')
  top = view
  tickFrame()
  assert.equal(attrs.has('data-app-tab-entry-playing'), true, 'play after the map reaches the front')
  assert.equal(frames.size, 0, 'the entrance starts once')
  assert.equal(timers.size, 1)
  ;[...timers.values()][0].fn()
  assert.equal(attrs.size, 0, 'the prepared map has no transform after the entrance')

  document.visibilityState = 'hidden'
  assert.equal(service.playAppTabEntrance(page, 'left', 180), true)
  tickFrame()
  assert.equal(attrs.has('data-app-tab-entry-playing'), false, 'a newly mounted page waits for a visible frame')
  document.visibilityState = 'visible'
  tickFrame()
  assert.equal(attrs.has('data-app-tab-entry-playing'), true)

  coverVisible = true
  laidOut = false
  service.playAppTabEntrance(page, 'left', 180, 'cover-frame')
  tickFrame()
  assert.equal(releases, 0, 'keep the outgoing cover while the target has no layout')
  laidOut = true
  tickFrame()
  assert.equal(releases, 0, 'leave one paint opportunity before revealing the target')
  tickFrame()
  assert.equal(releases, 1)
  assert.equal(attrs.has('data-app-tab-entry-playing'), true, 'the incoming animation starts as the cover is released')
}

{
  const views = new Map(), bitmaps = new Map(), timers = new Map()
  let finishDraw, intercepted, started = 0, shown = 0, serial = 0
  class View {
    constructor(id) { this.id = id; views.set(id, this) }
    static getViewById(id) { return views.get(id) }
    interceptTouchEvent(value) { intercepted = value }
    drawBitmap() {}
    show() { shown++ }
    close() { views.delete(this.id) }
  }
  class Bitmap {
    constructor(id) { this.id = id; bitmaps.set(id, this) }
    static getBitmapById(id) { return bitmaps.get(id) }
    clear() { bitmaps.delete(this.id) }
  }
  const source = { id: 'home', draw(_, success) { started++; finishDraw = success } }
  const plus = { nativeObj: { View, Bitmap }, webview: { getTopWebview: () => source } }
  const app = vm.createContext({ plus, setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id },
    clearTimeout: id => timers.delete(id) })
  vm.runInContext(appHandoffSource, app)
  const page = { $getAppWebview: () => source }
  const first = app.holdAppTabFrame(page)
  assert.ok(first.id)
  assert.equal(started, 0, 'navigation can start synchronously before capture')
  await flush()
  assert.equal(started, 1)
  assert.equal(intercepted, false)
  finishDraw()
  assert.equal(shown, 1)
  const [guard] = timers.values()
  assert.equal(guard.delay, 260)
  guard.fn()
  assert.equal(views.size, 0)
  assert.equal(bitmaps.size, 0)

  const second = app.holdAppTabFrame(page)
  await flush()
  app.releaseAppTabCover(plus, second.id)
  finishDraw()
  assert.equal(shown, 1, 'a late snapshot never covers a target that is already ready')
  assert.equal(timers.size, 0)
}

{
  const h = harness('H5')
  h.pending()
  h.context.useTabPageTransition('pages/home/home')
  h.hooks.onShow()
  assert.equal(h.idle.length, 0, 'background imports are not scheduled during entrance')
  h.hooks.onReady()
  h.hooks.onHide()
  h.finish()
  assert.equal(h.idle.length, 0, 'hiding discards deferred background work')
}

{
  const h = harness('H5')
  h.context.preloadSiblingTabPages('pages/home/home')
  h.context.preloadSiblingTabPages('pages/home/home')
  assert.equal(h.idle.length, 1, 'one background job per theme')
  h.pending()
  h.idle.shift()()
  assert.equal(h.loads.length, 0, 'idle work also checks pending navigation')
  const page = h.context.useTabPageTransition('pages/home/home')
  h.hooks.onShow()
  h.idle.shift()()
  assert.equal(h.loads.length, 0, 'consumed transition still pauses imports until entrance finishes')
  h.hooks.onReady()
  h.finish()
  assert.equal(page.tabPageClass.value, '')
  h.idle.shift()()
  assert.equal(h.loads.length, 1)
  assert.equal(h.idle.length, 0, 'next import waits for the current one to settle')
  h.loads[0].resolve({})
  await flush()
  h.idle.shift()()
  assert.equal(h.loads.length, 2)
  h.loads[1].reject(new Error('offline'))
  await flush()
  h.idle.shift()()
  assert.equal(h.loads.length, 3, 'one failed preload does not stop later pages')
  h.loads[2].resolve({})
  await flush()
  h.idle.shift()()
  assert.equal(h.idle.length, 0)
  const retry = h.context.preloadTabPage(h.loads[1].path.replace('@/', '').replace('.vue', ''))
  assert.equal(h.loads.length, 4, 'a failed import remains retryable')
  h.loads[3].resolve({})
  await retry
}


console.log('H5 / APP / Weixin tab transition and preload checks passed')
