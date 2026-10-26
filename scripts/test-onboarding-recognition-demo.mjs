import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseJavaScript } from '@babel/parser'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'
import { getOnboardingScrollTop, getOnboardingViewport, measureScopedRects, queryOnboardingRects, trackOnboardingFocus } from '../src/utils/onboarding-focus.mjs'

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

function readScript(relativePath) {
  const filename = new URL(relativePath, import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: filename.pathname })
  assert.equal(errors.length, 0, relativePath + ' SFC parsing')
  assert.ok(descriptor.scriptSetup, relativePath + ' script setup is required')
  return { script: descriptor.scriptSetup.content, ast: parseJavaScript(descriptor.scriptSetup.content, { sourceType: 'module' }) }
}

function findFunction(ast, name) {
  let found = null
  visitAst(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) found = node
  })
  assert.ok(found, 'expected production function ' + name)
  return found
}

function findVariable(ast, script, name) {
  let found = null
  function walk(node, parent = null) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parent)
      return
    }
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === name && parent?.type === 'VariableDeclaration') {
      found = script.slice(parent.start, parent.end)
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'comments' || key === 'tokens') continue
      if (value && typeof value === 'object') walk(value, node)
    }
  }
  walk(ast)
  assert.ok(found, 'expected production state declaration ' + name)
  return found
}

function watchedProp(node) {
  const getter = node.arguments?.[0]
  const body = getter?.type === 'ArrowFunctionExpression' ? getter.body : null
  if (body?.type !== 'MemberExpression' || body.object?.name !== 'props') return null
  return body.property?.name || body.property?.value || null
}

function extractAppLifecycle() {
  const { script, ast } = readScript('../src/components/AppOnboarding.vue')
  const callbacks = { visible: null, active: null, targetRect: null, currentIndex: null, aiEnabled: null, unmount: null }
  visitAst(ast, node => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return
    if (node.callee.name === 'watch' && watchedProp(node) in callbacks) {
      callbacks[watchedProp(node)] = node.arguments[1]
    }
    if (node.callee.name === 'watch' && node.arguments[0]?.type === 'Identifier' && node.arguments[0].name === 'currentIndex') {
      callbacks.currentIndex = node.arguments[1]
    }
    if (node.callee.name === 'onBeforeUnmount') callbacks.unmount = node.arguments[0]
  })
  for (const name of Object.keys(callbacks)) assert.ok(callbacks[name], 'expected production lifecycle callback ' + name)

  const functionNames = ['emitStepChange', 'refreshWindowSize', 'setDemoStage', 'clearDemoTimers', 'onTipImageLoad', 'scheduleIntroEnd', 'scheduleDemoStages', 'queueDemoStage', 'startDemo', 'leaveDemo', 'dismiss', 'nextStep']
  const declarations = [
    ...['currentIndex', 'displayedIndex', 'windowSize', 'guideTop', 'cardVisible', 'visibilityTimer', 'swapTimer', 'swapRequestId', 'demoStage', 'lastDemoStage', 'displayedDemoStage', 'copyVisible', 'guideLeaving', 'demoTimers', 'tip1Loaded', 'introTimer', 'exitAction', 'demoCopy', 'introDemo', 'demoBrowsing'].map(name => findVariable(ast, script, name))
  ]
  const functions = functionNames.map(name => script.slice(findFunction(ast, name).start, findFunction(ast, name).end))
  const callbackSources = Object.fromEntries(Object.entries(callbacks).map(([name, node]) => [name, script.slice(node.start, node.end)]))
  return { declarations, functions, callbackSources }
}

function createClock() {
  let now = 0
  let nextId = 0
  const timers = new Map()
  const cancelled = []
  function setTimeout(callback, delay = 0) {
    const id = ++nextId
    timers.set(id, { id, callback, delay, at: now + delay })
    return id
  }
  function clearTimeout(id) {
    const timer = timers.get(id)
    if (timer) {
      timers.delete(id)
      cancelled.push(timer)
    }
  }
  function nextTimer() {
    return [...timers.values()].sort((a, b) => a.at - b.at || a.id - b.id)[0]
  }
  function runNext() {
    const timer = nextTimer()
    assert.ok(timer, 'expected a pending timer')
    timers.delete(timer.id)
    now = Math.max(now, timer.at)
    timer.callback()
    return timer
  }
  function advanceBy(duration) {
    const target = now + duration
    while (nextTimer() && nextTimer().at <= target) runNext()
    now = target
  }
  return { timers, cancelled, setTimeout, clearTimeout, runNext, advanceBy, get now() { return now } }
}

function verifyOnboardingViewportAndScrollMath() {
  const names = ['uni', 'window']
  const saved = new Map(names.map(name => [name, { present: Object.prototype.hasOwnProperty.call(globalThis, name), value: globalThis[name] }]))
  try {
    globalThis.uni = {
      getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, statusBarHeight: 20, safeAreaInsets: { top: 28, bottom: 10 } }),
      getMenuButtonBoundingClientRect: () => ({ top: 40, bottom: 72, height: 32 })
    }
    delete globalThis.window
    assert.deepEqual(getOnboardingViewport(), { width: 390, height: 844, guideTop: 88, bottom: 784 }, 'viewport includes safe top, capsule clearance, and minimum bottom inset')
    globalThis.uni.getMenuButtonBoundingClientRect = () => ({ height: 32 })
    assert.equal(getOnboardingViewport().guideTop, 48, 'capsule without a finite bottom falls back to the safe top')

    const viewport = { height: 844, guideTop: 88, bottom: 784 }
    const rect = (top, height) => ({ top, bottom: top + height, height })
    assert.equal(getOnboardingScrollTop(rect(180, 200), 50, viewport, 124, true), 106, 'a readable demo target still aligns to the fixed guide anchor')
    assert.equal(getOnboardingScrollTop(rect(124, 200), 50, viewport, 124, true), 50, 'an already aligned demo target does not move')
    assert.equal(getOnboardingScrollTop(rect(60, 100), 50, viewport, 124, true), 0, 'demo alignment clamps at the document top')
    assert.equal(getOnboardingScrollTop(rect(100, 100), 0, viewport, 132, false), 0, 'ordinary target scroll remains clamped at the document top')
    assert.ok(Math.abs(getOnboardingScrollTop(rect(500, 100), 0, viewport, 132, false) - 213.04) < 1e-9, 'ordinary target keeps its 34 percent viewport alignment')
  } finally {
    for (const name of names) {
      const value = saved.get(name)
      if (value.present) globalThis[name] = value.value
      else delete globalThis[name]
    }
  }
}

function verifyDemoPhotoPanelTemplate() {
  const filename = new URL('../src/components/OnboardingRecognitionDemo.vue', import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: filename.pathname })
  assert.equal(errors.length, 0, 'demo component SFC parses before inspecting its photo panel')
  const ast = parseTemplate(descriptor.template.content)
  const classNames = node => node?.props?.filter(prop => prop.type === 6 && prop.name === 'class').map(prop => prop.value?.content || '').flatMap(value => value.split(/\s+/)) || []
  const stack = [...ast.children]
  let photoPanel = null
  let photoFrame = null
  let photo = null
  while (stack.length) {
    const node = stack.pop()
    if (node.type === 1) {
      const classes = classNames(node)
      if (classes.includes('onboarding-demo-photo')) photoPanel = node
      if (classes.includes('demo-photo-frame')) photoFrame = node
      if (classes.includes('demo-photo')) photo = node
      stack.push(...(node.children || []))
    }
  }
  assert.ok(photoPanel && photoFrame && photo, 'demo photo panel, frame, and image container are present')
  const containsClass = (node, name) => classNames(node).includes(name) || (node.children || []).some(child => child.type === 1 && containsClass(child, name))
  assert.ok(containsClass(photoPanel, 'demo-heading'), 'the highlighted photo panel includes its heading')
  assert.ok(containsClass(photoPanel, 'demo-photo-frame') && containsClass(photoPanel, 'demo-photo'), 'the highlighted panel contains the framed photo')
  assert.ok(containsClass(photoFrame, 'demo-photo'), 'the image remains inside the 4:3 photo frame')
  assert.ok(descriptor.styles.some(style => /\.demo-photo,\s*\.demo-after-photo\s*\{[^}]*height:\s*0;[^}]*padding-bottom:\s*75%/s.test(style.content)), 'demo image sizing remains 4:3')
}

