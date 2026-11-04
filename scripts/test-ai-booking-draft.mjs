import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { initPreContext, preCss, preHtml, preJs } from '@dcloudio/uni-cli-shared/dist/preprocess/index.js'
import { formatBookingDate } from '../src/pages-nonTheme/utils/booking-date.mjs'
import { businessActionRequestId } from '../src/pages-nonTheme/utils/ai-chat-business.mjs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const bookingPath = '../src/pages-nonTheme/booking.vue'
const cardPath = '../src/pages-nonTheme/components/ChatBusinessCards.vue'

for (const path of [bookingPath, cardPath]) {
  const source = read(path)
  for (const platform of ['h5', 'mp-weixin', 'app']) {
    initPreContext(platform)
    const { descriptor, errors } = parse(source, { filename: path })
    assert.equal(errors.length, 0, `${path} parses`)
    const processedScript = descriptor.scriptSetup
      ? preJs(descriptor.scriptSetup.content, path)
      : preJs(descriptor.script.content, path)
    const processedTemplate = preHtml(descriptor.template.content, path)
    descriptor.styles.forEach(style => preCss(style.content, path))
    if (descriptor.scriptSetup) {
      compileScript({ ...descriptor, scriptSetup: { ...descriptor.scriptSetup, content: processedScript } }, { id: `${platform}-${path}` })
    } else {
      compileScript({ ...descriptor, script: { ...descriptor.script, content: processedScript } }, { id: `${platform}-${path}` })
    }
    const compiled = compileTemplate({ source: processedTemplate, filename: path, id: `${platform}-${path}`, compilerOptions: { comments: true } })
    assert.equal(compiled.errors.length, 0, `${platform} template compiles: ${path}`)
  }
}

const api = { fetchAiAction: async () => ({}), updateAiAction: async () => ({}), confirmAiAction: async () => ({}), createBookingDraft: async () => ({}), newActionRequestId: () => 'replacement-request' }
const methodSource = read('../src/pages-nonTheme/utils/booking-draft-methods.js')
const methodContext = { ...api, Date, Number, Object, String }
runInNewContext(`${methodSource.replace(/^import .*\r?\n/gm, '').replace('export const bookingDraftMethods =', 'this.bookingDraftMethods =')}`, methodContext)
const bookingDraftMethods = methodContext.bookingDraftMethods

const bookingSource = parse(read(bookingPath), { filename: bookingPath }).descriptor.script.content
const bookingContext = {
  __bookingDraftMethods: bookingDraftMethods,
  getWasteTypes: async () => [], createBooking: async () => ({ data: { id: 1 } }), getAvailableTimeSlots: async () => [],
  getUserProfile: async () => ({}), updateUserProfile: async () => ({}), splitShopAddress: () => ({ region: ['', '', ''], detail: '' }), composeShopAddress: () => '',
  playUiSound() {}, formatBookingDate, ManifestIcon: {}, ShopRegionPicker: {}, ShopAddressPicker: {},
  console: { warn() {}, error() {} }, setTimeout() {},
  uni: { showToast() {}, showModal() {}, navigateTo() {}, redirectTo() {}, navigateBack() {}, reLaunch() {}, getStorageSync: () => '', setStorageSync() {} }
}
const executableBooking = `const bookingDraftMethods = this.__bookingDraftMethods;\n${bookingSource.replace(/^import .*\r?\n/gm, '').replace(/export default\s*/, 'this.bookingComponent = ')}`
runInNewContext(executableBooking, bookingContext, { filename: 'booking.vue' })
const component = bookingContext.bookingComponent

const makeState = (overrides = {}) => {
  const state = {
    ...component.data(), dateValues: { today: '2026-11-04', tomorrow: '2026-11-05', custom: '' },
    selectedTypes: [7], itemWeights: { 7: 2.5 }, selectedDate: 'today', selectedTimeSlot: '10:00-11:00',
    timeSlotsDate: '2026-11-04', timeSlots: [{ time: '10:00-11:00', available: true }], timeSlotsLoading: false,
    addressRegion: ['台北市', '台北市', '大安區'], addressDetail: '測試路 1 號', contactPhone: '0912345678', remark: '请预约',
    wasteTypes: [{ id: 7, price: 10 }],
    ...component.methods,
    validateBookingForm: () => true,
    async loadTimeSlots() { this.timeSlotsDate = this.dateValues[this.selectedDate]; this.timeSlots = [{ time: '10:00-11:00', available: true }]; this.selectedTimeSlot = '10:00-11:00' },
    ...overrides
  }
  state.address = '台北市台北市大安區測試路 1 號'
  return state
}

