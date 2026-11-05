import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createAppConsole } from '../src/utils/app-console.mjs'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const babel = require('@babel/parser')
const root = new URL('../', import.meta.url)
const read = file => fs.readFileSync(new URL(file, root), 'utf8')

const targetCalls = []
const target = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level =>
  [level, (...args) => { targetCalls.push([level, args]); return 'original-result' }]))
const originalLog = target.log
const logger = createAppConsole({ limit: 3, maxLength: 500, now: () => 1234 })
logger.install(target)
logger.install(target)
assert.equal(target.log('first'), 'original-result')
let updates = 0
const unsubscribe = logger.subscribe(() => updates++)
target.info('[chat-push]', { status: 'READY' })
target.warn('third')
target.error('fourth')
await Promise.resolve()
assert.equal(updates, 1, 'same-tick log updates are batched without a timer')
assert.deepEqual(logger.snapshot().map(item => item.level), ['info', 'warn', 'error'])
assert.equal(targetCalls.length, 4, 'installing twice does not duplicate output')
const snapshot = logger.snapshot()
snapshot[0].message = 'changed'
assert.match(logger.snapshot()[0].message, /chat-push/, 'snapshot cannot mutate the buffer')

const circular = { nested: { client_secret: 'private-secret', Authorization: 'Bearer private-auth' }, jwt: 'private-jwt' }
circular.self = circular
target.log(circular, 'token=private-token', 'https://example.invalid/?token=private-url&x=1',
  '{"apiKey":"private-key"}', 'eyJabc123.def456.signature789')
const safe = logger.snapshot().at(-1).message
assert.doesNotMatch(safe, /private-|eyJabc123/)
assert.match(safe, /已隐藏/)
assert.match(safe, /循环引用/)
target.log(JSON.stringify({ password: 'private-escaped"password', access_token: 'private-escaped\\token' }))
assert.doesNotMatch(logger.snapshot().at(-1).message, /private-|escaped/)
target.log('x'.repeat(10000))
assert.equal(logger.snapshot().at(-1).message.length, 500)
logger.setIdentity('account-a')
assert.equal(logger.snapshot().length, 0, 'identity changes clear previous account logs')
target.log('retained')
logger.setIdentity('account-a')
assert.equal(logger.snapshot().length, 1)
logger.setIdentity('')
assert.equal(logger.snapshot().length, 0, 'logout clears logs')
unsubscribe()
logger.uninstall()
assert.equal(target.log, originalLog, 'original console methods are restored')

const descriptors = new Map()
for (const file of ['src/App.vue', 'src/pages-admin/admin-ai-settings.vue', 'src/pages-admin/components/AdminConsolePanel.vue']) {
  const { descriptor, errors } = parse(read(file), { filename: file })
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'app-console-test' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: 'app-console-test',
    compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename: file, id: 'app-console-test' }).errors, [])
  descriptors.set(file, descriptor)
}

const settings = descriptors.get('src/pages-admin/admin-ai-settings.vue')
assert.match(settings.template.content, /AdminConsolePanel v-if="adminVerified"/)
const script = settings.scriptSetup.content
const node = babel.parse(script, { sourceType: 'module' }).program.body.find(node =>
  node.type === 'FunctionDeclaration' && node.id.name === 'adminAuth')
function makeAuth(userinfo, token = 'current-token') {
  const verified = { value: true }
  const globals = { userinfo, uni: { getStorageSync: () => token, setStorageSync() {}, removeStorageSync() {}, navigateTo() {}, showToast() {} },
    adminVerified: verified, console: { error() {} }, goBack() {}, setTimeout() {} }
  const control = vm.runInNewContext(`(() => { let authVersion = 0; ${script.slice(node.start, node.end)};
    return { check: adminAuth, hide: () => { authVersion++; adminVerified.value = false } } })()`, globals)
  return { ...control, verified }
}
for (const value of [false, 'true', 1, undefined]) {
  const auth = makeAuth(async () => ({ data: { isAdmin: value } }))
  assert.equal(await auth.check(), false)
  assert.equal(auth.verified.value, false, 'only a strict server-confirmed admin can view the panel')
}
const admin = makeAuth(async () => ({ data: { isAdmin: true } }))
assert.equal(await admin.check(), true)
assert.equal(admin.verified.value, true)
let finishAuth
const stale = makeAuth(() => new Promise(resolve => { finishAuth = resolve }))
const pending = stale.check()
stale.hide()
finishAuth({ data: { isAdmin: true } })
assert.equal(await pending, false)
assert.equal(stale.verified.value, false, 'hidden or replaced sessions reject late auth results')
let requests = 0
const anonymous = makeAuth(async () => { requests++; return { data: { isAdmin: true } } }, '')
assert.equal(await anonymous.check(), false)
assert.equal(requests, 0, 'anonymous users never request or see the admin console')

console.log('App console passed: bounded buffer, console forwarding, redaction, identity cleanup, SFC compilation and admin access.')
