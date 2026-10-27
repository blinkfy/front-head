import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { pathToFileURL } from 'node:url'
import { parse as parseJavaScript } from '@babel/parser'
import { compileScript, compileTemplate, parse as parseSfc } from '@vue/compiler-sfc'
import { getRecognitionRobotState } from '../src/utils/recognition-robot-state.mjs'

const apiSource = readFileSync(new URL('../src/api/recognize.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '')
  .replace(/^export /gm, '')
  .concat('\nthis.recognizeImage = recognizeImage')

function createHarness() {
  const timers = new Map()
  const pollRequests = []
  const toasts = []
  let nextTimerId = 0
  let uploadOptions = null
  let token = 'session-token'
  const context = {
    baseUrl: 'https://example.test',
    request: () => {},
    console: { error() {}, warn() {} },
    setTimeout(callback, delay) {
      const id = ++nextTimerId
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    uni: {
      getStorageSync(key) { return key === 'token' ? token : '' },
      getDeviceInfo: () => ({ platform: 'android' }),
      getAppBaseInfo: () => ({ uniPlatform: 'mp-weixin' }),
      uploadFile(options) { uploadOptions = options },
      request(options) { pollRequests.push(options) },
      showToast(options) { toasts.push(options) }
    }
  }
  runInNewContext(apiSource, context, { filename: 'recognize.js' })

  return {
    recognizeImage: context.recognizeImage,
    timers,
    pollRequests,
    toasts,
    get uploadOptions() { return uploadOptions },
    setToken(value) { token = value },
    fireNextTimer() {
      const first = timers.entries().next()
      assert.equal(first.done, false, 'expected a pending progress poll timer')
      const [id, timer] = first.value
      timers.delete(id)
      timer.callback()
      return timer
    },
    respondToLatestPoll(response) {
      const options = pollRequests[pollRequests.length - 1]
      assert.ok(options, 'expected a progress poll request')
      options.success(response)
      options.complete?.()
    }
  }
}

async function verifyPollingAndPostSettleLifecycle() {
  const harness = createHarness()
  const snapshots = []
  let postResult
  const recognition = harness.recognizeImage('/tmp/recognition.jpg', {
    onProgress: snapshot => snapshots.push(snapshot)
  })
  recognition.then(value => { postResult = value })

  assert.ok(harness.uploadOptions, 'multipart upload should start immediately')
  assert.equal(harness.uploadOptions.header.Authorization, 'session-token')
  assert.equal(harness.uploadOptions.formData.progressId.length >= 24, true)
  assert.match(harness.uploadOptions.formData.progressId, /^[A-Za-z0-9_-]+$/)

  assert.equal(harness.fireNextTimer().delay, 450)
  harness.respondToLatestPoll({ statusCode: 404, data: { code: 1 } })
  assert.equal(snapshots.length, 0, '404 means upload has not reached the controller; polling continues')
  assert.equal(harness.timers.size, 1)

  const pending = (revision, status = 'pending') => ({
    statusCode: 200,
    data: {
      code: 0,
      data: { revision, status, phase: 'advising', preview: { labels: [] } }
    }
  })
  assert.equal(harness.fireNextTimer().delay, 700)
  harness.respondToLatestPoll(pending(2))
  assert.deepEqual(snapshots.map(snapshot => snapshot.revision), [2])

  harness.fireNextTimer()
  harness.respondToLatestPoll(pending(2))
  assert.deepEqual(snapshots.map(snapshot => snapshot.revision), [2], 'duplicate revisions are ignored')

  harness.fireNextTimer()
  harness.respondToLatestPoll(pending(1))
  assert.deepEqual(snapshots.map(snapshot => snapshot.revision), [2], 'older revisions are ignored')

  harness.fireNextTimer()
  harness.respondToLatestPoll(pending(3, 'succeeded'))
  assert.deepEqual(snapshots.map(snapshot => snapshot.revision), [2, 3])
  assert.equal(harness.timers.size, 0, 'terminal progress stops polling')
  assert.equal(postResult, undefined, 'poll completion does not settle the original POST');

  harness.uploadOptions.success({ data: JSON.stringify({ code: 0, data: { labels: ['final'] } }) })
  assert.equal((await recognition).labels[0], 'final')
  assert.equal(postResult.labels[0], 'final')
  assert.equal(harness.timers.size, 0, 'POST settlement leaves no poll timer')
  assert.equal(harness.toasts.length, 0)
}

async function verifyUnauthorizedProgressDoesNotFailRecognitionPost() {
  const harness = createHarness()
  let postSettled = false
  const recognition = harness.recognizeImage('/tmp/recognition-401.jpg', {
    onProgress() { assert.fail('unauthorized progress must not be published') }
  }).then(value => {
    postSettled = true
    return value
  })

  harness.fireNextTimer()
  harness.respondToLatestPoll({ statusCode: 401, data: { code: 1 } })
  assert.equal(harness.timers.size, 0, '401 stops optional polling')
  assert.equal(postSettled, false, 'a progress authorization error does not settle the POST')

  harness.uploadOptions.success({ data: JSON.stringify({ code: 0, data: { id: 7 } }) })
  assert.equal((await recognition).id, 7)
  assert.equal(harness.toasts.length, 0)
}

async function verifyRecognitionTaskReplacementAndRecovery() {
  const task = await import(new URL('../src/utils/recognition-task.mjs', import.meta.url))
  task.clearRecognitionTask()
  const notifications = []
  const unsubscribe = task.subscribeRecognitionTask(value => notifications.push(value))

  const oldTaskId = task.beginRecognitionTask('旧任务', 'ai')
  task.updateRecognitionPreview(oldTaskId, {
    revision: 1, phase: 'recognizing', preview: { labels: [{ source_name: 'old' }] }
  })
  const currentTaskId = task.beginRecognitionTask('图片处理中...', 'yolo-ai')
  task.updateRecognitionPreview(oldTaskId, {
    revision: 99, phase: 'finalizing', preview: { labels: [{ source_name: 'stale' }] }
  })
  task.completeRecognitionTask(oldTaskId, { labels: [{ source_name: 'stale' }] })
  assert.equal(task.getRecognitionTask().id, currentTaskId)
  assert.equal(task.getRecognitionTask().status, 'pending')
  assert.equal(task.getRecognitionTask().revision, -1, 'stale task updates must not replace the current task')

  task.updateRecognitionPreview(currentTaskId, {
    revision: 3, phase: 'advising',
    preview: { aiInsights: { disposalAdvice: 'rinse' } }
  })
  task.updateRecognitionPreview(currentTaskId, {
    revision: 2, phase: 'recognizing', preview: { labels: [] }
  })
  assert.equal(task.getRecognitionTask().revision, 3, 'older preview revisions are ignored')
  assert.equal(task.getRecognitionTask().phase, 'advising')
  assert.equal(task.getRecognitionTask().preview.aiInsights.disposalAdvice, 'rinse')

  task.completeRecognitionTask(currentTaskId, { labels: [{ name: 'recyclable' }] })
  const restoredTask = task.getRecognitionTask()
  assert.equal(restoredTask.status, 'succeeded', 'the in-memory task remains readable after page replacement')
  assert.equal(restoredTask.result.labels[0].name, 'recyclable')
  task.clearRecognitionTask(oldTaskId)
  assert.equal(task.getRecognitionTask().id, currentTaskId, 'clearing a stale task must preserve the current task')
  task.clearRecognitionTask(currentTaskId)
  assert.equal(task.getRecognitionTask(), null)

  unsubscribe()
  assert.deepEqual(
    notifications.map(value => value && value.status),
    [null, 'pending', 'pending', 'pending', 'pending', 'succeeded', null]
  )
}

async function verifyRecognitionTaskIsolationAcrossAccounts() {
  const task = await import(new URL('../src/utils/recognition-task.mjs', import.meta.url))
  const originalUni = globalThis.uni
  let token = 'account-A'
  globalThis.uni = { getStorageSync: key => key === 'token' ? token : '' }
  const notices = []
  const unsubscribe = task.subscribeRecognitionTask((value, reason) => notices.push({ value, reason }))

  try {
    task.clearRecognitionTask()
    const privateSource = { filePath: '/private/account-A-photo.jpg' }
    const oldId = task.beginRecognitionTask('识别中', privateSource)
    task.updateRecognitionPreview(oldId, {
      revision: 1, phase: 'advising', preview: { aiInsights: { disposalAdvice: 'A 的私人识别结果' } }
    })
    task.failRecognitionTask(oldId, new Error('A 的识别失败'))
    assert.equal(task.getRecognitionTask().source.filePath, privateSource.filePath,
      'the same account can return to the failed task and retry its original photo')

    token = 'account-B'
    assert.equal(task.getRecognitionTask(), null,
      'account B cannot restore A\'s failed task, photo, or advice')
    assert.equal(notices.at(-1).reason, 'owner-changed',
      'the page receives an owner-change signal to clear old preview and retry controls')
    assert.equal(notices.at(-1).value, null)
    assert.equal(task.isRecognitionTaskCurrent(oldId), false)

    const newId = task.beginRecognitionTask('B 识别中', { filePath: '/private/account-B-photo.jpg' })
    task.updateRecognitionPreview(oldId, { revision: 99, preview: { labels: [{ name: 'A 的旧回调' }] } })
    task.completeRecognitionTask(oldId, { labels: [{ name: 'A 的旧结果' }] })
    task.failRecognitionTask(oldId, new Error('A 的旧失败回调'))
    assert.equal(task.getRecognitionTask().id, newId)
    assert.equal(task.getRecognitionTask().source.filePath, '/private/account-B-photo.jpg')
    assert.equal(task.getRecognitionTask().revision, -1)
    assert.equal(task.isRecognitionTaskCurrent(newId), true)

    task.updateRecognitionPreview(newId, { revision: 2, preview: { labels: [{ name: 'B 的结果' }] } })
    assert.equal(task.getRecognitionTask().preview.labels[0].name, 'B 的结果',
      'same-account page recovery still receives its own in-progress preview')
  } finally {
    unsubscribe()
    task.clearRecognitionTask()
    if (originalUni === undefined) delete globalThis.uni
    else globalThis.uni = originalUni
  }
}

function visitAst(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) visitAst(item, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'comments' || key === 'tokens') continue
    if (value && typeof value === 'object') visitAst(value, visit)
  }
}

function compileAndExtractHomeFunctions(relativePath) {
  const filename = new URL(relativePath, import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: filename.pathname })
  assert.equal(errors.length, 0, relativePath + ' SFC parsing')
  assert.ok(descriptor.scriptSetup, relativePath + ' script setup is required')
  compileScript(descriptor, { id: relativePath })
  const compiledTemplate = compileTemplate({
    source: descriptor.template.content,
    filename: filename.pathname,
    id: relativePath
  })
  assert.equal(compiledTemplate.errors.length, 0, relativePath + ' template compilation')

  const script = descriptor.scriptSetup.content
  const ast = parseJavaScript(script, { sourceType: 'module' })
  let processImageNode = null
  let onShowCallbackNode = null
  let handleRecognitionProgressNode = null
  let restoreRecognitionTaskNode = null
  visitAst(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'processImage') {
      processImageNode = node
    }
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'handleRecognitionProgress') {
      handleRecognitionProgressNode = node
    }
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'restoreRecognitionTask') {
      restoreRecognitionTaskNode = node
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' &&
        node.callee.name === 'onShow' && node.arguments[0]?.type === 'ArrowFunctionExpression') {
      onShowCallbackNode = node.arguments[0]
    }
  })
  assert.ok(processImageNode, relativePath + ' processImage function is required')
  assert.ok(handleRecognitionProgressNode, relativePath + ' handleRecognitionProgress function is required')
  assert.ok(restoreRecognitionTaskNode, relativePath + ' restoreRecognitionTask function is required')
  assert.ok(onShowCallbackNode, relativePath + ' onShow callback is required')
  return {
    processImage: script.slice(processImageNode.start, processImageNode.end),
    handleRecognitionProgress: script.slice(handleRecognitionProgressNode.start, handleRecognitionProgressNode.end),
    restoreRecognitionTask: script.slice(restoreRecognitionTaskNode.start, restoreRecognitionTaskNode.end),
    onShow: script.slice(onShowCallbackNode.start, onShowCallbackNode.end)
  }
}

