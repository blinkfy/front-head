<template>
  <map v-if="rendererFallback" v-show="!covered" :id="hostId + '-normal'" class="app-tencent-map"
    :latitude="latitude" :longitude="longitude" :scale="scale" :markers="markers" show-location
    @regionchange="$emit('regionchange', $event)" @markertap="$emit('markertap', $event)" @tap="$emit('tap', $event)" />
  <view v-else :id="hostId" class="app-tencent-map" :map-packet="packet" :change:map-packet="mapView.update" />
</template>

<script>
import { mapConfig } from '@/api/map-config.js'
import manifest from '../manifest.json'
import { baseUrl } from '@/api/settings.js'
import { getCurrentInstance } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import { startLocalMapServer, stopLocalMapServer } from '@/uni_modules/ftx-map-local-server'
let serial = 0
export default {
  props: {
    latitude: [Number, String], longitude: [Number, String], scale: [Number, String],
    enableSatellite: Boolean, covered: Boolean, markers: { type: Array, default: () => [] },
    userLocation: { type: Object, default: () => ({}) }
  },
  emits: ['updated', 'error', 'regionchange', 'tap', 'markertap'],
  data() {
    return { hostId: `app-tencent-map-${Date.now()}-${++serial}`, command: null, rendererFallback: false, mapActive: true, mapDisposed: false,
      assetBase: baseUrl.replace(/\/$/, '') + '/web/',
      frameUrl: baseUrl.replace(/\/$/, '') + '/web/static/app-map/index.html' }
  },
  watch: {
    enableSatellite(value) {
      if (value && this.rendererFallback) this.$emit('error', { detail: { code: 'renderer_unavailable', satellite: true } })
    }
  },
  computed: {
    packet() {
      const key = mapConfig.qqMapKey || mapConfig.qqMapKeyBackup || manifest['app-plus']?.distribute?.sdkConfigs?.maps?.tencent?.key
      return { hostId: this.hostId, active: this.mapActive, disposed: this.mapDisposed, key, assetBase: this.assetBase, frameUrl: this.frameUrl,
        latitude: this.latitude, longitude: this.longitude, scale: this.scale,
        satellite: this.enableSatellite, markers: this.markers, userLocation: this.userLocation, command: this.command }
    }
  },
  created() {
    this.pendingCenters = new Map()
    this.querySerial = 0
    this.localMapBase = ''
    this.isAndroidMap = uni.getSystemInfoSync().platform === 'android'
    this.prepareLocalMapServer()
    const page = getCurrentInstance()?.root
    onShow(() => { this.prepareLocalMapServer(); this.mapActive = true }, page)
    onHide(() => { this.mapActive = false }, page)
    onUnload(() => { this.mapActive = false; this.mapDisposed = true; this.releaseLocalMapServer() }, page)
  },
  beforeUnmount() {
    this.mapActive = false
    this.mapDisposed = true
    this.releaseLocalMapServer()
    this.pendingCenters.forEach(query => { clearTimeout(query.timer); query.fail?.({ errMsg: 'map disposed' }) })
    this.pendingCenters.clear()
  },
  methods: {
    prepareLocalMapServer() {
      if (!this.isAndroidMap || this.localMapBase) return
      try {
        const url = startLocalMapServer()
        if (!/^http:\/\/127\.0\.0\.1:\d+\/[^/]+\/$/.test(url || '')) throw new Error('local_module_unavailable')
        this.localMapBase = url
        this.assetBase = url
        this.frameUrl = url + 'index.html'
        this.rendererFallback = false
        console.info('[app-map-basemap] local_server_ready')
      } catch (_) {
        this.rendererFallback = true
        console.warn('[app-map-basemap] local_server_unavailable; rebuild Android base with ftx-map-local-server')
        this.$nextTick(() => this.$emit('error', { detail: { code: 'local_server_unavailable', satellite: this.enableSatellite } }))
      }
    },
    releaseLocalMapServer() {
      if (!this.localMapBase) return
      const url = this.localMapBase
      this.localMapBase = ''
      try { stopLocalMapServer(url) } catch (_) { /* Old bases can lack native methods. */ }
    },
    moveToLocation(options = {}) {
      if (this.rendererFallback) {
        uni.createMapContext(this.hostId + '-normal', this).moveToLocation(options)
        return
      }
      const latitude = Number(options.latitude ?? this.userLocation?.latitude)
      const longitude = Number(options.longitude ?? this.userLocation?.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        options.fail?.({ errMsg: 'invalid location' })
        return
      }
      this.command = { id: ++this.querySerial, type: 'move', latitude, longitude }
      options.success?.({ errMsg: 'moveToLocation:ok' })
    },
    getCenterLocation(options = {}) {
      if (this.rendererFallback) {
        uni.createMapContext(this.hostId + '-normal', this).getCenterLocation(options)
        return
      }
      const id = ++this.querySerial
      const timer = setTimeout(() => {
        this.pendingCenters.delete(id)
        options.fail?.({ errMsg: 'map not ready' })
      }, 5000)
      this.pendingCenters.set(id, { ...options, timer })
      this.command = { id }
    },
    onMapEvent(event) {
      if (this.mapDisposed || (!this.mapActive && event.type !== 'updated')) return
      if (event.type === 'error' && ['frame_load_failed', 'sdk_load_failed', 'map_render_failed'].includes(event.detail?.code)) {
        // Older WebViews without GL support keep the original ordinary map usable.
        this.rendererFallback = true
        this.releaseLocalMapServer()
      }
      if (event.type === 'center') {
        const query = this.pendingCenters.get(event.detail.requestId)
        if (query) { clearTimeout(query.timer); this.pendingCenters.delete(event.detail.requestId); query.success?.(event.detail) }
        return
      }
      if (['phase', 'switching', 'updated', 'error'].includes(event.type)) {
        console[event.type === 'error' ? 'warn' : 'info']('[app-map-basemap] ' + event.type + ' ' + JSON.stringify(event.detail || {}))
      }
      if (!['phase', 'switching'].includes(event.type)) this.$emit(event.type, { detail: event.detail })
    }
  }
}
</script>

