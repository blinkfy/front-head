import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { formatBookingDate } from '../src/pages-nonTheme/utils/booking-date.mjs'
import { gcj02ToWgs84, normalizePoint } from '../src/pages-nonTheme/utils/recycling-geometry.mjs'

const root = new URL('../', import.meta.url)

function conditionalSource(source, target) {
  const stack = [true]
  const output = []
  for (const line of source.split(/\r?\n/)) {
    const open = line.match(/^\s*\/\/\s*#(ifdef|ifndef)\s+(.+)\s*$/) || line.match(/^\s*<!--\s*#(ifdef|ifndef)\s+(.+?)\s*-->\s*$/)
    const otherwise = /^\s*(?:\/\/|<!--)\s*#else\s*(?:-->)?\s*$/.test(line)
    const close = /^\s*(?:\/\/|<!--)\s*#endif\s*(?:-->)?\s*$/.test(line)
    if (open) {
      const matches = open[2].split(/\s+\|\|\s+/).includes(target)
      stack.push(stack.at(-1) && (open[1] === 'ifdef' ? matches : !matches))
    } else if (otherwise) {
      assert.ok(stack.length > 1, 'preprocessor else has a matching if')
      const parent = stack.at(-2)
      stack[stack.length - 1] = parent && !stack.at(-1)
    } else if (close) stack.pop()
    else if (stack.at(-1)) output.push(line)
  }
  assert.equal(stack.length, 1, 'conditional compilation blocks should be balanced')
  return output.join('\n')
}

function compileSfc(source, filename, target) {
  const parsed = parse(source, { filename })
  assert.equal(parsed.errors.length, 0, `${filename} SFC parses`)
  const script = parsed.descriptor.scriptSetup || parsed.descriptor.script
  assert.ok(script, `${filename} has a script`)
  script.content = conditionalSource(script.content, target)
  const compiledScript = compileScript(parsed.descriptor, { id: `${target}-${filename}` })
  assert.ok(compiledScript.content.length > 0, `${filename} ${target} script compiles`)
  const template = conditionalSource(parsed.descriptor.template.content, target)
  const compiledTemplate = compileTemplate({ source: template, filename, id: `${target}-${filename}` })
  assert.deepEqual(compiledTemplate.errors, [], `${filename} ${target} template compiles`)
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function createBookingHarness() {
  const requests = []
  const catalogRequests = []
  const storage = new Map()
  const toasts = []
  let createBookingCalls = 0
  const context = {
    bookingDraftMethods: {},
    AppConfirmDialog: {}, RecyclingServiceMap: {},
    bookingUnitText: unit => ({ kg: '公斤', piece: '件', unit: '台', bag: '袋' })[unit] || '',
    normalizePoint, gcj02ToWgs84,
    getAvailableTimeSlots(date) {
      const result = deferred()
      requests.push({ date, ...result })
      return result.promise
    },
    recyclingCatalog() {
      const result = deferred()
      catalogRequests.push(result)
      return result.promise
    },
    getWasteTypes: async () => [],
    createBooking: async () => { createBookingCalls++; return { id: 1 } },
    estimatePrice: async () => ({ totalPrice: 0 }),
    getUserProfile: async () => ({}),
    updateUserProfile: async () => ({}),
    splitShopAddress: address => ({ region: ['台北市', '台北市', '大安區'], detail: address }),
    composeShopAddress: (_region, detail) => detail,
    playUiSound: () => {},
    formatBookingDate,
    ManifestIcon: {}, ShopRegionPicker: {}, ShopAddressPicker: {},
    console: { warn() {}, error() {} },
    uni: {
      getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, value), showToast: toast => toasts.push(toast),
      navigateTo() {}, navigateBack() {}, reLaunch() {}
    }
  }
  const filename = new URL('../src/pages-nonTheme/booking.vue', import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const { descriptor, errors } = parse(source, { filename: filename.pathname })
  assert.equal(errors.length, 0, 'booking.vue parses')
  const executable = `const bookingDraftMethods = this.bookingDraftMethods;\n${descriptor.script.content
    .replace(/^import .*\r?\n/gm, '')
    .replace(/export default\s*/, 'this.bookingComponent = ')}`
  runInNewContext(executable, context, { filename: 'booking.vue' })
  return {
    component: context.bookingComponent,
    requests,
    catalogRequests,
    storage,
    toasts,
    get createBookingCalls() { return createBookingCalls }
  }
}

let addressPickerExecutable
function createAddressPickerHarness(props, getCurrentAddress) {
  if (!addressPickerExecutable) {
    const filename = new URL('../src/pages-nonTheme/components/shop/ShopAddressPicker.vue', import.meta.url)
    const original = readFileSync(filename, 'utf8')
    const source = original.replace(/(<script setup>)([\s\S]*?)(<\/script>)/, (_, open, content, close) => `${open}${conditionalSource(content, 'H5')}${close}`)
    const parsed = parse(source, { filename: filename.pathname })
    assert.equal(parsed.errors.length, 0, 'ShopAddressPicker.vue parses')
    addressPickerExecutable = compileScript(parsed.descriptor, { id: 'booking-address-picker-ux' }).content
      .replace(/^import .*\r?\n/gm, '')
      .replace(/export default\s*/, 'this.addressPickerComponent = ')
  }
  const watches = [], emitted = [], unmount = []
  const context = {
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter() } }),
    watch(source, handler, options = {}) { const item = { source, handler, options }; watches.push(item); if (options.immediate) handler() },
    onBeforeUnmount: callback => unmount.push(callback), nextTick: async () => {},
    ManifestIcon: {}, getUserLocationOnce: async () => ({ latitude: 25, longitude: 121 }),
    locationErrorMessage: reason => String(reason), searchPlaces: async () => [], getCurrentAddress,
    resolveLocationAddress: async () => ({}), chooseMiniLocation: async () => ({}), chooseMiniAddress: async () => ({}),
    isLocationCancelled: () => false, uni: { getSystemInfoSync: () => ({ uniPlatform: 'web' }) },
    console: { warn() {} }
  }
  runInNewContext(addressPickerExecutable, context, { filename: 'ShopAddressPicker.vue' })
  const component = context.addressPickerComponent
  const instance = component.setup(props, { expose() {}, emit: (...event) => emitted.push(event) })
  return { instance, watches, emitted, unmount }
}