function ref(value) {
  return { value }
}

async function waitForPredicate(predicate, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for ' + label)
    await new Promise(resolve => setImmediate(resolve))
  }
}

function makeProcessImageContext(task, functions, options = {}) {
  const requestCalls = []
  let compressionStarted = false
  const refs = {
    failedPreviewPending: ref(false),
    retryImagePath: ref(''),
    retryImageFile: ref(null),
    recognitionPreview: ref(null),
    classificationUi: ref(''),
    robotFeedbackActive: ref(false),
    robotState: ref(''),
    resultImage: ref(''),
    isProcessing: ref(false),
    processStatus: ref(''),
    resultCategory: ref(''),
    targetConfidence: ref(0),
    resultConfidence: ref(''),
    resultDesc: ref(''),
    aiEnabled: ref(false),
    isH5Platform: ref(false)
  }
  const imageResult = options.result || {
    labels: [{ class: 2, name: '可回收垃圾', confidence: 0.9, describe: 'Rinse first' }],
    result_img_base64: 'data:image/jpeg;base64,verification-image',
    aiSettings: { aiEnabled: true }
  }
  const context = {
    ...refs,
    activeRecognitionTaskId: '',
    // Audio is orthogonal to these lifecycle assertions; keep the new side effect inert in this VM.
    playUiSound() {},
    pendingUpcyclingSound: '',
    pageVisible: true,
    compressionConfig: {
      h5: { quality: 0.8, maxWidth: 1920 },
      miniProgram: { quality: 0.8, maxSize: 1024 }
    },
    beginRecognitionTask: task.beginRecognitionTask,
    clearRecognitionTask: task.clearRecognitionTask,
    completeRecognitionTask: task.completeRecognitionTask,
    failRecognitionTask: task.failRecognitionTask,
    getRecognitionTask: task.getRecognitionTask,
    isRecognitionTaskCurrent: task.isRecognitionTaskCurrent,
    updateRecognitionTask: task.updateRecognitionTask,
    updateRecognitionPreview: task.updateRecognitionPreview,
    getRecognitionRobotState,
    startElapsedClock() {},
    stopElapsedClock() {},
    resetEnhancedRecognition() {},
    applyRecognitionResult() {},
    getRecognitionImageSize: async filePath => filePath.includes('compressed')
      ? (options.compressedSize ?? 100)
      : (options.originalSize ?? 100000),
    getRecognitionCompressionDecision: async () => options.compressionDecision ||
      { shouldCompress: false, needsJpegConversion: false },
    compressImage: async () => { throw new Error('unexpected H5 compression'); },
    compressImageMiniProgram: async (...args) => {
      compressionStarted = true
      return options.compressImageMiniProgram
        ? options.compressImageMiniProgram(...args)
        : '/tmp/compressed.jpg'
    },
    shouldUseCompressedRecognitionImage: () => true,
    isSmallerRecognitionImage: () => true,
    recognizeImage: (file, callbacks) => {
      requestCalls.push({ file, callbacks })
      return options.recognitionPromise || Promise.resolve(imageResult)
    },
    applyEnhancedRecognitionData() {},
    animateNumber() {},
    setTimeout() { return 1 },
    uni: options.uni || { showToast() {}, redirectTo() {} },
    console: { warn() {}, error() {}, log() {} }
  }
  runInNewContext(
    'this.processImage = ' + functions.processImage + '\n' +
      'this.handleRecognitionProgress = ' + functions.handleRecognitionProgress + '\n' +
      'this.restoreRecognitionTask = ' + functions.restoreRecognitionTask,
    context,
    { filename: 'extracted-processImage.js' }
  )
  return {
    context,
    requestCalls,
    isCompressionStarted: () => compressionStarted,
    imageResult
  }
}

