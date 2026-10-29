import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { navigateAfterLogin, claimLoginSplash, returnToLogin } from '../src/utils/login-navigation.mjs'

const root = new URL('../', import.meta.url)
const pages = [
  { file: 'src/pages/index/index.vue', home: '/pages/home/home', dark: false },
  { file: 'src/pages-dark/index/index.vue', home: '/pages-dark/home/home', dark: true }
]
const registrationPages = [
  { file: 'src/pages/register/register.vue' },
  { file: 'src/pages-dark/register/register.vue' }
]
const passed = []
async function scenario(name, run) { await run(); passed.push(name) }

function conditionalSource(source, target) {
  const stack = [true]
  const output = []
  for (const line of source.split(/\r?\n/)) {
    const open = line.match(/^\s*\/\/\s*#ifdef\s+(.+)\s*$/)
    const close = /^\s*\/\/\s*#endif\s*$/.test(line)
    if (open) {
      const conditions = open[1].split(/\s+\|\|\s+/)
      stack.push(stack.at(-1) && conditions.includes(target))
    } else if (close) stack.pop()
    else if (stack.at(-1)) output.push(line)
  }
  assert.equal(stack.length, 1, 'conditional compilation blocks should be balanced')
  return output.join('\n')
}

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`)
  assert.notEqual(start, -1, `${name} exists`)
  const brace = source.indexOf('{', start)
  let depth = 0
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  assert.fail(`${name} has a closing brace`)
}

function compileSfc(source, filename, target) {
  const parsed = parse(source, { filename })
  assert.equal(parsed.errors.length, 0, `${filename} SFC parses`)
  const script = parsed.descriptor.scriptSetup || parsed.descriptor.script
  assert.ok(script, `${filename} has script`)
  if (parsed.descriptor.scriptSetup) {
    parsed.descriptor.scriptSetup.content = conditionalSource(parsed.descriptor.scriptSetup.content, target)
  } else if (parsed.descriptor.script) {
    parsed.descriptor.script.content = conditionalSource(parsed.descriptor.script.content, target)
  }
  const scriptResult = compileScript(parsed.descriptor, { id: `${target}-${filename}` })
  assert.ok(scriptResult.content.length > 0)
  const template = conditionalSource(parsed.descriptor.template.content, target)
  const templateResult = compileTemplate({ source: template, filename, id: `${target}-${filename}` })
  assert.deepEqual(templateResult.errors, [], `${filename} ${target} template compiles`)
}

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

async function testHelper() {
  await scenario('navigation success keeps loading until page replacement, and async callback leaves it on', async () => {
    let loading = false
    let callbacks
    const runtime = { reLaunch: options => { callbacks = options } }
    const navigation = navigateAfterLogin({ runtime, url: '/pages/home/home', setLoading: value => { loading = value } })
    assert.equal(loading, true)
    assert.equal(await Promise.race([navigation.then(() => 'settled'), Promise.resolve('pending')]), 'pending')
    assert.equal(loading, true)
    callbacks.success()
    assert.equal(await navigation, true)
    assert.equal(loading, true)
  })
  await scenario('navigation failure and synchronous throw release loading without touching auth storage', async () => {
    for (const mode of ['callback', 'throw']) {
      let loading = false
      const storage = new Map([['token', 'valid'], ['userInfo', { id: 7 }]])
      const before = [...storage]
      const toasts = []
      const runtime = {
        reLaunch(options) { if (mode === 'throw') throw new Error('sync failure'); options.fail(new Error('async failure')) },
        showToast: value => toasts.push(value)
      }
      assert.equal(await navigateAfterLogin({ runtime, url: '/home', setLoading: value => { loading = value } }), false)
      assert.equal(loading, false)
      assert.deepEqual([...storage], before)
      assert.equal(toasts.length, 1)
    }
  })
}

async function testReturnNavigation() {
  await scenario('first login launch claims splash once; returning to login suppresses it', async () => {
    assert.equal(claimLoginSplash(), true)
    assert.equal(claimLoginSplash(), false)
    let destination
    returnToLogin({ runtime: { redirectTo: options => { destination = options.url } }, url: '/pages/index/index', getPages: () => [{ route: 'pages/register/register' }] })
    assert.equal(destination, '/pages/index/index')
    assert.equal(claimLoginSplash(), false)
  })
  await scenario('return uses existing same-theme login page and does not replay splash', async () => {
    for (const [url, route] of [['/pages/index/index', 'pages/index/index'], ['/pages-dark/index/index', '/pages-dark/index/index']]) {
      const calls = []
      returnToLogin({ runtime: { navigateBack: options => calls.push(['back', options]), redirectTo: options => calls.push(['redirect', options]) }, url, getPages: () => [{ route }, { route: 'pages/register/register' }] })
      assert.equal(calls[0]?.[0], 'back')
      assert.equal(calls[0]?.[1]?.delta, 1)
      assert.equal(typeof calls[0][1].fail, 'function')
      assert.equal(claimLoginSplash(), false)
    }
  })
  await scenario('return redirects when no matching prior login exists or navigateBack fails', async () => {
    for (const pages of [[], [{ route: 'pages-dark/index/index' }, { route: 'pages/register/register' }]]) {
      const calls = []
      returnToLogin({ runtime: { navigateBack: options => { calls.push('back'); options.fail() }, redirectTo: options => calls.push(['redirect', options.url]) }, url: '/pages/index/index', getPages: () => pages })
      assert.deepEqual(calls, [['redirect', '/pages/index/index']])
    }
  })
}

function loginContext({ page, target = 'APP-PLUS', profile = false, shared = false, active = true, pendingScene = '' }) {
  const events = []
  let profileDone
  const storage = new Map()
  const loading = { value: true }
  const refs = Object.fromEntries(['loginFailCount', 'showCaptcha', 'captchaInput', 'captchaHint', 'rememberMe', 'username', 'password'].map(key => [key, { value: key === 'rememberMe' ? true : key === 'username' ? 'alice' : key === 'password' ? 'secret' : false }]))
  const uni = {
    setStorageSync(key, value) { events.push(`storage:${key}`); storage.set(key, value) },
    removeStorageSync(key) { storage.delete(key) },
    showToast: () => {},
    getStorageSync: key => storage.get(key)
  }
  const context = {
    ...refs, isLoading: loading, uni,
    userinfo: async () => { events.push('userinfo'); return { data: { username: 'alice' } } },
    rememberWechatLogin: () => {}, consumeWechatProfileCompletion: () => { events.push(`profile:${profile}`); return profile },
    profileCompletionUser: { value: null }, profileCompletionVisible: { value: false },
    get resolveProfileCompletion() { return profileDone },
    set resolveProfileCompletion(resolve) { profileDone = resolve },
    get wechatPageActive() { return active },
    finishProfileCompletion() { if (profileDone) profileDone() },
    confirmRegistrationLogin: async () => { events.push('confirm') },
    getPendingDeviceQrScene: () => pendingScene,
    buildDeviceQrScanUrl: (_, dark) => `/device?dark=${dark}`,
    ThemeManager: { getTheme: () => page.dark ? 'dark' : 'light' },
    navigateAfterLogin: async ({ url, setLoading }) => { events.push('navigate'); assert.equal(url, pendingScene ? `/device?dark=${page.dark}` : page.home); assert.equal(storage.get('token'), 'valid-token'); assert.ok(storage.has('userInfo')); assert.ok(storage.has('autoLogin')); setLoading(true); return url },
    remindIfUnbound: async () => true,
    console,
    setTimeout: () => { throw new Error('fixed delay must not be used') }
  }
  const proxy = new Proxy(context, { has: () => true, get(target, key) { if (key in target) return target[key]; return globalThis[key] } })
  const descriptor = parse(page.source, { filename: page.file }).descriptor
  const scriptContent = descriptor.scriptSetup?.content || descriptor.script?.content || ''
  const fn = new Function('ctx', `with (ctx) { return (${extractFunction(scriptContent, 'completeLogin')}) }`)(proxy)
  const finish = () => profileDone?.()
  return { fn, events, storage, loading, context, finish }
}

for (const page of pages) page.source = await readFile(new URL(page.file, root), 'utf8')

await testHelper()
await testReturnNavigation()
await scenario('both login pages compile script and template for H5, MP-Weixin, and APP-PLUS', () => {
  for (const page of pages) for (const target of ['H5', 'MP-WEIXIN', 'APP-PLUS']) compileSfc(page.source, page.file, target)
})
await scenario('both registration pages compile script and template for H5', async () => {
  for (const page of registrationPages) compileSfc(await readFile(new URL(page.file, root), 'utf8'), page.file, 'H5')
})

await scenario('completeLogin stores credentials before navigation and preserves device and theme targets without delays', async () => {
  for (const page of pages) {
    const state = loginContext({ page, pendingScene: 'scene-123' })
    await state.fn({ token: 'valid-token' }, false, false)
    const navIndex = state.events.indexOf('navigate')
    assert.ok(state.events.indexOf('storage:token') >= 0)
    assert.ok(state.events.indexOf('userinfo') < state.events.indexOf('navigate'))
    assert.equal(state.storage.get('autoLogin'), true)
    assert.ok(state.events.indexOf('storage:token') < state.events.indexOf('navigate'))
    assert.equal(state.storage.get('token'), 'valid-token')
    assert.equal(state.loading.value, true)
    assert.notEqual(navIndex, -1)
    assert.match(state.fn.toString(), /navigateAfterLogin/)
    assert.doesNotMatch(state.fn.toString(), /setTimeout/)
  }
})

await scenario('MP shared mode bypasses profile completion; regular profile waits, restores loading, and checks page activity', () => {
  for (const page of pages) {
    const body = extractFunction(page.source, 'completeLogin')
    assert.match(body, /res\.wechatLoginMode !== 'shared' && consumeWechatProfileCompletion/)
    const profileAt = body.indexOf('await new Promise(resolve => { resolveProfileCompletion = resolve })')
    const restoreAt = body.indexOf('if (wechatPageActive) isLoading.value = true', profileAt)
    const navAt = body.indexOf('await navigateAfterLogin')
    assert.ok(profileAt >= 0 && restoreAt > profileAt && navAt > restoreAt)
    assert.match(body.slice(restoreAt, navAt), /if \(!wechatPageActive\) return/)
  }
})

await scenario('H5 keeps the unbound WeChat confirmation in the login path', () => {
  for (const page of pages) {
    const body = extractFunction(page.source, 'completeLogin')
    const h5 = conditionalSource(body, 'H5')
    assert.match(h5, /remindIfUnbound/)
    assert.match(h5, /if \(!\(await remindIfUnbound\(\)\)\) return/)
  }
})

for (const name of passed) console.log(`PASS ${name}`)
console.log(`${passed.length} login navigation checks passed`)
