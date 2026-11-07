<template>
  <view class="test-container" :class="{ 'dark-theme': isDark }">
    <view v-if="!adminVerified" class="test-section">正在验证管理员权限…</view>
    <template v-else>
      <view class="test-header">
        <text class="test-title">地图只读诊断</text>
        <text class="test-note">仅在点击后检查；配置检查不联网，定位可能请求系统权限。不会显示密钥或令牌。</text>
      </view>

      <view class="test-section">
        <text class="section-title">1. 当前平台地图配置</text>
        <text class="test-note">{{ platformDescription }}</text>
        <button class="test-btn" @click="checkConfig">检查本地配置</button>
        <view class="test-result">
          <text :class="statusClass(configStatus)">{{ statusLabel(configStatus) }}</text>
          <text>{{ configDetail }}</text>
        </view>
      </view>

      <view class="test-section">
        <text class="section-title">2. 定位</text>
        <text class="test-note">手动调用地图相关的定位工具；成功后才能检查附近接口。</text>
        <button class="test-btn" :disabled="locationStatus === 'running'" @click="testLocation">获取当前位置</button>
        <view class="test-result">
          <text :class="statusClass(locationStatus)">{{ statusLabel(locationStatus) }}</text>
          <text>{{ locationDetail }}</text>
          <text v-if="locationResult">纬度 {{ locationResult.latitude }} · 经度 {{ locationResult.longitude }}</text>
        </view>
      </view>

      <view class="test-section">
        <text class="section-title">3. 地图数据链路</text>
        <text class="test-note">使用当前坐标分别请求已登录的后端地点搜索、逆地址解析与垃圾桶列表接口。空列表与请求失败分开显示。</text>
        <input v-model="testKeyword" class="test-input" placeholder="输入地点关键词" maxlength="40" />
        <button class="test-btn" :disabled="!locationResult || dataRunning" @click="testData">检查附近数据</button>
        <view v-for="item in dataChecks" :key="item.key" class="test-result">
          <text class="result-title">{{ item.title }}</text>
          <text :class="statusClass(item.status)">{{ statusLabel(item.status) }}</text>
          <text>{{ item.detail }}</text>
        </view>
      </view>

      <view class="test-section">
        <text class="test-note">本页不加载地图画面；可进入地图页检查实际渲染与交互。</text>
        <button class="test-btn primary" @click="goToMap">进入地图页面</button>
      </view>
    </template>
  </view>
</template>

<script>
import { userinfo } from '@/api/user'
import { redirectToNoPermission } from '@/utils/access-guard.js'
import { mapConfig } from '@/api/map-config.js'
import { getTrashBinList, reverseGeocoder, searchPlaces } from '@/api/map.js'
import { getUserLocationOnce } from '@/utils/location.js'
import { isPermissionDenied } from '@/utils/feature-permission.js'
// #ifdef APP-PLUS
import manifest from '../manifest.json'
// #endif

const platform = process.env.UNI_PLATFORM
const isApp = ['app', 'app-plus'].includes(platform)
const emptyChecks = () => [
  { key: 'search', title: '地点搜索', status: 'idle', detail: '未运行' },
  { key: 'reverse', title: '逆地址解析', status: 'idle', detail: '未运行' },
  { key: 'bins', title: '垃圾桶列表', status: 'idle', detail: '未运行' }
]

