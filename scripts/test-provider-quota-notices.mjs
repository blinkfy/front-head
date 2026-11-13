import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../src/pages-nonTheme/system-notifications.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source)
assert.deepEqual(errors, [])
compileScript(descriptor, { id: 'quota-notices' })
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'system-notifications.vue', id: 'quota-notices' }).errors, [])
for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, id: 'quota-notices' }).errors, [])
const routes = readFileSync(new URL('../src/utils/user-notifications.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const navigation = [], reads = [], events = []
const context = vm.createContext({ ManifestIcon: {},
  messageBus: { emit: (...args) => events.push(args) },
  uni: { getStorageSync: () => 'offline-admin', navigateTo: options => navigation.push(options.url) },
  request: async options => { assert.ok(options.url.endsWith('/read')); reads.push(options.data); return { code: 0 } } })
vm.runInContext(`${routes}\nglobalThis.urlFor = userNotificationUrl`, context)
assert.equal(context.urlFor({ kind: 'provider_quota' }), '/pages-nonTheme/system-notifications', 'foreground and push taps open the system inbox')
vm.runInContext(`${descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'globalThis.component =')}`, context)
const page = { ...context.component.data(), ...context.component.methods, active: true, account: 'offline-admin' }
const notice = { id: 8, kind: 'provider_quota', title: '千问 API 余额不足或欠费', readAt: null }
await page.openOrder(notice)
assert.equal(reads.length, 1); assert.equal(reads[0].ids[0], 8)
assert.ok(notice.readAt); assert.equal(navigation.length, 0, 'reading an informational notice does not navigate to another copy of the inbox')
assert.equal(events.length, 1)
await page.openOrder(notice); assert.equal(reads.length, 1, 'already-read notice stays readable without a request')
await page.openOrder({ id: 9, kind: 'booking', orderId: 20, readAt: 'read' })
assert.equal(navigation[0], '/pages-nonTheme/booking-orders?orderId=20', 'existing order navigation is preserved')
page.active = false; await page.openOrder({ ...notice, id: 10, readAt: null }); assert.equal(reads.length, 1)
console.log('Provider quota notice UI passed: component compilation, inbox routing, marking read without duplicate navigation and existing order links.')
