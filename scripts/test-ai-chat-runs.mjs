import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createRunLedger, runStorageKey, normalizePendingRuns, applyRunSnapshot } from '../src/pages-nonTheme/utils/ai-chat-runs.mjs'
import { normalizeChatBusinessCards } from '../src/pages-nonTheme/utils/ai-chat-business.mjs'
import { normalizeChatDisposalPoints } from '../src/pages-nonTheme/utils/ai-chat-disposal.mjs'
import { finalizeChatSearch } from '../src/pages-nonTheme/utils/ai-chat-search.mjs'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const page = fs.readFileSync(new URL('../src/pages-nonTheme/ai-chat.vue', import.meta.url), 'utf8')
const valid = { requestId: 'request_123456789012345', sessionId: 'session-a', runId: '', status: 'pending', userLocalId: 'local-user', assistantLocalId: 'local-assistant', seedLocalIds: ['seed-a', 'seed-b'], userText: '问题', createdAt: '2026-11-05T00:00:00.000Z' }
const uuid = '123e4567-e89b-42d3-a456-426614174000'

// Pure ledger validation, ownership scope, and persist-before-send behavior.
assert.notEqual(runStorageKey('https://api.example/a', 'token-a'), runStorageKey('https://api.example/a', 'token-b'))
assert.notEqual(runStorageKey('https://api.example/a', 'token-a'), runStorageKey('https://api.example/b', 'token-a'))
assert.deepEqual(normalizePendingRuns([{ ...valid, requestId: 'bad' }, { ...valid, sessionId: ' ' }, valid, valid]).map(x => x.requestId), [valid.requestId])
let persisted
const ledger = createRunLedger({ key: 'k', read: () => [], write: (_, value) => { persisted = value } })
ledger.add(valid)
assert.equal(persisted[0].requestId, valid.requestId)
const ended = { ...valid, requestId: 'ended_request_1234567890', status: 'failed' }
const stopped = { ...valid, requestId: 'stopped_request_1234567890', status: 'cancelled' }
const cleanLedger = createRunLedger({ key: 'old', read: () => [valid, ended, stopped], write() {} })
assert.deepEqual(cleanLedger.items().map(item => item.requestId), [valid.requestId], 'old failed/stopped local hints are discarded on load')
for (let attempt = 0; attempt < 2; attempt++) {
  assert.deepEqual(cleanLedger.merge([ended, stopped]).map(item => item.requestId), [valid.requestId], 'older backend terminal lists cannot restore closed hints')
}
assert.equal(cleanLedger.merge([{ ...valid, status: 'failed' }]).length, 0, 'a newly confirmed failed entry is removed during merge')
assert.throws(() => createRunLedger({ key: 'k', read: () => [], write: () => { throw new Error('storage unavailable') } }).add(valid), /storage unavailable/)
const storageFailureSent = []

