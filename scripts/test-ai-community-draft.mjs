import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { initPreContext, preCss, preHtml, preJs } from '@dcloudio/uni-cli-shared/dist/preprocess/index.js'
import { businessActionRequestId, normalizeChatBusinessCards } from '../src/pages-nonTheme/utils/ai-chat-business.mjs'
import { actionDetailUrl, normalizeActionSummaries } from '../src/pages-nonTheme/utils/ai-chat-actions.mjs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const methodSource = read('../src/pages-nonTheme/utils/community-draft-methods.js')
const methodFactorySource = `${methodSource.replace(/^import .*\r?\n/gm, '').replace('export const communityDraftMethods =', 'this.communityDraftMethods =')}`
const future = '2999-01-01T00:00:00.000Z'
const draft = (overrides = {}) => ({ id: 'community-1', type: 'community_post', status: 'pending', version: 1, expiresAt: future,
  payload: { communityId: 7, content: '  分享心得  ', images: [], tag: '心得', visibilityScope: 'community' }, ...overrides })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

function makeMethods(api = {}) {
  const toast = [], modals = [], navigations = []
  const context = { ...api, Date, Number, Object, String, uni: {
    showToast: item => toast.push(item), showModal: item => modals.push(item),
    navigateTo: item => navigations.push(item), redirectTo: item => navigations.push(item)
  } }
  runInNewContext(methodFactorySource, context)
  return { methods: context.communityDraftMethods, toast, modals, navigations }
}
function makeState(methods, overrides = {}) {
  return { ...methods, draftId: 'community-1', draft: null, draftLoading: false, draftError: '', draftExpired: false, draftReceipt: null,
    draftLoadVersion: 0, pageClosed: false, submitting: false, replacementRequestId: '', communityId: 0,
    content: '  更新后的帖子  ', uploadedImages: [], selectedTag: '技巧', visibilityScope: 'community', isAdmin: false,
    async getPersistentImages() { return this.uploadedImages }, ...overrides }
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

// The real production methods are evaluated with mocked network functions.
let reads = 0, patches = 0, confirms = 0
const calls = []
const first = makeMethods({
  fetchAiAction: async id => { reads++; calls.push(['read', id]); return { code: 0, data: draft() } },
  updateAiAction: async (id, body) => { patches++; calls.push(['patch', id]); assert.equal(body.version, 1); return { code: 0, data: draft({ version: 2, payload: body.payload }) } },
  confirmAiAction: async (id, body) => { confirms++; calls.push(['confirm', id]); assert.equal(body.version, 2); return { code: 0, data: { post: { id: 88 } } } },
  createCommunityPostDraft: async () => { throw new Error('unexpected create') }, newActionRequestId: () => 'replacement-request'
})
const saveState = makeState(first.methods)
await saveState.loadCommunityDraft()
assert.equal(saveState.communityId, 7)
assert.equal(saveState.content, '  分享心得  ')
await saveState.saveCommunityDraft(false)
assert.equal(reads, 2)
assert.equal(patches, 1)
assert.equal(confirms, 0, 'saving a draft never confirms publication')
assert.deepEqual(calls.map(call => call[0]), ['read', 'read', 'patch'])

const publishCalls = []
const publish = makeMethods({
  fetchAiAction: async id => { publishCalls.push(['read', id]); return { code: 0, data: draft() } },
  updateAiAction: async (id, body) => { publishCalls.push(['patch', id]); return { code: 0, data: draft({ version: body.version + 1, payload: body.payload }) } },
  confirmAiAction: async (id, body) => { publishCalls.push(['confirm', id]); assert.equal(body.version, 2); return { code: 0, data: { post: { id: 99 } } } },
  createCommunityPostDraft: async () => { throw new Error('draft publish must not create another draft') }
})
const publishState = makeState(publish.methods)
await publishState.loadCommunityDraft()
await publishState.saveCommunityDraft(true)
assert.deepEqual(publishCalls.map(call => call[0]), ['read', 'read', 'patch', 'confirm'])
assert.ok(publishCalls.every(call => call[1] === 'community-1'), 'publish reads, patches and confirms only the same draft')
assert.equal(publishState.draftReceipt.id, 99)

// A lost confirmation response is recovered by reading completed state; no second POST/confirm is issued.
let retryReads = 0, retryPatches = 0, retryConfirms = 0
const retry = makeMethods({
  fetchAiAction: async id => { retryReads++; return { code: 0, data: retryReads < 3 ? draft() : draft({ status: 'completed', version: 3, result: { post: { id: 101 } } }) } },
  updateAiAction: async (_id, body) => { retryPatches++; return { code: 0, data: draft({ version: body.version + 1, payload: body.payload }) } },
  confirmAiAction: async () => { retryConfirms++; throw new Error('response lost') }, createCommunityPostDraft: async () => { throw new Error('unexpected create') }
})
const retryState = makeState(retry.methods)
await retryState.loadCommunityDraft()
await retryState.saveCommunityDraft(true)
assert.equal(retryConfirms, 1)
await retryState.saveCommunityDraft(true)
assert.equal(retryReads, 3, 'retry checks the same draft before acting')
assert.equal(retryPatches, 1)
assert.equal(retryConfirms, 1, 'completed retry does not confirm again')
assert.equal(retryState.draftReceipt.id, 101)

// Out-of-date versions and 409 conflicts reload state and stop before confirmation.
let changedPatches = 0, changedConfirms = 0
const changed = makeMethods({
  fetchAiAction: async () => ({ code: 0, data: draft({ version: 2, payload: { communityId: 9, content: 'other device', images: [], tag: '心得' } }) }),
  updateAiAction: async () => { changedPatches++ }, confirmAiAction: async () => { changedConfirms++ }
})
const changedState = makeState(changed.methods, { draft: draft({ version: 1 }) })
await changedState.saveCommunityDraft(true)
assert.equal(changedPatches, 0)
assert.equal(changedConfirms, 0)
assert.equal(changedState.content, 'other device', 'version mismatch reloads newer edits')

let conflictReads = 0, conflictConfirms = 0
const conflict = makeMethods({
  fetchAiAction: async () => ({ code: 0, data: draft({ version: ++conflictReads }) }),
  updateAiAction: async () => { throw { statusCode: 409, message: '版本冲突' } },
  confirmAiAction: async () => { conflictConfirms++ }
})
const conflictState = makeState(conflict.methods, { draft: draft() })
await conflictState.saveCommunityDraft(true)
assert.equal(conflictReads, 2, '409 causes a fresh read')
assert.equal(conflictConfirms, 0)
assert.equal(conflictState.draft.version, 2)

// Expired and cancelled drafts remain terminal unless the user explicitly recreates.
let recreates = 0, terminalPatches = 0, terminalConfirms = 0
const terminal = makeMethods({
  fetchAiAction: async id => ({ code: 0, data: draft({ id: id || 'community-1', status: 'cancelled' }) }),
  updateAiAction: async () => { terminalPatches++ }, confirmAiAction: async () => { terminalConfirms++ },
  createCommunityPostDraft: async input => { recreates++; assert.equal(input.payload.content, '  分享心得  '); return { code: 0, data: draft({ id: 'replacement' }) } },
  newActionRequestId: () => 'replacement-request'
})
const terminalState = makeState(terminal.methods)
await terminalState.loadCommunityDraft()
assert.equal(terminalState.draftExpired, true)
await terminalState.saveCommunityDraft(true)
assert.equal(terminalPatches + terminalConfirms + recreates, 0, 'terminal draft does not silently publish or recreate')
await terminalState.recreateCommunityDraft()
assert.equal(recreates, 1, 'recreation is an explicit user action')
assert.equal(terminal.navigations.at(-1).url, '/pages-nonTheme/community-publish?draftId=replacement')

// Unload during an in-flight save prevents the later confirmation; unload during recreation prevents navigation.
const latePatch = deferred()
let lateConfirms = 0
const late = makeMethods({
  fetchAiAction: async () => ({ code: 0, data: draft() }), updateAiAction: () => latePatch.promise,
  confirmAiAction: async () => { lateConfirms++; return { code: 0, data: { post: { id: 1 } } } }
})
const lateState = makeState(late.methods, { draft: draft() })
const lateSave = lateState.saveCommunityDraft(true)
await tick()
lateState.pageClosed = true
latePatch.resolve({ code: 0, data: draft({ version: 2 }) })
await lateSave
assert.equal(lateConfirms, 0, 'unloaded page does not confirm after a late patch response')

const lateCreate = deferred()
const lateNavigation = makeMethods({
  fetchAiAction: async id => ({ code: 0, data: draft({ id }) }),
  createCommunityPostDraft: () => lateCreate.promise, newActionRequestId: () => 'req'
})
const lateCreateState = makeState(lateNavigation.methods, { draftExpired: true, draft: draft({ expiresAt: '2000-01-01T00:00:00Z' }) })
const recreateOperation = lateCreateState.recreateCommunityDraft()
await tick()
lateCreateState.pageClosed = true
lateCreate.resolve({ code: 0, data: draft({ id: 'late-replacement' }) })
await recreateOperation
assert.equal(lateNavigation.navigations.length, 0, 'unloaded page cannot navigate from a late create response')

// Exercise the actual card handler for capability, community membership, stable IDs and navigation.
const cardPath = '../src/pages-nonTheme/components/ChatBusinessCards.vue'
const cardSource = parse(read(cardPath), { filename: cardPath }).descriptor.scriptSetup.content
const cardAst = parseJavaScript(cardSource, { sourceType: 'module' }).program.body
const cardFunction = name => cardAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
const cardFunctionsSource = ['beginCardAction', 'openCommunityPost'].map(name => cardSource.slice(cardFunction(name).start, cardFunction(name).end)).join('\n')
const pageEpochWatch = cardAst.find(node => node.type === 'ExpressionStatement' && node.expression?.callee?.name === 'watch')
assert.ok(pageEpochWatch, 'card page epoch watcher exists')
const pageEpochWatchSource = cardSource.slice(pageEpochWatch.start, pageEpochWatch.end)
const communityCard = normalizeChatBusinessCards([{ type: 'community_post', id: 'post-1', title: '分享', postContent: '来自聊天', actionKey: 'a6de8123-7abc-4def-8abc-0123456789ab' }])[0]
async function runCard({ supported = true, communityId = 7, mounted = true } = {}) {
  const nav = [], modals = [], created = []
  const state = { props: { sessionId: 'session-1', messageId: '123', pageEpoch: 0 }, alive: true, actionRequestVersion: 0,
    busyProductId: { value: '' }, detailOpen: { value: false }, detailRequestId: 0, pageEpochWatcher: null,
    createRequestIds: new Map(), businessActionRequestId,
    communityPostSupported: value => value?.supported === true, fetchAiCapabilities: async () => ({ supported }),
    isCapabilityNotFound: () => false, getMyCommunity: async () => ({ code: 0, data: { id: communityId } }),
    createCommunityPostDraft: async input => { created.push(input); return { code: 0, data: { id: 'card-draft' } } }, newActionRequestId: () => 'fallback',
    uni: { navigateTo: item => nav.push(item), showModal: item => modals.push(item) }, encodeURIComponent }
  const source = `let alive = true, actionRequestVersion = 0, detailRequestId = 0; const props = this.props; const busyProductId = this.busyProductId; const detailOpen = this.detailOpen; const createRequestIds = this.createRequestIds; const businessActionRequestId = this.businessActionRequestId; const communityPostSupported = this.communityPostSupported; const fetchAiCapabilities = this.fetchAiCapabilities; const isCapabilityNotFound = this.isCapabilityNotFound; const getMyCommunity = this.getMyCommunity; const createCommunityPostDraft = this.createCommunityPostDraft; const newActionRequestId = this.newActionRequestId; const uni = this.uni; const encodeURIComponent = this.encodeURIComponent; const watch = (_source, callback) => { this.pageEpochWatcher = callback }; function closeDetail() { detailOpen.value = false; detailRequestId++ }\n${pageEpochWatchSource}\n${cardFunctionsSource}\nthis.run = openCommunityPost; this.unmount = () => { alive = false; actionRequestVersion++ }`
  runInNewContext(source, state)
  if (!mounted) state.unmount()
  await state.run(communityCard)
  return { nav, modals, created, state }
}
const cardA = await runCard(), cardB = await runCard()
assert.equal(cardA.created[0].requestId, cardB.created[0].requestId, 'server actionKey yields a stable request ID across instances')
assert.equal(cardA.created[0].payload.communityId, 7)
assert.ok(cardA.nav[0].url.endsWith('/community-publish?draftId=card-draft'))
const unsupportedCard = await runCard({ supported: false })
assert.match(unsupportedCard.modals[0].content, /暂不支持帖子草稿/)
assert.equal(unsupportedCard.created.length, 0)
const noCommunity = await runCard({ communityId: null })
assert.match(noCommunity.modals[0].content, /先加入社区/)
assert.equal(noCommunity.created.length, 0)
const unmountedCard = await runCard({ mounted: false })
assert.equal(unmountedCard.created.length, 0)
const hiddenCapability = deferred()
const hidden = await (async () => {
  const nav = [], modals = [], created = []
  const state = { props: { sessionId: 'session-1', messageId: '123', pageEpoch: 0 }, busyProductId: { value: '' }, detailOpen: { value: false },
    createRequestIds: new Map(), businessActionRequestId, communityPostSupported: value => value?.supported === true,
    fetchAiCapabilities: () => hiddenCapability.promise, isCapabilityNotFound: () => false, getMyCommunity: async () => ({ code: 0, data: { id: 7 } }),
    createCommunityPostDraft: async input => { created.push(input); return { code: 0, data: { id: 'hidden-draft' } } }, newActionRequestId: () => 'req',
    uni: { navigateTo: item => nav.push(item), showModal: item => modals.push(item) }, encodeURIComponent }
  const source = `let alive = true, actionRequestVersion = 0, detailRequestId = 0; const props = this.props; const busyProductId = this.busyProductId; const detailOpen = this.detailOpen; const createRequestIds = this.createRequestIds; const businessActionRequestId = this.businessActionRequestId; const communityPostSupported = this.communityPostSupported; const fetchAiCapabilities = this.fetchAiCapabilities; const isCapabilityNotFound = this.isCapabilityNotFound; const getMyCommunity = this.getMyCommunity; const createCommunityPostDraft = this.createCommunityPostDraft; const newActionRequestId = this.newActionRequestId; const uni = this.uni; const encodeURIComponent = this.encodeURIComponent; const watch = (_source, callback) => { this.pageEpochWatcher = callback }; function closeDetail() { detailOpen.value = false; detailRequestId++ }\n${pageEpochWatchSource}\n${cardFunctionsSource}\nthis.run = openCommunityPost`
  runInNewContext(source, state)
  const operation = state.run(communityCard)
  state.props.pageEpoch++
  state.pageEpochWatcher()
  hiddenCapability.resolve({ supported: true })
  await operation
  return { nav, modals, created, state }
})()
assert.equal(hidden.created.length, 0, 'a page hidden during capability lookup cannot create a draft')
assert.equal(hidden.nav.length, 0, 'a late card action cannot navigate after page epoch changes')
assert.equal(hidden.state.busyProductId.value, '', 'page epoch watcher releases the busy state')

// The regular community publish path continues to call createPost without a draft ID.
const publishPath = '../src/pages-nonTheme/community-publish.vue'
const publishDescriptor = parse(read(publishPath), { filename: publishPath }).descriptor
const publishScript = publishDescriptor.script.content
const publishContext = { ManifestIcon: {}, CommunityPostBody: {}, communityDraftMethods: {}, createPost: async () => { publishContext.plainCreates++ }, plainCreates: 0,
  setTimeout() {}, console: { error() {} }, uni: { showToast() {}, navigateBack() {} } }
runInNewContext(`${publishScript.replace(/^import .*\r?\n/gm, '').replace('export default', 'this.component =')}`, publishContext)
const plainState = { draftId: '', submitting: false, communityId: 7, content: '普通页面帖子', uploadedImages: [], selectedTag: '心得', isAdmin: false,
  async getPersistentImages() { return [] } }
await publishContext.component.methods.handlePublish.call(plainState)
assert.equal(publishContext.plainCreates, 1, 'ordinary page still publishes through createPost')

// On App, run the actual image helper's native branch with mocked plus conversion/read APIs.
const avatarPath = '../src/utils/avatar-handler.js'
const avatarSource = read(avatarPath)
const avatarAst = parseJavaScript(avatarSource, { sourceType: 'module' }).program.body
const avatarExport = avatarAst.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'compressImageToBase64')
assert.ok(avatarExport, 'avatar image compressor is present')
initPreContext('app')
const processedAvatarFunction = preJs(avatarSource.slice(avatarExport.start, avatarExport.end), avatarPath).replace('export async function', 'async function')
const nativeCalls = []
const nativeImageContext = {
  compressNativeUploadImage: async (...args) => { nativeCalls.push(['compress', ...args]); return '/tmp/compressed.webp' },
  readUploadImageData: async path => { nativeCalls.push(['read', path]); return 'data:image/webp;base64,QUJD' },
  discardUploadImage: (path, original) => nativeCalls.push(['discard', path, original]),
  uni: {}, plus: {}, console
}
runInNewContext(`${processedAvatarFunction}\nthis.compressImageToBase64 = compressImageToBase64`, nativeImageContext)
publishContext.compressImageToBase64 = nativeImageContext.compressImageToBase64
const actualImages = await publishContext.component.methods.getPersistentImages.call({ uploadedImages: ['/tmp/upload.jpg', 'https://cdn.test/a.jpg', 'data:image/png;base64,QQ=='] })
assert.deepEqual(Array.from(actualImages), ['data:image/webp;base64,QUJD', 'https://cdn.test/a.jpg', 'data:image/png;base64,QQ=='])
assert.deepEqual(nativeCalls.map(call => call[0]), ['compress', 'read', 'discard'], 'App uploads are converted and read as a data URL before cleanup')
assert.deepEqual(nativeCalls[0].slice(1), ['/tmp/upload.jpg', 76, 960, true])

