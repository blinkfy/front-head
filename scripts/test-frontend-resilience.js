const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function readBackend(relativePath) {
  return fs.readFileSync(path.join(root, '..', 'newftx', relativePath), 'utf8')
}

async function run() {
  const requestUtils = await import(pathToFileURL(path.join(root, 'src/api/request-utils.mjs')).href)
  const databaseStatus = await import(pathToFileURL(path.join(root, 'src/api/database-status.mjs')).href)
  const pointerPosition = await import(pathToFileURL(path.join(root, 'src/utils/pointer-position.mjs')).href)
  const recognitionTask = await import(pathToFileURL(path.join(root, 'src/utils/recognition-task.mjs')).href)

  recognitionTask.clearRecognitionTask()
  const taskStates = []
  const unsubscribeRecognitionTask = recognitionTask.subscribeRecognitionTask(task => taskStates.push(task && task.status))
  const taskId = recognitionTask.beginRecognitionTask('图片处理中...')
  recognitionTask.updateRecognitionTask(taskId, 'AI识别中...')
  recognitionTask.completeRecognitionTask(taskId, { labels: [{ name: '可回收垃圾' }] })
  assert.equal(recognitionTask.getRecognitionTask().status, 'succeeded', 'completed recognition task should survive page replacement')
  assert.equal(recognitionTask.getRecognitionTask().result.labels[0].name, '可回收垃圾')
  recognitionTask.clearRecognitionTask(taskId)
  unsubscribeRecognitionTask()
  assert.deepEqual(taskStates, [null, 'pending', 'pending', 'succeeded', null], 'recognition task subscribers should observe the full lifecycle')

  const params = { device_id: 'bin 01', tag: ['a', 'b'], ignored: undefined }
  const original = JSON.parse(JSON.stringify(params))
  const queryUrl = requestUtils.appendQueryParams('/api/device/info?view=full#result', params)
  assert.equal(
    queryUrl,
    '/api/device/info?view=full&device_id=bin%2001&tag=a&tag=b#result',
    'GET params should merge with an existing query and preserve the hash'
  )
  assert.deepEqual(JSON.parse(JSON.stringify(params)), original, 'query params must not be mutated')
  assert.equal(
    requestUtils.appendQueryParams(queryUrl, { token: 'user token' }),
    '/api/device/info?view=full&device_id=bin%2001&tag=a&tag=b&token=user%20token#result',
    'auth token should remain a query parameter'
  )

  const miniProgramEvent = { currentTarget: { id: 'uni-node-without-dom-methods' }, touches: [] }
  assert.doesNotThrow(
    () => pointerPosition.updatePointerCssVariables(miniProgramEvent),
    'mini-program events without DOM geometry must be ignored safely'
  )
  assert.equal(
    pointerPosition.updatePointerCssVariables(miniProgramEvent),
    false,
    'non-DOM currentTarget should be a no-op'
  )
  const pointerStyles = new Map()
  const domPointerEvent = {
    currentTarget: {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 200 }),
      style: { setProperty: (key, value) => pointerStyles.set(key, value) }
    },
    clientX: 60,
    clientY: 120
  }
  assert.equal(pointerPosition.updatePointerCssVariables(domPointerEvent), true)
  assert.equal(pointerStyles.get('--mouse-x'), '50%')
  assert.equal(pointerStyles.get('--mouse-y'), '50%')

  const storage = new Map()
  const toasts = []
  const runtime = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showToast: options => toasts.push(options)
  }

  databaseStatus.markDatabaseOffline({
    runtime,
    now: 10000,
    source: '/api/write',
    message: '数据库暂不可用'
  })
  databaseStatus.markDatabaseOffline({
    runtime,
    now: 12000,
    source: '/api/write',
    message: '数据库暂不可用'
  })
  assert.equal(toasts.length, 1, 'repeated code-2 responses should deduplicate toasts')
  assert.equal(databaseStatus.getDatabaseStatus(runtime).offline, true)

  databaseStatus.updateDatabaseStatusFromAvailability(
    { code: 0, data: { online: true, degraded: false } },
    { runtime, source: '/api/ordinary', allowRecovery: false }
  )
  assert.equal(
    databaseStatus.getDatabaseStatus(runtime).offline,
    true,
    'an ordinary successful request must not clear the offline marker'
  )

  databaseStatus.updateDatabaseStatusFromAvailability(
    { code: 0, data: { online: true, degraded: false } },
    { runtime, source: '/api/_db_state', allowRecovery: true }
  )
  assert.equal(
    databaseStatus.getDatabaseStatus(runtime).offline,
    false,
    'a confirmed database health response should clear the offline marker'
  )

  databaseStatus.updateDatabaseStatusFromAvailability(
    { code: 2, msg: '服务已降级，数据库暂不可用' },
    { runtime, source: '/api/planning/dashboard-snapshot', notify: false }
  )
  assert.equal(
    databaseStatus.getDatabaseStatus(runtime).offline,
    true,
    'code 2 without structured database state must still mark the database offline'
  )
  assert.equal(
    databaseStatus.getDatabaseStatus(runtime).source,
    '/api/planning/dashboard-snapshot',
    'code-2 state should retain the endpoint source for diagnostics'
  )

  const requestSource = read('src/api/index.js')
  const apiConfigSource = read('src/api/config.js')
  const databaseStatusSource = read('src/api/database-status.mjs')
  const deviceSource = read('src/api/device.js')
  const dashboardSource = read('src/pages-nonTheme/collection-dashboard.vue')
  const riskWorkbenchSource = read('src/components/collection/RiskAlgorithmWorkbench.vue')
  const planningSource = read('src/pages-nonTheme/collection-planning.vue')
  const planningControllerSource = readBackend('controllers/planningController.js')
  const adminNavSource = read('src/utils/admin-page-nav.js')
  const screenHeaderSource = read('src/components/AdminScreenHeader.vue')
  const screenSwitcherSource = read('src/components/AdminScreenSwitcher.vue')
  const bookingSource = read('src/pages-nonTheme/booking.vue')
  const editProfileSource = read('src/pages-nonTheme/edit-profile.vue')
  const shopSource = read('src/pages/shop/shop.vue')
  const darkShopSource = read('src/pages-dark/shop/shop.vue')
  const webviewSource = read('src/pages-nonTheme/webview.vue')
  const homeSource = read('src/pages/home/home.vue')
  const darkHomeSource = read('src/pages-dark/home/home.vue')
  assert.match(requestSource, /requestMethod === 'GET' \? params : \{\}/)
  assert.match(apiConfigSource, /configuredBaseUrl[\s\S]*?import\.meta\.env\.VITE_API_BASE_URL/)
  assert.match(apiConfigSource, /typeof window !== 'undefined'[\s\S]*?window\.location\?\.origin/)
  assert.match(apiConfigSource, /baseUrl:\s*configuredBaseUrl \|\| browserOrigin \|\| 'https:\/\/rgqexbnzzipc\.sealosbja\.site'/)
  assert.match(requestSource, /const databaseStatusRuntime = Object\.freeze\(\{[\s\S]*?getStorageSync: key => uni\.getStorageSync\(key\)/)
  assert.match(requestSource, /setStorageSync: \(key, value\) => uni\.setStorageSync\(key, value\)/)
  assert.match(requestSource, /removeStorageSync: key => uni\.removeStorageSync\(key\)/)
  assert.match(requestSource, /showToast: options => uni\.showToast\(options\)/)
  assert.match(requestSource, /markDatabaseOffline\(\{\s*runtime: databaseStatusRuntime/)
  assert.doesNotMatch(
    databaseStatusSource,
    /typeof uni|window\.uni/,
    'database-status.mjs must use an injected runtime instead of the uncompiled H5 global uni object'
  )
  assert.match(deviceSource, /params:\s*\{\s*device_id: deviceId/)
  assert.match(dashboardSource, /DATABASE_OFFLINE_MESSAGE/)
  assert.match(dashboardSource, /const databaseStatusRuntime = Object\.freeze\(\{[\s\S]*?showToast: options => uni\.showToast\(options\)/)
  assert.match(dashboardSource, /getDatabaseStatus\(databaseStatusRuntime\)/)
  assert.match(dashboardSource, /subscribeDatabaseStatus\(\(status\) => \{[\s\S]*?\}, databaseStatusRuntime\)/)
  assert.match(dashboardSource, /allowRecovery:\s*isDatabaseHealthEndpoint\(path\)/)
  assert.match(dashboardSource, /'fault-btn'[\s\S]*?@tap="openFaultCenter"/)
  assert.doesNotMatch(dashboardSource, /@tap="openSortingCenterMonitor">分拣中心进度/)
  assert.match(dashboardSource, /'planningHorizonHours=2'/)
  assert.doesNotMatch(dashboardSource, /路线来源：/)
  assert.doesNotMatch(`${dashboardSource}\n${riskWorkbenchSource}`, /Mamba 候选|区间降级|近期区间/)
  assert.match(dashboardSource, /api\/planning\/risk-visualization/)
  assert.match(dashboardSource, /const riskHorizon = ref\(0\)/)
  assert.match(dashboardSource, /}, 4000\)/)
  assert.match(riskWorkbenchSource, /垃圾桶时空风险地图/)
  assert.match(riskWorkbenchSource, /腾讯地图真实坐标/)
  assert.match(riskWorkbenchSource, /id="risk-tencent-map"/)
  assert.match(riskWorkbenchSource, /new TMap\.MultiMarker/)
  assert.match(riskWorkbenchSource, /new TMap\.MultiPolyline/)
  assert.match(riskWorkbenchSource, /垃圾桶 \{\{ graphNodes\.length \}\}/)
  assert.match(riskWorkbenchSource, /容量预测区间/)
  assert.match(riskWorkbenchSource, /风险驱动因素/)
  assert.match(riskWorkbenchSource, /输入诊断，不代表模型注意力权重/)
  assert.match(riskWorkbenchSource, /双阈值预警状态/)
  assert.match(riskWorkbenchSource, /P10–P90/)
  assert.match(riskWorkbenchSource, /@changing="handleSlider"/)
  assert.doesNotMatch(dashboardSource, /TENCENT_ROUTE_SNAPSHOT/)
  assert.match(dashboardSource, /const DISPATCH_CASE_FALLBACKS = \[/)
  assert.match(dashboardSource, /pointCode:\s*'P005'/)
  assert.match(dashboardSource, /pointCode:\s*'P010'/)
  assert.match(dashboardSource, /pointCode:\s*'P018'/)
  assert.match(dashboardSource, /monitor\.dispatchCases\.flatMap/)
  assert.match(dashboardSource, /activeDispatchCaseId/)
  assert.match(dashboardSource, /const hasAvailableCase = monitor\.dispatchCases\.some\(item => item\.routeAvailable\)/)
  assert.doesNotMatch(
    dashboardSource,
    /路径不可用|路线规划暂不可用|腾讯路径可用|当前无可用腾讯路线|不可用案例|未启动直线动画/,
    'dispatch UI should not expose route availability diagnostics'
  )
  assert.match(dashboardSource, /<scroll-view class="task-flow" scroll-y>/)
  assert.match(dashboardSource, /\.monitor-task-panel \{ flex: 1\.08;[\s\S]*?overflow: hidden;/)
  assert.match(dashboardSource, /\.monitor-task-panel \.task-flow,[\s\S]*?height: 0;/)
  assert.match(dashboardSource, /\{\{\s*selectedSortingCenter\.name\s*\}\}/)
  assert.match(dashboardSource, /--admin-light-primary:\s*#118b67/)
  assert.match(dashboardSource, /\.card:nth-child\(odd\)[\s\S]*?#eef7f2/)
  assert.match(dashboardSource, /\.card:nth-child\(even\)[\s\S]*?#f7faf8/)
  assert.match(planningSource, />分拣中心清运规划</)
  assert.match(planningSource, />分拣中心列表</)
  assert.match(planningSource, /中山公园分拣中心/)
  assert.match(planningSource, /小西湖分拣中心/)
  assert.match(planningSource, /樱花大道分拣中心/)
  assert.match(planningSource, /view:\s*'sorting'/)
  assert.match(planningSource, /centerId:\s*center\.id/)
  assert.match(planningSource, /centerName:\s*center\.name/)
  assert.match(planningSource, /targetType:\s*'sorting_center'/)
  assert.match(planningSource, /centers:\s*selectedCenters\.map/)
  assert.match(planningSource, /onSortingCenterToggle\(center\.id,\s*\$event\)/)
  assert.doesNotMatch(planningSource, /api\/planning\/bins/)
  assert.doesNotMatch(planningSource, /降级直线/)
  assert.match(planningControllerSource, /targetType === 'sorting_center'/)
  assert.match(planningControllerSource, /bins:\s*centers/)
  assert.match(planningControllerSource, /maxStops:\s*centerCount/)
  assert.match(planningControllerSource, /centers:\s*plan\.bins/)
  assert.match(adminNavSource, /shortTitle:\s*'清运大屏'/)
  assert.doesNotMatch(adminNavSource, /entryAction:\s*'openFaultCenter'/)
  assert.doesNotMatch(adminNavSource, /entryQuery:\s*Object\.freeze\(\{\s*panel:\s*'fault'\s*\}\)/)
  assert.match(screenHeaderSource, /@screen-action="emit\('screen-action', \$event\)"/)
  assert.match(screenSwitcherSource, /emit\('screen-action', screen\.entryAction\)/)
  assert.match(screenSwitcherSource, /query:\s*\{\s*\.\.\.\(screen\?\.entryQuery \|\| \{\}\)\s*\}/)
  assert.match(
    dashboardSource,
    /\.screen \.map-stage \{[\s\S]*?isolation:\s*isolate[\s\S]*?overflow:\s*hidden/,
    'dashboard map SDK controls must stay inside the map stacking context'
  )
  assert.match(
    dashboardSource,
    /\.screen \.fault-mask \{[\s\S]*?z-index:\s*10000[\s\S]*?isolation:\s*isolate/,
    'fault drawer overlay must render above all dashboard map controls'
  )
  assert.match(
    planningSource,
    /\.layout \.map-stage \{[\s\S]*?isolation:\s*isolate/,
    'planning map SDK controls must stay inside the map stacking context'
  )
  assert.match(bookingSource, /\.map-container \{[\s\S]*?isolation:\s*isolate/)
  assert.match(editProfileSource, /\.map-container \{[\s\S]*?isolation:\s*isolate/)
  assert.match(
    dashboardSource,
    /updateDatabaseStatusFromAvailability\(json,[\s\S]*?if \(!json \|\| json\.code !== 0/,
    'dashboard requests must update the persistent database state before rejecting code 2'
  )
  assert.equal(
    (shopSource.match(/@touchmove\.passive="updatePointerPosition"/g) || []).length,
    2,
    'dynamic product cards and category tabs should use Vue-managed passive touch listeners'
  )
  assert.match(shopSource, /if \(pageDisposed\) return/)
  assert.match(shopSource, /onBeforeUnmount\(\(\) => \{\s*pageDisposed = true/)
  assert.match(shopSource, /typeof element\.getBoundingClientRect !== 'function'/)
  assert.match(shopSource, /const response = await userinfo\("false"\)\s*if \(pageDisposed\) return/)
  assert.match(shopSource, /await fetchUserPoints\(\)\s*if \(pageDisposed\) return/)
  assert.match(shopSource, /finally \{\s*if \(!pageDisposed\) loading\.value = false/)
  assert.doesNotMatch(shopSource, /addEventListener\('(?:mousemove|touchmove)',\s*\(/)
  assert.match(darkShopSource, /import \{ ref, computed, onMounted, onBeforeUnmount \} from 'vue'/)
  assert.match(darkShopSource, /onBeforeUnmount\(\(\) => \{\s*pageDisposed = true/)
  assert.match(darkShopSource, /const response = await userinfo\("false"\)\s*if \(pageDisposed\) return/)
  assert.match(darkShopSource, /await fetchUserPoints\(\)\s*if \(pageDisposed\) return/)
  assert.match(darkShopSource, /finally \{\s*if \(!pageDisposed\) loading\.value = false/)
  assert.match(darkShopSource, /finally \{\s*if \(!pageDisposed\) recommendLoading\.value = false/)
  assert.match(webviewSource, /removeEventListener\('plusready', handlePlusReady\)/)
  assert.match(webviewSource, /removeEventListener\('resize', handleWindowResize\)/)
  assert.match(webviewSource, /adjustTimers\.forEach\(timer => clearTimeout\(timer\)\)/)
  assert.match(webviewSource, /WEBVIEW_LOAD_TIMEOUT_MS = 20000/)
  assert.match(webviewSource, /@error="onLoadError"/)
  assert.match(webviewSource, /class="webview-empty webview-state-overlay"/)
  assert.match(webviewSource, /pageDisposed = true\s*clearLoadTimeout\(\)/)
  assert.match(webviewSource, /downloadTask = uni\.downloadFile\(/)
  assert.match(webviewSource, /success\(res\) \{\s*if \(pageDisposed\) return/)
  assert.match(webviewSource, /uni\.openDocument\(\{[\s\S]*?success\(\) \{\s*if \(pageDisposed\) return/)
  assert.match(webviewSource, /fail\(err\) \{\s*if \(pageDisposed\) return/)
  assert.match(webviewSource, /activeDownloadTask && typeof activeDownloadTask\.abort === 'function'/)
  assert.doesNotMatch(webviewSource, /addEventListener\('(?:plusready|resize)',\s*\(/)
  for (const source of [homeSource, darkHomeSource]) {
    assert.match(source, /subscribeRecognitionTask\(\(task\) => \{[\s\S]*?restoreRecognitionTask\(task\)/)
    assert.match(source, /onHide\(\(\) => \{\s*pageVisible = false\s*hideRecognitionLoading\(\)/)
    assert.match(source, /completeRecognitionTask\(taskId, res\)\s*if \(!pageVisible\) return/)
    assert.match(source, /hideRecognitionLoading\(\)\s*isProcessing\.value = false/)
  }

  console.log('Frontend resilience checks passed.')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
