import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { parse: parseSfc, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc')
const babel = require('@babel/parser')
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const pagePath = path.join(root, 'src/pages-nonTheme/chat-contacts.vue')
const apiPath = path.join(root, 'src/pages-nonTheme/api/chat.js')
const quietConsole = { log() {}, warn() {}, error() {} }

function compilePage() {
    const source = fs.readFileSync(pagePath, 'utf8')
    const parsed = parseSfc(source, { filename: pagePath })
    assert.equal(parsed.errors.length, 0, `chat contacts SFC parse failed: ${parsed.errors.join('; ')}`)
    const descriptor = parsed.descriptor
    const script = compileScript(descriptor, { id: 'chat-contacts-test' })
    const template = compileTemplate({
        source: descriptor.template.content,
        filename: pagePath,
        id: 'chat-contacts-test',
        compilerOptions: { bindingMetadata: script.bindings }
    })
    assert.equal(template.errors.length, 0, `template compile failed: ${template.errors.map(error => error.message).join('; ')}`)
    for (const [index, style] of descriptor.styles.entries()) {
        const result = compileStyle({
            source: style.content,
            filename: pagePath,
            id: `chat-contacts-test-${index}`,
            scoped: style.scoped,
            preprocessLang: style.lang
        })
        assert.equal(result.errors.length, 0, `style ${index} compile failed: ${result.errors.map(error => error.message).join('; ')}`)
    }
    return descriptor
}

function makeApi() {
    const calls = []
    const queues = new Map()
    const next = name => {
        const queue = queues.get(name) || []
        const value = queue.length ? queue.shift() : Promise.resolve({ code: 0, data: { list: [], hasMore: false } })
        return typeof value === 'function' ? value() : value
    }
    return {
        calls,
        enqueue(name, value) {
            const queue = queues.get(name) || []
            queue.push(typeof value === 'function' ? value : Promise.resolve(value))
            queues.set(name, queue)
        },
        searchChatUsers(keyword, options = {}) {
            calls.push({ name: 'searchChatUsers', keyword, options: { ...options } })
            return next('searchChatUsers')
        },
        sendFriendRequest(userId, message) {
            calls.push({ name: 'sendFriendRequest', userId, message })
            return next('sendFriendRequest')
        },
        respondToFriendRequest(requestId, action) {
            calls.push({ name: 'respondToFriendRequest', requestId, action })
            return next('respondToFriendRequest')
        },
        createGroup(data) {
            calls.push({ name: 'createGroup', data: { ...data, memberIds: [...(data.memberIds || [])] } })
            return next('createGroup')
        },
        getFriends: async () => ({ code: 0, data: { list: [] } }),
        getFriendRequests: async () => ({ code: 0, data: { list: [] } }),
        getGroups: async () => ({ code: 0, data: { list: [] } })
    }
}

function makePage(api) {
    const modals = []
    const toasts = []
    const storage = new Map([['token', 'test-token'], ['userInfo', { id: 1 }]])
    const uni = {
        getStorageSync: key => storage.get(key),
        setStorageSync: (key, value) => storage.set(key, value),
        removeStorageSync: key => storage.delete(key),
        getSystemInfoSync: () => ({ statusBarHeight: 20 }),
        showModal(options) { modals.push(options) },
        showToast(options) { toasts.push(options) },
        navigateTo() {},
        navigateBack() {},
        reLaunch() {}
    }
    const parsed = parseSfc(fs.readFileSync(pagePath, 'utf8'), { filename: pagePath })
    const executable = parsed.descriptor.script.content
        .split(/(?<=\n)/)
        .filter(line => !/^\s*import\s/.test(line))
        .join('')
        .replace(/export\s+default\s+/, 'module.exports = ')
    const liveModule = { exports: {} }
    const globals = {
        module: liveModule,
        chatApi: api,
        uni,
        baseUrl: 'https://example.test',
        getAvatarUrl: () => '',
        ManifestIcon: {},
        getDisplayName: (item, fallback = '') => item?.nickname || item?.username || fallback,
        console: quietConsole,
        setTimeout,
        clearTimeout,
        Promise
    }
    vm.runInNewContext(executable, globals, { filename: pagePath })
    const component = liveModule.exports
    const ctx = component.data()
    for (const [key, getter] of Object.entries(component.computed || {})) {
        Object.defineProperty(ctx, key, { configurable: true, get: () => getter.call(ctx) })
    }
    for (const [key, method] of Object.entries(component.methods || {})) ctx[key] = (...args) => method.apply(ctx, args)
    ctx.$options = component
    return { api, component, ctx, modals, toasts, storage, uni }
}

function deferred() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

async function flushMicrotasks() {
    for (let index = 0; index < 8; index++) await Promise.resolve()
}

function response(list, extra = {}) {
    return { code: 0, data: { list, hasMore: false, ...extra } }
}

function user(id, extra = {}) {
    return { id, username: `user-${id}`, nickname: `User ${id}`, isFriend: false, requestStatus: '', ...extra }
}

function compileSearchApi() {
    const source = fs.readFileSync(apiPath, 'utf8')
    const ast = babel.parse(source, { sourceType: 'module', plugins: ['optionalChaining'] })
    const declaration = ast.program.body.find(node => (
        node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id?.name === 'searchChatUsers'
    ))?.declaration
    assert.ok(declaration, 'chat API exports searchChatUsers')
    const functionSource = source.slice(declaration.start, declaration.end)
    let requestOptions
    const context = {
        encodeURIComponent,
        request(options) { requestOptions = options; return Promise.resolve({ code: 0 }) }
    }
    vm.runInNewContext(`${functionSource}\nglobalThis.__searchChatUsers = searchChatUsers`, context, { filename: apiPath })
    return {
        async call(...args) {
            requestOptions = undefined
            await context.__searchChatUsers(...args)
            return requestOptions
        }
    }
}

const descriptor = compilePage()

// Search API remains source-compatible with the keyword-only form and forwards cursor options.
{
    const api = compileSearchApi()
    const firstPage = await api.call('中文 搜索')
    assert.match(firstPage.url, /keyword=%E4%B8%AD%E6%96%87%20%E6%90%9C%E7%B4%A2/)
    const nextPage = await api.call('中文 搜索', { cursor: 'next-20', pageSize: 20 })
    assert.match(nextPage.url, /cursor=next-20/)
    assert.match(nextPage.url, /pageSize=20/)
}

// A slow previous query cannot overwrite the latest query; cursor pagination appends, and failure preserves visible results.
{
    const api = makeApi()
    const older = deferred()
    const latest = deferred()
    api.enqueue('searchChatUsers', () => older.promise)
    api.enqueue('searchChatUsers', () => latest.promise)
    const { ctx } = makePage(api)
    ctx.searchKeyword = 'older'
    const olderSearch = ctx.searchUsers(true)
    ctx.searchKeyword = 'latest'
    const latestSearch = ctx.searchUsers(true)
    latest.resolve(response([user(2)], { hasMore: true, nextCursor: 'next-20' }))
    await latestSearch
    older.resolve(response([user(1)], { hasMore: true, nextCursor: 'old-next' }))
    await olderSearch
    assert.deepEqual(Array.from(ctx.searchResults, item => Number(item.id)), [2], 'only latest query results remain visible')

    const secondPage = deferred()
    api.enqueue('searchChatUsers', () => secondPage.promise)
    const loadingMore = ctx.loadMoreUsers()
    assert.equal(api.calls.at(-1).keyword, 'latest')
    assert.equal(api.calls.at(-1).options.cursor, 'next-20')
    secondPage.resolve(response([user(3)], { hasMore: false }))
    await loadingMore
    assert.deepEqual(Array.from(ctx.searchResults, item => Number(item.id)), [2, 3], 'next cursor results append without replacing page one')

    ctx.searchHasMore = true
    ctx.searchCursor = 'next-40'
    api.enqueue('searchChatUsers', () => Promise.reject(new Error('offline')))
    await ctx.loadMoreUsers()
    assert.deepEqual(Array.from(ctx.searchResults, item => Number(item.id)), [2, 3], 'a failed next page keeps prior results visible')
}

// Duplicate friend clicks are guarded; API statuses drive the visible state, and a reverse request opens the requests tab.
{
    const api = makeApi()
    const pending = deferred()
    api.enqueue('sendFriendRequest', () => pending.promise)
    const { ctx, modals } = makePage(api)
    const target = user(7)
    const sending = ctx.requestFriend(target)
    ctx.requestFriend(target)
    assert.equal(modals.length, 1, 'same target cannot open duplicate request dialogs')
    modals[0].success({ confirm: true, content: 'hello' })
    await flushMicrotasks()
    assert.equal(api.calls.filter(call => call.name === 'sendFriendRequest').length, 1, 'same target sends once while pending')
    pending.resolve({ code: 0, data: { status: 'incoming' } })
    await sending
    assert.equal(target.requestStatus, 'incoming')
    assert.equal(ctx.activeTab, 'requests', 'reverse request is surfaced in the requests tab')

    const alreadyFriend = user(8)
    api.enqueue('sendFriendRequest', response([], { status: 'accepted' }))
    const alreadySending = ctx.requestFriend(alreadyFriend)
    modals[1].success({ confirm: true, content: '' })
    await alreadySending
    assert.equal(alreadyFriend.isFriend, true, 'accepted response marks the user as a friend')
}

// A single in-flight friend-request response prevents accept/reject double submission.
{
    const api = makeApi()
    const answer = deferred()
    api.enqueue('respondToFriendRequest', () => answer.promise)
    const { ctx } = makePage(api)
    const request = { id: 12, status: 'pending', user: user(4) }
    const accepting = ctx.handleFriendRequest(request, 'accept')
    const rejecting = ctx.handleFriendRequest(request, 'reject')
    assert.equal(api.calls.filter(call => call.name === 'respondToFriendRequest').length, 1)
    assert.equal(request.busy, true)
    answer.resolve({ code: 0, data: { status: 'accepted' } })
    await Promise.all([accepting, rejecting])
    assert.equal(request.status, 'accepted')
    assert.equal(request.busy, false)
}

// A rapid second create click does not issue another request; empty-member groups remain allowed for compatibility.
{
    const api = makeApi()
    const created = deferred()
    api.enqueue('createGroup', () => created.promise)
    const { ctx } = makePage(api)
    ctx.groupName = 'Solo-compatible group'
    ctx.selectedFriendIds = []
    ctx.refreshAll = async () => {}
    ctx.openGroupChat = () => {}
    const first = ctx.createNewGroup()
    const second = ctx.createNewGroup()
    assert.equal(api.calls.filter(call => call.name === 'createGroup').length, 1, 'duplicate click is ignored while create is in flight')
    created.resolve({ code: 0, data: { group: { id: 9, name: 'Solo-compatible group' } } })
    await Promise.all([first, second])
    assert.deepEqual(api.calls.find(call => call.name === 'createGroup').data.memberIds, [], 'legacy single-member group creation remains supported')
}

console.log('Chat contacts SFC, search pagination and request/group-click regression checks passed.')
