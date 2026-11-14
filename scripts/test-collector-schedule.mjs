import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(root, 'src/pages-nonTheme/collector-workbench.vue'), 'utf8')
const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1]
assert.ok(script, 'component script exists')
const executable = script.replace(/^import .*;?\r?\n/gm, '').replace('export default {', 'module.exports = {')
const calls = []
let meResponse
const context = {
  module: { exports: {} },
  RecyclingShell: {},
  RecyclingServiceMap: {},
  RecyclingTimeline: {},
  collectorMe: async () => meResponse,
  collectorSettings: async () => {},
  collectorAvailability: async payload => calls.push(['daily', payload]),
  collectorWeeklyAvailability: async payload => calls.push(['weekly', payload]),
  collectorOrders: async () => ({}),
  bookingStatusText: value => value,
  collectorStatusText: value => value,
  formatBookingDate: () => '2026-11-11',
  uni: { showToast() {}, getStorageSync() {}, navigateTo() {} }
}
meResponse = { profile: { areaIds: [4] }, areas: [{ id: 4, name: '区域甲' }], weeklySchedule: [], availability: [], scheduleOverrides: [] }
vm.runInNewContext(executable, context)
const options = context.module.exports
const vmState = Object.assign(options.data(), {
  ...options.methods,
  ...Object.fromEntries(Object.entries(options.computed).map(([key, getter]) => [key, getter.call({ me: null, scheduleDate: '2026-11-12' })]))
})
vmState.me = {
  profile: { areaIds: [4] }, areas: [{ id: 4, name: '区域甲' }],
  weeklySchedule: [{ weekday: 1, serviceAreaId: 4, slot: '09:00-10:00' }, { weekday: 2, serviceAreaId: 4, slot: '10:00-11:00' }],
  availability: [{ date: '2026-11-12', serviceAreaId: 4, slot: '13:00-14:00' }],
  scheduleOverrides: [{ date: '2026-11-12' }]
}
vmState.approvedAreas = options.computed.approvedAreas.call(vmState)
vmState.areaIndex = 0
vmState.scheduleMode = 'weekly'
vmState.restoreWeeklySlots()
assert.equal(vmState.weeklyMismatch, true)
assert.match(vmState.weeklyMismatchText, /周一.*周二/)
vmState.addWorkRange()
assert.equal(vmState.weeklyEdited, true)
vmState.selectedWeekdays = [1, 3]
assert.deepEqual(Array.from(vmState.selectedSlots), ['09:00-10:00', '10:00-10:30'])
vmState.saving = false
vmState.me = { ...vmState.me }
vmState.scheduleDate = '2026-11-12'
vmState.today = '2026-11-11'
vmState.lastDay = '2026-12-11'
await options.methods.saveSchedule.call(vmState)
assert.deepEqual(JSON.parse(JSON.stringify(calls.pop())), ['weekly', { serviceAreaId: 4, weekdays: [1, 3], slots: ['09:00-10:00', '10:00-10:30'] }])

vmState.me = { profile: { areaIds: [4] }, areas: [{ id: 4 }], availability: [{ date: '2026-11-12', serviceAreaId: 4, slot: '13:00-14:00' }], scheduleOverrides: [{ date: '2026-11-12' }] }
vmState.scheduleMode = 'daily'
vmState.selectedSlots = []
vmState.getDailyRows = options.methods.getDailyRows.bind(vmState)
vmState.approvedAreas = options.computed.approvedAreas.call(vmState)
vmState.saving = false
vmState.collectorAvailability = undefined
await options.methods.resetDailySchedule.call(vmState)
assert.deepEqual(JSON.parse(JSON.stringify(calls.pop())), ['daily', { date: '2026-11-12', reset: true }])
console.log('collector schedule logic passed')