async function testCatalogRefreshOnShowAndDeduplication() {
  const harness = createBookingHarness()
  const state = createPageState(harness.component)
  state.checkTheme = () => {}
  state.calculateEstimate = () => {}
  state.matchingAreas = [{ id: 42 }]
  state.dateValues = { today: formatBookingDate(new Date()), tomorrow: '', custom: '' }
  state.selectedDate = 'today'
  state.selectedTimeSlot = '09:00-10:00'

  harness.component.onShow.call(state)
  assert.equal(harness.catalogRequests.length, 0, 'first onShow before initialization does not duplicate the initial catalog load')

  state.bookingInitialized = true
  harness.component.onShow.call(state)
  assert.equal(harness.catalogRequests.length, 1, 'returning to an initialized booking page refreshes the catalog')
  await state.loadServiceAreas()
  assert.equal(harness.catalogRequests.length, 1, 'a catalog request already in flight is not duplicated')
  harness.catalogRequests[0].resolve({ areas: [{ id: 42 }], types: [{ id: 7 }] })
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.requests.length, 1, 'catalog synchronization reloads available time slots')
  assert.equal(harness.requests[0].date, state.dateValues.today, 'slot reload uses the current selected date')
  harness.requests[0].resolve([{ slot: '10:00-11:00', available: true }])

  const staleDay = '2000-01-01'
  state.dateValues.today = staleDay
  state.selectedDate = 'today'
  state.selectedTimeSlot = '09:00-10:00'
  harness.component.onShow.call(state)
  assert.notEqual(state.dateValues.today, staleDay, 'cross-midnight onShow refreshes local date values')
  assert.equal(state.selectedTimeSlot, '', 'cross-midnight refresh clears the stale selected slot')
  assert.equal(harness.catalogRequests.length, 2, 'cross-midnight onShow refreshes catalog through the normal path')
  harness.catalogRequests[1].resolve({ areas: [{ id: 42 }], types: [{ id: 7 }] })
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.requests.length, 2, 'cross-midnight catalog synchronization reloads slots')
  assert.equal(harness.requests[1].date, state.dateValues.today, 'cross-midnight slot reload uses the refreshed date')
  harness.requests[1].resolve([])
}

