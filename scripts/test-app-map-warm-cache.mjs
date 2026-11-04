import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { createAppMapServerPool } from '../src/utils/app-map-server-pool.mjs'
import { createAppMapPreloader } from '../src/utils/app-map-preload-core.mjs'

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

await testAsync('preloader waits 1.2s, checks network once, creates one SDK preload window and times out at 20s', async () => {
  const clock = fakeTimers(), logs = [], calls = [], closes = []
  const sdkUrl = 'https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key'
  const preloader = createAppMapPreloader({
    getNetworkType: async () => { calls.push('network'); return 'wifi' },
    createWindow: value => { calls.push(value); const view = { close: mode => closes.push(mode) }; return view },
    log: phase => logs.push(phase), setTimer: clock.setTimeout, clearTimer: clock.clearTimeout
  })
  preloader.schedule(sdkUrl); preloader.schedule(sdkUrl)
  clock.tick(1199); assert.deepEqual(calls, [])
  clock.tick(1); await flushPromises()
  assert.deepEqual(calls, ['network', sdkUrl], 'duplicate scheduling still downloads once')
  assert.equal(clock.pending, 1)
  clock.tick(19999); assert.deepEqual(closes, [])
  clock.tick(1)
  assert.deepEqual(closes, ['none']); assert.deepEqual(logs, ['start', 'timeout']); assert.equal(clock.pending, 0)
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

await testAsync('preloader cancel closes a live window; close event clears timeout; dispose never restarts', async () => {
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
  listeners.close(); assert.equal(clock.pending, 0, 'native close clears the timeout')
  clock.tick(20000); assert.deepEqual(closes, [])

  const cancelPreloader = makePreloader()
  cancelPreloader.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  clock.tick(1200); await flushPromises()
  assert.equal(clock.pending, 1)
  cancelPreloader.cancel()
  assert.deepEqual(closes, ['none']); assert.equal(clock.pending, 0, 'cancel closes and clears a live preload')

  let resolveNetwork
  const pending = createAppMapPreloader({
    getNetworkType: () => new Promise(resolve => { resolveNetwork = resolve }),
    createWindow: () => { creates++; return { close() {} } }, setTimer: clock.setTimeout, clearTimer: clock.clearTimeout
  })
  pending.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  clock.tick(1200); pending.dispose(); resolveNetwork('wifi'); await flushPromises()
  pending.schedule('https://map.qq.com/api/gljs?v=1.exp&key=not-a-real-key')
  clock.tick(30000); await flushPromises()
  assert.equal(creates, 2, 'dispose prevents both late callbacks and future restarts')
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

test('preload document parses and preloads only the official SDK without executing it or fetching tiles', () => {
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
  assert.match(preloadBranch, /document\.createElement\('link'\)/)
  assert.match(preloadBranch, /link\.rel\s*=\s*'preload'/)
  assert.match(preloadBranch, /link\.as\s*=\s*'script'/)
  assert.match(preloadBranch, /link\.href\s*=\s*`https:\/\/map\.qq\.com\/api\/gljs/)
  assert.doesNotMatch(preloadBranch, /loadSdk\(|initialize\(|createAppTencentMap\(|addEventListener\(/)
  assert.match(host.slice(branchEnd), /window\.addEventListener\('message', onMessage\)/, 'normal map events remain in the non-preload branch')
})

const failed = results.filter(result => !result.ok)
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.ok ? '' : `\n${result.error}`}`)
console.log(`\n${results.length - failed.length} passed; ${failed.length} failed`)
if (failed.length) process.exitCode = 1
