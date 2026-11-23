import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { ref } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

const require = createRequire(import.meta.url)
const { initPreContext, preHtml, preJs } = require('@dcloudio/uni-cli-shared')
const source = readFileSync(new URL('../../src/utils/account/use-profile-account.js', import.meta.url), 'utf8')
const route = 'pages-dark/profile/profile'

function compileProfilePage(folder, platform) {
  initPreContext(platform)
  const filename = new URL(`../../src/${folder}/profile/profile.vue`, import.meta.url)
  const { descriptor, errors } = parse(preHtml(readFileSync(filename, 'utf8')), { filename: filename.pathname })
  const id = `${folder}-profile-${platform}`
  assert.equal(errors.length, 0, id)
  const compiled = compileScript(descriptor, { id })
  assert.match(compiled.content, /useProfileAccount\(points, profileRoute/)
  const template = compileTemplate({
    id, filename: filename.pathname, source: descriptor.template.content,
    compilerOptions: { bindingMetadata: compiled.bindings }
  })
  assert.equal(template.errors.length, 0, id)
}

function setup(platform) {
  initPreContext(platform)
  const code = preJs(source).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const storage = new Map()
  const requests = []
  const toasts = []
  const points = ref(0)
  const session = { unavailable: false }
  let visibleRoute = route
  let reconnect
  let show
  const useProfileAccount = runInNewContext(`${code}\nuseProfileAccount`, {
    ref,
    watch: (_, callback) => { reconnect = callback },
    onShow: callback => { show = callback },
    appOfflineSession: session,
    getAppCurrentPages: () => [{ route: visibleRoute }],
    getAppCachedProfile: () => ({ username: 'cached', points: 12, isAdmin: true }),
    userinfo: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    uni: {
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key),
      showToast: ({ title }) => toasts.push(title)
    }
  })
  const profile = useProfileAccount(points, route)
  return { profile, points, storage, requests, toasts, session, reconnect, show, setRoute: value => { visibleRoute = value } }
}

for (const platform of ['app', 'h5', 'mp-weixin']) {
  for (const folder of ['pages', 'pages-dark']) compileProfilePage(folder, platform)
  const { profile, points, storage, requests, toasts } = setup(platform)
  storage.set('isAdmin', true)
  await profile.loadInitialProfile()
  assert.equal(profile.username.value, '游客')
  assert.equal(storage.has('isAdmin'), false)
  assert.equal(requests.length, 0)

  storage.set('token', 'account')
  const initial = profile.loadInitialProfile()
  assert.equal(profile.loading.value, true)
  requests.shift().resolve({ code: 0, data: { username: 'online', points: 20, isAdmin: true } })
  await initial
  assert.equal(profile.loading.value, false)
  assert.equal(profile.username.value, 'online')
  assert.equal(points.value, 20)
  assert.equal(storage.get('isAdmin'), true)

  const refresh = profile.handleRefresh()
  requests.shift().reject({})
  await refresh
  assert.equal(toasts.at(-1), '网络错误')
  assert.equal(points.value, 20)
  const success = profile.handleRefresh()
  requests.shift().resolve({ code: 0, data: { points: 21, isAdmin: true } })
  await success
  assert.equal(toasts.at(-1), '刷新成功')
  assert.equal(points.value, 21)

  const verified = profile.verifyAdminPermission()
  requests.shift().resolve({ code: 0, data: { isAdmin: true } })
  assert.equal(await verified, true)
  const switched = profile.verifyAdminPermission()
  storage.set('token', 'another-account')
  requests.shift().resolve({ code: 0, data: { isAdmin: true } })
  assert.equal(await switched, false)
  const revoked = profile.verifyAdminPermission()
  requests.shift().resolve({ code: 0, data: { isAdmin: false } })
  assert.equal(await revoked, false)
  assert.equal(profile.isAdmin.value, false)
  assert.equal(storage.has('isAdmin'), false)
}

const app = setup('app')
app.storage.set('token', 'account')
app.storage.set('isAdmin', true)
app.session.unavailable = true
await app.profile.loadInitialProfile()
assert.equal(app.profile.username.value, 'cached')
assert.equal(app.points.value, 12)
assert.equal(app.profile.isAdmin.value, false)
assert.equal(app.storage.has('isAdmin'), false)
await app.profile.handleRefresh()
assert.equal(app.toasts.at(-1), '当前离线，联网后可刷新')
assert.equal(app.requests.length, 0)

app.session.unavailable = false
app.setRoute('pages/home/home')
app.reconnect()
assert.equal(app.requests.length, 0)
app.setRoute(route)
app.show()
app.requests.shift().resolve({ code: 0, data: { username: 'reconnected', points: 30 } })
await new Promise(resolve => setImmediate(resolve))
assert.equal(app.profile.username.value, 'reconnected')
assert.equal(app.points.value, 30)

console.log('Profile account checks passed for App, H5 and WeChat')