function verifyDemoTrailingSpaceGuards() {
  const relativePath = '../src/components/OnboardingRecognitionDemo.vue'
  const { script, ast } = readScript(relativePath)
  const watchStage = (() => {
    let found = null
    visitAst(ast, node => {
      if (node.type !== 'CallExpression' || node.callee?.name !== 'watch') return
      const getter = node.arguments[0]
      if (getter?.type === 'ArrowFunctionExpression' && getter.body?.type === 'MemberExpression' && getter.body.object?.name === 'props' && (getter.body.property?.name || getter.body.property?.value) === 'stage') found = node.arguments[1]
    })
    return found
  })()
  assert.ok(watchStage, 'demo stage watcher exists')
  const watcherSource = script.slice(watchStage.start, watchStage.end)
  const watcherContext = { ref: value => ({ value }) }
  runInNewContext(`${findVariable(ast, script, 'stageLevels')}\n${findVariable(ast, script, 'lastContentLevel')}\n${findVariable(ast, script, 'activeSectionHeight')}\nthis.stageLevels = stageLevels\nthis.lastContentLevel = lastContentLevel\nthis.activeSectionHeight = activeSectionHeight\nthis.stageChanged = ${watcherSource}`, watcherContext)
  watcherContext.activeSectionHeight.value = 246
  watcherContext.stageChanged('advice')
  assert.equal(watcherContext.activeSectionHeight.value, 0, 'entering an effective section clears its previous measured height')
  watcherContext.activeSectionHeight.value = 246
  watcherContext.stageChanged('exiting')
  assert.equal(watcherContext.activeSectionHeight.value, 246, 'exiting preserves the active section height')

  const contentLevel = findVariable(ast, script, 'contentLevel')
  const contentContext = {
    props: { stage: 'exiting', aiEnabled: false },
    lastContentLevel: { value: 4 },
    computed: getter => ({ get value() { return getter() } })
  }
  runInNewContext(`${contentLevel}\nthis.contentLevel = contentLevel`, contentContext)
  assert.equal(contentContext.contentLevel.value, 2, 'AI-disabled exit clamps retained upcycling content to classification')
  contentContext.props.aiEnabled = true
  assert.equal(contentContext.contentLevel.value, 4, 'AI-enabled exit retains the full upcycling content level')

  const measureSource = script.slice(findFunction(ast, 'measureRects').start, findFunction(ast, 'measureRects').end)
  function runMeasureCase({ requestStage = 'classified', currentStage = requestStage, requestId = 3, currentId = requestId, active = true } = {}) {
    let finishMeasurement
    const context = {
      props: { stage: requestStage, active },
      layoutRequestId: requestId,
      activeSectionHeight: { value: 0 },
      componentScope: {},
      measureScopedRects: (_scope, _selectors, callback) => { finishMeasurement = callback }
    }
    runInNewContext(`${measureSource}\nthis.runMeasure = measureRects`, context)
    context.runMeasure(['.onboarding-demo-summary'], () => {})
    context.props.stage = currentStage
    context.layoutRequestId = currentId
    context.props.active = active
    finishMeasurement([{ height: 246 }])
    return context.activeSectionHeight.value
  }
  assert.equal(runMeasureCase({ currentStage: 'advice' }), 0, 'measurement callback from a previous stage cannot replace the height')
  assert.equal(runMeasureCase({ currentId: 4 }), 0, 'measurement callback from an old layout request cannot replace the height')
  assert.equal(runMeasureCase({ active: false }), 0, 'inactive demo ignores a late section measurement')
  assert.equal(runMeasureCase(), 246, 'current active stage records its measured section height')

  const filename = new URL(relativePath, import.meta.url)
  const { descriptor } = parseSfc(readFileSync(filename, 'utf8'), { filename: filename.pathname })
  const sourceLines = script.split('\n')
  assert.ok(sourceLines.some(line => line.includes('Math.ceil(demoViewport.value.height - props.focusInset - activeSectionHeight.value)')), 'bottom space uses viewport height, focus inset, and measured active-section height')
  const layout = parseTemplate(descriptor.template.content).children.find(node => node.type === 1 && classNamesForTemplateNode(node).includes('onboarding-demo-layout'))
  assert.ok(layout, 'temporary demo wrapper exists')
  const trailingSpacer = layout.children.filter(node => node.type === 1).at(-1)
  assert.ok(trailingSpacer?.props?.some(prop => prop.type === 7 && prop.name === 'bind' && prop.arg?.content === 'style' && prop.exp?.content.includes('demoBottomSpace')), 'bottom space is attached to the temporary wrapper trailing spacer')
  assert.ok(!classNamesForTemplateNode(trailingSpacer).includes('onboarding-demo-summary'), 'trailing space stays outside the measured section target')
}

function classNamesForTemplateNode(node) {
  return node?.props?.filter(prop => prop.type === 6 && prop.name === 'class').map(prop => prop.value?.content || '').flatMap(value => value.split(/\s+/)) || []
}

function makeAppHarness({ aiEnabled = true } = {}) {
  const lifecycle = extractAppLifecycle()
  const clock = createClock()
  const emitted = []
  const context = {
    props: { visible: true, active: true, includeDevice: true, targetRect: null, aiEnabled },
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter() } }),
    nextTick: callback => callback(),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    emit: (...args) => emitted.push(args),
    uni: { getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }) },
    getOnboardingViewport: () => withGlobalUni(context.uni, getOnboardingViewport),
    currentStep: { value: { selector: '.onboarding-target-scan' } },
    isLastStep: { value: false }
  }
  const program = [...lifecycle.declarations, ...lifecycle.functions,
    `this.demoState = { currentIndex, displayedIndex, windowSize, guideTop, cardVisible, visibilityTimer, swapTimer, swapRequestId, demoStage, lastDemoStage, displayedDemoStage, copyVisible, guideLeaving, demoTimers, demoCopy, introDemo, demoBrowsing }`,
    `this.demoMethods = { emitStepChange, refreshWindowSize, setDemoStage, clearDemoTimers, onTipImageLoad, scheduleIntroEnd, scheduleDemoStages, queueDemoStage, startDemo, leaveDemo, dismiss, nextStep }`,
    `this.demoWatchers = { visible: ${lifecycle.callbackSources.visible}, active: ${lifecycle.callbackSources.active}, targetRect: ${lifecycle.callbackSources.targetRect}, currentIndex: ${lifecycle.callbackSources.currentIndex}, aiEnabled: ${lifecycle.callbackSources.aiEnabled}, unmount: ${lifecycle.callbackSources.unmount} }`
  ].join('\n')
  runInNewContext(program, context, { filename: 'AppOnboarding-lifecycle.js' })
  return { ...clock, context, emitted, state: context.demoState, methods: context.demoMethods, watchers: context.demoWatchers }
}

function verifyTargetRectVisibilityDebounce() {
  const harness = makeAppHarness()
  const rects = [
    { left: 10, top: 180, right: 140, bottom: 300, width: 130, height: 120 },
    { left: 12, top: 184, right: 142, bottom: 304, width: 130, height: 120 },
    { left: 14, top: 188, right: 144, bottom: 308, width: 130, height: 120 }
  ]
  harness.watchers.targetRect(rects[0])
  const firstTimer = harness.state.visibilityTimer.value
  assert.ok(firstTimer, 'a valid target schedules the initial 16ms reveal')
  harness.advanceBy(8)
  harness.watchers.targetRect(rects[1])
  assert.equal(harness.state.cardVisible.value, false, 'the guide remains hidden before the reveal delay')
  assert.equal(harness.state.visibilityTimer.value, firstTimer, 'an 8ms rect update does not restart the reveal timer')
  harness.advanceBy(8)
  harness.watchers.targetRect(rects[2])
  assert.equal(harness.state.cardVisible.value, true, 'continuous 8ms rect updates still reveal the guide after 16ms')
  assert.equal(harness.state.visibilityTimer.value, 0, 'the reveal timer clears after becoming visible')
  harness.advanceBy(24)
  harness.watchers.targetRect(rects[2])
  assert.equal(harness.state.cardVisible.value, true, 'later rect updates keep the guide visible')
  assert.equal(harness.state.visibilityTimer.value, 0, 'visible guide does not enqueue redundant reveal timers')
}

function verifyCardContentReadinessGate() {
  const filename = new URL('../src/components/AppOnboarding.vue', import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: filename.pathname })
  assert.equal(errors.length, 0, 'AppOnboarding SFC parses before inspecting its template gate')
  const ast = parseTemplate(descriptor.template.content)
  const stack = [...ast.children]
  let cardNode = null
  while (stack.length) {
    const node = stack.pop()
    if (node.type === 1) {
      const classAttr = node.props.find(prop => prop.type === 6 && prop.name === 'class')
      if (node.tag === 'view' && classAttr?.value?.content === 'tour-card') cardNode = node
      stack.push(...(node.children || []))
    }
  }
  assert.ok(cardNode, 'expected the onboarding tour card template node')
  const classBinding = cardNode.props.find(prop => prop.type === 7 && prop.name === 'bind' && prop.arg?.content === 'class')
  const expression = classBinding?.exp?.content || ''
  assert.ok(expression.includes('cardVisible && !guideLeaving'), 'tour card visibility still respects its exit state')
  assert.ok(expression.includes('displayedIndex === currentIndex'), 'tour card remains hidden until the new step content is ready')
}

