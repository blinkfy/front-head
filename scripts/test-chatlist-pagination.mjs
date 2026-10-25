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
const pagePath = path.join(root, 'src/pages-nonTheme/chatlist.vue')
const apiPath = path.join(root, 'src/pages-nonTheme/api/chat.js')
const quietConsole = { log() {}, warn() {}, error() {} }

function preprocess(source, flags) {
    const active = [true]
    const stack = []
    const output = []
    const enabled = (name) => Boolean(flags[name])
    for (const line of source.split(/(?<=\n)/)) {
        const match = line.match(/^\s*\/\/\s*#(ifdef|ifndef|else|endif)\s*([A-Za-z0-9_-]+)?\s*\r?\n?$/)
        if (!match) {
            if (active.at(-1)) output.push(line)
            continue
        }
        const [, directive, name] = match
        if (directive === 'ifdef' || directive === 'ifndef') {
            const condition = directive === 'ifdef' ? enabled(name) : !enabled(name)
            stack.push({ parent: active.at(-1), condition })
            active.push(active.at(-1) && condition)
        } else if (directive === 'else') {
            const frame = stack.at(-1)
            assert.ok(frame, 'orphan #else')
            frame.condition = !frame.condition
            active[active.length - 1] = frame.parent && frame.condition
        } else {
            assert.ok(stack.pop(), 'orphan #endif')
            active.pop()
        }
    }
    assert.equal(stack.length, 0, 'unclosed platform macro')
    return output.join('')
}

function compileSfc() {
    const source = fs.readFileSync(pagePath, 'utf8')
    const parsed = parseSfc(source, { filename: pagePath })
    assert.equal(parsed.errors.length, 0, `chatlist SFC parse failed: ${parsed.errors.join('; ')}`)
    const descriptor = parsed.descriptor
    const script = compileScript(descriptor, { id: 'chatlist-pagination-test' })
    const template = compileTemplate({
        source: descriptor.template.content,
        filename: pagePath,
        id: 'chatlist-pagination-test',
        compilerOptions: { bindingMetadata: script.bindings }
    })
    assert.equal(template.errors.length, 0, `template compile failed: ${template.errors.map(error => error.message).join('; ')}`)
    for (const [index, style] of descriptor.styles.entries()) {
        const result = compileStyle({
            source: style.content,
            filename: pagePath,
            id: `chatlist-pagination-test-${index}`,
            scoped: style.scoped,
            preprocessLang: style.lang
        })
        assert.equal(result.errors.length, 0, `style ${index} compile failed: ${result.errors.map(error => error.message).join('; ')}`)
    }

    return descriptor
}

class ManualTimers {
    constructor() {
        this.nextId = 1
        this.timeouts = new Map()
        this.intervals = new Map()
    }
    setTimeout = (fn, delay) => {
        const id = this.nextId++
        this.timeouts.set(id, { fn, delay })
        return id
    }
    clearTimeout = id => this.timeouts.delete(id)
    setInterval = (fn, delay) => {
        const id = this.nextId++
        this.intervals.set(id, { fn, delay })
        return id
    }
    clearInterval = id => this.intervals.delete(id)
    runTimeout(delay) {
        const entry = [...this.timeouts.entries()].find(([, item]) => item.delay === delay)
        assert.ok(entry, `expected a ${delay}ms timeout`)
        const [id, timer] = entry
        this.timeouts.delete(id)
        timer.fn()
    }
}

function makeApi() {
    const calls = []
    const responses = []
    return {
        calls,
        enqueue(value) { responses.push(value) },
        getChatUserList(params) {
            calls.push({ ...params })
            const next = responses.length ? responses.shift() : { code: 0, data: { list: [], total: 0, unreadTotal: 0, hasMore: false } }
            return typeof next === 'function' ? next(params) : Promise.resolve(next)
        },
        markAsRead: async () => ({ code: 0 })
    }
}

function response(list, { total = list.length, unreadTotal = 0, hasMore = list.length >= 20 } = {}) {
    return { code: 0, data: { list, total, unreadTotal, hasMore } }
}

function user(id, extra = {}) {
    return {
        otherId: String(id),
        username: `user-${id}`,
        nickname: `User ${id}`,
        unreadCount: 0,
        isOnline: false,
        latestContent: { id: `message-${id}`, sendTime: '2026-01-01T00:00:00Z', isRead: true },
        ...extra
    }
}

const descriptor = compileSfc()

function makePage(api, storage = new Map()) {
    const timers = new ManualTimers()
    if (!storage.has('token')) storage.set('token', 'token-A')
    if (!storage.has('userInfo')) storage.set('userInfo', { id: 'A' })
    const uni = {
        getStorageSync: key => storage.get(key),
        setStorageSync: (key, value) => storage.set(key, value),
        removeStorageSync: key => storage.delete(key),
        getSystemInfoSync: () => ({ statusBarHeight: 20, safeAreaInsets: { bottom: 0 } }),
        navigateTo() {},
        showToast(options) { uni.toast = options },
        hideKeyboard() {}
    }
    const script = preprocess(descriptor.script.content, { H5: true, 'MP-WEIXIN': false, 'APP-PLUS': false })
    const executable = script.split(/(?<=\n)/).filter(line => !/^\s*import\s/.test(line)).join('').replace(/export\s+default\s+/, 'module.exports = ')
    const liveModule = { exports: {} }
    const globals = {
        module: liveModule, chatApi: api, uni,
        userinfo: async () => ({ data: { isAdmin: true } }),
        baseUrl: 'https://example.test', getAvatarUrl: () => '',
        triggerMessageNotification: async () => {}, ManifestIcon: {}, getManifestIconPath: () => '',
        getDisplayName: (item, fallback = '') => item?.nickname || item?.username || fallback,
        console: quietConsole, document: undefined,
        window: { atob: value => Buffer.from(value, 'base64').toString('binary') },
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        setInterval: timers.setInterval, clearInterval: timers.clearInterval
    }
    vm.runInNewContext(executable, globals, { filename: pagePath })
    const liveComponent = liveModule.exports
    const liveCtx = liveComponent.data()
    Object.defineProperty(liveCtx, 'isSearching', { get: () => liveComponent.computed.isSearching.call(liveCtx) })
    for (const [key, getter] of Object.entries(liveComponent.computed)) {
        if (key === 'isSearching') continue
        Object.defineProperty(liveCtx, key, { get: () => getter.call(liveCtx) })
    }
    for (const [key, method] of Object.entries(liveComponent.methods)) liveCtx[key] = (...args) => method.apply(liveCtx, args)
    liveCtx.$options = liveComponent
    return { ctx: liveCtx, component: liveComponent, storage, timers, uni, api }
}

async function flushMicrotasks() {
    for (let i = 0; i < 8; i++) await Promise.resolve()
}

function deferred() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

// First show requests only page 1 at the configured size, and stores the cursor and server totals.
{
    const api = makeApi()
    api.enqueue(response(Array.from({ length: 20 }, (_, i) => user(i + 1)), { total: 45, unreadTotal: 7, hasMore: true }))
    const { ctx, timers, storage, component } = makePage(api)
    component.onLoad.call(ctx)
    component.onShow.call(ctx)
    await flushMicrotasks()
    assert.equal(api.calls.length, 1)
    assert.deepEqual(api.calls[0], { page: 1, pageSize: 20 })
    assert.equal(ctx.page, 1)
    assert.equal(ctx.totalUsers, 45)
    assert.equal(ctx.totalUnread, 7)
    const cached = JSON.parse(storage.get('chatlist_A'))
    assert.deepEqual({ page: cached.page, pageSize: cached.pageSize, hasMore: cached.hasMore, total: cached.total, unreadTotal: cached.unreadTotal }, {
        page: 1, pageSize: 20, hasMore: true, total: 45, unreadTotal: 7
    })
    assert.equal(timers.intervals.size, 1)
    component.onHide.call(ctx)
    assert.equal(timers.intervals.size, 0)
}

// A failed next page keeps the successful cursor; retry targets that same page.
{
    const api = makeApi()
    api.enqueue(response(Array.from({ length: 20 }, (_, i) => user(i + 1)), { total: 45, unreadTotal: 4, hasMore: true }))
    api.enqueue(() => Promise.reject(new Error('page 2 offline')))
    api.enqueue(response(Array.from({ length: 20 }, (_, i) => user(i + 21)), { total: 45, unreadTotal: 4, hasMore: true }))
    const { ctx, component } = makePage(api)
    component.onLoad.call(ctx)
    await ctx.refreshFirstPage()
    await ctx.loadMore()
    assert.equal(ctx.page, 1)
    assert.equal(ctx.hasMore, true)
    await ctx.loadMore()
    assert.equal(ctx.page, 2)
    assert.deepEqual(api.calls.map(call => call.page), [1, 2, 2])
    assert.equal(ctx.userList.length, 40)
}

// Explicit hasMore=false wins even when the first page is full; cached later pages stay sorted after append.
{
    const api = makeApi()
    api.enqueue(response(Array.from({ length: 20 }, (_, i) => user(i + 1)), { total: 20, unreadTotal: 9, hasMore: false }))
    const { ctx, component } = makePage(api)
    component.onLoad.call(ctx)
    await ctx.refreshFirstPage()
    await ctx.loadMore()
    assert.equal(api.calls.length, 1)
    assert.equal(ctx.hasMore, false)

    const cacheApi = makeApi()
    cacheApi.enqueue(response([user('pinned', { top: true, latestContent: { sendTime: '2026-01-01' } })], { total: 30, hasMore: true }))
    const storage = new Map([
        ['token', 'token-A'], ['userInfo', { id: 'A' }],
        ['chatlist_A', JSON.stringify({
            userList: [user('old', { latestContent: { sendTime: '2020-01-01' } })], timestamp: 1,
            page: 1, pageSize: 20, hasMore: true, total: 30, unreadTotal: 0
        })]
    ])
    const { ctx: cachedPage, component: cachedComponent } = makePage(cacheApi, storage)
    cachedComponent.onLoad.call(cachedPage)
    await cachedPage.loadUserList(2)
    assert.equal(cachedPage.userList[0].otherId, 'pinned')
}

// Cache restores only a validated cursor; legacy cache (without page metadata) safely restarts at page 1.
{
    const api = makeApi()
    api.enqueue(response([], { total: 1, unreadTotal: 0, hasMore: false }))
    const storage = new Map([
        ['token', 'token-A'], ['userInfo', { id: 'A' }],
        ['chatlist_A', JSON.stringify({ userList: [user('legacy-1'), user('legacy-2')], timestamp: 5 })],
        ['chatlist_B', JSON.stringify({ userList: [user('account-B')], page: 3, pageSize: 20, hasMore: false, total: 41, unreadTotal: 6 })]
    ])
    const { ctx, timers, component } = makePage(api, storage)
    component.onLoad.call(ctx)
    assert.equal(ctx.page, 1)
    assert.equal(ctx.hasMore, true)
    assert.equal(ctx.userList.length, 2)
    ctx.syncAccountContext()
    storage.set('userInfo', { id: 'B' })
    storage.set('token', 'token-B')
    component.onShow.call(ctx)
    assert.equal(ctx.cacheKey, 'chatlist_B')
    assert.equal(ctx.page, 3)
    assert.equal(ctx.hasMore, false)
    assert.equal(ctx.userList[0].otherId, 'account-B')
    assert.equal(ctx.totalUsers, 41)
    await flushMicrotasks()
    assert.equal(ctx.cacheKey, 'chatlist_B')
    assert.equal(ctx.page, 3)
    assert.equal(ctx.hasMore, false)
    assert.equal(ctx.userList[0].otherId, 'account-B')
    component.onHide.call(ctx)
    assert.equal(timers.intervals.size, 0)
}

// A page-1 refresh does not rewind a loaded cursor or reopen pagination for a fully loaded cached list.
{
    const api = makeApi()
    api.enqueue(response(Array.from({ length: 20 }, (_, i) => user(i + 1)), { total: 45, hasMore: true }))
    api.enqueue(response(Array.from({ length: 20 }, (_, i) => user(i + 21)), { total: 45, hasMore: true }))
    api.enqueue(response(Array.from({ length: 20 }, (_, i) => user(i + 1, { nickname: `Updated ${i + 1}` })), { total: 45, hasMore: true }))
    const { ctx, component } = makePage(api)
    component.onLoad.call(ctx)
    await ctx.refreshFirstPage()
    await ctx.loadMore()
    await ctx.refreshFirstPage()
    assert.equal(ctx.page, 2)
    assert.equal(ctx.userList.length, 40)
    assert.equal(ctx.hasMore, true)

    const fullApi = makeApi()
    fullApi.enqueue(response(Array.from({ length: 20 }, (_, i) => user(i + 1)), { total: 40, hasMore: true }))
    const fullStorage = new Map([
        ['token', 'token-A'], ['userInfo', { id: 'A' }],
        ['chatlist_A', JSON.stringify({ userList: Array.from({ length: 40 }, (_, i) => user(i + 1)), page: 2, pageSize: 20, hasMore: false, total: 40, unreadTotal: 3 })]
    ])
    const { ctx: fullPage, component: fullComponent } = makePage(fullApi, fullStorage)
    fullComponent.onLoad.call(fullPage)
    await fullPage.refreshFirstPage()
    assert.equal(fullPage.page, 2)
    assert.equal(fullPage.hasMore, false)
}

// Hidden-page and switched-account responses cannot mutate the list/cache after invalidation.
{
    const api = makeApi()
    const hidden = deferred()
    api.enqueue(() => hidden.promise)
    const { ctx, storage, component } = makePage(api)
    component.onLoad.call(ctx)
    const pending = ctx.refreshFirstPage()
    component.onHide.call(ctx)
    hidden.resolve(response([user('stale-hidden')], { total: 1 }))
    await pending
    assert.equal(ctx.userList.length, 0)
    assert.equal(storage.has('chatlist_A'), false)

    const accountApi = makeApi()
    const staleAccount = deferred()
    accountApi.enqueue(() => staleAccount.promise)
    const accountStorage = new Map([
        ['token', 'token-A'], ['userInfo', { id: 'A' }],
        ['chatlist_B', JSON.stringify({ userList: [user('fresh-B')], page: 1, pageSize: 20, hasMore: false, total: 1, unreadTotal: 0 })]
    ])
    const { ctx: accountPage, component: accountComponent } = makePage(accountApi, accountStorage)
    accountComponent.onLoad.call(accountPage)
    accountPage.isPageActive = true
    const accountPending = accountPage.refreshFirstPage()
    accountStorage.set('token', 'token-B')
    accountStorage.set('userInfo', { id: 'B' })
    staleAccount.resolve(response([user('stale-A')], { total: 1 }))
    await accountPending
    assert.equal(accountPage.cacheKey, 'chatlist_B')
    assert.equal(accountPage.userList[0].otherId, 'fresh-B')
    assert.equal(JSON.parse(accountStorage.get('chatlist_B')).userList[0].otherId, 'fresh-B')
}

// Search is debounced, isolated from normal cache/list/counters, paginates independently, and clear restores normal rows.
{
    const keyword = 'alice &+/张三'
    const api = makeApi()
    const normalRows = [user('normal', { isOnline: true, unreadCount: 2 })]
    api.enqueue(response(normalRows, { total: 97, unreadTotal: 14, hasMore: true }))
    api.enqueue(response([user('search-1', { username: keyword, unreadCount: 1 })], { total: 3, unreadTotal: 2, hasMore: true }))
    api.enqueue(response([user('search-2', { username: keyword, unreadCount: 1 })], { total: 3, unreadTotal: 2, hasMore: false }))
    const { ctx, timers, storage, component: searchComponent } = makePage(api)
    searchComponent.onLoad.call(ctx)
    await ctx.refreshFirstPage()
    const normalCacheBefore = storage.get('chatlist_A')
    ctx.showSearch = true
    ctx.searchKeyword = keyword
    ctx.onSearchInput()
    assert.equal(api.calls.length, 1, 'search should wait for debounce')
    timers.runTimeout(300)
    await flushMicrotasks()
    assert.equal(api.calls[1].keyword, keyword)
    assert.equal(ctx.searchPage, 1)
    assert.equal(ctx.searchHasMore, true)
    assert.equal(ctx.userList[0].otherId, 'normal')
    assert.equal(ctx.searchResults[0].otherId, 'search-1')
    assert.equal(ctx.totalUsers, 97)
    assert.equal(ctx.totalUnread, 14)
    assert.equal(ctx.onlineUsers, 1)
    await ctx.loadMore()
    assert.equal(api.calls[2].page, 2)
    assert.equal(api.calls[2].keyword, keyword)
    assert.equal(ctx.searchPage, 2)
    assert.equal(ctx.searchHasMore, false)
    assert.equal(ctx.searchResults.length, 2)
    assert.equal(storage.get('chatlist_A'), normalCacheBefore, 'search must not pollute normal cache')
    ctx.clearSearch()
    assert.equal(ctx.filteredUserList[0].otherId, 'normal')
    assert.equal(ctx.searchResults.length, 0)
}

// Search response races are ignored; read state changes update global totals once, including a search-only hit.
{
    const api = makeApi()
    const pendingOldSearch = deferred()
    api.enqueue(() => pendingOldSearch.promise)
    api.enqueue(response([user('new-search', { username: 'new', unreadCount: 1 })], { total: 1, unreadTotal: 1, hasMore: false }))
    const storage = new Map([
        ['token', 'token-A'], ['userInfo', { id: 'A' }],
        ['chatlist_A', JSON.stringify({ userList: [user('normal-read', { unreadCount: 2 })], page: 1, pageSize: 20, hasMore: false, total: 50, unreadTotal: 12 })]
    ])
    const { ctx, timers, component: raceComponent } = makePage(api, storage)
    raceComponent.onLoad.call(ctx)
    ctx.isPageActive = true
    ctx.showSearch = true
    ctx.searchKeyword = 'old'
    ctx.onSearchInput()
    timers.runTimeout(300)
    await flushMicrotasks()
    ctx.searchKeyword = 'new'
    ctx.onSearchInput()
    timers.runTimeout(300)
    await flushMicrotasks()
    pendingOldSearch.resolve(response([user('stale-search', { username: 'old' })], { total: 1 }))
    await flushMicrotasks()
    assert.equal(ctx.searchResults[0].otherId, 'new-search')

    ctx.searchResults = [user('normal-read', { unreadCount: 2 })]
    ctx.searchUnreadTotal = 3
    ctx.listUnreadTotal = 12
    ctx.markLocalChatRead('normal-read')
    assert.equal(ctx.listUnreadTotal, 10, 'normal and search matches must decrement global total once')
    assert.equal(ctx.searchUnreadTotal, 1)
    ctx.searchResults = [user('search-only', { unreadCount: 3 })]
    ctx.markLocalChatRead('search-only')
    assert.equal(ctx.listUnreadTotal, 7, 'a search-only conversation still updates the global unread summary')
    assert.equal(JSON.parse(storage.get('chatlist_A')).unreadTotal, 7)
}

// The API encodes every query value, including the search keyword.
{
    const apiSource = fs.readFileSync(apiPath, 'utf8')
    const ast = babel.parse(apiSource, { sourceType: 'module' })
    const declaration = ast.program.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'getChatUserList')?.declaration
    assert.ok(declaration, 'getChatUserList export not found')
    const functionSource = apiSource.slice(declaration.start, declaration.end)
    const module = { exports: {} }
    let requestOptions
    vm.runInNewContext(`${functionSource}; module.exports = { getChatUserList };`, {
        module,
        request: options => { requestOptions = options; return Promise.resolve(options) },
        encodeURIComponent, Object, String
    }, { filename: apiPath })
    const keyword = 'alice &+/张三'
    await module.exports.getChatUserList({ page: 1, pageSize: 20, keyword })
    const query = requestOptions.url.split('?')[1]
    assert.equal(new URLSearchParams(query).get('keyword'), keyword)
    assert.ok(requestOptions.url.includes('keyword=alice%20%26%2B%2F%E5%BC%A0%E4%B8%89'))
}

console.log('chatlist pagination checks passed (SFC, cache, request cursors, stale guards, search, summaries, query encoding)')
