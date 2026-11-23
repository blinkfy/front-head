import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { ref } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

const require = createRequire(import.meta.url)
const { initPreContext, preHtml, preJs } = require('@dcloudio/uni-cli-shared')
const read = path => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')
const tick = () => new Promise(resolve => setImmediate(resolve))

function logicFixture(platform) {
  initPreContext(platform)
  const code = preJs(read('utils/use-guide-videos.js')).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const calls = { settings: [], user: [], play: [], pause: [] }
  const hooks = {}
  let token = ''
  const setup = runInNewContext(`${code}\nuseGuideVideos`, {
    ref, config: { baseUrl: 'https://guide.test' },
    onShow: fn => { hooks.show = fn }, onHide: fn => { hooks.hide = fn }, onUnload: fn => { hooks.unload = fn },
    userinfo: (avatar, options) => new Promise((resolve, reject) => calls.user.push({ token, avatar, options, resolve, reject })),
    uni: {
      getStorageSync: () => token,
      request: options => calls.settings.push(options),
      createVideoContext: id => ({
        play: () => { calls.play.push(id); return Promise.reject(new Error('play rejected')) },
        pause: () => calls.pause.push(id)
      })
    }
  })
  return { guide: setup(), calls, hooks, setToken: value => { token = value } }
}

for (const platform of ['app', 'h5', 'mp-weixin']) {
  const { guide, calls, hooks, setToken } = logicFixture(platform)
  const opened = hooks.show()
  calls.settings.at(-1).success({ data: { code: 0, data: { aiEnabled: true } } })
  await opened
  assert.equal(guide.showVideo.value, true)
  assert.equal(guide.scenarioVideoPoster, platform === 'app' ? '/static/app/images/cover.webp' : 'https://guide.test/images/cover.webp')
  assert.match(guide.scenarioVideoUrl, /\.m3u8$/)
  guide.requestPlay('scenario')
  assert.equal(guide.showScenarioOverlay.value, false)
  if (platform === 'app') {
    assert.equal(guide.scenarioPlayTrigger.value, 1)
    assert.deepEqual(calls.play, [])
  } else {
    assert.deepEqual(calls.play, ['scenarioVideo'])
    await tick()
    assert.equal(guide.showScenarioOverlay.value, true, 'native play rejection restores the overlay')
  }
  hooks.hide()
  assert.equal(guide.showVideo.value, false)
  assert.equal(guide.scenarioPlayTrigger.value, 0)
  assert.deepEqual(calls.pause, platform === 'app' ? [] : ['scenarioVideo', 'appVideo'])

  function checkDisabled() {
    const pending = hooks.show()
    calls.settings.at(-1).success({ data: { code: 0, data: { aiEnabled: false } } })
    return pending
  }
  await checkDisabled()
  assert.equal(guide.showVideo.value, false, 'disabled videos stay hidden for guests')
  assert.equal(calls.user.length, 0)
  setToken('current')
  const ordinary = checkDisabled()
  await tick()
  assert.equal(calls.user.at(-1).options.sessionProbe, true)
  calls.user.at(-1).resolve({ code: 0, data: { isAdmin: false } })
  await ordinary
  assert.equal(guide.showVideo.value, false)
  const admin = checkDisabled()
  await tick()
  calls.user.at(-1).resolve({ code: 0, data: { isAdmin: true } })
  await admin
  assert.equal(guide.showVideo.value, true)
  const offline = checkDisabled()
  await tick()
  calls.user.at(-1).reject(new Error('offline'))
  await offline
  assert.equal(guide.showVideo.value, false, 'only verified admins can see disabled videos')
  const staleAdmin = checkDisabled()
  await tick()
  setToken('another-account')
  calls.user.at(-1).resolve({ code: 0, data: { isAdmin: true } })
  await staleAdmin
  assert.equal(guide.showVideo.value, false, 'only the current account can grant access')
  const hidden = hooks.show()
  hooks.unload()
  calls.settings.at(-1).fail(new Error('offline'))
  await hidden
  assert.equal(guide.showVideo.value, false, 'late settings cannot reopen an unloaded player')
  const unavailable = hooks.show()
  calls.settings.at(-1).fail(new Error('offline'))
  await unavailable
  assert.equal(guide.showVideo.value, true, 'unavailable settings retain the existing public fallback')
}

