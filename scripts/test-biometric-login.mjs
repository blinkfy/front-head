import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createBiometricLoginManager, biometricErrorMessage } from '../src/utils/biometric-login-core.mjs'

function fixture({ accepted = true, supported = true, enrolled = true } = {}) {
  const storage = new Map([['token', 'session'], ['savedUser', { username: 'test', password: 'test-only' }]])
  const calls = [], confirmations = []
  let failure = null
  const runtime = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), confirm: async options => { confirmations.push(options); return accepted } }
  const native = async options => {
    calls.push(options)
    if (options.operation === 'capability') return { supported, enrolled, label: '面容登录' }
    if (options.operation === 'sign' && failure) throw failure
    return options.operation === 'create' ? { publicKey: 'public-test-key' } : { signature: 'test-signature' }
  }
  const requests = []
  const api = async (path, body, token, method) => {
    requests.push({ path, body, token, method })
    if (path.endsWith('/options')) return { data: { credentialId: '00000000-0000-4000-8000-000000000001', challengeId: 'test-challenge', payload: 'test-payload' } }
    if (path === '/biometric/enrollment/finish') return { data: { userId: 1, username: 'test' } }
    if (path === '/biometric/login/finish') return { token: 'new-session' }
    return {}
  }
  return { storage, calls, confirmations, requests, runtime, native, api,
    fail: value => { failure = value }, manager: createBiometricLoginManager({ runtime, native, api, scope: 'https://one.test' }) }
}
const user = { id: 1, username: 'test' }
const enabled = fixture()
assert.equal(enabled.manager.state().enabled, true)
await enabled.manager.afterLogin('session', user)
assert.equal(enabled.confirmations.length, 1)
enabled.storage.set('savedUser', { username: 'test', password: 'test-only' })
await enabled.manager.afterLogin('session', user)
assert.equal(enabled.storage.has('savedUser'), false, 'later password login also clears remembered plaintext password')
assert.equal(enabled.manager.state().prompted, true)
assert.equal(enabled.storage.has('savedUser'), false)
assert.ok(enabled.manager.state().credentialId)
await enabled.manager.afterLogin('session', user)
assert.equal(enabled.confirmations.length, 1)
assert.equal((await enabled.manager.login()).token, 'new-session')
enabled.fail({ error: 'CANCELLED' })
await assert.rejects(enabled.manager.login(), error => error.error === 'CANCELLED')
assert.ok(enabled.manager.state().credentialId, 'user cancellation does not destroy authorization')
enabled.fail({ error: 'KEY_INVALID' })
await assert.rejects(enabled.manager.login())
assert.equal(enabled.manager.state().credentialId, '')
assert.equal(biometricErrorMessage({ error: 'CANCELLED' }), '')

const declined = fixture({ accepted: false })
await declined.manager.afterLogin('session', user)
await declined.manager.afterLogin('session', user)
assert.equal(declined.confirmations.length, 1)
assert.equal(declined.manager.state().enabled, false)
assert.equal(declined.calls.some(call => call.operation === 'sign'), false)
await declined.manager.setEnabled(true, 'session', user)
assert.ok(declined.manager.state().credentialId)
await declined.manager.setEnabled(false, 'session', user)
assert.equal(declined.manager.state().enabled, false)
assert.equal(declined.manager.state().credentialId, '')
assert.equal(declined.requests.at(-1).method, 'DELETE')
for (const config of [{ supported: false }, { enrolled: false }]) {
  const unavailable = fixture(config)
  await unavailable.manager.afterLogin('session', user)
  assert.equal(unavailable.confirmations.length, 0)
  assert.equal(unavailable.manager.state().prompted, false)
}
const stale = fixture()
await stale.manager.afterLogin('stale-session', user)
assert.equal(stale.confirmations.length, 0)
const interrupted = fixture()
let active = true
const interruptedNative = async options => {
  const result = await interrupted.native(options)
  if (options.operation === 'sign') active = false
  return result
}
const interruptedManager = createBiometricLoginManager({ runtime: interrupted.runtime, native: interruptedNative, api: interrupted.api, scope: 'https://two.test' })
await assert.rejects(interruptedManager.setEnabled(true, 'session', user, () => active))
assert.equal(interruptedManager.state().credentialId, undefined)
assert.ok(interrupted.calls.some(call => call.operation === 'delete'), 'incomplete enrollment removes its orphan private key')
assert.equal(createBiometricLoginManager({ runtime: enabled.runtime, native: enabled.native, api: enabled.api, scope: 'https://another.test' }).state().credentialId, undefined)

