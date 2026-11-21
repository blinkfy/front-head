import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../../src/utils/app-offline-session.js', import.meta.url), 'utf8')
  .replace(/^import .*$/m, '').replace(/^export /gm, '')
const tokenFor = userId => `header.${Buffer.from(JSON.stringify({ userId })).toString('base64url')}.signature`

function fixture({ networkType = 'none', token = tokenFor(7), userId = 7, autoLogin = true } = {}) {
  const storage = new Map(Object.entries({ token, autoLogin, userInfo: { id: userId, avatar: 'cached-avatar' } }))
  const probes = [], destinations = [], rejectedTokens = []
  let networkListener, active = true
  const uni = {
    base64ToArrayBuffer: value => Uint8Array.from(Buffer.from(value, 'base64')).buffer,
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), getNetworkType: ({ success }) => success({ networkType }),
    onNetworkStatusChange: listener => { networkListener = listener }
  }
  const ctx = vm.createContext({ reactive: data => data, uni, setTimeout, clearTimeout })
  vm.runInContext(`${source}
    globalThis.api = { appOfflineSession, installAppOfflineSession, resumeRememberedAppSession,
      retryAppOfflineSession, appChatConnectionRestored, clearAppOfflineSession, getAppCachedProfile }`, ctx)
  const api = ctx.api
  api.installAppOfflineSession(() => new Promise((resolve, reject) => probes.push({ resolve, reject })), token => {
    rejectedTokens.push(token)
    storage.delete('token')
  })
  return {
    api, storage, probes, destinations, rejectedTokens,
    leaveLoginPage() { active = false },
    changeNetwork(type) { networkType = type; networkListener({ networkType, isConnected: type !== 'none' }) },
    resume: options => api.resumeRememberedAppSession({ options, isActive: () => active,
      setLoading() {}, navigate: offline => destinations.push(offline ? 'cached-home' : 'home') })
  }
}

const settle = () => new Promise(resolve => setImmediate(resolve))

{
  const f = fixture()
  assert.equal(await f.resume(), true)
  assert.deepEqual(f.destinations, ['cached-home'])
  assert.equal(f.probes.length, 0, 'cold start with no network makes no login request')
  assert.equal(f.api.getAppCachedProfile().id, 7)
  assert.equal(f.api.appOfflineSession.unavailable, true)
  f.changeNetwork('wifi')
  const reconnect = f.api.retryAppOfflineSession()
  assert.equal(f.api.retryAppOfflineSession(), reconnect)
  assert.equal(f.probes.length, 1, 'network event and pull to refresh share one validation')
  assert.equal(f.api.appOfflineSession.unavailable, true, 'cached mode stays active during validation')
  f.probes[0].resolve({ data: { id: 7, nickname: 'updated', points: 12 } })
  await reconnect
  assert.equal(f.api.appOfflineSession.unavailable, false)
  assert.equal(f.storage.get('userInfo').avatar, 'cached-avatar')
  assert.equal(f.storage.get('userInfo').points, 12)
  assert.equal(f.storage.get('token'), tokenFor(7))
}

for (const [state, options] of [
  [{ token: '' }], [{ autoLogin: false }], [{ userId: 2 }], [{ token: 'invalid' }], [{}, { manualLogin: '1' }]
]) {
  const f = fixture(state)
  assert.equal(await f.resume(options), false)
  assert.deepEqual(f.destinations, [])
  assert.equal(f.probes.length, 0)
}

{
  const f = fixture({ networkType: 'wifi' })
  const startup = f.resume()
  await settle()
  f.probes[0].resolve({ data: { id: 7, isAdmin: true } })
  assert.equal(await startup, true)
  assert.deepEqual(f.destinations, ['home'])
  assert.equal(f.api.appOfflineSession.unavailable, false)
  assert.equal(f.storage.get('isAdmin'), true)
}

{
  const f = fixture({ networkType: 'wifi' })
  const startup = f.resume()
  await settle()
  f.probes[0].reject({ networkUnavailable: true })
  await startup
  assert.deepEqual(f.destinations, ['cached-home'])
  f.api.appChatConnectionRestored()
  const retry = f.api.retryAppOfflineSession()
  f.probes[1].reject({ statusCode: 503 })
  await retry
  assert.equal(f.api.appOfflineSession.unavailable, true)
  assert.equal(f.storage.get('token'), tokenFor(7), 'transport and service errors preserve the session')
  const revalidate = f.api.retryAppOfflineSession()
  f.probes[2].reject({ statusCode: 401 })
  await revalidate
  assert.deepEqual(f.rejectedTokens, [tokenFor(7)])
  assert.equal(f.storage.has('token'), false)
}

{
  const f = fixture({ networkType: 'wifi' })
  const startup = f.resume()
  await settle()
  f.leaveLoginPage()
  f.probes[0].resolve({ data: { id: 7 } })
  await startup
  assert.deepEqual(f.destinations, [], 'an obsolete login page cannot redirect after its probe returns')
}

{
  const f = fixture({ networkType: 'wifi' })
  const startup = f.resume()
  await settle()
  f.changeNetwork('none')
  f.changeNetwork('4g')
  f.probes[0].reject({ networkUnavailable: true })
  await startup
  assert.equal(f.probes.length, 2, 'a network change during the first probe gets a fresh validation')
  const reconnect = f.api.retryAppOfflineSession()
  f.probes[1].resolve({ data: { id: 7 } })
  await reconnect
  assert.equal(f.api.appOfflineSession.unavailable, false)
}

{
  const f = fixture()
  await f.resume()
  f.changeNetwork('wifi')
  const reconnect = f.api.retryAppOfflineSession()
  f.storage.set('token', tokenFor(8))
  f.storage.set('userInfo', { id: 8 })
  f.api.clearAppOfflineSession()
  f.probes[0].reject({ code: 401 })
  await reconnect
  assert.deepEqual(f.rejectedTokens, [])
  assert.equal(f.api.getAppCachedProfile().id, 8)
}

{
  const f = fixture()
  await f.resume()
  f.changeNetwork('wifi')
  const firstReconnect = f.api.retryAppOfflineSession()
  f.changeNetwork('none')
  f.changeNetwork('4g')
  f.probes[0].reject({ networkUnavailable: true })
  await firstReconnect
  assert.equal(f.probes.length, 2, 'a more recent reconnect retries after the interrupted probe')
  const secondReconnect = f.api.retryAppOfflineSession()
  f.probes[1].resolve({ data: { id: 7 } })
  await secondReconnect
  assert.equal(f.api.appOfflineSession.unavailable, false)
}

console.log('PASS App offline startup, cached account isolation, reconnect validation and explicit session rejection')
