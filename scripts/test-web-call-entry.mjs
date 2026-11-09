import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { webCallTarget, webCallPath, webCallUrl, embeddedWebCallUrl, miniCallChatPath, miniCallChatReturnMode, registerMiniCallHost, pendingWebCallPath, requestWebCallTicket, redeemWebCallTicket, stripWebCallTicket } from '../src/utils/web-call-entry.mjs'

const require = createRequire(import.meta.url)
const root = new URL('../', import.meta.url)
const target = { peerId: 42, selfId: 7, mode: 'video', name: '小明 & <朋友>' }

assert.deepEqual(webCallTarget(target), { peerId: '42', selfId: '7', mode: 'video', name: target.name })
const path = webCallPath(target)
assert.match(path, /^\/pages-nonTheme\/web-call\?/)
assert.match(path, /name=%E5%B0%8F%E6%98%8E%20%26%20%3C%E6%9C%8B%E5%8F%8B%3E/)
assert.equal(webCallPath({ ...target, peerId: '0' }), '')
assert.equal(webCallPath({ ...target, peerId: '1x' }), '')
assert.equal(webCallPath({ ...target, selfId: 0 }), '')
assert.equal(webCallPath({ ...target, peerId: 7 }), '', 'self-call targets are rejected')
assert.equal(webCallPath({ ...target, mode: 'screen' }), '')
assert.equal(webCallUrl('http://example.test', target), '', 'web calls require HTTPS')
assert.equal(webCallUrl('https://example.test', { ...target, selfId: '' }), '', 'invalid targets do not produce a web URL')
const webUrl = webCallUrl('https://example.test/app', target)
assert.equal(webUrl, `https://example.test/app/web/#${path}`)
assert.doesNotMatch(webUrl, /token/i, 'the short-lived entry URL carries no token')
const ticketValue = 'a'.repeat(64)
const ticketUrl = webCallUrl('https://example.test/app', target, ticketValue)
assert.equal(new URL(ticketUrl).search, '', 'ticket is not sent in the HTTP query')
assert.match(new URL(ticketUrl).hash, /ticket=a{64}$/, 'ticket is placed only in the route fragment')
assert.equal(stripWebCallTicket(ticketUrl), webUrl, 'entry removes its ticket from the address bar')

const host = {}
assert.equal(registerMiniCallHost(host, 7), true)
for (const mode of ['audio', 'video']) {
  const chatPath = miniCallChatPath({ ...target, mode, ticket: ticketValue })
  const chatUrl = new URL(chatPath, 'https://app.example')
  assert.equal(chatUrl.pathname, '/pages-nonTheme/chat')
  const options = Object.fromEntries(chatUrl.searchParams)
  assert.deepEqual(options, { userId: '42', title: target.name, embeddedCallMode: mode })
  assert.equal(miniCallChatReturnMode([{}, host, {}], options, 7), mode)
  assert.equal(miniCallChatReturnMode([{}, host, {}, {}], options, 7), '', 'only the chat immediately above the call returns to it')
  assert.equal(miniCallChatReturnMode([{}, host, {}], options, 8), '', 'a different signed-in account cannot attach to the call')
  assert.equal(miniCallChatReturnMode([{}, host, {}], { ...options, groupId: '5' }, 7), '')
}

const record = { at: 1_000_000, target }
assert.equal(pendingWebCallPath(record, 1_000_000), path)
assert.equal(pendingWebCallPath(record, 1_300_000), path, 'return remains valid at exactly five minutes')
assert.equal(pendingWebCallPath(record, 1_300_001), '', 'return expires after five minutes')
assert.equal(pendingWebCallPath({ ...record, at: 1_000_001 }, 1_000_000), '', 'future timestamps are rejected')
assert.equal(pendingWebCallPath({ ...record, target: { ...target, selfId: target.peerId } }, 1_000_000), '', 'invalid stored targets are rejected')

const requests = []
const successRuntime = { request: options => {
  requests.push(options)
  options.success({ statusCode: 200, data: { code: 0, ticket: ticketValue, token: 'unexpected' } })
} }
assert.equal(await requestWebCallTicket(successRuntime, 'https://example.test/', 'app-token'), ticketValue)
assert.equal(requests[0].url, 'https://example.test/api/web-call/ticket')
assert.equal(requests[0].header.Authorization, 'Bearer app-token')
assert.equal(requests[0].data.ticket, undefined)
const oldBackend = { request: options => options.success({ statusCode: 404, data: { code: 404 } }) }
const networkFailure = { request: options => options.fail(new Error('offline')) }
assert.equal(await requestWebCallTicket(oldBackend, 'https://example.test', 'token'), '', 'older backends fall back to manual login')
assert.equal(await requestWebCallTicket(networkFailure, 'https://example.test', 'token'), '', 'network errors fall back to manual login')
let redeemCalls = 0
const redeemRuntime = { request: options => {
  redeemCalls++
  assert.equal(options.url, 'https://example.test/api/web-call/login')
  assert.deepEqual(options.data, { ticket: ticketValue, selfId: '7' })
  options.success({ statusCode: 200, data: { code: 0, token: 'new-token', userInfo: { id: 7 } } })
} }
assert.deepEqual(await redeemWebCallTicket(redeemRuntime, 'https://example.test', ticketValue, '7'), { code: 0, token: 'new-token', userInfo: { id: 7 } })
await assert.rejects(redeemWebCallTicket(redeemRuntime, 'https://example.test', 'bad-ticket', '7'), /invalid ticket/)
await assert.rejects(redeemWebCallTicket({ request: options => options.success({ statusCode: 200, data: { code: 0, token: 'wrong-user-token', userInfo: { id: 8 } } }) }, 'https://example.test', ticketValue, '7'), /account mismatch/)
assert.equal(redeemCalls, 1, 'invalid ticket shape is rejected before a request')

