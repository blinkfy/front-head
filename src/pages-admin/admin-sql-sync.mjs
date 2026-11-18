// Parse only the SQL subset that the table filters can represent exactly.
// Unsupported syntax is deliberately left to the custom SQL query mode.
export function stripMirroredUpperFilters(params, query, dateField) {
  const filtered = new Set((query.filters || []).map(filter => filter.field))
  const mapping = { type: 'type', isRead: 'isRead', isWithdraw: 'isWithdraw', senderDeleted: 'isDeletedBySender', receiverDeleted: 'isDeletedByReceiver', relationship: 'relationship', mute: 'mute', top: 'top', source: 'source', review: 'review', status: 'status' }
  for (const [param, field] of Object.entries(mapping)) if (filtered.has(field)) delete params[param]
  if (filtered.has(dateField)) { delete params.startDate; delete params.endDate }
  return params
}

function tokenize(sql) {
  const tokens = []
  let i = 0
  while (i < sql.length) {
    const start = i
    const c = sql[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === "'" || c === '`') {
      const quote = c; let value = ''; let closed = false; i++
      while (i < sql.length) {
        const ch = sql[i++]
        if (ch === quote) { if (sql[i] === quote) { value += quote; i++; continue } closed = true; break }
        if (ch === '\\' && quote === "'") {
          if (i >= sql.length) return null
          const escape = sql[i++]
          const map = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a', '\\': '\\', "'": "'", '"': '"' }
          if (!Object.prototype.hasOwnProperty.call(map, escape)) return null
          value += map[escape]
        } else value += ch
      }
      if (!closed) return null
      tokens.push({ type: quote === '`' ? 'id' : 'string', value, start }); continue
    }
    const rest = sql.slice(i)
    const number = rest.match(/^-?\d+(?:\.\d+)?/)
    if (number) { tokens.push({ type: 'number', value: number[0], start }); i += number[0].length; continue }
    const word = rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/)
    if (word) { tokens.push({ type: 'word', value: word[0], start }); i += word[0].length; continue }
    const operator = rest.match(/^(>=|<=|[=><(),.*;])/)
    if (!operator) return null
    tokens.push({ type: 'symbol', value: operator[0], start }); i += operator[0].length
    if (tokens.length > 300) return null
  }
  return tokens
}

function topClause(tokens, words) {
  let depth = 0
  return tokens.findIndex(token => {
    if (token.value === '(') depth++
    if (token.value === ')') depth--
    return depth === 0 && token.type === 'word' && words.includes(token.value.toUpperCase())
  })
}

export function projectListSql(sql, columns, selectAll = false) {
  if (!selectAll && !columns?.length) return sql
  const tokens = tokenize(sql), from = tokens && topClause(tokens, ['FROM'])
  if (!(from > 0)) return sql
  if (selectAll) return `SELECT * ${sql.slice(tokens[from].start)}`
  const entries = new Map(); let start = 1, depth = 0
  for (let i = 1; i <= from; i++) {
    const token = tokens[i]
    if (token.value === '(') depth++
    if (token.value === ')') depth--
    if (i === from || (token.value === ',' && depth === 0)) {
      const part = tokens.slice(start, i)
      // Only direct columns can be represented by the table's column picker.
      if (part.length === 1 && ['word', 'id'].includes(part[0].type)) entries.set(part[0].value, sql.slice(part[0].start, token.start).trim())
      if (part.length === 3 && part[1].value === '.' && ['word', 'id'].includes(part[2].type)) entries.set(part[2].value, sql.slice(part[0].start, token.start).trim())
      start = i + 1
    }
  }
  const projection = columns.map(key => entries.get(key)).filter(Boolean)
  return projection.length ? `SELECT ${projection.join(', ')} ${sql.slice(tokens[from].start)}` : sql
}