function makeOnShowContext(task, functions, { pendingImage, processImage } = {}) {
  const timers = []
  const removedKeys = []
  const runtime = {
    getStorageSync(key) {
      return key === 'pending_recognize_image' ? pendingImage : ''
    },
    removeStorageSync(key) { removedKeys.push(key) },
    showToast() {}
  }
  const context = {
    pageVisible: false,
    robotPageActive: ref(false),
    isProcessing: ref(false),
    getRecognitionTask: task.getRecognitionTask,
    updateHomeAdaptiveStyle() {},
    refreshAiServiceState() {},
    restoreRecognitionTask() {},
    // The extracted lifecycle callback normally closes over the composable result.
    // Keep that unrelated dependency inert in this isolated onShow harness.
    queueRefreshDisplayBboxes() {},
    uni: runtime,
    nextTick(callback) { callback() },
    setTimeout(callback, delay) {
      timers.push({ callback, delay })
      return timers.length
    },
    processImage: processImage || (() => Promise.resolve()),
    console: { warn() {} }
  }
  runInNewContext(
    'this.onShowHandler = ' + functions.onShow,
    context,
    { filename: 'extracted-onShow.js' }
  )
  return { context, timers, removedKeys }
}

async function verifyRealHomeLifecycleGuards() {
  const task = await import(new URL('../src/utils/recognition-task.mjs', import.meta.url))
  const originalUni = globalThis.uni
  const pages = [
    '../src/pages/home/home.vue',
    '../src/pages-dark/home/home.vue'
  ]

  try {
    for (const page of pages) {
      const functions = compileAndExtractHomeFunctions(page)
      const token = 'home-lifecycle-owner'
      globalThis.uni = { getStorageSync: key => key === 'token' ? token : '' }
      task.clearRecognitionTask()
      const successHarness = makeProcessImageContext(task, functions)
      await successHarness.context.processImage('/tmp/success.jpg')
      assert.equal(successHarness.requestCalls.length, 1, page + ' should send one recognition request')
      assert.equal(successHarness.context.isProcessing.value, false,
        page + ' finally must release the processing lock after success')
      assert.equal(successHarness.context.activeRecognitionTaskId, '',
        page + ' finally must reset the active task ID after success')
      assert.equal(task.getRecognitionTask(), null,
        page + ' successful result clears the completed shared task')

      globalThis.uni = { getStorageSync: key => key === 'token' ? 'compression-owner-A' : '' }
      task.clearRecognitionTask()
      let releaseCompression
      const compressionGate = new Promise(resolve => { releaseCompression = resolve })
      const compressionHarness = makeProcessImageContext(task, functions, {
        compressionDecision: { shouldCompress: true, needsJpegConversion: false },
        compressImageMiniProgram: () => compressionGate
      })
      const pendingRecognition = compressionHarness.context.processImage('/private/A-photo.jpg')
      await waitForPredicate(() => compressionHarness.isCompressionStarted(),
        page + ' image compression to start')
      globalThis.uni = { getStorageSync: key => key === 'token' ? 'compression-owner-B' : '' }
      releaseCompression('/tmp/compressed.jpg')
      await pendingRecognition
      assert.equal(compressionHarness.requestCalls.length, 0,
        page + ' must not POST account A image after switching to account B during compression')
      assert.equal(compressionHarness.context.isProcessing.value, false,
        page + ' must release the processing lock after owner change during compression')
      assert.equal(task.getRecognitionTask(), null,
        page + ' must discard the old owner task before returning')
    }

    globalThis.uni = { getStorageSync: key => key === 'token' ? 'home-return-owner' : '' }
    task.clearRecognitionTask()
    const failedTaskId = task.beginRecognitionTask('识别失败', { filePath: '/retry/failed.jpg' })
    task.failRecognitionTask(failedTaskId, new Error('verification failure'))
    const processCalls = []
    const showHarness = makeOnShowContext(task, compileAndExtractHomeFunctions(pages[0]), {
      pendingImage: '/pending/voice-selection.jpg',
      processImage: filePath => {
        processCalls.push(filePath)
        return Promise.resolve()
      }
    })
    showHarness.context.onShowHandler()
    assert.deepEqual(showHarness.removedKeys, ['pending_recognize_image'])
    assert.equal(showHarness.timers.length, 1)
    assert.equal(showHarness.timers[0].delay, 300)
    showHarness.timers[0].callback()
    await Promise.resolve()
    assert.deepEqual(processCalls, ['/pending/voice-selection.jpg'],
      'light home onShow retries a pending image when the existing task has failed')
  } finally {
    task.clearRecognitionTask()
    if (originalUni === undefined) delete globalThis.uni
    else globalThis.uni = originalUni
  }
}

