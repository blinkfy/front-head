import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'
import { initPreContext, preHtml, preJs } from '@dcloudio/uni-cli-shared'

const filename = new URL('../src/components/SmartSortRobotApp.vue', import.meta.url)
const source = readFileSync(filename, 'utf8')
const renderMatch = source.match(/<script\s+module="robotView"\s+lang="renderjs">([\s\S]*?)<\/script>/)
assert.ok(renderMatch, 'renderjs source exists')
// Vue's compiler-sfc rejects UniApp's second module script, so parse its normal SFC block separately.
const { descriptor, errors } = parseSfc(source.replace(renderMatch[0], ''), { filename: 'SmartSortRobotApp.vue' })
assert.equal(errors.length, 0, 'APP robot SFC parses')
const renderSource = renderMatch[1]
parseJavaScript(renderSource.replace('export default', 'const robotModule ='), { sourceType: 'script' })
for (const platform of ['h5', 'app-plus', 'mp-weixin']) {
  initPreContext(platform)
  parseJavaScript(preJs(descriptor.script.content, 'SmartSortRobotApp.vue'), { sourceType: 'module' })
  parseTemplate(preHtml(descriptor.template.content, 'SmartSortRobotApp.vue'))
}

initPreContext('app-plus')
const appContext = {
  Date, plus: undefined,
  uni: { $on(_name, callback) { appContext.listener = callback }, $off(_name, callback) { appContext.unsubscribed = callback } }
}
runInNewContext(preJs(descriptor.script.content, 'SmartSortRobotApp.vue').replace('export default', 'globalThis.appComponent ='), appContext)
const appComponent = appContext.appComponent
Object.assign(appComponent, appComponent.data.call({}), { active: true, appVisible: true, resumeVersion: 0,
  events: [], $emit(name) { this.events.push(name) } })
appComponent.created.call(appComponent)
appContext.listener(false)
assert.equal(appComponent.appVisible, false, 'APP visibility listener records suspension')
assert.deepEqual(appComponent.events, ['suspended'], 'background visibility emits suspended')
appComponent.methods.handleRecovering.call(appComponent)
assert.deepEqual(appComponent.events, ['suspended'], 'background recovery does not emit recovering')
appContext.listener(true)
assert.equal(appComponent.resumeVersion, 1, 'foreground visibility advances resumeVersion')
appComponent.methods.handleRecovering.call(appComponent)
assert.deepEqual(appComponent.events, ['suspended', 'recovering'], 'foreground recovery emits recovering')
appComponent.beforeUnmount.call(appComponent)
assert.equal(appContext.unsubscribed, appComponent.appVisibilityListener, 'APP visibility listener is removed on unmount')

const robot3dSource = readFileSync(new URL('../src/components/SmartSortRobot3D.vue', import.meta.url), 'utf8')
const robot3dDescriptor = parseSfc(robot3dSource, { filename: 'SmartSortRobot3D.vue' }).descriptor
initPreContext('app-plus')
const parentScript = preJs(robot3dDescriptor.scriptSetup.content, 'SmartSortRobot3D.vue')
const parentAst = parseJavaScript(parentScript, { sourceType: 'module' })
const suspendedFn = parentAst.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'handleSuspended')
assert.ok(suspendedFn, 'parent suspended handler exists')
const clearedTimers = []
const parentContext = { clearTimeout(id) { clearedTimers.push(id) } }
runInNewContext(`let loadingTimer = 42; const ready = { value: true }; globalThis.resultReady = ready; function clearLoadingTimer() { clearTimeout(loadingTimer); loadingTimer = null }; ${parentScript.slice(suspendedFn.start, suspendedFn.end)}`, parentContext)
parentContext.handleSuspended()
assert.deepEqual(clearedTimers, [42], 'parent suspended handler clears its loading timeout')
assert.equal(parentContext.resultReady.value, false, 'parent suspended handler clears ready state')

