import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createWechatPasswordLoginFlow } from '../src/utils/wechat-login.mjs'

const passed = []
const failures = []

async function scenario(name, run) {
  try {
    await run()
    passed.push(name)
  } catch (error) {
    failures.push({ name, error })
    console.error(`FAIL: ${name}\n${error.stack || error}`)
  }
}

function fakeRuntime(codes = []) {
  const storage = new Map()
  return {
    storage,
    loginOptions: [],
    getStorageSync(key) { return storage.get(key) },
    setStorageSync(key, value) { storage.set(key, value) },
    removeStorageSync(key) { storage.delete(key) },
    login(options) {
      this.loginOptions.push(options)
      const next = codes.shift()
      if (next instanceof Error) options.fail(next)
      else options.success(next === undefined ? {} : { code: next })
    },
    showModal(options) { options.success({ confirm: false }) }
  }
}

function assertNoSessionOrSecrets(runtime, codes = [], passwords = []) {
  for (const key of ['token', 'userInfo', 'isAdmin']) {
    assert.equal(runtime.getStorageSync(key), undefined, `${key} should not remain after the merge flow`)
  }
  const stored = JSON.stringify([...runtime.storage.entries()])
  for (const secret of [...codes, ...passwords]) {
    assert.ok(!stored.includes(secret), `sensitive value must not be persisted: ${secret}`)
  }
}

const credentials = { username: 'verified-account-b', password: 'verified-password-b' }
const previewFor = keepAccount => ({
  mergeTicket: `ticket-${keepAccount}`,
  currentWechat: { username: 'wechat-account-a', points: 11 },
  verified: { username: credentials.username, points: 7 },
  keepA: { canMerge: true, blockers: [], counts: { recognitionHistory: 1 } },
  keepB: { canMerge: true, blockers: [], counts: { recognitionHistory: 2 } },
  pointsAfterMerge: 18
})

async function testSuccessfulDirections() {
  for (const keepAccount of ['currentWechat', 'verified']) {
    await scenario(`needMerge previews with a fresh code, supports ${keepAccount}, commits with a third code, and returns the target token`, async () => {
      const codes = [`login-${keepAccount}`, `preview-${keepAccount}`, `commit-${keepAccount}`]
      const runtime = fakeRuntime([...codes])
      runtime.setStorageSync('token', 'old-session')
      runtime.setStorageSync('userInfo', { username: 'old-session-user' })
      runtime.setStorageSync('isAdmin', true)
      const loginCalls = []
      const previewCalls = []
      const commitCalls = []
      const expectedPreview = previewFor(keepAccount)
      const result = { token: `target-token-${keepAccount}`, wechatLoginMode: 'primary', user: { username: 'target-user' } }
      let chosenPreview
      const flow = createWechatPasswordLoginFlow({
        runtime,
        login: async payload => {
          loginCalls.push(payload)
          return { data: { needMerge: true } }
        },
        previewMerge: async payload => {
          previewCalls.push(payload)
          return { code: 0, data: expectedPreview }
        },
        chooseMerge: async preview => {
          chosenPreview = preview
          return keepAccount
        },
        commitMerge: async payload => {
          commitCalls.push(payload)
          return result
        }
      })

      const actual = await flow(credentials)
      assert.deepEqual(loginCalls, [{ ...credentials, wechatCode: codes[0], confirmBind: false }])
      assert.equal(Object.values(previewCalls[0]).includes(codes[1]), true, 'preview must use a newly requested WeChat code')
      assert.equal(chosenPreview, expectedPreview, 'the choice UI receives the preview for both directions')
      assert.equal(actual, result, 'the flow should return the normal target-account login result')
      assert.deepEqual(runtime.loginOptions.map(options => options.provider), ['weixin', 'weixin', 'weixin'])
      assertNoSessionOrSecrets(runtime, codes, [credentials.password])
      assert.deepEqual(commitCalls[0], {
        mergeTicket: expectedPreview.mergeTicket,
        wechatCode: codes[2],
        sourcePassword: credentials.password,
        keepAccount,
        confirm: true
      })
    })
  }
}

