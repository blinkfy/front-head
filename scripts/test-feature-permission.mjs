import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const source = fs.readFileSync(new URL('../src/utils/feature-permission.js', import.meta.url), 'utf8')

function preprocess(source, platform) {
  const stack = [true], output = []
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\s*\/\/\s*#(ifdef|ifndef|endif)\s*(.*)$/)
    if (!directive) { if (stack.at(-1)) output.push(line); continue }
    const [, kind, expression] = directive
    if (kind === 'endif') stack.pop()
    else {
      const matches = expression.split('||').map(value => value.trim()).includes(platform)
      stack.push(stack.at(-1) && (kind === 'ifdef' ? matches : !matches))
    }
  }
  assert.deepEqual(stack, [true], 'platform preprocessor blocks are balanced')
  return output.join('\n')
}

function harness(platform, options = {}) {
  const calls = { requests: [], modals: [], appSettings: 0, miniSettings: 0, authorizations: [], chooser: [],
    modalCallbacks: [], authSettings: { ...(options.authSettings || {}) }, checks: [], appAuthSettings: options.appAuthSettings || {} }
  const grantedPermissions = new Set(options.granted || [])
  let permissionResults = [...(options.permissionResults || [])]
  let modalResults = [...(options.modalResults || [])]
  let miniSettingsResult = options.miniSettingsResult || { authSetting: {} }
  let authorizeSucceeds = options.authorizeSucceeds === true
  let current = true
  const uni = {
    getAppAuthorizeSetting: () => calls.appAuthSettings,
    getSetting({ success }) { success({ authSetting: { ...calls.authSettings } }) },
    authorize({ scope, success, fail }) {
      calls.authorizations.push(scope)
      if (authorizeSucceeds) { calls.authSettings[scope] = true; success?.({}) }
      else fail?.({ errMsg: 'authorize:fail auth deny' })
    },
    openSetting({ success, fail }) {
      calls.miniSettings++
      if (miniSettingsResult instanceof Error) fail?.(miniSettingsResult)
      else { Object.assign(calls.authSettings, miniSettingsResult.authSetting || {}); success?.(miniSettingsResult) }
    },
    openAppAuthorizeSetting({ success }) { calls.appSettings++; success?.({}) },
    showModal({ success, ...modal }) {
      calls.modals.push(modal)
      const answer = modalResults.shift()
      if (answer === 'defer') calls.modalCallbacks.push(success)
      else success?.(answer ?? { confirm: false })
    },
    showToast() {},
    chooseImage(options) { calls.chooser.push(options) }
  }
  const plus = {
    os: { name: options.osName || 'Android' },
    android: {
      importClass(name) {
        if (name === 'android.os.Build$VERSION') return { SDK_INT: options.sdk || 35 }
        return function NativeClass(...args) { this.args = args }
      },
      runtimeMainActivity() {
        return {
          checkSelfPermission(permission) { calls.checks.push(permission); return grantedPermissions.has(permission) ? 0 : -1 },
          getPackageName: () => 'com.example.app',
          startActivity() { calls.appSettings++ }
        }
      }
    }
  }
  const context = {
    console, Promise, Map, Set, Number, String, Object, Array, RegExp, Error, JSON,
    uni, plus,
    requestRealtimePermissions(permissions) {
      calls.requests.push([...permissions])
      const next = permissionResults.shift()
      if (next instanceof Error) return Promise.reject(next)
      const result = next || { granted: [], deniedPresent: permissions, deniedAlways: [] }
      for (const name of result.granted || []) grantedPermissions.add(name)
      return Promise.resolve(result)
    },
    getCurrentPages: () => [{ route: current ? 'active-page' : 'stale-page' }]
  }
  vm.createContext(context)
  const compiled = preprocess(source, platform).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  vm.runInContext(`${compiled}\nglobalThis.__api = { ensureFeaturePermission, openFeaturePermissionSettings, isPermissionDenied, chooseImageWithPermission }`, context)
  return { api: context.__api, calls, setPermissionResults(value) { permissionResults = [...value] },
    setModalResults(value) { modalResults = [...value] }, setMiniSettingsResult(value) { miniSettingsResult = value },
    setAuthorizeSucceeds(value) { authorizeSucceeds = value }, setCurrent(value) { current = value }, isCurrent: () => current }
}

// Android: each deliberate retry asks again after an ordinary denial; granted
// state short-circuits future requests. A permanent denial offers Settings.
{
  const h = harness('APP-PLUS', { permissionResults: [
    { granted: [], deniedPresent: ['android.permission.CAMERA'], deniedAlways: [] },
    { granted: ['android.permission.CAMERA'], deniedPresent: [], deniedAlways: [] }
  ] })
  assert.equal(await h.api.ensureFeaturePermission('camera'), false, 'ordinary camera denial is returned to the caller')
  assert.equal(await h.api.ensureFeaturePermission('camera'), true, 'a later deliberate attempt can request camera again')
  assert.equal(h.calls.requests.length, 2)
  assert.equal(h.calls.appSettings, 0, 'ordinary denial does not send the user to Settings')
  assert.equal(await h.api.ensureFeaturePermission('camera'), true, 'already granted permission is recognized from Android state')
  assert.equal(h.calls.requests.length, 2, 'granted permission does not prompt again')
}