function preprocess(source, platform, type = 'html') {
  const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
  return preprocess(source, { H5: platform === 'H5', MP: platform === 'MP-WEIXIN', MP_WEIXIN: platform === 'MP-WEIXIN' }, type)
}

const webCallSource = await readFile(new URL('src/pages-nonTheme/web-call.vue', root), 'utf8')
const webCall = parse(webCallSource, { filename: 'src/pages-nonTheme/web-call.vue' })
assert.equal(webCall.errors.length, 0)
for (const platform of ['H5', 'MP-WEIXIN']) {
  const descriptor = { ...webCall.descriptor, script: { ...webCall.descriptor.script, content: preprocess(webCall.descriptor.script.content, platform, 'js') } }
  assert.ok(compileScript(descriptor, { id: `web-call-${platform}` }).content.length > 0, `web-call script compiles for ${platform}`)
  const result = compileTemplate({ source: preprocess(webCall.descriptor.template.content, platform), filename: 'web-call.vue', id: platform })
  assert.deepEqual(result.errors, [], `web-call template compiles for ${platform}`)
}

const chatSource = await readFile(new URL('src/pages-nonTheme/chat.vue', root), 'utf8')
const chat = parse(chatSource, { filename: 'src/pages-nonTheme/chat.vue' })
assert.equal(chat.errors.length, 0)
const chatDescriptor = { ...chat.descriptor, script: { ...chat.descriptor.script, content: preprocess(chat.descriptor.script.content, 'MP-WEIXIN', 'js') } }
assert.ok(compileScript(chatDescriptor, { id: 'mp-weixin-chat-web-call' }).content.length > 0, 'MP-WEIXIN chat script compiles')
const mpChatTemplate = preprocess(chat.descriptor.template.content, 'MP-WEIXIN')
assert.match(mpChatTemplate, /@click="chooseCallMode"/)
const chatResult = compileTemplate({ source: mpChatTemplate, filename: 'chat.vue', id: 'mp-weixin-chat-web-call' })
assert.deepEqual(chatResult.errors, [], 'MP-WEIXIN chat template compiles with web call entries')

const acorn = require('acorn')
const chatAst = acorn.parse(chat.descriptor.script.content, { ecmaVersion: 'latest', sourceType: 'module' })
const chatOptions = chatAst.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration
const methodsProperty = chatOptions?.properties.find(property => property.key?.name === 'methods')
const methodProperty = methodsProperty?.value.properties.find(property => property.key?.name === 'openWebCall')
assert.ok(methodProperty, 'chat exposes the web-call entry method')
const methodSource = chat.descriptor.script.content.slice(methodProperty.start, methodProperty.end)
async function runChatOpenWebCall({ active = true, ticket = 'd'.repeat(64), token = 'mini-token', request = null } = {}) {
  const calls = { navigations: [], toast: [], loading: [], hidden: 0 }
  const storage = new Map([['token', token]])
  const uni = {
    getStorageSync: key => storage.get(key),
    showToast: value => calls.toast.push(value),
    showLoading: value => calls.loading.push(value),
    hideLoading: () => calls.hidden++,
    navigateTo: value => calls.navigations.push(value)
  }
  const context = { embeddedWebCallUrl, appendRecordingBridge: url => url, requestWebCallTicket: request || (async () => ticket), baseUrl: 'https://example.test', uni }
  vm.createContext(context)
  const method = vm.runInContext(`({${methodSource}}).openWebCall`, context)
  const page = {
    otherUserId: 42, contactSettings: { note: 'Peer' }, otherUsername: '', chatTitle: '', showMorePanel: true,
    webCallOpening: false, isChatPageActive: active, isChatPageDestroyed: false,
    getCurrentUserId: () => 7, ...calls
  }
  return { promise: method.call(page, 'audio'), page, calls, storage }
}

{
  const state = await runChatOpenWebCall()
  await state.promise
  assert.equal(state.calls.navigations.length, 1, 'active chat opens the ticketed web-call URL')
  const wrapperUrl = new URL(state.calls.navigations[0].url, 'https://app.example')
  const targetUrl = decodeURIComponent(wrapperUrl.searchParams.get('url'))
  assert.equal(new URL(targetUrl).pathname, '/web/call/index.html')
  assert.equal(new URL(targetUrl).search, '')
  assert.match(new URL(targetUrl).hash, /ticket=d{64}$/)
  assert.equal(state.page.showMorePanel, false)
  assert.equal(state.calls.hidden, 1)
}

{
  const state = await runChatOpenWebCall({ ticket: '' })
  await state.promise
  assert.equal(state.calls.navigations.length, 0)
  assert.equal(state.calls.toast.length, 1)
  assert.match(state.calls.toast[0].title, /请使用分投侠 App/)
  assert.equal(state.calls.hidden, 1)
}

{
  let resolveTicket
  const pendingTicket = new Promise(resolve => { resolveTicket = resolve })
  const state = await runChatOpenWebCall({ request: () => pendingTicket })
  state.page.isChatPageActive = false
  resolveTicket('e'.repeat(64))
  await state.promise
  assert.equal(state.calls.navigations.length, 0, 'chat leaving during ticket request does not navigate')
  assert.equal(state.calls.hidden, 1, 'loading always closes when the request settles')
}

console.log('PASS web call targets, HTTPS URL, five-minute return, and H5/MP-WEIXIN template preprocessing')