// Inbox summaries and routes recognize community drafts.
const communityAction = { id: 'f6de8123-7abc-4def-8abc-0123456789ab', type: 'community_post', status: 'pending', version: 1 }
assert.equal(normalizeActionSummaries([communityAction])[0].title, '社区帖子草稿')
assert.equal(actionDetailUrl(communityAction), `/pages-nonTheme/community-publish?draftId=${communityAction.id}`)

// Compile all four affected SFCs under H5, Weixin and App preprocessors.
for (const path of [publishPath, cardPath, '../src/pages-nonTheme/components/ChatActionInbox.vue', '../src/pages-nonTheme/ai-chat.vue']) {
  const source = read(path)
  for (const platform of ['h5', 'mp-weixin', 'app']) {
    initPreContext(platform)
    const { descriptor, errors } = parse(source, { filename: path })
    assert.equal(errors.length, 0, `${path} parses`)
    const key = descriptor.scriptSetup ? 'scriptSetup' : 'script'
    const processedScript = preJs(descriptor[key].content, path)
    const processedTemplate = preHtml(descriptor.template.content, path)
    descriptor.styles.forEach(style => preCss(style.content, path))
    compileScript({ ...descriptor, [key]: { ...descriptor[key], content: processedScript } }, { id: `${platform}-${path}` })
    const compiled = compileTemplate({ source: processedTemplate, filename: path, id: `${platform}-${path}`, compilerOptions: { comments: true } })
    assert.equal(compiled.errors.length, 0, `${platform} template compiles: ${path}`)
  }
}

console.log('AI community draft methods, card entry, legacy publish flow, inbox routing, and four SFCs passed')
