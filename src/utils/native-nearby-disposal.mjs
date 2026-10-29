export const NATIVE_DISPOSAL_DURATION = 280

export function nativeDisposalLayout(info, count, collapsed = false, requestedHeight) {
  const wide = info.windowWidth >= 900
  const bottom = 70 + (info.safeAreaInsets?.bottom || 0)
  const maximumHeight = Math.max(100, wide ? info.windowHeight - 230 : Math.min(info.windowHeight * .7, info.windowHeight - 180))
  const minimumHeight = Math.min(150, maximumHeight)
  const height = collapsed ? 52 : Math.min(maximumHeight, Math.max(minimumHeight, requestedHeight ?? (76 + count * 120)))
  const pillWidth = 136 + String(Math.max(0, count)).length * 8
  const width = collapsed ? Math.min(pillWidth, info.windowWidth - 32) : wide ? 400 : info.windowWidth
  return { wide, height, width, minimumHeight, maximumHeight,
    left: collapsed ? (wide ? 24 : 16) : wide ? 24 : 0,
    top: wide ? 130 : info.windowHeight - bottom - height - (collapsed ? 16 : 0) }
}

// The native window only occupies the sheet/pill bounds: the rest of the map stays touchable.
export function createNativeDisposalController(options) {
  let active = false
  let visible = false
  let points = []
  let dark = false
  let collapsed = false
  let closing = false
  let shown = false
  let requestedHeight
  let timer
  let disposed = false
  let nativeWindow

  function cancelClose() {
    clearTimeout(timer)
    timer = undefined
    closing = false
    options.closing(false)
  }

  function hide() {
    cancelClose()
    nativeWindow?.hide('none', 0)
    shown = false
    options.height(0)
  }

  function render(animation = 'none', includePoints = true) {
    if (disposed || !nativeWindow) return
    if (!active || !visible || !points.length) { hide(); return }
    if (closing) return
    const layout = nativeDisposalLayout(options.windowInfo(), points.length, collapsed, requestedHeight)
    nativeWindow.setStyle({ left: `${layout.left}px`, top: `${layout.top}px`, width: `${layout.width}px`, height: `${layout.height}px`, background: 'transparent' })
    // Send only list fields across the renderer bridge, especially avoiding a duplicate Base64 imagePath.
    const listPoints = includePoints ? points.map(point => ({
      id: point.id, name: point.name, distance: point.distance, address: point.address,
      description: point.description, type: point.type, image: point.image
    })) : undefined
    options.publish({ layout, collapsed, dark, ...(includePoints ? { points: listPoints } : {}) })
    if (!shown || animation !== 'none') nativeWindow.show(animation, animation === 'none' ? 0 : NATIVE_DISPOSAL_DURATION)
    shown = true
    options.height(collapsed ? 0 : layout.height)
  }

  function action(message) {
    if (disposed) return
    if (message.type === 'ready') { render(); return }
    if (!active || !visible || !points.length || closing || !nativeWindow) return
    if (message.type === 'collapse') {
      if (collapsed) return
      closing = true
      options.closing(true)
      options.height(0)
      const layout = nativeDisposalLayout(options.windowInfo(), points.length, false, requestedHeight)
      nativeWindow.hide(layout.wide ? 'fade-out' : 'slide-out-bottom', NATIVE_DISPOSAL_DURATION)
      shown = false
      timer = setTimeout(() => {
        timer = undefined
        collapsed = true
        closing = false
        options.closing(false)
        render('fade-in')
      }, NATIVE_DISPOSAL_DURATION + 32)
    } else if (message.type === 'open') {
      nativeWindow.hide('none', 0)
      shown = false
      collapsed = false
      requestedHeight = undefined
      render('fade-in')
    } else if (message.type === 'resize' && !collapsed && Number.isFinite(message.height)) {
      const layout = nativeDisposalLayout(options.windowInfo(), points.length)
      if (message.height <= Math.min(96, layout.minimumHeight * .65)) { action({ type: 'collapse' }); return }
      requestedHeight = Math.max(layout.minimumHeight, Math.min(layout.maximumHeight, message.height))
      render('none', false)
    } else if (message.type === 'select' || message.type === 'navigate') {
      const point = points.find(item => String(item.id) === String(message.id))
      if (point) options[message.type](point)
    }
  }

  return {
    attach(window) { if (disposed) return; nativeWindow = window; render() },
    update(data) {
      visible = !!data.visible
      points = data.points || []
      dark = !!data.dark
      render()
    },
    activate(value) { active = value; if (!active) hide(); else render() },
    refresh() { render('none', false) },
    action,
    dispose() { if (disposed) return; disposed = true; hide(); nativeWindow = null }
  }
}
