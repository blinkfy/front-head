import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import * as vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const filename = fileURLToPath(new URL('../src/components/AdminReadonlySql.vue', import.meta.url))
const source = fs.readFileSync(filename, 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.equal(errors.length, 0, 'AdminReadonlySql.vue should parse')
const compiled = transformSync(compileScript(descriptor, { id: filename }).content, { format: 'cjs' }).code

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }
const renderer = vue.createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setComment() {}, setElementText() {},
  parentNode: () => null, nextSibling: () => null, patchProp() {}
})

async function mountSql() {
  const requests = [], emitted = [], pending = []
  const module = { exports: {} }
  const scopedRequire = name => name === 'vue' ? vue
    : name === '@/api/database' ? { queryReadonlySql: sql => {
      const request = deferred()
      requests.push(sql)
      pending.push(request)
      return request.promise
    } }
      : require(name)
  new Function('require', 'module', 'exports', compiled)(scopedRequire, module, module.exports)
  const Component = module.exports.default
  Component.render = () => null

  const child = vue.ref(null), listSql = vue.ref('SELECT initial'), listSqlRevision = vue.ref(0)
  const Root = {
    setup() { return () => vue.h(Component, {
      ref: child,
      listSql: listSql.value,
      listSqlRevision: listSqlRevision.value,
      onResult: result => emitted.push(result)
    }) }
  }
  const app = renderer.createApp(Root)
  app.mount({})
  await settle()
  const instance = () => child.value.$.setupState
  const isLoading = () => instance().loading
  return {
    requests, pending, emitted, instance, isLoading, listSql, listSqlRevision,
    sql: child.value,
    close: async () => { app.unmount(); await settle() }
  }
}

const tests = {
  async 'Cancel allows a new query and stale completion cannot clear its loading state'() {
    const test = await mountSql()
    try {
      test.sql.cancelPending()
      test.sql.executeDirect('SELECT old')
      assert.deepEqual(test.requests, ['SELECT old'])

      test.sql.cancelPending()
      test.sql.executeDirect('SELECT new')
      assert.deepEqual(test.requests, ['SELECT old', 'SELECT new'], 'a cancelled request must not block the next query')
      test.pending[0].resolve({ code: 0, data: { rows: [['old']] } })
      await settle()
      assert.equal(test.emitted.length, 0, 'the stale response must not emit result')
      assert.equal(test.isLoading(), true, 'the stale request finalizer must not clear the newer request loading state')

      test.pending[1].resolve({ code: 0, data: { rows: [['new']] } })
      await settle()
      assert.deepEqual(test.emitted.map(result => result.sql), ['SELECT new'])
      assert.equal(test.instance().sql, 'SELECT new', 'the latest query text must remain selected')
    } finally { await test.close() }
  },
  async 'listSql and revision changes invalidate in-flight queries and accept the latest result only'() {
    for (const change of ['listSql', 'revision']) {
      const test = await mountSql()
      try {
        test.sql.executeDirect(`SELECT stale ${change}`)
        if (change === 'listSql') test.listSql.value = 'SELECT refreshed list'
        else test.listSqlRevision.value++
        await settle()
        test.sql.executeDirect(`SELECT latest ${change}`)
        assert.deepEqual(test.requests, [`SELECT stale ${change}`, `SELECT latest ${change}`], `${change} invalidation should permit a new request`)

        test.pending[0].resolve({ code: 0, data: { rows: [['stale']] } })
        await settle()
        assert.equal(test.emitted.length, 0, 'an invalidated response must not emit result')
        assert.equal(test.isLoading(), true, 'an invalidated request must not clear the newer request loading state')

        test.pending[1].resolve({ code: 0, data: { rows: [['latest']] } })
        await settle()
        assert.deepEqual(test.emitted.map(result => result.sql), [`SELECT latest ${change}`])
        assert.equal(test.instance().sql, `SELECT latest ${change}`, 'the latest query text must not revert')
      } finally { await test.close() }
    }
  },
  async 'A single valid request still rejects duplicate execution while loading'() {
    const test = await mountSql()
    try {
      test.sql.executeDirect('SELECT once')
      test.sql.executeDirect('SELECT duplicate')
      assert.deepEqual(test.requests, ['SELECT once'])
      test.pending[0].resolve({ code: 0, data: { rows: [['once']] } })
      await settle()
      assert.deepEqual(test.emitted.map(result => result.sql), ['SELECT once'])
    } finally { await test.close() }
  }
}

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`) }
}
if (failed) process.exitCode = 1