<script module="mapView" lang="renderjs">
// Tencent GL rejects file://. Only the HTTP(S) iframe loads the map SDK.
export default {
  mounted() { if (this.latestPacket) this.update(this.latestPacket, null, this.owner) },
  methods: {
    update(packet, previous, owner) {
      if (!packet?.hostId) return
      this.latestPacket = packet
      this.owner = owner || this.owner || this.$ownerInstance
      cancelAnimationFrame(this.pendingFrame)
      if (packet.disposed) { this.disposeFrame(); return }
      if (packet.active === false) return
      this.pendingFrame = requestAnimationFrame(() => this.renderFrame())
    },
    disposeFrame() {
      this.stopped = true
      clearTimeout(this.frameTimer)
      this.detachObserver?.disconnect()
      if (this.frameListener) window.removeEventListener('message', this.frameListener)
      this.frame?.remove()
      this.frame = null
    },
    renderFrame() {
      const packet = this.latestPacket
      if (packet.active === false) return
      const host = document.getElementById(packet.hostId)
      if (!host) return
      if (this.frame && (this.frameHost !== host || this.currentFrameUrl !== packet.frameUrl)) this.disposeFrame()
      this.stopped = false
      if (this.frame) { this.sendPacket(); return }
      this.frameHost = host
      this.currentFrameUrl = packet.frameUrl
      let target
      try {
        target = new URL(packet.frameUrl)
        if (!['http:', 'https:'].includes(target.protocol)) throw new Error('unsupported_protocol')
      } catch (_) { this.sendEvent({ type: 'error', detail: { code: 'frame_load_failed', satellite: packet.satellite } }); return }
      this.frameOrigin = target.origin
      this.token = packet.hostId + '-' + Math.random().toString(36).slice(2)
      const frame = document.createElement('iframe')
      this.frame = frame
      frame.title = '地图'
      frame.style.cssText = 'display:block;width:100%;height:100%;border:0;'
      this.frameListener = event => {
        if (this.stopped || this.frame !== frame) return
        if (event.source !== frame.contentWindow || event.origin !== this.frameOrigin) return
        const message = event.data
        if (message?.channel !== 'app-tencent-map' || message.token !== this.token || !message.event) return
        if (message.event.type === 'frame-ready') {
          clearTimeout(this.frameTimer)
          this.frameReady = true
          this.sendEvent({ type: 'phase', detail: { phase: 'http_frame_ready', satellite: this.latestPacket.satellite } })
          this.sendPacket()
        } else this.sendEvent(message.event)
      }
      window.addEventListener('message', this.frameListener)
      this.frameTimer = setTimeout(() => {
        if (this.stopped || this.frame !== frame) return
        this.sendEvent({ type: 'error', detail: { code: 'frame_load_failed', satellite: this.latestPacket.satellite } })
      }, 20000)
      frame.onload = () => { if (!this.stopped && this.frame === frame) this.sendPacket() }
      frame.onerror = () => {
        if (this.stopped || this.frame !== frame) return
        clearTimeout(this.frameTimer)
        this.sendEvent({ type: 'error', detail: { code: 'frame_load_failed', satellite: this.latestPacket.satellite } })
      }
      frame.src = target.href.split('#')[0] + '#' + encodeURIComponent(this.token)
      host.appendChild(frame)
      this.sendEvent({ type: 'phase', detail: { phase: 'http_frame_loading', origin: target.origin, satellite: packet.satellite } })
      this.detachObserver = new MutationObserver(() => {
        if (host.isConnected) return
        if (this.frameHost === host) this.disposeFrame()
      })
      this.detachObserver.observe(document.documentElement, { childList: true, subtree: true })
    },
    sendPacket() {
      if (!this.frame?.contentWindow || this.stopped || this.latestPacket.active === false || this.latestPacket.disposed) return
      this.frame.contentWindow.postMessage({ channel: 'app-tencent-map', token: this.token,
        packet: JSON.parse(JSON.stringify(this.latestPacket)) }, this.frameOrigin)
    },
    sendEvent(event) {
      if (this.stopped) return
      if (['phase', 'error', 'updated'].includes(event.type)) console.info('[app-map-render] ' + event.type + ' ' + JSON.stringify(event.detail || {}))
      this.owner?.callMethod('onMapEvent', event)
    }
  }
}
</script>

<style scoped>
.app-tencent-map { width: 100%; height: 100%; }
</style>
