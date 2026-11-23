import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { nextTick, ref, watch } from 'vue'
import { evaluatePassword } from '../../src/utils/account/password-strength.mjs'
import { markWechatProfileCompletion } from '../../src/utils/account/wechat-profile.mjs'
import {
  clearWechatLoginSession,
  createWechatLoginFlow,
  createWechatPasswordLoginFlow,
  rememberWechatLogin,
  shouldAutoWechatLogin,
  WECHAT_AUTO_LOGIN_KEY,
  WECHAT_BIND_INTENT_KEY,
  WECHAT_LAST_LOGIN_KEY,
  WECHAT_SHARED_SESSION_KEY
} from '../../src/utils/account/wechat-login.mjs'

const passed = []

async function scenario(name, run) {
  await run()
  passed.push(name)
}

function fakeRuntime(codes = [], modalAnswers = []) {
  const storage = new Map()
  return {
    storage,
    loginOptions: [],
    modalOptions: [],
    getStorageSync(key) { return storage.get(key) },
    setStorageSync(key, value) { storage.set(key, value) },
    removeStorageSync(key) { storage.delete(key) },
    login(options) {
      this.loginOptions.push(options)
      const next = codes.shift()
      if (next instanceof Error) options.fail(next)
      else options.success(next === undefined ? {} : { code: next })
    },
    showModal(options) {
      this.modalOptions.push(options)
      options.success(modalAnswers.shift() || { confirm: false })
    }
  }
}

function assertNoPersistedCode(runtime) {
  assert.equal([...runtime.storage.keys()].some(key => /code/i.test(key)), false, 'WeChat codes must not be stored')
  assert.equal([...runtime.storage.values()].some(value => typeof value === 'string' && /(?:wechat|fresh|switch|resume|password)-code/i.test(value)), false)
}

