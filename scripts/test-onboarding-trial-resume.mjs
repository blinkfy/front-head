import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse as parseSfc } from '@vue/compiler-sfc'

function visit(node, callback) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const child of node) visit(child, callback); return }
  if (typeof node.type === 'string') callback(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'comments' || key === 'tokens') continue
    if (value && typeof value === 'object') visit(value, callback)
  }
}

function readSetup(path) {
  const filename = new URL(path, import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: filename.pathname })
  assert.equal(errors.length, 0, `${path} SFC parses`)
  const script = descriptor.scriptSetup.content
  return { script, ast: parseJavaScript(script, { sourceType: 'module' }) }
}

function declaration(script, ast, name) {
  let source = null
  visit(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === name) {
      let parent = null
      // Variable declarators are sliced from their enclosing declaration by locating the statement.
      const findStatement = current => {
        if (!current || typeof current !== 'object') return
        if (Array.isArray(current)) { for (const child of current) findStatement(child); return }
        if (current.type === 'VariableDeclaration' && current.declarations.includes(node)) parent = current
        for (const [key, value] of Object.entries(current)) {
          if (key === 'loc' || key === 'comments' || key === 'tokens') continue
          if (value && typeof value === 'object') findStatement(value)
        }
      }
      findStatement(ast)
      if (parent) source = script.slice(parent.start, parent.end)
    }
  })
  assert.ok(source, `production declaration ${name} exists`)
  return source
}

function functionSource(script, ast, name) {
  let found = null
  visit(ast, node => { if (node.type === 'FunctionDeclaration' && node.id?.name === name) found = node })
  assert.ok(found, `production function ${name} exists`)
  return script.slice(found.start, found.end)
}

function findWatch(ast, script, predicate, label) {
  let found = null
  visit(ast, node => {
    if (node.type === 'CallExpression' && node.callee?.name === 'watch' && predicate(node.arguments?.[0])) {
      found = node.arguments[1]
    }
  })
  assert.ok(found, `${label} watcher exists`)
  return script.slice(found.start, found.end)
}

function createClock() {
  let now = 0
  let nextId = 0
  const timers = new Map()
  const cancelled = []
  function setTimeout(callback, delay = 0) {
    const id = ++nextId
    timers.set(id, { id, callback, at: now + delay, delay })
    return id
  }
  function clearTimeout(id) {
    if (timers.has(id)) { cancelled.push(timers.get(id)); timers.delete(id) }
  }
  function advanceBy(duration) {
    const target = now + duration
    while (true) {
      const timer = [...timers.values()].sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!timer || timer.at > target) break
      timers.delete(timer.id)
      now = timer.at
      timer.callback()
    }
    now = target
  }
  return { timers, cancelled, setTimeout, clearTimeout, advanceBy }
}

const pages = ['../src/pages/home/home.vue', '../src/pages-dark/home/home.vue']
const trialDeclarations = ['ONBOARDING_STORAGE_KEY', 'showAppOnboarding', 'onboardingResumeStep', 'onboardingTrialState', 'onboardingTrialTimer']