function stageEvents(harness) {
  return harness.emitted.filter(([name]) => name === 'demo-stage').map(([, stage]) => stage)
}

function advanceToStage(harness, stage) {
  while (harness.state.demoStage.value !== stage) {
    assert.ok(harness.timers.size > 0, 'demo should have a pending timer before reaching stage ' + stage)
    harness.runNext()
  }
}

function callbacksScheduledSince(harness, existingTimerIds) {
  return [...harness.timers.values()]
    .filter(timer => !existingTimerIds.has(timer.id))
    .map(timer => timer.callback)
}

function flushCopyForStage(harness, stage) {
  if (harness.state.displayedDemoStage.value !== stage) harness.advanceBy(120)
  assert.equal(harness.state.displayedDemoStage.value, stage, stage + ' copy is displayed after its crossfade')
  assert.equal(harness.state.copyVisible.value, true, stage + ' copy is visible after its crossfade')
}

function verifyAutomaticDemoSequence() {
  const harness = makeAppHarness({ aiEnabled: true })
  harness.watchers.visible(true)
  assert.equal(harness.state.demoStage.value, 'intro', 'opening onboarding automatically starts the intro')
  const expectedStages = ['intro', 'scan', 'classified', 'advice', 'upcycling']

  harness.advanceBy(1000)
  harness.methods.onTipImageLoad({ tipImage: 'tip1.webp' })
  assert.equal(harness.state.demoStage.value, 'intro', 'image load gives the intro its reading time')
  harness.advanceBy(2599)
  assert.equal(harness.state.demoStage.value, 'intro', 'loaded intro stays visible for 2.6 seconds')
  harness.advanceBy(1)
  assert.equal(harness.state.demoStage.value, 'scan')
  harness.advanceBy(1999)
  assert.equal(harness.state.demoStage.value, 'scan')
  harness.advanceBy(1)
  assert.equal(harness.state.demoStage.value, 'classified', 'classification follows scan after two seconds')
  harness.advanceBy(2499)
  assert.equal(harness.state.demoStage.value, 'classified')
  harness.advanceBy(1)
  assert.equal(harness.state.demoStage.value, 'advice', 'advice follows classification at the scheduled time')
  harness.advanceBy(3499)
  assert.equal(harness.state.demoStage.value, 'advice')
  harness.advanceBy(1)
  assert.equal(harness.state.demoStage.value, 'upcycling', 'upcycling is the final demo stage')
  assert.deepEqual(stageEvents(harness), expectedStages, 'the real production timers should play every demo stage in order')
  harness.advanceBy(20000)
  assert.equal(harness.state.demoStage.value, 'upcycling', 'the final stage remains visible')
  assert.equal(harness.state.demoTimers.size, 0, 'the demo has no timer after reaching its final stage')
}

function verifyAiDisabledAndLiveSettingsChanges() {
  const disabled = makeAppHarness({ aiEnabled: false })
  disabled.methods.startDemo()
  advanceToStage(disabled, 'scan')
  disabled.advanceBy(2000)
  assert.equal(disabled.state.demoStage.value, 'classified', 'AI-disabled demo proceeds from scan to classification')
  disabled.advanceBy(20000)
  assert.equal(disabled.state.demoStage.value, 'classified', 'AI-disabled demo stops after classification')
  assert.deepEqual(stageEvents(disabled), ['intro', 'scan', 'classified'], 'AI-disabled demo skips advice and upcycling')
  assert.equal(disabled.state.demoTimers.size, 0, 'AI-disabled terminal stage leaves no timers')

  for (const stage of ['scan', 'classified']) {
    const harness = makeAppHarness({ aiEnabled: true })
    harness.methods.startDemo()
    advanceToStage(harness, stage)
    const pendingBeforeChange = new Set(harness.state.demoTimers)
    harness.context.props.aiEnabled = false
    harness.watchers.aiEnabled()
    assert.equal(harness.state.demoStage.value, stage, 'disabling AI during ' + stage + ' preserves the current stage')
    for (const timer of pendingBeforeChange) assert.ok(harness.cancelled.some(item => item.id === timer), 'AI setting change cancels old stage timers')
    harness.advanceBy(20000)
    assert.equal(harness.state.demoStage.value, 'classified', 'disabled sequence terminates at classification after ' + stage)
    assert.ok(!stageEvents(harness).includes('advice') && !stageEvents(harness).includes('upcycling'), 'disabled sequence skips later AI stages')
  }

  const enabledAgain = makeAppHarness({ aiEnabled: false })
  enabledAgain.methods.startDemo()
  advanceToStage(enabledAgain, 'classified')
  enabledAgain.context.props.aiEnabled = true
  enabledAgain.watchers.aiEnabled()
  enabledAgain.advanceBy(2500)
  assert.equal(enabledAgain.state.demoStage.value, 'advice', 'enabling AI at classification resumes the full sequence')

  const disabledAtUpcycling = makeAppHarness({ aiEnabled: true })
  disabledAtUpcycling.methods.startDemo()
  advanceToStage(disabledAtUpcycling, 'upcycling')
  disabledAtUpcycling.context.props.aiEnabled = false
  disabledAtUpcycling.watchers.aiEnabled()
  assert.equal(disabledAtUpcycling.state.demoStage.value, 'classified', 'disabling AI during upcycling returns to the supported terminal stage')
  assert.equal(disabledAtUpcycling.state.demoTimers.size, 1, 'upcycling transition keeps only the terminal copy crossfade')
  disabledAtUpcycling.advanceBy(120)
  assert.equal(disabledAtUpcycling.state.demoTimers.size, 0, 'terminal copy crossfade completes without stale stage timers')
}

function verifyIntroFallbackAndLateImageLoad() {
  const fallback = makeAppHarness()
  fallback.watchers.visible(true)
  fallback.advanceBy(3999)
  assert.equal(fallback.state.demoStage.value, 'intro', 'intro fallback allows four seconds for a cold image load')
  fallback.advanceBy(1)
  assert.equal(fallback.state.demoStage.value, 'scan', 'fallback advances even if the image never reports load')
  advanceToStage(fallback, 'upcycling')
  assert.deepEqual(stageEvents(fallback), ['intro', 'scan', 'classified', 'advice', 'upcycling'])

  const loadedLate = makeAppHarness()
  loadedLate.methods.startDemo()
  advanceToStage(loadedLate, 'scan')
  loadedLate.methods.onTipImageLoad({ tipImage: 'tip1.webp' })
  assert.equal(loadedLate.state.demoStage.value, 'scan', 'a late load during scan cannot reopen the intro')
  loadedLate.advanceBy(2000)
  assert.equal(loadedLate.state.demoStage.value, 'classified', 'the existing phase sequence continues after a late load')

  const afterExit = makeAppHarness()
  afterExit.methods.startDemo()
  afterExit.methods.dismiss()
  assert.equal(afterExit.state.demoStage.value, 'exiting')
  assert.equal(afterExit.state.guideLeaving.value, true, 'exit hides the guide before the stage changes')
  afterExit.methods.onTipImageLoad({ tipImage: 'tip1.webp' })
  assert.equal(afterExit.state.demoStage.value, 'exiting', 'a late image load during exit cannot restart the demo')
  afterExit.advanceBy(320)
  assert.equal(afterExit.state.demoStage.value, 'idle')
  afterExit.advanceBy(20000)
  assert.equal(afterExit.state.demoStage.value, 'idle', 'a late image load cannot restart the completed exit')
  assert.equal(afterExit.state.demoTimers.size, 0)
}

function verifyReplayDoesNotDuplicateTimers() {
  const harness = makeAppHarness()
  harness.methods.startDemo()
  advanceToStage(harness, 'scan')
  harness.methods.startDemo()
  assert.equal(harness.state.demoStage.value, 'intro')
  harness.advanceBy(2000)
  assert.equal(harness.state.demoStage.value, 'intro', 'cancelled timers from the first run cannot advance the replay')
  harness.advanceBy(1999)
  assert.equal(harness.state.demoStage.value, 'intro', 'replay intro remains while its fallback is pending')
  harness.advanceBy(1)
  assert.equal(harness.state.demoStage.value, 'scan')
  assert.deepEqual(stageEvents(harness), ['intro', 'scan', 'intro', 'scan'], 'replay does not retain earlier phase timers')
}