async function testSharedFlow() {
  await scenario('auto-login requires the saved preference and respects explicit logout', () => {
    const runtime = fakeRuntime()
    runtime.setStorageSync(WECHAT_AUTO_LOGIN_KEY, true)
    runtime.setStorageSync('autoLogin', true)
    assert.equal(shouldAutoWechatLogin(runtime), true)
    runtime.setStorageSync('autoLogin', false)
    assert.equal(shouldAutoWechatLogin(runtime), false)
    runtime.setStorageSync('autoLogin', true)
    runtime.setStorageSync(WECHAT_BIND_INTENT_KEY, true)
    assert.equal(shouldAutoWechatLogin(runtime), false)
  })

  await scenario('remember and opt-out update shared-account preferences without losing the current session', () => {
    const runtime = fakeRuntime()
    runtime.setStorageSync(WECHAT_BIND_INTENT_KEY, true)
    runtime.setStorageSync('savedUser', { username: 'old-user', password: 'old-password' })
    runtime.setStorageSync('token', 'current-business-session')
    rememberWechatLogin(runtime, { wechatLoginMode: 'shared', wechatAccount: 'account-b', token: 'signed-token-b' })
    assert.equal(runtime.getStorageSync(WECHAT_AUTO_LOGIN_KEY), true)
    assert.equal(runtime.getStorageSync('autoLogin'), true)
    assert.equal(shouldAutoWechatLogin(runtime), true)
    assert.equal(runtime.getStorageSync(WECHAT_BIND_INTENT_KEY), undefined)
    assert.equal(runtime.getStorageSync('savedUser'), undefined)
    assert.deepEqual(runtime.getStorageSync(WECHAT_LAST_LOGIN_KEY), { mode: 'shared', account: 'account-b' })
    assert.equal(runtime.getStorageSync(WECHAT_SHARED_SESSION_KEY), 'signed-token-b')
    rememberWechatLogin(runtime, { wechatLoginMode: 'shared', wechatAccount: 'account-b', token: 'signed-token-b' }, false)
    assert.equal(runtime.getStorageSync(WECHAT_AUTO_LOGIN_KEY), false)
    assert.equal(runtime.getStorageSync('autoLogin'), false)
    assert.equal(runtime.getStorageSync(WECHAT_BIND_INTENT_KEY), undefined)
    assert.equal(runtime.getStorageSync(WECHAT_LAST_LOGIN_KEY), undefined)
    assert.equal(runtime.getStorageSync(WECHAT_SHARED_SESSION_KEY), undefined)
    assert.equal(runtime.storage.has('savedUser'), false)
    assert.equal(runtime.getStorageSync('token'), 'current-business-session', 'opting out must not clear the active login session')
    assert.equal(shouldAutoWechatLogin(runtime), false)

    const primaryRuntime = fakeRuntime()
    primaryRuntime.setStorageSync(WECHAT_SHARED_SESSION_KEY, 'old-shared-token')
    rememberWechatLogin(primaryRuntime, { wechatLoginMode: 'primary', token: 'primary-token' })
    assert.deepEqual(primaryRuntime.getStorageSync(WECHAT_LAST_LOGIN_KEY), { mode: 'primary' })
    assert.equal(primaryRuntime.getStorageSync(WECHAT_SHARED_SESSION_KEY), undefined)
  })

  await scenario('switching to an unbound WeChat account clears business session and stores only boolean intent', async () => {
    const runtime = fakeRuntime(['switch-code-2'])
    runtime.setStorageSync('token', 'old-session')
    runtime.setStorageSync('userInfo', { username: 'old-account' })
    runtime.setStorageSync('isAdmin', true)
    runtime.setStorageSync(WECHAT_AUTO_LOGIN_KEY, true)
    runtime.setStorageSync('autoLogin', true)
    const loginCalls = []
    const flow = createWechatLoginFlow({
      runtime,
      login: async data => {
        loginCalls.push(data)
        assert.equal(runtime.getStorageSync('token'), undefined)
        assert.equal(runtime.getStorageSync('userInfo'), undefined)
        assert.equal(runtime.getStorageSync('isAdmin'), undefined)
        return { data: { needBind: true } }
      }
    })
    await flow.begin()
    assert.deepEqual(loginCalls, [{ code: 'switch-code-2' }])
    assert.equal(flow.isPending(), true)
    assert.deepEqual([...runtime.storage.entries()], [
      [WECHAT_AUTO_LOGIN_KEY, true],
      ['autoLogin', true],
      [WECHAT_BIND_INTENT_KEY, true]
    ])
    assertNoPersistedCode(runtime)
  })

  await scenario('network retry obtains a fresh code, preserves intent, and never stores either code', async () => {
    const runtime = fakeRuntime(['fresh-code-1', 'fresh-code-2'])
    runtime.setStorageSync(WECHAT_BIND_INTENT_KEY, true)
    runtime.setStorageSync('token', 'expired-session')
    const loginCalls = []
    let attempt = 0
    const flow = createWechatLoginFlow({
      runtime,
      login: async data => {
        loginCalls.push(data)
        if (attempt++ === 0) throw new Error('network unavailable')
        return { data: { needBind: true } }
      }
    })
    await assert.rejects(flow.begin(), /network unavailable/)
    assert.equal(flow.isPending(), true)
    assert.deepEqual([...runtime.storage.entries()], [[WECHAT_BIND_INTENT_KEY, true]])
    await flow.begin()
    assert.deepEqual(loginCalls, [{ code: 'fresh-code-1' }, { code: 'fresh-code-2' }])
    assert.equal(flow.isPending(), true)
    assertNoPersistedCode(runtime)
  })

  await scenario('successful linked-account login clears pending intent without persisting the returned token', async () => {
    const runtime = fakeRuntime(['fresh-code-3'])
    runtime.setStorageSync(WECHAT_BIND_INTENT_KEY, true)
    const flow = createWechatLoginFlow({ runtime, login: async () => ({ token: 'returned-session' }) })
    const result = await flow.begin()
    assert.equal(result.token, 'returned-session')
    assert.equal(flow.isPending(), false)
    assert.equal(runtime.storage.size, 0)
    assertNoPersistedCode(runtime)
  })

  await scenario('missing code and client login failure stop before the server login request', async () => {
    for (const [codes, expected] of [[undefined, /未获取到微信登录凭证/], [new Error('client failure'), /微信登录未完成/]]) {
      const runtime = fakeRuntime([codes])
      let requests = 0
      const flow = createWechatLoginFlow({ runtime, login: async () => { requests++; return {} } })
      await assert.rejects(flow.begin(), expected)
      assert.equal(requests, 0)
      assert.equal(runtime.storage.size, 0)
    }
  })

  await scenario('cancel clears only bind intent; session helper clears token, user, and admin keys', () => {
    const runtime = fakeRuntime()
    runtime.setStorageSync(WECHAT_BIND_INTENT_KEY, true)
    runtime.setStorageSync('token', 'session')
    runtime.setStorageSync('userInfo', { username: 'user' })
    runtime.setStorageSync('isAdmin', true)
    runtime.setStorageSync('autoLogin', false)
    const flow = createWechatLoginFlow({ runtime, login: async () => ({}) })
    flow.cancel()
    assert.equal(flow.isPending(), false)
    clearWechatLoginSession(runtime)
    assert.equal(runtime.storage.size, 1)
    assert.equal(runtime.getStorageSync('autoLogin'), false)
  })

  await scenario('resume to shared account B sends its token and username while preserving retry credentials', async () => {
    const runtime = fakeRuntime(['resume-code-1', 'resume-code-2', 'password-code-3'])
    runtime.setStorageSync(WECHAT_LAST_LOGIN_KEY, { mode: 'shared', account: 'account-b' })
    runtime.setStorageSync(WECHAT_SHARED_SESSION_KEY, 'signed-token-b')
    runtime.setStorageSync('token', 'old-business-token')
    runtime.setStorageSync('userInfo', { username: 'old-account' })
    runtime.setStorageSync('isAdmin', true)
    const loginCalls = []
    let attempt = 0
    const flow = createWechatLoginFlow({
      runtime,
      login: async data => {
        loginCalls.push(data)
        assert.equal(runtime.getStorageSync('token'), undefined)
        assert.equal(runtime.getStorageSync('userInfo'), undefined)
        assert.equal(runtime.getStorageSync('isAdmin'), undefined)
        if (attempt++ === 0) throw new Error('temporary network failure')
        return { token: 'fresh-token-b' }
      }
    })
    await assert.rejects(flow.begin(true), /temporary network failure/)
    assert.equal(runtime.getStorageSync(WECHAT_SHARED_SESSION_KEY), 'signed-token-b')
    assert.deepEqual(runtime.getStorageSync(WECHAT_LAST_LOGIN_KEY), { mode: 'shared', account: 'account-b' })
    const resumed = await flow.begin(true)
    assert.equal(resumed.token, 'fresh-token-b')
    assert.deepEqual(loginCalls, [
      { code: 'resume-code-1', previousToken: 'signed-token-b', lastAccount: 'account-b' },
      { code: 'resume-code-2', previousToken: 'signed-token-b', lastAccount: 'account-b' }
    ])
    assert.equal(Object.hasOwn(loginCalls[1], 'password'), false)
    assertNoPersistedCode(runtime)

    const manualRuntime = fakeRuntime(['password-code-3'])
    manualRuntime.setStorageSync(WECHAT_LAST_LOGIN_KEY, { mode: 'shared', account: 'account-b' })
    manualRuntime.setStorageSync(WECHAT_SHARED_SESSION_KEY, 'signed-token-b')
    let manualPayload
    const manualFlow = createWechatLoginFlow({
      runtime: manualRuntime,
      login: async data => { manualPayload = data; return { token: 'primary-token' } }
    })
    await manualFlow.begin(false)
    assert.deepEqual(manualPayload, { code: 'password-code-3' }, 'manual login should start from the primary account')
  })
}