async function testBookingInitialAddressLocationRecovery() {
  const harness = createBookingHarness()
  const state = createPageState(harness.component)
  Object.defineProperty(state, 'address', {
    configurable: true,
    get() { return this.addressDetail },
    set(value) { this.addressDetail = value }
  })
  state.syncServiceCoverage = () => {}
  harness.storage.set('userInfo', { id: 123 })
  harness.storage.set('bookingAddress', '台北市大安區測試路 1 號')
  await state.loadAddress()
  assert.equal(state.address, '台北市大安區測試路 1 號', 'legacy text-only address cache is restored')
  assert.equal(state.addressCoordinates, null, 'legacy text-only cache has no trusted point')
  assert.equal(state.addressReady, true)

  const gps = deferred()
  let gpsCalls = 0
  const picker = createAddressPickerHarness({ modelValue: state.address, disabled: false, autoLocate: true, autoLocateWhenFilled: true }, () => { gpsCalls++; return gps.promise })
  assert.equal(gpsCalls, 1, 'booking picker auto-locates when cached text has no coordinates')
  gps.resolve({ address: state.address, latitude: 25.033, longitude: 121.5654, accuracy: 47 })
  await new Promise(resolve => setImmediate(resolve))
  const selection = picker.emitted.find(([event]) => event === 'select')?.[1]
  assert.ok(selection, 'successful auto-location emits the resolved address and coordinates')
  assert.equal(selection.address, state.address)
  assert.equal(selection.accuracy, 47)
  harness.component.methods.applyLocatedAddress.call(state, selection)
  const cachedLocation = harness.storage.get('bookingAddressLocation')
  assert.equal(cachedLocation.userId, '123', 'saved location is scoped to the signed-in user')
  assert.equal(cachedLocation.address, state.address, 'saved coordinates are tied to the exact address')
  assert.equal(cachedLocation.accuracyMeters, 47, 'location accuracy is retained in the cache')
  assert.equal(cachedLocation.coordinateSystem, 'wgs84')

  const restored = createPageState(harness.component)
  Object.defineProperty(restored, 'address', {
    configurable: true,
    get() { return this.addressDetail },
    set(value) { this.addressDetail = value }
  })
  restored.syncServiceCoverage = () => {}
  await harness.component.methods.loadAddress.call(restored)
  assert.equal(restored.addressCoordinates.latitude, 25.033, 'valid same-user coordinates restore with their address')
  assert.equal(restored.addressCoordinates.accuracyMeters, 47)
  let restoreGpsCalls = 0
  createAddressPickerHarness({ modelValue: restored.address, disabled: false, autoLocate: true, autoLocateWhenFilled: false }, async () => { restoreGpsCalls++; return {} })
  assert.equal(restoreGpsCalls, 0, 'restored valid coordinates avoid another GPS prompt')

  for (const [owner, address, point, label] of [
    ['456', state.address, cachedLocation, 'coordinates from another account are rejected'],
    ['123', 'different address', cachedLocation, 'coordinates for another address are rejected'],
    ['123', state.address, { ...cachedLocation, latitude: 90 }, 'invalid WGS84 coordinates are rejected']
  ]) {
    harness.storage.set('userInfo', { id: owner })
    harness.storage.set('bookingAddress', address)
    harness.storage.set('bookingAddressLocation', point)
    const rejected = createPageState(harness.component)
    Object.defineProperty(rejected, 'address', { configurable: true, get() { return this.addressDetail }, set(value) { this.addressDetail = value } })
    rejected.syncServiceCoverage = () => {}
    await harness.component.methods.loadAddress.call(rejected)
    assert.equal(rejected.addressCoordinates, null, label)
  }

  harness.storage.set('userInfo', { id: 123 })
  harness.storage.set('bookingAddress', state.address)
  const converted = createPageState(harness.component)
  Object.defineProperty(converted, 'address', { configurable: true, get() { return this.addressDetail }, set(value) { this.addressDetail = value } })
  converted.syncServiceCoverage = () => {}
  converted.bookingInitialized = true
  harness.component.methods.applyLocatedAddress.call(converted, { address: state.address, latitude: 25.033, longitude: 121.5654, accuracy: 63, coordinateSystem: 'gcj02' })
  const expected = gcj02ToWgs84({ latitude: 25.033, longitude: 121.5654 })
  assert.deepEqual(converted.addressCoordinates && { latitude: converted.addressCoordinates.latitude, longitude: converted.addressCoordinates.longitude }, expected, 'GCJ02 selection converts to WGS84 before matching')
  assert.equal(converted.addressCoordinates.accuracyMeters, 63, 'GPS accuracy survives coordinate conversion')
  assert.equal(normalizePoint(converted.addressCoordinates).latitude, expected.latitude)

  for (const change of [
    { label: 'user-edited address is not overwritten', mutate: props => { props.modelValue = 'user edited address' } },
    { label: 'disabled picker result is ignored', mutate: props => { props.disabled = true } }
  ]) {
    const delayed = deferred()
    const props = { modelValue: 'cached text', disabled: false, autoLocate: true, autoLocateWhenFilled: true }
    const pendingPicker = createAddressPickerHarness(props, () => delayed.promise)
    change.mutate(props)
    delayed.resolve({ address: 'GPS result', latitude: 25, longitude: 121, accuracy: 20 })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(pendingPicker.emitted.length, 0, change.label)
  }

  let draftGpsCalls = 0
  createAddressPickerHarness({ modelValue: 'draft address', disabled: false, autoLocate: false, autoLocateWhenFilled: true }, async () => { draftGpsCalls++; return {} })
  assert.equal(draftGpsCalls, 0, 'draft booking picker does not auto-locate')
  let shopGpsCalls = 0
  createAddressPickerHarness({ modelValue: 'existing shop address', disabled: false, autoLocate: true, autoLocateWhenFilled: false }, async () => { shopGpsCalls++; return {} })
  assert.equal(shopGpsCalls, 0, 'other ShopAddressPicker callers keep skipping nonempty addresses by default')
}