function verifyReturningToFirstStepReplaysDemo() {
  const harness = makeAppHarness()
  harness.methods.startDemo()
  advanceToStage(harness, 'upcycling')
  harness.methods.nextStep()
  harness.advanceBy(320)
  assert.equal(harness.state.currentIndex.value, 1, 'next step leaves the demo on a later onboarding step')
  harness.watchers.currentIndex()
  assert.equal(harness.state.demoStage.value, 'idle')

  harness.state.currentIndex.value = 0
  harness.watchers.currentIndex()
  assert.equal(harness.state.demoStage.value, 'intro', 'returning to the first step automatically restarts the demo')
  assert.deepEqual(stageEvents(harness).slice(-1), ['intro'])
  harness.advanceBy(3999)
  assert.equal(harness.state.demoStage.value, 'intro')
  harness.advanceBy(1)
  assert.equal(harness.state.demoStage.value, 'scan', 'returning to the first step starts one fresh demo sequence')
}

function verifyExitFromEveryStage() {
  const probe = makeAppHarness()
  const demoStages = Object.keys(probe.state.demoCopy)
  assert.deepEqual(demoStages, ['intro', 'scan', 'classified', 'advice', 'upcycling'], 'production demo copy defines the expected stage set')

  for (const stage of demoStages) {
    for (const actionName of ['dismiss', 'nextStep']) {
      const harness = makeAppHarness()
      harness.methods.startDemo()
      advanceToStage(harness, stage)
      flushCopyForStage(harness, stage)
      const initialIndex = harness.state.currentIndex.value
      const initialDismisses = harness.emitted.filter(([name]) => name === 'dismiss').length
      const oldDisplayedStage = harness.state.displayedDemoStage.value
      harness.methods[actionName]()
      assert.equal(harness.state.demoStage.value, 'exiting', stage + ' ' + actionName + ' enters exiting')
      assert.equal(harness.state.guideLeaving.value, true, stage + ' ' + actionName + ' hides guide content before exit')
      assert.equal(harness.state.displayedDemoStage.value, oldDisplayedStage, stage + ' ' + actionName + ' keeps old copy during exit')
      if (stage === 'intro') assert.equal(harness.state.introDemo.value, true, 'intro appearance stays selected through exit')
      if (stage === 'upcycling') assert.equal(harness.state.demoBrowsing.value, true, 'upcycling appearance stays selected through exit')
      harness.advanceBy(319)
      assert.equal(harness.state.demoStage.value, 'exiting', stage + ' ' + actionName + ' remains during exit animation')
      assert.equal(harness.state.guideLeaving.value, true, stage + ' ' + actionName + ' keeps guide hidden during exit')
      assert.equal(harness.state.displayedDemoStage.value, oldDisplayedStage, stage + ' ' + actionName + ' does not replace copy before exit completes')
      assert.equal(harness.state.currentIndex.value, initialIndex, stage + ' ' + actionName + ' action is delayed')
      harness.advanceBy(1)
      assert.equal(harness.state.demoStage.value, 'idle', stage + ' ' + actionName + ' reaches idle after 320ms')
      if (actionName === 'dismiss') {
        assert.equal(harness.emitted.filter(([name]) => name === 'dismiss').length, initialDismisses + 1)
      } else {
        assert.equal(harness.state.currentIndex.value, initialIndex + 1, stage + ' next step runs after exit')
        harness.advanceBy(20000)
        assert.equal(harness.state.currentIndex.value, initialIndex + 1, stage + ' next step runs exactly once')
      }
      harness.advanceBy(20000)
      assert.equal(harness.state.demoStage.value, 'idle', stage + ' ' + actionName + ' leaves no stale phase callback')
      assert.equal(harness.state.demoTimers.size, 0, stage + ' ' + actionName + ' leaves no timer behind')
    }
  }
}

function verifyActiveVisibleAndUnmountCleanup() {
  const inactive = makeAppHarness()
  inactive.methods.startDemo()
  advanceToStage(inactive, 'scan')
  const latePhaseCallbacks = [...inactive.timers.values()].map(timer => timer.callback)
  inactive.context.props.active = false
  inactive.watchers.active(false)
  assert.equal(inactive.state.demoStage.value, 'idle', 'deactivating onboarding immediately resets demo stage')
  assert.equal(inactive.state.demoTimers.size, 0, 'deactivating onboarding clears phase timers')
  for (const callback of latePhaseCallbacks) callback()
  assert.equal(inactive.state.demoStage.value, 'idle', 'a late phase callback cannot revive an inactive demo')
  inactive.context.props.active = true
  inactive.watchers.active(true)
  assert.equal(inactive.state.demoStage.value, 'intro', 'reactivating onboarding can replay')
  advanceToStage(inactive, 'upcycling')
  assert.equal(inactive.state.demoStage.value, 'upcycling')

  const hidden = makeAppHarness()
  hidden.methods.startDemo()
  advanceToStage(hidden, 'scan')
  const beforeCopy = new Set(hidden.timers.keys())
  hidden.methods.setDemoStage('classified')
  const lateCopyCallbacks = callbacksScheduledSince(hidden, beforeCopy)
  assert.ok(lateCopyCallbacks.length > 0, 'classified stage schedules its copy crossfade')
  const oldDisplayedStage = hidden.state.displayedDemoStage.value
  hidden.context.props.visible = false
  hidden.watchers.visible(false)
  assert.equal(hidden.state.demoStage.value, 'exiting', 'closing onboarding exits the current demo')
  assert.equal(hidden.state.guideLeaving.value, true, 'closing onboarding hides guide before the exit finishes')
  for (const callback of lateCopyCallbacks) callback()
  assert.equal(hidden.state.displayedDemoStage.value, oldDisplayedStage, 'a copy callback cannot replace text after onboarding is hidden')
  hidden.advanceBy(320)
  assert.equal(hidden.state.demoStage.value, 'idle', 'closing onboarding resets after its exit animation')
  assert.equal(hidden.state.demoTimers.size, 0, 'closing onboarding clears every old stage timer')
  hidden.advanceBy(20000)
  assert.equal(hidden.state.demoStage.value, 'idle', 'no closed onboarding callback advances a later stage')

  const unmounted = makeAppHarness()
  unmounted.methods.startDemo()
  advanceToStage(unmounted, 'advice')
  unmounted.watchers.unmount()
  assert.equal(unmounted.state.demoStage.value, 'idle', 'unmount resets the demo stage')
  assert.equal(unmounted.state.demoTimers.size, 0, 'unmount clears all demo timers')
  assert.equal(unmounted.timers.size, 0, 'unmount leaves no host timer pending')
}

function verifyCopyTransitionCancellation() {
  const replay = makeAppHarness()
  replay.methods.startDemo()
  advanceToStage(replay, 'scan')
  const existingTimerIds = new Set(replay.timers.keys())
  replay.methods.setDemoStage('classified')
  const lateCopyCallbacks = callbacksScheduledSince(replay, existingTimerIds)
  assert.ok(lateCopyCallbacks.length > 0, 'stage changes schedule a delayed copy transition')
  replay.methods.startDemo()
  assert.equal(replay.state.demoStage.value, 'intro', 'replay returns to intro immediately')
  assert.equal(replay.state.displayedDemoStage.value, 'intro', 'replay resets the displayed copy')
  assert.equal(replay.state.copyVisible.value, true, 'replay restores copy visibility')
  for (const callback of lateCopyCallbacks) callback()
  assert.equal(replay.state.displayedDemoStage.value, 'intro', 'a stale copy timer cannot overwrite replay copy')
  replay.advanceBy(20000)
  assert.equal(replay.state.displayedDemoStage.value, 'upcycling', 'the new replay can complete normally')

  const skipped = makeAppHarness()
  skipped.methods.startDemo()
  advanceToStage(skipped, 'scan')
  const skippedTimers = new Set(skipped.timers.keys())
  skipped.methods.setDemoStage('classified')
  const afterSkipCallbacks = callbacksScheduledSince(skipped, skippedTimers)
  assert.ok(afterSkipCallbacks.length > 0)
  const displayedBeforeSkip = skipped.state.displayedDemoStage.value
  skipped.methods.dismiss()
  for (const callback of afterSkipCallbacks) callback()
  assert.equal(skipped.state.displayedDemoStage.value, displayedBeforeSkip, 'skip cancels a pending copy change')
  skipped.advanceBy(320)
  assert.equal(skipped.state.demoStage.value, 'idle', 'skip settles after its exit transition')
  skipped.advanceBy(20000)
  assert.equal(skipped.state.demoStage.value, 'idle', 'skip leaves no phase or copy callback that can revive the demo')
  assert.equal(skipped.state.demoTimers.size, 0)
}

