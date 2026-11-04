export function normalizeChatDisposalPoints(input) {
  const seen = new Set()
  return (Array.isArray(input) ? input : []).slice(0, 3).flatMap(point => {
    const id = String(point?.id || '')
    const coordinate = value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value))
    if (!/^[1-9]\d{0,15}$/.test(id) || seen.has(id) || typeof point.name !== 'string' || !point.name.trim() ||
      !coordinate(point.latitude) || !coordinate(point.longitude) || Math.abs(Number(point.latitude)) > 90 || Math.abs(Number(point.longitude)) > 180) return []
    seen.add(id)
    return [{ id, name: point.name.trim().slice(0, 160), description: String(point.description || '').trim().slice(0, 300),
      ...(typeof point.reportReason === 'string' ? { reportReason: point.reportReason.trim().slice(0, 200) } : {}),
      latitude: Number(point.latitude), longitude: Number(point.longitude),
      ...(typeof point.distanceMeters === 'number' && Number.isFinite(point.distanceMeters) && point.distanceMeters >= 0 && point.distanceMeters <= 5000 ? { distanceMeters: Math.round(point.distanceMeters) } : {}),
      ...(typeof point.observedAt === 'string' && Number.isFinite(Date.parse(point.observedAt)) ? { observedAt: point.observedAt } : {}) }]
  })
}

export function disposalMapUrl(point, dark = false, reportReason = null) {
  const value = normalizeChatDisposalPoints([point])[0]
  if (!value) throw new Error('投放点信息无效')
  const page = dark ? '/pages-dark/map/map' : '/pages/map/map'
  const report = typeof reportReason === 'string' ? `&report=1&reason=${encodeURIComponent(reportReason.trim().slice(0, 200))}` : ''
  return `${page}?mode=view&pointId=${value.id}&lat=${value.latitude}&lng=${value.longitude}&name=${encodeURIComponent(value.name)}&address=${encodeURIComponent(value.description)}${report}`
}

export function disposalRouteUrl(point) {
  const value = normalizeChatDisposalPoints([point])[0]
  if (!value) throw new Error('投放点信息无效')
  const to = `${value.longitude},${value.latitude},${value.name.replace(/,/g, '，')}`
  return `https://uri.amap.com/navigation?to=${encodeURIComponent(to)}&mode=walk&src=fentouxia&coordinate=gaode&callnative=0`
}

// Refresh by platform ID before every action. Never navigate to model-generated coordinates
// or use stale history coordinates when a point has been removed/unapproved.
export function createDisposalActions({ loadPoint, navigateTo, openLocation, openRouteWindow, notify, onBusy, getScope, isCurrent = () => true }) {
  let busy = false
  return async function openPoint(point, action = 'map', dark = false) {
    const id = String(point?.id || '')
    if (busy || !/^[1-9]\d{0,15}$/.test(id) || !['map', 'route', 'report'].includes(action)) return
    const scope = getScope?.()
    busy = true
    onBusy?.(id)
    let routeWindow
    try {
      // Reserve the H5 window synchronously within the user gesture, before lookup.
      if (action === 'route' && openRouteWindow) routeWindow = openRouteWindow()
      const result = await loadPoint(id)
      if (!isCurrent(scope)) { routeWindow?.close?.(); return }
      const current = result?.code === 0 ? normalizeChatDisposalPoints([result.data])[0] : null
      if (!current || current.id !== id) throw new Error('投放点已移除或暂不可用')
      if (action === 'route' && openRouteWindow) {
        if (!routeWindow) throw new Error('请允许打开地图窗口后重试')
        routeWindow.location.href = disposalRouteUrl(current)
      } else if (action === 'route') {
        await openLocation({ latitude: current.latitude, longitude: current.longitude, name: current.name, address: current.description })
      } else {
        await navigateTo({ url: disposalMapUrl(current, dark, action === 'report' ? String(point.reportReason || '') : null) })
      }
    } catch (error) {
      routeWindow?.close?.()
      if (isCurrent(scope)) notify?.(error?.message || error?.msg || '暂时无法打开投放点，请稍后重试')
    } finally {
      busy = false
      onBusy?.('')
    }
  }
}