function createPageState(component) {
  const state = component.data()
  state.$refs = { appConfirmDialog: { cancelAll() {} } }
  Object.assign(state, component.methods)
  state.serviceAreaId = 42
  state.selectedTypes = [7]
  state.bookingPoint = { latitude: 25.033, longitude: 121.5654 }
  state.bookingSelectionKey = 'selection'
  state.timeSlotsSelectionKey = 'selection'
  state.photoCount = 0
  state.selectedServiceArea = { id: 42, geometry: null }
  state.allowedWasteTypes = [{ id: 7 }]
  state.wasteTypes = [{ id: 7 }]
  return state
}

async function testLocalDatesAndStaleResponseIsolation() {
  const harness = createBookingHarness()
  const state = createPageState(harness.component)
  state.initDates()
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  assert.equal(state.dateValues.today, formatBookingDate(today), 'today uses the local calendar date')
  assert.equal(state.dateValues.tomorrow, formatBookingDate(tomorrow), 'tomorrow uses local calendar rollover')

  const oldRequest = state.loadTimeSlots()
  const oldDate = harness.requests[0].date
  state.selectDate('tomorrow')
  const latestRequest = harness.requests[1]
  assert.equal(latestRequest.date, state.dateValues.tomorrow)
  harness.requests[0].resolve([{ slot: 'old response', available: true }])
  await oldRequest
  assert.equal(state.timeSlotsLoading, true, 'an outdated response cannot end the current loading state')
  assert.equal(state.timeSlots.length, 0, 'an outdated response cannot populate another date')
  latestRequest.resolve([{ slot: '10:00-11:00', available: true }])
  await latestRequest.promise
  await Promise.resolve()
  assert.equal(state.timeSlotsDate, state.dateValues.tomorrow)
  assert.equal(state.timeSlots[0].time, '10:00-11:00')
  assert.equal(state.timeSlotsLoading, false)
  assert.notEqual(oldDate, latestRequest.date)
}

