import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const file = new URL('../src/pages-nonTheme/collector-workbench.vue', import.meta.url)
const source = await readFile(file, 'utf8')
const { descriptor } = parse(source)
let settings = [], weekly = [], daily = [], toasts = [], modals = []
let me = { profile: { status: 'approved', typeIds: [1,2], areaIds: [3], acceptingOrders: true, newOrderNotifications: false, serviceOffers: null }, types: [{ id: 1, name: '纸类', unitPrice: 1.5 }, { id: 2, name: '旧电器', unitPrice: 2 }, { id: 9, name: '未获批', unitPrice: 9 }], areas: [{ id: 3, name: '区域' }], weeklySchedule: [], availability: [], scheduleOverrides: [] }
const context = vm.createContext({ RecyclingShell: {}, RecyclingServiceMap: {}, bookingStatusText: x => x, collectorStatusText: x => x, formatBookingDate: () => '2026-11-11', collectorMe: async () => structuredClone(me), collectorSettings: async data => { settings.push(data); Object.assign(me.profile, data) }, collectorWeeklyAvailability: async data => { weekly.push(data); me.weeklySchedule = me.weeklySchedule.filter(row => row.serviceAreaId !== data.serviceAreaId); for (const weekday of data.weekdays) for (const slot of data.slots) me.weeklySchedule.push({ serviceAreaId: data.serviceAreaId, weekday, slot }) }, collectorAvailability: async data => { daily.push(data); me.availability = me.availability.filter(row => !(row.date === data.date && row.serviceAreaId === data.serviceAreaId)); for (const slot of data.slots || []) me.availability.push({ serviceAreaId: data.serviceAreaId, date: data.date, slot }) }, collectorOrders: async () => ({}), uni: { showToast: data => toasts.push(data), showModal: data => modals.push(data) } })
vm.runInContext(descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'globalThis.component ='), context)
const definition = context.component
const state = { ...definition.data() }
Object.entries(definition.methods).forEach(([key, method]) => { state[key] = method.bind(state) })
Object.entries(definition.computed).forEach(([key, getter]) => Object.defineProperty(state, key, { get: getter.bind(state) }))
await state.load()
assert.equal(state.itemsText({items:[{name:'电器',quantity:2,quantityUnit:'unit'},{name:'纸类',weight:1.5},{name:'旧衣',quantity:null,quantityUnit:'bag'}]}), '电器 2台、纸类 1.5公斤、旧衣 数量待现场确认')
assert.equal(state.orderPriceText({totalPrice:0,pricingSnapshot:{reference:{minTotal:null,maxTotal:null}}}), '数量或报价待确认')
assert.equal(state.orderPriceText({totalPrice:0,pricingSnapshot:{reference:{minTotal:2,maxTotal:5}}}), '参考收益 ¥2.00–5.00')
assert.equal(state.serviceOffers.length, 2, 'only approved catalog types are configurable')
assert.equal(state.serviceOffers[0].unit, 'kg')
assert.equal(state.serviceOffers[0].unitPrice, 1.5)
assert.equal(state.serviceOffers[0].enabled, true)
state.serviceOffers[0].unit = 'bag'; state.serviceOffers[0].unitPrice = '3.25'; state.serviceOffers[0].description = '  干燥无杂质  '; state.serviceOffers[0].requiresPhoto = true
state.serviceOffers[1].priceMode = 'negotiable'; state.serviceDurationMinutes = 45; state.travelBufferMinutes = 15; state.arrivalWindowMinutes = 30
await state.saveServiceOffers()
assert.equal(settings.length, 1)
assert.equal(settings[0].serviceOffers[0].unitPrice, 3.25)
assert.equal(settings[0].serviceOffers[0].description, '干燥无杂质')
assert.equal(settings[0].serviceOffers[0].requiresPhoto, true)
assert.equal(settings[0].serviceOffers[1].unitPrice, null)
assert.equal(settings[0].acceptingOrders, undefined, 'service save does not overwrite switches')
assert.equal(settings[0].newOrderNotifications, undefined)
assert.equal(me.profile.acceptingOrders, true)
assert.equal(me.profile.newOrderNotifications, false)
state.serviceOffers[0].unitPrice = '-1'; await state.saveServiceOffers(); assert.equal(settings.length, 1)
state.serviceOffers[0].unitPrice = ''; await state.saveServiceOffers(); assert.equal(settings.length, 1)
state.serviceOffers[0].unitPrice = '1.123'; await state.saveServiceOffers(); assert.equal(settings.length, 1)
state.serviceOffers[0].unitPrice = '3.25'
state.serviceOffers[0].description = '字'.repeat(201); await state.saveServiceOffers(); assert.equal(settings.length, 1)
state.serviceOffers[0].description = ''
await state.changeSetting('newOrderNotifications', true)
assert.deepEqual(Object.keys(settings[1]), ['newOrderNotifications'])
assert.equal(me.profile.serviceOffers[0].unit, 'bag', 'switch save preserves service configuration')
state.me.weeklySchedule = [{ weekday: 1, serviceAreaId: 3, slot: '08:30-12:00' }, { weekday: 2, serviceAreaId: 3, slot: '13:30-19:00' }]
state.restoreWeeklySlots(); assert.equal(state.weeklyMismatch, true); assert.equal(state.weeklyEdited, false)
const weeklyBeforeInvalid = weekly.length, successToastsBeforeInvalid = toasts.filter(toast => toast.icon === 'success').length
state.setWeekdays([]); state.selectedSlots = ['08:30-12:00']; await state.saveSchedule()
assert.equal(weekly.length, weeklyBeforeInvalid, 'weekly publish with no weekdays does not send a request')
assert.match(state.error, /至少一个每周服务日/)
assert.equal(toasts.filter(toast => toast.icon === 'success').length, successToastsBeforeInvalid, 'invalid weekly publish does not show success')
state.setWeekdays([1]); state.selectedSlots = []; await state.saveSchedule()
assert.equal(weekly.length, weeklyBeforeInvalid, 'weekly publish with no work range does not send a request')
assert.match(state.error, /至少一段工作时间/)
assert.equal(toasts.filter(toast => toast.icon === 'success').length, successToastsBeforeInvalid, 'missing work time does not show success')
state.selectedSlots = ['08:30-12:00', '13:30-19:00']; state.setWeekdays([1,2,3,4,5]); await state.saveSchedule()
assert.equal(weekly.length, 1); assert.equal(weekly[0].slots.join(','), '08:30-12:00,13:30-19:00')
assert.equal(weekly[0].weekdays.join(','), '1,2,3,4,5')
assert.equal(toasts.at(-1).title, '每周排班已发布', 'normal weekly publish gives an explicit success toast')
assert.match(state.scheduleSummary(), /区域 · 周一、周二、周三、周四、周五 · 08:30-12:00、13:30-19:00/, 'preview summarizes area, weekdays, and ranges')
state.selectedSlots = ['08:30-12:00', '11:30-13:00']; await state.saveSchedule(); assert.equal(weekly.length, 1)
assert.match(state.error, /不能重叠/)
assert.notEqual(toasts.at(-1).icon, 'success', 'overlapping ranges are blocked without a success toast')
state.selectedSlots = ['19:00-08:30']; assert.match(state.workRangeError(), /跨夜/)
state.selectedSlots = ['08:45-12:00']; assert.match(state.workRangeError(), /半小时/)
state.selectedSlots = ['08:30-12:00', '12:00-24:00']; assert.equal(state.workRangeError(), '')
state.selectedSlots = []; state.addWorkRange(); assert.equal(state.selectedSlots[0], '08:30-12:00'); state.changeWorkRange(0, 1, { detail: { value: 26 } }); assert.equal(state.selectedSlots[0], '08:30-13:00'); state.removeWorkRange(0); assert.equal(state.selectedSlots.length, 0)
state.scheduleMode = 'daily'; state.scheduleDate = '2026-11-12'; const dailyBeforeMissingTime = daily.length; state.selectedSlots = []; await state.saveSchedule()
assert.equal(daily.length, dailyBeforeMissingTime, 'daily publish with no work range does not send a request')
assert.match(state.error, /至少一段工作时间/)
state.selectedSlots = ['13:30-19:00']; await state.saveSchedule(); assert.equal(daily.length, 1); assert.equal(daily[0].slots[0], '13:30-19:00'); assert.equal(daily[0].serviceAreaId, 3)
assert.equal(toasts.at(-1).title, '单日排班已发布', 'normal daily publish gives an explicit success toast')
const dailyBeforeClear = daily.length
const dailyClearCancelled = state.clearSchedule(); modals.at(-1).success({ confirm: false }); await dailyClearCancelled
assert.equal(daily.length, dailyBeforeClear, 'canceling daily clear sends no request')
assert.equal(toasts.at(-1).title, '单日排班已发布', 'canceling daily clear does not show a success toast')
const dailyClearConfirmed = state.clearSchedule(); assert.match(modals.at(-1).content, /区域.*2026-11-12.*休息/); modals.at(-1).success({ confirm: true }); await dailyClearConfirmed
assert.equal(JSON.stringify(daily.at(-1).slots), '[]', 'confirmed daily clear explicitly submits empty slots for a rest day')
assert.equal(daily.at(-1).serviceAreaId, 3)
assert.equal(toasts.at(-1).title, '已设为当天休息')
state.scheduleMode = 'weekly'; state.selectedWeekdays = [1,2,3,4,5]; state.selectedSlots = ['08:30-12:00']
const weeklyBeforeClear = weekly.length
const weeklyClearCancelled = state.clearSchedule(); assert.match(modals.at(-1).content, /清除.*所有每周固定排班/); modals.at(-1).success({ confirm: false }); await weeklyClearCancelled
assert.equal(weekly.length, weeklyBeforeClear, 'canceling weekly clear sends no request')
const weeklyClearConfirmed = state.clearSchedule(); modals.at(-1).success({ confirm: true }); await weeklyClearConfirmed
assert.equal(JSON.stringify(weekly.at(-1).weekdays), '[]', 'confirmed weekly clear submits an empty weekday array')
assert.equal(JSON.stringify(weekly.at(-1).slots), '[]', 'confirmed weekly clear submits an empty slots array')
assert.equal(weekly.at(-1).serviceAreaId, 3)
assert.equal(toasts.at(-1).title, '每周服务已停止')
await state.resetDailySchedule(); assert.equal(daily.at(-1).reset, true); assert.equal(daily.at(-1).date, '2026-11-12')
state.scheduleMode = 'daily'; state.scheduleDate = ''; state.selectedSlots = ['13:30-19:00']; const dailyBeforeNoDate = daily.length; await state.saveSchedule()
assert.equal(daily.length, dailyBeforeNoDate, 'daily publish without a selected date does not send a request')
assert.match(state.error, /日期/)
console.log('PASS approved offer defaults, own pricing, independent settings, price validation, multi-range weekly and daily/reset methods')
for (const platform of ['H5', 'APP-PLUS', 'MP-WEIXIN']) {
  const flags = { H5: platform === 'H5', APP_PLUS: platform === 'APP-PLUS', MP: platform === 'MP-WEIXIN', MP_WEIXIN: platform === 'MP-WEIXIN' }
  const script = { ...descriptor.script, content: preprocess(descriptor.script.content, flags, { type: 'js' }) }
  compileScript({ ...descriptor, script }, { id: `collector-settings-${platform}` })
  const template = preprocess(descriptor.template.content, flags, { type: 'html' })
  const result = platform === 'MP-WEIXIN' ? (await import('@dcloudio/uni-mp-compiler')).default.compile(template, { filename: file.pathname, mode: 'module', miniProgram: { class: { array: true }, slot: { fallbackContent: true } } }) : compileTemplate({ source: template, filename: file.pathname, id: `collector-settings-${platform}` })
  assert.deepEqual(result.errors || [], [])
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename: file.pathname, id: `collector-settings-${platform}`, scoped: style.scoped }).errors, [])
  console.log(`PASS ${platform} SFC script/template/style compile`)
}
