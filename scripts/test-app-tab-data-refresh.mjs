import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

let now = 1000, owner = 'first', aiRequests = [], productRequests = 0, pointsRequests = 0
let offline = false, points = 40, stock = 10
const context = vm.createContext({
  Date: class extends Date { static now() { return now } },
  ref: value => ({ value }), shallowRef: value => ({ value }),
  baseUrl: 'https://example.test',
  uni: { request: options => aiRequests.push(options), getStorageSync: () => owner },
  getAppCachedProfile: () => ({ points: 20 }),
  async fetchShopProducts() {
    productRequests++
    if (offline) throw new Error('offline')
    return { data: [{ id: 1, status: 'active', stock }, { id: 2, status: 'inactive' }] }
  },
  async userinfo() {
    pointsRequests++
    if (offline) throw new Error('offline')
    return { code: 0, data: { points } }
  }
})
for (const file of ['timed-resource.mjs', 'app-home-ai-settings.js', 'app-shop-cache.mjs', 'use-app-shop-data.js']) {
  const source = fs.readFileSync(new URL(`../src/utils/${file}`, import.meta.url), 'utf8')
  vm.runInContext(source.replace(/^import .*$/gm, '').replace(/^export /gm, ''), context, { filename: file })
}
const run = code => vm.runInContext(code, context)
const flush = () => new Promise(setImmediate)
const initialRevision = '2026-11-01T00:00:00Z', changedRevision = '2026-11-01T00:01:00Z'
function replyAi(aiEnabled, settingsUpdatedAt) {
  aiRequests.at(-1).success({ statusCode: 200, data: { code: 0, data: { aiEnabled, settingsUpdatedAt } } })
}

const ai = run('readAppHomeAiSettings()')
assert.equal(run('readAppHomeAiSettings()'), ai)
await flush()
assert.equal(aiRequests.length, 1)
replyAi(true, initialRevision)
await ai
assert.equal((await run('readAppHomeAiSettings()')).aiEnabled, true)
assert.equal(aiRequests.length, 1)
now += 30_001
const failed = run('readAppHomeAiSettings()')
await flush()
aiRequests.at(-1).fail(new Error('offline'))
await assert.rejects(failed, /offline/)
assert.equal(run('getCachedAppHomeAiEnabled()'), true)
const stale = run('readAppHomeAiSettings()')
await flush()
context.invalidateAppHomeAiSettings(changedRevision)
replyAi(true, initialRevision)
await assert.rejects(stale)
const updated = run('readAppHomeAiSettings()')
await flush()
replyAi(false, changedRevision)
assert.equal((await updated).aiEnabled, false)

const shop = context.useAppShopData({ isDisposed: () => false, onDataChange() {} })
const showShop = () => Promise.all([shop.loadProducts(false), shop.fetchPoints(false)])
await Promise.all([showShop(), showShop()])
await showShop()
assert.equal(productRequests, 1)
assert.equal(pointsRequests, 1)
assert.equal(shop.products.value.length, 1)
assert.equal(shop.userPoints.value, 40)
now += 16_000
points = 41
await showShop()
assert.equal(productRequests, 1, 'balance and catalog age independently')
assert.equal(shop.userPoints.value, 41)
run('appShopCatalog.invalidate(); appShopPoints.invalidate()')
offline = true
const background = showShop()
assert.equal(shop.catalogReady.value, true)
assert.equal(shop.loading.value, false)
await background
assert.equal(shop.productsError.value, '')
assert.equal(shop.userPoints.value, 41)
offline = false
points = 30
stock = 9
await showShop()
assert.equal(shop.products.value[0].stock, 9)
assert.equal(shop.userPoints.value, 30)
points = 29
assert.equal(await shop.fetchPoints(true), true)
assert.equal(shop.userPoints.value, 29, 'manual refresh fetches even while fresh')
owner = 'second'
points = 2
const newAccount = showShop()
assert.equal(shop.products.value.length, 0)
assert.equal(shop.userPoints.value, 0)
await newAccount
assert.equal(shop.userPoints.value, 2)

console.log('APP tab data: fresh cache, in-flight deduplication, invalidation, failure retention and account isolation passed')