async function testSlotPrerequisitesAreHints() {
  const harness = createBookingHarness()
  const state = createPageState(harness.component)
  state.initDates()
  state.selectedTypes = []
  await state.loadTimeSlots()
  assert.match(state.timeSlotsHint, /选择回收物品/)
  assert.equal(state.timeSlotsError, '', 'missing item selection is not a request error')
  assert.equal(harness.requests.length, 0, 'missing prerequisites do not issue a request')
  assert.equal(state.validateBookingForm(), false)
  assert.equal(harness.toasts.at(-1).title, '请选择回收物品', 'submit directs the user to select items instead of retrying')

  state.serviceAreaId = null
  state.bookingPoint = null
  await state.loadTimeSlots()
  assert.match(state.timeSlotsHint, /确认上门位置/)
  assert.equal(state.timeSlotsError, '')
  state.bookingPoint = { latitude: 25.033, longitude: 121.5654 }
  await state.loadTimeSlots()
  assert.match(state.timeSlotsHint, /暂无/)
  assert.equal(state.timeSlotsError, '')

  state.serviceAreaId = 42
  state.selectedTypes = [7]
  const loading = state.loadTimeSlots()
  assert.equal(state.timeSlotsHint, '', 'selecting items clears the prerequisite hint')
  harness.requests[0].reject(new Error('network error'))
  await loading
  assert.match(state.timeSlotsError, /加载失败/, 'a failed request remains retryable')
  state.selectedTypes = []
  await state.loadTimeSlots()
  assert.equal(state.timeSlotsError, '', 'removing items clears an old network error')
  assert.match(state.timeSlotsHint, /选择回收物品/)
  state.selectTimeSlot('09:00-10:00')
  assert.equal(state.selectedTimeSlot, '', 'prerequisite hints cannot select a stale time slot')
}

async function testFailureRetryAndUnloadIsolation() {
  const harness = createBookingHarness()
  const state = createPageState(harness.component)
  state.initDates()
  const failed = state.loadTimeSlots()
  harness.requests[0].reject(new Error('temporary network error'))
  await failed
  assert.match(state.timeSlotsError, /加载失败/)
  assert.equal(state.timeSlotsLoading, false, 'failure releases the loading indicator')

  const retried = state.loadTimeSlots()
  assert.equal(state.timeSlotsError, '', 'retry clears the previous error')
  assert.equal(state.timeSlotsLoading, true)
  harness.requests[1].resolve([{ slot: '13:00-14:00', available: true }])
  await retried
  assert.equal(state.timeSlotsError, '')
  assert.equal(state.timeSlotsLoading, false)
  assert.equal(state.timeSlots[0].time, '13:00-14:00', 'retry can recover with available slots')

  const afterUnload = state.loadTimeSlots()
  const countBeforeUnload = state.timeSlots.length
  harness.component.onUnload.call(state)
  harness.requests[2].resolve([{ slot: 'stale after unload', available: true }])
  await afterUnload
  assert.equal(state.timeSlots.length, countBeforeUnload, 'unload invalidates outstanding responses')
  assert.notEqual(state.timeSlots[0]?.time, 'stale after unload')
}