async function testBlockedDirectionAndCancellation() {
  await scenario('a choice blocked by its preview direction never requests a commit code or commits', async () => {
    const codes = ['blocked-login-code', 'blocked-preview-code', 'must-not-be-requested']
    const runtime = fakeRuntime([...codes])
    const blockedPreview = { ...previewFor('blocked'), keepA: { canMerge: false, blockers: [{ code: 'active-order' }] } }
    let commits = 0
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async () => ({ data: { needMerge: true } }),
      previewMerge: async () => ({ data: blockedPreview }),
      chooseMerge: async () => 'currentWechat',
      commitMerge: async () => { commits++; return { token: 'unexpected-token' } }
    })
      await assert.rejects(flow(credentials), error => error.reason === 'MERGE_BLOCKED' && error.handled === true)
    assert.equal(commits, 0)
    assert.equal(runtime.loginOptions.length, 2)
    assertNoSessionOrSecrets(runtime, codes.slice(0, 2), [credentials.password])
  })

  await scenario('canceling the merge choice does not request a commit code or commit', async () => {
    const codes = ['cancel-login-code', 'cancel-preview-code', 'must-not-be-requested']
    const runtime = fakeRuntime([...codes])
    let commits = 0
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async () => ({ data: { needMerge: true } }),
      previewMerge: async () => ({ data: previewFor('cancel') }),
      chooseMerge: async () => null,
      commitMerge: async () => { commits++; return { token: 'unexpected-token' } }
    })
    await assert.rejects(flow(credentials), error => error.reason === 'LOGIN_CANCELLED' && error.handled === true)
    assert.equal(commits, 0)
    assert.equal(runtime.loginOptions.length, 2)
    assertNoSessionOrSecrets(runtime, codes.slice(0, 2), [credentials.password])
  })

  await scenario('leaving while the choice is open prevents commit', async () => {
    const codes = ['leave-login-code', 'leave-preview-code', 'must-not-be-requested']
    const runtime = fakeRuntime([...codes])
    let isActive = true
    let finishChoice
    let choiceOpened
    const opened = new Promise(resolve => { choiceOpened = resolve })
    let commits = 0
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async () => ({ data: { needMerge: true } }),
      previewMerge: async () => ({ data: previewFor('leave') }),
      chooseMerge: () => {
        choiceOpened()
        return new Promise(resolve => { finishChoice = resolve })
      },
      commitMerge: async () => { commits++; return { token: 'unexpected-token' } }
    })
    const pending = flow(credentials, () => isActive)
    await opened
    isActive = false
    finishChoice(null)
    await assert.rejects(pending, error => error.reason === 'LOGIN_CANCELLED' && error.handled === true)
    assert.equal(commits, 0)
    assert.equal(runtime.loginOptions.length, 2)
    assertNoSessionOrSecrets(runtime, codes.slice(0, 2), [credentials.password])
  })
}

async function testErrorsDoNotPersistCredentialsOrSessions() {
  await scenario('preview failure clears the old session and persists neither password nor code', async () => {
    const codes = ['preview-error-login-code', 'preview-error-code']
    const runtime = fakeRuntime([...codes])
    runtime.setStorageSync('token', 'old-session')
    runtime.setStorageSync('userInfo', { username: 'old-user' })
    runtime.setStorageSync('isAdmin', true)
    let commits = 0
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async () => ({ data: { needMerge: true } }),
      previewMerge: async () => { throw new Error('preview unavailable') },
      chooseMerge: async () => 'verified',
      commitMerge: async () => { commits++; return { token: 'unexpected-token' } }
    })
    await assert.rejects(flow(credentials), /preview unavailable/)
    assert.equal(commits, 0)
    assertNoSessionOrSecrets(runtime, codes, [credentials.password])
  })

  await scenario('commit failure clears the old session and persists neither password nor code', async () => {
    const codes = ['commit-error-login-code', 'commit-error-preview-code', 'commit-error-code']
    const runtime = fakeRuntime([...codes])
    runtime.setStorageSync('token', 'old-session')
    runtime.setStorageSync('userInfo', { username: 'old-user' })
    runtime.setStorageSync('isAdmin', true)
    const flow = createWechatPasswordLoginFlow({
      runtime,
      login: async () => ({ data: { needMerge: true } }),
      previewMerge: async () => ({ data: previewFor('error') }),
      chooseMerge: async () => 'verified',
      commitMerge: async () => { throw new Error('commit unavailable') }
    })
    await assert.rejects(flow(credentials), /commit unavailable/)
    assertNoSessionOrSecrets(runtime, codes, [credentials.password])
  })
}