let createCalls = 0
let reads = 0
let patches = 0
let confirms = 0
let ordinaryCreates = 0
let estimatedRequests = 0
const toasts = []
const modals = []
const navigations = []
const vmContext = { ...bookingContext, ...api,
  fetchAiAction: async id => { reads++; assert.equal(id, 'booking-1'); return { data: { id, type: 'booking', status: 'pending', version: 1, expiresAt: '2999-01-01T00:00:00Z', payload: { items: [{ typeId: 7, weight: 1 }], appointmentDate: '2026-11-04', appointmentTimeSlot: '10:00-11:00' } } } },
  updateAiAction: async (id, body) => { patches++; assert.equal(id, 'booking-1'); assert.equal(body.version, 1); return { data: { id, type: 'booking', status: 'pending', version: 2, payload: body.payload } } },
  confirmAiAction: async (id, body) => { confirms++; assert.equal(id, 'booking-1'); assert.equal(body.version, 2); return { data: { booking: { id: 15, orderNo: 'B15', appointmentDate: '2026-11-04', appointmentTimeSlot: '10:00-11:00', address: '台北市' } } } },
  createBookingDraft: async () => { createCalls++; return { data: { id: 'replacement' } } },
  createBooking: async () => { ordinaryCreates++; return { data: { id: 20 } } },
  estimatePrice: async () => { estimatedRequests++; return {} },
  uni: { ...bookingContext.uni, showToast: value => toasts.push(value), showModal: value => modals.push(value), navigateTo: value => navigations.push(value), redirectTo: value => navigations.push(value) }
}
// Evaluate the production method object with live API mocks, then attach it to the extracted OptionsAPI component.
const liveMethods = { ...bookingDraftMethods }
const state = makeState({
  ...liveMethods,
  validateBookingForm: () => true,
  syncProfileAfterBooking() {}
})
state.draftId = 'booking-1'
// Re-evaluate the module with counters so the actual production methods execute against the mock API.
const liveContext = {
  fetchAiAction: vmContext.fetchAiAction, updateAiAction: vmContext.updateAiAction, confirmAiAction: vmContext.confirmAiAction,
  createBookingDraft: vmContext.createBookingDraft, newActionRequestId: () => 'replacement-request', uni: vmContext.uni, Date, Number, Object, String
}
runInNewContext(`${methodSource.replace(/^import .*\r?\n/gm, '').replace('export const bookingDraftMethods =', 'this.bookingDraftMethods =')}`, liveContext)
Object.assign(state, liveContext.bookingDraftMethods)
await state.loadBookingDraft({ data: { id: 'booking-1', type: 'booking', status: 'pending', version: 1, expiresAt: '2999-01-01T00:00:00Z', payload: { items: [{ typeId: 7, weight: 1 }], appointmentDate: '2026-11-04', appointmentTimeSlot: '10:00-11:00' } } })
assert.equal(state.selectedTypes[0], 7)
assert.equal(state.itemWeights[7], 1)
assert.equal(state.selectedTimeSlot, '10:00-11:00')
await state.submitBooking()
assert.equal(reads, 1)
assert.equal(patches, 1)
assert.equal(confirms, 1)
assert.equal(state.draftReceipt.id, 15)
assert.equal(ordinaryCreates, 0, 'draft submissions never call the ordinary createBooking endpoint')

let retryReads = 0
let retryPatches = 0
let retryConfirms = 0
const retryState = makeState({ draftId: 'booking-1', draft: { id: 'booking-1', version: 2, status: 'pending', expiresAt: '2999-01-01T00:00:00Z' },
  fetchAiAction: async id => { retryReads++; return { data: retryReads === 1 ? { id, type: 'booking', status: 'pending', version: 2, expiresAt: '2999-01-01T00:00:00Z' } : { id, type: 'booking', status: 'completed', version: 3, result: { booking: { id: 15, orderNo: 'B15' } } } } },
  updateAiAction: async () => { retryPatches++; return { data: { version: 3 } } }, confirmAiAction: async () => { retryConfirms++; throw new Error('connection lost') },
  async loadTimeSlots() { this.timeSlotsDate = this.dateValues[this.selectedDate]; this.timeSlots = [{ time: '10:00-11:00', available: true }]; this.selectedTimeSlot = '10:00-11:00' }
})
// Install methods bound to retry's independently mocked API.
const retryContext = { fetchAiAction: retryState.fetchAiAction, updateAiAction: retryState.updateAiAction, confirmAiAction: retryState.confirmAiAction, createBookingDraft: vmContext.createBookingDraft, newActionRequestId: () => 'retry-id', uni: vmContext.uni, Date, Number, Object, String }
runInNewContext(`${methodSource.replace(/^import .*\r?\n/gm, '').replace('export const bookingDraftMethods =', 'this.bookingDraftMethods =')}`, retryContext)
Object.assign(retryState, retryContext.bookingDraftMethods)
await retryState.submitDraftBooking()
assert.equal(retryState.draftReceipt, null, 'a lost confirmation response does not fabricate a receipt')
await retryState.submitDraftBooking()
assert.equal(retryState.draftReceipt.id, 15, 'retry GET recovers the completed receipt')
assert.equal(retryPatches, 1)
assert.equal(retryConfirms, 1)

