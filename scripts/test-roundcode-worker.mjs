import assert from 'node:assert/strict'
import { createRoundCodeWorker } from '../src/utils/roundcode-worker-core.mjs'
const rawBase64 = Buffer.from('opaque-native-result').toString('base64')
function harness(overrides = {}) {
  let time = 1000, active = true, identity = 'account-1'
  const events = [], timers = new Map(); let timerId = 0
  const task = { id: 'task-1', ticket: 'a'.repeat(64), expiresAt: 10000, imageBase64: 'iVBORw==', mime: 'image/png' }
  const worker = createRoundCodeWorker({ claim: async () => ({ data: { task } }),
    decode: async () => ({ scanType: 'WX_CODE', rawBase64 }), register: async input => events.push(input),
    isActive: () => active, getIdentity: () => identity, now: () => time,
    setTimer: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id },
    clearTimer: id => timers.delete(id), ...overrides })
  return { worker, task, events, timers, setTime: value => { time = value }, setActive: value => { active = value },
    setIdentity: value => { identity = value }, async tick() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); for (let i=0;i<12;i++) await Promise.resolve() } }
}
const basic = harness(); assert.equal((await basic.worker.processTask(basic.task)).status, 'registered')
assert.deepEqual(basic.events, [{ taskId: 'task-1', ticket: 'a'.repeat(64), rawBase64 }])
const expired = harness(); expired.setTime(10000); assert.equal((await expired.worker.processTask(expired.task)).status, 'expired'); assert.equal(expired.events.length, 0)
for (const result of [{ scanType: 'QR_CODE', rawBase64 }, { scanType: 'WX_CODE', rawBase64: 'AB==========' }, { scanType:'WX_CODE',rawBase64:'AAAAAAAAAAB=' }, { error: 'MULTIPLE_CODES' }]) {
 const invalid = harness({ decode: async () => result }); assert.equal((await invalid.worker.processTask(invalid.task)).status, 'ignored'); assert.equal(invalid.events.length,0)
}
let finish
const stopped = harness({ decode: () => new Promise(resolve => { finish = resolve }) })
const pending = stopped.worker.processTask(stopped.task)
assert.equal((await stopped.worker.processTask(stopped.task)).status, 'busy'); stopped.worker.stop()
finish({ scanType: 'WX_CODE', rawBase64 }); assert.equal((await pending).status, 'inactive'); assert.equal(stopped.events.length, 0)
let finishChanged
const changed = harness({ decode: () => new Promise(resolve => { finishChanged = resolve }) })
const changing = changed.worker.processTask(changed.task); changed.setIdentity('account-2'); finishChanged({ scanType: 'WX_CODE', rawBase64 })
assert.equal((await changing).status, 'inactive'); assert.equal(changed.events.length,0)
let finishExpire
const duringExpiry = harness({ decode: () => new Promise(resolve => { finishExpire = resolve }) })
const expiring = duringExpiry.worker.processTask(duringExpiry.task); duringExpiry.setTime(10000); finishExpire({ scanType:'WX_CODE',rawBase64 })
assert.equal((await expiring).status,'expired'); assert.equal(duringExpiry.events.length,0)
const noBase = harness({ decode: async () => ({ error: 'UNAVAILABLE' }) }); noBase.worker.start(); await noBase.tick()
assert.equal(noBase.worker.available, false); assert.equal(noBase.timers.size,0)
noBase.worker.start(); assert.equal(noBase.timers.size,0,'active unavailable worker requires stop/start, not repeated start')
noBase.worker.stop(); noBase.worker.start(); assert.equal(noBase.timers.size,1)
const retry = harness({ claim: async () => { throw new Error('offline') } }); retry.worker.start(); await retry.tick()
assert.equal([...retry.timers.values()][0].delay,30000); await retry.tick(); assert.equal([...retry.timers.values()][0].delay,60000)
retry.worker.stop(); assert.equal(retry.timers.size,0)
for (const error of [{ httpStatus:404 }, { httpStatus:401 }, { httpStatus:403 }, { httpStatus:200,code:401 }, { httpStatus:200,code:403 }, { data:{reason:'WORKER_UNAVAILABLE'} }]) {
 const unsupported = harness({ claim: async () => { throw error } }); unsupported.worker.start(); await unsupported.tick()
 assert.equal(unsupported.worker.available,false); assert.equal(unsupported.timers.size,0)
}
const idle = harness({ claim: async () => ({ data: { task: null } }) }); idle.worker.start(); await idle.tick(); assert.equal([...idle.timers.values()][0].delay,8000)
idle.setActive(false); await idle.tick(); assert.equal(idle.timers.size,0)
const json = harness({ decode: async () => JSON.stringify({ scanType:'WX_CODE',rawBase64 }) }); assert.equal((await json.worker.processTask(json.task)).status,'registered')
console.log('PASS generated-circle worker: registration, expiry, canonical payload, single-flight, lifecycle/account guards, old-base stop and bounded retry')
