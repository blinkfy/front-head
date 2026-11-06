<template>
  <view class="live-page" :class="{ dark: darkTheme }">
    <view class="header">
      <button class="back" aria-label="退出位置共享" @click="leave"><ManifestIcon id="back" size="22px" /></button>
      <view class="heading"><text class="title">实时位置</text><text class="subtitle">与 {{ peer.name || '联系人' }}</text></view>
      <text v-if="state.phase === 'sharing'" class="live-tag">共享中</text>
    </view>
    <view class="privacy-note"><view class="green-dot"></view><text>{{ appRealtime ? '共享期间可切换应用，可随时在通知栏停止' : '仅在本页共享我的位置，退出即停止' }}</text></view>
    <view class="map-stage">
      <!-- #ifdef APP-PLUS || H5 -->
      <AppTencentMap v-if="!localError && state.selfPoint && state.phase === 'sharing'" ref="map" class="live-map"
        :latitude="center.latitude" :longitude="center.longitude" :scale="16" :markers="markers" :user-location="selfDisplay"
        @error="mapError = true" @updated="mapError = false" />
      <!-- #endif -->
      <view v-if="localError || !state.selfPoint || state.phase !== 'sharing'" class="map-empty">
        <ManifestIcon id="map_location" size="64px" />
        <text class="empty-title">{{ statusTitle }}</text>
        <text class="empty-copy">{{ statusCopy }}</text>
      </view>
    </view>
    <view class="info-panel">
      <text v-if="mapError" class="map-error">地图暂不可用；共享状态和位置更新仍可在下方查看。</text>
      <view class="member-row">
        <view class="member-icon self">我</view>
        <view class="member-copy"><text class="member-name">我的位置</text><text class="member-status">{{ pointLabel(state.selfPoint, true) }}</text></view>
        <button v-if="state.selfPoint" class="locate" @click="recenter">定位</button>
      </view>
      <view class="member-row peer-row">
        <view class="member-icon other">{{ (peer.name || '对方').slice(0, 1) }}</view>
        <view class="member-copy"><text class="member-name">{{ peer.name || '联系人' }}</text><text class="member-status">{{ pointLabel(state.peerPoint, false) }}</text></view>
      </view>
      <text v-if="!localError && distanceLabel" class="distance">{{ distanceLabel }}</text>
      <text v-if="state.phase === 'sharing' && !state.peerJoined" class="waiting-note">对方当前未共享位置，点击聊天顶部的入口可加入。双方都退出后结束本次共享。</text>
      <text v-if="state.phase === 'ended'" class="end-note">{{ statusCopy }}</text>
      <button class="stop-button" @click="leave">{{ state.phase === 'ended' ? '返回聊天' : '退出共享并返回' }}</button>
      <button v-if="appRealtime && state.phase === 'sharing'" class="locate minimize-button" @click="minimize">返回聊天，继续共享</button>
    </view>
  </view>
</template>

<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
// #ifdef APP-PLUS || H5
import AppTencentMap from '@/components/AppTencentMap.vue'
// #endif
import { liveLocations, liveLocationState } from '@/utils/live-location.js'
import { LOCATION_END_LABELS, locationDistance } from '@/utils/live-location-core.mjs'
import { wgs84ToGcj02 } from '@/utils/live-location-coordinates.mjs'
import { ThemeManager } from '@/utils/theme.js'
import { androidRealtimeAvailable, androidBackgroundMask } from '@/utils/android-realtime.js'