let stalePatch = 0
let staleConfirm = 0
const changed = makeState({ draftId: 'booking-1', draft: { id: 'booking-1', version: 1, status: 'pending' },
  fetchAiAction: async id => ({ data: { id, type: 'booking', status: 'pending', version: 2, expiresAt: '2999-01-01T00:00:00Z', payload: { items: [{ typeId: 7, weight: 6 }] } } }),
  updateAiAction: async () => { stalePatch++ }, confirmAiAction: async () => { staleConfirm++ },
  async loadTimeSlots() { this.timeSlotsDate = this.dateValues[this.selectedDate] }
})
const changedContext = { fetchAiAction: changed.fetchAiAction, updateAiAction: changed.updateAiAction, confirmAiAction: changed.confirmAiAction, createBookingDraft: vmContext.createBookingDraft, newActionRequestId: () => 'x', uni: vmContext.uni, Date, Number, Object, String }
runInNewContext(`${methodSource.replace(/^import .*\r?\n/gm, '').replace('export const bookingDraftMethods =', 'this.bookingDraftMethods =')}`, changedContext)
Object.assign(changed, changedContext.bookingDraftMethods)
await changed.submitDraftBooking()
assert.equal(stalePatch, 0, 'a changed draft version is never patched with stale form data')
assert.equal(staleConfirm, 0)
assert.ok(toasts.some(toast => /核对/.test(toast.title)))

let expiredPatch = 0
let expiredConfirm = 0
const expiredState = makeState({ draftId: 'booking-1', draft: { id: 'booking-1', version: 1, status: 'pending' }, draftExpired: false,
  fetchAiAction: async id => ({ data: { id, type: 'booking', status: 'pending', version: 1, expiresAt: '2000-01-01T00:00:00Z' } }),
  updateAiAction: async () => { expiredPatch++ }, confirmAiAction: async () => { expiredConfirm++ } })
const expiredContext = { fetchAiAction: expiredState.fetchAiAction, updateAiAction: expiredState.updateAiAction, confirmAiAction: expiredState.confirmAiAction, createBookingDraft: vmContext.createBookingDraft, newActionRequestId: () => 'x', uni: vmContext.uni, Date, Number, Object, String }
runInNewContext(`${methodSource.replace(/^import .*\r?\n/gm, '').replace('export const bookingDraftMethods =', 'this.bookingDraftMethods =')}`, expiredContext)
Object.assign(expiredState, expiredContext.bookingDraftMethods)
await expiredState.submitDraftBooking()
assert.equal(expiredPatch, 0)
assert.equal(expiredConfirm, 0)
assert.equal(expiredState.draftExpired, true)
assert.equal(createCalls, 0, 'expiry never silently creates a replacement draft')
await expiredState.recreateBookingDraft()
assert.equal(createCalls, 1, 'replacement draft creation requires the explicit recreate method')

