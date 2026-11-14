import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parse, compileScript } = require('@vue/compiler-sfc')
const source = fs.readFileSync(new URL('../src/pages-admin/database.vue', import.meta.url), 'utf8')
const parsed = parse(source, { filename: 'database.vue' })
assert.deepEqual(parsed.errors, [])
compileScript(parsed.descriptor, { id: 'identity-admin-check' })
const catalog = source.match(/const legacyTableCatalog = (\[[\s\S]*?\n\])/)[1]
const extract = name => {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))
  assert(match, `${name} exists`)
  return match[0]
}
const handlers = ['enterSelectionMode', 'openBulkEdit', 'handleAdd', 'handleEdit', 'handleDelete', 'handleBulkDelete', 'handleSave']
const context = vm.createContext({ currentTable: { value: '' }, getTableMeta: () => ({ editable: true }) })
vm.runInContext(`const legacyTableCatalog = ${catalog}\n${extract('canEditCurrentTable')}\n${handlers.map(extract).join('\n')}`, context)
for (const name of ['UserIdentity']) {
  context.currentTable.value = name
  assert.equal(vm.runInContext('canEditCurrentTable()', context), true, `${name} is editable`)
}
assert.equal(vm.runInContext("legacyTableCatalog.find(table => table.name === 'UserIdentity').icon", context), 'user_identity_table')
for (const oldName of ['IdentityAttempt', 'IdentityBudget']) {
  assert.equal(vm.runInContext(`legacyTableCatalog.some(table => table.name === '${oldName}')`, context), false)
}
context.currentTable.value = 'User'
assert.equal(vm.runInContext('canEditCurrentTable()', context), true)
assert.match(source, /class="data-actions" v-if="canEditCurrentTable\(\)"/)
assert.match(source, /v-if="canEditCurrentTable\(\)" class="item-action-btn edit"/)
assert.match(source, /v-if="canEditCurrentTable\(\)" class="item-action-btn delete"/)
assert.match(source, /v-if="canEditCurrentTable\(\)" class="modal-btn confirm"/)
// Identity record details retain the existing user-name display.
const detailContext = vm.createContext({ currentTable: { value: 'UserIdentity' },
  genericUserIdFields: { value: ['userId'] }, genericUserNames: { value: { 12: '测试用户' } },
  getGenericSchema: () => [{ key: 'userId', label: '用户 ID' }], getFieldImages: () => [] })
vm.runInContext(extract('getRecordDetailFields'), detailContext)
assert.equal(vm.runInContext('getRecordDetailFields({ userId: 12 })[0].value', detailContext), '测试用户 (用户ID: 12)')
console.log('Identity admin SFC parsing, editable UI and user detail references passed.')
