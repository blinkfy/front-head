import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse } from '@vue/compiler-sfc'

const OLD = 'previous_call_0001', NEW = 'incoming_call_0002'
function loadComponent(path, context) {
  const source = parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8')).descriptor.script.content
  vm.runInNewContext(source.replace(/^import .*$/gm, '').replace('export default', 'globalThis.component ='), context)
  return context.component
}
function bind(component) {
  const page = component.data()
  Object.assign(page, component.methods)
  for (const [key, getter] of Object.entries(component.computed || {})) Object.defineProperty(page, key, { get: () => getter.call(page) })
  return page
}
function harness({ web = true, app = false } = {}) {
  let owner = 'account-a'
  const state = { phase: 'ended', callId: OLD, mode: 'audio', peer: { id: 2, name: '联系人' }, supported: true }
  const ended = [], accepted = [], mounted = [], unmounted = [], ticks = [], navigations = [], listeners = new Map()
  const uni = { getStorageSync: () => owner, $on: (key, fn) => listeners.set(key, fn), $off: key => listeners.delete(key),
    navigateBack: () => navigations.push('back'), redirectTo: () => navigations.push('redirect'), showToast() {} }
  const context = { voiceCallState: state, webCallRingtoneState: {}, VoiceCallIcon: {}, ChatCachedAvatar: {},
    voiceCalls: { end: reason => ended.push({ reason, callId: state.callId }), accept: () => accepted.push(state.callId) },
    voiceCallMedia: { canPictureInPicture: () => false, showNativeVideo() {} },
    canRouteVoiceAudio: () => false, androidRealtimeAvailable: () => app, androidBackgroundMask: () => 1,
    webCallsAvailable: () => web, webCallNotificationsAvailable: () => false, ThemeManager: { getTheme: () => 'light' },
    mountCallVideo: id => mounted.push(id), unmountCallVideo: id => unmounted.push(id),
    uni, getCurrentPages: () => [{ route: 'pages-nonTheme/chatlist' }, { route: 'pages-nonTheme/voice-call' }],
    setInterval: () => 1, clearInterval() {}, Date, VOICE_END_LABELS: {} }
  const component = loadComponent('../src/pages-nonTheme/voice-call.vue', context)
  const page = bind(component)
  page.$nextTick = fn => ticks.push(fn)
  component.onLoad.call(page, {})
  component.onShow.call(page)
  const move = (phase, id = NEW, patch = {}) => {
    Object.assign(state, { phase, callId: id }, patch)
    component.watch['state.callId'].call(page, id)
    component.watch['state.phase'].call(page)
  }
  return { component, page, state, move, ended, accepted, mounted, unmounted, ticks, navigations,
    owner: value => { owner = value }, flush: () => { while (ticks.length) ticks.shift()() } }
}
for (const platform of [{ web: true }, { web: false, app: true }]) {
  const h = harness(platform)
  h.move('incoming')
  assert.equal(h.page.pageCallId, NEW, 'a visible ended page adopts the new incoming call')
  h.component.onHide.call(h.page)
  h.component.onUnload.call(h.page)
  assert.equal(h.ended.length, 0, 'navigating out leaves incoming ringing and available to reopen')
}
{
  const h = harness({ web: false })
  h.page.back()
  h.move('incoming')
  h.component.onHide.call(h.page)
  h.component.onUnload.call(h.page)
  assert.equal(h.page.pageCallId, OLD)
  assert.equal(h.ended.length, 0, 'old page teardown cannot reject an incoming call that arrived during navigation')
  assert.ok(h.unmounted.every(id => id === OLD), 'old page only unmounts its own video')
}
{
  const h = harness()
  h.move('incoming')
  assert.equal(h.component.onBackPress.call(h.page), false)
  h.component.onUnload.call(h.page)
  assert.equal(h.ended.length, 0, 'back preserves ringing on supported clients')
  h.component.onShow.call(h.page)
  h.page.accept()
  assert.deepEqual(h.accepted, [NEW])
  h.page.end('rejected')
  assert.deepEqual(h.ended, [{ callId: NEW, reason: 'rejected' }], 'only explicit rejection rejects the new call')
}
{
  const h = harness({ web: false })
  h.move('incoming')
  h.component.onUnload.call(h.page)
  assert.deepEqual(h.ended, [{ callId: NEW, reason: 'rejected' }], 'clients without minimize still clean up their owned call')
}
{
  const h = harness()
  h.move('connecting', NEW, { mode: 'video', cameraSupported: true, cameraEnabled: true })
  h.page.back()
  h.flush()
  assert.equal(h.mounted.length, 0, 'queued video mounts cannot run after navigation starts')
  h.owner('account-b')
  h.page.accept(); h.page.end('hangup')
  assert.equal(h.ended.length + h.accepted.length, 0, 'stale page actions do not affect another account')
}
for (const phase of ['incoming', 'calling', 'connecting', 'connected', 'ended']) {
  const state = { phase, mode: 'video', peer: { name: '联系人' }, supported: true }
  const context = { voiceCallState: state, liveLocationState: { phase: 'idle' }, ManifestIcon: {},
    androidRealtimeAvailable: () => false, webCallsAvailable: () => true, webLocationAvailable: () => false,
    miniLocationAvailable: () => false, webCallNotificationsAvailable: () => false }
  const component = loadComponent('../src/components/RealtimeActivityEntry.vue', context)
  const entry = bind(component)
  entry.showLocation = true; entry.showNotificationSetting = false
  assert.equal(entry.callActive, phase !== 'ended')
  assert.equal(Boolean(entry.hasEntries), phase !== 'ended', `${phase} entry visibility`)
  if (phase === 'incoming') assert.equal(entry.callTitle, '视频来电')
}
{
  const h = harness()
  h.move('calling', NEW, { mode: 'video', cameraSupported: true, cameraEnabled: true, remoteCameraEnabled: true })
  assert.equal(h.page.videoActive, false, 'the camera is not shown before preview is ready')
  h.state.outgoingPreview = true
  assert.equal(h.page.videoActive, true)
  assert.equal(h.page.mainIsLocal, true)
  assert.equal(h.page.remoteVideoVisible, false, 'ringing shows only the caller')
  h.page.tapVideo(true)
  assert.equal(h.page.videoControlsHidden, false, 'cancel stays visible while ringing')
}
{
  const h = harness()
  h.move('connected', NEW, { mode: 'video', cameraSupported: true, cameraEnabled: false, remoteCameraEnabled: false })
  assert.equal(h.page.videoActive, false)
  h.state.remoteScreenSharing = true
  assert.equal(h.page.videoActive, true, 'screen share renders even when both cameras are off')
  h.state.cameraEnabled = true
  h.page.selfIsMain = true
  assert.equal(h.page.mainIsLocal, false, 'remote shared content is the main view')
  h.page.tapVideo(true)
  assert.equal(h.page.videoControlsHidden, true)
  h.state.remoteScreenSharing = false
  assert.equal(h.page.mainIsLocal, true, 'stopping restores the previous camera layout')
}
console.log('PASS call page session ownership, navigation races, explicit rejection and active-call return entries')
