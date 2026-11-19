import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

const source = readFileSync(new URL('../src/pages-nonTheme/utils/app-chat-storage.js', import.meta.url), 'utf8')
const { createAppChatStorage } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

function environment(t) {
    const dir = mkdtempSync(join(tmpdir(), 'ftx-chat-storage-'))
    const file = join(dir, 'app.db')
    const entries = new Map()
    const state = { available: true, ioFailure: false, full: false, reclaimed: 0, touchedRows: 0 }
    let db
    function run(options, operation) {
        try { options.success(operation()) } catch (error) { options.fail(error) }
    }
    const api = {
        isOpenDatabase: () => Boolean(db),
        openDatabase: options => run(options, () => { db = new DatabaseSync(file) }),
        transaction: options => run(options, () => db.exec(options.operation)),
        selectSql: options => run(options, () => db.prepare(options.sql).all()),
        executeSql: options => run(options, () => {
            for (const sql of options.sql) {
                if (state.full && /INSERT OR IGNORE INTO messages|UPDATE messages/.test(sql)) {
                    throw Object.assign(new Error('database or disk is full'), { code: 13 })
                }
                if (state.ioFailure && /INSERT OR REPLACE INTO history/.test(sql)) throw new Error('I/O error')
                if (/INSERT OR IGNORE INTO messages|UPDATE messages/.test(sql)) state.touchedRows++
                db.exec(sql)
            }
        })
    }
    const close = () => { db?.close(); db = null }
    t.after(() => {
        close()
        rmSync(file, { force: true })
        rmdirSync(dir)
    })
    const storage = {
        getStorageSync: key => entries.get(key) ?? '',
        setStorageSync: (key, value) => entries.set(key, value),
        removeStorageSync: key => entries.delete(key),
        keys: () => [...entries.keys()]
    }
    const open = () => createAppChatStorage({
        platform: () => state.available ? api : null,
        storage,
        reclaimSpace: async () => { state.reclaimed++; state.full = false; return 1 }
    })
    return { open, close, entries, state, storedIds: () => db.prepare('SELECT id FROM messages ORDER BY stamp').all().map(row => row.id) }
}

function message(id, fields = {}) {
    return { id, content: "小程序 ‘原图’ \"a\" ');--\u0000", timestamp: Number(id) || 10000, ...fields }
}

test('migrates all legacy messages and list metadata, across restart and account switch', async t => {
    const { open, close, entries, state } = environment(t)
    const original = Array.from({ length: 403 }, (_, i) => message(i + 1))
    const list = { userList: [{ otherId: 19, unreadCount: 2 }], page: 2, hasMore: true }
    entries.set('chat_messages_1_group:4', JSON.stringify(original))
    entries.set('chat_messages_1_group:4_sync_cursor', 450)
    entries.set('chatlist_1', JSON.stringify(list))
    entries.set('chat_messages_2_group:4', JSON.stringify([message(88)]))
    const storage = open()
    const history = storage.openHistory('1', 'group:4')
    assert.deepEqual(await history.load(), { messages: original, lastSyncedMessageId: 450 })
    assert.deepEqual(await storage.updateConversations(storage.scope('1')), list)
    assert.deepEqual(await storage.updateConversations(storage.scope('2')), null)
    const next = [message(2, { isWithdraw: true }), ...original.slice(2), message('tmp_1', { status: 'failed' })]
    state.touchedRows = 0
    await history.save(next, 460)
    assert.equal(state.touchedRows, 2, 'only edited and new messages are written')
    await history.save(next, 461)
    assert.equal(state.touchedRows, 2, 'a cursor update does not touch message rows')
    assert.equal(JSON.parse(entries.get('chat_messages_1_group:4')).length, 50)
    close()
    const reopened = open()
    assert.deepEqual(await reopened.openHistory('1', 'group:4').load(), { messages: next, lastSyncedMessageId: 461 })
    assert.deepEqual((await reopened.openHistory('2', 'group:4').load()).messages, [message(88)])
    assert.equal(await reopened.openHistory('unknown', 'group:4').load(), null)
    assert.deepEqual(await reopened.updateConversations(reopened.scope('1')), list)
})

