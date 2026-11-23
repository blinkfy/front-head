export function appMapControlsLayout({ selectMode, top = 0, windowWidth = 375, windowHeight = 667 }) {
  const availableWidth = Math.max(1, windowWidth - 24)
  const width = Math.min(selectMode ? 420 : 132, availableWidth)
  const height = selectMode ? 218 : 44
  return {
    left: selectMode ? Math.max(0, (windowWidth - width) / 2) : Math.min(6, Math.max(0, windowWidth - width)),
    top: Math.max(0, Math.min(Number(top) || 0, windowHeight - height)), width, height
  }
}

export function hasValidMapCoordinates(latitude, longitude) {
  const valid = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value))
  return valid(latitude) && valid(longitude) && Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number(longitude) >= -180 && Number(longitude) <= 180
}

// Use the same subNVue layer as the nearby sheet, with real native text and buttons.
export function createAppMapControlsController({ getSize, publish, onAction }) {
  let state = { visible: false, selectMode: false, dark: false, satellite: false, loading: false, top: 0, latitude: null, longitude: null }
  let nativeWindow
  let active = false
  let shown = false
  let disposed = false
  let layout

  function hide() {
    if (nativeWindow) nativeWindow.hide('none', 0)
    shown = false
  }
  function render() {
    if (disposed || !nativeWindow) return
    if (!active || !state.visible) { hide(); return }
    const size = getSize()
    layout = appMapControlsLayout({ ...state, windowWidth: size.width, windowHeight: size.height })
    nativeWindow.setStyle({
      left: `${layout.left}px`, top: `${layout.top}px`, width: `${layout.width}px`, height: `${layout.height}px`, background: 'transparent'
    })
    publish({ ...state, layout })
    if (!shown) nativeWindow.show('none', 0)
    shown = true
  }
  return {
    attach(window) {
      if (disposed) return
      if (nativeWindow !== window) { if (nativeWindow) hide(); nativeWindow = window; shown = false }
      render()
    },
    update(next) { if (disposed) return; state = { ...state, ...next }; render() },
    activate(value) { if (disposed) return; active = !!value; render() },
    refresh() { render() },
    action(message) {
      if (disposed) return
      if (message?.type === 'ready') { render(); return }
      if (!active || !state.visible || !nativeWindow) return
      if (message?.type === 'basemap' && typeof message.value === 'boolean') onAction('basemap', message.value)
      else if (state.selectMode && ['cancel', 'center', 'locate', 'confirm'].includes(message?.type)) {
        if (message.type === 'confirm' && !hasValidMapCoordinates(state.latitude, state.longitude)) return
        onAction(message.type)
      }
    },
    dispose() { if (disposed) return; hide(); disposed = true; nativeWindow = null },
    getLayout() { return layout }
  }
}