const engineSource = readFileSync(new URL('../src/components/smart-sort-robot-engine.mjs', import.meta.url), 'utf8')
const renderStart = engineSource.indexOf('const render = timestamp => {')
const renderEnd = engineSource.indexOf('\n  let onRenderError', renderStart)
assert.ok(renderStart >= 0 && renderEnd > renderStart, 'engine render callback exists')
const renderBody = engineSource.slice(renderStart, renderEnd)
assert.ok(renderBody.indexOf('context.isContextLost()') < renderBody.indexOf('renderer.render(scene, camera)'),
  'render checks for a lost context before drawing')
assert.ok(renderBody.indexOf('!host.clientWidth || !host.clientHeight') < renderBody.indexOf('onFirstFrame?.()'),
  'zero-sized host cannot acknowledge the first frame')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function makeHarness() {
  let serial = 0
  const timers = new Map(), frames = new Map(), listeners = new Map(), hosts = new Map()
  const requests = [], mounts = [], calls = [], observers = []
  const document = {
    hidden: false, body: {}, head: { appendChild(script) { queueMicrotask(() => { window.SmartSortRobotRuntime = runtime; script.onload?.() }) } },
    createElement() { return { remove() {}, set src(value) { this.url = value } } },
    getElementById(id) { return hosts.get(id) },
    addEventListener(type, fn) { (listeners.get('d:' + type) || listeners.set('d:' + type, new Set()).get('d:' + type)).add(fn) },
    removeEventListener(type, fn) { listeners.get('d:' + type)?.delete(fn) }
  }
  const window = {
    SmartSortRobotRuntime: null, devicePixelRatio: 1,
    addEventListener(type, fn) { (listeners.get('w:' + type) || listeners.set('w:' + type, new Set()).get('w:' + type)).add(fn) },
    removeEventListener(type, fn) { listeners.get('w:' + type)?.delete(fn) }
  }
  class XHR {
    open(_method, url) { this.url = url }
    send() { this.task = deferred(); requests.push(this) }
    finish() { this.status = 200; this.response = new ArrayBuffer(8); this.onload() }
  }
  class MutationObserver { constructor(cb) { this.cb = cb; this.disconnected = false; observers.push(this) } observe() {} disconnect() { this.disconnected = true } }
  const runtime = { mountSmartSortRobot(host, options) {
    const engine = { options, active: options.active, states: [options.state], setActive(value) { this.active = value }, setState(value) { this.states.push(value) }, dispose() { this.disposed = true } }
    mounts.push(engine); return engine
  } }
  const context = {
    window, document, XMLHttpRequest: XHR, MutationObserver,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id }, clearTimeout(id) { timers.delete(id) },
    requestAnimationFrame(fn) { const id = ++serial; frames.set(id, fn); return id }, cancelAnimationFrame(id) { frames.delete(id) },
    console, Promise, Map, Error, String
  }
  runInNewContext(renderSource.replace('export default', 'globalThis.robotModule ='), context)
  const update = context.robotModule.methods.update
  function add(id, active = true, resumeVersion = 0) {
    const host = { isConnected: true }; hosts.set(id, host)
    const owner = { callMethod(name, value) { calls.push([id, name, value]) } }
    update({ hostId: id, state: 'idle', active, resumeVersion, assetBase: '/assets/' }, null, owner)
    return { host, owner }
  }
  function runFrame() { const [id, fn] = frames.entries().next().value || []; if (fn) { frames.delete(id); fn() } }
  function runFrames() { while (frames.size) runFrame() }
  function fireTimer(ms) { const item = [...timers.entries()].find(([, timer]) => timer.ms === ms); if (item) { timers.delete(item[0]); item[1].fn() } }
  function emit(key, event = {}) { for (const fn of [...(listeners.get(key) || [])]) fn(event) }
  return { add, update, timers, frames, requests, mounts, calls, observers, document, listeners, runFrame, runFrames, fireTimer, emit }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

const h = makeHarness()
h.add('a'); h.add('b')
h.runFrames()
await Promise.resolve(); await Promise.resolve()
assert.equal(h.requests.length, 1, 'robots in the same WebView share an in-flight GLB read')
h.requests[0].finish()
await flush()
assert.equal(h.mounts.length, 2, 'both robots mount after the shared model read')