function verifyEarlyNextStepRestoresCopyVisibility() {
  const harness = makeAppHarness()
  harness.methods.startDemo()
  const existingTimerIds = new Set(harness.timers.keys())
  harness.methods.setDemoStage('scan')
  const staleCopyCallbacks = callbacksScheduledSince(harness, existingTimerIds)
  assert.ok(staleCopyCallbacks.length > 0, 'scan copy has a pending crossfade')
  assert.equal(harness.state.copyVisible.value, false, 'scan copy begins its crossfade hidden')

  harness.methods.nextStep()
  assert.equal(harness.state.guideLeaving.value, true, 'early OK starts hiding the guide')
  harness.advanceBy(320)
  assert.equal(harness.state.currentIndex.value, 1, 'early OK advances after the exit')
  assert.equal(harness.state.copyVisible.value, true, 'settling to idle restores the copy visibility')
  harness.watchers.currentIndex()
  harness.advanceBy(300)
  assert.equal(harness.state.displayedIndex.value, 1, 'the second step copy becomes active after its hide transition')
  for (const callback of staleCopyCallbacks) callback()
  assert.equal(harness.state.copyVisible.value, true, 'a cancelled scan copy callback cannot hide the second step copy')
  assert.equal(harness.state.displayedDemoStage.value, 'intro', 'a cancelled scan copy callback cannot overwrite the retained demo copy')
  harness.advanceBy(20000)
  assert.equal(harness.state.currentIndex.value, 1, 'early OK advances exactly once')
  assert.equal(harness.state.displayedIndex.value, 1, 'no late demo callback displaces the second step')
}

function extractHomeHandlers(relativePath) {
  const { script, ast } = readScript(relativePath)
  const handlers = ['measureOnboardingTargets', 'handleOnboardingDemoStage', 'handleOnboardingStepChange'].map(name => {
    const node = findFunction(ast, name)
    return script.slice(node.start, node.end)
  })
  return { handlers, finished: findVariable(ast, script, 'onboardingDemoFinished') }
}

function withGlobalUni(uni, callback) {
  const present = Object.prototype.hasOwnProperty.call(globalThis, 'uni')
  const previous = globalThis.uni
  globalThis.uni = uni
  try { return callback() } finally {
    if (present) globalThis.uni = previous
    else delete globalThis.uni
  }
}

function withFakeNativeScheduler(uni, callback) {
  const names = ['window', 'document', 'uni', 'setTimeout', 'clearTimeout']
  const saved = new Map(names.map(name => [name, { present: Object.prototype.hasOwnProperty.call(globalThis, name), value: globalThis[name] }]))
  const originalNow = Date.now
  let now = 10000
  let nextId = 0
  const timers = new Map()
  Date.now = () => now
  delete globalThis.window
  delete globalThis.document
  globalThis.uni = uni
  globalThis.setTimeout = (fn, delay = 0) => {
    const id = ++nextId
    timers.set(id, { id, fn, at: now + delay })
    return id
  }
  globalThis.clearTimeout = id => timers.delete(id)
  const runNext = () => {
    const timer = [...timers.values()].sort((a, b) => a.at - b.at || a.id - b.id)[0]
    assert.ok(timer, 'a native refresh timer should be pending')
    timers.delete(timer.id)
    now = Math.max(now, timer.at)
    timer.fn()
    return timer
  }
  try {
    return callback({ timers, runNext, get now() { return now } })
  } finally {
    Date.now = originalNow
    for (const name of names) {
      const value = saved.get(name)
      if (value.present) globalThis[name] = value.value
      else delete globalThis[name]
    }
  }
}

function createFakeQueryScope(name, rects = {}, fallbackRect = null) {
  return {
    name,
    rects,
    fallbackRect,
    resolveRect(selector) {
      const rect = this.rects[selector] || this.fallbackRect
      return rect ? { ...rect } : null
    }
  }
}

function makeHomeHarness(relativePath, scopeOptions = {}) {
  const { handlers: [measureTargets, demoStageHandler, stepHandler], finished } = extractHomeHandlers(relativePath)
  const clock = createClock()
  const nextTicks = []
  const selectorCalls = []
  const scrollCalls = []
  const events = []
  const focusTrackers = []
  const defaultPageRect = { width: 120, height: 100, left: 0, top: 300, right: 120, bottom: 400 }
  const pageScope = createFakeQueryScope('page', scopeOptions.pageRects || {}, scopeOptions.pageFallbackRect === undefined ? defaultPageRect : scopeOptions.pageFallbackRect)
  const demoScope = createFakeQueryScope('demo', scopeOptions.demoRects || {}, scopeOptions.demoFallbackRect || null)
  const guideScope = createFakeQueryScope('guide', scopeOptions.guideRects || {}, scopeOptions.guideFallbackRect || null)
  const demoComponent = { measureRects(selectors, callback) { measureScopedRects(demoScope, selectors, callback) } }
  const guideComponent = { measureRects(selectors, callback) { measureScopedRects(guideScope, selectors, callback) } }
  const context = {
    onboardingDemoStage: { value: 'idle' },
    aiServiceEnabled: { value: false },
    computed: getter => ({ get value() { return getter() } }),
    onboardingStepRequestId: 0,
    onboardingAutoScrolling: { value: false },
    showAppOnboarding: { value: true },
    robotPageActive: { value: true },
    onboardingTargetRect: {
      _value: null,
      get value() { return this._value },
      set value(value) { events.push(['target', value]); this._value = value }
    },
    onboardingFocusInset: { value: 0 },
    onboardingFocusTracker: null,
    getOnboardingViewport: () => withGlobalUni(context.uni, getOnboardingViewport),
    getOnboardingScrollTop,
    onboardingPageScope: pageScope,
    onboardingDemoRef: { value: demoComponent },
    onboardingGuideRef: { value: guideComponent },
    queryOnboardingRects: (...args) => withGlobalUni(context.uni, () => queryOnboardingRects(...args)),
    pageScrollTop: { value: 0 },
    trackOnboardingFocus(options) {
      const entry = { options, stopped: false, stopCalls: 0, refreshes: [] }
      const tracker = {
        stop() { entry.stopCalls++; entry.stopped = true },
        refresh(duration) { entry.refreshes.push(duration) }
      }
      focusTrackers.push(entry)
      options.onInset(140)
      options.onRect(scopeOptions.focusRect === undefined ? { left: 12, top: 100, right: 200, bottom: 220, width: 188, height: 120 } : scopeOptions.focusRect)
      return tracker
    },
    nextTick: callback => nextTicks.push(callback),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    uni: {
      getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
      createSelectorQuery() {
        let queryScope = null
        const selectors = []
        const query = {
          in(scope) { queryScope = scope; return query },
          select(selector) {
            selectorCalls.push(selector)
            selectors.push(selector)
            return query
          },
          boundingClientRect() { return query },
          exec(callback) { callback?.(selectors.map(selector => queryScope?.resolveRect(selector) || null)) }
        }
        return query
      },
      pageScrollTo(options) { events.push(['scroll', options]); scrollCalls.push(options) }
    }
  }
  runInNewContext(`${finished}\nthis.onboardingDemoFinished = onboardingDemoFinished\nlet onboardingFocusTracker = null\n${measureTargets}\n${demoStageHandler}\n${stepHandler}\nthis.homeHandlers = { measureOnboardingTargets, handleOnboardingDemoStage, handleOnboardingStepChange }`, context,
    { filename: 'home-onboarding-handlers.js' })
  return {
    ...clock,
    context,
    handlers: context.homeHandlers,
    nextTicks,
    selectorCalls,
    scrollCalls,
    focusTrackers,
    events,
    scopes: { page: pageScope, demo: demoScope, guide: guideScope },
    flushNextTick() { const callback = nextTicks.shift(); assert.ok(callback); callback() }
  }
}

