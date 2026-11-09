import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { safeSearchUrl, normalizeChatSearch, mergeChatSearch, finalizeChatSearch, chatSearchMessage, SEARCH_UNAVAILABLE_MESSAGE } from '../src/pages-nonTheme/utils/ai-chat-search.mjs'
import { normalizeChatDisposalPoints } from '../src/pages-nonTheme/utils/ai-chat-disposal.mjs'
import { normalizeChatBusinessCards, businessActionRequestId } from '../src/pages-nonTheme/utils/ai-chat-business.mjs'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const page = fs.readFileSync(new URL('../src/pages-nonTheme/ai-chat.vue', import.meta.url), 'utf8')
const component = fs.readFileSync(new URL('../src/pages-nonTheme/components/ChatSearchSources.vue', import.meta.url), 'utf8')
const source = { index: 1, title: '投放指引', url: 'https://example.org/guide', siteName: '资料站' }
const searching = { status: 'searching', sources: [] }

// Uni conditional compilation: exercise the actual SSE and WebSocket functions separately.
function platformCode(code, h5) {
  const include = [true]
  return code.split('\n').filter(line => {
    const condition = /\/\/\s*#(ifdef|ifndef) H5/.exec(line)
    if (condition) { include.push(include.at(-1) && (condition[1] === 'ifdef' ? h5 : !h5)); return false }
    if (/\/\/\s*#endif/.test(line)) { include.pop(); return false }
    return include.at(-1)
  }).join('\n')
}

function streamContext(h5, overrides = {}) {
  const context = {
    AbortController, TextDecoder, console: { log() {}, error() {} }, pageDisposed: false,
    isStreaming: { value: false }, streamingText: { value: '' }, streamingReasoning: { value: '' },
    streamingSearch: { value: null }, activeSessionId: { value: 'session' }, abortCtrl: null, wsSocket: null, streamStopRequested: false,
    baseUrl: 'https://api.example.org', buildAuthHeaders: () => ({}), getStorage: () => 'token',
    safeJsonParse: JSON.parse, mergeChatSearch, finalizeChatSearch, normalizeChatDisposalPoints, normalizeChatBusinessCards, scheduleMessagesAutoScroll() {}, ...overrides
  }
  vm.createContext(context)
  const start = page.indexOf('async function streamChat(')
  const end = page.indexOf('function extractHistoryForRequest()', start)
  vm.runInContext(`${platformCode(page.slice(start, end), h5)}\nglobalThis.run = streamChat`, context)
  return context
}

async function testSse({ events, aborted = false, enableSearch = true }) {
  let request
  let context
  let read = 0
  context = streamContext(true, {
    fetch: async (_, options) => {
      request = JSON.parse(options.body)
      return {
        ok: true, headers: { get: () => 'text/event-stream' },
        body: { getReader: () => ({
          async read() {
            if (read++ === 0) return { value: new TextEncoder().encode(events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')), done: false }
            if (aborted) throw Object.assign(new Error('stop'), { name: 'AbortError' })
            return { done: true }
          }, releaseLock() {}
        }) }
      }
    }
  })
  const result = await context.run({ text: 'test', history: [], enableThinking: false, enableSearch })
  assert.equal(request.enableSearch, enableSearch)
  assert.equal(request.workflowVersion, 1)
  return result
}

for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.org', 'https://a:b@example.org', 'https://example.org@evil.test', 'https://@evil.test', 'https://example.org\\@evil.test', 'https://exa\nmple.org', 'https://', 'file:///tmp/a']) {
  assert.equal(safeSearchUrl(url), '', url)
}
assert.equal(safeSearchUrl('https://example.org/a?q=1#x'), 'https://example.org/a?q=1#x')
assert.equal(safeSearchUrl('http://example.org/a'), 'http://example.org/a')
const safeFallback = vm.runInNewContext(`(${safeSearchUrl.toString()})`, { URL: undefined })
assert.equal(safeFallback('https://example.org/guide'), source.url)
assert.equal(safeFallback('https://a:b@example.org'), '')
assert.equal(safeFallback('https://example.org:99999/'), '')

let search = mergeChatSearch(null, searching)
assert.equal(chatSearchMessage(search), '正在联网查找资料…')
search = mergeChatSearch(search, { status: 'completed', sources: [source, source, { ...source, url: 'javascript:alert(1)' }] })
assert.equal(search.sources.length, 1)
search = mergeChatSearch(search, { status: 'failed', sources: [] })
assert.equal(search.sources.length, 1, 'failure retains previously received sources')
const sharedUrl = normalizeChatSearch({ status: 'completed', sources: [source, { ...source, index: 2, title: '另一条引用' }] })
assert.equal(sharedUrl.sources.length, 2, 'distinct reference indices must survive a shared URL')
assert.equal(sharedUrl.sources[1].index, 2)
assert.equal(sharedUrl.sources[1].url, source.url)
const mergedSharedUrl = mergeChatSearch({ status: 'completed', sources: [source] }, { status: 'completed', sources: [{ ...source, index: 2 }] })
assert.equal(mergedSharedUrl.sources.length, 2)
assert(mergedSharedUrl.sources.some(item => item.index === 1) && mergedSharedUrl.sources.some(item => item.index === 2))
assert(component.includes(':key="`${source.index}:${source.url}`"'))

const noisyTitles = normalizeChatSearch({ status: 'completed', sources: [
  { index: 1, title: '{"title":"截断JSON', url: 'https://policy.example.cn/a', siteName: '政策站' },
  { index: 2, title: '{"title":"完整JSON"}', url: 'https://policy.example.cn/b', siteName: '政策站' },
  { index: 3, title: '```json {"title":"代码块"} ```', url: 'https://policy.example.cn/c', siteName: '政策站' },
  { index: 4, title: '<!doctype html><title>服务错误</title>', url: 'https://policy.example.cn/d', siteName: '{"error":"bad gateway"}' },
  { index: 5, title: '2026年本地生活垃圾分类投放政策 [2026] 修订版', url: 'https://policy.example.cn/e', siteName: '政策站' }
] })
assert.deepEqual(noisyTitles.sources.map(item => [item.index, item.title, item.siteName, item.url]), [
  [1, '政策站', '政策站', 'https://policy.example.cn/a'],
  [2, '政策站', '政策站', 'https://policy.example.cn/b'],
  [3, '政策站', '政策站', 'https://policy.example.cn/c'],
  [4, 'policy.example.cn', 'policy.example.cn', 'https://policy.example.cn/d'],
  [5, '2026年本地生活垃圾分类投放政策 [2026] 修订版', '政策站', 'https://policy.example.cn/e']
], 'machine payload titles fall back to a readable site label while preserving citation identity and ordinary Chinese titles')

assert.equal(chatSearchMessage(search), SEARCH_UNAVAILABLE_MESSAGE)
assert.equal(chatSearchMessage({ ...search, message: '服务暂不可用' }), '服务暂不可用')
assert.equal(chatSearchMessage({ status: 'completed', sources: [] }), '本次联网未返回可核实来源，实时信息仍需确认。')
assert.equal(chatSearchMessage({ status: 'completed', sources: [], message: '暂无可用资料' }), '暂无可用资料')
const businessCard = { type: 'product', id: '42', title: '玻璃杯', description: '可兑换商品', points: 30, stock: 4 }
const emptyDescriptionProduct = { ...businessCard, id: '43', description: '' }
assert.deepEqual(normalizeChatBusinessCards([businessCard, businessCard, { ...businessCard, id: '../bad' }]), [businessCard])
assert.deepEqual(normalizeChatBusinessCards([emptyDescriptionProduct]), [emptyDescriptionProduct], 'products with an empty description remain actionable')
assert.equal(normalizeChatBusinessCards(Array.from({ length: 12 }, (_, i) => ({ ...businessCard, id: String(i + 1) }))).length, 10)
assert.equal(normalizeChatBusinessCards([{ ...businessCard, type: 'recognition', id: 'abc' }]).length, 0, 'recognition cards require a valid history ID')
const manySources = normalizeChatSearch({ status: 'completed', sources: Array.from({ length: 35 }, (_, i) => ({ ...source, index: i + 1, url: `https://example.org/${i}` })) })
assert.equal(manySources.sources.length, 30)
assert.equal(manySources.sources[6].index, 7, 'reference 7 must remain available beyond the initial six displayed sources')
assert.equal(finalizeChatSearch(searching).status, 'failed', 'interruption must not be mistaken for an intentional skip')
assert.equal(finalizeChatSearch(searching).message, '联网查询已中断。')
const interrupted = finalizeChatSearch({ ...searching, sources: [source] })
assert.equal(interrupted.status, 'failed', 'interruption must not be mistaken for completed research')
assert.equal(interrupted.message, '联网查询已中断，已获取的来源仍可查看。')
assert.equal(finalizeChatSearch({ status: 'completed', sources: [source] }).status, 'completed')

// Exercise the component's actual expansion state without adding DOM dependencies.
const componentScript = compileScript(parse(component).descriptor, { id: 'expansion-test' }).content
  .replace(/^import .* from 'vue'$/gm, "const { computed, ref } = Vue")
  .replace(/^import .*ai-chat-search\.mjs'$/gm, '')
  .replace('export default', 'globalThis.SourceComponent =')
const expansionContext = { Vue: require('vue'), normalizeChatSearch, chatSearchMessage, safeSearchUrl }
vm.createContext(expansionContext)
vm.runInContext(componentScript, expansionContext)
const componentState = expansionContext.SourceComponent.setup({ value: manySources }, { expose() {} })
assert.equal(componentState.visibleSources.value.length, 6)
componentState.toggleSources()
assert.equal(componentState.expanded.value, true)
assert.equal(componentState.visibleSources.value.length, 30)
assert.equal(componentState.visibleSources.value[6].index, 7)
componentState.toggleSources()
assert.equal(componentState.visibleSources.value.length, 6)
assert(component.includes('@tap.stop="toggleSources"'), 'display control invokes the tested expansion state')

const result = await testSse({ events: [
  ['search', searching], ['search', { status: 'completed', sources: [source] }],
  ['delta', { chunk: '参考回答' }], ['done', { content: '完整回答', search: { status: 'completed', sources: [] }, disposalPoints: [{ id: 1, name: '测试点', latitude: 31, longitude: 121 }], businessCards: [businessCard, emptyDescriptionProduct] }]
] })
assert.equal(result.content, '完整回答')
assert.equal(result.search.sources[0].url, source.url)
assert.equal(result.disposalPoints[0].id, '1', 'SSE done restores actionable disposal points')
assert.deepEqual(result.businessCards, [businessCard, emptyDescriptionProduct], 'SSE done restores normalized business cards after streaming')
const streamingBlock = page.slice(page.indexOf('<view v-if="isStreaming"'), page.indexOf('<view v-if="showInlineSuggestions"'))
assert(!streamingBlock.includes('<ChatSearchSources'), 'sources are collected during streaming but rendered only after the answer completes')
assert(page.includes('<ChatSearchSources v-if="msg.role === \'assistant\'" :value="msg.search" />'), 'completed assistant history renders normalized sources')
const restored = await testSse({ events: [['done', { content: '最终恢复', search: { status: 'completed', sources: [source] }, disposalPoints: [{ id: 2, name: '恢复点', latitude: 32, longitude: 120 }], businessCards: [businessCard] }]], enableSearch: false })
assert.equal(restored.search.sources.length, 1, 'done restores sources even without prior search events')
assert.equal(restored.disposalPoints[0].name, '恢复点', 'done restores points even without prior disposal events')
assert.equal(restored.businessCards[0].id, '42', 'done restores business cards without earlier card events')
const stopped = await testSse({ events: [['search', { ...searching, sources: [source] }]], aborted: true })
assert.equal(stopped.aborted, true)
assert.equal(stopped.search.status, 'failed')
assert.equal(stopped.search.message, '回答已中断，已获取的来源仍可查看。')
assert.equal(stopped.search.sources.length, 1)
const interruptedByError = await testSse({ events: [['search', { ...searching, sources: [source] }], ['error', { message: '连接中断' }]] })
assert.equal(interruptedByError.search.status, 'failed')
assert.equal(interruptedByError.search.message, '回答已中断，已获取的来源仍可查看。')
assert.equal(interruptedByError.search.sources.length, 1)
const failed = await testSse({ events: [['search', { status: 'failed', sources: [source] }], ['error', { message: '连接中断' }]] })
assert.equal(failed.search.sources.length, 1)
assert.equal(failed.search.status, 'failed')
assert.equal(failed.aborted, true)
const eofPartial = await testSse({ events: [['delta', { chunk: '部分回答' }]] })
assert.equal(eofPartial.aborted, true)
assert(eofPartial.content.includes('部分回答') && eofPartial.content.includes('回答已中断'))
const completedSearchWithoutDone = await testSse({ events: [['search', { status: 'completed', sources: [source] }], ['delta', { chunk: '部分回答' }]] })
assert.equal(completedSearchWithoutDone.aborted, true)
assert.equal(completedSearchWithoutDone.search.status, 'failed', 'search completed alone cannot imply that the answer completed')
assert.equal(completedSearchWithoutDone.search.sources.length, 1)
assert.equal(completedSearchWithoutDone.search.message, '回答已中断，已获取的来源仍可查看。')
assert.equal(result.aborted, false, 'explicit done is the only successful completion')

let handlers = {}, request
const socket = {
  onOpen(fn) { handlers.open = fn }, onMessage(fn) { handlers.message = fn },
  onError(fn) { handlers.error = fn }, onClose(fn) { handlers.close = fn },
  send(options) { request = JSON.parse(options.data) }, close() {}
}
const ws = streamContext(false, { uni: { connectSocket: () => socket } })
const wsResult = ws.run({ text: 'test', history: [], enableSearch: false })
handlers.open()
assert.equal(request.enableSearch, false)
assert.equal(request.workflowVersion, 1)
handlers.message({ data: JSON.stringify({ type: 'search', ...searching }) })
assert.equal(ws.streamingSearch.value.status, 'searching')
handlers.message({ data: JSON.stringify({ type: 'search', status: 'completed', sources: [source] }) })
handlers.message({ data: JSON.stringify({ type: 'delta', chunk: '正文' }) })
assert.equal(ws.streamingSearch.value.sources.length, 1, 'body deltas must preserve search state')
handlers.message({ data: JSON.stringify({ type: 'done', content: '结束', search: { status: 'completed', sources: [] }, disposalPoints: [{ id: 4, name: 'WS点', latitude: 30, longitude: 120 }], businessCards: [businessCard] }) })
const wsDone = await wsResult
assert.equal(wsDone.search.sources.length, 1)
assert.equal(wsDone.disposalPoints[0].name, 'WS点', 'WS done restores actionable disposal points')
assert.equal(wsDone.businessCards[0].id, '42', 'WS done restores business cards')
const disconnectedWs = ws.run({ text: 'test', history: [], enableSearch: true })
handlers.open()
handlers.message({ data: JSON.stringify({ type: 'search', status: 'completed', sources: [source] }) })
handlers.message({ data: JSON.stringify({ type: 'delta', chunk: 'WS部分回答' }) })
handlers.close({ code: 1006 })
const disconnected = await disconnectedWs
assert.equal(disconnected.aborted, true)
assert.equal(disconnected.search.status, 'failed')
assert.equal(disconnected.search.sources.length, 1)
assert(disconnected.content.includes('WS部分回答') && disconnected.content.includes('回答已中断'))
const stoppedWs = ws.run({ text: 'test', history: [], enableSearch: true })
handlers.open()
handlers.message({ data: JSON.stringify({ type: 'search', status: 'completed', sources: [source] }) })
ws.streamStopRequested = true
handlers.close({ code: 1000 })
const explicitlyStopped = await stoppedWs
assert.equal(explicitlyStopped.content, '已停止当前回答。')
assert.equal(explicitlyStopped.aborted, true)
assert.equal(explicitlyStopped.search.status, 'failed')

// Actual send/stop lifecycle: stop holds the send guard until the old socket settles.
const socketRuns = []
const pushedMessages = []
const sequential = streamContext(false, {
  imagePreparing: { value: false }, recoveringRun: { value: '' }, activeRun: { value: null }, supportsRuns: async () => false, ensureRunLedger: () => null, sendEpoch: 0, ensureConversation: () => ({ messages: [] }), promptText: { value: '第一条' }, pickedImageDataUrl: { value: '' },
  pickedImageLocalPath: { value: '' }, streamingMessageId: { value: '' }, isSearchEnabled: { value: true },
  isDeepThinking: { value: false }, pendingMessagePreparation: null, createMessageId: () => 'id',
  dataUrlByteLength: () => 0, MAX_IMAGE_BYTES: 100, extractPendingPersistMessages: async () => [],
  extractHistoryForRequest: () => [], chatEnvironment: { forRequest: async () => ({}) },
  pushMessageToActive: (...args) => pushedMessages.push(args), clearPickedImage() {}, markPendingPersistMessagesSaved() {},
  uni: {
    showToast() {},
    connectSocket() {
      const run = { callbacks: {}, closeCalls: 0 }
      const transport = {
        onOpen(fn) { run.callbacks.open = fn }, onMessage(fn) { run.callbacks.message = fn },
        onError(fn) { run.callbacks.error = fn }, onClose(fn) { run.callbacks.close = fn },
        send() {}, close() { run.closeCalls++ }
      }
      run.transport = transport; socketRuns.push(run); return transport
    }
  }
})
const sendStart = page.indexOf('async function onSend(options = {}) {')
const lifecycleStart = page.indexOf('// ─── 生命周期', sendStart)
vm.runInContext(`${platformCode(page.slice(sendStart, lifecycleStart), false)}\nglobalThis.send = onSend; globalThis.stop = onStop`, sequential)
async function flushPreparation() { for (let i = 0; i < 8; i++) await Promise.resolve() }
const firstSend = sequential.send()
await flushPreparation()
assert.equal(socketRuns.length, 1)
socketRuns[0].callbacks.open()
sequential.stop()
assert.equal(sequential.isStreaming.value, true, 'stop must keep the send guard until old close settles')
sequential.promptText.value = '第二条'
await sequential.send()
assert.equal(socketRuns.length, 1, 'immediate resend is deferred while the stopped request settles')
socketRuns[0].callbacks.close({ code: 1000 })
await firstSend
assert.equal(sequential.isStreaming.value, false)
assert.equal(pushedMessages.at(-1)[1], '已停止当前回答。')
const secondSend = sequential.send()
await flushPreparation()
assert.equal(socketRuns.length, 2)
socketRuns[1].callbacks.open()
socketRuns[1].callbacks.message({ data: JSON.stringify({ type: 'delta', chunk: '新的回答' }) })
const secondSocket = sequential.wsSocket
socketRuns[0].callbacks.close({ code: 1000 })
socketRuns[0].callbacks.message({ data: JSON.stringify({ type: 'delta', chunk: '过期正文' }) })
assert.equal(socketRuns[1].closeCalls, 0, 'old callbacks must not close the new socket')
assert.equal(sequential.wsSocket, secondSocket)
assert.equal(sequential.isStreaming.value, true)
assert.equal(sequential.streamingText.value, '新的回答', 'old callbacks must not reset or replace new UI')
socketRuns[1].callbacks.message({ data: JSON.stringify({ type: 'done', content: '新的完整回答' }) })
await secondSend

// Restore history through the actual hydration function.
const conversations = new Map()
const hydrateContext = {
  conversationMap: conversations, reasoningCollapsed: { value: {} }, normalizeChatDisposalPoints, normalizeChatBusinessCards,
  normalizeSessionId: value => value, createMessageId: () => 'id', finalizeChatSearch,
  ensureConversation: id => {
    if (!hydrateContext.conversationMap.has(id)) hydrateContext.conversationMap.set(id, { messages: [] })
    return hydrateContext.conversationMap.get(id)
  }, refreshConversationMeta() {}
}
vm.createContext(hydrateContext)
const hydrateStart = page.indexOf('function hydrateConversations(')
const hydrateEnd = page.indexOf('// ─── Seed', hydrateStart)
const legacyHistorySearch = { status: 'completed', sources: [
  { index: 9, title: '{"error":"legacy search response"}', url: 'https://legacy.example.cn/policy', siteName: '' },
  { index: 10, title: '2026年本地回收政策 [2026]', url: 'https://legacy.example.cn/2026', siteName: '本地政策' }
] }
vm.runInContext(`${page.slice(hydrateStart, hydrateEnd)}\nhydrateConversations(${JSON.stringify({ items: [{ sessionId: 's', role: 'assistant', content: '历史回答', search: legacyHistorySearch, disposalPoints: [{ id: 3, name: '历史点', latitude: 30, longitude: 120 }] }] })})`, hydrateContext)
assert.equal(hydrateContext.conversationMap.get('s').messages[0].search.sources.length, 2)
assert.equal(hydrateContext.conversationMap.get('s').messages[0].search.sources[0].title, 'legacy.example.cn', 'old history is normalized before display')
assert.equal(hydrateContext.conversationMap.get('s').messages[0].search.sources[1].title, '2026年本地回收政策 [2026]')
assert.equal(hydrateContext.conversationMap.get('s').messages[0].disposalPoints[0].name, '历史点', 'history hydration restores assistant disposal points')
const cardHistory = { items: [
  { sessionId: 's', role: 'assistant', content: '有商品', businessCards: [businessCard, emptyDescriptionProduct] },
  { sessionId: 'legacy', role: 'assistant', content: '旧消息' }
] }
vm.runInContext(`hydrateConversations(${JSON.stringify(cardHistory)})`, hydrateContext)
assert.equal(hydrateContext.conversationMap.get('s').messages[0].businessCards[0].id, '42', 'history hydration restores business cards')
assert.equal(hydrateContext.conversationMap.get('s').messages[0].businessCards[1].id, '43', 'history hydration retains products with an empty description')
assert.equal(hydrateContext.conversationMap.get('legacy').messages[0].businessCards.length, 0, 'old history without cards stays empty')
const localConversation = { messages: [] }
const localContext = {
  activeSessionId: { value: 'local' }, messageList: { value: [] },
  ensureConversation: () => localConversation, createMessageId: () => 'local-id',
  finalizeChatSearch, normalizeChatDisposalPoints, normalizeChatBusinessCards,
  refreshConversationMeta() {}, syncConversationList() {}, updateHeader() {}, nextTick() {}
}
vm.createContext(localContext)
const pushStart = page.indexOf('function pushMessageToActive(')
const pushEnd = page.indexOf('function ensureWelcomeMessageIfEmpty()', pushStart)
vm.runInContext(`${page.slice(pushStart, pushEnd)}\npushMessageToActive('assistant', '回答', '', '', '', '', 'local-id', null, [], [${JSON.stringify(businessCard)}])`, localContext)
assert.equal(localConversation.messages[0].businessCards[0].id, '42', 'locally pushed messages retain business cards')
const historyStart = page.indexOf('function extractHistoryForRequest()')
const historyEnd = page.indexOf('// ─── 发送消息', historyStart)
assert(!page.slice(historyStart, historyEnd).includes('search'), 'search metadata must not enter model history')
assert(page.includes('const enableSearch = isSearchEnabled.value'), 'toggle is captured before asynchronous preparation')
assert(component.includes("window.open(url, '_blank', 'noopener,noreferrer')"))
const openSourceCode = component.slice(component.indexOf('function openSource('), component.indexOf('</script>'))
for (const h5 of [true, false]) {
  const opened = []
  const navigation = []
  const notices = []
  const context = {
    safeSearchUrl, encodeURIComponent,
    window: { open: (...args) => opened.push(args) },
    uni: { navigateTo: options => navigation.push(options), showToast: options => notices.push(options) }
  }
  vm.createContext(context)
  vm.runInContext(platformCode(openSourceCode, h5), context)
  const url = 'https://example.org/guide?q=分类&from=ai#来源'
  context.openSource(url)
  context.openSource('javascript:alert(1)')
  if (h5) {
    assert.deepEqual(opened, [[safeSearchUrl(url), '_blank', 'noopener,noreferrer']])
    assert.equal(navigation.length, 0)
  } else {
    assert.equal(opened.length, 0)
    assert.equal(navigation.length, 1)
    assert.equal(navigation[0].url, `/pages-nonTheme/webview?url=${encodeURIComponent(safeSearchUrl(url))}&title=${encodeURIComponent('参考来源')}`)
    navigation[0].fail()
    assert.equal(notices[0].title, '打开来源失败，请重试')
  }
}
// Keyboard bindings compile with preventDefault for Enter and Space on every custom control.
const toggleMarkup = page.slice(page.indexOf("['deep-think-btn', 'search-toggle'"), page.indexOf('<text class="deep-think-text">联网搜索'))
assert(toggleMarkup.includes('tabindex="0"'))
assert(toggleMarkup.includes('@keydown.enter.prevent="isSearchEnabled = !isSearchEnabled"'))
assert(toggleMarkup.includes('@keydown.space.prevent="isSearchEnabled = !isSearchEnabled"'))
assert(component.includes('@keydown.enter.prevent="openSource(source.url)"'))
assert(component.includes('@keydown.space.prevent="openSource(source.url)"'))
assert(component.includes('@keydown.enter.prevent="toggleSources"'))
assert(component.includes('@keydown.space.prevent="toggleSources"'))
assert(component.includes('.source-link:focus-visible, .sources-toggle:focus-visible'))
assert(page.includes('.search-toggle:focus-visible'))


const businessComponent = fs.readFileSync(new URL('../src/pages-nonTheme/components/ChatBusinessCards.vue', import.meta.url), 'utf8')
assert(businessComponent.includes('getHistoryRecognitionDetail(card.id)'), 'recognition details use the authenticated history API')
assert(businessComponent.includes('/pages-nonTheme/shop-confirm?productId='), 'product action opens the existing confirmation page')
assert(businessComponent.includes('v-if="card.description"'), 'empty product descriptions do not render an empty row')
assert(!businessComponent.includes('/api/recognition_history/detail/${card.id}'), 'recognition card IDs are not built into a raw URL')
const businessScript = parse(businessComponent).descriptor.scriptSetup.content
const productOpenStart = businessScript.indexOf('async function openProduct(card) {')
const productOpenEnd = businessScript.indexOf('\n}', productOpenStart) + 2
const productNavigation = []
const productContext = {
  props: { messageId: '', sessionId: '' }, busyProductId: { value: '' }, createRequestIds: new Map(), businessActionRequestId, beginCardAction: () => () => true,
  fetchAiCapabilities: async () => ({}), redemptionSupported: () => false, isCapabilityNotFound: () => false,
  uni: { navigateTo: options => productNavigation.push(options) }, encodeURIComponent
}
vm.createContext(productContext)
vm.runInContext(`${businessScript.slice(productOpenStart, productOpenEnd)}\nglobalThis.opening = openProduct(${JSON.stringify(normalizeChatBusinessCards([emptyDescriptionProduct])[0])})`, productContext)
await productContext.opening
assert.equal(productNavigation[0].url, '/pages-nonTheme/shop-confirm?productId=43', 'empty-description products still open the existing redemption confirmation page')
assert(page.includes('businessCards: role === \'assistant\' ? normalizeChatBusinessCards(businessCards) : undefined'), 'locally pushed assistant messages retain cards')
for (const [filename, file] of [['ai-chat.vue', page], ['ChatSearchSources.vue', component], ['ChatBusinessCards.vue', businessComponent]]) {
  const { descriptor, errors } = parse(file, { filename })
  assert.deepEqual(errors, [], `${filename}: SFC parse`)
  const compiled = compileScript(descriptor, { id: 'search-test' })
  const template = compileTemplate({ source: descriptor.template.content, filename, id: 'search-test', compilerOptions: { bindingMetadata: compiled.bindings } })
  assert.deepEqual(template.errors, [], `${filename}: template compile`)
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename, id: 'search-test', scoped: style.scoped }).errors, [], `${filename}: style compile`)
}
console.log('ai-chat search checks passed: links, event accumulation, SSE/WS, stop/error, history, SFC compile')
