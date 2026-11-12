import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { createAppMapServerPool } from '../src/utils/app-map-server-pool.mjs'
import { createAppMapPreloader } from '../src/utils/app-map-preload-core.mjs'
import { APP_MAP_IDLE_MS, createAppMapRetention, createAppMapTabCache } from '../src/utils/app-map-retention.mjs'

const require = createRequire(import.meta.url)
const { parse: parseSfc } = require('@vue/compiler-sfc')
const { parse: parseJs } = require('@babel/parser')
const results = []

function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (error) { results.push({ name, ok: false, error: error.stack || error.message }) }
}

async function testAsync(name, fn) {
  try { await fn(); results.push({ name, ok: true }) }
  catch (error) { results.push({ name, ok: false, error: error.stack || error.message }) }
}

function fakeTimers() {
  let now = 0, serial = 0
  const tasks = new Map()
  return {
    setTimeout(fn, delay = 0) { const id = ++serial; tasks.set(id, { at: now + delay, fn }); return id },
    clearTimeout(id) { tasks.delete(id) },
    tick(ms) {
      const end = now + ms
      while (true) {
        const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        tasks.delete(next[0]); now = next[1].at; next[1].fn()
      }
      now = end
    },
    get pending() { return tasks.size }
  }
}

async function flushPromises() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