async function verifyHomeRobotProgressMapping() {
  const task = await import(new URL('../src/utils/recognition-task.mjs', import.meta.url))
  const originalUni = globalThis.uni
  const pages = ['../src/pages/home/home.vue', '../src/pages-dark/home/home.vue']
  try {
    globalThis.uni = { getStorageSync: key => key === 'token' ? 'home-robot-progress-owner' : '' }
    for (const page of pages) {
      task.clearRecognitionTask()
      const taskId = task.beginRecognitionTask('图片处理中...')
      const context = makeProcessImageContext(task, compileAndExtractHomeFunctions(page)).context
      context.activeRecognitionTaskId = taskId

      context.handleRecognitionProgress(taskId, {
        revision: 1,
        phase: 'advising',
        preview: { labels: [{ name: '纸盒' }] }
      })
      assert.equal(context.robotState.value, 'reviewing',
        page + ' should show review motion when a classification is available during advising')
      assert.equal(context.recognitionPreview.value.labels[0].name, '纸盒')

      context.handleRecognitionProgress(taskId, {
        revision: 2,
        phase: 'advising',
        preview: { labels: [] }
      })
      assert.equal(context.robotState.value, 'processing',
        page + ' should keep processing motion when advising has no classification labels')
      context.handleRecognitionProgress(taskId, {
        revision: 3,
        phase: 'finalizing',
        preview: { labels: [{ name: '纸盒' }] }
      })
      assert.equal(context.robotState.value, 'reviewing',
        page + ' should also review known labels during finalizing')

      context.restoreRecognitionTask()
      assert.equal(context.robotState.value, 'reviewing',
        page + ' should restore the reviewing state after page replacement')
      task.completeRecognitionTask(taskId, { labels: [{ name: '纸盒' }] })
      context.restoreRecognitionTask()
      assert.equal(context.robotState.value, 'success', page + ' should switch to the success state on completion')
      assert.equal(context.recognitionPreview.value, null, page + ' should clear preview data on completion')
      assert.equal(task.getRecognitionTask(), null, page + ' should clear the completed shared task')
    }
  } finally {
    task.clearRecognitionTask()
    if (originalUni === undefined) delete globalThis.uni
    else globalThis.uni = originalUni
  }
}