function trialHarness(path, { pageVisible = true } = {}) {
  const { script, ast } = readSetup(path)
  const watchBody = findWatch(ast, script,
    node => node?.type === 'ArrayExpression' && node.elements.map(item => item?.name).join(',') === 'isProcessing,robotPageActive,onboardingTrialState',
    `${path} trial state`)
  const unmountBody = (() => {
    let body = null
    visit(ast, node => { if (node.type === 'CallExpression' && node.callee?.name === 'onBeforeUnmount') body = script.slice(node.arguments[0].start, node.arguments[0].end) })
    assert.ok(body, `${path} before-unmount cleanup exists`)
    return body
  })()
  const clock = createClock()
  const storage = new Map()
  const pickerCalls = []
  const context = {
    isProcessing: { value: false }, robotPageActive: { value: true }, pageVisible,
    onboardingFocusTracker: null, onboardingStepRequestId: 0, onboardingAutoScrolling: { value: false },
    onboardingDemoStage: { value: 'idle' }, onboardingTargetRect: { value: null },
    recognitionTaskUnsubscribe: null,
    ref: value => ({ value }), nextTick: callback => callback(), setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    uni: { setStorageSync: (key, value) => storage.set(key, value), showToast() {} },
    chooseRecognitionImage: options => pickerCalls.push(options), acceptRecognitionImage() {},
    recognitionVisual: { value: null }, robotFeedbackActive: { value: false }, robotState: { value: 'idle' },
    stopElapsedClock() {}, stopUpcyclingPoll() {}, setOnboardingScrollLock() {},
    showToast() {}, console
  }
  const code = [
    ...trialDeclarations.map(name => declaration(script, ast, name)),
    functionSource(script, ast, 'tryRecognitionFromOnboarding'),
    functionSource(script, ast, 'completeAppOnboarding'),
    functionSource(script, ast, 'hideAppOnboarding'),
    functionSource(script, ast, 'onAddImage'),
    `this.watchTrial = ${watchBody}`,
    `this.unmountHome = ${unmountBody}`,
    'this.state = { showAppOnboarding, onboardingResumeStep, onboardingTrialState, get onboardingTrialTimer() { return onboardingTrialTimer } }'
  ].join('\n')
  runInNewContext(code, context, { filename: `trial-${path}` })
  return { context, clock, storage, pickerCalls }
}

function flush(harness) {
  const { context } = harness
  context.watchTrial([context.isProcessing.value, context.robotPageActive.value, context.state.onboardingTrialState.value])
}

function startTrial(harness) {
  harness.context.tryRecognitionFromOnboarding()
  assert.equal(harness.context.state.showAppOnboarding.value, false, 'trial hides the onboarding overlay')
  assert.equal(harness.context.state.onboardingResumeStep.value, 1, 'trial remembers the second step')
  assert.equal(harness.pickerCalls.length, 1, 'trial opens the existing image picker')
  assert.equal(harness.storage.size, 0, 'starting a trial does not write completion storage')
}

function verifySuccessfulAndFailedTrial(page) {
  for (const result of ['success', 'failure']) {
    const harness = trialHarness(page)
    startTrial(harness)
    harness.context.isProcessing.value = true
    flush(harness)
    assert.equal(harness.context.state.onboardingTrialState.value, 'recognizing', `${page} ${result}: processing starts recognition state`)
    harness.context.isProcessing.value = false
    flush(harness)
    flush(harness) // Vue re-runs the watcher after its callback changes recognizing to finished.
    assert.equal(harness.context.state.onboardingTrialState.value, 'finished', `${page} ${result}: processing completion finishes the trial`)
    assert.equal([...harness.clock.timers.values()][0]?.delay, 1800, `${page} ${result}: tour resumes after 1800ms (state=${harness.context.state.onboardingTrialState.value}, active=${harness.context.robotPageActive.value}, pageVisible=${harness.context.pageVisible}, timers=${harness.clock.timers.size})`)
    harness.clock.advanceBy(1799)
    assert.equal(harness.context.state.showAppOnboarding.value, false, `${page} ${result}: tour remains hidden before delay`)
    harness.clock.advanceBy(1)
    assert.equal(harness.context.state.showAppOnboarding.value, true, `${page} ${result}: tour reopens after delay`)
    assert.equal(harness.context.state.onboardingResumeStep.value, 1, `${page} ${result}: tour resumes at step two`)
    assert.equal(harness.storage.size, 0, `${page} ${result}: trial completion does not mark onboarding completed`)
  }
}

function verifyBackgroundReturn(page) {
  const harness = trialHarness(page)
  startTrial(harness)
  harness.context.isProcessing.value = true
  flush(harness)
  harness.context.robotPageActive.value = false
  harness.context.isProcessing.value = false
  flush(harness)
  flush(harness)
  assert.equal(harness.context.state.onboardingTrialState.value, 'finished', `${page}: background completion retains the finished trial`)
  assert.equal(harness.clock.timers.size, 0, `${page}: background completion does not schedule the overlay`)
  assert.equal(harness.context.state.showAppOnboarding.value, false, `${page}: overlay stays hidden in background`)
  harness.context.pageVisible = true
  harness.context.robotPageActive.value = true
  flush(harness)
  assert.equal([...harness.clock.timers.values()][0]?.delay, 1800, `${page}: returning home schedules the resume delay`)
  harness.clock.advanceBy(1800)
  assert.equal(harness.context.state.showAppOnboarding.value, true, `${page}: returning home restores onboarding`)
}

