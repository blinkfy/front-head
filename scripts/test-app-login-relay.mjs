import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createH5RegistrationRelay, createRegistrationApi } from '../src/utils/registration-relay.mjs'

const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
const session = { sessionId: 'r_' + 'a'.repeat(24), pollSecret: 'b'.repeat(64), status: 'waiting', expiresAt: Date.now() + 60000,
  qrUrl: '/api/registration/sessions/r_' + 'a'.repeat(24) + '/qrcode' }
const login = { token: 'mock-token', userInfo: { username: 'mock-user' } }

function preprocess(source, platform) {
  const marker = /<!--[ \t]*#(ifdef|ifndef|endif)(?:[ \t]+([\s\S]*?))?[ \t]*-->|\/\*[ \t]*#(ifdef|ifndef|endif)(?:[ \t]+([\s\S]*?))?[ \t]*\*\/|^[ \t]*\/\/[ \t]*#(ifdef|ifndef|endif)(?:[ \t]+([^\r\n]*))?/gm
  let result = '', cursor = 0, included = [true], match
  while ((match = marker.exec(source))) {
    if (included.at(-1)) result += source.slice(cursor, match.index)
    cursor = marker.lastIndex
    const kind = match[1] || match[3] || match[5]
    const expression = match[2] || match[4] || match[6] || ''
    if (kind === 'endif') included.pop()
    else {
      const matches = expression.split('||').map(value => value.trim()).includes(platform)
      included.push(included.at(-1) && (kind === 'ifdef' ? matches : !matches))
    }
  }
  if (included.at(-1)) result += source.slice(cursor)
  return result
}
function extractSetup(sfc) { return /<script setup>([\s\S]*?)<\/script>/.exec(sfc)?.[1] || '' }
function appScript(script) {
  return preprocess(script, 'APP-PLUS').replace(/^import .*\r?\n/gm, '')
}
function vueHarness(script, { props = {}, uni = {}, api = {}, dark = false } = {}) {
  const life = { mounted: [], unmount: [], show: [], hide: [], unload: [], resize: [] }
  const exposed = [], emitted = [], generated = []
  const refs = value => ({ value })
  const computed = getter => typeof getter === 'function' ? { get value() { return getter() } }
    : { get value() { return getter.get() }, set value(value) { getter.set(value) } }
  const context = {
    ref: refs, computed, watch: () => {}, nextTick: () => Promise.resolve(),
    onMounted: callback => life.mounted.push(callback), onBeforeUnmount: callback => life.unmount.push(callback),
    onShow: callback => life.show.push(callback), onHide: callback => life.hide.push(callback),
    onUnload: callback => life.unload.push(callback), onResize: callback => life.resize.push(callback),
    defineProps: () => props, defineEmits: () => (...args) => emitted.push(args), defineExpose: value => exposed.push(value),
    useH5RegistrationPolicy: () => async () => {},
    useWechatQrSave: () => ({ qrMenu: refs(null), openQrMenu() {}, closeQrMenu() {}, downloadQr() {}, suppressQrContextMenu() {} }),
    useGeneratedRoundCode: source => { generated.push(source); return { state: refs('idle'), progress: refs(0), phase: refs('idle'), prepareRefresh: async () => ({ status: 'unsupported' }) } },
    ManifestIcon: {}, LoginGreenPlanet: {}, CaptchaBox: {}, CaptchaDark: {}, H5WechatLoginPanel: {},
    createH5RegistrationRelay, registrationApi: api, uni,
    setTimeout, clearTimeout, Promise, Math, Date
  }
  vm.runInNewContext(appScript(script), context, { filename: dark ? 'APP-login-dark-setup.js' : 'APP-login-setup.js' })
  return { life, exposed: exposed.at(-1) || {}, emitted, generated, context }
}

// APP pages choose the shared login shell and QR callback; WeChat mini-app keeps its own entry.
for (const path of ['../src/pages/index/index.vue', '../src/pages-dark/index/index.vue']) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const app = preprocess(source, 'APP-PLUS'), mp = preprocess(source, 'MP-WEIXIN')
  assert.match(app, /<H5LoginShell[\s\S]*?@qr-login="onQrLogin"/)
  assert.match(app, /import H5LoginShell from '@\/components\/H5LoginShell\.vue'/)
  assert.match(app, /async function onQrLogin\(result\)/)
  assert.doesNotMatch(app, /<WechatLoginEntry/)
  assert.doesNotMatch(mp, /<H5LoginShell/)
  assert.match(mp, /<WechatLoginEntry/)
}

