import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createChatEventsTransport } from '../../src/utils/chat-events-transport.mjs'

const read = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8')
function setup() {
  let now = 1000
  const requests = []
  const context = { reactive: value => value, Date: { parse: Date.parse, now: () => now },
    request: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })) }
  const source = read('src/utils/community-chat-settings.js').replace(/^import .*$/gm, '').replace(/\bexport /g, '')
  vm.createContext(context)
  vm.runInContext(`${source}\nglobalThis.api = { communityChatSettings, applyCommunityChatSettings, connectCommunityChatSettings, readCommunityChatEnabled }`, context)
  return { ...context.api, requests, tick: () => { now += 5001 } }
}
const state = setup()
assert.equal(state.communityChatSettings.enabled, false, 'unknown settings do not expose new realtime entry points')
const first = state.readCommunityChatEnabled()
assert.equal(state.readCommunityChatEnabled(), first, 'all pages share one in-flight public-settings read')
state.requests[0].resolve({ code: 0, data: { aiEnabled: false, communityChatEnabled: true, settingsUpdatedAt: '2026-11-16T10:00:00Z' } })
assert.equal(await first, true)
assert.equal(await state.readCommunityChatEnabled(), true)
assert.equal(state.requests.length, 1)
state.tick()
const stale = state.readCommunityChatEnabled()
state.applyCommunityChatSettings({ communityChatEnabled: false, settingsUpdatedAt: '2026-11-16T10:00:02Z' })
state.requests[1].resolve({ code: 0, data: { communityChatEnabled: true } })
assert.equal(await stale, false, 'HTTP in flight cannot override a newer websocket setting')
state.applyCommunityChatSettings({ communityChatEnabled: true, settingsUpdatedAt: '2026-11-16T10:00:01Z' })
assert.equal(state.communityChatSettings.enabled, false, 'an older replica snapshot cannot override a newer version')
state.applyCommunityChatSettings({ communityChatEnabled: true })
assert.equal(state.communityChatSettings.enabled, false, 'unversioned legacy responses cannot undo a versioned socket update')
state.tick()
const failed = state.readCommunityChatEnabled()
state.requests[2].reject(new Error('offline'))
assert.equal(await failed, false)
const legacy = setup()
const legacyRead = legacy.readCommunityChatEnabled()
legacy.requests[0].resolve({ code: 0, data: { aiEnabled: false } })
assert.equal(await legacyRead, true, 'old backends without the flag retain the established default')
const reconnect = setup()
reconnect.applyCommunityChatSettings({ communityChatEnabled: true, settingsUpdatedAt: '2026-11-16T10:00:00Z' })
reconnect.tick()
const previousConnectionRequest = reconnect.readCommunityChatEnabled()
reconnect.connectCommunityChatSettings({ type: 'connected' })
assert.equal(reconnect.requests.length, 2, 'confirmed legacy reconnect starts a fresh HTTP fallback')
reconnect.requests[1].resolve({ code: 0, data: { communityChatEnabled: false } })
await reconnect.readCommunityChatEnabled()
assert.equal(reconnect.communityChatSettings.enabled, false, 'new-to-old backend transition accepts its unversioned snapshot')
reconnect.requests[0].resolve({ code: 0, data: { communityChatEnabled: true } })
await previousConnectionRequest
assert.equal(reconnect.communityChatSettings.enabled, false, 'previous connection request remains invalidated')

// The existing transport carries setting changes; no new socket, timer or polling.
let receive, delivered
const transport = createChatEventsTransport({ getToken: () => 'one', getBaseUrl: () => 'https://example.test',
  connectSocket: () => ({ onMessage(fn) { receive = fn }, onClose() {}, onError() {}, send() {}, close() {} }),
  onEvent: value => { delivered = value }, setTimer: () => 1, clearTimer() {} })
transport.setActive(true)
receive({ data: JSON.stringify({ type: 'settings.changed', communityChatEnabled: false }) })
assert.equal(delivered.type, 'settings.changed')
transport.setActive(false)

for (const name of ['src/pages-nonTheme/chat.vue', 'src/pages-nonTheme/chatlist.vue', 'src/pages-nonTheme/settings.vue',
  'src/pages-admin/service-setting.vue', 'src/pages-nonTheme/components/RealtimeActivityMessage.vue']) {
  const { descriptor, errors } = parse(read(name), { filename: name })
  assert.equal(errors.length, 0, `${name}: valid SFC`)
  const script = compileScript(descriptor, { id: name })
  const template = compileTemplate({ source: descriptor.template.content, filename: name, id: name,
    compilerOptions: { bindingMetadata: script.bindings } })
  assert.equal(template.errors.length, 0, `${name}: valid conditional entries`)
}
const chat = parse(read('src/pages-nonTheme/chat.vue')).descriptor.script.content
const optionsBody = chat.match(/callMenuOptions\(\) \{([\s\S]*?)\n        \},/)[1].replace(/^\s*\/\/.*$/gm, '')
const options = vm.runInNewContext(`(function(){${optionsBody}})`)
assert.equal(options.call({ communityChatSettings: { enabled: false }, isGroupChat: false, voiceCallState: { supported: true, videoSupported: true } }).length, 0)
assert.ok(options.call({ communityChatSettings: { enabled: true }, isGroupChat: false, voiceCallState: { supported: true, videoSupported: true } }).length > 0)
const locationBody = chat.match(/hasLiveLocationEntry\(\) \{([\s\S]*?)\n        \},/)[1]
const locationEntry = vm.runInNewContext(`(function(){${locationBody}})`)
assert.equal(locationEntry.call({ otherUserId: 2, liveLocationState: { offers: {}, phase: 'idle' } }), false)
assert.equal(locationEntry.call({ otherUserId: 2, liveLocationState: { offers: { '2': {} }, phase: 'idle' } }), true)
assert.equal(locationEntry.call({ otherUserId: 2, liveLocationState: { offers: {}, phase: 'sharing', peer: { id: 2 } } }), true)
assert.ok(!read('src/utils/community-chat-settings.js').includes('.end('), 'entry visibility cannot stop ongoing calls/shares')
console.log('PASS community-chat setting: shared reads, live socket updates, stale replicas/HTTP, legacy fallback, hidden new entries and retained active/invited sessions')
