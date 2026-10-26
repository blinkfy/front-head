import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import {
  DEVICE_SCAN_PAGE,
  appendPageQuery,
  isLegacyDeviceScanPath,
  resolveLegacyDeviceScanUrl
} from '../src/utils/device-qr-entry.mjs'

const pagesFile = new URL('../src/pages.json', import.meta.url)
const scanFile = new URL('../src/pages-nonTheme/scan.vue', import.meta.url)
const appFile = new URL('../src/App.vue', import.meta.url)
const themeFile = new URL('../src/utils/theme.js', import.meta.url)
const pages = JSON.parse(await readFile(pagesFile, 'utf8'))
const scanSource = await readFile(scanFile, 'utf8')

const registeredRoutes = [
  ...(pages.pages || []).map(page => page.path),
  ...(pages.subPackages || []).flatMap(pkg => (pkg.pages || []).map(page => `${pkg.root}/${page.path}`))
]
assert.equal(
  registeredRoutes.filter(route => route === 'pages-nonTheme/scan').length,
  1,
  'the shared scan page is registered exactly once'
)
assert.equal(registeredRoutes.includes('pages/scan/scan'), false, 'the old light scan route is not registered')
assert.equal(registeredRoutes.includes('pages-dark/scan/scan'), false, 'the old dark scan route is not registered')
assert.equal(
  (pages.tabBar?.list || []).some(item => item.pagePath === 'pages-nonTheme/scan'),
  false,
  'the shared scan page is not a tab bar entry'
)

const { descriptor, errors: parseErrors } = parse(scanSource, { filename: scanFile.pathname })
assert.deepEqual(parseErrors, [], 'the shared scan page parses as a Vue SFC')
assert.ok(descriptor.template, 'the shared scan page contains a template')
assert.ok(descriptor.script || descriptor.scriptSetup, 'the shared scan page contains a script')

const compiledScript = compileScript(descriptor, { id: 'shared-scan-page' })
const compiledTemplate = compileTemplate({
  source: descriptor.template.content,
  filename: scanFile.pathname,
  id: 'shared-scan-page',
  compilerOptions: { bindingMetadata: compiledScript.bindings }
})
assert.deepEqual(compiledTemplate.errors, [], 'the shared scan page template compiles')

const appSource = await readFile(appFile, 'utf8')
const { descriptor: appDescriptor, errors: appParseErrors } = parse(appSource, { filename: appFile.pathname })
assert.deepEqual(appParseErrors, [], 'App.vue parses as a Vue SFC')
assert.ok(appDescriptor.script, 'App.vue has a script to exercise')

function createAppHarness() {
  const state = {
    theme: 'dark',
    pages: [{ route: 'pages/index/index', options: {} }],
    relaunches: [],
    timers: []
  }
  const context = vm.createContext({
    ThemeManager: { getTheme: () => state.theme },
    initGlobalMessageBus() {},
    warmManifestIcons() {},
    captureRegistrationEntry() {},
    offerRegistrationRetry() {},
    DEVICE_SCAN_PAGE,
    appendPageQuery,
    isLegacyDeviceScanPath,
    resolveLegacyDeviceScanUrl,
    getCurrentPages: () => state.pages,
    setTimeout: (callback, delay) => {
      state.timers.push({ callback, delay })
      return state.timers.length
    },
    uni: { reLaunch: options => state.relaunches.push({ url: String(options?.url || '') }) },
    console: { log() {}, warn() {}, error() {} }
  })
  const executable = appDescriptor.script.content
    .replace(/^import[^\r\n]*\r?\n/gm, '')
    .replace(/export default\s*\{/, 'globalThis.__app = {')
  vm.runInContext(executable, context, { filename: appFile.pathname })
  return { app: context.__app, state }
}

const scene = '0123456789abcdef0123456789abcdef'
for (const path of ['pages/scan/scan', 'pages-dark/scan/scan', 'pages-nonTheme/scan']) {
  const { app, state } = createAppHarness()
  app.onLaunch.call({ startLoading() {} }, { path })
  assert.deepEqual(state.relaunches, [], `dark launch from ${path} skips theme redirection`)
  assert.deepEqual(state.timers, [], `dark launch from ${path} schedules no theme redirect`)
}

const missingScan = createAppHarness()
const missingScanOptions = {
  path: 'pages-dark/scan/scan',
  query: { scene, token: '中文=abc' }
}
missingScan.app.onPageNotFound(missingScanOptions)
assert.deepEqual(missingScan.state.relaunches, [{
  url: `${DEVICE_SCAN_PAGE}?scene=${scene}&token=%E4%B8%AD%E6%96%87%3Dabc`
}], 'a legacy missing-page route synchronously relaunches the shared page with its query')

const unknownPage = createAppHarness()
unknownPage.app.onPageNotFound({ path: 'pages/unknown/detail', query: { scene } })
assert.deepEqual(unknownPage.state.relaunches, [], 'unknown missing routes are left alone')

const ordinaryDarkHome = createAppHarness()
ordinaryDarkHome.app.onLaunch.call({ startLoading() {} }, {
  path: 'pages/index/index',
  query: { campaign: 'launch' }
})
assert.equal(ordinaryDarkHome.state.timers.length, 1, 'ordinary dark home launch keeps its deferred theme redirect')
assert.equal(ordinaryDarkHome.state.timers[0].delay, 100)
assert.deepEqual(ordinaryDarkHome.state.relaunches, [], 'the ordinary theme redirect stays deferred')
ordinaryDarkHome.state.timers[0].callback()
assert.deepEqual(ordinaryDarkHome.state.relaunches, [{
  url: '/pages-dark/index/index?campaign=launch'
}], 'ordinary dark home launch still redirects to the dark page')

const themeSource = await readFile(themeFile, 'utf8')
const themeStorage = new Map([['app_theme', 'light']])
const themeEvents = []
const themeRoutes = []
const themeContext = vm.createContext({
  DEVICE_SCAN_PAGE,
  appendPageQuery,
  resolveLegacyDeviceScanUrl,
  uni: {
    getStorageSync: key => themeStorage.get(key),
    setStorageSync: (key, value) => themeStorage.set(key, value),
    $emit: (...args) => themeEvents.push(args),
    reLaunch: options => themeRoutes.push(['reLaunch', options]),
    redirectTo: options => themeRoutes.push(['redirectTo', options])
  },
  getCurrentPages: () => [{ route: 'pages-nonTheme/scan', options: { scene } }],
  console: { log() {}, warn() {}, error() {} }
})
const executableTheme = themeSource
  .replace(/^import[^\r\n]*\r?\n/gm, '')
  .replace(/^export const ThemeManager\s*=/m, 'globalThis.__themeManager =')
  .replace(/^export\s+/gm, '')
vm.runInContext(executableTheme, themeContext, { filename: themeFile.pathname })
const themeManager = themeContext.__themeManager
themeManager.setTheme('dark')
themeManager.toggleTheme()
themeManager.initTheme('pages-nonTheme/scan', { scene })
assert.equal(themeStorage.get('app_theme'), 'light', 'toggleTheme updates the stored theme')
assert.deepEqual(themeEvents, [
  ['app-theme-change', 'dark'],
  ['app-theme-change', 'light']
], 'theme changes emit updates for the shared page')
assert.deepEqual(themeRoutes, [], 'theme changes and shared-page initialization do not restart navigation')

console.log('Scan route migration checks passed: shared route, App guards, legacy recovery, theme behavior and Vue compilation.')