function restoreKeyword(sql, referenceSql, referenceKeyword) {
  if (!referenceKeyword) return null
  const reference = tokenize(referenceSql), input = tokenize(sql)
  if (!reference || !input) return null
  const where = topClause(reference, ['WHERE'])
  if (where < 0) return null
  const likes = reference.map((t, i) => i > where && t.type === 'string' && t.value === `%${referenceKeyword}%` && reference[i - 1]?.value.toUpperCase() === 'LIKE' ? i : -1).filter(i => i >= 0)
  if (!likes.length) return null
  const stack = [], groups = []
  for (let i = where + 1; i < reference.length; i++) {
    if (reference[i].value === '(') stack.push(i)
    if (reference[i].value === ')' && stack.length) {
      const start = stack.pop()
      if (likes.every(index => index > start && index < i)) groups.push([start, i])
    }
  }
  groups.sort((a, b) => a[1] - a[0] - (b[1] - b[0]))
  const group = groups.find(([start, end]) => !reference.slice(start, end).some(t => t.type === 'word' && t.value.toUpperCase() === 'AND'))
  if (!group) return null
  const template = reference.slice(group[0], group[1] + 1)
  const likeSlot = template.findIndex(t => t.type === 'string' && t.value === `%${referenceKeyword}%`)
  for (let start = 0; start + template.length <= input.length; start++) {
    const candidate = input.slice(start, start + template.length), value = candidate[likeSlot]
    if (value?.type !== 'string' || !value.value.startsWith('%') || !value.value.endsWith('%')) continue
    const keyword = value.value.slice(1, -1)
    if (!keyword || keyword !== keyword.trim() || keyword.length > 500) continue
    const oldId = parseInt(referenceKeyword, 10), newId = parseInt(keyword, 10)
    const matches = template.every((token, index) => {
      const other = candidate[index]
      if (token.type === 'string' && token.value === `%${referenceKeyword}%`) return other.type === 'string' && other.value === `%${keyword}%`
      if (token.type === 'number' && Number(token.value) === oldId) return other.type === 'number' && Number(other.value) === newId
      return token.type === other.type && token.value === other.value
    })
    if (matches) return { sql: `${sql.slice(0, candidate[0].start)}(__ui_keyword = '${keyword.replace(/\\/g, '\\\\').replace(/'/g, "''")}')${sql.slice(candidate.at(-1).start + 1)}`, keyword }
  }
  return null
}

