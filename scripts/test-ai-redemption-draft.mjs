import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { initPreContext, preCss, preHtml, preJs } from '@dcloudio/uni-cli-shared/dist/preprocess/index.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const componentPaths = ['../src/pages-nonTheme/components/ChatBusinessCards.vue', '../src/pages-nonTheme/shop-confirm.vue']
for (const path of componentPaths) {
  const source = read(path)
  for (const platform of ['h5', 'mp-weixin', 'app']) {
    initPreContext(platform)
    const { descriptor } = parse(source, { filename: path })
    const processedScript = preJs(descriptor.scriptSetup.content, path)
    const processedTemplate = preHtml(descriptor.template.content, path)
    descriptor.styles.forEach(style => preCss(style.content, path))
    compileScript({ ...descriptor, scriptSetup: { ...descriptor.scriptSetup, content: processedScript } }, { id: `${platform}-${path}` })
    const compiled = compileTemplate({ source: processedTemplate, filename: path, id: `${platform}-${path}`, compilerOptions: { comments: true } })
    assert.equal(compiled.errors.length, 0, `${platform} template compiles: ${path}`)
  }
}

const source = parse(read('../src/pages-nonTheme/shop-confirm.vue')).descriptor.scriptSetup.content
const functions = new Set(['getDraftPayload', 'submitDraft', 'acceptDraftResult', 'refreshAfterConflict', 'isDraftExpired', 'recreateExpiredDraft'])
const declarations = parseJavaScript(source, { sourceType: 'module' }).program.body.filter(node => node.type === 'FunctionDeclaration' && functions.has(node.id.name))
const functionSource = declarations.map(node => source.slice(node.start, node.end)).join('\n')
const makeState = overrides => {
  const errors = []
  const state = {
    draftId: { value: 'draft-1' }, draft: { value: { id: 'draft-1', version: 1, status: 'pending' } }, draftExpired: { value: false }, creatingDraft: { value: false }, replacementRequestId: { value: '' },
    productId: { value: 'product-1' }, product: { value: { points: 12 } }, quantity: { value: 2 },
    form: { recipientName: 'Lin', recipientPhone: '12345678', recipientAddress: 'Road 1' }, fullAddress: { value: 'Taipei City Road 1' },
    region: { value: ['Taipei', 'Taipei', 'Xinyi'] }, submitting: { value: false }, loading: { value: false },
    loadError: { value: '' }, unavailable: { value: '' }, addressBusy: { value: false }, result: { value: null },
    resultWasRetry: { value: false }, points: { value: 100 }, errors,
    showSubmitError(message) { errors.push(message) }, shopError: error => error?.message || 'failed',
    fetchAiAction: async () => ({ data: { id: 'draft-1', type: 'redemption', status: 'pending', version: 1, expiresAt: '2999-01-01T00:00:00Z', payload: { productId: 'product-1' } } }),
    updateAiAction: async (_id, body) => ({ data: { id: 'draft-1', type: 'redemption', status: 'pending', version: 2, body } }),
    confirmAiAction: async () => ({ data: { order: { id: 'order-1', status: 'pending' }, remainingPoints: 76, replayed: false } }),
    loadDraft: async () => { state.result.value = null; state.draft.value = { status: 'pending', version: 3 } },
    createRedemptionDraft: async () => ({ data: { id: 'draft-2' } }), newActionRequestId: () => 'new-uuid',
    uni: { redirectTo: ({ url }) => { state.redirectUrl = url } },
    ...overrides
  }
  runInNewContext(`${functionSource}\nthis.run = submitDraft`, state)
  return state
}

const happy = makeState()
await happy.run()
assert.equal(happy.result.value.order.id, 'order-1')
assert.equal(happy.points.value, 76)
assert.equal(happy.draft.value.version, 2)
assert.equal(happy.draft.value.body.payload.quantity, 2)

let reads = 0
let patches = 0
let confirms = 0
const completedResult = { order: { id: 'order-1', status: 'pending' }, remainingPoints: 76, replayed: true }
const retry = makeState({
  fetchAiAction: async () => { reads++; return { data: reads === 1 ? { id: 'draft-1', type: 'redemption', status: 'pending', version: 2, expiresAt: '2999-01-01T00:00:00Z', payload: { productId: 'product-1' } } : { id: 'draft-1', type: 'redemption', status: 'completed', payload: { productId: 'product-1' }, result: completedResult } } },
  updateAiAction: async () => { patches++; return { data: { version: 3 } } },
  confirmAiAction: async () => { confirms++; throw new Error('connection lost') }
})
retry.draft.value.version = 2
await retry.run()
assert.equal(retry.result.value, null, 'a lost response does not fabricate a receipt')
assert.equal(retry.draftId.value, 'draft-1', 'draft id stays available for retry')
await retry.run()
assert.equal(retry.result.value?.order?.id, 'order-1', `retry reads the completed receipt; errors=${retry.errors.join('|')}`)
assert.equal(patches, 1, 'completed retry does not patch again')
assert.equal(confirms, 1, 'completed retry does not confirm again')

