import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { ref } = require('vue')
const component = await readFile(new URL('../../src/components/account/MfaLoginPanel.vue', import.meta.url), 'utf8')
const script = component.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const shell = await readFile(new URL('../../src/components/account/H5LoginShell.vue', import.meta.url), 'utf8')
const shellScript = shell.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
assert.match(shell, /mfa\?\.passwordFirst \? '账号登录' : mfa \? '验证并登录'/,
  'desktop account action is labeled as returning to login during password-first QR MFA')
assert.match(shell, /@submit="submitAccount"/,
  'desktop account action uses the guarded account-restart handler')
const lightPage = await readFile(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')
const darkPage = await readFile(new URL('../../src/pages-dark/index/index.vue', import.meta.url), 'utf8')
for (const [theme, page] of [['light', lightPage], ['dark', darkPage]]) {
  assert.match(page, /openMfa\(res,\s*\{\s*passwordFirst:\s*!isWechat\s*&&\s*!isBiometric\s*\}\)/,
    `${theme} login opens password MFA in bound-WeChat-first mode`)
  assert.match(page, /openMfa\(result,\s*\{\s*qrFirst:\s*true\s*\}\)/,
    `${theme} QR login opens MFA in password-first mode`)
}
const composable = (await readFile(new URL('../../src/utils/account/use-login-mfa.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace('export function', 'function')
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
function shellFixture({ mfa, loading = false } = {}) {
  const props = { dark: false, username: 'account', password: 'secret', showPassword: false, rememberMe: true,
    loading, showCaptcha: false, captchaInput: '', captchaHint: '', mfa }
  const events = [], exposed = {}
  const appScript = shellScript.replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, '').replace(/\/\/ #ifdef APP-PLUS[\s\S]*?\/\/ #endif/g, '')
  const internals = new Function('computed', 'nextTick', 'onMounted', 'onBeforeUnmount', 'ref', 'watch', 'onHide', 'onShow', 'onResize', 'defineProps', 'defineEmits', 'defineExpose', 'useH5RegistrationPolicy', `${appScript}\nreturn { selectMode, submitAccount, restartWechatLogin, mode, qrBusy, qrPanel }`)(
    require('vue').computed, async callback => callback(), () => {}, () => {}, ref, () => {}, () => {}, () => {}, () => {},
    () => props, () => (name, ...args) => events.push([name, ...args]), value => Object.assign(exposed, value), () => () => Promise.resolve())
  return { props, events, ...internals, exposed }
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
  const f = fixture(), pending = f.open(challenge({ mfaQrAvailable: true }), { passwordFirst: true })
  assert.equal(f.state.value.method, 'qr', 'password-first login starts directly in bound-WeChat QR mode')
  assert.equal(f.state.value.mfaTicket, 'ticket-a')
  f.panel.value.showChoices()
  assert.equal(f.state.value.method, ''); assert.equal(f.state.value.mfaTicket, 'ticket-a')
  f.panel.value.selectExternal('qr')
  assert.equal(f.state.value.method, 'qr', 'returning from method choices can reselect QR with the same ticket')
  f.panel.value.cancel()
  assert.equal(await pending, null); assert.equal(f.acceptQr(verified(), 'ticket-a'), false, 'cancelled ticket callbacks cannot complete login')
}
{
  const fallback = fixture(), pending = fallback.open(challenge({ mfaPasswordAvailable: true }), { passwordFirst: true })
  assert.equal(fallback.state.value.method, '', 'without bound-WeChat QR support, password-first falls back to method choices')
  assert.equal(fallback.state.value.mfaTicket, 'ticket-a')
  fallback.panel.value.cancel(); await pending
  const quickFirst = fixture(), quickPending = quickFirst.open(challenge({ mfaQrAvailable: true }))
  assert.equal(quickFirst.state.value.method, '', 'quick-login-first MFA continues to show method choices')
  quickFirst.panel.value.cancel(); await quickPending
}
{
  const f = fixture(); let rejectPassword, resolvePassword
  f.respond(() => new Promise((resolve, reject) => { resolvePassword = resolve; rejectPassword = reject }))
  const pending = f.open(challenge({ mfaPasswordAvailable: true }), { qrFirst: true })
  assert.equal(f.state.value.method, 'password', 'QR-first login opens password only when the server says it is available')
  assert.equal(f.username.value, '验证账号', 'password validation stays bound to the scanned account')
  assert.equal(f.password.value, '', 'the previous account password is cleared before password validation')
  f.password.value = 'wrong'
  let submission = f.submitPassword()
  rejectPassword(new Error('密码错误')); await submission
  assert.equal(f.state.value.error, '密码错误'); assert.equal(f.state.value.mfaTicket, 'ticket-a')
  f.panel.value.showChoices()
  assert.equal(f.state.value.method, ''); assert.equal(f.state.value.mfaTicket, 'ticket-a')
  f.panel.value.selectExternal('password')
  assert.equal(f.state.value.method, 'password'); assert.equal(f.username.value, '验证账号'); assert.equal(f.password.value, '')
  f.password.value = 'correct'
  submission = f.submitPassword()
  resolvePassword(verified({ accountId: 99 })); await submission
  assert.equal(f.state.value.mfaTicket, 'ticket-a'); assert.equal(f.state.value.error, '验证账号不一致，请使用当前账号完成验证')
  f.respond(async () => verified())
  await f.submitPassword()
  assert.equal((await pending).token, 'verified-token')
}
{
  const f = fixture(), pending = f.open(challenge({ mfaPasswordAvailable: false }), { qrFirst: true })
  assert.equal(f.state.value.method, '', 'QR-first falls back to the ordinary MFA choices when password is unavailable')
  assert.equal(f.username.value, '验证账号'); assert.equal(f.password.value, 'previous-password')
  f.panel.value.cancel(); await pending
}
{
  const f = fixture(); let resolvePassword
  f.respond(() => new Promise(resolve => { resolvePassword = resolve }))
  const old = f.open(challenge({ mfaPasswordAvailable: true }), { qrFirst: true })
  f.password.value = 'password'; const submission = f.submitPassword()
  const next = f.open(challenge({ mfaTicket: 'ticket-b', mfaQrAvailable: true }))
  assert.equal(await old, null)
  resolvePassword(verified()); await submission
  assert.equal(f.state.value.mfaTicket, 'ticket-b', 'cancelled QR-first password response cannot replace a later challenge')
  assert.equal(f.state.value.method, '')
  f.panel.value.cancel(); await next
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
{
  const f = shellFixture({ mfa: { method: 'qr', passwordFirst: true, mfaTicket: 'ticket-a', mfaQrAvailable: true } })
  f.mode.value = 'wechat'
  f.qrPanel.value = { pauseCount: 0, pause() { this.pauseCount++ } }
  f.selectMode('account')
  assert.equal(f.mode.value, 'account', 'mobile account tab returns to the account login mode')
  assert.equal(f.qrPanel.value.pauseCount, 1, 'returning to account login pauses the active QR session')
  assert.ok(f.events.some(([name]) => name === 'mfaCancel'), 'mobile account tab cancels password-first MFA')
  assert.ok(!f.events.some(([name]) => name === 'mfaMethod' || name === 'login'), 'account tab cannot reuse password or submit login as a second factor')
}
{
  const f = shellFixture({ mfa: { method: 'qr', passwordFirst: true, mfaTicket: 'ticket-a', mfaQrAvailable: true } })
  f.qrPanel.value = { pauseCount: 0, pause() { this.pauseCount++ } }
  f.submitAccount({ preventDefault() {} })
  assert.equal(f.mode.value, 'account', 'desktop account form returns to ordinary account login')
  assert.ok(f.events.some(([name]) => name === 'mfaCancel'), 'desktop account action cancels password-first MFA')
  assert.ok(!f.events.some(([name]) => name === 'login'), 'desktop account action cannot reuse password or submit MFA password')
}
{
  const f = shellFixture({ mfa: { method: 'password', qrFirst: true, mfaTicket: 'ticket-a', mfaPasswordAvailable: true } })
  f.mode.value = 'account'
  f.qrPanel.value = { pauseCount: 0, pause() { this.pauseCount++ } }
  f.selectMode('wechat')
  assert.equal(f.mode.value, 'wechat', 'mobile WeChat tab returns to QR login')
  assert.equal(f.qrPanel.value.pauseCount, 1, 'mobile QR restart pauses the prior QR session')
  assert.ok(f.events.some(([name]) => name === 'mfaCancel'))
  assert.ok(!f.events.some(([name]) => name === 'mfaMethod' || name === 'login'), 'mobile QR restart does not reuse credentials or submit')
}
{
  const f = shellFixture({ mfa: { method: 'password', qrFirst: true, mfaTicket: 'ticket-a', mfaPasswordAvailable: true } })
  f.qrPanel.value = { pauseCount: 0, pause() { this.pauseCount++ } }
  f.restartWechatLogin()
  assert.equal(f.mode.value, 'wechat', 'desktop inline restart returns to QR login')
  assert.ok(f.events.some(([name]) => name === 'mfaCancel'), 'desktop inline restart cancels the old MFA ticket')
  assert.ok(!f.events.some(([name]) => name === 'mfaMethod' || name === 'login'))
  assert.equal(f.qrPanel.value.pauseCount, 1)
}
{
  const f = shellFixture({ mfa: { method: 'qr', passwordFirst: true, mfaTicket: 'ticket-a', mfaQrAvailable: true }, loading: true })
  f.qrPanel.value = { pauseCount: 0, pause() { this.pauseCount++ } }
  f.mode.value = 'wechat'; f.selectMode('account'); f.submitAccount({ preventDefault() {} })
  assert.equal(f.mode.value, 'wechat', 'busy MFA cannot restart account login')
  assert.equal(f.qrPanel.value.pauseCount, 0); assert.equal(f.events.length, 0, 'busy MFA emits no cancel/login events')
}
{
  const f = shellFixture({ mfa: { method: 'password', qrFirst: true, mfaTicket: 'ticket-a', mfaPasswordAvailable: true }, loading: true })
  f.qrPanel.value = { pauseCount: 0, pause() { this.pauseCount++ } }
  f.mode.value = 'account'; f.selectMode('wechat'); f.restartWechatLogin()
  assert.equal(f.mode.value, 'account', 'busy MFA cannot restart QR login')
  assert.equal(f.qrPanel.value.pauseCount, 0); assert.equal(f.events.length, 0)
}
console.log('PASS password-first and QR-first MFA, password retry/account binding, ticket choices/cancel/stale responses, QR restarts, APP quick availability, and busy guards')
