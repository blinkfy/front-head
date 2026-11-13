import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { normalizeGeometry } from '../src/pages-nonTheme/utils/recycling-geometry.mjs'
const apiSource = await readFile(new URL('../src/pages-nonTheme/api/recycling.js', import.meta.url), 'utf8')
const collectorStatusText = new Function('return ' + apiSource.match(/export const collectorStatusText = (.*)/)[1])()

const source = await readFile(new URL('../src/pages-nonTheme/collector-apply.vue', import.meta.url), 'utf8')
const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1]
assert.ok(script, 'component script exists')
const executable = script
  .replace(/^import .*$/gm, '')
  .replace('export default {', 'globalThis.component = {')
  .replace(/\n<\/script>$/, '')
const calls = { gets: 0, posts: [], toast: [] }
let me = { profile: null, application: null, areas: [], serviceName: '核验姓名' }
let failPost = false
const services = {
  collectorMe: async () => { calls.gets++; return me },
  recyclingCatalog: async () => ({ areas: [], types: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `类别${i + 1}` })) }),
  collectorApply: async data => { calls.posts.push(structuredClone(data)); if (failPost) throw new Error('模拟提交失败'); me = { profile: null, serviceName: '核验姓名', application: { status: 'pending', ...structuredClone(data), areaIds: [3] }, areas: [{ id: 3, ...structuredClone(data.serviceAreas[0]) }] } },
  collectorStatusText,
  openPlatformSupport: async () => ({}),
  mutationData: (_writes, _key, payload) => payload,
  normalizeGeometry
}
const context = vm.createContext({ ...services, RecyclingShell: {}, ShopRegionPicker: {}, RecyclingServiceMap: {}, console, structuredClone, uni: { showToast: item => calls.toast.push(item), redirectTo() {} } })
vm.runInContext(`${executable}\n`, context)
const component = context.component
function instance() {
  const vmObject = { ...component.data(), ...component.methods }
  for (const [name, getter] of Object.entries(component.computed)) Object.defineProperty(vmObject, name, { get: () => getter.call(vmObject) })
  return vmObject
}
async function loadState(state) { me = state; const vmObject = instance(); await vmObject.load(); return vmObject }
assert.equal(component.data().guideExpanded, null)
let vmObject = await loadState({ profile: null, application: null, areas: [] })
assert.equal(vmObject.guideVisible, true, 'first-time guide expands by default')
assert.equal(vmObject.canApply, true)
assert.equal(vmObject.serviceName, '', 'service name is only shown after me returns the verified name')
vmObject = await loadState({ profile: null, application: null, areas: [], serviceName: '𠮷田' })
assert.equal(vmObject.serviceName, '𠮷田', 'verified name is displayed from collector status')
assert.doesNotMatch(source, /v-model="form\.serviceName"|<input[^>]*serviceName/, 'service name is read-only in the application form')
vmObject = await loadState({ profile: null, application: { status: 'pending', reason: '正在审核' }, areas: [] })
assert.equal(vmObject.canApply, false, 'pending cannot edit')
assert.equal(vmObject.statusText, collectorStatusText('pending'))
vmObject = await loadState({ profile: { status: 'approved', serviceName: '旧名', reviewReason: '旧原因' }, application: null, areas: [] })
assert.equal(vmObject.canApply, true, 'approved can request changes')
vmObject = await loadState({ profile: { status: 'approved', reviewReason: '旧profile原因' }, application: { status: 'pending', reason: '新申请说明' }, areas: [] })
assert.equal(vmObject.canApply, false)
assert.equal(vmObject.statusText, '变更审核中')
assert.equal(vmObject.reviewReason, '新申请说明')
vmObject.application.reason = ''
assert.equal(vmObject.reviewReason, '', 'a pending change without a reason does not show an old profile reason')
vmObject = await loadState({ profile: { status: 'approved', reviewReason: '旧profile原因' }, application: { status: 'rejected', reason: '当前申请未通过' }, areas: [] })
assert.equal(vmObject.canApply, true)
assert.equal(vmObject.statusText, '变更未通过')
assert.equal(vmObject.reviewReason, '当前申请未通过')
vmObject = await loadState({ profile: { status: 'suspended', reviewReason: '停用说明' }, application: { status: 'pending', reason: '新申请说明' }, areas: [] })
assert.equal(vmObject.canApply, false)
assert.equal(vmObject.statusText, collectorStatusText('suspended'))
assert.equal(vmObject.reviewReason, '停用说明')

vmObject = instance()
await vmObject.submit()
assert.equal(calls.posts.length, 0, 'unverified account cannot submit an application')
vmObject.identity = { verified: true }
vmObject.form.serviceName = '伪造别名'
assert.equal(vmObject.serviceName, '', 'adding a stale form property cannot change the displayed verified name')
vmObject.form.phone = '13812345678'
vmObject.form.typeIds = [2, 5]
vmObject.form.notes = '晚间可服务'
vmObject.form.serviceAreas[0] = { name: '城南', region: ['台湾省', '台北市', '大安区'], geometry: null }
await vmObject.submit()
assert.equal(calls.posts.length, 0, 'invalid geometry does not POST')
assert.equal(vmObject.form.serviceName, '伪造别名', 'validation leaves unrelated stale properties untouched')
vmObject.form.serviceAreas[0].geometry = { type: 'circle', coordinateSystem: 'wgs84', center: { latitude: 25.033, longitude: 121.5654 }, radiusMeters: 1200 }
failPost = true
await vmObject.submit()
assert.equal(calls.posts.length, 1)
assert.equal(vmObject.submitting, false, 'failed POST releases submitting')
assert.equal(vmObject.form.notes, '晚间可服务')
assert.equal(Object.hasOwn(calls.posts[0], 'serviceName'), false, 'client payload never contains a service name, even if a stale/forged property exists')
assert.equal(calls.posts[0].serviceAreas[0].geometry.type, 'circle')
assert.deepEqual(calls.posts[0].serviceAreas[0].region, ['台湾省', '台北市', '大安区'])
assert.deepEqual(calls.posts[0].typeIds, [2, 5])
assert.equal(calls.posts[0].notes, '晚间可服务')
failPost = false
me = { profile: null, application: null, areas: [], serviceName: '核验姓名' }
await vmObject.submit()
assert.equal(calls.posts.length, 2, 'a valid circle submits exactly once')
assert.equal(Object.hasOwn(calls.posts[1], 'serviceName'), false)
assert.equal(vmObject.application.status, 'pending', 'successful submit refreshes into pending state')
console.log('ok collector apply state/submit behaviors')
