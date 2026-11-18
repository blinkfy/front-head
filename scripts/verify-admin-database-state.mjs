import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import * as vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import * as helpers from '../src/pages-admin/admin-sql-sync.mjs'
import * as userCostSummary from '../src/pages-admin/user-cost-summary.mjs'

const require = createRequire(import.meta.url)
const cache = new Map()
const renderer = vue.createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setComment() {}, setElementText() {},
  parentNode: () => null, nextSibling: () => null, patchProp() {}
})
const schema = [
  { key: 'id', type: 'INTEGER', primaryKey: true },
  { key: 'username', type: 'STRING' }, { key: 'password', type: 'STRING' },
  { key: 'nickname', type: 'STRING' }, { key: 'createdAt', type: 'DATE' }
]
const users = [{ id: 1, username: '甲', nickname: '完整昵称', createdAt: '2026-11-01' }]
const fullSql = 'SELECT `id`, `username`, `password`, `nickname`, `createdAt` FROM `Users` AS `User` ORDER BY `User`.`createdAt` DESC, `User`.`id` ASC LIMIT 0, 20;'
const response = () => ({ code: 0, data: { list: users, total: 1, listSql: fullSql } })
const rawResult = sql => ({ sql, columns: ['id', 'username', 'password'], rows: [[1, '甲', 'hash']], sources: [{ model: 'User', field: 'id' }, { model: 'User', field: 'username' }, { model: 'User', field: 'password' }] })
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }

function loadComponent(filename, mocks, page = false) {
  if (!cache.has(filename)) {
    const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename })
    assert.equal(errors.length, 0)
    cache.set(filename, transformSync(compileScript(descriptor, { id: filename }).content, { format: 'cjs' }).code)
  }
  const module = { exports: {} }
  const scopedRequire = name => {
    if (name === 'vue') return page ? { ...vue, onMounted() {}, onUnmounted() {} } : vue
    if (name === '@dcloudio/uni-app') return { onShow() {}, onHide() {}, onUnload() {}, onBackPress() {} }
    if (name === './admin-sql-sync.mjs') return helpers
    if (name === './user-cost-summary.mjs') return userCostSummary
    if (name in mocks) return mocks[name]
    return name.startsWith('@/') ? {} : require(name)
  }
  new Function('require', 'module', 'exports', cache.get(filename))(scopedRequire, module, module.exports)
  return module.exports.default
}

async function createPage({ getUsersList, getMessagesList, savedColumns } = {}) {
  const requests = [], direct = [], storage = new Map()
  if (savedColumns) storage.set('admin-database-columns:User', savedColumns)
  globalThis.uni = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    showLoading() {}, hideLoading() {}, showToast() {}, onWindowResize() {}, offWindowResize() {}
  }
  const Grid = loadComponent('src/components/AdminDatabaseGrid.vue', {})
  Grid.render = () => null
  const Page = loadComponent('src/pages-admin/database.vue', {
    '@/api/database': {
      getUsersList: async params => { requests.push(params); return getUsersList ? getUsersList(params) : response() },
      getMessagesList: async params => { requests.push(params); return getMessagesList ? getMessagesList(params) : response() }
    }
  }, true)
  let grid
  let state
  Page.render = () => {
    if (!state) return null
    if (state.databaseView !== 'table' || state.sqlResult) return null
    return vue.h(Grid, {
      table: state.currentTable, rows: state.tableData, schema: state.getGenericSchema(),
      columnQuery: state.currentColumnQuery, rowKey: row => row.id, draftKey: row => String(row.id),
      onColumnsChange: state.onVisibleColumnsChange,
      ref: instance => { state.databaseGrid = instance; grid = instance?.$ }
    })
  }
  const app = renderer.createApp(Page)
  app.mount({})
  state = app._instance.setupState
  state.tables = [{ name: 'User', sqlTableName: 'Users', primaryKeys: ['id'], editable: true }]
  state.tableSchemas = { User: schema }
  state.tableData = users
  state.listSql = fullSql
  state.sqlPanel = { cancelPending() {}, executeDirect: sql => direct.push(sql) }
  app._instance.effect.run()
  await settle()
  return { state, requests, direct, grid: () => grid?.setupState, close: async () => { app.unmount(); await settle() } }
}