// Visibility while the initial shared read is pending; resume invalidates neither valid work nor its host.
const x = makeHarness(); x.document.hidden = true
x.add('pending', true); x.runFrame()
await Promise.resolve(); await Promise.resolve()
assert.equal(x.requests.length, 0, 'hidden view does not begin a load')
x.document.hidden = false; x.emit('d:visibilitychange', { type: 'visibilitychange' })
x.runFrame(); await Promise.resolve(); await Promise.resolve()
assert.equal(x.requests.length, 1)
x.requests[0].finish(); await flush()
assert.equal(x.mounts.length, 1, 'visible return starts the pending mount')

const inactive = makeHarness(); inactive.add('inactive', false); inactive.runFrame()
assert.equal(inactive.timers.size, 0, 'inactive robot has no watchdog')

const resume = makeHarness(); resume.add('resume'); resume.runFrame(); await Promise.resolve(); await Promise.resolve()
resume.requests[0].finish(); await flush()
const initial = resume.mounts[0]
resume.update({ hostId: 'resume', state: 'idle', active: true, resumeVersion: 1, assetBase: '/assets/' }, null, { callMethod(name) { resume.calls.push(['resume', name]) } })
assert.ok(initial.active, 'resumeVersion reactivates the engine even when active remains true')
assert.ok(resume.calls.some(([, name]) => name === 'handleRecovering'))
resume.update({ hostId: 'resume', state: 'idle', active: false, resumeVersion: 1, assetBase: '/assets/' }, null, { callMethod() {} })
assert.equal(resume.timers.size, 0, 'deactivating a mounted engine clears its watchdog')

const watchdog = makeHarness(); watchdog.add('stuck'); watchdog.runFrame(); await Promise.resolve(); await Promise.resolve()
watchdog.requests[0].finish(); await flush()
const lateReady = watchdog.mounts[0].options.onFirstFrame
watchdog.fireTimer(2000); watchdog.runFrames(); await flush()
assert.equal(watchdog.mounts[0].disposed, true, 'missing first frame disposes and rebuilds the engine')
assert.equal(watchdog.requests.length, 1, 'watchdog recovery reuses the cached model buffer')
lateReady()
assert.equal(watchdog.calls.filter(([, name]) => name === 'handleReady').length, 0,
  'callback from the replaced engine cannot update the owner')
watchdog.fireTimer(2000); watchdog.runFrames(); await flush()
watchdog.fireTimer(2000); watchdog.runFrames(); await flush()
assert.ok(watchdog.calls.filter(([, name]) => name === 'handleFallback').length <= 1, 'watchdog retries are bounded')

const race = makeHarness(); race.document.hidden = true
race.add('race', true); race.document.hidden = false
race.emit('d:visibilitychange', { type: 'visibilitychange' }); race.runFrame(); await Promise.resolve(); await Promise.resolve()
const pending = race.requests[0]
race.document.hidden = true; race.emit('d:visibilitychange', { type: 'visibilitychange' })
race.document.hidden = false; race.emit('d:visibilitychange', { type: 'visibilitychange' }); race.runFrame(); await Promise.resolve(); await Promise.resolve()
pending.finish(); await flush()
assert.equal(race.mounts.length, 1, 'stale initial completion does not create a duplicate engine')
assert.equal(race.requests.length, 1, 'hide and resume during loading retain the shared in-flight read')

const cleanup = makeHarness(); const { host } = cleanup.add('removed'); cleanup.runFrame(); await Promise.resolve(); await Promise.resolve()
host.isConnected = false; cleanup.observers[0].cb()
assert.equal(cleanup.observers[0].disconnected, true, 'removed host disconnects its observer')
assert.equal(cleanup.listeners.get('d:visibilitychange').size, 0, 'last disposal removes document listeners')
assert.equal(cleanup.listeners.get('w:pageshow').size, 0, 'last disposal removes window listeners')

console.log('smart-sort robot APP recovery lifecycle checks passed')
