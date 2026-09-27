import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { reconcileDepositFeedback } from '../src/utils/device-session-feedback.mjs'
import { appendQueryParams, isDatabaseHealthEndpoint } from '../src/api/request-utils.mjs'
import { markDatabaseOffline, updateDatabaseStatusFromAvailability } from '../src/api/database-status.mjs'

const seen = new Map()
const old = { id: 'old', status: 'credited', pointsAwarded: 3 }
assert.deepEqual(reconcileDepositFeedback(seen, [old], false), { newRecords: [], pointsDelta: 0 })
assert.equal(reconcileDepositFeedback(seen, [old], true).pointsDelta, 0)
const pending = { id: 'new', status: 'processing', pointsAwarded: null }
assert.deepEqual(reconcileDepositFeedback(seen, [pending, old], true), { newRecords: [pending], pointsDelta: 0 })
const credited = { ...pending, status: 'credited', pointsAwarded: 2 }
assert.deepEqual(reconcileDepositFeedback(seen, [credited, old], true), { newRecords: [], pointsDelta: 2 })
assert.equal(reconcileDepositFeedback(seen, [credited], true).pointsDelta, 0)
const second = { id: 'second', status: 'credited', pointsAwarded: 1 }
const third = { id: 'third', status: 'credited', pointsAwarded: 3 }
assert.equal(reconcileDepositFeedback(seen, [third, second, credited], true).pointsDelta, 4)
assert.equal(reconcileDepositFeedback(seen, [old, third], true).pointsDelta, 0)
console.log('Device feedback verification passed: baseline, new records, delayed credits, multiple credits and no repeated animations.')

// Exercise the actual shared request wrapper: session polling stays quiet while
// other requests retain their existing notifications and auth handling.
const storage = new Map()
const toasts = []
let response = { fail: true }
const runtime = {
  getStorageSync: key => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key),
  showToast: value => toasts.push(value),
  request: options => response.fail
    ? options.fail({ errMsg: 'offline' })
    : options.success({ statusCode: response.statusCode || 200, data: response.data }),
  reLaunch() {}
}
const source = fs.readFileSync(new URL('../src/api/index.js', import.meta.url), 'utf8')
const context = vm.createContext({
  uni: runtime, baseUrl: 'http://test.local', appendQueryParams, isDatabaseHealthEndpoint,
  markDatabaseOffline, updateDatabaseStatusFromAvailability,
  setTimeout: () => 1, URL, URLSearchParams
})
vm.runInContext(source.slice(source.indexOf('let loginRedirectTimer')).replace('export default request', 'globalThis.request = request'), context)
await assert.rejects(context.request({ url: '/api/device/1/session', silent: true }))
assert.equal(toasts.length, 0)
await assert.rejects(context.request({ url: '/api/ordinary-request' }))
assert.equal(toasts.length, 1, 'ordinary request errors retain toast feedback')
toasts.length = 0
response = { statusCode: 503, data: { msg: 'unavailable' } }
await assert.rejects(context.request({ url: '/api/device/1/session', silent: true }))
assert.equal(toasts.length, 0)
response = { data: { code: 2, msg: 'database offline' } }
await assert.rejects(context.request({ url: '/api/device/1/session', silent: true }))
assert.equal(toasts.length, 0, 'quiet polling still updates database availability without a toast')
response = { statusCode: 401, data: { msg: 'unauthorized' } }
await assert.rejects(context.request({ url: '/api/device/1/session', silent: true }))
assert.equal(toasts.length, 1, 'quiet polling must not suppress authentication expiry')
console.log('Request verification passed: quiet network/server/database errors, unchanged ordinary notifications and authentication expiry.')
