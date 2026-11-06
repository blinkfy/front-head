<template>
  <RecyclingShell title="回收工作台" :dark="isDark">
    <view v-if="error" class="recycle-error">{{ error }}<button class="recycle-secondary" @click="load">重新加载</button></view>
    <view v-if="loading && !me" class="recycle-empty">加载中…</view>
    <view v-else-if="me && me.profile?.status !== 'approved'" class="recycle-card"><text class="recycle-heading">{{ collectorStatusText(me.profile?.status || me.application?.status) }}</text><text class="recycle-copy">审核通过后即可使用工作台。已停用人员请联系平台。</text><button class="recycle-primary" @click="apply">查看申请进度</button></view>
    <template v-else-if="me?.profile">
      <view class="recycle-card"><view class="recycle-row"><text class="recycle-heading">{{ me.profile.serviceName }}</text><text class="recycle-status">{{ me.profile.acceptingOrders ? '正在接收新单' : '已暂停接收新单' }}</text></view><text class="recycle-muted">每个时段承接一单。暂停新单不会取消已接任务。</text><button v-if="!me.profile.acceptingOrders && tab === 'available'" class="recycle-secondary" @click="changeTab('settings')">设置排班并开启接单</button></view>
      <view class="recycle-tabs"><button v-for="item in tabs" :key="item.key" class="recycle-pill" :class="{ selected: tab === item.key }" @click="changeTab(item.key)">{{ item.label }}</button></view>
      <template v-if="tab !== 'settings'">
        <view class="recycle-card">
          <view class="recycle-row"><picker mode="date" :value="date" @change="setDate"><view class="recycle-select">{{ date || '全部日期' }}</view></picker><button class="recycle-pill" @click="clearDate">全部日期</button><button class="recycle-pill" :disabled="loadingOrders" @click="loadOrders(true)">刷新</button></view>
          <view v-if="tab === 'mine'" class="recycle-pills"><button v-for="filter in filters" :key="filter.key" class="recycle-pill" :class="{ selected: status === filter.key }" @click="setStatus(filter.key)">{{ filter.label }}</button></view>
          <text v-else class="recycle-muted">大厅隐藏详细地址与联系电话，接单后可查看并联系用户。</text>
        </view>
        <view v-for="order in orders" :key="order.id" class="recycle-card" @click="detail(order)">
          <view class="recycle-row"><text>订单 {{ order.orderNo }}</text><text class="recycle-status">{{ statusText(order.status) }}</text></view>
          <text class="recycle-copy">{{ order.appointmentDate }} {{ order.appointmentTimeSlot }}</text><text class="recycle-copy">{{ order.serviceAreaName || areaName(order.serviceAreaId) }}</text>
          <text class="recycle-copy">{{ itemsText(order) }}</text><text class="recycle-muted">预估收益 ¥{{ money(order.totalPrice) }}，以现场确认记录为准</text>
          <button class="recycle-secondary" @click.stop="detail(order)">{{ tab === 'available' ? '查看并接单' : '查看任务 / 联系用户' }}</button>
        </view>
        <view v-if="loadingOrders" class="recycle-empty">加载中…</view><view v-else-if="!orders.length" class="recycle-empty">{{ tab === 'available' ? '暂无符合服务区域、品类与排班的新单' : '暂无任务' }}</view>
        <button v-if="hasMore" class="recycle-secondary" :disabled="loadingOrders" @click="loadOrders(false)">加载更多</button>
      </template>
      <template v-else>
        <view class="recycle-card"><text class="recycle-heading">接单与提醒</text>
          <view class="recycle-row"><text>接收新单</text><switch :checked="me.profile.acceptingOrders" color="#16845b" :disabled="saving" @change="changeSetting('acceptingOrders', $event.detail.value)" /></view>
          <view class="recycle-row"><text>新单提醒</text><switch :checked="me.profile.newOrderNotifications" color="#16845b" :disabled="saving" @change="changeSetting('newOrderNotifications', $event.detail.value)" /></view>
          <text class="recycle-muted">关闭新单提醒不会删除站内通知或已接任务的状态通知。</text>
          <view class="recycle-divider" /><text class="recycle-copy">服务端离线推送：{{ me.notificationStatus?.pushEnabled ? '已启用支持通道' : '尚未启用' }}</text><text class="recycle-copy">账号有效绑定设备：{{ me.notificationStatus?.boundDevices || 0 }} 台</text><text class="recycle-copy">当前设备系统通知：{{ deviceNotificationStatus }}</text><text class="recycle-muted">服务端开启和设备绑定不代表通知已在手机展示。站内通知始终可从消息页查看。</text>
          <button class="recycle-secondary" @click="systemNotices">查看系统通知</button>
        </view>
        <view class="recycle-card"><text class="recycle-heading">发布服务排班</text><text class="recycle-muted">同一时段只能服务一个区域；保存仅替换所选区域当天的排班。已承接或已预约容量不足时不能撤销。</text>
          <text class="recycle-label">日期</text><picker mode="date" :value="scheduleDate" :start="today" :end="lastDay" @change="scheduleDate = $event.detail.value; restoreSlots()"><view class="recycle-select">{{ scheduleDate }}</view></picker>
          <text class="recycle-label">获批服务范围</text><picker :range="approvedAreas" range-key="name" :value="areaIndex" @change="areaIndex = Number($event.detail.value); restoreSlots()"><view class="recycle-select">{{ approvedAreas[areaIndex]?.name || '暂无获批区域' }}</view></picker>
          <RecyclingServiceMap v-if="approvedAreas[areaIndex]?.geometry" :areas="[approvedAreas[areaIndex]]" readonly />
          <text v-else class="recycle-muted recycle-copy">这是旧地区资料。请申请补画地图范围并通过审核，以开放按地图地址匹配的预约。</text>
          <button class="recycle-secondary" :disabled="saving" @click="apply">申请变更服务范围</button>
          <text class="recycle-label">服务时段</text><view class="recycle-pills"><button v-for="slot in catalog.timeSlots" :key="slot" class="recycle-pill" :class="{ selected: selectedSlots.includes(slot) }" :disabled="saving" @click="toggleSlot(slot)">{{ slot }}</button></view>
          <button class="recycle-primary" :disabled="saving || !approvedAreas.length" @click="saveSchedule">{{ saving ? '保存中…' : '保存排班' }}</button>
        </view>
      </template>
    </template>
  </RecyclingShell>