let removedTypePatch = 0
const oldTypeState = makeState({ draftId: 'booking-old-type', draft: { id: 'booking-old-type', version: 1, status: 'pending', snapshot: { details: [{ typeId: 99, name: '旧式家具' }] }, payload: { items: [{ typeId: 99, weight: 2 }] } },
  selectedTypes: [99], itemWeights: { 99: 2 }, wasteTypes: [{ id: 7, name: '纸箱', price: 10 }],
  fetchAiAction: async id => ({ data: { id, type: 'booking', status: 'pending', version: 1, expiresAt: '2999-01-01T00:00:00Z', payload: { items: [{ typeId: 99, weight: 2 }] } } }),
  updateAiAction: async (_id, body) => { removedTypePatch++; return { data: { version: 2, payload: body.payload } } },
  confirmAiAction: async () => ({ data: { booking: { id: 88 } } }),
  async loadTimeSlots() { this.timeSlotsDate = this.dateValues[this.selectedDate]; this.selectedTimeSlot = '10:00-11:00' }
})
const unavailableItems = component.computed.unavailableWasteItems.call(oldTypeState)
assert.equal(unavailableItems[0].name, '旧式家具', 'the old snapshot label remains visible for a disabled type')
oldTypeState.toggleWasteType(unavailableItems[0])
assert.deepEqual(Array.from(oldTypeState.selectedTypes), [])
oldTypeState.toggleWasteType(oldTypeState.wasteTypes[0])
assert.deepEqual(Array.from(oldTypeState.selectedTypes), [7], 'the user can remove the disabled type and choose an available type')
const oldTypeContext = { fetchAiAction: oldTypeState.fetchAiAction, updateAiAction: oldTypeState.updateAiAction, confirmAiAction: oldTypeState.confirmAiAction, createBookingDraft: vmContext.createBookingDraft, newActionRequestId: () => 'x', uni: vmContext.uni, Date, Number, Object, String }
runInNewContext(`${methodSource.replace(/^import .*\r?\n/gm, '').replace('export const bookingDraftMethods =', 'this.bookingDraftMethods =')}`, oldTypeContext)
Object.assign(oldTypeState, oldTypeContext.bookingDraftMethods)
await oldTypeState.submitDraftBooking()
assert.equal(removedTypePatch, 1, 'the corrected available item selection can be submitted')

let bookingUi
let createPlain = 0
const plainState = makeState({ draftId: '', validateBookingForm: () => true, getBookingPayload: () => ({ items: [] }), syncProfileAfterBooking() {} })
const plainContext = { ...bookingContext, createBooking: async () => { createPlain++; return { data: { id: 2 } } }, playUiSound() {}, setTimeout() {} }
// The extracted component method uses its lexical createBooking binding, so evaluate it with an observable stub.
const plainSource = `const bookingDraftMethods = this.__bookingDraftMethods;\n${bookingSource.replace(/^import .*\r?\n/gm, '').replace('export default', 'this.bookingComponent =')}`
const createPlainContext = { ...plainContext, __bookingDraftMethods: bookingDraftMethods, createBooking: async () => { createPlain++; return { data: { id: 2 } } } }
runInNewContext(plainSource, createPlainContext)
bookingUi = createPlainContext.bookingComponent
await bookingUi.methods.submitBooking.call(plainState)
assert.equal(createPlain, 1, 'the ordinary no-draft flow still calls createBooking')

const estimateState = makeState({ selectedTypes: [7], itemWeights: { 7: 3 } })
estimateState.selectedWasteItems = [{ id: 7, price: 12 }]
component.methods.calculateEstimate.call(estimateState)
assert.equal(estimateState.estimateAmount, 36)
assert.equal(estimatedRequests, 0, 'weight-based estimates do not call an API')

const chatSource = read(cardPath)
const { descriptor: chatDescriptor } = parse(chatSource, { filename: cardPath })
const chatSetup = chatDescriptor.scriptSetup.content
const openBookingNode = parseJavaScript(chatSetup, { sourceType: 'module' }).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'openBooking')
assert.ok(openBookingNode, 'ChatBusinessCards exposes the booking draft entry handler')
const openBookingSource = chatSetup.slice(openBookingNode.start, openBookingNode.end)
const cardCalls = []
const cardState = {
  props: { messageId: '', sessionId: '' }, busyProductId: { value: '' }, createRequestIds: new Map(), businessActionRequestId, beginCardAction: () => () => true,
  bookingSupported: () => true, fetchAiCapabilities: async () => ({}), isCapabilityNotFound: () => false,
  newActionRequestId: () => 'request-1', createBookingDraft: async input => { cardCalls.push(input); return { data: { id: 'booking-9' } } },
  uni: { navigateTo: value => navigations.push(value), showModal() {} }
}
runInNewContext(`${openBookingSource}\nthis.run = openBooking`, cardState)
await cardState.run({ description: '预约纸箱' })
assert.equal(cardCalls.length, 1)
assert.equal(cardCalls[0].notes, '预约纸箱')
assert.equal(cardCalls[0].requestId, 'request-1')
assert.ok(navigations.some(item => item.url === '/pages-nonTheme/booking?draftId=booking-9'))

console.log('AI booking draft mock flow and H5 / Weixin / App SFC preprocessing passed')
