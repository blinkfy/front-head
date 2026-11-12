import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse } from '@vue/compiler-sfc'
import { shouldReturnFromCall } from '../src/utils/voice-call-core.mjs'

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
  const ended = [], accepted = [], mounted = [], unmounted = [], ticks = [], navigations = [], controls = [], toasts = [], listeners = new Map()
  const uni = { getStorageSync: () => owner, $on: (key, fn) => listeners.set(key, fn), $off: key => listeners.delete(key),
    navigateBack: () => navigations.push('back'), redirectTo: () => navigations.push('redirect'), showToast: value => toasts.push(value.title) }
  const context = { voiceCallState: state, webCallRingtoneState: {}, VoiceCallIcon: {}, ChatCachedAvatar: {},
    voiceCalls: { end: reason => ended.push({ reason, callId: state.callId }), accept: () => accepted.push(state.callId), control: value => controls.push(value) },
    voiceCallMedia: { canPictureInPicture: () => false, supportsScreenShare: () => app || web, showNativeVideo() {} },
    canRouteVoiceAudio: () => false, androidRealtimeAvailable: () => app, androidBackgroundMask: () => 1,
    webCallsAvailable: () => web, webCallNotificationsAvailable: () => false, ThemeManager: { getTheme: () => 'light' },
    mountCallVideo: id => mounted.push(id), unmountCallVideo: id => unmounted.push(id),
    uni, getCurrentPages: () => [{ route: 'pages-nonTheme/chatlist' }, { route: 'pages-nonTheme/voice-call' }],
    setInterval: () => 1, clearInterval() {}, Date, VOICE_END_LABELS: {}, shouldReturnFromCall }
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
  return { component, page, state, move, ended, accepted, mounted, unmounted, ticks, navigations, controls, toasts,
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
for (const mode of ['audio', 'video']) {
  const h = harness()
  h.move('connected', NEW, { mode, cameraSupported: true, cameraEnabled: false, remoteCameraEnabled: false, screenShareSupported: true })
  assert.equal(h.page.shareActionLabel, '共享屏幕')
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
for (const platform of [{ web: true }, { web: false, app: true }]) {
  for (const reason of ['hangup', 'cancelled', 'rejected', 'answered_elsewhere']) {
    const h = harness(platform)
    h.move('connected')
    h.move('ended', NEW, { reason })
    h.flush()
    assert.deepEqual(h.navigations, ['back'], `${reason} returns to chat on ${platform.app ? 'App' : 'H5'}`)
    assert.equal(h.ended.length, 0, 'returning after completion never sends another hangup')
  }
  for (const reason of ['connect_failed', 'permission_denied', 'disconnected', 'timeout', 'busy', 'failed', '']) {
    const h = harness(platform)
    h.move('connected')
    h.move('ended', NEW, { reason })
    h.flush()
    assert.deepEqual(h.navigations, [], `${reason || 'unknown'} remains visible for explanation`)
  }
}
{
  const h = harness()
  h.move('ended', NEW, { reason: 'hangup' })
  h.move('incoming', 'incoming_call_0003', { reason: '' })
  h.flush()
  assert.deepEqual(h.navigations, [], 'a new incoming call cancels a queued return from the previous call')
}
{
  const h = harness()
  h.move('connected')
  h.component.onHide.call(h.page)
  h.move('ended', NEW, { reason: 'hangup' })
  h.flush()
  assert.deepEqual(h.navigations, [], 'a hidden call page cannot pop another page')
  h.component.onShow.call(h.page)
  h.flush()
  assert.deepEqual(h.navigations, ['back'], 'returning from the native call surface skips normal completion')
}
{
  const h = harness()
  h.move('ended', NEW, { reason: 'hangup' })
  h.owner('another-account')
  h.flush()
  assert.deepEqual(h.navigations, [], 'a deferred return cannot change navigation after account switching')
}
for (const platform of [{ web: true }, { web: false, app: true }]) {
  const h = harness(platform)
  h.move('connected', NEW, { mode: 'audio', cameraEnabled: false, screenShareSupported: false })
  assert.equal(h.page.showScreenShare, true, 'capable clients retain a discoverable share entry during voice calls')
  h.page.toggleScreenShare()
  assert.equal(h.controls.length, 0, 'an unsupported peer is never sent a sharing command')
  assert.match(h.toasts.at(-1), /未协商屏幕共享/)
  h.state.screenShareSupported = true
  h.page.toggleScreenShare()
  assert.equal(h.controls.at(-1).screenSharing, true, 'voice screen sharing uses the same media control')
  h.state.phase = 'calling'
  assert.equal(h.page.showScreenShare, false, 'sharing is offered after connection')
}
console.log('PASS call page session ownership, navigation races, explicit rejection and active-call return entries')
