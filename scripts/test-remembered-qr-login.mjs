import assert from 'node:assert/strict'
import { resumeRememberedQrLogin } from '../src/utils/remembered-qr-login.mjs'

function harness(overrides = {}) {
  const storage = { rememberedQrLogin: true, autoLogin: true, token: 'existing-token' }
  const calls = { loads: 0, logins: [], loading: [], removals: [] }
  const runtime = {
    getStorageSync: key => storage[key],
    removeStorageSync(key) { calls.removals.push(key); delete storage[key] }
  }
  return {
    storage, calls, runtime,
    run: options => resumeRememberedQrLogin({ runtime,
      loadUser: async () => { calls.loads++; return { code: 0, data: { id: 7, isAdmin: true } } },
      onLogin: value => calls.logins.push(value),
      setLoading: value => calls.loading.push(value), ...overrides, ...options })
  }
}

{
  const h = harness()
  assert.equal(await h.run(), true)
  assert.equal(h.calls.loads, 1)
  assert.deepEqual(h.calls.logins, [{ code: 0, token: 'existing-token', userInfo: { id: 7, isAdmin: true }, isAdmin: true }])
  assert.deepEqual(h.calls.loading, [true, false, false])
  assert.deepEqual(h.calls.removals, [])
}
for (const storageChange of [
  { rememberedQrLogin: false }, { autoLogin: false }, { token: '' }
]) {
  const h = harness(); Object.assign(h.storage, storageChange)
  assert.equal(await h.run(), false)
  assert.equal(h.calls.loads, 0)
}
{
  const h = harness(); h.runtime.getStorageSync = key => key === 'rememberedQrLogin' ? true
    : key === 'autoLogin' ? true : key === 'token' ? null : undefined
  assert.equal(await h.run(), false)
  assert.equal(h.calls.loads, 0)
}
{
  const h = harness({ loadUser: async () => { h.calls.loads++; throw new Error('network') } })
  assert.equal(await h.run(), true)
  assert.deepEqual(h.calls.removals, ['rememberedQrLogin'])
  assert.deepEqual(h.calls.loading, [true, false])
  assert.deepEqual(h.calls.logins, [])
}
{
  const h = harness({ loadUser: async () => { h.calls.loads++; return { code: 500, data: null } } })
  assert.equal(await h.run(), true)
  assert.deepEqual(h.calls.removals, ['rememberedQrLogin'])
  assert.deepEqual(h.calls.logins, [])
}
{
  const h = harness({ loadUser: async () => ({ code: 0, data: {} }) })
  assert.equal(await h.run(), true)
  assert.deepEqual(h.calls.removals, ['rememberedQrLogin'])
  assert.deepEqual(h.calls.logins, [])
}
{
  const h = harness(); let resolveLoad
  const pending = h.run({ loadUser: () => new Promise(resolve => { resolveLoad = resolve }) })
  await Promise.resolve(); assert.deepEqual(h.calls.loading, [true])
  h.storage.token = 'new-account-token'
  resolveLoad({ code: 0, data: { id: 8, isAdmin: false } })
  assert.equal(await pending, true)
  assert.deepEqual(h.calls.logins, [])
  assert.deepEqual(h.calls.removals, [])
  assert.deepEqual(h.calls.loading, [true])
}
{
  const h = harness(); let active = true, resolveLoad
  const pending = h.run({ isActive: () => active, loadUser: () => new Promise(resolve => { resolveLoad = resolve }) })
  await Promise.resolve(); active = false
  resolveLoad({ code: 0, data: { id: 9 } })
  assert.equal(await pending, true)
  assert.deepEqual(h.calls.logins, [])
  assert.deepEqual(h.calls.loading, [true])
}
{
  const h = harness(); let finishLogin
  const pending = h.run({ onLogin: async () => {
    h.calls.loading.push(true)
    await new Promise(resolve => { finishLogin = resolve })
  } })
  while (!finishLogin) await Promise.resolve()
  assert.deepEqual(h.calls.loading, [true, false, true], 'helper must keep login loading set while async onLogin is pending')
  finishLogin()
  assert.equal(await pending, true)
  assert.deepEqual(h.calls.loading, [true, false, true, false])
}
for (const change of ['token', 'page']) {
  const h = harness(); let active = true, finishLogin
  const pending = h.run({ isActive: () => active, onLogin: async () => {
    h.calls.loading.push(true)
    await new Promise(resolve => { finishLogin = resolve })
  } })
  while (!finishLogin) await Promise.resolve()
  if (change === 'token') h.storage.token = 'next-account-token'
  else active = false
  finishLogin()
  assert.equal(await pending, true)
  assert.deepEqual(h.calls.loading, [true, false, true], change + ' must not let helper cleanup alter new UI')
}
console.log('PASS remembered QR login gates, restore, failures, account and page guards')