function verifyScopedOnboardingMeasurements() {
  const guideSelector = '.tour-card.demo-compact'
  const pageTarget = { left: 8, top: 80, right: 188, bottom: 180, width: 180, height: 100 }
  const ordinaryTarget = { left: 0, top: 320, right: 120, bottom: 420, width: 120, height: 100 }
  const guideTarget = { left: 20, top: 30, right: 370, bottom: 150, width: 350, height: 120 }
  const stageSelectors = [
    '.onboarding-demo-photo',
    '.onboarding-demo-summary',
    '.onboarding-demo-advice',
    '.onboarding-demo-upcycling'
  ]
  const makeRect = (top, height = 120) => ({ left: 0, top, right: 380, bottom: top + height, width: 380, height })
  const initialDemoRects = Object.fromEntries(stageSelectors.map((selector, index) => [selector, makeRect(200 + index * 130)]))
  const harness = makeHomeHarness('../src/pages/home/home.vue', {
    pageFallbackRect: null,
    pageRects: { '.onboarding-target-scan': pageTarget, '.ordinary-target': ordinaryTarget },
    guideRects: { [guideSelector]: guideTarget },
    demoRects: initialDemoRects
  })

  withFakeNativeScheduler(harness.context.uni, ({ runNext }) => {
    let defaultPageResults
    measureScopedRects(harness.scopes.page, [stageSelectors[0], guideSelector], rects => { defaultPageResults = rects })
    assert.deepEqual(defaultPageResults, [null, null], 'page scope cannot see targets rendered inside child components')

    let routedResults
    harness.handlers.measureOnboardingTargets([guideSelector, stageSelectors[0], '.ordinary-target'], rects => { routedResults = rects })
    assert.deepEqual(routedResults, [guideTarget, initialDemoRects[stageSelectors[0]], ordinaryTarget], 'routing reads each selector through its component or page scope and preserves order')
    assert.ok(harness.selectorCalls.includes(guideSelector), 'guide target is measured through the guide component scope')
    assert.ok(harness.selectorCalls.includes(stageSelectors[0]), 'demo target is measured through the demo component scope')
    assert.ok(harness.selectorCalls.includes('.ordinary-target'), 'ordinary target remains in page scope')

    const focused = [], insets = []
    for (const [index, selector] of stageSelectors.entries()) {
      const guideRect = { ...guideTarget, bottom: 150 + index * 8 }
      harness.scopes.guide.rects[guideSelector] = guideRect
      const firstRect = makeRect(210 + index * 100)
      harness.scopes.demo.rects[selector] = firstRect
      const tracker = trackOnboardingFocus({
        selector,
        measureRects: (requested, callback) => harness.handlers.measureOnboardingTargets(requested, callback),
        isCurrent: () => true,
        isBrowsing: () => false,
        onRect: rect => focused.push(rect),
        onInset: inset => insets.push(inset)
      })
      assert.equal(focused.at(-1).top, firstRect.top, selector + ' focuses its scoped target on initial measurement')
      assert.equal(insets.at(-1), Math.ceil(guideRect.bottom + 24), selector + ' inset comes from the scoped guide component')

      const movedRect = makeRect(firstRect.top + 32)
      harness.scopes.demo.rects[selector] = movedRect
      harness.scopes.guide.rects[guideSelector] = { ...guideRect, bottom: guideRect.bottom + 4 }
      // Exercise the real tracker refresh callback and the home measurement router together.
      const currentIndex = focused.length
      tracker.refresh(64)
      runNext()
      assert.equal(focused.at(-1).top, movedRect.top, selector + ' follows its changing scoped rect')
      assert.equal(insets.at(-1), Math.ceil(guideRect.bottom + 4 + 24), selector + ' refresh preserves guide inset routing')
      assert.ok(focused.length > currentIndex, selector + ' reports an updated target after refresh')
      tracker.stop()
    }
  })

  const scrollHarness = makeHomeHarness('../src/pages/home/home.vue', {
    pageFallbackRect: null,
    focusRect: makeRect(750, 180),
    demoRects: { '.onboarding-demo-advice': makeRect(750, 180) },
    guideRects: { [guideSelector]: guideTarget }
  })
  scrollHarness.handlers.handleOnboardingStepChange({ selector: '.onboarding-demo-advice', shouldScroll: true })
  assert.equal(scrollHarness.scrollCalls.length, 1, 'native scroll receives a measured demo target')
  const scrolledAdviceTop = 750 - scrollHarness.scrollCalls[0].scrollTop
  assert.equal(scrolledAdviceTop, 140, 'native scroll aligns the scoped advice rect to its guide inset')
  assert.ok(scrolledAdviceTop >= 140 && scrolledAdviceTop + 180 <= 784, 'the scoped advice target lands fully inside the readable viewport')
  scrollHarness.advanceBy(550)
  assert.equal(scrollHarness.context.pageScrollTop.value, 0, 'the harness keeps the native scroll position before the smooth scroll completes')
  assert.equal(scrollHarness.scrollCalls.length, 1, '550ms correction does not restart smooth scrolling to the same requested endpoint')
  assert.equal(scrollHarness.scrollCalls[0].duration, 260)
  assert.ok(scrollHarness.selectorCalls.includes('.onboarding-demo-advice'), 'native scroll measures the child demo through its exposed scope')

  const expandedCorrection = makeHomeHarness('../src/pages/home/home.vue', {
    pageFallbackRect: null,
    focusRect: makeRect(750, 180),
    demoRects: { '.onboarding-demo-advice': makeRect(750, 180) },
    guideRects: { [guideSelector]: guideTarget }
  })
  expandedCorrection.handlers.handleOnboardingStepChange({ selector: '.onboarding-demo-advice', shouldScroll: true })
  assert.equal(expandedCorrection.scrollCalls.length, 1, 'first focus rect issues the initial smooth-scroll request')
  expandedCorrection.scopes.demo.rects['.onboarding-demo-advice'] = makeRect(770, 180)
  expandedCorrection.advanceBy(550)
  assert.equal(expandedCorrection.scrollCalls.length, 2, 'expanded target with a changed endpoint receives one correction scroll')

  const publishOrder = makeHomeHarness('../src/pages/home/home.vue', { focusRect: null })
  publishOrder.handlers.handleOnboardingStepChange({ selector: '.onboarding-demo-advice', shouldScroll: true })
  assert.equal(publishOrder.scrollCalls.length, 0, 'an initial empty focus rect does not consume first-scroll eligibility')
  publishOrder.focusTrackers[0].options.onRect(makeRect(300, 100))
  const scrollEventIndex = publishOrder.events.findIndex(([type]) => type === 'scroll')
  const publishEventIndex = publishOrder.events.findIndex(([type, rect]) => type === 'target' && rect?.top === 300)
  assert.ok(scrollEventIndex >= 0 && scrollEventIndex < publishEventIndex, 'the first effective rect starts scrolling before it publishes the target highlight')

  const photoAtTop = makeHomeHarness('../src/pages/home/home.vue', {
    pageFallbackRect: null,
    focusRect: makeRect(200, 120),
    demoRects: { '.onboarding-demo-photo': makeRect(200, 120) }
  })
  photoAtTop.handlers.handleOnboardingStepChange({ selector: '.onboarding-demo-photo', shouldScroll: true })
  assert.equal(photoAtTop.scrollCalls.length, 0, 'the first photo at scrollTop zero does not trigger a first scroll')
  photoAtTop.advanceBy(550)
  assert.ok(photoAtTop.selectorCalls.includes('.onboarding-demo-photo'), 'photo correction still measures through the demo component scope')

  for (const unmounted of [false, true]) {
    const unavailable = makeHomeHarness('../src/pages/home/home.vue', { pageFallbackRect: null, demoRects: {}, guideRects: {} })
    unavailable.context.onboardingTargetRect.value = { left: 2, top: 2, right: 30, bottom: 30, width: 28, height: 28 }
    if (unmounted) unavailable.context.onboardingDemoRef.value = null
    unavailable.context.trackOnboardingFocus = options => trackOnboardingFocus(options)
    withFakeNativeScheduler(unavailable.context.uni, () => {
      unavailable.handlers.handleOnboardingStepChange({ selector: '.onboarding-demo-advice', shouldScroll: true })
      assert.equal(unavailable.context.onboardingTargetRect.value, null, unmounted ? 'unmounted demo ref clears old focus' : 'empty demo scope clears old focus')
      unavailable.advanceBy(320)
      assert.equal(unavailable.scrollCalls.filter(scroll => scroll.duration > 0).length, 0, unmounted ? 'unmounted demo target does not scroll' : 'missing demo target does not scroll')
      unavailable.handlers.handleOnboardingDemoStage('idle')
      assert.equal(unavailable.scrollCalls.filter(scroll => scroll.duration > 0).length, 0, 'stopping missing target does not start a delayed scroll')
    })
  }
}