test('APP retained-map transitions follow tab order in both themes instead of the native back direction', () => {
  const source = fs.readFileSync(new URL('../src/utils/tab-page-transition.js', import.meta.url), 'utf8')
  const navigate = source.slice(source.indexOf('export function navigateBottomTab('), source.indexOf('export function useTabPageTransition(')).replace('export function ', 'function ')
  for (const prefix of ['pages', 'pages-dark']) {
    const map = { route: `${prefix}/map/map` }, home = { route: `${prefix}/home/home` }, shop = { route: `${prefix}/shop/shop` }
    let pages = [map]
    const calls = []
    const uni = { setStorageSync() {}, getStorageSync() { return 'u1' } }
    for (const method of ['navigateTo', 'navigateBack', 'redirectTo', 'reLaunch']) uni[method] = options => calls.push({ method, ...options })
    const context = { uni, getCurrentPages: () => pages, appMapTabCache: createAppMapTabCache(),
      TAB_POSITIONS: { home: 0, map: 1, shop: 2, profile: 3 }, STORAGE_KEY: 'test', TRANSITION_DURATION: 180,
      normalizeRoute: url => url.split('?')[0].replace(/^\//, '') }
    vm.runInNewContext(navigate, context)
    context.navigateBottomTab('map', 'home', `/${home.route}`)
    assert.equal(calls.at(-1).animationType, 'slide-in-left', 'home enters from the left')
    pages = [map, home]
    context.navigateBottomTab('home', 'map', `/${map.route}?from=home`, 'navigateTo')
    assert.equal(calls.at(-1).method, 'navigateBack', 'return still reuses the retained map')
    assert.equal(calls.at(-1).delta, 1)
    assert.equal(calls.at(-1).animationType, 'slide-out-left', 'home leaves to the left when opening map')
    assert.equal(calls.at(-1).animationDuration, 180)
    pages = [map]
    context.navigateBottomTab('map', 'shop', `/${shop.route}`, 'navigateTo')
    assert.equal(calls.at(-1).animationType, 'slide-in-right', 'shop enters from the right')
    pages = [map, shop]
    context.navigateBottomTab('shop', 'map', `/${map.route}`)
    assert.equal(calls.at(-1).animationType, 'slide-out-right', 'shop leaves to the right when opening map')
  }
})

test('server pool shares one server between two page references and idles for 60s', () => {
  const clock = fakeTimers(), started = [], stopped = []
  const url = 'http://127.0.0.1:43127/map-cache/'
  const pool = createAppMapServerPool({ start: () => { started.push(url); return url }, stop: value => stopped.push(value), setTimer: clock.setTimeout, clearTimer: clock.clearTimeout })
  const first = pool.acquire(), second = pool.acquire()
  assert.equal(first, url); assert.equal(second, url); assert.deepEqual(started, [url])
  pool.release(first); assert.equal(clock.pending, 0); assert.deepEqual(stopped, [])
  pool.release(second); assert.equal(clock.pending, 1)
  clock.tick(59999); assert.deepEqual(stopped, [])
  assert.equal(pool.acquire(), url, 'reacquire reuses the idle server')
  assert.equal(clock.pending, 0, 'reacquire cancels idle cleanup')
  pool.release(url); clock.tick(60000)
  assert.deepEqual(stopped, [url], 'server stops once after 60 idle seconds')
})

test('server pool dispose stops only once; invalid start URLs are not cached', () => {
  const stopped = [], url = 'http://127.0.0.1:43128/map-cache/'
  const pool = createAppMapServerPool({ start: () => url, stop: value => stopped.push(value) })
  assert.equal(pool.acquire(), url)
  pool.dispose(); pool.dispose()
  assert.deepEqual(stopped, [url])

  const results = ['file:///map-cache/', url], attempts = [], invalidPool = createAppMapServerPool({
    start: () => { const value = results.shift(); attempts.push(value); return value }, stop() {}
  })
  assert.equal(invalidPool.acquire(), '')
  assert.equal(invalidPool.acquire(), url)
  assert.equal(attempts.length, 2, 'invalid URL does not populate the cache')
  invalidPool.dispose()
})

test('map retention throttles repeated hides, keeps short returns, and releases at the idle deadline', () => {
  const clock = fakeTimers(), releases = []
  let now = 0
  const retention = createAppMapRetention({ release: () => releases.push(now), now: () => now,
    setTimer: clock.setTimeout, clearTimer: clock.clearTimeout })
  assert.equal(APP_MAP_IDLE_MS, 300000)
  retention.hide(); retention.hide()
  assert.equal(clock.pending, 1, 'repeated hide notifications do not extend retention')
  now = 299999; retention.show(); assert.deepEqual(releases, [], 'return at 299999ms keeps the map')
  assert.equal(clock.pending, 0, 'short return cancels expiry')
  retention.hide(); now = 300000; clock.tick(APP_MAP_IDLE_MS)
  assert.deepEqual(releases, [300000], 'exact 300000ms idle expiry releases the iframe resources')
  retention.show(); retention.hide(); retention.dispose(); clock.tick(60000)
  assert.deepEqual(releases, [300000], 'disposed retention does not release twice')
})

test('map tab cache reuses map across home and shop with bounded stack navigation', () => {
  let now = 0
  const cache = createAppMapTabCache({ now: () => now })
  const map = { route: 'pages/map/map', options: {} }
  const home = { route: 'pages/home/home', options: {} }
  const shop = { route: 'pages/shop/shop', options: {} }
  assert.deepEqual(cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?from=map', owner: 'u1' }), { method: 'navigateTo' })
  assert.deepEqual(cache.navigation({ pages: [map, home], from: 'home', targetRoute: 'pages/shop/shop', url: '/pages/shop/shop?from=home', owner: 'u1' }), { method: 'redirectTo' })
  now = 299999
  assert.deepEqual(cache.navigation({ pages: [map, shop], from: 'shop', targetRoute: 'pages/map/map', url: '/pages/map/map?from=shop', owner: 'u1' }), { method: 'navigateBack', delta: 1 }, 'map tab stays reusable at 299999ms')
  assert.equal(cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?from=map', owner: 'u1' }).method, 'navigateTo')
  assert.deepEqual(cache.navigation({ pages: [map, home], from: 'home', targetRoute: 'pages/shop/shop', url: '/pages/shop/shop?from=home', owner: 'u1' }), { method: 'redirectTo' })
  assert.deepEqual(cache.navigation({ pages: [map, shop], from: 'shop', targetRoute: 'pages/map/map', url: '/pages/map/map?from=shop', owner: 'u1' }), { method: 'navigateBack', delta: 1 })
})

test('map tab cache expires, rejects owner or theme changes, query routes, and picker pages', () => {
  let now = 0
  const make = () => createAppMapTabCache({ now: () => now })
  const map = { route: 'pages/map/map', options: {} }, home = { route: 'pages/home/home', options: {} }
  let cache = make()
  assert.equal(cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?nearby=1', owner: 'u1' }), null, 'explicit query remains on original navigation path without a retained map')
  const picker = { route: 'pages/map/map', options: { mode: 'select' } }
  assert.equal(cache.navigation({ pages: [picker], from: 'map', targetRoute: 'pages/home/home', owner: 'u1' }), null)
  cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?from=map', owner: 'u1' })
  assert.deepEqual(cache.navigation({ pages: [map, home], from: 'home', targetRoute: 'pages/map/map', url: '/pages/map/map?from=home', owner: 'u2' }), { method: 'reLaunch' }, 'owner change drops the retained stack on passive query')
  cache = make()
  cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?from=map', owner: 'u1' })
  assert.deepEqual(cache.navigation({ pages: [map, home], from: 'home', targetRoute: 'pages-dark/map/map', url: '/pages-dark/map/map?from=home', owner: 'u1' }), { method: 'reLaunch' }, 'theme change drops the retained stack')
  cache = make()
  cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?from=map', owner: 'u1' })
  now = 300000
  assert.deepEqual(cache.navigation({ pages: [map, home], from: 'home', targetRoute: 'pages/map/map', url: '/pages/map/map?from=home', owner: 'u1' }), { method: 'reLaunch' }, 'expired map shell is replaced on passive query')
  now = 0; cache = make()
  cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?from=map', owner: 'u1' })
  assert.deepEqual(cache.navigation({ pages: [map, home], from: 'home', targetRoute: 'pages/map/map', url: '/pages/map/map?nearby=1', owner: 'u1' }), { method: 'reLaunch' }, 'explicit target query clears retained map state')
  now = 0; cache = make()
  cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?from=map', owner: 'u1' })
  assert.deepEqual(cache.navigation({ pages: [map, home], from: 'home', targetRoute: 'pages/map/map', url: '/pages/map/map?nearby=1', owner: 'u2' }), { method: 'reLaunch' }, 'owner mismatch is checked before explicit-query handling')
  now = 0; cache = make()
  cache.navigation({ pages: [map], from: 'map', targetRoute: 'pages/home/home', url: '/pages/home/home?from=map', owner: 'u1' })
  now = 60000
  assert.deepEqual(cache.navigation({ pages: [map, home], from: 'home', targetRoute: 'pages/map/map', url: '/pages/map/map?nearby=1', owner: 'u1' }), { method: 'reLaunch' }, 'expired map shell is cleared before explicit-query navigation')
})

await testAsync('preloader waits 1.2s and warms the SDK once; a loaded signal marks success', async () => {
  const clock = fakeTimers(), logs = [], calls = [], windows = [], closes = [], completions = []
  const sdkUrl = 'https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key'
  const preloader = createAppMapPreloader({
    getNetworkType: async () => { calls.push('network'); return 'wifi' },
    createWindow: (value, finish) => { windows.push(value); completions.push(finish); const view = { close: mode => closes.push(mode) }; return view },
    log: phase => logs.push(phase), setTimer: clock.setTimeout, clearTimer: clock.clearTimeout
  })
  preloader.schedule(sdkUrl); preloader.schedule(sdkUrl)
  clock.tick(1199); assert.deepEqual(calls, [])
  clock.tick(1); await flushPromises()
  assert.deepEqual(calls, ['network'], 'network is checked once')
  assert.deepEqual(windows, [sdkUrl], 'duplicate scheduling still warms once')
  assert.equal(clock.pending, 1)
  completions[0]('loaded')
  assert.deepEqual(closes, ['none']); assert.deepEqual(logs, ['start', 'loaded']); assert.equal(clock.pending, 0)
  clock.tick(30000); await flushPromises()
  assert.equal(windows.length, 1, 'successful warmup does not retry')
})

await testAsync('preloader retries a failed warmup once, then stops at the attempt limit', async () => {
  const clock = fakeTimers(), completions = [], calls = []
  const preloader = createAppMapPreloader({ getNetworkType: async () => 'wifi',
    createWindow: (url, finish) => { calls.push(url); completions.push(finish); return { close() {} } },
    setTimer: clock.setTimeout, clearTimer: clock.clearTimeout, retryMs: 5000 })
  preloader.schedule('https://map.qq.com/api/gljs?v=1.exp&key=test')
  clock.tick(1200); await flushPromises(); assert.equal(calls.length, 1)
  completions[0]('failed'); assert.equal(clock.pending, 1)
  clock.tick(5000); await flushPromises(); assert.equal(calls.length, 2)
  completions[1]('timeout'); clock.tick(60000); await flushPromises()
  assert.equal(calls.length, 2, 'failure is bounded to two actual warmup attempts')
})

await testAsync('preloader skips offline network and cancel ignores a late network callback', async () => {
  const offlineClock = fakeTimers(); let offlineCreates = 0
  const offline = createAppMapPreloader({ getNetworkType: async () => 'none', createWindow: () => { offlineCreates++; return null }, setTimer: offlineClock.setTimeout, clearTimer: offlineClock.clearTimeout })
  offline.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  offlineClock.tick(1200); await flushPromises()
  assert.equal(offlineCreates, 0); assert.equal(offlineClock.pending, 0)

  const clock = fakeTimers(); let resolveNetwork, creates = 0
  const preloader = createAppMapPreloader({
    getNetworkType: () => new Promise(resolve => { resolveNetwork = resolve }),
    createWindow: () => { creates++; return { close() {} } }, setTimer: clock.setTimeout, clearTimer: clock.clearTimeout
  })
  preloader.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  clock.tick(1200); preloader.cancel(); resolveNetwork('wifi'); await flushPromises()
  assert.equal(creates, 0, 'cancel invalidates the in-flight network callback')
  assert.equal(clock.pending, 0)
})

await testAsync('preloader cancel closes a live window; close event retries; dispose never restarts', async () => {
  const clock = fakeTimers(), closes = [], listeners = {}, logs = []
  let creates = 0
  const makePreloader = () => createAppMapPreloader({
    getNetworkType: async () => 'wifi',
    createWindow: () => {
      creates++
      return { addEventListener: (type, fn) => { listeners[type] = fn }, close: mode => closes.push(mode) }
    },
    log: phase => logs.push(phase), setTimer: clock.setTimeout, clearTimer: clock.clearTimeout
  })
  const preloader = makePreloader()
  preloader.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  clock.tick(1200); await flushPromises()
  assert.equal(clock.pending, 1)
  listeners.close(); assert.equal(clock.pending, 1, 'unexpected close schedules the bounded retry')
  clock.tick(5000); await flushPromises()
  assert.equal(creates, 2, 'unexpected native close is retried')
  preloader.dispose()
  assert.deepEqual(closes, ['none', 'none']); assert.equal(clock.pending, 0)

  const cancelPreloader = makePreloader()
  cancelPreloader.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  clock.tick(1200); await flushPromises()
  assert.equal(clock.pending, 1)
  cancelPreloader.cancel()
  assert.deepEqual(closes, ['none', 'none', 'none']); assert.equal(clock.pending, 0, 'cancel closes and clears a live preload')

  let resolveNetwork
  const pending = createAppMapPreloader({
    getNetworkType: () => new Promise(resolve => { resolveNetwork = resolve }),
    createWindow: () => { creates++; return { close() {} } }, setTimer: clock.setTimeout, clearTimer: clock.clearTimeout
  })
  pending.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  clock.tick(1200); pending.dispose(); resolveNetwork('wifi'); await flushPromises()
  pending.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  clock.tick(30000); await flushPromises()
  assert.equal(creates, 3, 'dispose prevents both late callbacks and future restarts')
  assert.equal(clock.pending, 0)
})

test('App.vue script parses and wires ready, show, hide, and dispose lifecycle', () => {
  const source = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: 'App.vue' })
  assert.deepEqual(errors, [])
  assert.ok(descriptor.script)
  parseJs(descriptor.script.content, { sourceType: 'module' })
  assert.match(descriptor.script.content, /onShow\s*:\s*function\s*\([^)]*\)\s*\{[\s\S]*?setAppMapPreloadActive\(true\)/)
  assert.match(descriptor.script.content, /onHide\s*:\s*function\s*\([^)]*\)\s*\{[\s\S]*?setAppMapPreloadActive\(false\)/)
  assert.match(descriptor.script.content, /beforeUnmount\s*\(\)\s*\{[\s\S]*?disposeAppMapPreload\(\)/)

  const wrapper = fs.readFileSync(new URL('../src/utils/app-map-preload-app.js', import.meta.url), 'utf8')
  parseJs(wrapper, { sourceType: 'module' })
  assert.match(wrapper, /onAppPageReady\(\(\)\s*=>\s*\{\s*ready\s*=\s*true;\s*schedule\(\)/)
  assert.match(wrapper, /setAppMapPreloadActive\(value\)[\s\S]*?if \(active\) schedule\(\); else preloader\.cancel\(\)/)
  assert.match(wrapper, /disposeAppMapPreload\(\)\s*\{\s*preloader\.dispose\(\)/)

  let preloadOptions, acquired = 0, viewIndex = 0
  const released = [], nativeViews = []
  const base = 'http://127.0.0.1:43129/map-cache/'
  const context = {
    mapConfig: { qqMapKey: 'test-key' }, onAppPageReady() {},
    uni: { onNetworkStatusChange() {} },
    createAppMapPreloader(options) { preloadOptions = options; return { schedule() {}, cancel() {}, dispose() {} } },
    startLocalMapServer() { acquired++; return base },
    stopLocalMapServer(url) { released.push(url) },
    plus: { webview: { create(...args) {
      const listeners = new Map(), index = ++viewIndex
      const view = {
        args,
        addEventListener(type, fn) { listeners.set(type, fn) },
        fire(type) { listeners.get(type)?.() },
        close() { if (index === 2) throw new Error('native close failed') }
      }
      nativeViews.push(view); return view
    } } },
    console: { info() {} }
  }
  const executable = wrapper.replace(/^import .*?\r?\n/gm, '').replace(/export function /g, 'function ')
    + '\nglobalThis.__preloadTest = { setAppMapPreloadActive, disposeAppMapPreload }'
  vm.runInNewContext(executable, context)
  const firstLease = preloadOptions.createWindow('https://map.qq.com/api/gljs?v=1.exp&key=test-key')
  assert.equal(acquired, 1)
  assert.equal(nativeViews[0].args[3].sdkPreloadUrl, 'https://map.qq.com/api/gljs?v=1.exp&key=test-key')
  assert.equal(nativeViews[0].args[3].frameUrl, `${base}index.html`)
  assert.equal(nativeViews[0].args[2].cachemode, 'default')
  nativeViews[0].fire('close')
  firstLease.close('none')
  assert.deepEqual(released, [base], 'native close and adapter close release one lease only')

  const secondLease = preloadOptions.createWindow('https://map.qq.com/api/gljs?v=1.exp&key=test-key')
  assert.throws(() => secondLease.close('none'), /native close failed/)
  assert.deepEqual(released, [base, base], 'adapter finally releases the lease when native close throws')
})

test('preload document executes the official SDK in the map iframe without creating maps or fetching tiles', () => {
  const html = fs.readFileSync(new URL('../src/static/app-map/preload.html', import.meta.url), 'utf8')
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  assert.equal(scripts.length, 1)
  assert.doesNotMatch(scripts[0][0], /<script\b[^>]*\bsrc\s*=/i, 'document has no executable external script')
  parseJs(scripts[0][1], { sourceType: 'script' })
  assert.ok(scripts[0][1].includes(String.raw`https:\/\/map\.qq\.com\/api\/gljs\?`), 'only official SDK URL is accepted')
  assert.ok(scripts[0][1].includes(String.raw`http:\/\/127\.0\.0\.1:\d+\/`), 'iframe URL is restricted to loopback')
  assert.match(scripts[0][1], /frame\.src\s*=\s*frameUrl\s*\+\s*'#sdk-preload:'/)
  assert.match(scripts[0][1], /event\.source\s*===\s*frame\.contentWindow\s*&&\s*event\.origin\s*===\s*target\.origin/)
  assert.match(scripts[0][1], /event\.data\.channel\s*===\s*'app-map-sdk-preload'/)
  assert.doesNotMatch(scripts[0][1], /createElement\(['"]script['"]\)|new\s+TMap\.Map|tilesloaded|(?:tile|satellite).{0,20}\.(?:png|jpe?g|webp)/i)

  const wrapper = fs.readFileSync(new URL('../src/utils/app-map-preload-app.js', import.meta.url), 'utf8')
  assert.match(wrapper, /cachemode:\s*'default'/, 'preload WebView uses the platform default cache mode')
  assert.match(wrapper, /const base = startLocalMapServer\(\)/)
  assert.match(wrapper, /frameUrl:\s*base \+ 'index\.html'/)
  assert.match(wrapper, /view\.addEventListener\('close', release\)/)
  assert.match(wrapper, /close:\s*mode\s*=>\s*\{\s*try\s*\{\s*view\.close\(mode\)\s*\}\s*finally\s*\{\s*release\(\)\s*\}/)
  assert.match(wrapper, /preloader\.schedule\(`https:\/\/map\.qq\.com\/api\/gljs/)

  const host = fs.readFileSync(new URL('../src/static/app-map/host.mjs', import.meta.url), 'utf8')
  parseJs(host, { sourceType: 'module' })
  const branchStart = host.indexOf("if (token.startsWith('sdk-preload:')")
  const branchEnd = host.indexOf('} else {', branchStart)
  assert.ok(branchStart >= 0 && branchEnd > branchStart, 'host has an isolated SDK preload branch')
  const preloadBranch = host.slice(branchStart, branchEnd)
  assert.match(preloadBranch, /location\.protocol === 'http:' && location\.hostname === '127\.0\.0\.1'/)
  assert.match(preloadBranch, /loadSdk\(key\)\.then\([\s\S]*?phase: 'loaded'[\s\S]*?phase: 'failed'/)
  assert.match(host, /function loadSdk\(key\)[\s\S]*?script\.src\s*=\s*`https:\/\/map\.qq\.com\/api\/gljs/)
  assert.doesNotMatch(preloadBranch, /initialize\(|createAppTencentMap\(|tilesloaded/)
  assert.match(host.slice(branchEnd), /window\.addEventListener\('message', onMessage\)/, 'normal map events remain in the non-preload branch')
})

await testAsync('host preload branch executes SDK script, reports outcome, and never constructs a map', async () => {
  const source = fs.readFileSync(new URL('../src/static/app-map/host.mjs', import.meta.url), 'utf8').replace(/^import .*?\r?\n/gm, '')
  async function run(fail) {
    const messages = [], listeners = [], scripts = []
    const context = {
      location: { hash: '#sdk-preload:test-key', protocol: 'http:', hostname: '127.0.0.1' },
      document: { getElementById: () => ({ style: {}, textContent: '' }), createElement: tag => { const script = { tag, remove() {} }; scripts.push(script); return script },
        head: { appendChild: script => { if (fail) script.onerror(); else { context.window.TMap = { Map() {} }; script.onload() } } } },
      parent: { postMessage: message => messages.push(message) },
      setTimeout, clearTimeout
    }
    context.window = { addEventListener: (...args) => listeners.push(args), removeEventListener() {} }
    vm.runInNewContext(source, context)
    await flushPromises()
    assert.match(scripts[0].src, /^https:\/\/map\.qq\.com\/api\/gljs\?v=1\.exp&key=test-key$/)
    assert.deepEqual(listeners, [], 'preload branch does not install normal map listeners')
    return { messages, context }
  }
  const loaded = await run(false)
  assert.equal(loaded.messages[0].phase, 'loaded')
  assert.equal(loaded.context.renderer, undefined, 'no renderer or map is constructed')
  const failed = await run(true)
  assert.equal(failed.messages[0].phase, 'failed')
})

const failed = results.filter(result => !result.ok)
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.ok ? '' : `\n${result.error}`}`)
console.log(`\n${results.length - failed.length} passed; ${failed.length} failed`)
if (failed.length) process.exitCode = 1
