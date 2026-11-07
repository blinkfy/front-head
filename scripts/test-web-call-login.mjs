import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { WEB_CALL_RETURN_KEY, webCallTarget, stripWebCallTicket } from '../src/utils/web-call-entry.mjs'

const source = await readFile(new URL('../src/pages-nonTheme/web-call.vue', import.meta.url), 'utf8')
const script = /<script>([\s\S]*?)<\/script>/.exec(source)?.[1]
assert.ok(script)

function preprocessH5(input) {
  const output = [], stack = []
  let include = true
  for (const line of input.split(/\r?\n/)) {
    const marker = line.match(/^\s*\/\/\s*#(ifdef|ifndef|else|endif)\s*(.*)$/)
    if (!marker) { if (include) output.push(line); continue }
    const [, directive, expression] = marker
    if (directive === 'ifdef' || directive === 'ifndef') {
      const selected = expression.trim().split(/\s+\|\|\s+/).includes('H5')
      const condition = directive === 'ifdef' ? selected : !selected
      stack.push({ parent: include, condition })
      include = include && condition
    } else if (directive === 'else') {
      const frame = stack.at(-1)
      include = frame.parent && !frame.condition
    } else include = stack.pop().parent
  }
  return output.join('\n').replace(/^import .*\r?\n/gm, '')
}

function makePage({ redeem, storage = new Map() }) {
  const calls = { requests: [], navigations: [], removed: [], writes: [], starts: [] }
  const uni = {
    getStorageSync(key) { return storage.get(key) },
    setStorageSync(key, value) { calls.writes.push([key, value]); storage.set(key, value) },
    removeStorageSync(key) { calls.removed.push(key); storage.delete(key) },
    request: options => calls.requests.push(options),
    navigateTo: options => calls.navigations.push(options),
    showToast() {}
  }
  const window = { location: { href: `https://example.test/web/#/pages-nonTheme/web-call?peerId=42&selfId=7&mode=audio&ticket=${'c'.repeat(64)}` },
    history: { state: { marker: true }, replaceState(state, title, href) { calls.replaced = [state, href]; window.location.href = href } } }
  const context = { WEB_CALL_RETURN_KEY, webCallTarget, stripWebCallTicket, redeemWebCallTicket: redeem,
    baseUrl: 'https://example.test', voiceCalls: { start: (...args) => calls.starts.push(args) },
    voiceCallState: { phase: 'idle', supported: true, videoSupported: true }, uni, window }
  vm.createContext(context)
  const compiled = preprocessH5(script).replace('export default', 'globalThis.component =')
  vm.runInContext(compiled, context, { filename: fileURLToPath(new URL('../src/pages-nonTheme/web-call.vue', import.meta.url)) })
  const component = context.component
  const page = { ...component.data() }
  for (const [name, method] of Object.entries(component.methods)) page[name] = method.bind(page)
  page._calls = calls
  page._storage = storage
  page._uni = uni
  page._component = component
  page.load = options => component.onLoad.call(page, options)
  return page
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const target = { peerId: '42', selfId: '7', mode: 'audio', name: '联系人' }
const ticket = 'c'.repeat(64)
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

{
  const pending = deferred()
  const storage = new Map([['token', 'old-token'], ['userInfo', { id: 8 }], ['guestMode', true]])
  const page = makePage({ redeem: () => pending.promise, storage })
  page.load({ ...target, ticket })
  assert.equal(page.loggingIn, true)
  assert.equal(page._calls.replaced[1].includes('ticket='), false, 'onLoad strips ticket from the address bar immediately')
  pending.resolve({ token: 'matched-token', userInfo: { id: 7, isAdmin: true } })
  await settle()
  assert.equal(storage.get('token'), 'matched-token')
  assert.deepEqual(storage.get('userInfo'), { id: 7, isAdmin: true })
  assert.equal(storage.get('isAdmin'), true)
  assert.equal(storage.has('guestMode'), false)
  assert.equal(page.accountMatches, true)
  assert.equal(page.loggingIn, false)
  assert.equal(page._calls.starts.length, 0, 'automatic login never starts a call')
}

{
  const storage = new Map([['token', 'existing-token'], ['userInfo', { id: 8 }]])
  const page = makePage({ redeem: async () => { throw new Error('old backend') }, storage })
  page.load({ ...target, ticket })
  await settle()
  assert.equal(storage.get('token'), 'existing-token')
  assert.equal(page.accountMatches, false)
  assert.equal(page.loggingIn, false)
  page.login()
  assert.equal(page._calls.navigations[0].url, '/pages/index/index?manualLogin=1', 'failed automatic login leaves manual account switching available')
  assert.equal(storage.get(WEB_CALL_RETURN_KEY).target.selfId, '7')
  page.start()
  assert.equal(page._calls.starts.length, 0, 'mismatched account cannot start a call')
}

for (const closeEntry of [false, true]) {
  const pending = deferred()
  const storage = new Map([['token', 'initial-token'], ['userInfo', { id: 8 }]])
  const page = makePage({ redeem: () => pending.promise, storage })
  page.load({ ...target, ticket })
  if (closeEntry) page._component.onUnload.call(page)
  else storage.set('token', 'switched-account-token')
  pending.resolve({ token: 'ticket-token', userInfo: { id: 7 } })
  await settle()
  assert.equal(storage.get('token'), closeEntry ? 'initial-token' : 'switched-account-token')
  assert.deepEqual(page._calls.writes, [], 'closed or account-switched entry cannot persist ticket credentials')
  page.start()
  assert.equal(page._calls.starts.length, 0, 'ticket completion after exit/account switch cannot start a call')
}

console.log('PASS H5 web-call automatic login, safe persistence, manual fallback, and no implicit call start')
