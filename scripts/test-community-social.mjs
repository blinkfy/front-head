import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { parse: parseSfc, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const { parse: parseJsonc, printParseErrorCode } = require('jsonc-parser')
const babel = require('@babel/parser')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadSfc(relativePath) {
  const filename = path.join(root, relativePath)
  const parsed = parseSfc(fs.readFileSync(filename, 'utf8'), { filename })
  assert.deepEqual(parsed.errors, [], `${relativePath} parses`)
  return { filename, descriptor: parsed.descriptor }
}

function astFor(source, filename = 'community-social-test.js') {
  return babel.parse(source, { sourceType: 'unambiguous', plugins: ['optionalChaining', 'objectRestSpread'] })
}

function objectProperty(objectNode, name) {
  return objectNode?.properties?.find(item => (item.type === 'ObjectProperty' || item.type === 'ObjectMethod') &&
    (item.key.name === name || item.key.value === name))
}

function getComponentMethod(relativePath, name, globals = {}) {
  const { filename, descriptor } = loadSfc(relativePath)
  const ast = astFor(descriptor.script.content, filename)
  const exported = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration
  const method = objectProperty(objectProperty(exported, 'methods')?.value, name)
  assert.ok(method, `${relativePath} method ${name} exists`)
  return vm.runInNewContext(`({${descriptor.script.content.slice(method.start, method.end)}})[${JSON.stringify(name)}]`, globals)
}

function getNamedFunction(relativePath, name, globals = {}) {
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const declaration = astFor(source, filename).program.body.find(node =>
    node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration' &&
    node.declaration.id.name === name)
  assert.ok(declaration, `${name} is an exported function`)
  return vm.runInNewContext(`(${source.slice(declaration.declaration.start, declaration.declaration.end)})`, globals)
}

function compileAffectedSfcFiles() {
  const files = [
    'src/pages-nonTheme/community.vue',
    'src/pages-nonTheme/community-post.vue',
    'src/pages-nonTheme/community-publish.vue',
    'src/pages-nonTheme/community-notifications.vue',
    'src/pages-nonTheme/chatlist.vue',
    'src/pages-nonTheme/chat.vue',
    'src/pages-admin/admin-ai-settings.vue',
    'src/pages-nonTheme/components/CommunityChatBridge.vue',
    'src/pages-nonTheme/components/CommunityActivityEntry.vue',
    'src/pages-nonTheme/components/ChatSelectionDialog.vue'
  ]
  for (const relativePath of files) {
    const { filename, descriptor } = loadSfc(relativePath)
    assert.ok(descriptor.template && (descriptor.script || descriptor.scriptSetup), `${relativePath} has template and script`)
    assert.ok(compileScript(descriptor, { id: `community-social-${path.basename(filename)}` }).content.length,
      `${relativePath} script compiles`)
    const template = compileTemplate({ source: descriptor.template.content, filename, id: `community-social-${path.basename(filename)}` })
    assert.deepEqual(template.errors, [], `${relativePath} template compiles`)
    for (const [index, style] of descriptor.styles.entries()) {
      const result = compileStyle({ source: style.content, filename, id: `community-social-${path.basename(filename)}-${index}`, preprocessLang: style.lang })
      assert.deepEqual(result.errors, [], `${relativePath} style ${index + 1} compiles`)
    }
  }
}

function testStrictCommunityPostLinks() {
  const communityPostLink = getNamedFunction('src/pages-nonTheme/utils/community-social.js', 'communityPostLink')
  assert.equal(communityPostLink('【社区帖子】\n示例\n/pages-nonTheme/community-post?postId=12&communityId=34'),
    '/pages-nonTheme/community-post?postId=12&communityId=34')
  for (const value of [
    '【社区帖子】\n示例\nhttps://attacker.invalid/',
    '【社区帖子】\n示例\n/pages-nonTheme/community-post?postId=0&communityId=34',
    '【社区帖子】\n示例\n/pages-nonTheme/community-post?postId=12&communityId=34&next=https://attacker.invalid',
    '【社区帖子】\n示例\n/pages-nonTheme/community-post?communityId=34&postId=12',
    null
  ]) assert.equal(communityPostLink(value), '', 'untrusted or malformed link is rejected')
}

async function testCommunitySettingIsIndependentOfLlm() {
  const filename = path.join(root, 'src/pages-nonTheme/utils/community-social.js')
  const source = fs.readFileSync(filename, 'utf8')
  const declaration = astFor(source, filename).program.body.find(node => node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'FunctionDeclaration' && node.declaration.id.name === 'communitySocialEnabled')
  assert.ok(declaration, 'communitySocialEnabled is exported')
  const calls = []
  const request = async options => {
    calls.push(options)
    return { code: 0, data: { aiEnabled: false, communityChatEnabled: true } }
  }
  const communitySocialEnabled = vm.runInNewContext(
    `(() => { let settingsPromise, settingsUntil = 0; return ${source.slice(declaration.declaration.start, declaration.declaration.end)} })()`,
    { request, Date }
  )
  assert.equal(await communitySocialEnabled(), true, 'LLM off does not disable community social features')
  assert.equal(await communitySocialEnabled(), true, 'settings result is cached')
  assert.equal(calls.length, 1)
  const disabled = vm.runInNewContext(
    `(() => { let settingsPromise, settingsUntil = 0; return ${source.slice(declaration.declaration.start, declaration.declaration.end)} })()`,
    { request: async () => ({ code: 0, data: { aiEnabled: true, communityChatEnabled: false } }), Date }
  )
  assert.equal(await disabled(true), false, 'community switch off disables community social features with LLM on')
}

function testSettingsFallbackAndRegistration() {
  const settings = fs.readFileSync(path.join(root, 'src/pages-nonTheme/utils/community-social.js'), 'utf8')
  assert.match(settings, /communityChatEnabled !== false/, 'missing legacy setting defaults enabled')
  const admin = fs.readFileSync(path.join(root, 'src/pages-admin/admin-ai-settings.vue'), 'utf8')
  assert.match(admin, /communityChatEnabled: true/, 'admin form default is enabled')
  assert.match(admin, /communityChatEnabled: form\.communityChatEnabled/, 'admin save sends setting')
  const pagesJson = fs.readFileSync(path.join(root, 'src/pages.json'), 'utf8')
  assert.match(pagesJson, /community-notifications/, 'notifications page is registered')
  const parseErrors = []
  const pages = parseJsonc(pagesJson, parseErrors, { allowTrailingComma: true, disallowComments: false })
  assert.deepEqual(parseErrors.map(error => printParseErrorCode(error.error)), [], 'pages.json parses as JSONC')
  assert.ok(pages.subPackages.some(group => group.root === 'pages-nonTheme' &&
    group.pages.some(page => page.path === 'community-notifications')), 'notifications route is registered')
  assert.doesNotThrow(() => astFor(fs.readFileSync(path.join(root, 'src/pages-nonTheme/utils/community-social.js'), 'utf8')),
    'social utility JavaScript parses')
}

async function testShareRetryIdempotencyAndAccountFence() {
  const sent = []
  let token = 'account-a'
  let failures = 1
  const bridge = {
    busy: false,
    post: { id: 77 },
    version: 0,
    account: token,
    attempt: null,
    allowed: async () => true,
    closeShare() { this.post = null; this.version++ },
    $emit() {},
    async loadMore() {},
    ...{}
  }
  const uni = { getStorageSync: () => token, showToast() {} }
  const share = async (postId, data) => {
    sent.push({ postId, ...data })
    if (failures-- > 0) return { code: 1, msg: 'temporary failure' }
    return { code: 0 }
  }
  const confirmShare = getComponentMethod('src/pages-nonTheme/components/CommunityChatBridge.vue', 'confirmShare', { uni, shareCommunityPost: share, console })
  await confirmShare.call(bridge, ['42'])
  const firstKey = sent[0].clientMessageId
  assert.ok(firstKey)
  assert.equal(bridge.post.id, 77, 'failed share remains retryable')
  await confirmShare.call(bridge, ['42'])
  assert.equal(sent.length, 2)
  assert.equal(sent[1].clientMessageId, firstKey, 'retry reuses idempotency key for same target')
  assert.equal(sent[1].conversationType, 'direct')

  bridge.post = { id: 88 }
  bridge.account = token
  token = 'account-b'
  await confirmShare.call(bridge, ['42'])
  assert.equal(sent.length, 2, 'account switch blocks stale share submission')
  assert.equal(bridge.post, null, 'stale selection is closed after account switch')
}

async function testStaleConversationSearchFence() {
  let resolveList
  let token = 'account-a'
  const bridge = {
    post: { id: 9 }, loading: false, page: 0, hasMore: false, items: [], keyword: '', version: 2,
    account: token
  }
  const list = () => new Promise(resolve => { resolveList = resolve })
  const getChatUserList = list
  const uni = { getStorageSync: () => token, showToast() {} }
  const loadMore = getComponentMethod('src/pages-nonTheme/components/CommunityChatBridge.vue', 'loadMore', { getChatUserList, uni, console })
  const pending = loadMore.call(bridge)
  bridge.version++
  bridge.loading = false
  token = 'account-b'
  resolveList({ code: 0, data: [{ id: 1, username: 'stale-user' }] })
  await pending
  assert.deepEqual(bridge.items, [], 'late search response from old version/account is discarded')
  assert.equal(bridge.loading, false, 'stale response does not alter the replacement search loading state')
}

async function testAuthorContactState() {
  const uni = { getStorageSync: () => 'account-a', showToast() {} }
  let response = { code: 0, data: { isContact: true, relationship: 'stranger' } }
  const load = getComponentMethod('src/pages-nonTheme/components/CommunityChatBridge.vue', 'loadAuthorContact', {
    uni, getContactSettings: async () => response
  })
  const author = { id: 42 }, bridge = { author, account: 'account-a' }
  await load.call(bridge, author)
  assert.equal(bridge.authorContactState, 'existing', 'a stranger label does not expose add-friend for an existing contact')
  response = { code: 0, data: { isContact: false } }
  await load.call(bridge, author)
  assert.equal(bridge.authorContactState, 'new')
  response = { code: 1 }
  await load.call(bridge, author)
  assert.equal(bridge.authorContactState, 'error', 'lookup errors do not expose add-friend')
  let sends = 0
  const add = getComponentMethod('src/pages-nonTheme/components/CommunityChatBridge.vue', 'addFriend', {
    uni, sendFriendRequest: async () => { sends++; return { code: 0 } }
  })
  bridge.authorContactState = 'existing'; bridge.allowed = async () => true
  await add.call(bridge)
  assert.equal(sends, 0, 'existing contact action is guarded even outside the template')
  let resolve
  const staleLoad = getComponentMethod('src/pages-nonTheme/components/CommunityChatBridge.vue', 'loadAuthorContact', {
    uni, getContactSettings: () => new Promise(done => { resolve = done })
  })
  const pending = staleLoad.call(bridge, author)
  bridge.author = { id: 43 }; bridge.authorContactState = 'new'
  resolve({ code: 0, data: { isContact: true } }); await pending
  assert.equal(bridge.authorContactState, 'new', 'a stale lookup cannot change the next author card')
}

async function main() {
  compileAffectedSfcFiles()
  testStrictCommunityPostLinks()
  testSettingsFallbackAndRegistration()
  await testCommunitySettingIsIndependentOfLlm()
  await testShareRetryIdempotencyAndAccountFence()
  await testStaleConversationSearchFence()
  await testAuthorContactState()
  console.log('community social checks passed: affected SFCs, strict links, independent settings, share retry/account fence, stale search fence')
}

await main()
