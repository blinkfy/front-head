import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/pages-admin/database.vue', import.meta.url), 'utf8')
const start = source.indexOf('const gridDrafts = ref({})')
const end = source.indexOf('const selectionMode = ref(false)', start)
assert(start >= 0 && end > start)
let refreshed = 0, modal
const currentTable = { value: 'User' }
const calls = []
const context = vm.createContext({
  ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }), currentTable,
  getSelectionKey: item => String(item.id),
  updateDatabaseRecord: async (item, changes, table) => { calls.push({ id: item.id, changes, table }); return item.id === 2 ? { code: 1, msg: '模拟失败' } : { code: 0 } },
  loadTableData: async () => { refreshed++ },
  uni: { showLoading() {}, hideLoading() {}, showModal(value) { modal = value } },
  showAppModal() {}, page: {}
})
vm.runInContext(`${source.slice(start, end)}\nglobalThis.api = { gridDrafts, stageGridEdit, submitGridEdits }`, context)
const { gridDrafts, stageGridEdit, submitGridEdits } = context.api
stageGridEdit({ item: { id: 1, points: 5, nickname: '原名' }, key: 'points', value: 8 })
stageGridEdit({ item: { id: 1, points: 5, nickname: '原名' }, key: 'nickname', value: '新名' })
stageGridEdit({ item: { id: 2, points: 3 }, key: 'points', value: 9 })
assert.equal(Object.keys(gridDrafts.value.User).length, 2)
assert.equal(gridDrafts.value.User['1'].changes.points, 8)
assert.equal(gridDrafts.value.User['1'].changes.nickname, '新名')
assert.equal(calls.length, 0, 'staging must not write')
await submitGridEdits()
assert.equal(calls.length, 2)
assert.equal(calls[0].table, 'User')
assert.equal(gridDrafts.value.User['1'], undefined, 'successful rows are cleared')
assert.equal(gridDrafts.value.User['2'].changes.points, 9, 'failed rows stay staged')
assert.equal(refreshed, 1)
assert.match(modal.content, /成功 1 条，失败 1 条/)
stageGridEdit({ item: { id: 2, points: 3 }, key: 'points', value: 3 })
assert.equal(Object.keys(gridDrafts.value.User).length, 0, 'restoring the original removes the draft')
console.log('Grid drafts: staged edits, grouped submission and partial failures passed.')