const completed = { requestId: valid.requestId, sessionId: valid.sessionId, runId: uuid, status: 'completed', userMessageId: '101', result: {
  assistantMessageId: '202', content: '恢复内容', businessCards: [{ type: 'product', id: '42', title: '商品', actionKey: uuid }], disposalPoints: [{ id: 1, name: '点位', latitude: 30, longitude: 120 }]
} }
const snapMessages = [
  { id: 'local-user', role: 'user', content: '问题', hasImage: true, imageBase64: 'DO-NOT-PERSIST' },
  { id: 'local-assistant', role: 'assistant', content: '临时流内容' },
  { id: '101', role: 'user', content: '重复历史用户' },
  { id: '201', role: 'assistant', content: '旧历史assistant' }
]
const merged = applyRunSnapshot(snapMessages, valid, completed, normalizeChatBusinessCards, normalizeChatDisposalPoints, finalizeChatSearch)
assert.equal(merged.filter(x => x.role === 'user' && x.id === '101').length, 1, 'server user IDs merge and deduplicate history')
assert.equal(merged.filter(x => x.role === 'assistant' && x.id === '202').length, 1)
assert.equal(merged.find(x => x.id === '202').businessCards[0].actionKey, uuid, 'card action keys survive recovery normalization')
assert.equal(merged.find(x => x.id === '101').imageBase64, 'DO-NOT-PERSIST', 'recovery updates the existing local UI message without replacing its image preview')
const insertedUser = applyRunSnapshot([], valid, completed, normalizeChatBusinessCards, normalizeChatDisposalPoints, finalizeChatSearch).find(x => x.role === 'user')
assert.equal(insertedUser.imageBase64, '', 'a history-only recovered user message carries no image payload')
assert.deepEqual(normalizePendingRuns([{ ...valid, seedLocalIds: ['seed-a', 'seed-a', 3, 'x'.repeat(81), 'seed-b'] }])[0].seedLocalIds, ['seed-a', 'seed-b'])
assert.equal(merged.find(x => x.id === 'local-assistant'), undefined, 'completed snapshot replaces the local assistant placeholder')
assert.throws(() => applyRunSnapshot([], valid, { ...completed, requestId: 'other_request_123456' }, normalizeChatBusinessCards, normalizeChatDisposalPoints, finalizeChatSearch), /不匹配/)
assert.throws(() => applyRunSnapshot([], { ...valid, runId: uuid }, { ...completed, runId: '223e4567-e89b-42d3-a456-426614174000' }, normalizeChatBusinessCards, normalizeChatDisposalPoints, finalizeChatSearch), /不匹配/)

// Exercise the real stream parser on H5 SSE and non-H5 WebSocket paths.
function platformCode(code, h5) {
  const include = [true]
  return code.split('\n').filter(line => {
    const conditional = /\/\/\s*#(ifdef|ifndef) H5/.exec(line)
    if (conditional) { include.push(include.at(-1) && (conditional[1] === 'ifdef' ? h5 : !h5)); return false }
    if (/\/\/\s*#endif/.test(line)) { include.pop(); return false }
    return include.at(-1)
  }).join('\n')
}
function unipreprocess(source, platform) {
  const stack = [true]
  return source.split('\n').filter(line => {
    const directive = /(?:\/\/|\/\*|<!--)\s*#(ifdef|ifndef)\s+([\w-]+)\s*(?:\*\/|-->)?/.exec(line)
    if (directive) { const matches = directive[2] === platform || (directive[2] === 'MP' && platform.startsWith('MP-')); stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? matches : !matches)); return false }
    if (/(?:\/\/|\/\*|<!--)\s*#endif\s*(?:\*\/|-->)?/.test(line)) { stack.pop(); return false }
    return stack.at(-1)
  }).join('\n')
}
const request = { runVersion: 1, requestId: valid.requestId, sessionId: valid.sessionId }
function streamContext(h5, overrides = {}) {
  const context = { AbortController, TextDecoder, console: { log() {}, error() {} }, pageDisposed: false, isStreaming: { value: false }, streamingText: { value: '' }, streamingReasoning: { value: '' }, streamingSearch: { value: null }, activeSessionId: { value: valid.sessionId }, abortCtrl: null, wsSocket: null, streamStopRequested: false,
    baseUrl: 'https://api.example.org', buildAuthHeaders: () => ({}), getStorage: () => 'token', safeJsonParse: JSON.parse, mergeChatSearch: () => null, finalizeChatSearch, normalizeChatDisposalPoints, normalizeChatBusinessCards, scheduleMessagesAutoScroll() {}, ...overrides }
  vm.createContext(context)
  const start = page.indexOf('async function streamChat(')
  const end = page.indexOf('function extractHistoryForRequest()', start)
  vm.runInContext(`${platformCode(page.slice(start, end), h5)}\nglobalThis.run = streamChat`, context)
  return context
}
let sentBody, sseRead = false
const sse = streamContext(true, { fetch: async (_, options) => { sentBody = JSON.parse(options.body); return { ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ async read() { if (sseRead) return { done: true }; sseRead = true; const events = [
  ['run', { runId: uuid, status: 'executing' }], ['snapshot', { runId: uuid, status: 'executing', userMessageId: '101' }], ['delta', { chunk: '暂存片段' }], ['done', { runId: uuid, status: 'completed', result: completed.result }]
].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''); return { value: new TextEncoder().encode(events), done: false } }, releaseLock() {} }) } } } })
let runEvents = 0
const sseResult = await sse.run({ text: '问题', history: [], enableThinking: false, enableSearch: false, runRequest: request, onRun: () => runEvents++ })
assert.equal(sentBody.requestId, request.requestId)
assert.equal(sentBody.runVersion, 1)
assert.equal(runEvents, 3, 'SSE run, snapshot, and done events reach the metadata callback')
assert.equal(sseResult.runSnapshot.status, 'completed')

