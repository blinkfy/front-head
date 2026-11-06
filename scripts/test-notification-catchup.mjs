import assert from 'node:assert/strict'
import { createNotificationCatchup } from '../src/utils/notification-catchup.mjs'

let account = 'account-a', clock = 0, requests = 0
let result = { userId: '1', direct: '5', group: '8', system: '3' }, failure = false, response
const stored = new Map(), shown = []
const make = () => createNotificationCatchup({
  getToken: () => account, now: () => clock,
  request: async () => { requests++; if (failure) throw new Error('offline'); if (response) return response; return { ...result } },
  readState: key => stored.get(key), writeState: (key, value) => stored.set(key, value), notify: item => shown.push(item)
})
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
let catchup = make()
catchup.setActive(true); await settle()
assert.equal(requests, 1); assert.equal(shown.length, 1)
assert.equal(shown[0].chat, true); assert.equal(shown[0].system, true)
assert.equal(catchup.seen(1, 'direct', '5'), false, 'a late socket message covered by the summary is silent')
assert.equal(catchup.seen(1, 'group', '8'), false, 'a late group socket message covered by the summary is silent')
assert.equal(catchup.seen(1, 'system', '3'), false, 'a late system notification covered by the summary is silent')
catchup.setActive(false); catchup.setActive(true); await catchup.check(); await settle()
assert.equal(requests, 1, 'rapid resumes do not cause additional requests')
clock += 60001; await catchup.check()
assert.equal(shown.length, 1, 'same unread messages are not replayed')
catchup = make(); catchup.setActive(true); await settle()
assert.equal(shown.length, 1, 'watermarks survive app restart')
clock += 60001; result = { ...result, direct: '6', system: '4' }
assert.equal(catchup.seen(1, 'direct', '7'), true)
assert.equal(catchup.seen(1, 'direct', '6'), true, 'out-of-order realtime messages still notify if not covered by a summary')
catchup.seen('1', 'system', '4')
await catchup.check(); assert.equal(shown.length, 1, 'live reminders are not replayed by catch-up')
clock += 60001; result = { ...result, system: '5' }
await catchup.check(); assert.equal(shown.length, 2); assert.equal(shown[1].chat, false)
clock += 60001; failure = true; await catchup.check(); failure = false
assert.equal(shown.length, 2, 'failed requests do not show false notices')
clock += 60001
let resolve
response = new Promise(done => { resolve = done })
const waiting = catchup.check(); await settle(); account = 'account-b'
resolve({ userId: '1', direct: '99', system: '99' }); await waiting
assert.equal(shown.length, 2, 'a late response from another account is discarded')
response = null; result = { userId: '2', direct: '1', group: '0', system: '0' }
await catchup.check(); assert.equal(shown.length, 3, 'accounts have independent watermarks and limits')
clock += 60001; result = { ...result, direct: '2' }
response = new Promise(done => { resolve = done })
const backgroundRequest = catchup.check(); await settle(); catchup.setActive(false)
resolve(result); await backgroundRequest
assert.equal(shown.length, 3, 'responses arriving in background do not notify')
clock += 60001; response = null; catchup.setActive(true); await settle()
assert.equal(shown.length, 4, 'discarded background response is available next time')
const largeId = '9007199254740993000'
clock += 60001; result = { ...result, direct: largeId }; await catchup.check()
clock += 60001; result = { ...result, direct: '9007199254740992999' }; await catchup.check()
assert.equal(shown.length, 5, 'large message IDs compare without rounding')
console.log('PASS notification catch-up: resume limit, persistent deduplication, live events, offline, background, account isolation and large IDs')