function withFakeDom({ querySelector, querySelectorAll, innerHeight = 844 }, callback) {
  const names = ['window', 'document', 'uni', 'setTimeout', 'clearTimeout']
  const saved = new Map(names.map(name => [name, { present: Object.prototype.hasOwnProperty.call(globalThis, name), value: globalThis[name] }]))
  const originalNow = Date.now
  let now = 1000
  Date.now = () => now
  let nextFrameId = 0
  const frames = new Map()
  const listeners = new Map()
  const fakeWindow = {
    innerHeight,
    requestAnimationFrame(fn) { const id = ++nextFrameId; frames.set(id, fn); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn) }
  }
  const fakeDocument = { querySelector, querySelectorAll }
  globalThis.window = fakeWindow
  globalThis.document = fakeDocument
  const runFrame = () => {
    const entry = frames.entries().next().value
    assert.ok(entry, 'a requestAnimationFrame callback should be pending')
    const [id, fn] = entry
    frames.delete(id)
    now += 16
    fn(now)
  }
  try {
    return callback({ frames, listeners, runFrame, get now() { return now } })
  } finally {
    Date.now = originalNow
    for (const name of names) {
      const value = saved.get(name)
      if (value.present) globalThis[name] = value.value
      else delete globalThis[name]
    }
  }
}

function verifyDomFocusTracker() {
  let targetRect = { left: 20, top: 180, right: 220, bottom: 320, width: 200, height: 140 }
  const guide = { getBoundingClientRect: () => ({ bottom: 100 }) }
  const target = { getBoundingClientRect: () => ({ ...targetRect }) }
  withFakeDom({
    querySelector: selector => selector === '.tour-card.demo-compact' ? guide : selector === '.target' ? target : null,
    querySelectorAll: () => []
  }, ({ frames, listeners, runFrame }) => {
    const rects = [], insets = []
    const tracker = trackOnboardingFocus({ selector: '.target', isCurrent: () => true, isBrowsing: () => false, onRect: rect => rects.push(rect), onInset: inset => insets.push(inset) })
    assert.equal(rects.at(-1).top, 180, 'DOM tracker measures the initial target immediately')
    assert.equal(insets.at(-1), 124, 'DOM tracker derives its inset from the compact guide')
    targetRect = { left: 32, top: 260, right: 250, bottom: 390, width: 218, height: 130 }
    runFrame()
    assert.equal(rects.at(-1).top, 260, 'DOM target changes are picked up on the next animation frame')

    let guard = 0
    while (frames.size && guard++ < 110) runFrame()
    assert.equal(frames.size, 0, 'DOM tracker sleeps after its bounded measurement window')
    const beforeScroll = rects.length
    for (const wake of listeners.get('scroll')) wake()
    assert.equal(frames.size, 1, 'scroll wakes the sleeping focus tracker')
    runFrame()
    assert.equal(rects.length, beforeScroll + 1, 'scroll wake measures the target again')

    const staleFrame = [...frames.values()][0]
    const beforeStop = rects.length
    tracker.stop()
    assert.equal(frames.size, 0, 'stop cancels the queued animation frame')
    assert.equal(listeners.get('scroll').size, 0, 'stop removes the scroll wake listener')
    staleFrame(5000)
    assert.equal(rects.length, beforeStop, 'a stale DOM frame cannot write a rect after stop')
    tracker.refresh()
    assert.equal(frames.size, 0, 'refresh after stop cannot restart the tracker')
  })
}

function verifyInvalidFocusTrackerStops() {
  const target = { getBoundingClientRect: () => ({ left: 5, top: 6, right: 45, bottom: 56, width: 40, height: 50 }) }
  let current = true
  withFakeDom({ querySelector: selector => selector === '.target' ? target : null, querySelectorAll: () => [] }, ({ frames, runFrame }) => {
    const rects = []
    const tracker = trackOnboardingFocus({ selector: '.target', isCurrent: () => current, isBrowsing: () => false, onRect: rect => rects.push(rect), onInset: () => {} })
    const initialWrites = rects.length
    current = false
    runFrame()
    assert.equal(rects.length, initialWrites, 'an invalid focus request stops before another DOM write')
    assert.equal(frames.size, 0, 'an invalid focus request ends its animation loop')
    tracker.refresh()
    assert.equal(frames.size, 0, 'an invalid tracker cannot be restarted')
  })
}

function verifyBrowsingFocusPrefersVisibleExample() {
  const service = { label: 'service', getBoundingClientRect: () => ({ left: 0, top: 120, right: 380, bottom: 760, width: 380, height: 640 }) }
  const photo = { label: 'photo', getBoundingClientRect: () => ({ left: 0, top: 120, right: 380, bottom: 280, width: 380, height: 160 }) }
  const summary = { label: 'summary', getBoundingClientRect: () => ({ left: 0, top: 250, right: 380, bottom: 520, width: 380, height: 270 }) }
  const advice = { label: 'advice', getBoundingClientRect: () => ({ left: 0, top: 500, right: 380, bottom: 790, width: 380, height: 290 }) }
  const sections = [photo, summary, advice]
  const documentQueries = []
  const rootQueries = []
  const root = {
    querySelector(selector) {
      rootQueries.push(selector)
      return selector === '.tour-card.demo-compact' ? null : selector === '.service' ? service : null
    },
    querySelectorAll(selector) {
      rootQueries.push(selector)
      return selector.includes('.onboarding-demo-photo') ? sections : []
    }
  }
  withFakeDom({
    querySelector: selector => { documentQueries.push(selector); return selector === '.home-page' ? root : null },
    querySelectorAll: () => []
  }, () => {
    let focused
    const tracker = trackOnboardingFocus({ selector: '.service', rootSelector: '.home-page', isCurrent: () => true, isBrowsing: () => true, onRect: rect => { focused = rect }, onInset: () => {} })
    assert.equal(focused.top, advice.getBoundingClientRect().top, 'browsing focus follows the most visible example section')
    assert.notEqual(focused.top, service.getBoundingClientRect().top, 'browsing focus avoids the unrelated service target')
    assert.deepEqual(documentQueries, ['.home-page'], 'root selector isolates a theme page from other cached pages')
    assert.ok(rootQueries.includes('.service'), 'focus queries the service selector within its selected root')
    tracker.stop()
  })
}

function verifyNativeLateFocusCallbackIsIgnored() {
  const names = ['window', 'document', 'uni', 'setTimeout', 'clearTimeout']
  const saved = new Map(names.map(name => [name, { present: Object.prototype.hasOwnProperty.call(globalThis, name), value: globalThis[name] }]))
  let nextTimerId = 0
  const timers = new Map()
  const selectors = []
  let nativeCallback = null
  let now = 2000
  const originalNow = Date.now
  const originalClearTimeout = globalThis.clearTimeout
  Date.now = () => now
  delete globalThis.window
  delete globalThis.document
  globalThis.setTimeout = (fn, delay) => { const id = ++nextTimerId; timers.set(id, { fn, delay }); return id }
  globalThis.clearTimeout = id => timers.delete(id)
  globalThis.uni = {
    createSelectorQuery() {
      const query = {
        select(selector) { selectors.push(selector); return query },
        boundingClientRect() { return query },
        exec(callback) { nativeCallback = callback; return query }
      }
      return query
    }
  }
  try {
    const rects = [], insets = []
    const tracker = trackOnboardingFocus({ selector: '.target', isCurrent: () => true, isBrowsing: () => false, onRect: rect => rects.push(rect), onInset: inset => insets.push(inset) })
    assert.deepEqual(selectors, ['.tour-card.demo-compact', '.target'], 'native focus queries guide inset and requested target')
    assert.ok(nativeCallback, 'native selector query provides an asynchronous callback')
    tracker.stop()
    assert.equal(timers.size, 0, 'native stop cancels its queued timer')
    nativeCallback([{ bottom: 100 }, { left: 0, top: 10, right: 20, bottom: 30, width: 20, height: 20 }])
    assert.deepEqual(rects, [], 'native callback after stop cannot write a target rect')
    assert.deepEqual(insets, [], 'native callback after stop cannot write an inset')
  } finally {
    Date.now = originalNow
    globalThis.clearTimeout = originalClearTimeout
    for (const name of names) {
      const value = saved.get(name)
      if (value.present) globalThis[name] = value.value
      else delete globalThis[name]
    }
  }
}