async function verifyYoloCompletionSurvivesSubscriberClear() {
  const task = await import(new URL('../src/utils/recognition-task.mjs', import.meta.url))
  const originalUni = globalThis.uni
  const pages = [
    '../src/pages/home/home.vue',
    '../src/pages-dark/home/home.vue'
  ]
  const resultImage = 'data:image/png;base64,yolo-result-image'
  const result = {
    labels: [
      { class: 2, name: '可回收垃圾', confidence: 0.9, describe: '冲洗后回收' },
      { class: 4, name: '厨余垃圾', confidence: 0.8, describe: '沥干后投放' }
    ],
    result_img_base64: resultImage,
    aiSettings: { aiEnabled: false }
  }

  try {
    globalThis.uni = { getStorageSync: key => key === 'token' ? 'yolo-completion-owner' : '' }
    for (const page of pages) {
      task.clearRecognitionTask()
      const unsubscribe = task.subscribeRecognitionTask(value => {
        if (value?.status === 'succeeded') task.clearRecognitionTask(value.id)
      })
      try {
        const harness = makeProcessImageContext(task, compileAndExtractHomeFunctions(page), { result })
        await harness.context.processImage('/tmp/yolo-result.png')

        assert.equal(harness.context.classificationUi.value, 'complete',
          page + ' should finish its local result UI when another page clears the succeeded task')
        assert.equal(harness.context.resultCategory.value, '可回收垃圾',
          page + ' should apply the first YOLO label after a subscriber clears the shared task')
        assert.equal(harness.context.resultDesc.value, '冲洗后回收',
          page + ' should apply the first YOLO description after a subscriber clears the shared task')
        assert.equal(harness.context.resultImage.value, resultImage,
          page + ' should preserve a PNG data URL without adding a JPEG prefix')
        assert.equal(harness.context.aiEnabled.value, false,
          page + ' should keep AI disabled for a pure YOLO result')
        assert.equal(harness.context.isProcessing.value, false,
          page + ' should release its processing lock after completion')
        assert.equal(harness.context.activeRecognitionTaskId, '',
          page + ' finally should clear the local active task ID')
      } finally {
        unsubscribe()
      }
    }
  } finally {
    task.clearRecognitionTask()
    if (originalUni === undefined) delete globalThis.uni
    else globalThis.uni = originalUni
  }
}

await verifyPollingAndPostSettleLifecycle()
await verifyUnauthorizedProgressDoesNotFailRecognitionPost()
await verifyRecognitionTaskReplacementAndRecovery()
await verifyRecognitionTaskIsolationAcrossAccounts()
await verifyRealHomeLifecycleGuards()
await verifyHomeRobotProgressMapping()
await verifyYoloCompletionSurvivesSubscriberClear()
console.log('recognition progress frontend tests passed')
