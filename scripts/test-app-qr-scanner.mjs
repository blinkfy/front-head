import assert from 'node:assert/strict'
import { createAppQrScanner } from '../src/utils/app-qr-scanner-core.mjs'

const code = { scanType: 'WX_CODE', rawBase64: Buffer.from('opaque-native-payload').toString('base64') }
const id = 'r_' + 'a'.repeat(24)
function harness(overrides = {}) {
  const events = []; let token = 'jwt-current'
  const api = { nativeScan: async () => code, standardScan: async () => ({ result: 'standard' }),
    resolveRaw: async () => ({ data: { kind: 'registration', sessionId: id } }),
    scanApp: async () => events.push('scan'), authorizeApp: async () => events.push('authorize'),
    cancelApp: async () => events.push('cancel'), getToken: () => token, getAccount: () => '昵称',
    confirm: async () => { events.push('confirm'); return true }, fallback: async () => false,
    notify: message => events.push(message), ...overrides }
  return { scanner: createAppQrScanner(api), events, setToken: value => { token = value } }
}
const normal = harness({ nativeScan: async () => ({ scanType: 'QR_CODE', result: 'normal' }) })
assert.equal((await normal.scanner.scan()).result, 'normal'); assert.deepEqual(normal.events, [])
const login = harness(); assert.equal(await login.scanner.scan(), null)
assert.deepEqual(login.events.slice(0, 3), ['scan', 'confirm', 'authorize'])
const cancel = harness({ confirm: async () => false }); await cancel.scanner.scan()
assert.deepEqual(cancel.events, ['scan', 'cancel'])
const changed = harness({ confirm: async () => { changed.setToken('different'); return true } })
await changed.scanner.scan(); assert(!changed.events.includes('authorize'))
const expired = harness({ resolveRaw: async () => { throw new Error('已过期') }, fallback: async () => true })
assert.equal((await expired.scanner.scan()).result, 'standard')
for (const error of ['UNAVAILABLE', 'UNSUPPORTED', 'USE_STANDARD']) {
  const test = harness({ nativeScan: async () => ({ error }) }); assert.equal((await test.scanner.scan()).result, 'standard')
}
const denied = harness({ getToken: () => '' }); await denied.scanner.scan(); assert(!denied.events.includes('scan'))
const stale = harness({ resolveRaw: async () => { throw { code: 401 } }, fallback: async () => { throw new Error('must not open fallback over login') } })
assert.equal(await stale.scanner.scan(), null); assert(stale.events.some(value => value.includes('登录状态已失效')))
const device = harness({ resolveRaw: async () => ({ data: { kind: 'device', token: 'a'.repeat(32) } }) })
assert.equal((await device.scanner.scan()).path, '/pages-nonTheme/scan?scene=' + 'a'.repeat(32))
for (const statusCode of [404, 405, 501]) {
  let message
  const legacy = harness({ resolveRaw: async () => { throw { statusCode } },
    fallback: async value => { message = value; return true } })
  assert.equal((await legacy.scanner.scan()).result, 'standard')
  assert(message.includes(`HTTP ${statusCode}`)); assert(message.includes('服务器未提供解析接口'))
  assert(!legacy.events.includes('scan')); assert(!legacy.events.includes('authorize'))
}
for (const nested of [false, true]) {
  for (const useFallback of [false, true]) {
    let message
    const reason = { reason: 'ROUND_CODE_UNSUPPORTED' }
    const disabled = harness({ resolveRaw: async () => { throw { statusCode: 501, ...(nested ? { data: reason } : reason) } },
      fallback: async value => { message = value; return useFallback } })
    assert.equal((await disabled.scanner.scan())?.result || null, useFallback ? 'standard' : null)
    assert(message.includes('无法还原其业务参数')); assert(!message.includes('更新后端'))
    assert(!disabled.events.includes('scan')); assert(!disabled.events.includes('authorize'))
  }
}
const aborted = harness({ nativeScan: async () => ({ error: 'CANCELLED' }) }); assert.equal(await aborted.scanner.scan(), null); assert.deepEqual(aborted.events, [])
let release
const busy = harness({ nativeScan: () => new Promise(resolve => { release = resolve }) })
const first = busy.scanner.scan(); assert.equal(await busy.scanner.scan(), null); release(null); await first
console.log('PASS APP native/standard dispatch, confirmation/cancel, account switch, expiry, fallback and single-flight')
