import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { appendQueryParams } from '../src/api/request-utils.mjs'

const sent = []
const uni = {
  storage: { token: 'test-token' },
  getStorageSync(key) { return this.storage[key] },
  setStorageSync(key, value) { this.storage[key] = value }, removeStorageSync(key) { delete this.storage[key] },
  showToast() {}, reLaunch() {},
  request(options) { sent.push(options); options.success({ statusCode: 200, data: { code: 0, data: { ok: true } } }) }
}
const requestSource = readFileSync(new URL('../src/api/index.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*/gm, '')
  .replace('export default request', 'this.request = request')
const requestContext = { uni, baseUrl: 'https://test.invalid', appendQueryParams, isDatabaseHealthEndpoint: () => false, updateDatabaseStatusFromAvailability() {}, markDatabaseOffline() {}, clearChatBadge() {}, appVersionGuard: () => ({ handleUpgrade: () => false }) }
runInNewContext(requestSource, requestContext, { filename: 'api/index.js' })

const recyclingSource = readFileSync(new URL('../src/pages-nonTheme/api/recycling.js', import.meta.url), 'utf8')
  .replace("import request from '@/api/index.js'", '')
  .replace(/^export /gm, '')
const recyclingContext = { request: requestContext.request, uni, getCurrentPages: () => [] }
const recyclingNames = [...recyclingSource.matchAll(/^(?:async )?function (\w+)\(|^const (\w+)\s*=/gm)].map(match => match[1] || match[2])
runInNewContext(`${recyclingSource}\nthis.recycling = { ${recyclingNames.join(', ')} }`, recyclingContext, { filename: 'api/recycling.js' })

await recyclingContext.recycling.collectorOrders('mine', { page: 2, status: 'active', date: undefined, ignored: null })
assert.match(sent[0].url, /\/api\/collector\/orders\/mine\?page=2&status=active&token=test-token$/)
assert.doesNotMatch(sent[0].url, /undefined|null/)
await recyclingContext.recycling.recyclingRequest('/api/example', 'POST', { photoIds: null, enabled: false })
assert.deepEqual({ ...sent[1].data }, { photoIds: null, enabled: false, token: 'test-token' }, 'write data stays in request body and preserves null/false values')
await recyclingContext.recycling.collectorSettings({ enabled: false, photoIds: null })
assert.deepEqual({ ...sent[2].data }, { enabled: false, photoIds: null, token: 'test-token' }, 'PATCH body preserves false and null')
await recyclingContext.recycling.collectorTimeline('2026-11-12')
assert.match(sent[3].url, /\/api\/collector\/timeline\?date=2026-11-12&token=test-token$/)

const componentSource = readFileSync(new URL('../src/pages-nonTheme/collector-workbench.vue', import.meta.url), 'utf8')
const componentScript = componentSource.match(/<script>([\s\S]*?)<\/script>/)?.[1]
assert.ok(componentScript, 'collector workbench script exists')
const pending = []
const componentContext = {
  RecyclingShell: {}, RecyclingServiceMap: {}, RecyclingTimeline: {}, bookingStatusText: value => value, collectorStatusText: value => value,
  formatBookingDate: () => '2026-11-12', collectorMe: async () => ({}), collectorSettings: async () => {},
  collectorAvailability: async () => {}, collectorWeeklyAvailability: async () => {},
  collectorOrders: () => new Promise(resolve => pending.push(resolve)), uni: { showToast() {} },
  module: { exports: {} }
}
runInNewContext(componentScript.replace(/^import .*;?\r?\n/gm, '').replace('export default {', 'module.exports = {'), componentContext, { filename: 'collector-workbench.vue' })
const component = componentContext.module.exports
const state = { ...component.data(), ...component.methods }
state.tab = 'mine'; state.status = 'active'; state.me = { profile: { acceptingOrders: true } }; state.error = '旧错误'; state.orders = [{ id: 'keep' }]
const loading = state.loadOrders(true)
assert.equal(state.loadingOrders, true)
const versionBeforeSettings = state.queryVersion
state.changeTab('settings')
assert.equal(state.error, '', 'settings tab clears the stale list error')
assert.equal(state.loadingOrders, false, 'settings tab releases the list loading state')
assert.equal(state.queryVersion, versionBeforeSettings + 1, 'settings tab invalidates in-flight list responses')
pending[0]({ orders: [{ id: 'stale response' }], totalPages: 1 })
await loading
assert.equal(state.orders[0].id, 'keep', 'late list response cannot overwrite the preserved list in settings')
assert.equal(state.error, '', 'late list response cannot restore a stale error')

console.log('recycling request query/body routing and settings stale-response checks passed')