async function testPageIntegrationAndComponent() {
  const componentUrl = new URL('../src/components/AccountMergeChoice.vue', import.meta.url)
  const componentSource = (await readFile(componentUrl, 'utf8')).replace(/\r\n/g, '\n')
  assert.match(componentSource, /当前微信账号/)
  assert.match(componentSource, /已验证的历史账号/)
  assert.match(componentSource, /v-if="!card\.direction\.canMerge" class="merge-blockers"/)
  assert.match(componentSource, /if \(card\.direction\.canMerge\) selected\.value = card\.value/)
  assert.match(componentSource, /:disabled="!selected"/)
  assert.doesNotMatch(componentSource.split('<script setup>')[0], /source/i, 'visible choice labels should avoid source terminology')

  for (const theme of ['pages', 'pages-dark']) {
    const page = (await readFile(new URL(`../src/${theme}/index/index.vue`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
    const template = page.split('<script setup>')[0]
    assert.match(template, /<AccountMergeChoice v-if="mergePreview" :preview="mergePreview"/)
    assert.match(template, /@choose="finishMergeChoice" @cancel="finishMergeChoice\(null\)"/)
    assert.match(page, /loginOptions\.chooseMerge = chooseMerge/)
    assert.match(page, /onUnload\(\(\) => \{ wechatPageActive = false; finishProfileCompletion\(\); finishMergeChoice\(null\) \}\)/)
    assert.match(page, /async function completeLogin\([\s\S]*?rememberWechatLogin\(uni, res, rememberMe\.value\)/)
    assert.match(page, /await completeLogin\(res, isauto\)/, 'a successful merge result should reuse the normal login completion path')
    assert.match(page, /uni\.reLaunch\(\{ url: pendingUrl \|\| '\/pages(?:-dark)?\/home\/home' \}\)/)
  }

  const require = createRequire(import.meta.url)
  const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
  const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
  const defaults = {
    APP: false, APP_PLUS: false, MP: false, MP_WEIXIN: false, H5: false, WEB: false,
    MP_ALIPAY: false, MP_BAIDU: false, MP_HARMONY: false, MP_QQ: false,
    MP_LARK: false, MP_TOUTIAO: false, MP_KUAISHOU: false, MP_JD: false, MP_XHS: false
  }
  const files = [
    ['src/components/AccountMergeChoice.vue', componentSource],
    ...await Promise.all(['pages', 'pages-dark'].map(async theme => {
      const filename = `src/${theme}/index/index.vue`
      return [filename, await readFile(new URL(`../${filename}`, import.meta.url), 'utf8')]
    }))
  ]
  for (const [filename, source] of files) {
    const { descriptor, errors } = parse(source, { filename })
    assert.equal(errors.length, 0, `${filename}: SFC parse should succeed`)
    compileScript(descriptor, { id: `account-merge-${filename}` })
    for (const target of ['mp-weixin', 'h5']) {
      const context = { ...defaults, ...(target === 'mp-weixin' ? { MP: true, MP_WEIXIN: true } : { H5: true, WEB: true }) }
      const template = preprocess(descriptor.template.content, context, 'html')
      const result = compileTemplate({ source: template, filename, id: `account-merge-${filename}-${target}` })
      assert.equal(result.errors.length, 0, `${filename} on ${target}: ${result.errors.map(String).join('\n')}`)
    }
  }

}

await testSuccessfulDirections()
await testBlockedDirectionAndCancellation()
await testErrorsDoNotPersistCredentialsOrSessions()
await scenario('both login themes reuse remember/home completion, cancel merge choices on unload, and compile with the merge component', testPageIntegrationAndComponent)
if (failures.length) {
  console.error(`account-merge checks failed (${failures.length}/${passed.length + failures.length}); passed: ${passed.length}`)
  process.exitCode = 1
} else {
  console.log(`account-merge checks passed (${passed.length} scenarios)`)
}