async function sseError(runRequest) {
  let read = false
  const context = streamContext(true, { fetch: async () => ({ ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ async read() {
    if (read) return { done: true }
    read = true
    return { value: new TextEncoder().encode(`event: error\ndata: ${JSON.stringify({ message: '服务拒绝本次回答' })}\n\n`), done: false }
  }, releaseLock() {} }) } }) })
  return context.run({ text: '问题', history: [], enableThinking: false, enableSearch: false, runRequest })
}
await assert.rejects(sseError(request), /服务拒绝本次回答/, 'SSE run errors reject so onSend can show the real cause')
const legacySseError = await sseError(null)
assert.equal(legacySseError.aborted, true)
assert.match(legacySseError.content, /服务拒绝本次回答/, 'legacy SSE keeps its interrupted-answer behavior')

let wsHandlers, wsBody
const ws = streamContext(false, { uni: { connectSocket: () => ({ onOpen(fn) { wsHandlers.open = fn }, onMessage(fn) { wsHandlers.message = fn }, onError(fn) { wsHandlers.error = fn }, onClose(fn) { wsHandlers.close = fn }, send(o) { wsBody = JSON.parse(o.data) }, close() {} }) } })
wsHandlers = {}
let wsRunEvents = 0
const wsPromise = ws.run({ text: '问题', history: [], enableThinking: false, enableSearch: false, runRequest: request, onRun: () => wsRunEvents++ })
wsHandlers.open()
wsHandlers.message({ data: JSON.stringify({ type: 'run', runId: uuid, status: 'executing' }) })
wsHandlers.message({ data: JSON.stringify({ type: 'done', runId: uuid, status: 'completed', result: completed.result }) })
const wsResult = await wsPromise
assert.equal(wsBody.requestId, request.requestId)
assert.equal(wsResult.runSnapshot.result.content, '恢复内容')
assert.equal(wsRunEvents, 2, 'WebSocket run and done events preserve task metadata')
wsHandlers = {}
const wsSnapshotPromise = ws.run({ text: '问题', history: [], enableThinking: false, enableSearch: false, runRequest: request, onRun: () => wsRunEvents++ })
wsHandlers.open()
wsHandlers.message({ data: JSON.stringify({ type: 'snapshot', runId: uuid, status: 'executing', userMessageId: '101' }) })
assert.equal((await wsSnapshotPromise).runSnapshot.userMessageId, '101', 'WebSocket snapshot terminates the stream with metadata')
assert.equal(wsRunEvents, 3)

// Account switches invalidate late EOF and WebSocket metadata callbacks.
let current = true, fetchStarted = false, releaseSseRead, staleSseRuns = 0
const staleSse = streamContext(true, { fetch: async () => { fetchStarted = true; return { ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ read: () => new Promise(resolve => { releaseSseRead = resolve }), releaseLock() {} }) } } } })
const staleSsePromise = staleSse.run({ text: '问题', history: [], enableThinking: false, enableSearch: false, runRequest: request, isCurrent: () => current, onRun: () => staleSseRuns++ })
for (let i = 0; i < 8 && (!fetchStarted || !releaseSseRead); i++) await Promise.resolve()
current = false
releaseSseRead({ value: new TextEncoder().encode(`event: run\ndata: ${JSON.stringify({ runId: uuid, status: 'executing' })}\n\n`), done: false })
const staleSseResult = await staleSsePromise
assert.equal(staleSseResult.aborted, true)
assert.equal(staleSseRuns, 0, 'late SSE metadata is ignored after owner change')
current = true
let staleWsHandlers = {}, staleWsRuns = 0
const staleWs = streamContext(false, { uni: { connectSocket: () => ({ onOpen(fn) { staleWsHandlers.open = fn }, onMessage(fn) { staleWsHandlers.message = fn }, onError(fn) { staleWsHandlers.error = fn }, onClose(fn) { staleWsHandlers.close = fn }, send() {}, close() {} }) } })
const staleWsPromise = staleWs.run({ text: '问题', history: [], enableThinking: false, enableSearch: false, runRequest: request, isCurrent: () => current, onRun: () => staleWsRuns++ })
staleWsHandlers.open()
current = false
staleWsHandlers.message({ data: JSON.stringify({ type: 'run', runId: uuid, status: 'executing' }) })
assert.equal((await staleWsPromise).aborted, true)
assert.equal(staleWsRuns, 0, 'late WebSocket metadata is ignored after owner change')