// Exercise the actual login-page controller with a tiny lifecycle adapter.
const composable = readFileSync(new URL('../src/utils/use-biometric-login.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace('export function ', 'function ')
async function pageFixture({ state, token = '', autoLogin = true, probe, loginResult, loginError, probeWait, onLoginWait, platform = 'app', capabilityWait, support = { supported: true, enrolled: true, label: '指纹登录' } } = {}) {
  let attempts = 0, navigations = 0, cancel = 0, disposed, hidden, shown
  const context = { ref: value => ({ value }), nextTick: async () => {}, quickLoginPlatform: platform, onBeforeUnmount: fn => { disposed = fn },
    onHide: fn => { hidden = fn }, onShow: fn => { shown = fn },
    biometricErrorMessage, biometricApi: async () => { await probeWait; if (probe instanceof Error || probe?.code) throw probe; return probe },
    biometricLogin: { state: () => state, capability: async () => { await capabilityWait; return support },
      cancel: () => { cancel++ }, login: async () => { attempts++; if (loginError) throw loginError; return loginResult }, afterLogin: async () => {} },
    uni: { getStorageSync: key => key === 'token' ? token : autoLogin, removeStorageSync: () => { token = '' }, showToast() {} } }
  vm.runInNewContext(composable + '\nglobalThis.use = useBiometricLogin', context)
  const loading = { value: false }
  const controller = context.use({ loading, onLogin: async () => { navigations++; await onLoginWait } })
  return { controller, loading, counts: () => ({ attempts, navigations, cancel }), dispose: () => disposed(), hide: () => hidden(), show: () => shown() }
}
const bound = { enabled: true, credentialId: 'key' }
const resumed = await pageFixture({ state: bound, token: 'session', probe: { data: { id: 1 } } })
assert.equal(await resumed.controller.prefer(), true)
assert.deepEqual(resumed.counts(), { attempts: 0, navigations: 1, cancel: 0 })
const unauthenticated = await pageFixture({ state: bound, loginResult: { token: 'new' } })
await unauthenticated.controller.prefer(); await unauthenticated.controller.prefer()
assert.equal(unauthenticated.counts().attempts, 1)
const cancelled = await pageFixture({ state: bound, loginError: { error: 'CANCELLED' } })
assert.equal(await cancelled.controller.prefer(), true)
assert.equal(cancelled.loading.value, false)
assert.equal(cancelled.counts().navigations, 0)
cancelled.dispose()
assert.equal(cancelled.counts().cancel, 1)
const expired = await pageFixture({ state: bound, token: 'old', probe: { code: 401 }, loginResult: { token: 'new' } })
await expired.controller.prefer()
assert.equal(expired.counts().attempts, 1)
const offline = await pageFixture({ state: bound, token: 'old', probe: new Error('offline') })
assert.equal(await offline.controller.prefer(), true)
assert.equal(offline.counts().attempts, 0)
const disabled = await pageFixture({ state: { enabled: false } })
assert.equal(await disabled.controller.prefer(), false)
const pending = await pageFixture({ state: { enabled: true, prompted: true }, token: 'session', probe: { data: { id: 1 } } })
await pending.controller.prefer()
assert.equal(pending.counts().navigations, 1, 'pending authorization still reuses a valid remembered session')
const pendingExpired = await pageFixture({ state: { enabled: true, prompted: true } })
assert.equal(await pendingExpired.controller.prefer(), true, 'pending authorization stays on manual login without saved-password bypass')
assert.equal(pendingExpired.counts().attempts, 0)
const webPending = await pageFixture({ state: { enabled: true, prompted: true }, platform: 'web' })
assert.equal(await webPending.controller.prefer(), false, 'web authorization pending without a credential keeps the existing auto-login path')
assert.equal(webPending.counts().attempts, 0)
let releaseProbe
const hidden = await pageFixture({ state: bound, token: 'session', probe: { data: { id: 1 } },
  probeWait: new Promise(resolve => { releaseProbe = resolve }) })
const hiddenRequest = hidden.controller.prefer()
hidden.hide(); hidden.show(); releaseProbe()
await hiddenRequest
assert.equal(hidden.counts().navigations, 0, 'a hidden page cannot complete a stale login even after it becomes visible again')
let releaseCapability
const staleCapability = await pageFixture({ state: bound, platform: 'web', support: { supported: false, enrolled: false },
  capabilityWait: new Promise(resolve => { releaseCapability = resolve }) })
const staleCapabilityRequest = staleCapability.controller.prefer()
await new Promise(resolve => setImmediate(resolve))
staleCapability.hide(); staleCapability.show(); releaseCapability()
assert.equal(await staleCapabilityRequest, true, 'an old capability check must not resume fallback login after leaving the page')
assert.equal(staleCapability.counts().attempts, 0)
const unsupportedWeb = await pageFixture({ state: bound, platform: 'web', support: { supported: false, enrolled: false } })
assert.equal(await unsupportedWeb.controller.prefer(), false, 'a current unsupported browser still keeps its original login flow')
let releaseHandoff
const handingOff = await pageFixture({ state: bound, token: 'session', probe: { data: { id: 1 } },
  onLoginWait: new Promise(resolve => { releaseHandoff = resolve }) })
const handoffRequest = handingOff.controller.prefer()
await new Promise(resolve => setImmediate(resolve))
assert.equal(handingOff.counts().navigations, 1)
handingOff.hide()
assert.equal(handingOff.loading.value, true, 'page-hide during successful navigation must keep the login page covered')
releaseHandoff(); await handoffRequest

// Real uni conditional preprocessing + SFC compilation verifies platform adapters and shared composable.
const require = createRequire(import.meta.url)
const { initPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context.js')
const { preJs, preHtml } = require('@dcloudio/uni-cli-shared/dist/preprocess/index.js')
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
for (const platform of ['app', 'h5', 'mp-weixin']) {
  initPreContext(platform)
  const bridge = preJs(readFileSync(new URL('../src/utils/biometric-login.js', import.meta.url), 'utf8'))
  assert.equal(bridge.includes("from '@/uni_modules/ftx-biometric-login'"), platform === 'app')
  const quickLogin = preJs(readFileSync(new URL('../src/utils/quick-login.js', import.meta.url), 'utf8'))
  assert.equal(quickLogin.includes("import { biometricLogin } from './biometric-login.js'"), platform === 'app')
  assert.equal(quickLogin.includes("from './passkey-client-core.mjs'"), platform === 'h5')
  assert.equal(quickLogin.includes("from './soter-client-core.mjs'"), platform === 'mp-weixin')
  for (const file of ['src/pages/index/index.vue', 'src/pages-dark/index/index.vue', 'src/pages/change-password/change-password.vue',
    'src/pages-dark/change-password/change-password.vue', 'src/pages-nonTheme/account-security.vue', 'src/components/H5LoginShell.vue']) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(preJs(preHtml(source)), { filename: file })
    assert.deepEqual(errors, [], `${platform} ${file} parse`)
    const script = compileScript(descriptor, { id: 'biometric-check' })
    const template = compileTemplate({ source: descriptor.template.content, filename: file, id: 'biometric-check', compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [], `${platform} ${file} template`)
    if (['src/pages/index/index.vue', 'src/pages-dark/index/index.vue'].includes(file)) {
      assert.ok(script.content.includes('use-biometric-login.js'), `${platform} ${file} uses the shared login controller`)
    }
  }
}
console.log('Biometric frontend: one-time offer, settings, fallback, stale/failed enrollment, server isolation, session resume, auto-priority, cancellation, 3-platform SFC compilation passed.')
