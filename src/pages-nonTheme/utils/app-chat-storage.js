const DATABASE = 'ftx_chat'
const PURGE_KEY = 'ftx_chat_sqlite_purge'
const JOURNAL_SUFFIX = '_sqlite_pending'
const RECENT_LIMIT = 50
const PAGE_SIZE = 200
const statements = [
    'CREATE TABLE IF NOT EXISTS messages (owner TEXT, conversation TEXT, id TEXT, stamp INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (owner, conversation, id))',
    'CREATE INDEX IF NOT EXISTS messages_recent ON messages (owner, conversation, stamp DESC)',
    'CREATE TABLE IF NOT EXISTS history (owner TEXT, conversation TEXT, cursor INTEGER, PRIMARY KEY (owner, conversation))',
    'CREATE TABLE IF NOT EXISTS conversations (owner TEXT PRIMARY KEY, payload TEXT NOT NULL)'
]

const quote = text => "'" + String(text).replace(/'/g, "''") + "'"
const validOwner = owner => /^[1-9]\d*$/.test(String(owner))
const validCursor = value => Number.isSafeInteger(value) && value >= 0 ? value : null
const stamp = message => Number.isSafeInteger(message.timestamp) ? message.timestamp : 0

function historyRows(messages) {
    const rows = new Map()
    for (const message of messages) {
        if (message?.id == null) continue
        const id = String(message.id)
        if (!id || id.includes('\0')) continue
        rows.set(id, JSON.stringify(message))
    }
    return rows
}

function historySnapshot(rows, cursor) {
    const messages = [...rows.values()].map(payload => JSON.parse(payload))
    messages.sort((a, b) => (a.timestamp - b.timestamp) || ((Number(a.id) || 0) - (Number(b.id) || 0)))
    return { messages, lastSyncedMessageId: cursor }
}

export function createAppChatStorage({ platform, storage, reclaimSpace }) {
    let tail = Promise.resolve()
    let openedApi
    let missingModule = false
    let epoch = 0
    const active = scope => scope?.epoch === epoch && validOwner(scope.owner)
    const scope = owner => ({ owner: String(owner), epoch })

    function enqueue(operation) {
        // The native connection has one transaction state for all callers.
        const result = tail.then(operation)
        tail = result.catch(() => {})
        return result
    }

    function invoke(api, method, options) {
        return new Promise((success, fail) => api[method]({ name: DATABASE, ...options, success, fail }))
    }

    async function transaction(api, sql) {
        await invoke(api, 'transaction', { operation: 'begin' })
        try {
            for (let offset = 0; offset < sql.length; offset += 25) {
                await invoke(api, 'executeSql', { sql: sql.slice(offset, offset + 25) })
            }
            await invoke(api, 'transaction', { operation: 'commit' })
        } catch (error) {
            await invoke(api, 'transaction', { operation: 'rollback' }).catch(() => {})
            throw error
        }
    }

    async function write(api, sql) {
        if (!sql.length) return
        try {
            await transaction(api, sql)
        } catch (error) {
            const full = Number(error?.code) === 13 || /sqlite_full|disk is full|no space left/i.test(error?.message || error?.errMsg || '')
            if (!full || !await reclaimSpace()) throw error
            await transaction(api, sql)
        }
    }

    async function database() {
        if (missingModule) return null
        try {
            const api = platform()
            if (!api?.openDatabase) return null
            const path = '_doc/ftx_chat.db'
            const isOpen = api.isOpenDatabase({ name: DATABASE, path })
            if (api !== openedApi || !isOpen) {
                if (!isOpen) await invoke(api, 'openDatabase', { path })
                await write(api, statements)
                openedApi = api
            }
            if (storage.getStorageSync(PURGE_KEY)) {
                await write(api, ['DELETE FROM messages', 'DELETE FROM history', 'DELETE FROM conversations'])
                storage.removeStorageSync(PURGE_KEY)
            }
            return api
        } catch (error) {
            if (!/sqlite module was not added when packaging/i.test(String(error?.message || error?.errMsg || error))) throw error
            missingModule = true
            return null
        }
    }

    const select = (api, sql) => invoke(api, 'selectSql', { sql })

    function readLegacy(key) {
        try {
            const value = storage.getStorageSync(key)
            return typeof value === 'string' && value ? JSON.parse(value) : null
        } catch (_) { return null }
    }

    function legacyHistory(key) {
        const messages = readLegacy(key)
        const cursor = storage.getStorageSync(`${key}_sync_cursor`)
        return historySnapshot(historyRows(Array.isArray(messages) ? messages : []), /^\d+$/.test(String(cursor)) ? validCursor(Number(cursor)) : null)
    }

    function storeLegacyHistory(key, messages, cursor, compact) {
        const save = (rows, nextCursor) => {
            storage.setStorageSync(key, JSON.stringify(rows))
            if (nextCursor == null) storage.removeStorageSync(`${key}_sync_cursor`)
            else storage.setStorageSync(`${key}_sync_cursor`, nextCursor)
        }
        const recent = messages.slice(-RECENT_LIMIT)
        try {
            if (!compact) save(messages, cursor)
            else save(recent, recent.length === messages.length ? cursor : null)
        } catch (_) {
            try { save(recent, recent.length === messages.length ? cursor : null) } catch (_) {}
        }
    }

    function applyHistory(api, owner, conversation, changes) {
        const sql = []
        const values = `${quote(owner)}, ${quote(conversation)}`
        const where = `owner = ${quote(owner)} AND conversation = ${quote(conversation)}`
        if (changes.reset) sql.push(`DELETE FROM messages WHERE ${where}`)
        for (const id of changes.removed) sql.push(`DELETE FROM messages WHERE ${where} AND id = ${quote(id)}`)
        for (const [id, payload, previous] of changes.rows) {
            const timestamp = stamp(JSON.parse(payload))
            if (previous === undefined || previous === null) {
                sql.push(`INSERT OR IGNORE INTO messages VALUES (${values}, ${quote(id)}, ${timestamp}, ${quote(payload)})`)
            } else {
                // A cached page must not overwrite another page's newer edit or removal.
                sql.push(`UPDATE messages SET stamp = ${timestamp}, payload = ${quote(payload)} WHERE ${where} AND id = ${quote(id)} AND payload = ${quote(previous)}`)
            }
        }
        const cursor = validCursor(changes.cursor) ?? 'NULL'
        sql.push(`INSERT OR REPLACE INTO history VALUES (${values}, (SELECT MAX(cursor) FROM (SELECT cursor FROM history WHERE ${where} UNION ALL SELECT ${cursor})))`)
        return write(api, sql)
    }

    function combineChanges(previous, next) {
        if (next.reset || !previous) return next
        const rows = new Map(previous.rows.map(row => [row[0], row]))
        const removed = new Set(previous.removed)
        for (const id of next.removed) { rows.delete(id); removed.add(id) }
        for (const row of next.rows) {
            const [id, payload, expected] = row
            const earlier = rows.get(id)
            rows.set(id, [id, payload, earlier ? earlier[2] : expected])
            removed.delete(id)
        }
        return { ...next, reset: previous.reset, rows: [...rows.values()], removed: [...removed] }
    }

    function openHistory(owner, conversation) {
        const handle = scope(owner)
        const key = `chat_messages_${handle.owner}_${conversation}`
        const journalKey = key + JOURNAL_SUFFIX
        const enabled = active(handle) && typeof conversation === 'string' && !!conversation && !conversation.includes('\0')
        let knownRows = new Map()
        let knownCursor = null

        async function prepare(api) {
            const where = `owner = ${quote(handle.owner)} AND conversation = ${quote(conversation)}`
            const [existing] = await select(api, `SELECT cursor FROM history WHERE ${where}`)
            const pending = readLegacy(journalKey)
            if (existing && pending) {
                await applyHistory(api, handle.owner, conversation, pending)
                storage.removeStorageSync(journalKey)
                const [applied] = await select(api, `SELECT cursor FROM history WHERE ${where}`)
                return { where, cursor: applied?.cursor == null ? null : validCursor(Number(applied.cursor)) }
            }
            if (existing) return { where, cursor: existing.cursor == null ? null : validCursor(Number(existing.cursor)) }
            const { messages, lastSyncedMessageId } = legacyHistory(key)
            const migration = { rows: [...historyRows(messages)], cursor: lastSyncedMessageId, removed: [], reset: false }
            const changes = pending ? combineChanges(migration, pending) : migration
            await applyHistory(api, handle.owner, conversation, changes)
            storage.removeStorageSync(journalKey)
            return { where, cursor: changes.cursor }
        }

        return {
            load: () => enqueue(async () => {
                if (!enabled || !active(handle)) return null
                let snapshot
                try {
                    const api = await database()
                    if (api) {
                        const { where, cursor } = await prepare(api)
                        const rows = new Map()
                        let after = ''
                        while (active(handle)) {
                            const page = await select(api, `SELECT id, payload FROM messages WHERE ${where} AND id > ${quote(after)} ORDER BY id LIMIT ${PAGE_SIZE}`)
                            for (const { id, payload } of page) rows.set(String(id), payload)
                            if (page.length < PAGE_SIZE) break
                            after = page[page.length - 1].id
                        }
                        snapshot = historySnapshot(rows, cursor)
                        if (active(handle)) storeLegacyHistory(key, snapshot.messages, cursor, true)
                    }
                } catch (error) { console.warn('读取 App 聊天数据库失败', error?.message || error) }
                if (!active(handle)) return null
                snapshot ??= legacyHistory(key)
                knownRows = historyRows(snapshot.messages)
                knownCursor = snapshot.lastSyncedMessageId
                return snapshot
            }),
            save(messages, cursor, { reset = false } = {}) {
                if (!enabled || !active(handle)) return Promise.resolve()
                const rows = historyRows(messages)
                const nextCursor = validCursor(cursor)
                const changes = {
                    reset,
                    rows: [...rows].filter(([id, payload]) => reset || knownRows.get(id) !== payload)
                        .map(([id, payload]) => [id, payload, reset ? null : knownRows.get(id) ?? null]),
                    removed: reset ? [] : [...knownRows.keys()].filter(id => !rows.has(id)),
                    cursor: nextCursor
                }
                if (!reset && !changes.rows.length && !changes.removed.length && knownCursor === nextCursor) return Promise.resolve()
                knownRows = rows
                knownCursor = nextCursor
                return enqueue(async () => {
                    if (!active(handle)) return
                    try {
                        const api = await database()
                        if (api) {
                            const { where, cursor: storedCursor } = await prepare(api)
                            await applyHistory(api, handle.owner, conversation, changes)
                            try {
                                const recent = await select(api, `SELECT id, payload FROM messages WHERE ${where} ORDER BY stamp DESC, length(id) DESC, id DESC LIMIT ${RECENT_LIMIT + 1}`)
                                const cursor = validCursor(Math.max(storedCursor ?? -1, nextCursor ?? -1))
                                const snapshot = historySnapshot(new Map(recent.map(row => [row.id, row.payload])), cursor)
                                if (active(handle)) storeLegacyHistory(key, snapshot.messages, cursor, true)
                            } catch (_) {}
                            return
                        }
                    } catch (error) { console.warn('保存 App 聊天数据库失败', error?.message || error) }
                    if (!active(handle)) return
                    try { storage.setStorageSync(journalKey, JSON.stringify(combineChanges(readLegacy(journalKey), changes))) }
                    catch (error) { console.warn('保存 App 聊天恢复记录失败', error?.message || error) }
                    storeLegacyHistory(key, historySnapshot(rows, nextCursor).messages, nextCursor, false)
                })
            }
        }
    }

    async function readConversations(api, handle) {
        const key = `chatlist_${handle.owner}`
        const pending = readLegacy(key + JOURNAL_SUFFIX)
        if (pending) {
            if (api) await storeConversations(api, handle, pending)
            return pending
        }
        if (!api) return readLegacy(key)
        const [row] = await select(api, `SELECT payload FROM conversations WHERE owner = ${quote(handle.owner)}`)
        if (row) return JSON.parse(row.payload)
        const legacy = readLegacy(key)
        if (Array.isArray(legacy?.userList)) await storeConversations(api, handle, legacy)
        return legacy
    }

    async function storeConversations(api, handle, snapshot) {
        const key = `chatlist_${handle.owner}`
        const payload = JSON.stringify(snapshot)
        if (api) {
            await write(api, [`INSERT OR REPLACE INTO conversations VALUES (${quote(handle.owner)}, ${quote(payload)})`])
            if (active(handle)) storage.removeStorageSync(key + JOURNAL_SUFFIX)
        } else {
            try { storage.setStorageSync(key + JOURNAL_SUFFIX, payload) } catch (_) {}
        }
        if (active(handle)) {
            try { storage.setStorageSync(key, payload) } catch (_) {}
        }
    }

    const updateConversations = (handle, update) => enqueue(async () => {
        if (!active(handle)) return null
        let snapshot
        let decided = false
        try {
            const api = await database()
            const previous = await readConversations(api, handle)
            if (!active(handle)) return null
            snapshot = update ? update(previous) : previous
            decided = true
            if (snapshot && update) await storeConversations(api, handle, snapshot)
            return snapshot
        } catch (error) { console.warn('访问 App 会话数据库失败', error?.message || error) }
        if (!active(handle)) return null
        if (!decided) {
            const previous = await readConversations(null, handle)
            snapshot = update ? update(previous) : previous
        }
        if (snapshot && update) await storeConversations(null, handle, snapshot)
        return snapshot
    })

    function clear() {
        // Keep the purge request when an older app build cannot open SQLite.
        storage.setStorageSync(PURGE_KEY, true)
        epoch++
        for (const key of storage.keys()) {
            if (key.startsWith('chat_messages_') || key.startsWith('chatlist_')) storage.removeStorageSync(key)
        }
        return enqueue(async () => { await database() })
    }

    return { scope, active, openHistory, updateConversations, clear }
}