{
  const h = harness('APP-PLUS', { permissionResults: [
    { granted: [], deniedPresent: [], deniedAlways: ['android.permission.RECORD_AUDIO'] }
  ], modalResults: [{ confirm: true }] })
  assert.equal(await h.api.ensureFeaturePermission('microphone'), false, 'opening App Settings still requires a fresh feature action')
  assert.equal(h.calls.modals.length, 1)
  assert.equal(h.calls.appSettings, 1, `permanent Android denial opens App authorization settings (${JSON.stringify(h.calls)})`)
  assert.match(h.calls.modals[0].content, /麦克风/)
}

{
  const h = harness('APP-PLUS', { granted: [], permissionResults: [{ granted: [], deniedAlways: ['android.permission.CAMERA'] }],
    modalResults: [{ confirm: false }] })
  assert.equal(await h.api.ensureFeaturePermission('camera'), false)
  assert.equal(h.calls.appSettings, 0, 'canceling the settings prompt leaves the feature denied')
  assert.equal(await h.api.ensureFeaturePermission('camera', { interactive: false }), false)
  assert.equal(h.calls.requests.length, 1, 'silent checks never launch another Android permission request')
  assert.equal(h.calls.modals.length, 1, 'silent checks never show recovery UI')
}

{
  const h = harness('APP-PLUS', { permissionResults: [{ granted: [], deniedPresent: ['android.permission.ACCESS_FINE_LOCATION'] }] })
  h.setCurrent(false)
  assert.equal(await h.api.ensureFeaturePermission('location', { isCurrent: h.isCurrent }), false, 'stale page ignores permission requests')
  assert.equal(h.calls.modals.length, 0)
}

// Mini-program: inspect existing grants, use authorize only when unknown,
// and send a known denial through settings. A fresh action may then proceed.
{
  const scope = 'scope.camera'
  const h = harness('MP', { authSettings: { [scope]: true } })
  assert.equal(await h.api.ensureFeaturePermission('camera'), true)
  assert.equal(h.calls.authorizations.length, 0, 'already-authorized MP scopes skip authorize')
  assert.equal(await h.api.ensureFeaturePermission('camera', { interactive: false }), true)
}

{
  const scope = 'scope.record'
  const h = harness('MP', { authSettings: { [scope]: false }, modalResults: [{ confirm: true }],
    miniSettingsResult: { authSetting: { [scope]: true } } })
  assert.equal(await h.api.ensureFeaturePermission('microphone'), true, 'grant in MP settings is confirmed on return')
  assert.equal(h.calls.authorizations.length, 0, 'known denial goes to settings instead of repeating authorize')
  assert.equal(h.calls.miniSettings, 1)
}

{
  const scope = 'scope.camera'
  const h = harness('MP', { authSettings: { [scope]: false }, modalResults: [{ confirm: true }],
    miniSettingsResult: { authSetting: { [scope]: false } } })
  assert.equal(await h.api.ensureFeaturePermission('camera'), false, 'return without granting remains denied')
  assert.equal(h.calls.miniSettings, 1)
  assert.equal(await h.api.ensureFeaturePermission('camera', { interactive: false }), false)
  assert.equal(h.calls.miniSettings, 1, 'silent MP checks never open Settings')
}

{
  const scope = 'scope.userLocation'
  const h = harness('MP', { authSettings: {}, authorizeSucceeds: true })
  assert.equal(await h.api.ensureFeaturePermission('location'), true, 'unknown MP scope uses authorize')
  assert.deepEqual(h.calls.authorizations, [scope])
}

// H5 APIs own permission prompts: only explicit retries reach browser APIs;
// the helper must not fabricate an allow state for a stale page.
{
  const h = harness('H5')
  assert.equal(await h.api.ensureFeaturePermission('camera'), true)
  assert.equal(await h.api.ensureFeaturePermission('location', { interactive: false }), true,
    'helper does not show UI or cache a denial for H5; the feature action owns the actual API call')
  h.setCurrent(false)
  assert.equal(await h.api.ensureFeaturePermission('camera', { isCurrent: h.isCurrent }), false)
  assert.equal(h.api.isPermissionDenied({ name: 'NotAllowedError' }), true)
  assert.equal(h.api.isPermissionDenied({ errMsg: 'authorize:fail auth deny' }), true)
  assert.equal(h.api.isPermissionDenied(new Error('camera busy')), false)
}

// A settings dialog is singleton while its first prompt is unresolved.
{
  const h = harness('MP')
  h.setModalResults(['defer'])
  const first = h.api.openFeaturePermissionSettings('album')
  await Promise.resolve()
  assert.equal(h.calls.modals.length, 1)
  assert.equal(await h.api.openFeaturePermissionSettings('camera'), false, 'parallel recovery cannot open a second modal')
  assert.equal(h.calls.modals.length, 1)
  h.calls.modalCallbacks[0]({ confirm: false })
  assert.equal(await first, false, 'canceling the prompt does not open Settings')
}

console.log('Feature permission App, MP, and H5 tests passed.')
