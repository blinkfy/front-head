import assert from 'node:assert/strict'
import { createAppVersionGuard, APP_UPGRADE_PAGE } from '../src/utils/app-version-guard-core.mjs'

const policy = (overrides = {}) => ({
  versionName: '3.0.0', minSupportedVersion: '1.0.0', message: '更新后继续使用', checkIntervalMs: 60000,
  downloads: { android: '/files/app.apk', ios: '' }, url: '',
  features: {
    booking: { name: '预约', minVersion: '2.0.0', pages: ['^pages-nonTheme/booking$'], requests: [{ path: '^/api/booking/' }] },
    chat: { name: '聊天', minVersion: '1.0.0', pages: ['^pages-nonTheme/chat$'], requests: [{ path: '^/api/chat/' }] }
  },
  ...overrides
})

function harness({ version = '1.5.0', platform = 'android', baseUrl = 'https://api.example.test', policyData = policy(), requestFailure = false } = {}) {
  const interceptors = new Map(), navigation = [], modals = [], toasts = [], opened = [], rawCalls = []
  let lastSocketTask = null
  let currentRoute = 'pages-nonTheme/home', currentPolicy = policyData, failPolicy = requestFailure
  const runtime = {
    addInterceptor(name, value) { const list = interceptors.get(name) || []; list.push(value); interceptors.set(name, list) },
    request(options) {
      rawCalls.push(['request', options])
      if (failPolicy) { options.fail?.({ errMsg: 'offline' }); return }
      options.success?.({ statusCode: 200, data: { code: 0, data: currentPolicy } })
    },
    uploadFile(options) { rawCalls.push(['uploadFile', options]); return { abort() {} } },
    connectSocket(options) {
      const task = { sent: [], onMessage(handler) { this.listener = handler }, send(data) { this.sent.push(data) }, close() { this.closed = true } }
      for (const interceptor of interceptors.get('connectSocket') || []) interceptor.invoke(options)
      task.options = options
      lastSocketTask = task
      return task
    },
    navigateTo(options) { navigation.push(['navigateTo', options]); options.success?.({}); return Promise.resolve() },
    redirectTo(options) { navigation.push(['redirectTo', options]); return Promise.resolve() },
    reLaunch(options) { navigation.push(['reLaunch', options]); options.complete?.({}); return Promise.resolve() },
    switchTab(options) { navigation.push(['switchTab', options]); return Promise.resolve() },
    navigateBack(options) { navigation.push(['navigateBack', options]) },
    showModal(options) { modals.push(options); options.complete?.({}) },
    showToast(options) { toasts.push(options) },
    currentRoute: () => currentRoute, pageCount: () => 1, homeUrl: () => '/pages/home/home'
  }
  const guard = createAppVersionGuard({ runtime, baseUrl, version, platform, openURL: url => opened.push(url) })
  guard.install()
  const intercept = (name, hook) => (interceptors.get(name) || []).find(item => item[hook])
  return { guard, runtime, interceptors, navigation, modals, toasts, opened, rawCalls, intercept,
    get rawSocketTask() { return lastSocketTask },
    setPolicy(value) { currentPolicy = value }, failPolicy(value) { failPolicy = value }, setRoute(value) { currentRoute = value } }
}

async function refresh(guard) { await guard.refresh({ force: true }) }

