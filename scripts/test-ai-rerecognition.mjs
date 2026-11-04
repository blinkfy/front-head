import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { businessActionRequestId } from '../src/pages-nonTheme/utils/ai-chat-business.mjs'
import { initPreContext, preCss, preHtml, preJs } from '@dcloudio/uni-cli-shared/dist/preprocess/index.js'

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const source = fs.readFileSync(new URL('../src/pages-nonTheme/components/ChatBusinessCards.vue', import.meta.url), 'utf8')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

function takeFunction(name) {
  let start = source.indexOf(`function ${name}(`)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  assert(start >= 0, `missing ${name}`)
  const next = source.slice(start + 1).search(/\n(?:async )?function [\w$]+\(/)
  return source.slice(start, next < 0 ? source.length : start + 1 + next)
}

function setup(api = {}) {
  const calls = { modals: [], posts: [], details: [], images: [], toasts: [] }
  const props = { sessionId: 'session-1', messageId: 'message-1', pageEpoch: 1 }
  const context = {
    props, alive: true, detailRequestId: 0, actionRequestVersion: 0, createRequestIds: new Map(),
    detailOpen: { value: false }, detailLoading: { value: false }, detailError: { value: '' }, detailImage: { value: '' },
    detailRecognition: { value: null }, activeCard: { value: null }, confirmingRecognition: { value: false }, failedRecognitionId: { value: '' }, busyProductId: { value: '' },
    fetchAiCapabilities: api.fetchAiCapabilities || (async () => ({ code: 0, data: { actions: { rerecognition: true } } })),
    rerecognizeHistory: api.rerecognizeHistory || (async body => { calls.posts.push(body); return { code: 0, data: { historyId: 'new-history' } } }),
    getHistoryRecognitionDetail: api.getHistoryRecognitionDetail || (async id => { calls.details.push(id); return { code: 0, data: { details: { id } } } }),
    getHistoryImage: api.getHistoryImage || (async id => { calls.images.push(id); return { code: 0, data: { image: `/${id}.jpg` } } }),
    baseUrl: 'https://example.test', businessActionRequestId,
    newActionRequestId: api.newActionRequestId || (() => `key-${(api.keyCount = (api.keyCount || 0) + 1)}`),
    uni: { showModal: options => calls.modals.push(options), showToast: x => calls.toasts.push(x) },
    onBeforeUnmount: cb => { context.unmount = cb }
  }
  context.onBeforeUnmount(context.unmount)
  vm.createContext(context)
  vm.runInContext(['beginCardAction', 'openRecognition', 'closeDetail', 'recognizeAgain', 'restartRecognition'].map(takeFunction).join('\n'), context)
  return { context, calls }
}
const card = { type: 'recognition', id: 'source-42', title: '原识别记录' }
async function openReady(h) {
  await h.context.openRecognition(card)
  assert.equal(h.context.detailImage.value, 'https://example.test/source-42.jpg')
}
async function approve(h, task) {
  await tick()
  const modal = h.calls.modals.at(-1)
  assert.ok(modal)
  modal.success({ confirm: true, cancel: false })
  await task
}

// User cancellation never submits, and a concurrent double tap is blocked before any duplicate work.
{
  const h = setup(), c = h.context
  await openReady(h)
  const first = c.recognizeAgain()
  const duplicate = c.recognizeAgain()
  await tick()
  assert.equal(h.calls.modals.length, 1)
  assert.equal(h.calls.posts.length, 0)
  h.calls.modals[0].success({ confirm: false, cancel: true })
  await Promise.all([first, duplicate])
  assert.equal(h.calls.posts.length, 0)
  assert.equal(c.busyProductId.value, '')
}

// Capability absence stops before confirmation or POST.
{
  const h = setup({ fetchAiCapabilities: async () => ({ code: 0, data: { actions: { rerecognition: false } } }) })
  await openReady(h)
  await h.context.recognizeAgain()
  assert.equal(h.calls.modals.length, 0)
  assert.equal(h.calls.posts.length, 0)
  assert.match(h.context.detailError.value, /暂不支持/)
}

// A timed-out POST retry reuses its request key and success loads the new history image and detail.
{
  let attempts = 0
  const h = setup({ rerecognizeHistory: async body => {
    h.calls.posts.push(body)
    if (++attempts === 1) throw new Error('timeout')
    return { code: 0, data: { historyId: 'new-history' } }
  } })
  await openReady(h)
  let task = h.context.recognizeAgain()
  await approve(h, task)
  assert.match(h.context.detailError.value, /timeout/)
  task = h.context.recognizeAgain()
  await approve(h, task)
  assert.equal(h.calls.posts.length, 2)
  assert.deepEqual(h.calls.posts[0], h.calls.posts[1])
  assert.deepEqual({ historyId: h.calls.posts[0].historyId, requestId: h.calls.posts[0].requestId }, { historyId: 'source-42', requestId: h.calls.posts[0].requestId })
  assert.ok(h.calls.posts[0].requestId, 'request key is present and stable across an uncertain timeout retry')
  assert.deepEqual(h.calls.details, ['source-42', 'new-history'])
  assert.deepEqual(h.calls.images, ['source-42', 'new-history'])
  assert.equal(h.context.activeCard.value.id, 'new-history')
  assert.equal(h.context.detailImage.value, 'https://example.test/new-history.jpg')
}

// A definitive failed status enables an explicit restart with a fresh request key; generic uncertainty does not.
{
  let attempt = 0
  const h = setup({ rerecognizeHistory: async body => {
    h.calls.posts.push(body)
    if (++attempt === 1) throw { message: 'recognition failed', data: { status: 'failed' } }
    return { code: 0, data: { historyId: 'recovered-history' } }
  } })
  await openReady(h)
  let task = h.context.recognizeAgain(); await approve(h, task)
  assert.equal(h.context.failedRecognitionId.value, 'source-42')
  task = h.context.restartRecognition(); await approve(h, task)
  assert.notEqual(h.calls.posts[0].requestId, h.calls.posts[1].requestId, 'explicit restart starts a new idempotency key')
  assert.equal(h.context.activeCard.value.id, 'recovered-history')
}
{
  const h = setup({ rerecognizeHistory: async body => { h.calls.posts.push(body); throw new Error('unknown network state') } })
  await openReady(h)
  let task = h.context.recognizeAgain(); await approve(h, task)
  assert.equal(h.context.failedRecognitionId.value, '')
  assert.equal(h.context.restartRecognition(), undefined, 'uncertain outcomes cannot trigger a new-key restart')
  task = h.context.recognizeAgain(); await approve(h, task)
  assert.equal(h.calls.posts[0].requestId, h.calls.posts[1].requestId)
}

// Every stale source-detail operation is isolated after close, replacement open, page hide, or unmount.
for (const staleCase of ['close', 'reopen', 'hide', 'unmount']) {
  const detail = deferred(), image = deferred()
  const h = setup({ getHistoryRecognitionDetail: () => detail.promise, getHistoryImage: () => image.promise })
  const c = h.context
  const load = c.openRecognition(card)
  if (staleCase === 'close') c.closeDetail()
  if (staleCase === 'reopen') { c.closeDetail(); c.getHistoryRecognitionDetail = async () => ({ code: 0, data: { details: { id: 'replacement' } } }); c.getHistoryImage = async () => ({ code: 0, data: { image: '/replacement.jpg' } }); await c.openRecognition({ id: 'replacement', title: 'replacement' }) }
  if (staleCase === 'hide') { c.props.pageEpoch++; c.actionRequestVersion++; c.closeDetail() }
  if (staleCase === 'unmount') { c.alive = false; c.actionRequestVersion++; c.detailRequestId++ }
  detail.resolve({ code: 0, data: { details: { id: 'stale' } } }); image.resolve({ code: 0, data: { image: '/stale.jpg' } })
  await load
  assert.notEqual(c.detailRecognition.value?.id, 'stale', `${staleCase}: stale detail was ignored`)
  assert.notEqual(c.detailImage.value, 'https://example.test/stale.jpg', `${staleCase}: stale image was ignored`)
  assert.equal(c.activeCard.value?.id, staleCase === 'reopen' ? 'replacement' : 'source-42')
}

// A POST finishing after closing/reopening the source or page hide must not open/replace details.
for (const staleCase of ['close', 'reopen', 'hide']) {
  const post = deferred(), h = setup({ rerecognizeHistory: () => post.promise }), c = h.context
  await openReady(h)
  const task = c.recognizeAgain()
  await tick(); h.calls.modals[0].success({ confirm: true }); await tick()
  if (staleCase === 'close') c.closeDetail()
  if (staleCase === 'reopen') await openReady(h)
  if (staleCase === 'hide') { c.props.pageEpoch++; c.actionRequestVersion++; c.closeDetail() }
  post.resolve({ code: 0, data: { historyId: 'stale-result' } }); await task
  assert.notEqual(c.activeCard.value.id, 'stale-result')
  assert.notEqual(c.detailRecognition.value?.id, 'stale-result')
}

// Compile this SFC using each platform's preprocessor branch and Vue SFC compiler.
const filename = 'src/pages-nonTheme/components/ChatBusinessCards.vue'
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
for (const platform of ['h5', 'mp-weixin', 'app']) {
  initPreContext(platform)
  const processedScript = preJs(descriptor.scriptSetup.content, filename)
  const processedTemplate = preHtml(descriptor.template.content, filename)
  const processedStyles = descriptor.styles.map(style => preCss(style.content, filename))
  const compiled = compileScript({ ...descriptor, scriptSetup: { ...descriptor.scriptSetup, content: processedScript } }, { id: `rerecognition-${platform}` })
  assert.deepEqual(compileTemplate({ source: processedTemplate, filename, id: `rerecognition-${platform}`, compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [], `${platform} template`)
  for (let i = 0; i < descriptor.styles.length; i++) assert.deepEqual(compileStyle({ source: processedStyles[i], filename, id: `rerecognition-${platform}`, scoped: descriptor.styles[i].scoped }).errors, [], `${platform} style ${i}`)
}

console.log('AI rerecognition method tests and H5/MP/App SFC compilation passed')