// Compile the platform selector in the actual runtime wrapper and verify APP create metadata.
{
  const wrapper = await readFile(new URL('../src/utils/registration-relay.js', import.meta.url), 'utf8')
  const segment = /let clientPlatform = 'h5'[\s\S]*?export const registrationApi = createRegistrationApi\([^\n]+/.exec(wrapper)?.[0]
  assert.ok(segment, 'registration runtime exports the platform-specific client')
  const calls = []
  const runtime = { request: options => {
    calls.push(options)
    options.success({ statusCode: 200, data: { code: 0, data: session } })
  } }
  const code = preprocess(segment, 'APP-PLUS').replace('export const registrationApi =', 'globalThis.registrationApi =')
  const context = { registrationRuntime: runtime, baseUrl: 'https://example.test', createRegistrationApi, globalThis: null }
  context.globalThis = context
  vm.runInNewContext(code, context)
  await context.registrationApi.create()
  assert.deepEqual(calls[0].data, { clientPlatform: 'app' })
}

// APP-preprocessed shell and panel setup run with fake uni and no DOM globals.
{
  const shellPath = new URL('../src/components/H5LoginShell.vue', import.meta.url)
  const panelPath = new URL('../src/components/H5WechatLoginPanel.vue', import.meta.url)
  const shellSource = await readFile(shellPath, 'utf8'), panelSource = await readFile(panelPath, 'utf8')
  const shellScript = appScript(extractSetup(shellSource)), panelScript = appScript(extractSetup(panelSource))
  for (const script of [shellScript, panelScript]) assert.doesNotMatch(script, /\b(?:window|document|Image)\b/)
  const uni = { getSystemInfoSync: () => ({ windowWidth: 390 }), showToast() {}, onResize() {} }
  const shell = vueHarness(extractSetup(shellSource), { props: { dark: false, loading: false }, uni })
  assert.doesNotThrow(() => { for (const mounted of shell.life.mounted) mounted(); for (const hidden of shell.life.hide) hidden(); for (const shown of shell.life.show) shown() })
  for (const dispose of shell.life.unmount) dispose()

  const calls = [], events = []
  let statusCalls = 0, useCreateFailure = false
  const api = {
    create: async () => {
      calls.push('create')
      if (useCreateFailure) throw Object.assign(new Error('old backend'), { httpStatus: 404 })
      return { data: { ...session } }
    },
    status: async () => { calls.push('status'); statusCalls++; return { data: { status: statusCalls >= 3 ? 'authorized' : 'waiting' } } },
    consume: async () => { calls.push('consume'); return login },
    cancel: async target => { calls.push(['cancel', target.sessionId]) },
    qrUrl: target => 'https://example.test' + target.qrUrl,
    fixedQrUrl: () => 'https://example.test/api/registration/wechat-qrcode'
  }
  const panel = vueHarness(panelScript, { props: { dark: false, disabled: false, registrationAllowed: true }, uni, api })
  assert.doesNotThrow(() => { for (const mounted of panel.life.mounted) mounted() })
  for (const shown of panel.life.show) shown()
  await tick(); assert.equal(calls.filter(value => value === 'create').length, 1)
  assert.equal(calls.filter(value => value === 'status').length, 1, 'APP foreground starts one status poll')
  for (const hidden of panel.life.hide) hidden()
  const pausedStatuses = calls.filter(value => value === 'status').length
  await tick(); assert.equal(calls.filter(value => value === 'status').length, pausedStatuses, 'background pauses status polling')
  for (const shown of panel.life.show) shown()
  await tick(); assert.equal(calls.filter(value => value === 'create').length, 1, 'foreground resume reuses the session')
  assert.equal(calls.filter(value => value === 'status').length, pausedStatuses + 1)
  panel.exposed.resume(); await tick()
  assert.equal(calls.filter(value => value === 'consume').length, 1)
  assert(panel.emitted.some(([name, value]) => name === 'login' && value === login))
  for (const dispose of panel.life.unmount) dispose()

  const cancelCalls = []
  const closingApi = { ...api, status: async () => ({ data: { status: 'waiting' } }),
    cancel: async target => { cancelCalls.push(target.sessionId) } }
  const closing = vueHarness(panelScript, { props: { dark: false, disabled: false }, uni, api: closingApi })
  for (const shown of closing.life.show) shown()
  await tick(); for (const dispose of closing.life.unmount) dispose(); await tick()
  assert.deepEqual(cancelCalls, [session.sessionId], 'switching away from QR mode stops and cancels its session')

  useCreateFailure = true
  const fallbackApi = { ...api, create: async () => { throw Object.assign(new Error('old backend'), { httpStatus: 404 }) } }
  const fallback = vueHarness(panelScript, { props: { dark: false, disabled: false }, uni, api: fallbackApi })
  for (const shown of fallback.life.show) shown()
  await tick()
  assert.equal(fallback.generated[0].value, fallbackApi.fixedQrUrl() + '?v=1', 'old backend returns to the fixed WeChat code')
  assert.match(shellSource, /<view v-show="wide \|\| mode === 'account'" class="account-column">/)
  assert.match(shellSource, /<view v-if="wide \|\| mode === 'wechat'" ref="qrColumn"/)
  for (const dispose of fallback.life.unmount) dispose()
}

console.log('PASS APP login shell wiring, native metadata, DOM-free setup, foreground relay lifecycle, session cleanup and old-backend fallback')
