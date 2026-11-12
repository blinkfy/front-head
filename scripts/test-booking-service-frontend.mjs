import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const root = path.resolve(import.meta.dirname, '..')
const read = file => fs.readFileSync(path.join(root, 'src/pages-nonTheme', file), 'utf8')
const removeImports = source => source.replace(/^import .*\r?\n/gm, '')
const evaluate = (source, scope, result) => Function(...Object.keys(scope), `${removeImports(source).replace(/export /g, '')}\nreturn ${result}`)(...Object.values(scope))
const api = evaluate(read('api/booking.js'), { baseUrl: 'https://example.test', request() {} }, '{ bookingUnitText, bookingQuantityText, bookingPhotoUrl }')
const draft = evaluate(read('utils/booking-draft-methods.js'), { bookingPhotoUrl: api.bookingPhotoUrl }, 'bookingDraftMethods')
const scope = { ...api, bookingDraftMethods: draft, ManifestIcon: {}, AppConfirmDialog: {}, ShopRegionPicker: {}, ShopAddressPicker: {}, RecyclingServiceMap: {}, RecyclingShell: {}, bookingStatusText: value => value }
const components = {}
for (const name of ['booking', 'booking-orders', 'collector-order-detail']) {
  const filename = `${name}.vue`, parsed = parse(read(filename), { filename })
  assert.deepEqual(parsed.errors, [])
  compileScript(parsed.descriptor, { id: name })
  assert.deepEqual(compileTemplate({ source: parsed.descriptor.template.content, filename, id: name }).errors, [])
  components[name] = evaluate(parsed.descriptor.script.content.replace('export default', 'const component ='), scope, 'component')
}
const booking = components.booking
const context = { ...booking.data(), ...booking.methods, addressCoordinates: null, address: '测试地址', addressRegion: ['省', '市', '区'], serviceAreaId: 1, selectedTypes: [1, 2], timeSlotsDate: '2026-11-12', selectedTimeSlot: '08:20-10:10', contactPhone: '13800138000', photos: [{ id: 'photo-1' }], draftPhotoIds: ['photo-1'], accessNotes: '  五楼无电梯 ', itemUnits: { 1: 'piece', 2: 'kg' }, itemWeights: { 1: '', 2: '2.5' }, itemQuantityNotes: { 1: '约两件' } }
const payload = context.getBookingPayload()
assert.deepEqual(payload.items, [{ typeId: 1, quantity: null, quantityUnit: 'piece', quantityNote: '约两件' }, { typeId: 2, quantity: 2.5, quantityUnit: 'kg', quantityNote: '', weight: 2.5 }])
assert.deepEqual(payload.photoIds, ['photo-1'])
assert.equal(payload.accessNotes, '五楼无电梯')
assert.equal(api.bookingQuantityText({ quantity: 3, quantityUnit: 'bag' }), '3袋')
assert.equal(api.bookingQuantityText({ quantity: null }), '数量待现场确认')
assert.equal(api.bookingPhotoUrl('/api/recycling/photos/id?signature=x'), 'https://example.test/api/recycling/photos/id?signature=x')
context.matchingAreas = [{ priceGuides: [{ typeId: 1, unit: 'piece', minPrice: 10, maxPrice: 20 }, { typeId: 1, unit: 'kg', minPrice: 1, maxPrice: 2 }] }]
context.selectedWasteItems = [{ id: 1 }]
context.itemWeights[1] = 2
context.calculateEstimate()
assert.equal(context.estimateAmount, 20)
assert.equal(context.estimateMax, 40)
assert.equal(context.estimateUnknown, true)
context.itemWeights[1] = ''
context.calculateEstimate()
assert.equal(context.estimateAmount, 0)
assert.equal(context.estimateUnknown, true)
assert.equal(booking.computed.estimateText.call({ estimateAmount: 0, estimateMax: 0, estimateUnknown: false }), '¥0.00–0.00')
let uploadRequest
const uploadApi = evaluate(read('api/booking.js'), {
  baseUrl: 'https://example.test', request() {},
  uni: { getStorageSync: () => 'test-token' },
  compressUploadImageBlob: async () => ({ type: 'image/jpeg' }),
  uploadImageExtension: () => 'jpg', discardUploadImage() {},
  FormData: class { append(name) { assert.equal(name, 'file') } },
  fetch: async (url, options) => { uploadRequest = { url, options }; return { ok: true, json: async () => ({ code: 0, data: { id: 'photo-2', url: '/api/recycling/photos/photo-2?signature=x' } }) } }
}, '{ uploadBookingPhoto }')
const uploaded = await uploadApi.uploadBookingPhoto('local-photo')
assert.equal(uploadRequest.url, 'https://example.test/api/recycling/photos')
assert.equal(uploadRequest.options.headers.Authorization, 'test-token')
assert.equal(uploaded.url, 'https://example.test/api/recycling/photos/photo-2?signature=x')
let acted
const collector = components['collector-order-detail']
const task = { ...collector.data(), ...collector.methods, order: { status: 'confirmed', pricingSnapshot: { status: 'pending' } }, load: async () => {} }
await task.act('start')
assert.match(task.error, /等待用户确认报价/)
task.error = ''
await task.start()
assert.match(task.error, /等待用户确认报价/)
task.actualPrice = '20'
task.actualItems = [{ typeId: 1, quantity: '2', quantityUnit: 'piece' }]
task.act = (action, extra) => { acted = { action, extra } }
task.complete()
assert.deepEqual(acted, { action: 'complete', extra: { actualPrice: 20, actualItems: [{ typeId: 1, quantity: 2, quantityUnit: 'piece' }] } })
console.log('Booking service frontend: 3 SFCs compile; optional quantities, price ranges, photo URL, quote gate and completion units pass.')

const missingPhotoState = { ...booking.data(), ...booking.methods, photos: [{ id: 'retained' }], draftPhotoIds: ['retained', 'missing'] }
missingPhotoState.clearUnresolvedPhotos()
assert.deepEqual(missingPhotoState.draftPhotoIds, ['retained'], 'unavailable draft photos can be removed without dropping visible photos')
console.log('Booking unavailable draft photo recovery passes.')
