import assert from 'node:assert/strict'
import { test } from 'node:test'
import { remindUnboundWechat } from '../src/utils/wechat-binding-reminder.mjs'

const settings = bound => ({ code: 0, data: { bound } })

test('unbound login waits for dismissal before continuing', async () => {
  let dismiss, displayed = 0, completed = false
  const pending = remindUnboundWechat({
    getSettings: async () => settings(false), isCurrent: () => true,
    showReminder: () => { displayed++; return new Promise(resolve => { dismiss = resolve }) }
  }).then(() => { completed = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(displayed, 1)
  assert.equal(completed, false)
  dismiss()
  await pending
  assert.equal(completed, true)
})

test('bound, missing or old-server responses do not prompt', async () => {
  for (const result of [settings(true), { code: 0, data: {} }, { code: 404 }, null]) {
    await remindUnboundWechat({
      getSettings: async () => result, isCurrent: () => true,
      showReminder: () => { assert.fail('Unexpected reminder') }
    })
  }
})

test('lookup failure does not prevent login', async () => {
  await remindUnboundWechat({
    getSettings: async () => { throw new Error('offline') }, isCurrent: () => true,
    showReminder: () => { assert.fail('Unexpected reminder') }
  })
})

test('page exit or changed login ignores a late unbound response', async () => {
  let resolveSettings, current = true
  const pending = remindUnboundWechat({
    getSettings: () => new Promise(resolve => { resolveSettings = resolve }),
    isCurrent: () => current,
    showReminder: () => { assert.fail('Unexpected reminder') }
  })
  current = false
  resolveSettings(settings(false))
  await pending
})

test('timeout completes login and ignores a later response', async () => {
  let resolveSettings, expire, cleared = 0
  const pending = remindUnboundWechat({
    getSettings: () => new Promise(resolve => { resolveSettings = resolve }),
    isCurrent: () => true,
    showReminder: () => { assert.fail('Unexpected reminder') },
    schedule: callback => { expire = callback; return 42 },
    unschedule: id => { assert.equal(id, 42); cleared++ }
  })
  expire()
  await pending
  resolveSettings(settings(false))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(cleared, 1)
})

test('display failure is non-fatal and lookup timer is cleared', async () => {
  let cleared = 0
  await remindUnboundWechat({
    getSettings: async () => settings(false), isCurrent: () => true,
    showReminder: async () => { throw new Error('dialog unavailable') },
    schedule: () => 42, unschedule: () => { cleared++ }
  })
  assert.equal(cleared, 1)
})