let conflictConfirms = 0
const conflict = makeState({
  updateAiAction: async () => { throw { statusCode: 409, message: 'version conflict' } },
  confirmAiAction: async () => { conflictConfirms++ }
})
await conflict.run()
assert.equal(conflictConfirms, 0, '409 requires renewed user confirmation')
assert.ok(conflict.errors.some(message => message.includes('请核对')))
assert.equal(conflict.draft.value.version, 3, 'conflict reloads the latest pending draft')

let stalePatches = 0
let staleConfirms = 0
let reloadedServerState = null
const concurrentUpdate = makeState({
  fetchAiAction: async () => ({ data: { id: 'draft-1', type: 'redemption', status: 'pending', version: 2, expiresAt: '2999-01-01T00:00:00Z', payload: { productId: 'product-1', quantity: 3, recipientName: 'Updated recipient' } } }),
  updateAiAction: async () => { stalePatches++ },
  confirmAiAction: async () => { staleConfirms++ },
  loadDraft: async ({ response }) => { reloadedServerState = response.data; concurrentUpdate.draft.value = response.data; concurrentUpdate.quantity.value = response.data.payload.quantity; concurrentUpdate.form.recipientName = response.data.payload.recipientName }
})
await concurrentUpdate.run()
assert.equal(stalePatches, 0, 'a newer server version is never patched using the stale displayed form')
assert.equal(staleConfirms, 0, 'a concurrent update requires a second user confirmation')
assert.equal(concurrentUpdate.quantity.value, 3, 'the newer draft payload is loaded for review')
assert.ok(concurrentUpdate.errors.some(message => message.includes('再次确认')))
assert.ok(reloadedServerState)

const expiredDate = makeState()
expiredDate.draftExpired.value = true
expiredDate.fetchAiAction = async () => { throw new Error('expired draft should not be submitted') }
await expiredDate.run()
assert.equal(expiredDate.result.value, null, 'an expired draft cannot be confirmed')
let createCalls = 0
const replacementIds = []
expiredDate.createRedemptionDraft = async payload => { createCalls++; replacementIds.push(payload.requestId); if (createCalls === 1) throw new Error('response lost'); expiredDate.createdPayload = payload; return { data: { id: 'draft-2' } } }
runInNewContext(`${functionSource}\nthis.run = recreateExpiredDraft`, expiredDate)
assert.equal(createCalls, 0, 'expiry does not silently create a replacement')
await expiredDate.run()
assert.equal(createCalls, 1, 'replacement is attempted only on explicit user action')
await expiredDate.run()
assert.equal(createCalls, 2, 'the user can retry the explicit replacement action')
assert.equal(replacementIds[0], replacementIds[1], 'a lost replacement response retries with the same request id')
assert.equal(expiredDate.createdPayload.requestId, 'new-uuid')
assert.equal(expiredDate.createdPayload.productId, 'product-1')
assert.equal(expiredDate.draftId.value, 'draft-2')
assert.equal(expiredDate.redirectUrl, '/pages-nonTheme/shop-confirm?draftId=draft-2')
const expiryState = {}
runInNewContext(`${source.match(/function isDraftExpired\([\s\S]*?\n\}/)[0]}\nthis.check = isDraftExpired`, expiryState)
assert.equal(expiryState.check({ expiresAt: '2000-01-01T00:00:00Z' }), true)
assert.equal(expiryState.check({ expiresAt: '2999-01-01T00:00:00Z' }), false)

let expiredPatches = 0
let expiredConfirms = 0
const expiredDuringSubmit = makeState({
  fetchAiAction: async () => ({ data: { id: 'draft-1', type: 'redemption', status: 'pending', version: 1, expiresAt: '2000-01-01T00:00:00Z', payload: { productId: 'product-1' } } }),
  updateAiAction: async () => { expiredPatches++ }, confirmAiAction: async () => { expiredConfirms++ }
})
await expiredDuringSubmit.run()
assert.equal(expiredPatches, 0, 'expiry discovered on final GET blocks PATCH')
assert.equal(expiredConfirms, 0, 'expiry discovered on final GET blocks confirmation')
assert.equal(expiredDuringSubmit.draftExpired.value, true)

assert.match(source, /if \(draftId\.value\) return submitDraft\(\)/, 'draft path never reaches ordinary shop order submission')
const pageSource = read('../src/pages-nonTheme/shop-confirm.vue')
assert.match(pageSource, /提交时状态/, 'draft receipt labels order state as a submission-time snapshot')
assert.match(pageSource, /v-if="draftId" class="shop-description">\{\{ result\.order\.productName \}\} 的兑换提交回执已保存/, 'draft receipt copy describes the immutable submission receipt')

console.log('AI redemption draft mock flow and H5 / Weixin / App SFC preprocessing passed')
