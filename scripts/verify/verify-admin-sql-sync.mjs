import assert from 'node:assert/strict'
import { parseTableSql, stripMirroredUpperFilters, projectListSql, updateTableSqlQuery } from '../../src/pages-admin/admin-sql-sync.mjs'

const schema = [
  { key: 'id', type: 'INTEGER' }, { key: 'category', type: 'STRING' },
  { key: 'confidence', type: 'FLOAT' }, { key: 'createdAt', type: 'DATE' },
  { key: 'userDeleted', type: 'BOOLEAN' }
]
const options = { tableName: 'Histories', schema, primaryKeys: ['id'] }
const parse = (sql, extra = {}) => parseTableSql(sql, { ...options, ...extra })

let query = parse("SELECT id, category FROM Histories WHERE category IN ('可回收垃圾', '其他垃圾') AND confidence BETWEEN 0.5 AND 1 ORDER BY createdAt DESC LIMIT 30 OFFSET 60")
assert.deepEqual(query.columns, ['id', 'category'])
assert.deepEqual(query.filters.map(({ field, operator, join }) => [field, operator, join]), [
  ['category', 'equals', 'or'], ['category', 'equals', 'or'],
  ['confidence', 'gte', 'and'], ['confidence', 'lte', 'and']
])
assert.equal(query.sortField, 'createdAt')
assert.equal(query.direction, 'DESC')
assert.equal(query.page, 3)
assert.equal(query.pageSize, 30)
for (const size of [100, 101, 200, 201, 1000, 10000, 100001]) {
  const limited = parse(`SELECT id FROM Histories ORDER BY id ASC LIMIT ${size} OFFSET ${size}`)
  assert.equal(limited.pageSize, size)
  assert.equal(limited.page, 2)
}
assert.equal(parse('SELECT id FROM Histories LIMIT 9007199254740992'), null, 'Unsafe SQL pageSize is rejected')
assert.equal(parse('SELECT id FROM Histories LIMIT 100001 OFFSET 100001').page, 2, 'Offset 100001 is a valid second page')
assert.equal(parse('SELECT id FROM Histories LIMIT 9007199254740992 OFFSET 9007199254740992'), null, 'Unsafe SQL offset is rejected')

const reference = 'SELECT `History`.`id`, `User`.`username` AS `User.username` FROM `Histories` AS `History` LEFT OUTER JOIN `Users` AS `User` ON `History`.`userId` = `User`.`id` ORDER BY `History`.`createdAt` DESC LIMIT 0, 20;'
const changed = reference.replace(' ORDER BY', " WHERE `History`.`category` = '厨余垃圾' AND `History`.`userDeleted` = 0 ORDER BY")
query = parse(changed, { referenceSql: reference })
assert.equal(query.filters[0].value, '厨余垃圾')
assert.equal(query.filters[1].value, 'false')
assert.equal(query.sortField, 'createdAt')
assert.equal(parse(changed.replace('`History`.`userId` =', '`History`.`id` ='), { referenceSql: reference }), null)
assert.equal(parse(changed.replace("`History`.`category` = '厨余垃圾'", "`User`.`username` = '张三'"), { referenceSql: reference }), null)

for (const sql of [
  'SELECT SUM(confidence) FROM Histories',
  'SELECT id AS otherId FROM Histories',
  'SELECT * FROM Histories WHERE (id = 1 OR confidence > 0.5) AND category = \'纸\'',
  'SELECT * FROM Histories WHERE category LIKE \'%a_b%\'',
  'SELECT * FROM Histories LIMIT 30 OFFSET 2',
  'SELECT * FROM Histories WHERE id = 1; DELETE FROM Histories',
  'SELECT Other.* FROM Histories',
  'SELECT Histories.*, id FROM Histories'
]) assert.equal(parse(sql), null, sql)