const playerSource = read('components/GuideAppVideo.vue')
const renderScript = playerSource.match(/<script module="hlsView" lang="renderjs">([\s\S]*?)<\/script>/)[1]
const hosts = new Map()
const streams = []
const observers = []
const pageHide = new Set()
const statuses = []
let supported = true
let shouldReject = false
function makeVideo() {
  return {
    style: {}, canPlayType: () => 'maybe', setAttribute() {},
    removeAttribute(name) { delete this[name] }, load() {},
    pause() { this.paused = true }, remove() { this.removed = true },
    play() {
      if (shouldReject) return Promise.reject(new Error('blocked'))
      this.onplay()
    }
  }
}
class HlsFixture {
  static isSupported() { return supported }
  static Events = { ERROR: 'error' }
  constructor() { streams.push(this) }
  on(_event, callback) { this.onError = callback }
  loadSource(src) { this.src = src }
  attachMedia(video) { this.video = video }
  destroy() { this.destroyed = true }
}
class ObserverFixture {
  constructor(callback) { this.run = callback; observers.push(this) }
  observe() {}
  disconnect() { this.disconnected = true }
}
const render = runInNewContext(renderScript.replace(/^import .*$/gm, '').replace('export default', 'this.component =') + '\ncomponent', {
  Hls: HlsFixture, MutationObserver: ObserverFixture,
  document: { body: {}, createElement: makeVideo, getElementById: id => hosts.get(id) },
  window: { addEventListener: (_event, fn) => pageHide.add(fn), removeEventListener: (_event, fn) => pageHide.delete(fn) }
})
const owner = { callMethod(name, value) { assert.equal(name, 'reportPlaying'); statuses.push(value) } }
const packet = (id, playTrigger = 0) => ({ hostId: id, playTrigger, src: '/guide.m3u8', poster: '/guide.webp', objectFit: 'cover', controls: true })
for (const id of ['scenario', 'app']) {
  hosts.set(id, { isConnected: true, appendChild(video) { this.video = video } })
  render.methods.update(packet(id), null, owner)
}
assert.equal(streams.length, 2)
render.methods.update(packet('scenario', 1), packet('scenario'), owner)
const scenario = streams[0].video
assert.equal(scenario.style.objectFit, 'cover')
assert.equal(scenario.controls, true)
assert.equal(statuses.at(-1), true)
scenario.onpause()
assert.equal(statuses.at(-1), false)
scenario.onended()
assert.equal(statuses.at(-1), false)
assert.equal(streams.length, 2, 'a play trigger reuses the active HLS instance')

shouldReject = true
render.methods.update(packet('app', 1), packet('app'), owner)
await tick()
assert.equal(streams[1].destroyed, true)
assert.equal(statuses.at(-1), false)
shouldReject = false
render.methods.update(packet('app', 2), packet('app', 1), owner)
assert.equal(streams.length, 3, 'retry recreates the failed HLS instance')
streams[2].onError('error', { fatal: true })
assert.equal(streams[2].destroyed, true)
hosts.get('scenario').isConnected = false
observers[0].run()
assert.equal(streams[0].destroyed, true)
assert.equal(scenario.removed, true)
assert.equal(pageHide.size, 0)
assert.ok(observers.every(item => item.disconnected))

supported = false
render.methods.update(packet('app', 3), packet('app', 2), owner)
const native = hosts.get('app').video
assert.equal(native.src, '/guide.m3u8')
for (const hide of [...pageHide]) hide()
assert.equal(native.src, undefined)
assert.equal(native.paused, true)
assert.equal(native.removed, true)
assert.equal(pageHide.size, 0)

for (const theme of ['pages', 'pages-dark']) {
  const file = `${theme}/guide/guide.vue`
  for (const platform of ['h5', 'app', 'mp-weixin']) {
    initPreContext(platform)
    const { descriptor, errors } = parse(preJs(preHtml(read(file))), { filename: file })
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: 'guide' })
    for (const name of ['showVideo', 'showScenarioOverlay', 'showAppOverlay', 'requestPlay']) assert.ok(script.bindings[name])
    assert.equal(descriptor.template.content.includes('<GuideAppVideo'), platform === 'app')
    assert.equal(descriptor.template.content.includes('@error="showAppOverlay = true"'), platform !== 'app')
    const template = compileTemplate({ source: descriptor.template.content, filename: file, id: 'guide',
      compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [], `${file} ${platform} compiles`)
  }
}

console.log('Guide video visibility, playback, recovery, disposal and three-platform SFC checks passed.')
