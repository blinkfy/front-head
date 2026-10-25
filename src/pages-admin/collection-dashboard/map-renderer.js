import { n, sev, clampFill, displaySlotState, fmtTime } from './format.js'

export function createCollectionMapRenderer({ _state, monitor, mapMarkers, mapPolyline, mapCenter, mapScale, DEFAULT_CENTER, selectedBinId, selectedStopOrder, routeStrategy, isLightTheme, focusDispatchCase, renderLists }) {
  function buildMpMapData() {
    const bins = _state.bins || []
    const colorMap = { green: '#16c57c', amber: '#f5b648', orange: '#ff8b3d', red: '#ff5d66' }
    const markers = bins.map((bin, i) => ({
      id: i,
      latitude: n(bin.latitude, 0),
      longitude: n(bin.longitude, 0),
      title: bin.name,
      iconPath: bin.type === 'smart' ? '/static/smart-marker.png' : '/static/normal-marker.png',
      label: { content: String(bin.name || '').slice(0, 4), color: '#fff', fontSize: 10, bgColor: colorMap[sev(bin.currentFill)] || '#2c8fff', padding: 3, borderRadius: 4 },
      width: 24, height: 24,
      callout: { content: `${bin.name}\n满载率 ${clampFill(bin.currentFill).toFixed(1)}%`, display: 'BYCLICK', color: '#17324a', fontSize: 12, borderRadius: 6, bgColor: '#fff', padding: 6 }
    }))

    const route = _state.plan && _state.plan.route
    const polylineArr = []
    if (route && Array.isArray(route.polyline) && route.polyline.length > 1) {
      polylineArr.push({
        points: route.polyline.map(p => ({ latitude: p[0], longitude: p[1] })),
        color: '#2dc6ffcc', width: 6
      })
    }

    mapMarkers.value = markers
    mapPolyline.value = polylineArr

    if (_state.startPoint) {
      mapCenter.value = { latitude: _state.startPoint.latitude, longitude: _state.startPoint.longitude }
    } else if (bins.length) {
      mapCenter.value = { latitude: n(bins[0].latitude, DEFAULT_CENTER.latitude), longitude: n(bins[0].longitude, DEFAULT_CENTER.longitude) }
    }
  }

  // ─── H5 腾讯地图 ───────────────────────────────────────
  // #ifdef H5
  function markerSvg(fillColor, label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="14" fill="${fillColor}" stroke="#fff" stroke-width="3"></circle><text x="22" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Arial">${label}</text></svg>`
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  }
  function iconSrc(key, fillColor, label) {
    if (_state.iconCache.has(key)) return _state.iconCache.get(key)
    const src = markerSvg(fillColor, label)
    _state.iconCache.set(key, src); return src
  }
  function mapSignature() {
    const bins = (_state.bins || []).map(b => `${b.id}:${Math.round(n(b.currentFill, 0) * 10) / 10}`).join('|')
    const route = _state.plan && _state.plan.route
    const stops = route && Array.isArray(route.stops) ? route.stops.map(s => `${s.order}:${s.id}`).join('|') : 'none'
    const polyline = route && Array.isArray(route.polyline) ? route.polyline : []
    const polylineMeta = polyline.length
      ? `${polyline.length}:${polyline[0][0]},${polyline[0][1]}:${polyline[polyline.length - 1][0]},${polyline[polyline.length - 1][1]}`
      : 'none'
    const segmentMeta = route && Array.isArray(route.segments)
      ? route.segments.map(segment => Array.isArray(segment && segment.polyline) ? segment.polyline.length : 0).join(',')
      : 'none'
    const startMeta = _state.startPoint
      ? `${n(_state.startPoint.latitude, 0)},${n(_state.startPoint.longitude, 0)}`
      : 'none'
    const generatedAt = _state.plan && _state.plan.generatedAt ? String(_state.plan.generatedAt) : 'none'
    const monitorMeta = monitor.active
      ? `${monitor.scene}:${monitor.activeDispatchCaseId}:${(monitor.dispatchCases || []).map(item =>
          `${item.id}-${item.pointState}-${Math.round(item.returnProgress * 100)}-${Math.round(item.replaceProgress * 100)}`
        ).join('|')}`
      : 'off'
    return `${bins}::${stops}::poly-${polylineMeta}::seg-${segmentMeta}::start-${startMeta}::gen-${generatedAt}::sel-${selectedBinId.value || ''}-${selectedStopOrder.value || ''}-${routeStrategy.value}::monitor-${monitorMeta}`
  }
  function clearH5Map() {
    const s = _state
    if (s.binMarkers) { s.binMarkers.setMap(null); s.binMarkers = null }
    if (s.routePolyline) { s.routePolyline.setMap(null); s.routePolyline = null }
    if (s.sequenceMarkers) { s.sequenceMarkers.setMap(null); s.sequenceMarkers = null }
    if (s.startMarker) { s.startMarker.setMap(null); s.startMarker = null }
    if (s.focusPolyline) { s.focusPolyline.setMap(null); s.focusPolyline = null }
    if (s.monitorMarkers) { s.monitorMarkers.setMap(null); s.monitorMarkers = null }
    if (s.monitorPolyline) { s.monitorPolyline.setMap(null); s.monitorPolyline = null }
  }
  function showInfoWindow(lat, lng, html) {
    if (!window.TMap || !_state.mapInstance) return
    const point = new window.TMap.LatLng(lat, lng)
    if (!_state.infoWindow) {
      _state.infoWindow = new window.TMap.InfoWindow({ map: _state.mapInstance, position: point, content: html }); return
    }
    _state.infoWindow.setMap(_state.mapInstance)
    _state.infoWindow.setPosition(point)
    _state.infoWindow.setContent(html)
  }
  function drawMap(force) {
    if (!_state.mapInstance || !window.TMap) return
    const sig = mapSignature()
    if (!force && sig === _state.lastMapSignature) return
    _state.lastMapSignature = sig
    clearH5Map()

    const TMap = window.TMap
    const bins = _state.bins || []
    const bounds = new TMap.LatLngBounds()
    let hasBounds = false
    const colorMap = { green: '#16c57c', amber: '#f5b648', orange: '#ff8b3d', red: '#ff5d66', selected: '#2c8fff' }
    const styles = {}
    Object.entries(colorMap).forEach(([k, c]) => {
      styles[k] = new TMap.MarkerStyle({ width: k === 'selected' ? 30 : 24, height: k === 'selected' ? 30 : 24, anchor: { x: k === 'selected' ? 15 : 12, y: k === 'selected' ? 15 : 12 }, src: iconSrc(k, c, k === 'selected' ? 'X' : '') })
    })

    const geometries = bins.map((bin, i) => {
      const pos = new TMap.LatLng(n(bin.latitude, 0), n(bin.longitude, 0))
      bounds.extend(pos); hasBounds = true
      const isMonitorTarget = monitor.active
        && ['dispatch', 'sorting'].includes(monitor.scene)
        && (monitor.dispatchCases || []).some(item => String(item.binId) === String(bin.id))
      const styleId = isMonitorTarget
        ? (monitor.pointStateCls === 'available' ? 'green' : 'red')
        : selectedBinId.value && String(selectedBinId.value) === String(bin.id)
          ? 'selected'
          : sev(clampFill(bin.currentFill))
      return { id: `bin-${bin.id}-${i}`, styleId, position: pos, properties: { i } }
    })
    if (geometries.length) {
      _state.binMarkers = new TMap.MultiMarker({ id: 'db-bins', map: _state.mapInstance, styles, geometries })
      _state.binMarkers.on('click', evt => {
        const i = evt?.geometry?.properties?.i
        if (!Number.isFinite(i) || !bins[i]) return
        focusBin(bins[i].id, true)
      })
    }

    if (_state.startPoint) {
      const sp = new TMap.LatLng(_state.startPoint.latitude, _state.startPoint.longitude)
      _state.startMarker = new TMap.MultiMarker({ id: 'db-start', map: _state.mapInstance, styles: { s: new TMap.MarkerStyle({ width: 28, height: 28, anchor: { x: 14, y: 14 }, src: iconSrc('start', '#2c8fff', 'S') }) }, geometries: [{ id: 'start-1', styleId: 's', position: sp }] })
      bounds.extend(sp); hasBounds = true
    }

    const route = _state.plan && _state.plan.route
    if (!monitor.active && route && Array.isArray(route.polyline) && route.polyline.length > 1) {
      const polyline = route.polyline.map(p => new TMap.LatLng(p[0], p[1]))
      _state.routePolyline = new TMap.MultiPolyline({ id: 'db-route', map: _state.mapInstance, styles: { route: new TMap.PolylineStyle({ color: isLightTheme.value ? '#18a77c' : '#2dc6ff', width: 6, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }) }, geometries: [{ id: 'main', styleId: 'route', paths: polyline }] })
      polyline.forEach(p => { bounds.extend(p); hasBounds = true })

      const stopStyles = {}
      const stopGeos = (route.stops || []).map((stop, idx) => {
        const focused = selectedStopOrder.value === Number(stop.order)
        const sid = focused ? `focus-${stop.order}` : `stop-${stop.order}`
        if (!stopStyles[sid]) stopStyles[sid] = new TMap.MarkerStyle({ width: focused ? 28 : 24, height: focused ? 28 : 24, anchor: { x: focused ? 14 : 12, y: focused ? 14 : 12 }, src: iconSrc(sid, focused ? '#ff9f42' : '#1f7eff', String(stop.order)) })
        return { id: `stop-${idx}`, styleId: sid, position: new TMap.LatLng(stop.latitude, stop.longitude), properties: { order: stop.order } }
      })
      if (stopGeos.length) {
        _state.sequenceMarkers = new TMap.MultiMarker({ id: 'db-seq', map: _state.mapInstance, styles: stopStyles, geometries: stopGeos })
        _state.sequenceMarkers.on('click', evt => {
          const order = evt?.geometry?.properties?.order
          if (!Number.isFinite(order)) return
          focusStop(order, true)
        })
      }

      if (selectedStopOrder.value !== null) {
        const idx = (route.stops || []).findIndex(s => Number(s.order) === Number(selectedStopOrder.value))
        if (idx >= 0) {
          const stop = route.stops[idx]
          const segmentPoints = Array.isArray(stop.segmentPolyline) && stop.segmentPolyline.length > 1
            ? stop.segmentPolyline
            : (route.segments && Array.isArray(route.segments[idx] && route.segments[idx].polyline) && route.segments[idx].polyline.length > 1
              ? route.segments[idx].polyline
              : null)
          if (segmentPoints) {
            _state.focusPolyline = new TMap.MultiPolyline({
              id: 'db-focus',
              map: _state.mapInstance,
              styles: { focus: new TMap.PolylineStyle({ color: '#ffb04a', width: 7, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }) },
              geometries: [{ id: 'focus', styleId: 'focus', paths: segmentPoints.map(p => new TMap.LatLng(p[0], p[1])) }]
            })
          }
        }
      }
    }
    if (monitor.active && monitor.scene === 'dispatch' && monitor.dispatchCases.length) {
      const monitorStyles = {
        sorting: new TMap.MarkerStyle({ width: 34, height: 34, anchor: { x: 17, y: 17 }, src: iconSrc('monitor-sorting', '#8859ff', '分') }),
        standby: new TMap.MarkerStyle({ width: 32, height: 32, anchor: { x: 16, y: 16 }, src: iconSrc('monitor-standby', '#2c8fff', '备') }),
        returning: new TMap.MarkerStyle({ width: 34, height: 34, anchor: { x: 17, y: 17 }, src: iconSrc('monitor-returning', '#ff5d66', '返') }),
        replacing: new TMap.MarkerStyle({ width: 34, height: 34, anchor: { x: 17, y: 17 }, src: iconSrc('monitor-replacing', '#16c57c', '补') })
      }
      const firstAvailable = monitor.dispatchCases.find(item => item.routeAvailable) || monitor.dispatchCases[0]
      const monitorGeometries = []
      if (firstAvailable?.sortingCenter) {
        monitorGeometries.push({ id: 'sorting-center', styleId: 'sorting', position: new TMap.LatLng(firstAvailable.sortingCenter.latitude, firstAvailable.sortingCenter.longitude) })
      }
      if (firstAvailable?.standbyArea) {
        monitorGeometries.push({ id: 'standby-area', styleId: 'standby', position: new TMap.LatLng(firstAvailable.standbyArea.latitude, firstAvailable.standbyArea.longitude) })
      }
      monitor.dispatchCases.forEach((item) => {
        if (item.returnProgress < 1 && item.returnPosition) {
          monitorGeometries.push({ id: `returning-bin-${item.id}`, styleId: 'returning', position: new TMap.LatLng(item.returnPosition.latitude, item.returnPosition.longitude), properties: { caseId: item.id } })
        }
        if (item.replacePosition) {
          monitorGeometries.push({ id: `replacement-bin-${item.id}`, styleId: 'replacing', position: new TMap.LatLng(item.replacePosition.latitude, item.replacePosition.longitude), properties: { caseId: item.id } })
        }
      })
      _state.monitorMarkers = new TMap.MultiMarker({
        id: 'monitor-special-markers', map: _state.mapInstance, styles: monitorStyles, geometries: monitorGeometries
      })
      _state.monitorMarkers.on('click', evt => {
        const caseId = evt?.geometry?.properties?.caseId
        if (caseId) focusDispatchCase(caseId)
      })
      const routeStyles = {
        returning: new TMap.PolylineStyle({ color: '#ff5d66', width: 7, borderWidth: 2, borderColor: '#fff', lineCap: 'round' }),
        replacing: new TMap.PolylineStyle({ color: '#24d9ff', width: 7, borderWidth: 2, borderColor: '#fff', lineCap: 'round' })
      }
      const routeGeometries = []
      monitor.dispatchCases.forEach((item) => {
        if (item.returnRoute.length > 1) routeGeometries.push({ id: `return-route-${item.id}`, styleId: 'returning', paths: item.returnRoute.map(p => new TMap.LatLng(p[0], p[1])) })
        if (item.replaceRoute.length > 1) routeGeometries.push({ id: `replace-route-${item.id}`, styleId: 'replacing', paths: item.replaceRoute.map(p => new TMap.LatLng(p[0], p[1])) })
      })
      if (routeGeometries.length) {
        _state.monitorPolyline = new TMap.MultiPolyline({
          id: 'monitor-routes',
          map: _state.mapInstance,
          styles: routeStyles,
          geometries: routeGeometries
        })
      }
      monitor.dispatchCases.forEach((item) => {
        ;[item.targetPoint, item.sortingCenter, item.standbyArea].filter(Boolean).forEach(point => {
          bounds.extend(new TMap.LatLng(point.latitude, point.longitude))
          hasBounds = true
        })
      })
    }
    if (hasBounds && _state.mapInstance.fitBounds && (!monitor.active || _state.shouldFitMap)) {
      _state.mapInstance.fitBounds(bounds, { padding: 70 })
      _state.shouldFitMap = false
    }
  }

  function updateH5DispatchLayers(elapsed) {
    if (!_state.mapInstance || !window.TMap || !_state.monitorMarkers || !monitor.dispatchCases.length) return false
    const TMap = window.TMap
    const firstAvailable = monitor.dispatchCases.find(item => item.routeAvailable) || monitor.dispatchCases[0]
    const geometries = []
    if (firstAvailable?.sortingCenter) {
      geometries.push({ id: 'sorting-center', styleId: 'sorting', position: new TMap.LatLng(firstAvailable.sortingCenter.latitude, firstAvailable.sortingCenter.longitude) })
    }
    if (firstAvailable?.standbyArea) {
      geometries.push({ id: 'standby-area', styleId: 'standby', position: new TMap.LatLng(firstAvailable.standbyArea.latitude, firstAvailable.standbyArea.longitude) })
    }
    monitor.dispatchCases.forEach((item) => {
      if (!item.routeAvailable) return
      if (item.returnProgress < 1 && item.returnPosition) {
        geometries.push({ id: `returning-bin-${item.id}`, styleId: 'returning', position: new TMap.LatLng(item.returnPosition.latitude, item.returnPosition.longitude), properties: { caseId: item.id } })
      }
      if (item.replacePosition) {
        geometries.push({ id: `replacement-bin-${item.id}`, styleId: 'replacing', position: new TMap.LatLng(item.replacePosition.latitude, item.replacePosition.longitude), properties: { caseId: item.id } })
      }
    })

    if (typeof _state.monitorMarkers.setGeometries === 'function') {
      _state.monitorMarkers.setGeometries(geometries)
    } else if (typeof _state.monitorMarkers.updateGeometries === 'function') {
      _state.monitorMarkers.updateGeometries(geometries)
    } else {
      return false
    }

    if (_state.binMarkers && typeof _state.binMarkers.updateGeometries === 'function') {
      const updates = monitor.dispatchCases.map((item) => {
        const targetIndex = (_state.bins || []).findIndex(bin => String(bin.id) === String(item.binId))
        if (targetIndex < 0) return null
        const bin = _state.bins[targetIndex]
        return {
          id: `bin-${bin.id}-${targetIndex}`,
          styleId: item.pointStateCls === 'available' ? 'green' : 'red',
          position: new TMap.LatLng(n(bin.latitude, 0), n(bin.longitude, 0)),
          properties: { i: targetIndex }
        }
      }).filter(Boolean)
      if (updates.length) _state.binMarkers.updateGeometries(updates)
    }
    return true
  }
  // #endif

  // ─── 交互：聚焦 bin / stop ────────────────────────────
  function focusBin(binId, forceMap) {
    const bin = (_state.bins || []).find(item => String(item.id) === String(binId))
    if (!bin) return
    selectedBinId.value = String(bin.id)
    selectedStopOrder.value = null
    renderLists()
    // #ifdef H5
    if (_state.mapReady && _state.mapInstance) {
      _state.mapInstance.setCenter(new window.TMap.LatLng(bin.latitude, bin.longitude))
      showInfoWindow(bin.latitude, bin.longitude, `<div style="min-width:190px;padding:2px 4px"><div style="font-size:13px;font-weight:700;color:#17324a">${bin.pointCode || bin.name} · ${bin.pointName || ''}</div><div style="margin-top:4px;font-size:12px;color:#365066">桶体 ${bin.hasBin === false ? '无桶' : (bin.binCode || '--')} · ${displaySlotState(bin.slotState || '可用')}</div><div style="margin-top:2px;font-size:12px;color:#60778b">满载率 ${n(bin.currentFill, 0).toFixed(1)}% · 预测 ${n(bin.predictedFillInHorizon, 0).toFixed(1)}%</div></div>`)
    }
    drawMap(!!forceMap)
    // #endif
    // #ifndef H5
    mapCenter.value = { latitude: n(bin.latitude, DEFAULT_CENTER.latitude), longitude: n(bin.longitude, DEFAULT_CENTER.longitude) }
    mapScale.value = 14
    buildMpMapData()
    // #endif
  }
  function focusStop(order, forceMap) {
    const route = _state.plan && _state.plan.route
    if (!route || !Array.isArray(route.stops)) return
    const stop = route.stops.find(item => Number(item.order) === Number(order))
    if (!stop) return
    selectedStopOrder.value = Number(stop.order)
    selectedBinId.value = String(stop.id)
    renderLists()
    // #ifdef H5
    if (_state.mapReady && _state.mapInstance) {
      _state.mapInstance.setCenter(new window.TMap.LatLng(stop.latitude, stop.longitude))
      showInfoWindow(stop.latitude, stop.longitude, `<div style="min-width:185px;padding:2px 4px"><div style="font-size:13px;font-weight:700;color:#17324a">#${stop.order} ${stop.pointCode || stop.name}</div><div style="margin-top:4px;font-size:12px;color:#365066">${stop.pointName || ''} · ETA ${fmtTime(stop.eta)}</div><div style="margin-top:2px;font-size:12px;color:#60778b">桶体 ${stop.binCode || '--'} · 满载率 ${n(stop.currentFill, 0).toFixed(1)}%</div></div>`)
    }
    drawMap(!!forceMap)
    // #endif
    // #ifndef H5
    mapCenter.value = { latitude: n(stop.latitude, DEFAULT_CENTER.latitude), longitude: n(stop.longitude, DEFAULT_CENTER.longitude) }
    mapScale.value = 14
    buildMpMapData()
    // #endif
  }

  return {
    buildMpMapData,
    // #ifdef H5
    markerSvg, iconSrc, mapSignature, clearH5Map, showInfoWindow, drawMap, updateH5DispatchLayers,
    // #endif
    focusBin, focusStop
  }
}