async function main() {
  const h = harness()
  await refresh(h.guard)

  const own = { url: 'https://api.example.test/api/booking/types', header: { Existing: 'yes' } }
  h.intercept('request', 'invoke').invoke(own)
  assert.deepEqual(own.header, { Existing: 'yes', 'X-FTX-Client': 'app', 'X-FTX-Version': '1.5.0', 'X-FTX-OS': 'android' },
    'App metadata is attached to first-party HTTP requests and preserves existing headers')
  const thirdParty = { url: 'https://maps.example.test/api/booking/types', header: {} }
  h.intercept('request', 'invoke').invoke(thirdParty)
  assert.deepEqual(thirdParty.header, {}, 'third-party requests receive no App metadata')
  const upload = { url: 'https://api.example.test/api/booking/photos', header: { Authorization: 'token' } }
  h.intercept('uploadFile', 'invoke').invoke(upload)
  assert.equal(upload.header['X-FTX-Client'], 'app', 'uploads carry the same first-party metadata')
  const stringUpgrade = JSON.stringify({ code: 'APP_UPGRADE_REQUIRED', msg: '功能升级', data: { scope: 'feature', feature: 'booking', minVersion: '2.0.0', url: '/files/app.apk' } })
  h.intercept('request', 'success').success({ data: stringUpgrade }, own)
  h.intercept('uploadFile', 'success').success({ data: stringUpgrade }, upload)
  assert.equal(h.modals.length, 2, 'stringified 426 responses from request and upload are parsed')
  assert.equal(h.navigation.filter(([type]) => type === 'reLaunch').length, 0, 'feature 426 does not force the global page')
  const modalCount = h.modals.length
  h.intercept('request', 'success').success({ data: JSON.stringify({ code: 'APP_UPGRADE_REQUIRED', msg: '外部服务响应', data: { scope: 'global' } }) }, thirdParty)
  assert.equal(h.modals.length, modalCount, 'third-party 426 responses do not trigger the app upgrade guard')

  const task = h.runtime.connectSocket({ url: 'https://api.example.test/ws/ai/chat?token=secret&ftxVersion=stale' })
  assert.equal(task, h.rawSocketTask, 'connectSocket returns the original SocketTask object')
  assert.equal(task.options.url, 'https://api.example.test/ws/ai/chat?token=secret&ftxClient=app&ftxVersion=1.5.0&ftxOS=android',
    'first-party socket URL gets current App metadata, replacing stale metadata')
  const delivered = []
  task.onMessage(event => delivered.push(event))
  task.listener({ data: JSON.stringify({ type: 'error', code: 'APP_UPGRADE_REQUIRED', data: { scope: 'feature', feature: 'booking', minVersion: '2.0.0', url: '/files/app.apk' } }) })
  assert.equal(delivered.length, 1, 'upgrade handling preserves normal socket message delivery')
  assert.equal(h.navigation.filter(([type]) => type === 'reLaunch').length, 0, 'feature websocket 426 does not force the global page')
  assert.equal(task.sent.length, 0, 'SocketTask send contract remains available and unmodified')
  assert.equal(task.closed, undefined, 'upgrade handling does not replace or close the SocketTask')

  const callbackError = { code: 'APP_UPGRADE_REQUIRED', errMsg: 'navigateTo:fail app upgrade required' }
  let failed, completed
  await h.runtime.navigateTo({ url: '/pages-nonTheme/booking', fail: error => { failed = error }, complete: error => { completed = error } })
  assert.deepEqual(failed, callbackError)
  assert.deepEqual(completed, callbackError)
  assert.equal(h.navigation.filter(([type]) => type === 'navigateTo').length, 0, 'below-minimum feature page is intercepted')
  let promiseError
  try { await h.runtime.navigateTo({ url: '/pages-nonTheme/booking' }) } catch (error) { promiseError = error }
  assert.equal(promiseError?.code, 'APP_UPGRADE_REQUIRED', 'promise-style navigation is rejected for blocked pages')
  await h.runtime.navigateTo({ url: '/pages-nonTheme/home' })
  assert.equal(h.navigation.filter(([type]) => type === 'navigateTo').length, 1, 'unconfigured pages remain navigable')
  await h.runtime.navigateTo({ url: '/pages-nonTheme/chat' })
  assert.equal(h.navigation.filter(([type]) => type === 'navigateTo').length, 2, 'supported feature pages remain navigable')

  const ios = harness({ platform: 'ios', policyData: policy({ minSupportedVersion: '2.0.0' }) })
  await refresh(ios.guard)
  assert.equal(ios.guard.getState().downloadUrl, '', 'iOS without an iOS URL never falls back to the Android APK')
  ios.guard.download()
  assert.equal(ios.opened.length, 0)
  assert.match(ios.toasts.at(-1).title, /暂无适用/)

  const global = harness({ policyData: policy({ minSupportedVersion: '2.0.0' }) })
  await refresh(global.guard)
  assert.equal(global.guard.getState().blocked.data.scope, 'global')
  global.setPolicy(policy({ minSupportedVersion: '1.0.0' }))
  await global.guard.refresh({ force: true })
  assert.equal(global.guard.getState().blocked, null, 'policy rollback releases a prior global block')
  global.failPolicy(true)
  const failOpen = harness({ requestFailure: true })
  assert.equal(await failOpen.guard.ensure({ page: '/pages-nonTheme/booking' }), true,
    'failed policy retrieval alone does not classify the client as outdated')
  assert.equal(failOpen.navigation.length, 0, 'policy retrieval failure does not navigate away')

  const stale = harness({ policyData: policy({ minSupportedVersion: '1.0.0' }) })
  await refresh(stale.guard)
  const staleTask = stale.runtime.connectSocket({ url: 'https://api.example.test/ws/chat/events?token=secret' })
  staleTask.onMessage(() => {})
  staleTask.listener({ data: JSON.stringify({ type: 'error', code: 'APP_UPGRADE_REQUIRED', data: {
    scope: 'global', minVersion: '2.0.0', url: '/files/app.apk'
  } }) })
  assert.equal(stale.guard.getState().blocked.data.minVersion, '2.0.0', 'server 426 overrides a stale lower local threshold')
  assert.equal(stale.navigation.at(-1)[0], 'reLaunch', 'global websocket 426 opens the dedicated upgrade page')
  assert.equal(stale.navigation.at(-1)[1].url, APP_UPGRADE_PAGE)
  let staleNavFailure
  await stale.runtime.navigateTo({ url: '/pages-nonTheme/home', fail: error => { staleNavFailure = error } })
  assert.equal(staleNavFailure?.code, 'APP_UPGRADE_REQUIRED', 'cached lower policy cannot bypass a known global 426')
  stale.setPolicy(policy({ minSupportedVersion: '1.0.0' }))
  await stale.guard.refresh({ force: true })
  assert.equal(stale.guard.getState().blocked, null, 'successful forced rollback refresh clears the global gate')
  await stale.runtime.navigateTo({ url: '/pages-nonTheme/home' })
  assert.equal(stale.navigation.filter(([type]) => type === 'navigateTo').length, 1, 'navigation resumes after verified rollback')

  const query = harness({ baseUrl: 'https://api.example.test/v1/' })
  assert.equal(query.guard.socketUrl('wss://api.example.test/v1/ws/chat/events?token=a'),
    'wss://api.example.test/v1/ws/chat/events?token=a&ftxClient=app&ftxVersion=1.5.0&ftxOS=android')
  assert.equal(query.guard.socketUrl('wss://other.example.test/ws/chat/events?token=a'), 'wss://other.example.test/ws/chat/events?token=a',
    'third-party socket URLs remain unchanged')

  console.log('App version guard checks passed (metadata, HTTP/upload, WebSocket, navigation, rollback/failure, iOS fallback)')
}

main().catch(error => { console.error(error?.stack || error); process.exitCode = 1 })