async function testSubmitGuardsNotReadyAndCrossMidnight() {
  const harness = createBookingHarness()
  const state = createPageState(harness.component)
  state.initDates()
  state.selectedTypes = [1]
  state.allowedWasteTypes = [{ id: 1 }]
  state.wasteTypes = [{ id: 1 }]
  state.selectedTimeSlot = '09:00-10:00'
  state.addressRegion = ['台北市', '台北市', '大安區']
  state.addressDetail = '測試路 1 號'
  state.contactPhone = '0912345678'
  state.timeSlotsLoading = true
  state.timeSlotsDate = ''
  await state.submitBooking()
  assert.equal(harness.createBookingCalls, 0, 'submit blocks while date slots are not ready')

  const staleDate = '2000-01-01'
  state.dateValues.today = staleDate
  state.timeSlotsLoading = false
  state.timeSlotsError = ''
  state.timeSlotsDate = staleDate
  await state.submitBooking()
  assert.equal(harness.createBookingCalls, 0, 'submit blocks when midnight invalidates the selected calendar day')
  assert.equal(state.dateValues.today, formatBookingDate(new Date()), 'midnight guard refreshes the local date values')
  assert.equal(state.selectedTimeSlot, '', 'midnight guard requires choosing a fresh slot')
  assert.ok(harness.requests.length >= 1, 'midnight guard reloads slots for the refreshed date')
}

async function testReadySignalAndSplashControllers() {
  const readyModule = await import(new URL('../src/utils/app-page-ready.mjs?ux-test=1', import.meta.url))
  let calls = 0
  const unsubscribe = readyModule.onAppPageReady(() => calls++)
  readyModule.markAppPageReady()
  readyModule.markAppPageReady()
  assert.equal(calls, 1, 'a listener registered before readiness fires once')
  unsubscribe()

  const lateModule = await import(new URL('../src/utils/app-page-ready.mjs?ux-test=2', import.meta.url))
  lateModule.markAppPageReady()
  let lateCalls = 0
  const unsubscribeLate = lateModule.onAppPageReady(() => lateCalls++)
  assert.equal(lateCalls, 1, 'a listener registered after readiness fires synchronously')
  unsubscribeLate()

  const cancelledModule = await import(new URL('../src/utils/app-page-ready.mjs?ux-test=3', import.meta.url))
  let cancelledCalls = 0
  const cancel = cancelledModule.onAppPageReady(() => cancelledCalls++)
  cancel()
  cancelledModule.markAppPageReady()
  assert.equal(cancelledCalls, 0, 'unsubscribed readiness listeners do not fire')

  for (const componentPath of ['../src/App.vue', '../src/components/AppSplash.vue']) {
    const componentSource = readFileSync(new URL(componentPath, import.meta.url), 'utf8')
    const parsed = parse(componentSource, { filename: componentPath })
    assert.equal(parsed.errors.length, 0, `${componentPath} parses`)
    const script = parsed.descriptor.script.content
      .replace(/^import .*\r?\n/gm, '')
    const nativeScript = conditionalSource(script, 'APP-PLUS')
      .replace(/export default\s*/, 'this.splashComponent = ')
    const ready = await import(new URL('../src/utils/app-page-ready.mjs?ux-controller=' + encodeURIComponent(componentPath), import.meta.url))
    const clock = createTimerHarness()
    const context = {
      ...ready,
      ...clock,
      console: { log() {} },
      checkAppUpdate() {},
      $emit() {}
    }
    runInNewContext(nativeScript, context, { filename: componentPath })
    const component = context.splashComponent
    const instance = {
      ...component.data(),
      $emit(event) { this.events.push(event) },
      events: []
    }
    Object.assign(instance, component.methods)

    instance.startLoading()
    assert.deepEqual(clock.pendingDelays(), [4000], `${componentPath} waits for readiness with a four-second safety timer`)
    assert.ok(!clock.pendingDelays().some(delay => delay === 600 || delay === 1000), `${componentPath} has no old fixed wait`)
    ready.markAppPageReady()
    assert.equal(instance.appSplashFading, true, `${componentPath} starts the short fade on readiness`)
    assert.deepEqual(clock.pendingDelays(), [200], `${componentPath} releases after a 200ms fade`)
    clock.fireDelay(200)
    assert.equal(instance.showAppSplash, false)
    if (componentPath.endsWith('AppSplash.vue')) assert.deepEqual(instance.events, ['loaded'])
    ready.markAppPageReady()
    assert.equal(instance.events.length, componentPath.endsWith('AppSplash.vue') ? 1 : 0, 'completion is single-shot')

    const fallbackReady = await import(new URL('../src/utils/app-page-ready.mjs?ux-fallback=' + encodeURIComponent(componentPath), import.meta.url))
    const fallbackClock = createTimerHarness()
    const fallbackContext = { ...fallbackReady, ...fallbackClock, console: { log() {} }, checkAppUpdate() {}, $emit() {} }
    runInNewContext(nativeScript, fallbackContext, { filename: componentPath + '-fallback' })
    const fallbackComponent = fallbackContext.splashComponent
    const fallbackInstance = { ...fallbackComponent.data(), events: [], $emit(event) { this.events.push(event) } }
    Object.assign(fallbackInstance, fallbackComponent.methods)
    fallbackInstance.startLoading()
    fallbackClock.fireDelay(4000)
    assert.equal(fallbackInstance.appSplashFading, true, `${componentPath} has a four-second fallback`)
    assert.deepEqual(fallbackClock.pendingDelays(), [200])
    fallbackClock.fireDelay(200)
    assert.equal(fallbackInstance.showAppSplash, false)

    const disposeReady = await import(new URL('../src/utils/app-page-ready.mjs?ux-dispose=' + encodeURIComponent(componentPath), import.meta.url))
    const disposeClock = createTimerHarness()
    const disposeContext = { ...disposeReady, ...disposeClock, console: { log() {} }, checkAppUpdate() {}, $emit() {} }
    runInNewContext(nativeScript, disposeContext, { filename: componentPath + '-dispose' })
    const disposeComponent = disposeContext.splashComponent
    const disposedInstance = { ...disposeComponent.data(), events: [], $emit(event) { this.events.push(event) } }
    Object.assign(disposedInstance, disposeComponent.methods)
    disposedInstance.startLoading()
    disposedInstance._disposeSplash()
    assert.deepEqual(disposeClock.pendingDelays(), [], `${componentPath} clears safety/release timers on disposal`)
  }
}