async function testPasswordLoginFlow() {
  await scenario('password login asks before binding and cancellation is handled without a second request', async () => {
    const runtime = fakeRuntime(['password-code-1'], [{ confirm: false }])
    runtime.setStorageSync('token', 'old-session')
    runtime.setStorageSync('userInfo', { username: 'old-user' })
    const requests = []
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async payload => {
        requests.push(payload)
        return { data: { needConfirmBind: true, targetAccount: 'primary-user' } }
      }
    })
    await assert.rejects(flow({ username: 'primary-user', password: 'secret' }), error => {
      assert.equal(error.reason, 'LOGIN_CANCELLED')
      assert.equal(error.handled, true)
      return true
    })
    assert.deepEqual(requests, [{ username: 'primary-user', password: 'secret', wechatCode: 'password-code-1', confirmBind: false }])
    assert.equal(runtime.loginOptions.length, 1)
    assert.equal(runtime.modalOptions.length, 1)
    assert.equal(runtime.modalOptions[0].title, '绑定微信主账号')
    assert.equal(runtime.getStorageSync('token'), undefined)
    assert.equal(runtime.getStorageSync('userInfo'), undefined)
    assertNoPersistedCode(runtime)
  })

  await scenario('confirmed password binding fetches a second code and submits confirmBind true', async () => {
    const runtime = fakeRuntime(['password-code-2', 'password-code-3'], [{ confirm: true }])
    const requests = []
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async payload => {
        requests.push(payload)
        return requests.length === 1 ? { data: { needConfirmBind: true, targetAccount: 'primary-user' } } : { token: 'bound-primary-token' }
      }
    })
    const result = await flow({ username: 'primary-user', password: 'secret' })
    assert.equal(result.token, 'bound-primary-token')
    assert.deepEqual(requests, [
      { username: 'primary-user', password: 'secret', wechatCode: 'password-code-2', confirmBind: false },
      { username: 'primary-user', password: 'secret', wechatCode: 'password-code-3', confirmBind: true }
    ])
    assert.equal(runtime.loginOptions.length, 2)
    assertNoPersistedCode(runtime)
  })

  await scenario('leaving while the confirmation dialog is open prevents the confirm request', async () => {
    const runtime = fakeRuntime(['password-code-4'], [{ confirm: true }])
    let activeChecks = 0
    let requests = 0
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async () => { requests++; return { data: { needConfirmBind: true, targetAccount: 'primary-user' } } }
    })
    await assert.rejects(flow({ username: 'primary-user', password: 'secret' }, () => ++activeChecks === 1), error => {
      assert.equal(error.reason, 'LOGIN_CANCELLED')
      assert.equal(error.handled, true)
      return true
    })
    assert.equal(requests, 1)
    assert.equal(runtime.loginOptions.length, 1)
  })

  await scenario('merge-required response only informs the user and commits no session', async () => {
    const runtime = fakeRuntime(['password-code-5'])
    runtime.setStorageSync('token', 'old-session')
    runtime.setStorageSync('userInfo', { username: 'old-user' })
    let requests = 0
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async () => { requests++; return { data: { needMerge: true, sourceAccount: 'secondary', primaryAccount: 'primary' } } }
    })
    await assert.rejects(flow({ username: 'secondary', password: 'secret' }), error => {
      assert.equal(error.reason, 'MERGE_REQUIRED')
      assert.equal(error.handled, true)
      return true
    })
    assert.equal(requests, 1)
    assert.equal(runtime.modalOptions[0].title, '需要合并账号')
    assert.equal(runtime.modalOptions[0].showCancel, false)
    assert.equal(runtime.getStorageSync('token'), undefined)
    assert.equal(runtime.getStorageSync('userInfo'), undefined)
    assertNoPersistedCode(runtime)
  })
}