query = parse("SELECT `h`.`id`, `h`.`category` FROM `Histories` AS `h` WHERE `h`.`category` LIKE '%纸%' ORDER BY `h`.`confidence` DESC, `h`.`id` ASC")
assert.equal(query.filters[0].operator, 'contains')
assert.equal(query.filters[0].value, '纸')
assert.deepEqual(query.columns, ['id', 'category'])
query = parse("SELECT * FROM Histories WHERE category = '纸' OR confidence > 0.5 ORDER BY id DESC")
assert.equal(query.columnsJoin, 'or')
assert.deepEqual(query.filters.map(item => item.field), ['category', 'confidence'])
assert.equal(query.sortField, 'id')
query = parse("SELECT * FROM Histories WHERE (confidence >= 0.5 AND confidence <= 0.9) OR category IN ('纸', '玻璃')")
assert.equal(query.columnsJoin, 'or')
assert.deepEqual(query.filters.map(item => item.join), ['and', 'and', 'or', 'or'])
query = parse("SELECT * FROM Histories WHERE id = 1 OR id = 2 OR confidence > 0.5")
assert.equal(query.columnsJoin, 'or')
assert.equal(query.filters.filter(item => item.field === 'id').length, 2)
const params = stripMirroredUpperFilters({ source: 'online', type: 'image', startDate: '2026-01-01', endDate: '2026-02-01', keyword: 'abc' }, { columnsJoin: 'or', filters: [{ field: 'source' }, { field: 'createdAt' }] }, 'createdAt')
assert.deepEqual(params, { type: 'image', keyword: 'abc' })
assert.deepEqual(stripMirroredUpperFilters({ source: 'online', startDate: '2026-01-01' }, { filters: [{ field: 'source' }, { field: 'createdAt' }] }, 'createdAt'), {})

const searchReference = reference.replace(' ORDER BY', " WHERE (`History`.`category` LIKE '%纸%' OR `User`.`username` LIKE '%纸%') AND `History`.`confidence` >= 0.5 ORDER BY")
const searched = searchReference.replaceAll('%纸%', '%玻璃%').replace('>= 0.5', '>= 0.8')
query = parse(searched, { referenceSql: searchReference, referenceKeyword: '纸' })
assert.equal(query.keyword, '玻璃')
assert.deepEqual(query.filters.map(item => [item.field, item.value]), [['confidence', '0.8']])
assert.equal(parse(searched.replace("`User`.`username` LIKE '%玻璃%'", "`User`.`username` LIKE '%金属%'"), { referenceSql: searchReference, referenceKeyword: '纸' }), null)
assert.equal(parse(searched.replace(') AND `History`.`confidence`', ') OR `History`.`confidence`'), { referenceSql: searchReference, referenceKeyword: '纸' }), null)
const numericReference = searchReference.replaceAll('%纸%', '%12%').replace("'%12%')", "'%12%' OR `History`.`id` = 12)")
query = parse(numericReference.replaceAll('%12%', '%25%').replace('= 12)', '= 25)'), { referenceSql: numericReference, referenceKeyword: '12' })
assert.equal(query.keyword, '25')
assert.equal(parse(numericReference.replaceAll('%12%', '%25%'), { referenceSql: numericReference, referenceKeyword: '12' }), null)