function verifyNativeBrowsingFocusPrefersAdvice() {
  const names = ['window', 'document', 'uni', 'setTimeout', 'clearTimeout']
  const saved = new Map(names.map(name => [name, { present: Object.prototype.hasOwnProperty.call(globalThis, name), value: globalThis[name] }]))
  let nextTimerId = 0
  const timers = new Map()
  const selectors = []
  let nativeCallback = null
  let getWindowInfoCalls = 0
  const originalNow = Date.now
  Date.now = () => 3000
  delete globalThis.window
  delete globalThis.document
  globalThis.setTimeout = (fn, delay) => { const id = ++nextTimerId; timers.set(id, { fn, delay }); return id }
  globalThis.clearTimeout = id => timers.delete(id)
  globalThis.uni = {
    getWindowInfo() { getWindowInfoCalls++; return { windowHeight: 844 } },
    createSelectorQuery() {
      const query = {
        select(selector) { selectors.push(selector); return query },
        boundingClientRect() { return query },
        exec(callback) { nativeCallback = callback; return query }
      }
      return query
    }
  }
  try {
    const rects = [], insets = []
    const tracker = trackOnboardingFocus({ selector: '.service', rootSelector: '.home-page', isCurrent: () => true, isBrowsing: () => true, onRect: rect => rects.push(rect), onInset: inset => insets.push(inset) })
    assert.deepEqual(selectors, [
      '.tour-card.demo-compact', '.service', '.onboarding-demo-photo', '.onboarding-demo-summary', '.onboarding-demo-advice', '.onboarding-demo-upcycling'
    ], 'native browsing query includes the requested target and all example sections')
    assert.ok(nativeCallback, 'native browsing query provides an asynchronous callback')
    const guide = { bottom: 100, left: 0, top: 0, right: 390, width: 390, height: 100 }
    const service = { left: 0, top: 120, right: 390, bottom: 800, width: 390, height: 680 }
    const photo = { left: 0, top: 120, right: 390, bottom: 280, width: 390, height: 160 }
    const summary = { left: 0, top: 250, right: 390, bottom: 520, width: 390, height: 270 }
    const advice = { left: 0, top: 500, right: 390, bottom: 790, width: 390, height: 290 }
    const upcycling = { left: 0, top: 790, right: 390, bottom: 1100, width: 390, height: 310 }
    const results = [guide, service, photo, summary, advice, upcycling]
    nativeCallback(results)
    assert.equal(getWindowInfoCalls, 1, 'native browsing uses the platform viewport height')
    assert.equal(insets.at(-1), 124, 'native browsing reports the compact guide inset')
    assert.equal(rects.at(-1).top, advice.top, 'native browsing focuses the visible advice section')
    const writesBeforeStop = { rects: rects.length, insets: insets.length }
    tracker.stop()
    nativeCallback([guide, service, photo, summary, photo, upcycling])
    assert.equal(rects.length, writesBeforeStop.rects, 'native browsing callback after stop cannot replace the chosen advice target')
    assert.equal(insets.length, writesBeforeStop.insets, 'native browsing callback after stop cannot write a new inset')
    assert.equal(getWindowInfoCalls, 1, 'late native callback after stop does not read viewport state')
    assert.equal(timers.size, 0, 'native browsing stop cancels its pending refresh')
  } finally {
    Date.now = originalNow
    for (const name of names) {
      const value = saved.get(name)
      if (value.present) globalThis[name] = value.value
      else delete globalThis[name]
    }
  }
}

function verifyDelayedHomeScrollGuards() {
  for (const page of ['../src/pages/home/home.vue', '../src/pages-dark/home/home.vue']) {
    const cancelled = makeHomeHarness(page)
    cancelled.handlers.handleOnboardingStepChange({ selector: '.onboarding-demo-advice', shouldScroll: true })
    assert.equal(cancelled.focusTrackers.length, 1, page + ' step change creates a focus tracker')
    assert.equal(cancelled.timers.size, 2, page + ' demo schedules only its correction and auto-scroll release')
    cancelled.handlers.handleOnboardingDemoStage('idle')
    assert.equal(cancelled.focusTrackers[0].stopCalls, 1, page + ' idle stage stops the previous focus tracker')
    assert.equal(cancelled.scrollCalls.length, 1, page + ' idle stage may only issue its explicit stop-scroll command')
    assert.equal(cancelled.scrollCalls[0].duration, 0)
    cancelled.runNext()
    assert.deepEqual(cancelled.selectorCalls, [], page + ' superseded callback does not measure the old target')
    assert.equal(cancelled.scrollCalls.length, 1, page + ' superseded callback cannot issue another scroll')

    const inactive = makeHomeHarness(page)
    inactive.handlers.handleOnboardingStepChange({ selector: '.onboarding-demo-advice', shouldScroll: true })
    inactive.context.robotPageActive.value = false
    inactive.runNext()
    assert.deepEqual(inactive.selectorCalls, [], page + ' inactive page ignores its delayed scroll callback')
    assert.deepEqual(inactive.scrollCalls, [], page + ' inactive page does not scroll after the callback delay')

    const staleStageTick = makeHomeHarness(page)
    staleStageTick.handlers.handleOnboardingDemoStage('scan')
    staleStageTick.handlers.handleOnboardingDemoStage('idle')
    staleStageTick.flushNextTick()
    assert.equal(staleStageTick.timers.size, 0, page + ' stale nextTick callback cannot enqueue a scroll')

    const stopSmoothScroll = makeHomeHarness(page)
    stopSmoothScroll.context.pageScrollTop.value = 125
    stopSmoothScroll.handlers.handleOnboardingStepChange({ selector: '.onboarding-demo-advice', shouldScroll: true })
    const firstTracker = stopSmoothScroll.focusTrackers[0]
    assert.equal(stopSmoothScroll.scrollCalls.length, 1, page + ' starts the expected smooth scroll immediately')
    assert.equal(stopSmoothScroll.scrollCalls[0].duration, 260)
    stopSmoothScroll.handlers.handleOnboardingStepChange({ selector: '.stale-after-exit', shouldScroll: true })
    const secondTracker = stopSmoothScroll.focusTrackers[1]
    assert.equal(firstTracker.stopCalls, 1, page + ' a new target stops the previous focus tracker')
    const callsBeforeExit = stopSmoothScroll.scrollCalls.length
    stopSmoothScroll.handlers.handleOnboardingDemoStage('exiting')
    assert.equal(secondTracker.stopCalls, 1, page + ' exiting stops the current focus tracker')
    assert.equal(stopSmoothScroll.scrollCalls.length, callsBeforeExit + 1, page + ' exit actively stops the in-flight smooth scroll')
    assert.equal(stopSmoothScroll.scrollCalls.at(-1).duration, 0)
    assert.equal(stopSmoothScroll.scrollCalls.at(-1).scrollTop, 125)
    const selectorsAfterExit = stopSmoothScroll.selectorCalls.length
    stopSmoothScroll.advanceBy(550)
    assert.equal(stopSmoothScroll.scrollCalls.length, callsBeforeExit + 1, page + ' expired 550ms correction cannot start another scroll')
    assert.equal(stopSmoothScroll.selectorCalls.length, selectorsAfterExit,
      page + ' expired 550ms correction cannot measure a new target after exit')
  }
}

function verifyHomeTerminalStageTracksAiSetting() {
  for (const page of ['../src/pages/home/home.vue', '../src/pages-dark/home/home.vue']) {
    const harness = makeHomeHarness(page)
    harness.context.onboardingDemoStage.value = 'classified'
    assert.equal(harness.context.onboardingDemoFinished.value, true, page + ' classification is terminal when AI is disabled')
    harness.context.aiServiceEnabled.value = true
    assert.equal(harness.context.onboardingDemoFinished.value, false, page + ' classification is not terminal when AI is enabled')
    harness.context.onboardingDemoStage.value = 'upcycling'
    assert.equal(harness.context.onboardingDemoFinished.value, true, page + ' upcycling remains the full-flow terminal stage')
  }
}

verifyAutomaticDemoSequence()
verifyAiDisabledAndLiveSettingsChanges()
verifyTargetRectVisibilityDebounce()
verifyCardContentReadinessGate()
verifyIntroFallbackAndLateImageLoad()
verifyReplayDoesNotDuplicateTimers()
verifyReturningToFirstStepReplaysDemo()
verifyExitFromEveryStage()
verifyActiveVisibleAndUnmountCleanup()
verifyCopyTransitionCancellation()
verifyEarlyNextStepRestoresCopyVisibility()
verifyScopedOnboardingMeasurements()
verifyDomFocusTracker()
verifyInvalidFocusTrackerStops()
verifyBrowsingFocusPrefersVisibleExample()
verifyNativeLateFocusCallbackIsIgnored()
verifyNativeBrowsingFocusPrefersAdvice()
verifyDelayedHomeScrollGuards()
verifyHomeTerminalStageTracksAiSetting()
verifyOnboardingViewportAndScrollMath()
verifyDemoPhotoPanelTemplate()
verifyDemoTrailingSpaceGuards()
console.log('onboarding recognition demo lifecycle tests passed')
