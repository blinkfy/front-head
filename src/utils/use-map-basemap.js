import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onReady, onUnload, onShow, onHide } from '@dcloudio/uni-app'
import { createMapBasemapController, isBinLocationPicker } from './map-basemap-core.mjs'
import { captureSatelliteReference } from './bin-satellite-reference.mjs'
// #ifdef APP-PLUS
import appManifest from '../manifest.json'
// #endif

export function useMapBasemap({ isH5, options, suspended, appWebMap = false }) {
  const satellite = ref(isBinLocationPicker(options))
  const basemapLoading = ref(false)
  let h5Map = null, nativeCallbacks = null, disposed = false
  const page = getCurrentInstance()?.root
  const isApp = ['app', 'app-plus'].includes(process.env.UNI_PLATFORM)
  let appReady = false
  let appPageHidden = false
  let lastAppWebUpdate = null
  let lastAppWebError = null
  let appRendererReady = false
  function nativeSupported() {
    // App capability reporting can return false even when its map SDK supports switching.
    if (isApp) return true
    if (process.env.UNI_PLATFORM === 'mp-weixin') {
      try { return typeof uni.canIUse !== 'function' || uni.canIUse('map.enable-satellite') } catch (_) { return false }
    }
    try { return typeof uni.canIUse === 'function' && uni.canIUse('map.enable-satellite') } catch (_) { return false }
  }
  function applyAppBasemap(enabled) {
    // #ifdef APP-PLUS
    const providers = appManifest['app-plus']?.distribute?.sdkConfigs?.maps || {}
    // Tencent's App renderer uses the component attribute, not plus.maps.
    if (providers.tencent && !providers.amap && !providers.baidu && !providers.google) return
    const context = uni.createMapContext('select-map', page?.proxy)
    const map = context?.$getAppMap?.()
    if (!map || typeof map.setMapType !== 'function') return
    const type = enabled ? plus.maps.MapType.MAPTYPE_SATELLITE : plus.maps.MapType.MAPTYPE_NORMAL
    if (typeof map.getMapType === 'function' && map.getMapType() === type) return true
    map.setMapType(type)
    if (typeof map.getMapType === 'function' && map.getMapType() !== type) throw new Error('Map type change failed')
    return true
    // #endif
  }
  const controller = createMapBasemapController({
    // A cold App start first loads the HTTP frame and its SDK.
    ...(isApp && appWebMap ? { timeoutMs: () => appRendererReady ? 10000 : 40000 } : {}),
    onChange: state => { satellite.value = state.satellite; basemapLoading.value = state.loading },
    onFallback: () => {
      if (isApp) console.warn('[app-map-basemap] fallback', { reason: 'load_failed_or_timeout' })
      uni.showToast({ title: '卫星图暂不可用，已切回普通地图', icon: 'none' })
    },
    apply: (enabled, callbacks) => {
      if (isH5) {
        if (!h5Map || typeof h5Map.setBaseMap !== 'function') return false
        const map = h5Map
        const loaded = () => callbacks.loaded()
        const failed = () => callbacks.failed()
        const changed = () => controller.refresh()
        const cleanup = () => {
          map.off?.('tilesloaded', loaded)
          map.off?.('error', failed)
          map.off?.('bounds_changed', changed)
        }
        try {
          if (enabled) {
            map.on('tilesloaded', loaded)
            map.on('error', failed)
            map.on('bounds_changed', changed)
          }
          map.setBaseMap(enabled ? { type: 'satellite', features: ['base', 'road'] } : { type: 'vector' })
          return cleanup
        } catch (error) { cleanup(); throw error }
      }
      if (enabled && !nativeSupported()) return false
      nativeCallbacks = callbacks
      if (isApp && appWebMap) {
        if (lastAppWebError?.satellite === enabled) callbacks.failed()
        else if (lastAppWebUpdate?.satellite === enabled) callbacks.loaded()
      } else if (isApp && appReady) {
        try { if (applyAppBasemap(enabled)) callbacks.loaded() } catch (_) { nativeCallbacks = null; return false }
      }
      return () => { if (nativeCallbacks === callbacks) nativeCallbacks = null }
    }
  })
  function setBasemap(enabled) {
    if (disposed) return
    // The SDK is still loading; keep the requested type until bindH5Map runs.
    if (isH5 && !h5Map) { satellite.value = !!enabled; return }
    if (isApp && satellite.value !== !!enabled) { lastAppWebUpdate = null; lastAppWebError = null }
    controller.request(enabled)
  }
  function bindH5Map(map) { h5Map = map; controller.request(satellite.value) }
  function getSatelliteReference(location, containerId) {
    // #ifdef H5
    if (isH5 && !disposed && isBinLocationPicker(options)) return captureSatelliteReference({
      map: h5Map, container: document.getElementById(containerId), location,
      satellite: satellite.value, loading: basemapLoading.value,
      toLatLng: point => new window.TMap.LatLng(Number(point.latitude), Number(point.longitude)),
      createCanvas: () => document.createElement('canvas')
    })
    // #endif
    return null
  }
  function onNativeMapUpdated(event) {
    if (disposed) return
    if (isApp && appWebMap) {
      if (event?.detail?.satellite !== satellite.value) return
      lastAppWebUpdate = event.detail
      lastAppWebError = null
      appRendererReady = true
    }
    if (appPageHidden || suspended?.()) return
    if (isApp && !appWebMap) {
      try { applyAppBasemap(satellite.value) } catch (_) { nativeCallbacks?.failed(); return }
    }
    nativeCallbacks?.loaded()
  }
  function onNativeMapError(event) {
    if (disposed || appPageHidden || suspended?.()) return
    if (isApp && appWebMap && event?.detail?.satellite !== satellite.value) return
    if (isApp && appWebMap) lastAppWebError = event.detail
    if (isApp) console.warn('[app-map-basemap] error ' + JSON.stringify({ code: event?.detail?.code || 'native_error', stage: event?.detail?.stage, message: event?.detail?.message }))
    nativeCallbacks?.failed()
  }
  function onNativeMapRegionChange(event) {
    // Panning is not a basemap request; cached tiles may produce no new load event.
    if (isApp && appWebMap) return
    if (event?.type === 'begin' || event?.detail?.type === 'begin') controller.refresh()
  }
  onMounted(() => { if (!isH5 && !isApp && !suspended?.()) controller.request(satellite.value) })
  onReady(() => {
    appReady = true
    if (isApp && !disposed && !suspended?.()) controller.request(satellite.value)
  }, page)
  onHide(() => {
    if (!isApp || disposed) return
    appPageHidden = true
    if (!appWebMap) { appRendererReady = false; lastAppWebUpdate = lastAppWebError = null }
    controller.pause()
  }, page)
  onShow(() => {
    if (!isApp || !appPageHidden || disposed) return
    appPageHidden = false
    nextTick(() => { if (appReady && !disposed && !suspended?.()) controller.request(satellite.value) })
  }, page)
  if (suspended) watch(suspended, hidden => {
    if (isH5 || disposed || appPageHidden) return
    if (hidden) {
      if (!isApp || !appWebMap) { lastAppWebUpdate = null; lastAppWebError = null; appRendererReady = false }
      controller.pause()
    }
    else nextTick(() => { if (!disposed && !suspended?.()) controller.request(satellite.value) })
  }, { flush: 'post' })
  function dispose() {
    if (disposed) return
    disposed = true; controller.dispose(); nativeCallbacks = null; h5Map = null
  }
  onBeforeUnmount(dispose)
  onUnload(dispose)
  return { satellite, basemapLoading, setBasemap, bindH5Map, getSatelliteReference, onNativeMapUpdated, onNativeMapError, onNativeMapRegionChange }
}