function verifyPickerCancellation(page) {
  const harness = trialHarness(page)
  startTrial(harness)
  harness.pickerCalls[0].fail()
  flush(harness)
  assert.equal([...harness.clock.timers.values()][0]?.delay, 0, `${page}: cancelling the picker resumes immediately`)
  harness.clock.advanceBy(0)
  assert.equal(harness.context.state.onboardingResumeStep.value, 0, `${page}: picker cancellation returns to the first step`)
  assert.equal(harness.context.state.showAppOnboarding.value, true, `${page}: picker cancellation reopens onboarding`)
  assert.equal(harness.storage.size, 0, `${page}: picker cancellation does not mark onboarding completed`)
}

function verifyUnmountCleanup(page) {
  const harness = trialHarness(page)
  startTrial(harness)
  harness.context.isProcessing.value = true
  flush(harness)
  harness.context.isProcessing.value = false
  flush(harness)
  flush(harness)
  const timer = harness.context.state.onboardingTrialTimer
  assert.ok(timer, `${page}: completed trial has a pending resume timer`)
  harness.context.unmountHome()
  assert.equal(harness.clock.timers.has(timer), false, `${page}: unmount clears the resume timer`)
  assert.equal(harness.context.state.onboardingTrialState.value, 'idle', `${page}: unmount resets trial state`)
  harness.clock.advanceBy(5000)
  assert.equal(harness.context.state.showAppOnboarding.value, false, `${page}: cleared timer cannot reopen onboarding after unmount`)
}

function verifyComponentResumeStep() {
  const path = '../src/components/AppOnboarding.vue'
  const { script, ast } = readSetup(path)
  const watcher = findWatch(ast, script,
    node => node?.type === 'ArrowFunctionExpression' && node.body?.type === 'MemberExpression' && node.body.object?.name === 'props' && node.body.property?.name === 'visible',
    'AppOnboarding visible')
  const clock = createClock()
  const context = {
    props: { visible: false, active: true, initialStep: 1, includeDevice: false },
    steps: null, visibleSteps: null,
    ref: value => ({ value }), computed: getter => ({ get value() { return getter() } }),
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, nextTick: callback => callback(),
    emitStepChange() {}, startDemo() { throw new Error('initialStep 1 must skip the first-step demo') },
    leaveDemo(callback) { callback() }, setDemoStage() {}, refreshWindowSize() {},
    demoTimers: [],
  }
  const code = [
    declaration(script, ast, 'steps'),
    declaration(script, ast, 'visibleSteps'),
    'const currentIndex = ref(0); const displayedIndex = ref(0); const guideLeaving = ref(false); const cardVisible = ref(false); const visibilityTimer = ref(0)',
    `this.watchVisible = ${watcher}`,
    'this.readResume = () => ({ currentIndex: currentIndex.value, displayedIndex: displayedIndex.value, selected: visibleSteps.value[currentIndex.value] })'
  ].join('\n')
  runInNewContext(code, context, { filename: 'AppOnboarding-visible-watch.js' })
  context.props.visible = true
  context.watchVisible(true)
  const resumed = context.readResume()
  assert.equal(resumed.currentIndex, 1, 'initialStep 1 resumes at visible step index one')
  assert.equal(resumed.displayedIndex, 1, 'displayed step index follows initialStep')
  assert.equal(resumed.selected.selector, '.onboarding-target-map', 'with device excluded, visible index one is the map step')
}

for (const page of pages) {
  verifySuccessfulAndFailedTrial(page)
  verifyBackgroundReturn(page)
  verifyPickerCancellation(page)
  verifyUnmountCleanup(page)
}
verifyComponentResumeStep()
console.log('onboarding trial resume tests passed')