export default {
  components: { ManifestIcon,
    // #ifdef APP-PLUS || H5
    AppTencentMap
    // #endif
  },
  data() { return { state: liveLocationState, peer: { id: '', name: '' }, center: { latitude: 39.908, longitude: 116.397 },
    initializedCenter: false, darkTheme: ThemeManager.getTheme() === 'dark', mapError: false, now: Date.now(), timer: null, localError: '', ownedId: '', appRealtime: androidRealtimeAvailable(), minimized: false } },
  computed: {
    selfDisplay() { return this.state.selfPoint ? wgs84ToGcj02(this.state.selfPoint.latitude, this.state.selfPoint.longitude) : {} },
    markers() {
      if (!this.state.peerPoint || this.state.phase !== 'sharing') return []
      const point = wgs84ToGcj02(this.state.peerPoint.latitude, this.state.peerPoint.longitude)
      return [{ id: 2, ...point, title: this.peer.name || '对方', iconPath: '/static/normal-marker.png', width: 32, height: 36,
        anchor: { x: 0.5, y: 1 }, callout: { content: this.peer.name || '对方', display: 'ALWAYS', color: '#fff', bgColor: '#168362', padding: 7, borderRadius: 8 } }]
    },
    statusTitle() { return this.state.phase === 'ended' || this.localError ? '位置共享未进行' : this.state.locating ? '正在获取我的位置' : '正在进入位置共享' },
    statusCopy() { return this.localError || LOCATION_END_LABELS[this.state.reason] || '进入后开始共享自己的位置，请允许定位权限。' },
    distanceLabel() {
      if (!this.state.selfPoint || !this.state.peerPoint) return ''
      const distance = locationDistance(this.state.selfPoint, this.state.peerPoint)
      return `相距约 ${distance < 1000 ? `${Math.round(distance)} 米` : `${(distance / 1000).toFixed(1)} 公里`} · 以定位精度为准`
    }
  },
  watch: {
    'state.selfPoint'(point) {
      if (!point) { this.center = { latitude: 39.908, longitude: 116.397 }; this.initializedCenter = false }
      else if (!this.initializedCenter) { this.initializedCenter = true; this.center = wgs84ToGcj02(point.latitude, point.longitude) }
    }
  },
  onLoad(query) {
    this.peer = { id: String(query.peerId || ''), name: String(query.name || '联系人').slice(0, 80) }
    try {
      if (!(this.appRealtime && liveLocationState.phase === 'sharing' && String(liveLocationState.peer?.id) === this.peer.id)) liveLocations.enter(this.peer, String(query.sessionId || ''))
      this.ownedId = liveLocationState.sessionId
      if (this.state.selfPoint) { this.initializedCenter = true; this.center = { ...this.selfDisplay } }
    }
    catch (error) { this.localError = error.message || '暂时无法进入位置共享' }
    // Display-only age clock. It does not request or transmit locations.
    this.timer = setInterval(() => { this.now = Date.now() }, 1000)
  },
  onHide() { if (!(this.appRealtime && (androidBackgroundMask() & 2))) this.stop() },
  onUnload() { if (!this.minimized) this.stop(); else { clearInterval(this.timer); this.timer = null } },
  onBackPress() { if (!this.minimized) this.stop(); return false },
  methods: {
    stop() {
      clearInterval(this.timer); this.timer = null
      if (this.ownedId && this.ownedId === this.state.sessionId) liveLocations.end('left')
      this.center = { latitude: 39.908, longitude: 116.397 }; this.initializedCenter = false
    },
    leave() {
      this.stop()
      if (getCurrentPages().length > 1) uni.navigateBack()
      else uni.redirectTo({ url: '/pages-nonTheme/chatlist' })
    },
    minimize() {
      if (!(androidBackgroundMask() & 2)) { uni.showToast({ title: '后台定位服务尚未就绪', icon: 'none' }); return }
      this.minimized = true
      if (getCurrentPages().length > 1) uni.navigateBack(); else uni.redirectTo({ url: '/pages-nonTheme/chatlist' })
    },
    recenter() {
      this.center = { ...this.selfDisplay }
      this.$refs.map?.moveToLocation({ ...this.selfDisplay })
    },
    pointLabel(point, self) {
      if (this.localError) return '未进入位置共享'
      if (this.state.phase === 'ended') return '已停止共享'
      if (!point) return self ? '正在定位…' : this.state.peerJoined ? '已加入，正在定位…' : '等待对方进入'
      const age = Math.max(0, Math.floor((this.now - point.updatedAt) / 1000))
      const time = age < 5 ? '刚刚更新' : `${age} 秒前更新${age > 45 ? ' · 位置可能已过时' : ''}`
      return `${time} · 精度约 ${Math.round(point.accuracy)} 米`
    }
  }
}
</script>

<style scoped>
.live-page { min-height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; background: #f2f6f3; color: #243b31; padding-top: var(--status-bar-height, 0px); }
.header { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; }
.back { width: 36px; height: 36px; padding: 0; margin: 0; background: #e4ede7; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
button::after { border: 0; }
.heading { flex: 1; min-width: 0; }
.title, .subtitle { display: block; }
.title { font-size: 19px; font-weight: 600; }
.subtitle { font-size: 12px; color: #78887e; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.live-tag { font-size: 12px; background: #dceee3; color: #16784e; padding: 5px 10px; border-radius: 20px; flex: none; }
.privacy-note { display: flex; align-items: center; gap: 7px; padding: 0 22px 14px; font-size: 12px; color: #75867b; }
.green-dot { width: 6px; height: 6px; border-radius: 50%; background: #19835f; }
.map-stage { position: relative; height: 48vh; min-height: 230px; margin: 0 16px; border-radius: 20px; overflow: hidden; background: #e0e9e2; }
.live-map { width: 100%; height: 100%; }
.map-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; box-sizing: border-box; text-align: center; }
.empty-title { font-size: 17px; font-weight: 600; }
.empty-copy { font-size: 13px; line-height: 1.7; color: #6a7c70; }
.info-panel { padding: 12px 22px calc(20px + env(safe-area-inset-bottom)); }
.member-row { display: flex; align-items: center; gap: 12px; padding: 14px 0; }
.peer-row { border-top: 1px solid #dfe8e1; }
.member-icon { width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex: none; font-size: 14px; }
.self { background: #deebfd; color: #317ad8; }.other { background: #d9eee2; color: #24825b; }
.member-copy { flex: 1; min-width: 0; }.member-name { display: block; font-size: 15px; overflow-wrap: anywhere; }.member-status { display: block; font-size: 11px; color: #798a7e; margin-top: 5px; line-height: 1.5; }
.locate { font-size: 12px; color: #19835f; background: #e3eee6; border-radius: 18px; padding: 0 14px; margin: 0; }
.distance { display: block; color: #28815a; font-size: 12px; margin: 5px 0 12px; text-align: center; }
.waiting-note, .end-note, .map-error { display: block; font-size: 12px; line-height: 1.6; color: #7c8a80; margin: 6px 0 14px; }.map-error { color: #a26e32; }
.stop-button { width: 100%; border-radius: 12px; color: #fff; background: #19835f; font-size: 14px; margin: 8px 0 0; }
.minimize-button { width: 100%; margin-top: 10px; }
.dark { background: #17231e; color: #e3eee6; }.dark .map-stage { background: #26382d; }.dark .back { background: #2e4436; }.dark .peer-row { border-color: #35463b; }.dark .live-tag, .dark .locate { background: #2b4d38; color: #b4dcc2; }
</style>