const tests = {
  async 'SQL without LIMIT resets pagination and keeps filters when moving to the next page'() {
    const page = await createPage({ getUsersList: params => {
      const offset = (params.page - 1) * params.pageSize
      return { code: 0, data: { list: Array.from({ length: Math.min(params.pageSize, 45 - offset) }, (_, index) => ({ id: offset + index + 1, username: '甲', nickname: '完整昵称', createdAt: '2026-11-01' })), total: 45, listSql: `SELECT \`id\`, \`username\`, \`createdAt\` FROM \`Users\` AS \`User\` LIMIT ${offset}, ${params.pageSize};` } }
    } })
    try {
      page.state.setDatabaseView('table')
      await settle()
      page.state.pageSize = 1000
      page.state.currentPage = 3
      const before = page.requests.length
      const sql = "SELECT id, username, createdAt FROM Users WHERE username LIKE '%甲%' ORDER BY createdAt DESC;"
      assert.equal(page.state.syncSqlToTable(sql), true)
      await settle()
      assert.equal(page.state.sqlResult, null)
      assert.equal(page.state.databaseView, 'table')
      assert.equal(page.state.currentPage, 1)
      assert.equal(page.state.pageSize, 20)
      assert.equal(page.state.totalPages, 3)
      assert.deepEqual(page.state.currentColumnQuery.filters.map(({ field, operator, value }) => ({ field, operator, value })), [{ field: 'username', operator: 'contains', value: '甲' }])
      assert.equal(page.state.currentColumnQuery.sortField, 'createdAt')
      assert.equal(page.state.currentColumnQuery.direction, 'DESC')
      assert.equal(page.requests.length, before + 1, 'SQL execution sends one native list request')
      assert.equal(page.requests.at(-1).page, 1)
      assert.equal(page.requests.at(-1).pageSize, 20)
      assert.deepEqual(JSON.parse(page.requests.at(-1).columnFilters).map(({ field, operator, value }) => ({ field, operator, value })), [{ field: 'username', operator: 'contains', value: '甲' }])
      assert.equal(page.requests.at(-1).columnSort, 'createdAt')
      assert.equal(page.requests.at(-1).columnDirection, 'DESC')

      page.state.handleNextPage()
      await settle()
      assert.equal(page.requests.length, before + 2)
      assert.equal(page.requests.at(-1).page, 2)
      assert.equal(page.requests.at(-1).pageSize, 20)
      assert.deepEqual(JSON.parse(page.requests.at(-1).columnFilters).map(({ field, operator, value }) => ({ field, operator, value })), [{ field: 'username', operator: 'contains', value: '甲' }])
      assert.equal(page.requests.at(-1).columnSort, 'createdAt')
      assert.equal(page.requests.at(-1).columnDirection, 'DESC')
      assert.match(page.state.listSql, /LIMIT 20, 20;/)
      assert.match(page.state.editorListSql, /LIMIT 20, 20;/)
    } finally { await page.close() }
  },
  async 'Joined message queries keep the native table for large LIMIT values'() {
    const head = 'SELECT `Message`.`id`, `Message`.`type`, `Message`.`content`, `Message`.`senderId`, `Message`.`receiverId`, `Message`.`sendTime`, `Message`.`isRead`, `Message`.`isWithdraw`, `Message`.`refId` FROM `Messages` AS `Message` LEFT OUTER JOIN `Users` AS `Sender` ON `Message`.`senderId` = `Sender`.`id` LEFT OUTER JOIN `Users` AS `Receiver` ON `Message`.`receiverId` = `Receiver`.`id`'
    const where = " WHERE ((`Message`.`senderId` = '5' OR `Message`.`senderId` = '1') AND (`Message`.`receiverId` = '5' OR `Message`.`receiverId` = '1')) ORDER BY `Message`.`sendTime` DESC, `Message`.`id` ASC"
    const message = { id: 616, type: 'text', content: '8', senderId: 5, receiverId: 1, sendTime: '2026-11-17', isRead: true, isWithdraw: false, refId: null, senderName: '分投侠官方', receiverName: 'Blinkfy' }
    const page = await createPage({ getMessagesList: params => ({ code: 0, data: { list: [message], total: 1, listSql: `${head}${where} LIMIT 0, ${params.pageSize};` } }) })
    try {
      page.state.tables.push({ name: 'Message', sqlTableName: 'Messages', primaryKeys: ['id'], editable: true })
      page.state.tableSchemas.Message = Object.keys(message).filter(key => !key.endsWith('Name')).map(key => ({ key, type: key === 'sendTime' ? 'DATE' : ['isRead', 'isWithdraw'].includes(key) ? 'BOOLEAN' : ['type', 'content'].includes(key) ? 'STRING' : 'INTEGER', primaryKey: key === 'id' }))
      page.state.currentTable = 'Message'
      page.state.tableData = [message]
      page.state.listSql = `${head}${where} LIMIT 0, 20;`
      page.state.setDatabaseView('table')
      await settle()
      for (const size of [100, 101, 200, 201, 1000, 10000]) {
        const before = page.requests.length
        assert.equal(page.state.syncSqlToTable(`${head}${where} LIMIT 0, ${size};`), true)
        await settle()
        assert.equal(page.state.sqlResult, null)
        assert.equal(page.state.databaseView, 'table')
        assert.equal(page.state.pageSize, size)
        assert.equal(page.requests.at(-1).pageSize, size)
        assert.equal(page.requests.at(-1).page, 1)
        assert.equal(page.requests.length, before + 1, 'Each SQL execution sends one native list request')
        assert.equal(page.state.tableData[0].senderName, '分投侠官方')
        assert.equal(page.state.currentColumnQuery.filters.length, 4)
        assert.equal(page.state.currentColumnQuery.sortField, 'sendTime')
      }
      const beforeLargeRequest = page.requests.length
      assert.equal(page.state.syncSqlToTable(`${head}${where} LIMIT 0, 100001;`), true)
      await settle()
      assert.equal(page.state.databaseView, 'table')
      assert.equal(page.state.pageSize, 100001)
      assert.equal(page.requests.at(-1).pageSize, 100001)
      assert.equal(page.requests.length, beforeLargeRequest + 1, 'Each large LIMIT routes through one native list request')
    } finally { await page.close() }
  },
  async 'User costs show a decimal total without adding a nonexistent SQL column'() {
    const page = await createPage()
    try {
      const costs = { userId: 1, qwenCost: '0.1', deepseekCost: '0.2', imageCost: '0.12000001', speechCost: null, identityCost: '0.2' }
      const summary = userCostSummary.withUserCostTotal(costs)
      assert.equal(summary.totalCost, '0.62000001')
      assert.equal(costs.totalCost, undefined)
      page.state.tables.push({ name: 'UserCost', sqlTableName: 'UserCosts', primaryKeys: ['userId'], editable: false })
      page.state.currentTable = 'UserCost'
      page.state.tableSchemas.UserCost = Object.keys(costs).map(key => ({ key, type: key === 'userId' ? 'INTEGER' : 'DECIMAL', primaryKey: key === 'userId' }))
      page.state.tableData = [summary]
      page.state.listSql = 'SELECT `userId`, `qwenCost` FROM `UserCosts`;'
      const total = page.state.getGenericSchema().find(field => field.key === 'totalCost')
      assert.equal(total.label, '总成本（元）')
      assert.equal(total.type, 'DECIMAL')
      page.state.onVisibleColumnsChange({ table: 'UserCost', columns: ['userId', 'qwenCost', 'totalCost'], availableColumns: ['userId', 'qwenCost', 'totalCost'] })
      assert.doesNotMatch(page.state.editorListSql, /totalCost/)
      assert.equal(page.state.canEditCurrentTable(), false)
      page.state.setDatabaseView('table')
      await settle()
      assert.equal(page.grid().columnType('totalCost'), 'DECIMAL', 'total supports numeric filters and sorting')
      assert.ok(page.grid().selectedColumns.includes('totalCost'))
      page.state.setDatabaseView('card')
      await settle()
      page.state.setDatabaseView('table')
      await settle()
      assert.ok(page.grid().selectedColumns.includes('totalCost'), 'card/table round trip preserves calculated columns')
      assert.doesNotMatch(page.state.editorListSql, /totalCost/, 'computed display column must not become a nonexistent SQL projection')
      page.grid().toggleColumn('totalCost')
      await settle()
      page.state.setDatabaseView('card')
      await settle()
      page.state.setDatabaseView('table')
      await settle()
      assert.ok(!page.grid().selectedColumns.includes('totalCost'), 'an intentional hidden column remains hidden')
    } finally { await page.close() }
  },
  async 'Card SQL keeps full records and the table projection survives a real grid mount'() {
    const page = await createPage()
    try {
      assert.equal(page.state.syncSqlToTable('SELECT id FROM Users WHERE id = 1;'), true)
      await settle()
      assert.equal(page.state.databaseView, 'card')
      assert.equal(page.state.tableData[0].nickname, '完整昵称')
      page.state.setDatabaseView('table')
      await settle()
      assert.deepEqual([...page.grid().selectedColumns], ['id'])
    } finally { await page.close() }
  },
  async 'Switching a card wildcard to the table preserves actual SQL fields'() {
    const page = await createPage()
    try {
      assert.equal(page.state.syncSqlToTable('SELECT * FROM Users;'), true)
      await settle()
      page.state.setDatabaseView('table')
      await settle()
      assert.equal(page.direct.length, 1, 'User list omits password: table must execute the actual wildcard')
      assert.match(page.direct[0], /^SELECT \*/)
      assert.equal(page.state.syncSqlToTable(page.state.editorListSql), false, 'An identical wildcard is not equivalent to a list omitting real columns')
    } finally { await page.close() }
  },
  async 'An old list response cannot overwrite a newer direct SQL result'() {
    let resolve
    const pending = new Promise(done => { resolve = done })
    const page = await createPage({ getUsersList: () => pending })
    try {
      const load = page.state.loadTableData()
      page.state.showSqlResult(rawResult('SELECT * FROM Users;'))
      resolve(response())
      await load
      await settle()
      assert.ok(page.state.sqlResult, 'Direct SQL result was erased by an older request')
    } finally { await page.close() }
  },
  async 'Starting direct SQL invalidates the list before its response reaches the editor'() {
    let resolve
    const pending = new Promise(done => { resolve = done })
    const page = await createPage({ getUsersList: () => pending })
    try {
      const load = page.state.loadTableData()
      const revision = page.state.listSqlRevision
      page.state.beginDirectSql()
      resolve(response())
      assert.equal(await load, false)
      assert.equal(page.state.listSqlRevision, revision)
      assert.equal(page.state.directSqlPending, true)
    } finally { await page.close() }
  },
  async 'Returning to the native table refreshes its SQL editor snapshot'() {
    const page = await createPage()
    try {
      page.state.showSqlResult(rawResult('SELECT * FROM Users;'))
      const revision = page.state.listSqlRevision
      page.state.returnToTable()
      assert.ok(page.state.listSqlRevision > revision)
      assert.equal(page.state.sqlResult, null)
    } finally { await page.close() }
  },
  async 'Ordinary card/table switches keep saved column choices'() {
    const page = await createPage({ savedColumns: ['username'] })
    try {
      page.state.setDatabaseView('table')
      await settle()
      assert.deepEqual([...page.grid().selectedColumns], ['username'])
    } finally { await page.close() }
  },
  async 'Returning from another table SQL restores the table owning the native rows'() {
    const page = await createPage()
    try {
      page.state.tables.push({ name: 'Device', sqlTableName: 'Devices', primaryKeys: ['id'], editable: true })
      page.state.tableSchemas.Device = [{ key: 'id', type: 'INTEGER', primaryKey: true }, { key: 'name', type: 'STRING' }]
      page.state.showSqlResult({ sql: 'SELECT * FROM Devices;', columns: ['id', 'name'], rows: [[123, '设备']], sources: [{ model: 'Device', field: 'id' }, { model: 'Device', field: 'name' }] })
      assert.equal(page.state.currentTable, 'Device')
      page.state.returnToTable()
      assert.equal(page.state.currentTable, 'User')
      assert.equal(page.state.tableData[0].username, '甲')
    } finally { await page.close() }
  }
}
let failed = 0
for (const [name, test] of Object.entries(tests)) {
  try { await test(); console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`) }
}
if (failed) process.exitCode = 1