test('keeps fallback changes, rolls back partial transactions and replays on retry', async t => {
    const { open, entries, state, storedIds } = environment(t)
    const storage = open()
    const original = Array.from({ length: 75 }, (_, i) => message(i + 1))
    entries.set('chat_messages_4_direct', JSON.stringify(original))
    const first = storage.openHistory('4', 'direct')
    await first.load()
    const next = [message(2, { isWithdraw: true }), ...original.slice(2), message(76)]
    state.ioFailure = true
    await first.save(next, 80)
    await first.save(next.slice(0, -1).concat(message(77)), 81)
    assert.deepEqual(storedIds(), original.map(message => String(message.id)))
    assert.ok(entries.has('chat_messages_4_direct_sqlite_pending'))
    state.available = false
    const fallback = open()
    const history = fallback.openHistory('4', 'direct')
    assert.deepEqual(await history.load(), { messages: next.slice(0, -1).concat(message(77)), lastSyncedMessageId: 81 })
    await history.save([], 81, { reset: true })
    await history.save([message(82)], 82)
    await fallback.updateConversations(fallback.scope('4'), () => ({ userList: [{ otherId: 1, unreadCount: 2 }] }))
    await fallback.updateConversations(fallback.scope('4'), snapshot => {
        snapshot.userList[0].unreadCount = 0
        return snapshot
    })
    state.ioFailure = false
    state.available = true
    const recovered = open()
    assert.deepEqual(await recovered.openHistory('4', 'direct').load(), { messages: [message(82)], lastSyncedMessageId: 82 })
    assert.equal(entries.has('chat_messages_4_direct_sqlite_pending'), false)
    assert.equal((await recovered.updateConversations(recovered.scope('4'))).userList[0].unreadCount, 0)
})

test('reclaims download cache once on SQLite full and fences writes across a deferred purge', async t => {
    const { open, entries, state } = environment(t)
    const storage = open()
    const history = storage.openHistory('8', '1')
    const listScope = storage.scope('8')
    await history.load()
    state.full = true
    await history.save([message(1)], 1)
    assert.equal(state.reclaimed, 1)
    assert.deepEqual((await storage.openHistory('8', '1').load()).messages, [message(1)])
    await storage.updateConversations(listScope, () => ({ userList: [{ otherId: 1 }] }))
    state.available = false
    const stale = history.save([message(2)], 2)
    const purge = storage.clear()
    await Promise.all([purge, stale])
    assert.ok(entries.has('ftx_chat_sqlite_purge'))
    state.available = true
    await history.save([message(3)], 3)
    await storage.updateConversations(listScope, () => { assert.fail('stale scope ran') })
    assert.deepEqual((await storage.openHistory('8', '1').load()).messages, [])
    assert.equal(await storage.updateConversations(storage.scope('8')), null)
    assert.equal(entries.has('ftx_chat_sqlite_purge'), false)
})

test('stale pages cannot restore removed messages, roll back a recall or regress the cursor', async t => {
    const { open, state } = environment(t)
    const storage = open()
    const first = storage.openHistory('4', 'direct')
    const second = storage.openHistory('4', 'direct')
    await first.load()
    await first.save([message(1), message(2), message(3)], 3)
    await second.load()
    await first.save([message(2, { isWithdraw: true }), message(3), message(4)], 4)
    await second.save([message(1, { originalLoaded: true }), message(2, { originalLoaded: true }), message(3, { isRead: true })], 3)
    const expected = { messages: [message(2, { isWithdraw: true }), message(3, { isRead: true }), message(4)], lastSyncedMessageId: 4 }
    assert.deepEqual(await storage.openHistory('4', 'direct').load(), expected)
    state.available = false
    assert.deepEqual(await storage.openHistory('4', 'direct').load(), expected)
})

test('old Android bases bypass the SQLite bridge and keep legacy conversations usable', async t => {
    const { entries, state } = environment(t)
    const legacy = { userList: [{ otherId: 21 }] }
    entries.set('chatlist_4', JSON.stringify(legacy))
    const native = readFileSync(new URL('../src/pages-nonTheme/utils/app-chat-storage-native.js', import.meta.url), 'utf8')
        .replace(/^import .*\r?$/gm, '')
    const appSource = `${source}\nconst reclaimAppChatMediaSpace = () => false\n${native}`
    const previous = { uni: globalThis.uni, plus: globalThis.plus }
    t.after(() => Object.assign(globalThis, previous))
    let probes = 0
    let closed = 0
    let bridgeCalls = 0
    globalThis.uni = {
        getStorageSync: key => entries.get(key) ?? '',
        setStorageSync: (key, value) => entries.set(key, value),
        removeStorageSync: key => entries.delete(key)
    }
    globalThis.plus = {
        os: { name: 'Android' },
        android: {
            runtimeMainActivity: () => ({}),
            newObject: () => ({}),
            invoke(_object, method, path) {
                if (method === 'open') { probes++; assert.equal(path, 'data/dcloud_properties.xml') }
                if (method === 'next') return '<properties><features><feature name="Push"/></features></properties>'
                if (method === 'close') closed++
                return {}
            }
        },
        sqlite: { openDatabase() {}, isOpenDatabase() { bridgeCalls++; return false } }
    }
    const { appChatStorage } = await import('data:text/javascript;base64,' + Buffer.from(appSource).toString('base64'))
    const scope = appChatStorage.scope('4')
    assert.deepEqual(await appChatStorage.updateConversations(scope), legacy)
    const updated = { userList: [{ otherId: 21, unreadCount: 0 }] }
    await appChatStorage.updateConversations(scope, () => updated)
    assert.deepEqual(await appChatStorage.updateConversations(scope), updated)
    assert.equal(probes, 1)
    assert.equal(closed, 1)
    assert.equal(bridgeCalls, 0)
    assert.equal(state.reclaimed, 0)
})
