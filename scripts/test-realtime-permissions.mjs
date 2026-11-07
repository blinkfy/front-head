import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/utils/realtime-permissions.js', import.meta.url), 'utf8')
const emitted = [], requests = [], timers = new Map()
let nextTimer = 0
const context = {
  plus: { android: { requestPermissions(permissions, success, failure) { requests.push({ permissions, success, failure }) } } },
  uni: { $emit: (...args) => emitted.push(args) },
  setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id }
}
vm.createContext(context)
vm.runInContext(source.replace(/^export const /gm, 'const ').replace(/^export function /gm, 'function ') +
  '\nglobalThis.__api = { realtimePermissionPending, requestRealtimePermissions }', context)
const { realtimePermissionPending, requestRealtimePermissions } = context.__api
const finishTimer = () => {
  const [id, timer] = timers.entries().next().value
  assert.equal(timer.delay, 400, 'permission completion allows the Activity to resume before releasing the hold')
  timers.delete(id); timer.callback()
}

const first = requestRealtimePermissions(['android.permission.ACCESS_FINE_LOCATION'])
assert.equal(realtimePermissionPending(), true)
requests[0].success({ granted: ['android.permission.ACCESS_FINE_LOCATION'] })
assert.equal(realtimePermissionPending(), true, 'permission remains pending during the return-to-app grace period')
assert.equal(timers.size, 1)
finishTimer()
assert.equal(realtimePermissionPending(), false)
assert.deepEqual(await first, { granted: ['android.permission.ACCESS_FINE_LOCATION'] })

const second = requestRealtimePermissions(['android.permission.RECORD_AUDIO'])
const third = requestRealtimePermissions(['android.permission.CAMERA'])
requests[1].failure(new Error('denied'))
finishTimer()
assert.equal(realtimePermissionPending(), true, 'one completed request cannot clear another active prompt')
requests[2].success({ granted: [] })
finishTimer()
await assert.rejects(second, /denied/)
assert.deepEqual(await third, { granted: [] })
assert.equal(realtimePermissionPending(), false)
assert.deepEqual(emitted.map(([name]) => name), Array(6).fill('realtime:permission-changed'),
  'each request and settled result announces the lifecycle state change')

console.log('Realtime permission lifecycle tests passed.')
