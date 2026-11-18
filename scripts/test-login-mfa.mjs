import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { ref } = require('vue')
const component = await readFile(new URL('../src/components/MfaLoginPanel.vue', import.meta.url), 'utf8')
const script = component.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const composable = (await readFile(new URL('../src/utils/use-login-mfa.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace('export function', 'function')
const useLoginMfa = new Function('ref', composable + '\nreturn useLoginMfa')(ref)
function fixture({ quickAvailable = false, quickSupported = false, quickEnrolled = false } = {}) {
  const username = ref('previous-account'), password = ref('previous-password'), loading = ref(true), panel = ref(null)
  const flow = useLoginMfa({ panel, username, password, loading })
  const page = {}, calls = []
  let passwordRequest = async () => { throw new Error('密码错误') }
  const request = async (path, data) => { calls.push({ path, data }); return path === 'password' ? passwordRequest(data) : { data: { available: quickAvailable } } }
  const appScript = script.replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, '')
  const internals = new Function('ref', 'defineProps', 'defineEmits', 'defineExpose', 'onHide', 'onBeforeUnmount', 'getCurrentPages', 'mfaRequest', 'quickLogin', 'quickLoginPlatform', 'window', `${appScript}\nreturn { canQuick }`)(
    ref, () => ({}), () => (_event, ...args) => flow.onChange(...args), value => { panel.value = value },
    () => {}, () => {}, () => [page], request,
    { capability: async () => ({ supported: quickSupported, enrolled: quickEnrolled, label: '指纹登录' }),
      state: () => ({ enabled: true, userId: 7, credentialId: 'quick-key' }) }, 'app', { isSecureContext: false })
  return { ...flow, username, password, loading, panel, calls, canQuick: internals.canQuick, respond: callback => { passwordRequest = callback } }
}
const challenge = extra => ({ requiresMfa: true, mfaTicket: 'ticket-a', accountId: 7, accountName: '验证账号', ...extra })
const verified = extra => ({ token: 'verified-token', mfaVerified: true, accountId: 7, ...extra })
{
  const f = fixture(); let resolvePassword, rejectPassword
  f.respond(() => new Promise((resolve, reject) => { resolvePassword = resolve; rejectPassword = reject }))
  const pending = f.open(challenge({ mfaPasswordAvailable: true })); assert.equal(f.state.value.method, '')
  assert.equal(f.state.value.mfaTicket, 'ticket-a'); f.panel.value.selectExternal('password'); f.password.value = 'password'
  let submission = f.submitPassword()
  assert.equal(f.loading.value, true); assert.equal(f.state.value.busy, true)
  await Promise.resolve()
  assert.equal(f.loading.value, true)
  f.panel.value.showChoices(); assert.equal(f.state.value.method, 'password')
  rejectPassword(new Error('密码错误')); await submission
  assert.equal(f.loading.value, false); assert.equal(f.state.value.busy, false)
  assert.equal(f.state.value.error, '密码错误')
  submission = f.submitPassword()
  assert.equal(f.loading.value, true); assert.equal(f.state.value.busy, true)
  resolvePassword(verified()); await submission
  assert.equal((await pending).token, 'verified-token'); assert.equal(f.loading.value, true)
}
{
  const f = fixture(), pending = f.open(challenge({ mfaPasswordAvailable: true, mfaQrAvailable: true }))
  assert.equal(f.state.value.method, '')
  assert.equal(f.state.value.mfaTicket, 'ticket-a'); assert.equal(f.username.value, '验证账号'); assert.equal(f.loading.value, false)
  f.panel.value.showChoices(); assert.equal(f.state.value.method, ''); assert.equal(f.state.value.mfaTicket, 'ticket-a')
  f.panel.value.selectExternal('password')
  assert.equal(f.state.value.method, 'password'); assert.equal(f.state.value.mfaTicket, 'ticket-a'); assert.equal(f.password.value, '')
  f.password.value = 'wrong'; await f.submitPassword()
  assert.equal(f.state.value.error, '密码错误'); assert.equal(f.loading.value, false)
  assert.deepEqual(f.calls.find(call => call.path === 'password').data, { mfaTicket: 'ticket-a', password: 'wrong' })
  f.respond(async () => verified({ accountId: 99 })); await f.submitPassword()
  assert.equal(f.state.value.mfaTicket, 'ticket-a'); assert.equal(f.loading.value, false)
  f.respond(async () => verified()); await f.submitPassword()
  assert.equal((await pending).token, 'verified-token'); assert.equal(f.state.value, null); assert.equal(f.loading.value, true)
  assert.equal(f.username.value, 'previous-account'); assert.equal(f.password.value, 'previous-password')
}
{
  const f = fixture(), pending = f.open(challenge({ mfaQrAvailable: true }))
  assert.equal(f.state.value.method, ''); assert.equal(f.username.value, '验证账号'); assert.equal(f.loading.value, false)
  assert.equal(f.acceptQr(verified(), ''), false)
  assert.equal(f.acceptQr(verified(), 'old-ticket'), false)
  assert.equal(f.acceptQr(verified({ accountId: 99 }), 'ticket-a'), false)
  assert.equal(f.acceptQr(verified({ mfaVerified: false }), 'ticket-a'), false)
  assert.equal(f.panel.value.selectExternal('password'), false)
  f.panel.value.showChoices(); assert.equal(f.state.value.method, '')
  assert.equal(f.state.value.mfaTicket, 'ticket-a')
  assert.equal(f.acceptQr(verified(), 'ticket-a'), false)
  f.panel.value.selectExternal('qr'); assert.equal(f.acceptQr(verified(), 'ticket-a'), true)
  assert.equal((await pending).token, 'verified-token')
}
{
  const f = fixture(), pending = f.open(challenge({ mfaPasswordAvailable: true }))
  assert.equal(f.state.value.method, '')
  f.panel.value.showChoices(); assert.equal(f.state.value.mfaTicket, 'ticket-a')
  f.panel.value.cancel(); assert.equal(await pending, null)
  assert.equal(f.loading.value, false); assert.equal(f.username.value, 'previous-account')
}
{
  const f = fixture(); let resolvePassword
  f.respond(() => new Promise(resolve => { resolvePassword = resolve }))
  const old = f.open(challenge({ mfaPasswordAvailable: true })); f.panel.value.selectExternal('password'); f.password.value = 'password'
  const submission = f.submitPassword()
  const next = f.open(challenge({ mfaTicket: 'ticket-b', mfaQrAvailable: true }))
  assert.equal(await old, null)
  resolvePassword(verified()); await submission
  assert.equal(f.state.value.mfaTicket, 'ticket-b'); assert.equal(f.loading.value, false)
  f.panel.value.cancel(); assert.equal(await next, null)
}
for (const [available, expected] of [[true, true], [false, false]]) {
  const f = fixture({ quickAvailable: available, quickSupported: true, quickEnrolled: true })
  f.open(challenge())
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.canQuick.value, expected, `APP quick-login availability=${available} controls the MFA entry`)
  assert.ok(f.calls.some(call => call.path === 'quick/availability' && call.data.mfaTicket === 'ticket-a'),
    'APP quick-login availability is checked against the MFA ticket')
  f.panel.value.cancel()
}
console.log('PASS login MFA explicit method selection, password retry, account matching, QR ticket guards, APP quick availability, choices/cancel, and stale response checks')