function validPoint(point) {
  const latitude = Number(point?.latitude)
  const longitude = Number(point?.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}

function failureDetail(error, location = false) {
  if (location && isPermissionDenied(error)) return '定位权限未授予；请在系统或浏览器设置中允许后手动重试。'
  if (location && error?.code === 'LOCATION_TIMEOUT') return '定位超时，请检查定位服务后重试。'
  if (error?.code === 401 || error?.statusCode === 401) return '登录状态已失效，请重新登录。'
  if (error?.code === 403 || error?.statusCode === 403) return '当前账号无权访问该接口。'
  return location ? '定位失败，请检查设备定位与网络后重试。' : '请求失败，请检查网络、后端服务及其腾讯地图配置。'
}

export default {
  data() {
    return {
      adminVerified: false,
      verifiedToken: '',
      authVersion: 0,
      diagnosticVersion: 0,
      isDark: false,
      testKeyword: '小区',
      configStatus: 'idle',
      configDetail: '未运行',
      locationStatus: 'idle',
      locationDetail: '未运行',
      locationResult: null,
      dataRunning: false,
      dataChecks: emptyChecks()
    }
  },
  computed: {
    platformDescription() {
      if (platform === 'h5') return 'H5：地图页使用腾讯地图 GL JS 主密钥。'
      if (isApp) return 'APP：地图页使用腾讯地图 WebView，必要时回退到原生地图。'
      return '小程序：地图页使用宿主的原生 map 组件。'
    }
  },
  mounted() { uni.$on?.('app-theme-change', this.syncTheme) },
  beforeUnmount() {
    uni.$off?.('app-theme-change', this.syncTheme)
    this.invalidate()
  },
  async onShow() {
    this.syncTheme()
    this.invalidate()
    const version = ++this.authVersion
    const token = uni.getStorageSync('token')
    try {
      const response = token ? await userinfo('false') : null
      if (version !== this.authVersion || token !== uni.getStorageSync('token')) return
      if (response?.data?.isAdmin === true) {
        this.verifiedToken = token
        this.adminVerified = true
        return
      }
    } catch (_) {
      if (version !== this.authVersion || token !== uni.getStorageSync('token')) return
    }
    redirectToNoPermission({ from: '/pages-admin/test-map', reason: '地图功能测试仅向管理员开放。' })
  },
  onHide() { this.invalidate() },
  onUnload() { this.invalidate() },
  methods: {
    syncTheme() { this.isDark = uni.getStorageSync('app_theme') === 'dark' },
    invalidate() {
      this.authVersion++
      this.diagnosticVersion++
      this.adminVerified = false
      this.verifiedToken = ''
      this.configStatus = 'idle'
      this.configDetail = '未运行'
      this.locationStatus = 'idle'
      this.locationDetail = '未运行'
      this.locationResult = null
      this.dataRunning = false
      this.dataChecks = emptyChecks()
    },
    canRun() {
      if (!this.adminVerified) return false
      if (this.verifiedToken && this.verifiedToken === uni.getStorageSync('token')) return true
      this.invalidate()
      return false
    },
    isCurrent(version, token) {
      return version === this.diagnosticVersion && this.adminVerified && token === this.verifiedToken && token === uni.getStorageSync('token')
    },
    statusLabel(status) {
      return { idle: '未运行', running: '运行中', ok: '成功', empty: '无结果', fail: '失败', info: '需在地图页验证' }[status] || '未运行'
    },
    statusClass(status) { return `status-${status}` },
    checkConfig() {
      if (!this.canRun()) return
      if (platform === 'h5') {
        const configured = !!mapConfig.qqMapKey && mapConfig.qqMapKey !== 'YOUR_TENCENT_MAP_KEY'
        this.configStatus = configured ? 'ok' : 'fail'
        this.configDetail = configured ? '本地已声明 H5 地图主密钥；是否有效及能否渲染，须进入地图页验证。' : 'H5 地图主密钥未配置。'
      } else if (isApp) {
        const webConfigured = [mapConfig.qqMapKey, mapConfig.qqMapKeyBackup].some(key => key && key !== 'YOUR_TENCENT_MAP_KEY')
        let nativeConfigured = false
        // #ifdef APP-PLUS
        const nativeKey = manifest['app-plus']?.distribute?.sdkConfigs?.maps?.tencent?.key
        nativeConfigured = !!nativeKey && nativeKey !== 'YOUR_TENCENT_MAP_KEY'
        // #endif
        this.configStatus = webConfigured || nativeConfigured ? 'ok' : 'fail'
        this.configDetail = `WebView 密钥${webConfigured ? '已声明' : '未声明'}，原生回退密钥${nativeConfigured ? '已声明' : '未声明'}；实际渲染须进入地图页验证。`
      } else {
        this.configStatus = 'info'
        this.configDetail = '原生 map 由当前小程序宿主提供；本页无法静态判定其 SDK 配置或渲染结果。'
      }
    },
    async testLocation() {
      if (!this.canRun() || this.locationStatus === 'running') return
      const version = ++this.diagnosticVersion
      const token = this.verifiedToken
      this.locationResult = null
      this.locationStatus = 'running'
      this.locationDetail = '正在获取位置…'
      this.dataChecks = emptyChecks()
      this.dataRunning = false
      try {
        const point = await getUserLocationOnce('gcj02', { interactive: true, isCurrent: () => this.isCurrent(version, token) })
        if (!this.isCurrent(version, token)) return
        if (!validPoint(point)) throw new Error('invalid location')
        this.locationResult = { latitude: Number(point.latitude), longitude: Number(point.longitude) }
        this.locationStatus = 'ok'
        this.locationDetail = '已获取可用于附近接口的坐标。'
      } catch (error) {
        if (!this.isCurrent(version, token)) return
        this.locationStatus = 'fail'
        this.locationDetail = failureDetail(error, true)
      }
    },
    async testData() {
      if (!this.canRun() || !this.locationResult || this.dataRunning) return
      const keyword = this.testKeyword.trim()
      if (!keyword) {
        this.dataChecks[0] = { ...this.dataChecks[0], status: 'fail', detail: '请输入地点关键词后重试。' }
        return
      }
      const version = ++this.diagnosticVersion
      const token = this.verifiedToken
      const { latitude, longitude } = this.locationResult
      this.dataRunning = true
      this.dataChecks = this.dataChecks.map(item => ({ ...item, status: 'running', detail: '正在请求…' }))
      const results = await Promise.allSettled([
        searchPlaces(keyword, latitude, longitude, 1500),
        reverseGeocoder(latitude, longitude),
        getTrashBinList({ latitude, longitude, radius: 5000, page: 1, pageSize: 20 })
      ])
      if (!this.isCurrent(version, token)) return
      this.dataChecks = results.map((result, index) => {
        const item = this.dataChecks[index]
        if (result.status === 'rejected') return { ...item, status: 'fail', detail: failureDetail(result.reason) }
        const response = result.value
        if (response?.code !== 0) return { ...item, status: 'fail', detail: '接口返回非成功状态。' }
        if (index === 1) {
          if (response.data == null) return { ...item, status: 'empty', detail: '逆地址解析没有返回地点。' }
          if (typeof response.data !== 'object' || Array.isArray(response.data)) return { ...item, status: 'fail', detail: '逆地址解析响应格式异常。' }
          if (!Object.keys(response.data).length) return { ...item, status: 'empty', detail: '逆地址解析没有返回地点。' }
          return { ...item, status: 'ok', detail: '逆地址解析返回地点信息。' }
        }
        if (!Array.isArray(response.data)) return { ...item, status: 'fail', detail: '列表响应格式异常。' }
        const count = response.data.length
        return { ...item, status: count ? 'ok' : 'empty', detail: count ? `本页返回 ${count} 条结果。` : '本页没有结果。' }
      })
      this.dataRunning = false
    },
    goToMap() {
      if (!this.canRun()) return
      uni.navigateTo({ url: this.isDark ? '/pages-dark/map/map' : '/pages/map/map' })
    }
  }
}
</script>

<style scoped>
.test-container { min-height: 100vh; box-sizing: border-box; padding: 32rpx; background: #f4f7fa; color: #203143; }
.test-header { margin-bottom: 28rpx; }
.test-title { display: block; font-size: 36rpx; font-weight: bold; margin-bottom: 12rpx; }
.test-note { display: block; font-size: 25rpx; line-height: 1.6; color: #526778; margin-bottom: 20rpx; }
.test-section { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 24rpx; }
.section-title { display: block; font-size: 29rpx; font-weight: bold; margin-bottom: 16rpx; }
.test-input { width: 100%; height: 76rpx; box-sizing: border-box; border: 2rpx solid #c8d4df; border-radius: 8rpx; padding: 0 20rpx; font-size: 28rpx; margin-bottom: 18rpx; color: inherit; }
.test-btn { width: 100%; min-height: 76rpx; background: #1769aa; color: #fff; border: none; border-radius: 8rpx; font-size: 28rpx; margin-bottom: 14rpx; }
.test-btn.primary { background: #23804b; }
.test-btn[disabled] { opacity: .5; }
.test-result { background: #f3f6f9; border-radius: 8rpx; padding: 18rpx; margin-top: 12rpx; }
.test-result text { display: block; font-size: 25rpx; line-height: 1.5; overflow-wrap: anywhere; }
.result-title { font-weight: bold; }
.status-idle, .status-running, .status-info { color: #526778; }
.status-ok { color: #16804b; }
.status-empty { color: #94600d; }
.status-fail { color: #b3343c; }
.dark-theme { background: #101c2c; color: #e6edf4; }
.dark-theme .test-section { background: #1b2d42; }
.dark-theme .test-result { background: #132236; }
.dark-theme .test-input { background: #132236; border-color: #486079; color: #e6edf4; }
.dark-theme .test-note, .dark-theme .status-idle, .dark-theme .status-running, .dark-theme .status-info { color: #b2c5d8; }
.dark-theme .status-ok { color: #73dba6; }
.dark-theme .status-empty { color: #f0c677; }
.dark-theme .status-fail { color: #ff9ca5; }
</style>