const projectionReference = reference.replace('`History`.`id`,', '`History`.`id`, `History`.`category`, `History`.`createdAt`,')
const projectionSql = projectListSql(projectionReference, ['createdAt', 'category'])
assert.ok(projectionSql.startsWith('SELECT `History`.`createdAt`, `History`.`category` FROM'))
assert.equal(projectionSql.slice(projectionSql.indexOf('FROM')), projectionReference.slice(projectionReference.indexOf('FROM')))
query = parse(projectionSql, { referenceSql: projectionReference })
assert.deepEqual(query.columns, ['createdAt', 'category'])
assert.equal(projectListSql(reference, ['derivedDisplayField']), reference)
assert.equal(projectListSql(reference, null), reference)
const timed = parse("SELECT * FROM Histories WHERE createdAt >= '2026-11-01 08:30:12.123' AND createdAt <= '2026-11-02 20:15:00'")
assert.equal(timed.filters[0].value, '2026-11-01 08:30:12.123')
assert.equal(timed.filters[1].value, '2026-11-02 20:15:00')
// SELECT * must not be silently reduced to a list endpoint's visible fields.
const userReference = 'SELECT `id`, `username`, `password`, `nickname`, `avatar`, `bio`, `phone`, `email`, `location`, `points`, `createdAt`, `updatedAt` FROM `Users` AS `User` ORDER BY `User`.`createdAt` DESC, `User`.`id` ASC LIMIT 0, 20;'
const userSchema = ['id', 'username', 'password', 'nickname', 'avatar', 'bio', 'phone', 'email', 'location', 'points', 'createdAt', 'updatedAt', 'wechatOpenid', 'allowOtherWechatLogin'].map(key => ({ key, type: key === 'id' ? 'INTEGER' : key.endsWith('At') ? 'DATE' : 'STRING' }))
const userOptions = { tableName: 'Users', schema: userSchema, referenceSql: userReference, primaryKeys: ['id'], nativeColumns: ['id', 'username', 'nickname', 'avatar', 'bio', 'phone', 'email', 'location', 'points', 'createdAt', 'updatedAt'] }
const userSqlOptions = { tableName: userOptions.tableName, schema: [...userSchema, { key: 'userDeleted', type: 'BOOLEAN' }], primaryKeys: userOptions.primaryKeys }
const userSql = 'SELECT * FROM `Users`;'
const update = (nextQuery, sql = userSql) => updateTableSqlQuery(sql, nextQuery, userSqlOptions)
const roundTrip = (nextQuery, sql = userSql) => {
  const updatedSql = update(nextQuery, sql)
  assert.equal(typeof updatedSql, 'string')
  assert.match(updatedSql, /^SELECT\s+\*\s+FROM\s+(?:`Users`|Users)(?:\s|;)/i)
  assert.match(updatedSql, /;\s*$/)
  const parsed = parseTableSql(updatedSql, userSqlOptions)
  assert.ok(parsed, `Generated SQL should parse again: ${updatedSql}`)
  assert.deepEqual(parsed.filters, (nextQuery.filters || []).map(filter => ({ ...filter, join: filter.join || 'and' })))
  assert.equal(parsed.columnsJoin, nextQuery.columnsJoin || 'and')
  assert.equal(parsed.sortField, nextQuery.sortField || '')
  assert.equal(parsed.direction, nextQuery.direction || '')
  return { sql: updatedSql, parsed }
}
const { sql: filteredSorted, parsed: filteredSortedParsed } = roundTrip({
  filters: [{ field: 'username', operator: 'equals', value: "O'Reilly\\admin", join: 'and' }],
  columnsJoin: 'and', sortField: 'createdAt', direction: 'DESC'
})
assert.doesNotMatch(filteredSorted, /LIMIT/i)
assert.equal(filteredSortedParsed.filters[0].value, "O'Reilly\\admin")
const tiePreserved = roundTrip({ filters: [], columnsJoin: 'and', sortField: 'createdAt', direction: 'DESC' }, 'SELECT * FROM `Users` ORDER BY `createdAt` DESC, `id` ASC;')
assert.match(tiePreserved.sql, /ORDER\s+BY\s+(?:`Users`\.)?`createdAt`\s+DESC\s*,\s*(?:`Users`\.)?`id`\s+ASC/i)
roundTrip({
  filters: [
    { field: 'createdAt', operator: 'gte', value: '2026-11-01' },
    { field: 'userDeleted', operator: 'equals', value: 'false', join: 'and' }
  ], columnsJoin: 'and', sortField: '', direction: ''
})
const crossColumnOr = roundTrip({
  filters: [
    { field: 'username', operator: 'equals', value: 'alice', join: 'or' },
    { field: 'email', operator: 'equals', value: 'alice@example.com', join: 'or' }
  ], columnsJoin: 'or', sortField: '', direction: ''
})
const sameColumnAnd = roundTrip({
  filters: [
    { field: 'createdAt', operator: 'gte', value: '2026-01-01', join: 'and' },
    { field: 'createdAt', operator: 'lte', value: '2026-12-31', join: 'and' }
  ], columnsJoin: 'and', sortField: '', direction: ''
})
assert.equal(crossColumnOr.parsed.columnsJoin, 'or')
assert.equal(sameColumnAnd.parsed.columnsJoin, 'and')
const limitedSql = 'SELECT * FROM `Users` WHERE `username` = \'before\' ORDER BY `createdAt` DESC, `id` ASC LIMIT 0, 20;'
const cleared = update({ filters: [], columnsJoin: 'and', sortField: '', direction: '' }, limitedSql)
const clearedQuery = parseTableSql(cleared, userSqlOptions)
assert.equal(clearedQuery.filters.length, 0)
assert.equal(clearedQuery.sortField, '')
assert.equal(clearedQuery.pageSize, 20)
assert.equal(clearedQuery.page, 1)
assert.equal(update({ filters: [{ field: 'missingColumn', operator: 'equals', value: 'x' }], columnsJoin: 'and', sortField: '', direction: '' }), null)
assert.equal(update({ filters: [{ field: 'username', operator: 'like', value: '%x%' }], columnsJoin: 'and', sortField: '', direction: '' }), null)
assert.equal(update({ filters: [], columnsJoin: 'and', sortField: '', direction: '' }, 'SELECT * FROM `Users` JOIN `Histories` ON `Users`.`id` = `Histories`.`id`'), null)
const projected = update({ filters: [], columnsJoin: 'and', sortField: '', direction: '' }, 'SELECT `id`, `username` FROM `Users` LIMIT 20')
assert.match(projected, /^SELECT\s+`id`,\s*`username`\s+FROM/i)
const projectedQuery = parseTableSql(projected, userSqlOptions)
assert.equal(projectedQuery.pageSize, 20)
assert.equal(projectedQuery.page, 1)
const userWildcard = userReference.replace(/^SELECT .*? FROM/, 'SELECT* FROM')
assert.equal(parseTableSql(userWildcard, userOptions), null, 'Use actual SQL for User fields omitted by the normal list')
assert.equal(parseTableSql(userWildcard.replace('SELECT*', 'SELECT `User`.*'), userOptions), null)
assert.equal(parseTableSql(userWildcard.replace('SELECT*', 'SELECT `id`, `username`'), userOptions).selectAll, false)
assert.equal(parseTableSql('SELECT wechatOpenid FROM Users;', userOptions), null, 'Explicit columns omitted by the native list must also execute as SQL')
const nativeColumns = schema.map(field => field.key)
query = parse('SELECT* FROM Histories ORDER BY createdAt DESC, id ASC LIMIT 0, 20', { nativeColumns })
assert.equal(query.selectAll, true)
assert.equal(query.columns, null)
assert.equal(projectListSql('SELECT id, category FROM Histories ORDER BY createdAt DESC LIMIT 0, 20;', nativeColumns, query.selectAll), 'SELECT * FROM Histories ORDER BY createdAt DESC LIMIT 0, 20;')
assert.equal(parse('SELECT * FROM Histories ORDER BY createdAt DESC, id ASC LIMIT 0, 20', { nativeColumns }).selectAll, true)
assert.equal(parse(reference.replace(/^SELECT .*? FROM/, 'SELECT * FROM'), { referenceSql: reference, nativeColumns }), null, 'Joined wildcard includes extra fields and must execute as SQL')
assert.equal(parseTableSql('SELECT id, username FROM Users ORDER BY createdAt DESC, id ASC LIMIT 0, 20', userOptions).sortField, 'createdAt', 'A table alias is optional')
console.log('SQL/UI keyword, filters, projections, full datetime, ordering, pagination and unsupported-query fallback verified')