export function parseTableSql(sql, { tableName, schema, referenceSql = '', referenceKeyword = '', primaryKeys = [], nativeColumns }) {
  try {
    if (!tableName || !Array.isArray(schema) || typeof sql !== 'string' || sql.length > 10000) return null
    // Preserve the exact projection generated for the current table, but parse
    // its FROM/WHERE/ORDER/LIMIT as a normal single-table SELECT.
    const keywordMatch = restoreKeyword(sql, referenceSql, referenceKeyword)
    if (keywordMatch) sql = keywordMatch.sql
    const reference = tokenize(referenceSql), input = tokenize(sql)
    const requestedProjection = input?.slice(1, topClause(input, ['FROM'])) || []
    const selectAll = (requestedProjection.length === 1 && requestedProjection[0].value === '*') ||
      (requestedProjection.length === 3 && requestedProjection[1].value === '.' && requestedProjection[2].value === '*')
    // An ORM list can omit real columns or sanitize its result. In that case,
    // execute the wildcard as SQL instead of silently reducing it to UI fields.
    if (selectAll && nativeColumns && schema.some(field => !nativeColumns.includes(field.key))) return null
    if (selectAll && requestedProjection.length === 1 && input.some(token => token.type === 'word' && token.value.toUpperCase() === 'JOIN')) return null
    const clauseEnd = tokens => {
      let depth = 0
      return tokens.findIndex(token => {
        if (token.value === '(') depth++
        if (token.value === ')') depth--
        return depth === 0 && token.type === 'word' && ['WHERE', 'ORDER', 'LIMIT'].includes(token.value.toUpperCase())
      })
    }
    if (reference?.length && input?.length) {
      const end = clauseEnd(reference), inputEnd = clauseEnd(input)
      const prefix = reference.slice(0, end < 0 ? reference.length : end).filter(t => t.value !== ';')
      const inputPrefix = input.slice(0, inputEnd < 0 ? input.length : inputEnd).filter(t => t.value !== ';')
      const referenceFrom = topClause(prefix, ['FROM']), inputFrom = topClause(inputPrefix, ['FROM'])
      const same = (left, right) => left.length === right.length && left.every((t, index) => t.type === right[index].type && t.value === right[index].value)
      if (referenceFrom > 0 && inputFrom > 0 && same(prefix.slice(referenceFrom), inputPrefix.slice(inputFrom))) {
        let depth = 0
        const from = prefix.findIndex(t => {
          if (t.value === '(') depth++
          if (t.value === ')') depth--
          return depth === 0 && t.type === 'word' && t.value.toUpperCase() === 'FROM'
        })
        if (from > 0 && prefix[from + 1]?.value === tableName) {
          const alias = prefix[from + 2]?.value.toUpperCase() === 'AS' ? prefix[from + 3]?.value : tableName
          const projection = same(prefix.slice(0, referenceFrom), inputPrefix.slice(0, inputFrom)) ? 'SELECT *' : sql.slice(0, inputPrefix[inputFrom].start)
          if (alias) sql = `${projection} FROM \`${tableName.replace(/`/g, '``')}\` AS \`${alias.replace(/`/g, '``')}\` ${inputEnd < 0 ? '' : sql.slice(input[inputEnd].start)}`
        }
      }
    }
    const tokens = tokenize(sql)
    if (!tokens) return null
    let i = 0
    const peek = () => tokens[i]
    const take = value => { if (String(peek()?.value || '').toUpperCase() === value) { i++; return true } return false }
    const expect = value => { if (!take(value)) throw Error('unsupported') }
    const identifier = () => { const t = tokens[i++]; if (!t || !['word', 'id'].includes(t.type)) throw Error('identifier'); return t.value }
    expect('SELECT')
    const projection = []
    if (!take('*')) {
      do {
        let name = identifier(), qualifier = ''
        if (take('.')) { qualifier = name; name = take('*') ? '*' : identifier() }
        projection.push({ name, qualifier })
      } while (take(','))
    }
    expect('FROM')
    const actualTable = identifier()
    if (actualTable !== tableName) return null
    let alias = actualTable
    if (take('AS')) alias = identifier()
    else if (peek() && ['word', 'id'].includes(peek().type) && !['WHERE', 'ORDER', 'LIMIT', 'OFFSET'].includes(peek().value.toUpperCase())) alias = identifier()
    const sqlHead = sql.slice(0, peek()?.start ?? sql.length).trim()
    const fields = new Map(schema.map(field => [String(field.key).toLowerCase(), field]))
    if (projection.some(field => field.name === '*') && projection.length !== 1) return null
    const columns = projection.length && !projection.some(field => field.name === '*') ? projection.map(field => {
      if (field.qualifier && field.qualifier !== alias && field.qualifier !== actualTable) throw Error('projection')
      const attribute = fields.get(field.name.toLowerCase())
      if (!attribute || attribute.writeOnly || /(password|passwd|secret|token|salt|hash|credential|privatekey)/i.test(attribute.key)) throw Error('projection')
      return attribute.key
    }) : null
    if (projection.some(field => field.qualifier && field.qualifier !== alias && field.qualifier !== actualTable) || (columns && new Set(columns).size !== columns.length)) return null
    if (columns && nativeColumns && columns.some(key => !nativeColumns.includes(key))) return null
    const types = new Set(['STRING','CHAR','TEXT','UUID','ENUM','INTEGER','BIGINT','FLOAT','DOUBLE','DECIMAL','REAL','TINYINT','SMALLINT','BOOLEAN','DATE','DATEONLY'])
    const numeric = new Set(['INTEGER','BIGINT','FLOAT','DOUBLE','DECIMAL','REAL','TINYINT','SMALLINT'])
    const comparable = new Set([...numeric, 'DATE', 'DATEONLY'])
    const getField = () => {
      let name = identifier()
      if (take('.')) { if (name !== alias && name !== actualTable) throw Error('qualifier'); name = identifier() }
      if (keywordMatch && name === '__ui_keyword') return { key: name, type: 'STRING' }
      const field = fields.get(name.toLowerCase()); const type = String(field?.type || '').toUpperCase()
      if (!field || !types.has(type) || /(password|passwd|secret|token|salt|hash|credential|image|avatar|photo|blob|privatekey)/i.test(field.key)) throw Error('field')
      return { key: field.key, type }
    }
    const literal = type => {
      const t = tokens[i++]
      if (!t) throw Error('value')
      if (type === 'BOOLEAN') {
        if (t.type === 'number' && ['0','1'].includes(t.value)) return t.value === '1' ? 'true' : 'false'
        if (t.type === 'word' && ['TRUE','FALSE'].includes(t.value.toUpperCase())) return t.value.toLowerCase()
        throw Error('boolean')
      }
      if (numeric.has(type)) {
        if (!['number', 'string'].includes(t.type) || !/^-?\d+(?:\.\d+)?$/.test(t.value) || (['INTEGER','BIGINT','TINYINT','SMALLINT'].includes(type) && t.value.includes('.'))) throw Error('number')
      } else if (t.type !== 'string') throw Error('string')
      if (t.value.length > 500 || (['DATE','DATEONLY'].includes(type) && !Number.isFinite(Date.parse(t.value)))) throw Error('value')
      return t.value
    }
    const predicate = () => {
      if (take('INSTR')) {
        expect('('); const field = getField(); expect(',')
        if (!['STRING','CHAR','TEXT','UUID'].includes(field.type)) throw Error('contains')
        const value = literal(field.type); expect(')'); expect('>')
        const zero = tokens[i++]; if (zero?.type !== 'number' || zero.value !== '0') throw Error('contains')
        return { field: field.key, operator: 'contains', value }
      }
      const field = getField()
      if (take('IS')) { const not = take('NOT'); expect('NULL'); return { field: field.key, operator: not ? 'notNull' : 'null', value: '' } }
      if (take('IN')) {
        expect('(')
        const conditions = []
        do { conditions.push({ kind: 'condition', value: { field: field.key, operator: 'equals', value: literal(field.type) } }) } while (take(','))
        expect(')')
        return conditions.reduce((left, right) => ({ kind: 'or', left, right }))
      }
      if (take('BETWEEN')) {
        if (!comparable.has(field.type)) throw Error('between')
        const low = literal(field.type); expect('AND'); const high = literal(field.type)
        return { kind: 'and', left: { kind: 'condition', value: { field: field.key, operator: 'gte', value: low } }, right: { kind: 'condition', value: { field: field.key, operator: 'lte', value: high } } }
      }
      if (take('LIKE')) {
        if (!['STRING','CHAR','TEXT','UUID'].includes(field.type)) throw Error('like')
        const value = literal(field.type)
        if (value.length < 2 || !value.startsWith('%') || !value.endsWith('%') || /[%_\\]/.test(value.slice(1,-1))) throw Error('like')
        return { field: field.key, operator: 'contains', value: value.slice(1,-1) }
      }
      const op = tokens[i++]?.value
      const operators = { '=': 'equals', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }
      if (!operators[op] || (op !== '=' && !comparable.has(field.type))) throw Error('operator')
      return { field: field.key, operator: operators[op], value: literal(field.type) }
    }
    const factor = () => { if (take('(')) { const n = expression(); expect(')'); return n } const value = predicate(); return value.kind ? value : { kind: 'condition', value } }
    const conjunction = () => { let n = factor(); while (take('AND')) n = { kind: 'and', left: n, right: factor() }; return n }
    const expression = () => { let n = conjunction(); while (take('OR')) n = { kind: 'or', left: n, right: conjunction() }; return n }
    const flatten = (node, kind) => node.kind === kind ? [...flatten(node.left, kind), ...flatten(node.right, kind)] : [node]
    let filters = [], columnsJoin = 'and', keyword = ''
    if (take('WHERE')) {
      let root = expression()
      const top = flatten(root, 'and')
      const keywordNodes = top.filter(node => node.kind === 'condition' && node.value.field === '__ui_keyword')
      if (keywordNodes.length) {
        if (keywordNodes.length !== 1 || keywordNodes[0].value.operator !== 'equals' || keywordNodes[0].value.value !== keywordMatch?.keyword) throw Error('keyword')
        keyword = keywordMatch.keyword
        const remaining = top.filter(node => !keywordNodes.includes(node))
        root = remaining.length ? remaining.reduce((left, right) => ({ kind: 'and', left, right })) : null
      }
      const normalize = outerJoin => {
        const groups = new Map()
        for (const branch of root ? flatten(root, outerJoin) : []) {
          const join = branch.kind === 'condition' ? outerJoin : branch.kind
          const entries = flatten(branch, join)
          if (entries.some(entry => entry.kind !== 'condition') || entries.some(entry => entry.value.field !== entries[0].value.field)) return null
          const field = entries[0].value.field, existing = groups.get(field)
          if (existing && (existing.join !== outerJoin || join !== outerJoin)) return null
          const group = existing || { join, entries: [] }
          group.entries.push(...entries.map(entry => ({ ...entry.value, join })))
          groups.set(field, group)
        }
        return [...groups.values()].flatMap(group => group.entries)
      }
      const andFilters = normalize('and')
      if (andFilters) filters = andFilters
      else { filters = normalize('or'); columnsJoin = 'or' }
      if (!filters) throw Error('groups')
      if (filters.some(filter => filter.field === '__ui_keyword')) throw Error('keyword')
      if (filters.length > 20) throw Error('filters')
    }
    let sortField = '', direction = ''
    const sortTies = []
    if (take('ORDER')) {
      expect('BY'); sortField = getField().key; direction = take('DESC') ? 'DESC' : (take('ASC'), 'ASC')
      for (const key of primaryKeys.filter(key => key !== sortField)) {
        if (!take(',')) break
        if (getField().key !== key || take('DESC')) throw Error('order')
        take('ASC')
        sortTies.push(key)
      }
    }
    let page = 1, pageSize = null
    const hasLimit = take('LIMIT')
    if (hasLimit) {
      const first = tokens[i++]; if (first?.type !== 'number' || !/^\d+$/.test(first.value)) throw Error('limit')
      let offset = 0, size = Number(first.value)
      if (take(',')) { offset = size; const next = tokens[i++]; if (next?.type !== 'number' || !/^\d+$/.test(next.value)) throw Error('limit'); size = Number(next.value) }
      else if (take('OFFSET')) { const next = tokens[i++]; if (next?.type !== 'number' || !/^\d+$/.test(next.value)) throw Error('limit'); offset = Number(next.value) }
      if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(offset) || offset % size) throw Error('limit')
      page = offset / size + 1; pageSize = size
    }
    take(';')
    if (i !== tokens.length) return null
    return { filters, columnsJoin, sortField, direction, page, pageSize, columns, keyword, selectAll, alias, sqlHead, sortTies, hasLimit }
  } catch { return null }
}

