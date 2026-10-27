import assert from 'node:assert/strict'
import { createWebRoundCodeResolver } from '../src/utils/h5-roundcode-core.mjs'

function fixture(data, confirm = true) {
  let token = 'login-token', active = true
  const calls = []
  const options = {
    getToken: () => token, getAccount: () => '测试用户',
    resolveImage: async (image, auth) => { calls.push(['image', image, auth]); return { data } },
    scanApp: async id => calls.push(['scan', id]),
    authorizeApp: async id => calls.push(['authorize', id]),
    cancelApp: async id => calls.push(['cancel', id]),
    confirm: async () => confirm, notify: message => calls.push(['notify', message])
  }
  return { options, calls, run: () => createWebRoundCodeResolver(options)('image', () => active),
    setToken: value => { token = value }, close: () => { active = false } }
}
const device = fixture({ kind: 'device', token: 'a'.repeat(32) })
assert.equal((await device.run()).path, '/pages-nonTheme/scan?scene=' + 'a'.repeat(32))
assert.equal(device.calls.length, 1)
const id = 'r_' + 'b'.repeat(24)
const login = fixture({ kind: 'registration', sessionId: id })
assert.equal((await login.run()).handled, true)
assert.equal(login.calls.filter(call => call[0] === 'authorize').length, 1)
const declined = fixture({ kind: 'registration', sessionId: id }, false)
assert.equal((await declined.run()).errMsg, 'scanCode:cancel')
assert.equal(declined.calls.some(call => call[0] === 'authorize'), false)
assert.equal(declined.calls.some(call => call[0] === 'cancel'), true)
for (const bad of [{ kind: 'device', token: 'bad' }, { kind: 'registration', sessionId: 'unknown' }, { kind: 'foreign' }]) {
  await assert.rejects(fixture(bad).run, /此圆码暂不支持/)
}
const guest = fixture({}); guest.setToken('')
await assert.rejects(guest.run, /请先登录/)
assert.equal(guest.calls.length, 0)
for (const condition of ['close', 'switch']) {
  const test = fixture({ kind: 'registration', sessionId: id })
  test.options.resolveImage = async () => {
    if (condition === 'close') test.close(); else test.setToken('another-token')
    return { data: { kind: 'registration', sessionId: id } }
  }
  assert.equal(await test.run(), null)
  assert.equal(test.calls.length, 0)
}
const afterConfirm = fixture({ kind: 'registration', sessionId: id })
afterConfirm.options.confirm = async () => { afterConfirm.setToken('changed'); return true }
assert.equal(await afterConfirm.run(), null)
assert.equal(afterConfirm.calls.some(call => call[0] === 'authorize'), false)
console.log('PASS web round-code scene validation, login confirmation/cancel, guest, account switch and closed-page guards')