function extractAsyncFunction(source, name) {
  const match = source.match(new RegExp(`export async function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `${name} API function should be present`)
  return match[1]
}

async function testApiBranches() {
  const source = await readFile(new URL('../../src/api/user.js', import.meta.url), 'utf8')
  await scenario('register API keeps APP/H5 endpoint and adds a fresh code on MP-Weixin', () => {
    const body = extractAsyncFunction(source, 'register')
    assert.ok(/let url = '\/api\/register'/.test(body))
    assert.ok(/let payload = data/.test(body))
    assert.ok(/#ifdef MP-WEIXIN[\s\S]*url = '\/api\/wechat\/register'[\s\S]*payload = \{ \.\.\.data, nickname: data\.username, wechatCode: await getWechatLoginCode\(uni\) \}[\s\S]*#endif/.test(body))
    assert.ok(/const requestOptions = \{ url, method: 'POST', data: payload \}/.test(body))
    assert.ok(/#ifdef H5[\s\S]*requestOptions.header = \{ 'X-Client-Platform': 'h5' \}/.test(body))
    assert.ok(/return request\(requestOptions\)/.test(body))
  })

  await scenario('password login delegates MP confirmation flow and retains the APP/H5 endpoint', () => {
    const body = extractAsyncFunction(source, 'login')
    assert.ok(/#ifdef MP-WEIXIN[\s\S]*createWechatPasswordLoginFlow\(\{[\s\S]*runtime: uni[\s\S]*url: '\/api\/wechat\/password-login'[\s\S]*silent: true[\s\S]*\}\)\(data, options\.isActive\)[\s\S]*#endif/.test(body))
    assert.ok(/#ifndef MP-WEIXIN\s*return request\(\{ url: '\/api\/login', method: 'POST', data \}\)[\s\S]*#endif/.test(body))
  })
}

function extractNamedFunction(source, name) {
  const match = source.match(new RegExp(`\\s*(?:async )?function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `${name} should be extractable for the isolated settings-flow check`)
  return match[0]
}

async function testSettingsFlow() {
  const source = (await readFile(new URL('../../src/pages-nonTheme/account-security.vue', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
  const logoutSource = (await readFile(new URL('../../src/pages-nonTheme/settings.vue', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
  const vars = {
    allowOtherWechatLogin: { value: false },
    wechatCanManage: { value: false },
    wechatSettingsLoaded: { value: false },
    wechatSettingsBusy: { value: false },
    wechatSettingsError: { value: false },
    wechatBound: { value: false }
  }
  const toasts = []
  const updateCalls = []
  let firstUpdateResolve
  let updateAttempt = 0
  const uni = { getStorageSync: key => key === 'token' ? 'active-session' : undefined, showToast: message => toasts.push(message) }
  const getSettings = async () => ({ code: 0, data: { bound: false, allowOtherWechatLogin: false, canManage: false } })
  const updateSettings = value => {
    updateCalls.push(value)
    updateAttempt++
    if (updateAttempt === 1) return new Promise(resolve => { firstUpdateResolve = resolve })
    if (updateAttempt === 2) return Promise.reject(new Error('network unavailable'))
    return Promise.resolve({ code: 0, data: { allowOtherWechatLogin: false } })
  }
  const load = new Function('wechatSettingsBusy', 'wechatSettingsError', 'wechatSettingsLoaded', 'uni', 'getWechatLoginSettings', 'wechatBound', 'allowOtherWechatLogin', 'wechatCanManage', `return (${extractNamedFunction(source, 'loadWechatSettings')})`)(
    vars.wechatSettingsBusy, vars.wechatSettingsError, vars.wechatSettingsLoaded, uni, getSettings, vars.wechatBound, vars.allowOtherWechatLogin, vars.wechatCanManage
  )
  const toggle = new Function('wechatSettingsBusy', 'wechatSettingsLoaded', 'loadWechatSettings', 'wechatCanManage', 'uni', 'updateWechatLoginSettings', 'allowOtherWechatLogin', `return (${extractNamedFunction(source, 'toggleWechatSharing')})`)(
    vars.wechatSettingsBusy, vars.wechatSettingsLoaded, load, vars.wechatCanManage, uni, updateSettings, vars.allowOtherWechatLogin
  )

  await scenario('settings toggle uses server manage permission, busy guard, retry, and commits only successful responses', async () => {
    await load()
    assert.equal(vars.wechatSettingsLoaded.value, true)
    assert.equal(vars.wechatCanManage.value, false)
    await toggle({ detail: { value: true } })
    assert.equal(updateCalls.length, 0, 'a non-primary WeChat cannot change the setting')

    vars.wechatCanManage.value = true
    const first = toggle({ detail: { value: true } })
    assert.equal(vars.wechatSettingsBusy.value, true)
    await toggle({ detail: { value: false } })
    assert.equal(updateCalls.length, 1, 'the in-flight request blocks duplicate toggles')
    firstUpdateResolve({ code: 0, data: { allowOtherWechatLogin: true } })
    await first
    assert.equal(vars.allowOtherWechatLogin.value, true)
    assert.equal(vars.wechatSettingsBusy.value, false)

    await toggle({ detail: { value: false } })
    assert.equal(vars.allowOtherWechatLogin.value, true, 'a failed save leaves the prior UI value unchanged')
    assert.equal(vars.wechatSettingsBusy.value, false)
    await toggle({ detail: { value: false } })
    assert.deepEqual(updateCalls, [true, false, false])
    assert.equal(vars.allowOtherWechatLogin.value, false)
  })

  await scenario('account profile response is ignored after the active token changes', async () => {
    let activeToken = 'account-a-token'
    let resolveProfile
    const accountProfile = { value: { id: 22, username: 'account-b' } }
    const profileLoading = { value: false }, profileError = { value: false }, avatarFailed = { value: false }
    const writes = []
    const profileUni = { getStorageSync: key => key === 'token' ? activeToken : undefined, setStorageSync: (...args) => writes.push(args) }
    const loadProfile = new Function('profileLoading', 'uni', 'profileError', 'getUserProfile', 'profile', 'avatarFailed', 'readCachedProfile', `return (${extractNamedFunction(source, 'loadProfile')})`)(
      profileLoading, profileUni, profileError, () => new Promise(resolve => { resolveProfile = resolve }), accountProfile, avatarFailed, () => ({ id: 11 })
    )
    const pending = loadProfile()
    activeToken = 'account-b-token'
    resolveProfile({ code: 0, data: { id: 11, username: 'account-a' } })
    await pending
    assert.equal(accountProfile.value.username, 'account-b', 'a stale account response cannot replace the current profile')
    assert.deepEqual(writes, [], 'a stale account response cannot overwrite cached userInfo')
  })

  await scenario('settings logout clears shared resume credentials', () => {
    const logout = extractNamedFunction(logoutSource, 'handleConfirm')
    assert.ok(/(?:confirmAction\.value|action) === 'logout'[\s\S]*setStorageSync\('autoLogin', false\)[\s\S]*#ifdef MP-WEIXIN[\s\S]*removeStorageSync\('wechat_shared_session'\)[\s\S]*removeStorageSync\('wechat_last_login'\)[\s\S]*#endif/.test(logout))
  })
}

async function testThemeSourceGuards() {
  const entryComponent = await readFile(new URL('../../src/components/account/WechatLoginEntry.vue', import.meta.url), 'utf8')
  const h5LoginShell = await readFile(new URL('../../src/components/account/H5LoginShell.vue', import.meta.url), 'utf8')
  assert.ok(!/@cancel=|\$emit\(['"]cancel/.test(entryComponent), 'WeChat entry should expose no cancel action')

  for (const theme of ['pages', 'pages-dark']) {
    const page = (await readFile(new URL(`../../src/${theme}/index/index.vue`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
    const template = page.split('<script setup>')[0]
    const registration = (await readFile(new URL(`../../src/${theme}/register/register.vue`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')

    await scenario(`${theme} page auto-login checks the shared preference before saved-password login`, () => {
      const preferenceCheck = page.indexOf('shouldAutoWechatLogin(uni)')
      const beginAutoLogin = page.indexOf('onWechatLogin(true)', preferenceCheck)
      const savedPasswordCheck = page.indexOf("getStorageSync('savedUser')", preferenceCheck)
      assert.ok(preferenceCheck >= 0 && beginAutoLogin > preferenceCheck && savedPasswordCheck > beginAutoLogin)
      assert.ok(/onUnload\(\(\) => \{ wechatPageActive = false; finishProfileCompletion\(\); finishMergeChoice\(null\) \}\)/.test(page))
    })

    await scenario(`${theme} successful MP login remembers WeChat and pending binding returns before completion`, () => {
      const handler = page.match(/async function onWechatLogin\(isauto = false\) \{([\s\S]*?)\n\}/)
      assert.ok(handler)
      assert.ok(/await wechatFlow\.begin\(isauto === true\)/.test(handler[1]))
      assert.ok(handler[1].indexOf('if (result.data?.needBind)') < handler[1].indexOf('await completeLogin(result, isauto === true, true)'))
      assert.ok(/if \(result\.data\?\.needBind\) \{\s*isLoading\.value = false\s*return/s.test(handler[1]))
      const completion = page.match(/async function completeLogin\([\s\S]*?\n\}/)
      assert.ok(completion && /#ifdef MP-WEIXIN[\s\S]*rememberWechatLogin\(uni, res, rememberMe\.value\)[\s\S]*#endif/.test(completion[0]))
      const passwordLogin = page.match(/login\(\{ username: username\.value, password: password\.value \}, loginOptions\)\.then\(async res => \{([\s\S]*?)\n  \}\)\.catch\(err => \{([\s\S]*?)\n  \}\)/)
      assert.ok(passwordLogin && /loginOptions\.isActive = \(\) => wechatPageActive/.test(page))
      assert.ok(/wechatFlow\.cancel\(\)[\s\S]*completeLogin\(res, isauto\)/.test(passwordLogin[1]))
      assert.ok(/if \(err\?\.handled\) return/.test(passwordLogin[2]), `${theme}: handled cancellation/merge outcomes must not reach success handling`)
      assert.ok(!page.includes('finishBinding'))
    })

    await scenario(`${theme} remember UI is present and MP login passes the user's preference`, () => {
      assert.ok(/v-model:remember-me="rememberMe"/.test(template))
      assert.ok(/<view v-if="!mfa" class="account-options">[\s\S]*?rememberMe/.test(h5LoginShell) || /<view v-if="!mfaState" class="options-row">[\s\S]*?toggleRememberMe[\s\S]*?rememberMe/.test(template))
      assert.ok(/const rememberMe = ref\(true\)/.test(page), `${theme}: keep the checkbox checked by default`)
      assert.ok(/rememberWechatLogin\(uni, res, rememberMe\.value\)/.test(page))
      assert.ok(/if \(wechatSession\) \{[\s\S]*setStorageSync\('autoLogin', rememberMe\.value\)/.test(page))
    })

    await scenario(`${theme} registration uses the shared form with its theme's login route`, () => {
      assert.ok(!page.includes('cancelWechatBinding'))
      assert.ok(registration.includes(`const loginUrl = '/${theme}/index/index'`))
      assert.ok(registration.includes('useRegistrationForm(loginUrl)'))
      assert.ok(registration.includes("loginUrl + '?webRegistration=1'"))
      assert.ok(registration.includes('miniRegistrationRelay.cancel()'))
    })
  }
}

async function testRegistrationForm() {
  const require = createRequire(import.meta.url)
  const { initPreContext, preJs } = require('@dcloudio/uni-cli-shared')
  const readUtility = name => readFile(new URL(`../../src/utils/account/${name}`, import.meta.url), 'utf8')
  const [formSource, policySource] = await Promise.all([
    readUtility('use-registration-form.js'), readUtility('use-h5-registration-policy.js')
  ])
  const plain = source => preJs(source).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  for (const platform of ['h5', 'app', 'mp-weixin']) {
    for (const theme of ['pages', 'pages-dark']) {
      await scenario(`${theme} ${platform} validates registration and routes after success`, async () => {
        initPreContext(platform)
        const mini = platform === 'mp-weixin'
        const loginUrl = `/${theme}/index/index`
        const uni = fakeRuntime()
        const requests = [], toasts = [], redirects = [], timers = []
        let allowWebRegistration = false
        let captchaValid = false
        let captchaRefreshes = 0
        uni.showToast = ({ title }) => toasts.push(title)
        uni.redirectTo = ({ url }) => redirects.push(url)
        const setup = runInNewContext(`${plain(policySource)}\n${plain(formSource)}\nuseRegistrationForm`, {
          nextTick, ref, watch, uni, evaluatePassword, rememberWechatLogin, markWechatProfileCompletion,
          request: async () => ({ code: 0, data: { allowWebRegistration } }),
          register: data => new Promise((resolve, reject) => requests.push({ data, resolve, reject })),
          setTimeout: (callback, delay) => timers.push({ callback, delay }),
          console: { error() {} }
        })
        const form = setup(loginUrl)
        if (!mini) {
          await form.onRegister()
          assert.deepEqual(toasts, [], 'wait until the platform policy is available')
          assert.equal(await form.refreshH5RegistrationPolicy(), false)
          await form.onRegister()
          assert.deepEqual(toasts, [], 'registration remains gated by policy')
          allowWebRegistration = true
          await form.refreshH5RegistrationPolicy()
        }
        await form.onRegister()
        await nextTick()
        assert.deepEqual({ ...form.fieldErrors.value }, { username: '请输入用户名' })
        assert.equal(form.focusedField.value, 'username')
        form.username.value = '测试+用户'
        await nextTick()
        assert.deepEqual({ ...form.fieldErrors.value }, {})
        form.password.value = '123456'
        form.confirmPwd.value = 'different'
        await nextTick()
        await form.onRegister()
        assert.equal(form.fieldErrors.value.confirmPwd, '两次密码不一致')
        form.confirmPwd.value = form.password.value
        await nextTick()
        await form.onRegister()
        assert.ok(form.fieldErrors.value.password, 'weak passwords stay blocked')
        form.password.value = form.confirmPwd.value = 'P9%mV#42kS'
        form.captchaRef.value = {
          validate: () => captchaValid,
          refresh: () => { captchaRefreshes++ }
        }
        if (platform !== 'h5') {
          await form.onRegister()
          assert.match(toasts.at(-1), /同意.*隐私保护/)
          assert.equal(captchaRefreshes, 0)
          form.privacyAccepted.value = true
        }
        await form.onRegister()
        assert.equal(form.captchaHint.value, '验证码错误，请重新输入')
        assert.equal(captchaRefreshes, 1)
        assert.equal(requests.length, 0)

        captchaValid = true
        const failed = form.onRegister()
        await form.onRegister()
        assert.equal(requests.length, 1, 'block duplicate submits while requesting')
        requests.shift().reject({ msg: '用户名已存在' })
        await failed
        assert.match(toasts.at(-1), /用户名已存在/)
        assert.equal(form.isLoading.value, false)
        assert.equal(captchaRefreshes, 2)
        assert.equal(uni.storage.size, 0)

        uni.storage.set('savedUser', { username: 'previous-user' })
        const success = form.onRegister()
        const pending = requests.shift()
        assert.deepEqual({ ...pending.data }, { username: '测试+用户', password: 'P9%mV#42kS' })
        form.username.value = 'edited-after-submit'
        pending.resolve({})
        await success
        assert.equal(toasts.at(-1), '注册成功')
        assert.equal(form.isLoading.value, true)
        assert.deepEqual(redirects, [])
        assert.equal(timers[0].delay, 1200)
        timers[0].callback()
        assert.equal(form.isLoading.value, false)
        if (mini) {
          assert.equal(uni.storage.get(WECHAT_AUTO_LOGIN_KEY), true)
          assert.equal(uni.storage.get('wechatProfileCompletionPending').username, '测试+用户')
          assert.equal(uni.storage.has('savedUser'), false)
          assert.deepEqual(redirects, [`${loginUrl}?username=${encodeURIComponent('测试+用户')}`])
        } else {
          assert.equal(uni.storage.get('autoLogin'), true)
          assert.deepEqual({ ...uni.storage.get('savedUser') }, { username: '测试+用户', password: 'P9%mV#42kS' })
          assert.equal(uni.storage.has('wechatProfileCompletionPending'), false)
          assert.deepEqual(redirects, [loginUrl])
        }
      })
    }
  }
}

async function testLoginSfcPlatforms() {
  const require = createRequire(import.meta.url)
  const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
  const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
  const defaults = {
    APP: false, APP_PLUS: false, MP: false, MP_WEIXIN: false, H5: false, WEB: false,
    MP_ALIPAY: false, MP_BAIDU: false, MP_HARMONY: false, MP_QQ: false,
    MP_LARK: false, MP_TOUTIAO: false, MP_KUAISHOU: false, MP_JD: false, MP_XHS: false
  }
  for (const theme of ['pages', 'pages-dark']) {
    const filename = `src/${theme}/index/index.vue`
    const source = await readFile(new URL(`../../${filename}`, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source, { filename })
    assert.equal(errors.length, 0, `${theme}: SFC parse should succeed`)
    for (const target of ['mp-weixin', 'h5']) {
      await scenario(`${theme} login SFC compiles for ${target}`, () => {
        const context = { ...defaults, ...(target === 'mp-weixin' ? { MP: true, MP_WEIXIN: true } : { H5: true, WEB: true }) }
        const script = preprocess(descriptor.scriptSetup.content, context, 'js')
        compileScript({ ...descriptor, scriptSetup: { ...descriptor.scriptSetup, content: script } }, { id: `wechat-${theme}-${target}` })
        const template = preprocess(descriptor.template.content, context, 'html')
        const result = compileTemplate({ source: template, filename, id: `wechat-${theme}-${target}` })
        assert.equal(result.errors.length, 0, result.errors.map(String).join('\n'))
      })
    }
  }
}

await testSharedFlow()
await testPasswordLoginFlow()
await testApiBranches()
await testSettingsFlow()
await testThemeSourceGuards()
await testRegistrationForm()
await testLoginSfcPlatforms()
console.log(`wechat-login checks passed (${passed.length} scenarios)`)