// Edit a simple direct SQL query without routing it through a list endpoint.
// Reparse the output with the same bounded grammar before sending it to the API.
export function updateTableSqlQuery(sql, nextQuery, options) {
  const directOptions = { ...options, referenceSql: '', referenceKeyword: '', nativeColumns: undefined }
  const parsed = parseTableSql(sql, directOptions)
  if (!parsed || !Array.isArray(nextQuery.filters) || nextQuery.filters.length > 20) return null
  const quoteId = value => `\`${String(value).replace(/`/g, '``')}\``
  const quoteValue = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
  const fieldSql = key => `${quoteId(parsed.alias)}.${quoteId(key)}`
  const fields = new Map(options.schema.map(field => [field.key, field]))
  const groups = new Map()
  const operators = { equals: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' }
  for (const filter of nextQuery.filters) {
    const field = fields.get(filter.field), join = filter.join || 'and'
    if (!field || !['and', 'or'].includes(join)) return null
    const group = groups.get(filter.field) || { join, entries: [] }
    if (group.join !== join) return null
    const column = fieldSql(filter.field)
    let condition
    if (['null', 'notNull'].includes(filter.operator)) condition = `${column} IS ${filter.operator === 'notNull' ? 'NOT ' : ''}NULL`
    else {
      if (typeof filter.value !== 'string') return null
      let value = quoteValue(filter.value)
      if (String(field.type).toUpperCase() === 'BOOLEAN') {
        if (!['true', 'false'].includes(filter.value)) return null
        value = filter.value === 'true' ? '1' : '0'
      }
      if (filter.operator === 'contains') condition = `INSTR(${column}, ${value}) > 0`
      else if (operators[filter.operator]) condition = `${column} ${operators[filter.operator]} ${value}`
      else return null
    }
    group.entries.push(condition)
    groups.set(filter.field, group)
  }
  const columnsJoin = nextQuery.columnsJoin || 'and'
  if (!['and', 'or'].includes(columnsJoin)) return null
  const conditions = [...groups.values()].map(group => `(${group.entries.join(group.join === 'or' ? ' OR ' : ' AND ')})`)
  let output = parsed.sqlHead
  if (conditions.length) output += ` WHERE ${conditions.join(columnsJoin === 'or' ? ' OR ' : ' AND ')}`
  if (nextQuery.sortField) {
    if (!['ASC', 'DESC'].includes(nextQuery.direction)) return null
    const ties = nextQuery.sortField === parsed.sortField ? parsed.sortTies : []
    output += ` ORDER BY ${fieldSql(nextQuery.sortField)} ${nextQuery.direction}${ties.map(key => `, ${fieldSql(key)} ASC`).join('')}`
  }
  if (parsed.hasLimit) output += ` LIMIT ${(parsed.page - 1) * parsed.pageSize}, ${parsed.pageSize}`
  output += ';'
  return parseTableSql(output, directOptions) ? output : null
}
