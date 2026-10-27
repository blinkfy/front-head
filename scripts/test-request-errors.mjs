import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function createHarness() {
  const [requestUtils, databaseStatus] = await Promise.all([
    import(pathToFileURL(path.join(root, 'src/api/request-utils.mjs')).href),
    import(pathToFileURL(path.join(root, 'src/api/database-status.mjs')).href)
  ])
  let nextResponse
  const storage = new Map()
  const toasts = []
  const redirects = []
  const context = {
    URL,
    URLSearchParams,
    setTimeout: callback => {
      redirects.push(callback)
      return redirects.length
    },
    clearTimeout: () => {},
    appendQueryParams: requestUtils.appendQueryParams,
    isDatabaseHealthEndpoint: requestUtils.isDatabaseHealthEndpoint,
    markDatabaseOffline: databaseStatus.markDatabaseOffline,
    updateDatabaseStatusFromAvailability: databaseStatus.updateDatabaseStatusFromAvailability,
    baseUrl: 'https://api.example.test',
    uni: {
      request: options => {
        if (nextResponse.type === 'fail') options.fail(nextResponse.value)
        else options.success(nextResponse.value)
      },
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key),
      showToast: options => toasts.push(options),
      reLaunch: options => redirects.push(options)
    }
  }

  const source = fs.readFileSync(path.join(root, 'src/api/index.js'), 'utf8')
    .replace(/^import \{ baseUrl \} from '\.\/settings'\s*/m, '')
    .replace(/^import \{[\s\S]*?\} from '\.\/database-status\.mjs'\s*/m, '')
    .replace(/^import \{[\s\S]*?\} from '\.\/request-utils\.mjs'\s*/m, '')
    .replace(/export default request\s*$/, 'globalThis.__request = request')
  vm.runInNewContext(source, context, { filename: 'src/api/index.js' })

  return {
    request: context.__request,
    storage,
    toasts,
    redirects,
    respond(response) { nextResponse = response },
    async reject(options = {}) {
      try {
        await context.__request({ url: '/api/items', ...options })
        assert.fail('request should reject')
      } catch (error) {
        return error
      }
    },
    async resolve(options = {}) {
      return context.__request({ url: '/api/items', ...options })
    }
  }
}

const harness = await createHarness()
const { respond, reject, resolve, storage, toasts, redirects } = harness

for (const response of [
  { statusCode: 502, data: '<html>bad gateway</html>', errMsg: 'request:ok' },
  { statusCode: 500, data: '', errMsg: 'request:ok' }
]) {
  toasts.length = 0
  respond({ type: 'success', value: response })
  const error = await reject()
  assert.notEqual(error.msg, 'request:ok', 'HTTP failures must not surface uni.request success errMsg')
  assert.equal(error.msg, error.message)
  assert.equal(error.msg, error.errMsg)
  assert.notEqual(toasts[0]?.title, 'request:ok')
}

for (const statusCode of [503, 200]) {
  storage.clear()
  toasts.length = 0
  const body = { code: 2, msg: '数据库暂不可用' }
  respond({ type: 'success', value: { statusCode, data: body, errMsg: 'request:ok' } })
  const error = await reject()
  assert.equal(error.msg, body.msg, `${statusCode} code-2 error should preserve the response message`)
  assert.equal(error.message, body.msg)
  assert.equal(error.errMsg, body.msg)
  assert.equal(storage.get('dbOffline')?.offline, true, `${statusCode} code-2 response should mark database offline`)
}

for (const responseData of [{ code: 0 }, { status: 'degraded' }]) {
  respond({ type: 'success', value: { statusCode: 200, data: responseData } })
  assert.equal(await resolve(), responseData, 'ordinary success and degraded status should resolve')
}

for (const [errMsg, expected] of [
  ['request:fail timeout', /超时/],
  ['request:fail connect error', /网络|连接|不可用/]
]) {
  toasts.length = 0
  respond({ type: 'fail', value: { errMsg } })
  const error = await reject()
  assert.match(error.msg, expected)
  assert.equal(error.msg, error.message)
  assert.equal(error.msg, error.errMsg)
  assert.equal(toasts[0]?.title, error.msg)
}

for (const failure of [
  { message: 'timeout' },
  { errMsg: 'request:fail' },
  { message: 'Failed to fetch' }
]) {
  respond({ type: 'fail', value: failure })
  const error = await reject()
  assert.doesNotMatch(error.msg, /^(?:timeout|request:fail|Failed to fetch)$/i)
  assert.match(error.msg, /超时|连接|网络/)
  assert.equal(error.msg, error.message)
  assert.equal(error.msg, error.errMsg)
}

// Transport aborts do not prove that the user cancelled the request.
for (const failure of [
  { errMsg: 'request:fail abort' },
  { errMsg: 'request:fail net::ERR_ABORTED' },
  { message: 'The operation was canceled' }
]) {
  toasts.length = 0
  respond({ type: 'fail', value: failure })
  const error = await reject()
  assert.match(error.msg, /无法连接服务器/)
  assert.match(error.msg, /后端地址/)
  assert.doesNotMatch(error.msg, /已取消/)
  assert.equal(error.msg, error.message)
  assert.equal(error.msg, error.errMsg)
  assert.equal(error.originalErrMsg, failure.errMsg || failure.message)
  assert.equal(toasts[0]?.title, error.msg)
}

toasts.length = 0
respond({ type: 'success', value: { statusCode: 200, data: { code: 1 }, errMsg: 'request:ok' } })
const businessError = await reject()
assert.equal(businessError.msg, '请求失败，请稍后重试', 'business errors without a message should use a readable fallback')
assert.equal(businessError.msg, businessError.message)
assert.equal(businessError.msg, businessError.errMsg)

storage.set('token', 'active-token')
toasts.length = 0
respond({ type: 'success', value: { statusCode: 401, data: {}, errMsg: 'request:ok' } })
const unauthorized = await reject()
assert.equal(unauthorized.msg, unauthorized.message)
assert.equal(unauthorized.msg, unauthorized.errMsg)
assert.ok(toasts.some(toast => toast.title === '请重新登录'), '401 should retain the re-login toast')
assert.equal(storage.has('token'), false, '401 should clear the token')
assert.equal(redirects.length, 1, '401 should schedule the login redirect')

toasts.length = 0
respond({ type: 'success', value: { statusCode: 502, data: '', errMsg: 'request:ok' } })
const silentError = await reject({ silent: true })
assert.equal(toasts.length, 0, 'silent request failures should not show a toast')
assert.ok(silentError.msg && silentError.message && silentError.errMsg, 'silent rejection should remain readable')
assert.equal(silentError.msg, silentError.message)
assert.equal(silentError.msg, silentError.errMsg)

console.log('Request error regression checks passed.')