function createTimerHarness() {
  let nextId = 0
  const timers = new Map()
  return {
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    pendingDelays() { return [...timers.values()].map(timer => timer.delay).sort((a, b) => a - b) },
    fireDelay(delay) {
      const found = [...timers.entries()].find(([, timer]) => timer.delay === delay)
      assert.ok(found, `expected timer for ${delay}ms`)
      timers.delete(found[0])
      found[1].callback()
    },
    clearAll() { timers.clear() }
  }
}

async function testRequestedSfcTargetsCompile() {
  const files = [
    '../src/pages/register/register.vue', '../src/pages-dark/register/register.vue',
    '../src/pages/home/home.vue', '../src/pages-dark/home/home.vue',
    '../src/components/AppOnboarding.vue', '../src/components/AppSplash.vue',
    '../src/pages-nonTheme/booking.vue', '../src/pages-nonTheme/components/shop/ShopAddressPicker.vue', '../src/App.vue',
    '../src/pages-nonTheme/settings.vue'
  ]
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    for (const target of ['H5', 'APP-PLUS', 'MP-WEIXIN']) compileSfc(source, file, target)
  }
}

await testLocalDatesAndStaleResponseIsolation()
await testSlotPrerequisitesAreHints()
await testFailureRetryAndUnloadIsolation()
await testSubmitGuardsNotReadyAndCrossMidnight()
await testCatalogRefreshOnShowAndDeduplication()
await testBookingInitialAddressLocationRecovery()
await testReadySignalAndSplashControllers()
await testRequestedSfcTargetsCompile()
console.log('booking UX, splash lifecycle, and requested SFC checks passed')