// The page send/recovery/cancel functions are evaluated directly with controlled services.
function takeFunction(source, name) {
  let start = source.indexOf(`function ${name}(`)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  assert(start >= 0, `missing ${name}`)
  const next = source.slice(start + 1).search(/\n(?:async )?function [\w$]+\(/)
  return source.slice(start, next < 0 ? source.length : start + 1 + next)
}
const functions = ['ensureRunLedger', 'updateRunLedger', 'supportsRuns', 'runIsCurrent', 'applyRecoveredRun', 'recoverRun', 'stopPendingRun', 'dismissRun', 'initializeRuns', 'onSend', 'onStop'].map(name => takeFunction(page, name)).join('\n')
function pageContext(overrides = {}) {
  const values = new Map([['token', 'owner-a']])
  const messages = []
  const conversation = { messages: [] }
  const calls = []
  const context = { AbortController, Date, console: { log() {}, error(error) { context.lastError = error } }, pageDisposed: false, runOwner: '', runLedger: null, runCapabilityPromise: null, sendEpoch: 0, pendingRuns: { value: [] }, activeRun: { value: null }, recoveringRun: { value: '' }, runNotice: { value: '' }, isStreaming: { value: false }, imagePreparing: { value: false }, promptText: { value: '用户问题' }, pickedImageDataUrl: { value: 'data:image/png;base64,AAAA' }, pickedImageLocalPath: { value: '/tmp/image.png' }, isSearchEnabled: { value: false }, isDeepThinking: { value: false }, streamingMessageId: { value: '' }, streamingText: { value: '' }, streamingReasoning: { value: '' }, streamingSearch: { value: null }, pendingMessagePreparation: null, activeSessionId: { value: valid.sessionId }, abortCtrl: null, wsSocket: null, requestedRunStop: false, MAX_IMAGE_BYTES: 100000, dataUrlByteLength: () => 3, createMessageId: (() => { let n = 0; return () => `local-${++n}` })(), newActionRequestId: () => valid.requestId,
    baseUrl: 'https://api.example.org', SEED_IMAGE_BINDING_KEY: 'seed-binding', cachedImageOwner: () => 'owner-a', localStorage: { setItem: (key, val) => values.set(key, val) }, getStorage: key => values.get(key) ?? (key === 'token' ? '' : null), setStorage: (key, val) => values.set(key, val), safeJsonParse: value => { try { return JSON.parse(value) } catch { return [] } }, runStorageKey,
    createRunLedger: options => createRunLedger(options), applyRunSnapshot, fetchAiCapabilities: async () => ({ code: 0, data: { runVersion: 1 } }), findChatRun: async id => ({ code: 0, data: { ...completed, requestId: id } }), fetchChatRuns: async () => ({ code: 0, data: { items: [] } }), cancelChatRun: async id => ({ code: 0, data: { requestId: valid.requestId, sessionId: valid.sessionId, runId: id, status: 'cancelled' } }),
    ensureConversation: () => conversation, normalizeChatBusinessCards, normalizeChatDisposalPoints, finalizeChatSearch, refreshConversationMeta() {}, syncConversationList() {}, renderActiveMessages() {}, updateHeader() {}, nextTick: fn => fn?.(), scrollMessagesToBottom() {},
    extractPendingPersistMessages: async () => [], extractHistoryForRequest: () => [], chatEnvironment: { forRequest: async () => ({}) }, pushMessageToActive: (...args) => messages.push({ id: args[6], role: args[0], content: args[1], hasImage: !!args[2], imageBase64: args[2] }), clearPickedImage() {}, markPendingPersistMessagesSaved() {},
    streamChat: async options => { calls.push(options); return { aborted: true, runSnapshot: null } }, uni: { showToast: options => { context.lastToast = options } }, ...overrides }
  context.calls = calls; context.messages = messages; context.values = values; context.conversation = conversation
  vm.createContext(context)
  vm.runInContext(`${platformCode(functions, true)}\nglobalThis.send = onSend; globalThis.stop = onStop; globalThis.recover = recoverRun; globalThis.stopPending = stopPendingRun; globalThis.dismiss = dismissRun; globalThis.initRuns = initializeRuns`, context)
  return context
}
const sendFailsToPersist = pageContext({ localStorage: { setItem: () => { throw new Error('storage unavailable') } } })
await sendFailsToPersist.send()
assert.equal(sendFailsToPersist.calls.length, 0, 'failed ledger persistence prevents sending the request')
assert.equal(sendFailsToPersist.messages.length, 0)
const sendContext = pageContext()
await sendContext.send()
assert.equal(sendContext.calls.length, 1, `run send reaches transport; notice=${sendContext.runNotice.value}; toast=${sendContext.lastToast?.title}; messages=${sendContext.messages.length}; pending=${sendContext.pendingRuns.value.length}; persisted=${JSON.stringify([...sendContext.values])}; error=${sendContext.lastError?.stack}`)
assert.equal(sendContext.calls[0].runRequest.runVersion, 1)
assert.equal(sendContext.calls[0].runRequest.sessionId, valid.sessionId)
assert.equal(sendContext.messages[0].imageBase64, 'data:image/png;base64,AAAA', 'image stays in the in-memory UI message only')
assert.equal(sendContext.messages.length, 1, 'a disconnected run never appends a duplicate assistant placeholder')
assert.match(sendContext.runNotice.value, /连接已中断/, 'clean EOF without a terminal frame shows the recovery notice')
assert.equal(JSON.stringify(sendContext.pendingRuns.value).includes('data:image'), false, 'pending metadata stores no image')
const legacyContext = pageContext({ fetchAiCapabilities: async () => ({ code: 0, data: { runVersion: 0 } }) })
await legacyContext.send()
assert.equal(legacyContext.calls[0].runRequest, null, 'older server capability keeps legacy request format')
let storageWrites = 0
const postSendStorageFailure = pageContext({ localStorage: { setItem: () => { if (++storageWrites > 1) throw new Error('storage unavailable after send') } }, streamChat: async options => { postSendStorageFailure.calls.push(options); options.onRun({ runId: uuid, status: 'executing', userMessageId: '101' }); return { aborted: true, runSnapshot: null } } })
await postSendStorageFailure.send()
assert.equal(postSendStorageFailure.calls.length, 1, 'post-send ledger write failure does not interrupt the active stream')
assert.equal(postSendStorageFailure.pendingRuns.value[0].requestId, valid.requestId, 'safe ledger update retains the existing recovery ID')
assert.equal(postSendStorageFailure.pendingRuns.value[0].runId, '', 'failed metadata persistence keeps the previous durable state')
let cancelledSend
cancelledSend = pageContext({ streamChat: async options => {
  options.onRun({ runId: uuid, userMessageId: '101', status: 'executing' })
  await cancelledSend.stopPending(cancelledSend.activeRun.value)
  throw new Error('late SSE error after confirmed stop')
} })
await cancelledSend.send()
assert.equal(cancelledSend.pendingRuns.value.length, 0, 'a confirmed cancelled task has no recovery entry')
assert.equal(cancelledSend.runNotice.value, '已确认停止本次任务。', 'a later stream error does not overwrite confirmed cancellation')

// A first-stop 404 can race the initial run event; the newly learned run ID is looked up and cancelled once.
let initialRunEvent, finishInterleaved, lookups = 0, cancelInterleaved, detachInterleaved = 0, cancelCalls = 0
const interleaved = pageContext({
  streamChat: options => { interleaved.calls.push(options); initialRunEvent = options.onRun; return new Promise(resolve => { finishInterleaved = resolve }) },
  findChatRun: async id => { if (++lookups === 1) throw Object.assign(new Error('not found yet'), { statusCode: 404 }); return { code: 0, data: { requestId: id, sessionId: valid.sessionId, runId: uuid, status: 'executing' } } },
  cancelChatRun: () => { cancelCalls++; return new Promise(resolve => { cancelInterleaved = resolve }) },
  abortCtrl: { abort() { detachInterleaved++ } }
})
const interleavedSend = interleaved.send()
for (let i = 0; i < 10 && !initialRunEvent; i++) await Promise.resolve()
if (!initialRunEvent) await new Promise(resolve => setTimeout(resolve, 0))
assert.equal(interleaved.calls.length, 1, `interleaved run starts: ${interleaved.lastToast?.title}; notice=${interleaved.runNotice.value}; pending=${JSON.stringify(interleaved.pendingRuns.value)}; messages=${interleaved.messages.length}`)
interleaved.stop()
assert.equal(interleaved.requestedRunStop, true, 'stop records a pending cancel request before run ID is known')
for (let i = 0; i < 10 && lookups < 1; i++) await Promise.resolve()
initialRunEvent({ runId: uuid, userMessageId: '101', status: 'executing' })
for (let i = 0; i < 20 && !cancelInterleaved; i++) await Promise.resolve()
assert.equal(lookups, 1, 'the initial status lookup returns 404')
assert.equal(cancelCalls, 1)
assert.equal(detachInterleaved, 0, 'transport remains attached until cancel is confirmed')
cancelInterleaved({ code: 0, data: { requestId: valid.requestId, sessionId: valid.sessionId, runId: uuid, status: 'cancelled' } })
for (let i = 0; i < 10; i++) await Promise.resolve()
assert.equal(detachInterleaved, 1)
finishInterleaved({ aborted: true, runSnapshot: null })
await interleavedSend

// Failure/unknown recovery never POSTs a replacement; user and page changes reject late responses.
let resolveFind
const late = pageContext({ findChatRun: () => new Promise(resolve => { resolveFind = resolve }) })
late.values.set('ledger', [valid]); late.runOwner = 'owner-a'; late.runLedger = createRunLedger({ key: 'ledger', read: () => [valid], write: () => {} }); late.pendingRuns.value = [valid]
const recovering = late.recover(valid)
late.values.set('token', 'owner-b')
resolveFind({ code: 0, data: completed })
await recovering
assert.equal(late.messages.length, 0)
assert.equal(late.calls.length, 0, 'failed or unknown recovery never starts another model POST')
const unknown = pageContext({ findChatRun: async () => ({ code: 503 }) })
unknown.runOwner = 'owner-a'; unknown.runLedger = createRunLedger({ key: 'ledger', read: () => [valid], write: () => {} }); unknown.pendingRuns.value = [valid]
await unknown.recover(valid)
assert.equal(unknown.calls.length, 0, 'unknown status does not auto-resend')
assert.match(unknown.lastToast.title, /暂不可用/, 'a failed lookup has visible feedback')
for (const status of ['failed', 'cancelled']) {
  let finishQuery
  const terminal = pageContext({ findChatRun: () => new Promise(resolve => { finishQuery = resolve }) })
  terminal.runOwner = 'owner-a'; terminal.runLedger = createRunLedger({ key: 'ledger', read: () => [valid], write() {} }); terminal.pendingRuns.value = [valid]
  const query = terminal.recover(valid)
  assert.equal(terminal.recoveringRun.value, valid.requestId, 'lookup keeps its busy state until the response arrives')
  finishQuery({ code: 0, data: { ...completed, status } })
  await query
  assert.equal(terminal.pendingRuns.value.length, 0, `${status} has no recoverable answer and is removed`)
  assert.match(terminal.lastToast.title, /没有可恢复的内容/, 'a terminal lookup explains why no answer appears')
  assert.equal(terminal.recoveringRun.value, '')
  assert.equal(terminal.calls.length, 0, 'querying a terminal run never retries model generation')
}
assert(page.includes("recoveringRun === item.requestId ? '查询中…' : '查询回答'"), 'query button shows progress')

// Seed persistence is marked only for the target conversation's acknowledged seed IDs.
const seedConversation = { messages: [{ id: 'seed-a', _pendingPersist: true }, { id: 'seed-b', _pendingPersist: true }] }
let seedBinding = JSON.stringify({ sessionId: 'seed-session', owner: 'image-owner', pending: true })
const seedContext = { SEED_IMAGE_BINDING_KEY: 'seed-binding', activeSessionId: { value: 'other-session' }, messageList: { value: [{ id: 'other-session-message' }] }, ensureConversation: () => seedConversation,
  safeJsonParse: value => JSON.parse(value), getStorage: () => seedBinding, setStorage: (_, value) => { seedBinding = value }, cachedImageOwner: () => 'image-owner' }
vm.createContext(seedContext)
vm.runInContext(`${takeFunction(page, 'markPendingPersistMessagesSaved')}\nglobalThis.mark = markPendingPersistMessagesSaved`, seedContext)
seedContext.mark('seed-session', ['seed-a'])
assert.equal(seedConversation.messages[0]._pendingPersist, false)
assert.equal(seedConversation.messages[1]._pendingPersist, true)
assert.equal(JSON.parse(seedBinding).pending, true, 'image binding stays pending while another seed remains unsaved')
seedContext.mark('seed-session', ['seed-b'])
assert.equal(JSON.parse(seedBinding).pending, false, 'binding clears after every seed is acknowledged')
assert.equal(seedContext.messageList.value[0].id, 'other-session-message', 'inactive conversation does not replace the visible message list')

const recovered = pageContext()
recovered.runOwner = 'owner-a'; recovered.runLedger = createRunLedger({ key: 'ledger', read: () => [valid], write: () => {} }); recovered.pendingRuns.value = [valid]
recovered.applyRecoveredRun(valid, completed)
assert.equal(recovered.pendingRuns.value.length, 0, 'completed recovery removes the ledger entry')
assert.equal(recovered.conversation.messages.filter(x => x.role === 'assistant' && x.id === '202').length, 1)
let markedSeedIds
const fingerprintItem = { ...valid, runId: uuid, seedLocalIds: ['seed-before-refresh'], seedFingerprint: 'fingerprint-a' }
const refreshed = pageContext({ getStorage: key => key === 'seed-binding' ? JSON.stringify({ sessionId: valid.sessionId, owner: 'owner-a', fingerprint: 'fingerprint-a' }) : 'owner-a', markPendingPersistMessagesSaved: (sessionId, ids) => { markedSeedIds = { sessionId, ids } } })
refreshed.runOwner = 'owner-a'; refreshed.runLedger = createRunLedger({ key: 'ledger', read: () => [fingerprintItem], write: () => {} }); refreshed.pendingRuns.value = [fingerprintItem]
refreshed.conversation.messages = [
  { id: 'seed-after-refresh', role: 'user', content: 'seed', _pendingPersist: true, _seedFingerprint: 'fingerprint-a' },
  { id: 'unrelated-seed', role: 'user', content: 'other', _pendingPersist: true, _seedFingerprint: 'fingerprint-b' }
]
refreshed.applyRecoveredRun(fingerprintItem, { requestId: valid.requestId, sessionId: valid.sessionId, runId: uuid, status: 'executing', userMessageId: '101' })
assert.equal(markedSeedIds.sessionId, valid.sessionId)
assert(markedSeedIds.ids.includes('seed-after-refresh'), 'matching fingerprint restores newly generated seed IDs')
assert(!markedSeedIds.ids.includes('unrelated-seed'), 'different fingerprint seed stays pending')
assert.equal(refreshed.conversation.messages.find(x => x.id === 'unrelated-seed')._pendingPersist, true)

const dismissUnknown = pageContext({ uni: { showModal: options => options.success({ confirm: true }), showToast() {} } })
dismissUnknown.runOwner = 'owner-a'; dismissUnknown.runLedger = createRunLedger({ key: 'ledger', read: () => [valid], write: () => {} }); dismissUnknown.pendingRuns.value = [valid]
dismissUnknown.dismissRun(valid)
assert.equal(dismissUnknown.pendingRuns.value.length, 0, 'an unknown pending record can be explicitly dismissed locally')
assert.equal(dismissUnknown.calls.length, 0, 'dismissing an unknown pending record sends no request')

// Cancel is confirmed first, then the active transport is detached.
let resolveCancel
const cancelOrder = []
const cancel = pageContext({ findChatRun: async id => ({ code: 0, data: { requestId: id, sessionId: valid.sessionId, runId: uuid, status: 'executing' } }), cancelChatRun: () => new Promise(resolve => { resolveCancel = resolve; cancelOrder.push('request') }), abortCtrl: { abort: () => cancelOrder.push('detach') } })
cancel.runOwner = 'owner-a'; cancel.runLedger = createRunLedger({ key: 'ledger', read: () => [valid], write: () => {} }); cancel.pendingRuns.value = [valid]; cancel.activeRun.value = valid
const cancelling = cancel.stop()
for (let i = 0; i < 6 && !resolveCancel; i++) await Promise.resolve()
assert.equal(cancelOrder.join(','), 'request')
resolveCancel({ code: 0, data: { ...completed, status: 'cancelled' } })
for (let i = 0; i < 8; i++) await Promise.resolve()
assert.equal(cancelOrder.join(','), 'request,detach', `transport detach follows authoritative cancel response (${cancel.runNotice.value})`)

// Unmount closes local transports and invalidates callbacks without issuing a server cancel.
let abortCount = 0, closeCount = 0, serverCancelCount = 0, disposed = false
const unmountContext = { pageDisposed: false, chatEnvironment: { dispose() { disposed = true } }, pendingMessagePreparation: null, closeHistoryDrawer() {}, abortCtrl: { abort() { abortCount++ } }, wsSocket: { close() { closeCount++ } }, onBeforeUnmount: fn => fn(), runIsCurrent() { return false }, cancelChatRun() { serverCancelCount++ }, window: {} }
vm.createContext(unmountContext)
const unmountStart = page.indexOf('onBeforeUnmount(() => {')
const unmountEnd = page.indexOf('\n</script>', unmountStart)
vm.runInContext(`let onStorageHandler = null, drawerMediaQuery = null, onDrawerMediaChange = null, composerResizeObserver = null, onComposerWindowResize = null; ${platformCode(page.slice(unmountStart, unmountEnd), true)}`, unmountContext)
assert(page.slice(unmountStart, unmountEnd).includes('pageDisposed = true'), 'unmount invalidates late callbacks')
assert.equal(disposed, true)
assert.equal(abortCount, 1)
assert.equal(closeCount, 1)
assert.equal(serverCancelCount, 0, 'unmount detaches transports without cancelling the server run')

assert(page.includes('void initializeRuns()'), 'initialization does a single capability/list bootstrap')
assert(!/setInterval\s*\(/.test(page), 'run states are never polled')
assert(page.includes('if (abortCtrl) abortCtrl.abort()') && page.includes('if (wsSocket) {'), 'unmount detaches local transports')
for (const platform of ['H5', 'MP-WEIXIN', 'APP-PLUS']) {
  const { descriptor: runFile, errors } = parse(unipreprocess(page, platform), { filename: 'ai-chat.vue' })
  assert.deepEqual(errors, [], `${platform} run page SFC parses`)
  const script = compileScript(runFile, { id: `runs-${platform}` })
  const template = compileTemplate({ source: runFile.template.content, filename: 'ai-chat.vue', id: `runs-${platform}`, compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(template.errors, [], `${platform} run page template compiles`)
  for (const style of runFile.styles) assert.deepEqual(compileStyle({ source: style.content, filename: 'ai-chat.vue', id: `runs-${platform}`, scoped: style.scoped }).errors, [], `${platform} run page styles compile`)
}
console.log('ai-chat run checks passed: ledger, SSE/WS, snapshots, recovery, cancellation, platform compile')
