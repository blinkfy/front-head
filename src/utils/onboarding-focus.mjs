// Keep the spotlight attached to content while it expands or the page scrolls.
// The bounded animation loop sleeps once settled; user scrolling wakes it again.
export function getOnboardingViewport() {
  let info = {}
  try { info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync() } catch (_) {}
  const width = info.windowWidth || (typeof window !== 'undefined' && window.innerWidth) || 375
  const height = info.windowHeight || (typeof window !== 'undefined' && window.innerHeight) || 667
  const safeTop = Math.max(info.statusBarHeight || 0, info.safeAreaInsets?.top || info.safeArea?.top || 0)
  let guideTop = Math.max(40, safeTop + 20)
  try {
    const capsule = uni.getMenuButtonBoundingClientRect?.()
    if (capsule?.height > 0 && Number.isFinite(capsule.bottom)) guideTop = Math.max(guideTop, capsule.bottom + 16)
  } catch (_) {}
  const bottomInset = Math.max(60, (info.safeAreaInsets?.bottom || 0) + 24)
  return { width, height, guideTop, bottom: height - bottomInset }
}

export function getOnboardingScrollTop(rect, scrollTop, viewport, focusInset, demo = false) {
  if (!rect || rect.height <= 0) return scrollTop
  if (!demo) return Math.max(0, scrollTop + rect.top - viewport.height * 0.34)
  const top = Math.max(viewport.guideTop, focusInset || 0)
  return Math.max(0, scrollTop + rect.top - top)
}

export function measureScopedRects(scope, selectors, callback) {
  const empty = () => callback(selectors.map(() => null))
  if (!scope) { empty(); return }
  try {
    const query = uni.createSelectorQuery().in(scope)
    for (const selector of selectors) query.select(selector).boundingClientRect()
    query.exec(results => callback(results || selectors.map(() => null)))
  } catch (_) { empty() }
}

// Mini-program selector queries cannot cross custom-component boundaries.
// Each component measures its own nodes, then results retain the requested order.
export function queryOnboardingRects({ pageScope, demoComponent, guideComponent }, selectors, callback) {
  const groups = new Map()
  const results = selectors.map(() => null)
  selectors.forEach((selector, index) => {
    const owner = selector.startsWith('.onboarding-demo-') ? 'demo' : selector.startsWith('.tour-card') ? 'guide' : 'page'
    if (!groups.has(owner)) groups.set(owner, [])
    groups.get(owner).push({ selector, index })
  })
  let pending = groups.size
  if (!pending) { callback(results); return }
  for (const [owner, entries] of groups) {
    let settled = false
    const finish = rects => {
      if (settled) return
      settled = true
      entries.forEach((entry, index) => { results[entry.index] = rects?.[index] || null })
      if (--pending === 0) callback(results)
    }
    const requested = entries.map(entry => entry.selector)
    if (owner === 'page') measureScopedRects(pageScope, requested, finish)
    else {
      const component = owner === 'demo' ? demoComponent : guideComponent
      try {
        if (typeof component?.measureRects === 'function') component.measureRects(requested, finish)
        else finish([])
      } catch (_) { finish([]) }
    }
  }
}

export function trackOnboardingFocus({ selector, rootSelector = '', measureRects, isCurrent, isBrowsing, onRect, onInset }) {
  const dom = typeof window !== 'undefined' && typeof document !== 'undefined'
  let stopped = false
  let frame = null
  let until = 0
  let querying = false
  const sections = ['.onboarding-demo-photo', '.onboarding-demo-summary', '.onboarding-demo-advice', '.onboarding-demo-upcycling']
  const schedule = callback => dom ? window.requestAnimationFrame(callback) : setTimeout(callback, 32)
  const cancel = id => dom ? window.cancelAnimationFrame(id) : clearTimeout(id)
  const normalize = rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height })
  function visibleSection(rects, inset, height, fallback) {
    let best = 0
    let selected = fallback
    for (const rect of rects) {
      if (!rect || rect.width <= 0) continue
      const visible = Math.max(0, Math.min(rect.bottom, height - 60) - Math.max(rect.top, inset))
      if (visible > best) { best = visible; selected = rect }
    }
    return selected
  }

  function measure() {
    if (!isCurrent()) { stop(); return }
    if (dom) {
      const root = (rootSelector && document.querySelector(rootSelector)) || document
      const guide = root.querySelector('.tour-card.demo-compact')
      const inset = guide ? Math.ceil(guide.getBoundingClientRect().bottom + 24) : 0
      onInset(inset)
      let rect = root.querySelector(selector)?.getBoundingClientRect()
      if (isBrowsing()) {
        // When the user scrolls back, focus the visible example section rather
        // than revealing unrelated services underneath the example.
        rect = visibleSection([...root.querySelectorAll(sections.join(', '))].map(section => section.getBoundingClientRect()), inset, window.innerHeight, rect)
      }
      onRect(rect?.width > 0 && rect.height > 0 ? normalize(rect) : null)
      return
    }
    if (querying) return
    querying = true
    try {
      const browsing = isBrowsing()
      const selectors = ['.tour-card.demo-compact', selector, ...(browsing ? sections : [])]
      const queryRects = measureRects || ((requested, callback) => {
        const query = uni.createSelectorQuery()
        for (const item of requested) query.select(item).boundingClientRect()
        query.exec(callback)
      })
      queryRects(selectors, results => {
        querying = false
        if (!isCurrent() || stopped) return
        const [guide, target, ...candidates] = results || []
        const inset = guide ? Math.ceil(guide.bottom + 24) : 0
        onInset(inset)
        let rect = target
        if (browsing && isBrowsing()) {
          const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
          rect = visibleSection(candidates, inset, info.windowHeight || 667, target)
        }
        onRect(rect?.width > 0 && rect.height > 0 ? normalize(rect) : null)
      })
    } catch (_) { querying = false }
  }

  function tick() {
    frame = null
    if (stopped) return
    measure()
    if (!stopped && Date.now() < until) frame = schedule(tick)
  }

  function refresh(duration = 160) {
    if (stopped) return
    until = Math.max(until, Date.now() + duration)
    if (frame === null) frame = schedule(tick)
  }

  function stop() {
    stopped = true
    if (frame !== null) cancel(frame)
    frame = null
    if (dom) {
      window.removeEventListener('scroll', wake)
      window.removeEventListener('resize', wake)
    }
  }

  function wake() { refresh() }
  if (dom) {
    window.addEventListener('scroll', wake, { passive: true })
    window.addEventListener('resize', wake)
  }
  measure()
  refresh(1500)
  return { refresh, stop }
}
