import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { computed, ref, shallowRef } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

const require = createRequire(import.meta.url)
const { initPreContext, preHtml, preJs } = require('@dcloudio/uni-cli-shared')
const read = path => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')
const tick = () => new Promise(resolve => setImmediate(resolve))
const logic = file => preJs(read(`utils/${file}`))
  .replace(/^import\s+(?:\{[^}]*\}|[^\n]+)\s+from\s+['"][^'"]+['"][ \t]*;?/gm, '')
  .replace(/^export /gm, '')

function fixture(platform) {
  initPreContext(platform)
  let token = 'first'
  let dispose
  const calls = { catalog: [], points: [], recommendation: [], toast: [], navigation: [] }
  const defer = (target, payload) => new Promise((resolve, reject) => calls[target].push({ token, payload, resolve, reject }))
  const context = {
    ref, computed, shallowRef, onBeforeUnmount: fn => { dispose = fn },
    useAppTabContext: () => platform === 'app',
    getAppCachedProfile: () => token === 'second' ? { points: 7 } : null,
    fetchShopProducts: () => defer('catalog'),
    userinfo: () => defer('points'),
    fetchShopRecommendations: options => defer('recommendation', options),
    uni: {
      getStorageSync: key => key === 'token' ? token : key === 'userPoints' ? 999 : '',
      showToast: options => calls.toast.push(options),
      navigateTo: options => calls.navigation.push(options)
    }
  }
  const sources = ['timed-resource.mjs', 'app-shop-cache.mjs', 'use-app-shop-data.js',
    'shop-recommendation.js', 'use-shop-page.js', 'use-shop-product-detail.js']
  const { useShopPage, useShopProductDetail } = runInNewContext(sources.map(logic).join('\n') +
    '\n;({ useShopPage, useShopProductDetail })', context)
  return {
    shop: useShopPage({ signedOutPoints: '未登录', refreshSuccessText: '积分刷新成功' }),
    detail: useShopProductDetail(), calls, setToken: value => { token = value }, dispose: () => dispose()
  }
}

const product = (id, stock = 1) => ({ id, name: id, type: 'physical', status: 'active', stock, points: 4, category: 1 })
const catalog = (...items) => ({ code: 0, data: { products: items } })
const balance = points => ({ code: 0, data: { points } })

for (const platform of ['app', 'h5']) {
  const { shop, calls, setToken, dispose } = fixture(platform)
  const firstShow = shop.refreshShop()
  await tick()
  calls.catalog[0].resolve(catalog(product('first item')))
  calls.points[0].resolve(balance(81))
  await tick()
  assert.equal(calls.recommendation[0].payload.currentPoints, 81)
  setToken('second')
  const secondShow = shop.refreshShop()
  await tick()
  assert.equal(shop.userPoints.value, 0)
  assert.equal(shop.filteredProducts.value.length, 0)
  calls.catalog[1].resolve(catalog(product('second item'), { ...product('hidden'), status: 'inactive' }))
  calls.points[1].resolve(balance(20))
  await tick()
  assert.equal(calls.recommendation[1].payload.currentPoints, 20)
  assert.equal(calls.recommendation[1].payload.candidateProducts[0].name, 'second item')
  calls.recommendation[0].resolve({ names: ['first item'] })
  await firstShow
  assert.equal(shop.recommendedNames.value.length, 0)
  assert.equal(shop.recommendLoading.value, true, 'old account cannot clear the new request loading state')

  const refresh = shop.refreshPoints()
  await tick()
  calls.points[2].resolve(balance(14))
  await refresh
  assert.equal(shop.userPoints.value, 14)
  assert.equal(calls.toast.at(-1).title, '积分刷新成功')
  calls.recommendation[1].resolve({ names: ['stale input'] })
  await secondShow
  assert.equal(shop.recommendedNames.value.length, 0)
  assert.equal(calls.recommendation[2].payload.currentPoints, 14)
  calls.recommendation[2].resolve({ names: ['second item'] })
  await tick()
  assert.deepEqual(Array.from(shop.recommendedNames.value), ['second item'])
  await shop.switchCategory(2)
  assert.deepEqual(Array.from(shop.filteredProducts.value, item => item.id), ['second item'])

  if (platform === 'app') {
    await shop.refreshShop()
    assert.equal(calls.catalog.length, 2, 'fresh app catalog is retained')
    assert.equal(calls.points.length, 3, 'fresh app points are retained')
  }
  const failed = shop.refreshPoints()
  await tick()
  calls.points[3].reject(new Error('offline'))
  await failed
  assert.equal(shop.userPoints.value, 14, 'same-account fallback retains the last balance')
  assert.equal(calls.toast.at(-1).icon, 'none')
  assert.equal(shop.loading.value, false)

  const disposed = shop.refreshPoints()
  await tick()
  const toastCount = calls.toast.length
  dispose()
  calls.points[4].resolve(balance(99))
  await disposed
  assert.equal(shop.userPoints.value, 14)
  assert.equal(calls.toast.length, toastCount)
}

const { shop, detail, calls, setToken } = fixture('h5')
const oldShow = shop.refreshShop()
setToken('second')
const newShow = shop.refreshShop()
calls.catalog[0].resolve(catalog(product('old catalog')))
calls.points[0].resolve(balance(900))
await oldShow
assert.equal(shop.userPoints.value, 0)
assert.equal(shop.filteredProducts.value.length, 0)
calls.catalog[1].resolve(catalog())
calls.points[1].reject(new Error('offline'))
await newShow
assert.equal(shop.userPoints.value, 7, 'fallback uses the current account profile, not an unscoped points value')

detail.showProductDetail(product('out', 0))
assert.equal(detail.exchangeLabel.value, '库存不足')
detail.exchangeProduct()
assert.equal(calls.navigation.length, 0)
detail.showProductDetail(product('item/a'))
detail.exchangeProduct()
detail.exchangeProduct()
assert.equal(calls.navigation.length, 1)
assert.equal(calls.navigation[0].url, '/pages-nonTheme/shop-confirm?productId=item%2Fa')
calls.navigation[0].complete()
assert.equal(detail.showDetailModal.value, true, 'failed navigation keeps the detail open')
detail.exchangeProduct()
calls.navigation[1].success()
calls.navigation[1].complete()
assert.equal(detail.showDetailModal.value, false)
detail.goToOrders()
assert.equal(calls.navigation[2].url, '/pages-nonTheme/shop-orders')

for (const theme of ['pages', 'pages-dark']) {
  const file = `${theme}/shop/shop.vue`
  for (const platform of ['h5', 'app', 'mp-weixin']) {
    initPreContext(platform)
    const { descriptor, errors } = parse(preJs(preHtml(read(file))), { filename: file })
    assert.deepEqual(errors, [], `${file} ${platform}: parses`)
    const script = compileScript(descriptor, { id: 'shop-check' })
    for (const binding of ['userPoints', 'filteredProducts', 'showProductDetail', 'exchangeProduct', 'goToOrders', 'goHome']) {
      assert.ok(script.bindings[binding], `${file} ${platform}: ${binding}`)
    }
    const template = compileTemplate({ source: descriptor.template.content, filename: file, id: 'shop-check',
      compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [], `${file} ${platform}: compiles template`)
  }
}

console.log('Shop account isolation, recommendation refresh, cache, exchange and three-platform SFC checks passed.')