</template>
<script>
import RecyclingShell from './components/RecyclingShell.vue'
import RecyclingServiceMap from './components/RecyclingServiceMap.vue'
import { collectorMe, collectorSettings, collectorAvailability, collectorOrders, bookingStatusText, collectorStatusText } from './api/recycling.js'
import { formatBookingDate } from './utils/booking-date.mjs'
export default {
  components: { RecyclingShell, RecyclingServiceMap },
  data: () => ({ isDark: false, loading: false, loadingOrders: false, saving: false, error: '', me: null, catalog: { areas: [], types: [], timeSlots: [] }, tab: 'available', tabs: [{ key: 'available', label: '待接单' }, { key: 'mine', label: '我的任务' }, { key: 'settings', label: '接单设置' }], filters: [{ key: 'active', label: '进行中' }, { key: 'completed', label: '已完成' }, { key: 'cancelled', label: '已取消' }, { key: '', label: '全部' }], status: 'active', date: '', orders: [], page: 0, hasMore: false, queryVersion: 0, scheduleDate: '', today: '', lastDay: '', areaIndex: 0, selectedSlots: [], deviceNotificationStatus: '当前平台未提供状态查询' }),
  computed: { approvedAreas() { return (this.me?.areas || []).filter(area => area.enabled !== false && (this.me?.profile?.areaIds || []).map(Number).includes(Number(area.id))) } },
  onLoad(options = {}) { if (['mine', 'settings'].includes(options.tab)) this.tab = options.tab; const now = new Date(); this.today = formatBookingDate(now); this.scheduleDate = this.today; now.setDate(now.getDate() + 30); this.lastDay = formatBookingDate(now) },
  onShow() { this.isDark = uni.getStorageSync('app_theme') === 'dark'; this.readPermission(); this.load() },
  onUnload() { this.queryVersion++ },
  methods: {
    statusText: bookingStatusText, collectorStatusText,
    money(value) { return Number(value || 0).toFixed(2) },
    areaName(id) { return (this.me?.areas || []).find(area => Number(area.id) === Number(id))?.name || '服务区域' },
    itemsText(order) { return (order.items || []).map(item => `${item.name} ${item.weight}kg`).join('、') },
    apply() { uni.navigateTo({ url: '/pages-nonTheme/collector-apply' }) },
    systemNotices() { uni.navigateTo({ url: '/pages-nonTheme/system-notifications' }) },
    async load() { if (this.loading) return; this.loading = true; this.error = ''; try { const me = await collectorMe(); this.me = me; this.catalog = { timeSlots: me.timeSlots || [], areas: me.areas || [], types: [] }; this.restoreSlots(); if (me.profile?.status === 'approved' && this.tab !== 'settings') await this.loadOrders(true) } catch (e) { this.error = e.message || '加载失败' } finally { this.loading = false } },
    async loadOrders(reset) {
      if (this.loadingOrders && !reset) return
      if (this.tab === 'available' && !this.me?.profile?.acceptingOrders) { this.queryVersion++; this.orders = []; this.hasMore = false; this.loadingOrders = false; return }
      const version = ++this.queryVersion; this.loadingOrders = true; const page = reset ? 1 : this.page + 1; this.error = ''
      try { const data = await collectorOrders(this.tab === 'mine' ? 'mine' : 'available', { page, status: this.tab === 'mine' ? this.status : undefined, date: this.date || undefined }); if (version !== this.queryVersion) return; this.orders = reset ? data.orders || [] : [...this.orders, ...(data.orders || [])]; this.page = page; this.hasMore = page < (data.totalPages || 1) } catch (e) { if (version === this.queryVersion) this.error = e.message || '任务加载失败' } finally { if (version === this.queryVersion) this.loadingOrders = false }
    },
    changeTab(key) { this.tab = key; if (key !== 'settings') this.loadOrders(true); else this.queryVersion++ },
    setDate(event) { this.date = event.detail.value; this.loadOrders(true) }, clearDate() { this.date = ''; this.loadOrders(true) },
    setStatus(status) { this.status = status; this.loadOrders(true) },
    detail(order) { uni.navigateTo({ url: `/pages-nonTheme/collector-order-detail?id=${order.id}` }) },
    restoreSlots() { const area = this.approvedAreas[this.areaIndex]; this.selectedSlots = (this.me?.availability || []).filter(row => row.date === this.scheduleDate && Number(row.serviceAreaId) === Number(area?.id)).map(row => row.slot) },
    toggleSlot(slot) { this.selectedSlots = this.selectedSlots.includes(slot) ? this.selectedSlots.filter(value => value !== slot) : [...this.selectedSlots, slot] },
    async changeSetting(key, value) { if (this.saving) return; this.saving = true; try { await collectorSettings({ [key]: value }); this.me = await collectorMe(); this.error = '' } catch (e) { this.error = e.message || '设置失败'; this.me = { ...this.me }; await this.load() } finally { this.saving = false } },
    async saveSchedule() { if (this.saving) return; this.saving = true; try { await collectorAvailability({ date: this.scheduleDate, serviceAreaId: this.approvedAreas[this.areaIndex].id, slots: this.selectedSlots }); this.me = await collectorMe(); this.restoreSlots(); this.error = ''; uni.showToast({ title: '排班已保存', icon: 'success' }) } catch (e) { this.error = e.message || '保存失败' } finally { this.saving = false } },
    readPermission() {
      // #ifdef APP-PLUS
      try { if (typeof plus !== 'undefined' && plus.android) { const manager = plus.android.importClass('androidx.core.app.NotificationManagerCompat'); this.deviceNotificationStatus = manager.from(plus.android.runtimeMainActivity()).areNotificationsEnabled() ? '已允许' : '未允许，请在系统设置中开启' } } catch (_) { this.deviceNotificationStatus = '请在手机系统设置中查看' }
      // #endif
      // #ifdef H5
      this.deviceNotificationStatus = typeof Notification === 'undefined' ? '浏览器未提供系统通知' : ({ granted: '浏览器已允许（不等于支持离线送达）', denied: '浏览器已拒绝', default: '浏览器尚未授权' }[Notification.permission] || '未知')
      // #endif
    }
  }
}
</script>
