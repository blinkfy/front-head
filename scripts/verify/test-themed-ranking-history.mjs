import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { computed, ref } from 'vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

const require = createRequire(import.meta.url)
const { initPreContext, preHtml, preJs } = require('@dcloudio/uni-cli-shared')
const read = path => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')

function loadLogic(file, entry, dependencies) {
  const source = read(`utils/${file}.js`).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  return runInNewContext(`${source}\n${entry}`, { ref, computed, ...dependencies })
}

for (const theme of ['pages', 'pages-dark']) {
  const storage = new Map([['savedUser', { username: 'current' }]])
  const toasts = []
  const launches = []
  let stack = [{ route: `${theme}/ranking/ranking` }]
  let navigation
  const uni = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showToast: options => toasts.push(options.title),
    navigateBack: options => { navigation = options },
    reLaunch: options => launches.push(options.url)
  }
  const createPageReferrerNavigation = loadLogic('page-referrer-navigation', 'createPageReferrerNavigation', {
    uni, getCurrentPages: () => stack,
    setTimeout(fn, delay) { assert.equal(delay, 500); fn() }
  })
  const rankingData = { ranking: [{ username: 'current' }] }
  let response = { code: 0, data: rankingData }
  let mounted
  const useRanking = loadLogic('use-ranking', 'useRanking', {
    uni, createPageReferrerNavigation, onMounted: fn => { mounted = fn },
    getRanking: async () => response
  })
  const ranking = useRanking(`/${theme}`)
  ranking.onLoad({ from: 'profile' })
  await mounted()
  assert.deepEqual(ranking.rankingData.value, rankingData)
  assert.equal(ranking.isCurrentUser('current'), true)
  assert.equal(ranking.isCurrentUser('guest'), false)
  ranking.goBack()
  assert.equal(launches.pop(), `/${theme}/profile/profile`)
  assert.equal(storage.has('rankingReferrer'), false)

  stack = [{ route: 'pages-nonTheme/scan' }, ...stack]
  await mounted()
  ranking.goBack()
  assert.equal(navigation.delta, 1)
  assert.deepEqual(launches, [])
  navigation.fail()
  assert.equal(launches.pop(), '/pages-nonTheme/scan')
  stack.shift()
  ranking.goBack()
  assert.equal(launches.pop(), `/${theme}/home/home`)

  response = { code: 1, msg: 'fixture failure' }
  await ranking.refreshRanking()
  assert.deepEqual(toasts, ['fixture failure'])
  assert.deepEqual(ranking.rankingData.value, rankingData)
  assert.equal(ranking.loading.value, false)
  response = { code: 0, data: { ranking: [] } }
  await ranking.refreshRanking()
  assert.deepEqual(ranking.rankingData.value, response.data)
  assert.deepEqual(toasts, ['fixture failure', '刷新成功'])

  const file = `${theme}/ranking/ranking.vue`
  for (const platform of ['h5', 'app', 'mp-weixin']) {
    initPreContext(platform)
    const { descriptor, errors } = parse(preJs(preHtml(read(file))), { filename: file })
    assert.deepEqual(errors, [], `${file} ${platform}: parses`)
    const script = compileScript(descriptor, { id: 'ranking-check' })
    assert.match(script.content, /__expose\(\{ onLoad \}\)/)
    for (const binding of ['rankingData', 'loading', 'refreshRanking', 'isCurrentUser', 'goBack']) {
      assert.ok(script.bindings[binding], `${file} ${platform}: ${binding}`)
    }
    const template = compileTemplate({ source: descriptor.template.content, filename: file, id: 'ranking-check',
      compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [], `${file} ${platform}: compiles template`)
  }
}

const requests = []
const batches = []
const loadingEvents = []
const toasts = []
let confirmation
const useHistoryRecords = loadLogic('recognition/use-history-records', 'useHistoryRecords', {
  getRecognitionHistory: options => new Promise(resolve => requests.push({ options, resolve })),
  batchDeleteHistoryRecords: async ids => { batches.push([...ids]); return { code: 0 } },
  deleteHistoryRecord: async () => { throw { msg: 'offline' } },
  uni: {
    showLoading() { loadingEvents.push('show') },
    hideLoading() { loadingEvents.push('hide') },
    showToast(options) { toasts.push(options.title) }
  },
  console: { error() {} }
})
const history = useHistoryRecords(options => { confirmation = options })
const result = (ids, page, totalPages) => ({ data: ids.map(id => ({ id })), pagination: { page, totalPages } })
const initial = history.loadHistoryData()
const filtered = history.setFilter('device')
assert.equal(requests[1].options.source, 'device')
requests[0].resolve(result([1], 1, 1))
await initial
assert.equal(history.loading.value, true, 'old request cannot end the latest request loading state')
assert.equal(history.historyList.value.length, 0, 'old request cannot supply rows for the new filter')
requests[1].resolve(result([2], 1, 2))
await filtered
assert.equal(history.hasMore.value, true)
const next = history.loadMore()
assert.equal(requests[2].options.page, 2)
assert.equal(requests[2].options.source, 'device')
history.loadMore()
assert.equal(requests.length, 3, 'pagination has at most one outstanding request')
requests[2].resolve(result([3], 2, 2))
await next
assert.deepEqual(Array.from(history.historyList.value, item => item.id), [2, 3])

history.toggleSelectMode()
history.toggleSelectAll()
assert.equal(history.isAllSelected.value, true)
history.batchDelete()
history.toggleSelect(3)
await confirmation.success({ confirm: true })
assert.deepEqual(batches, [[2, 3]], 'a confirmed batch deletes the exact IDs shown at confirmation')
assert.equal(history.historyList.value.length, 0)
assert.equal(history.selectMode.value, false)
history.deleteItem(2)
await confirmation.success({ confirm: true })
assert.deepEqual(loadingEvents, ['show', 'hide', 'show', 'hide'])
assert.deepEqual(toasts, ['删除成功', 'offline'])

console.log('Themed ranking navigation, three-platform compilation, and history list/filter/delete checks passed.')
