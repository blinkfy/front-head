<template>
  <RecyclingShell title="回收工作台" :dark="isDark">
    <view v-if="error" class="recycle-error">{{ error }}<button class="recycle-secondary" @click="load">重新加载</button></view>
    <view v-if="loading && !me" class="recycle-empty">加载中…</view>
    <view v-else-if="me && me.profile?.status !== 'approved'" class="recycle-card"><text class="recycle-heading">{{ collectorStatusText(me.profile?.status || me.application?.status) }}</text><text class="recycle-copy">审核通过后即可使用工作台。已停用人员请联系平台。</text><button class="recycle-primary" @click="apply">查看申请进度</button></view>
    <template v-else-if="me?.profile">
      <view class="recycle-card"><view class="recycle-row"><text class="recycle-heading">{{ me.profile.serviceName }}</text><text class="recycle-status">{{ me.profile.acceptingOrders ? '正在接收新单' : '已暂停接收新单' }}</text></view><text class="recycle-muted">任务按服务时长与路程缓冲避免冲突。暂停新单不会取消已接任务。</text><button v-if="!me.profile.acceptingOrders && tab === 'available'" class="recycle-secondary" @click="changeTab('settings')">设置排班并开启接单</button></view>
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
          <text class="recycle-copy">{{ itemsText(order) }}</text><text class="recycle-muted">{{ orderPriceText(order) }}，以现场确认记录为准</text>
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
        <view class="recycle-card"><text class="recycle-heading">回收种类与参考价</text>
          <text class="recycle-muted">仅可配置已获批品类。参考价由您自行保存，最终价格以现场确认记录为准。</text>
          <text v-if="me.profile.serviceOffers == null" class="recycle-copy">以下已预填平台公斤参考价，保存后成为您的服务配置。</text>
          <text v-if="!serviceOffers.length" class="recycle-copy">暂无获批品类，请先申请服务品类。</text>
          <view v-for="offer in serviceOffers" :key="offer.typeId" class="offer-item">
            <view class="recycle-row"><text class="recycle-label">{{ offer.name }}</text><switch :checked="offer.enabled" color="#16845b" :disabled="saving" @change="offer.enabled = $event.detail.value" /></view>
            <template v-if="offer.enabled">
              <text class="recycle-label">计价单位</text><picker :range="offerUnits" range-key="label" :value="offerUnits.findIndex(item => item.value === offer.unit)" :disabled="saving" @change="offer.unit = offerUnits[Number($event.detail.value)].value"><view class="recycle-select">{{ unitLabel(offer.unit) }}</view></picker>
              <text class="recycle-label">报价方式</text><picker :range="priceModes" range-key="label" :value="offer.priceMode === 'negotiable' ? 1 : 0" :disabled="saving" @change="offer.priceMode = priceModes[Number($event.detail.value)].value"><view class="recycle-select">{{ offer.priceMode === 'negotiable' ? '现场议价' : '固定参考单价' }}</view></picker>
              <template v-if="offer.priceMode === 'fixed'"><text class="recycle-label">参考单价（元 / {{ unitLabel(offer.unit) }}）</text><input v-model="offer.unitPrice" class="recycle-input" type="digit" :disabled="saving" placeholder="请输入参考单价" /></template>
              <text class="recycle-label">回收说明与限制（选填）</text><textarea v-model="offer.description" class="recycle-textarea" :maxlength="200" :disabled="saving" placeholder="例如：需拆除包装，不接收破损物品" />
              <view class="recycle-row"><text>预约时要求上传照片</text><switch :checked="offer.requiresPhoto" color="#16845b" :disabled="saving" @change="offer.requiresPhoto = $event.detail.value" /></view>
            </template>
          </view>
          <text class="recycle-label">每单服务时长</text><picker :range="serviceDurations" :value="serviceDurations.indexOf(serviceDurationMinutes)" :disabled="saving" @change="serviceDurationMinutes = serviceDurations[Number($event.detail.value)]"><view class="recycle-select">{{ serviceDurationMinutes }} 分钟</view></picker>
          <text class="recycle-label">路程缓冲</text><picker :range="travelBuffers" :value="travelBuffers.indexOf(travelBufferMinutes)" :disabled="saving" @change="travelBufferMinutes = travelBuffers[Number($event.detail.value)]"><view class="recycle-select">{{ travelBufferMinutes }} 分钟</view></picker><text class="recycle-muted recycle-copy">建议预留 15–30 分钟路程缓冲；系统按任务服务时长及缓冲限制重叠预约。</text>
          <text class="recycle-label">用户可选上门窗口</text><picker :range="arrivalWindows" :value="arrivalWindows.indexOf(arrivalWindowMinutes)" :disabled="saving" @change="arrivalWindowMinutes = arrivalWindows[Number($event.detail.value)]"><view class="recycle-select">{{ arrivalWindowMinutes }} 分钟</view></picker>
          <button class="recycle-primary" :disabled="saving" @click="saveServiceOffers">{{ saving ? '保存中…' : '保存服务配置' }}</button>
        </view>
        <view class="recycle-card"><text class="recycle-heading">发布服务排班</text><text class="recycle-muted">每周规则自动重复，仅开放未来 30 天预约；临时有事可在单日调整中休息或改时段。</text>
          <view class="recycle-pills"><button class="recycle-pill" :class="{ selected: scheduleMode === 'weekly' }" :disabled="saving" @click="setScheduleMode('weekly')">每周固定</button><button class="recycle-pill" :class="{ selected: scheduleMode === 'daily' }" :disabled="saving" @click="setScheduleMode('daily')">单日调整</button></view>
          <text class="recycle-label">获批服务范围</text><picker :range="approvedAreas" range-key="name" :value="areaIndex" :disabled="saving" @change="areaIndex = Number($event.detail.value); restoreSchedule()"><view class="recycle-select">{{ approvedAreas[areaIndex]?.name || '暂无获批区域' }}</view></picker>
          <RecyclingServiceMap v-if="approvedAreas[areaIndex]?.geometry" :areas="[approvedAreas[areaIndex]]" readonly />
          <text v-else class="recycle-muted recycle-copy">这是旧地区资料。请申请补画地图范围并通过审核，以开放按地图地址匹配的预约。</text>
          <button class="recycle-secondary" :disabled="saving" @click="apply">申请变更服务范围</button>
          <template v-if="scheduleMode === 'weekly'"><text class="recycle-copy">选择每周服务日</text><view class="recycle-pills"><button v-for="day in weekdays" :key="day.value" class="recycle-pill" :class="{ selected: selectedWeekdays.includes(day.value) }" :disabled="saving" @click="toggleWeekday(day.value)">{{ day.label }}</button></view>
            <view class="recycle-pills"><button class="recycle-pill" :disabled="saving" @click="setWeekdays([1,2,3,4,5])">工作日</button><button class="recycle-pill" :disabled="saving" @click="setWeekdays([1,2,3,4,5,6,7])">每天</button><button class="recycle-pill" :disabled="saving" @click="setWeekdays([])">清空</button></view>
            <text v-if="weeklyMismatch" class="recycle-muted">该区域各星期的服务时段不同：{{ weeklyMismatchText }}。保存后，所选服务日会统一使用当前时段，请先调整后再保存。</text>
          </template>
          <template v-else><text class="recycle-label">调整日期</text><picker mode="date" :value="scheduleDate" :start="today" :end="lastDay" :disabled="saving" @change="scheduleDate = $event.detail.value; restoreSlots()"><view class="recycle-select">{{ scheduleDate }}</view></picker>
            <text class="recycle-muted">当天临时排班只改所选区域，其他区域时段保留，之后调整每周规则也不会改变这项例外；“恢复周排班”会清除当天全部临时调整。</text><text class="recycle-copy">{{ hasDailyOverride ? '当天已临时调整' : '当天沿用每周固定排班' }}</text></template>
          <text class="recycle-label">工作时间</text><text class="recycle-muted recycle-copy">可添加多段工作时间，按半小时选择，不跨夜。工作时间不等于用户预约窗口；系统会在其中自动生成 30 或 60 分钟上门窗口。</text>
          <view v-for="(slot, index) in selectedSlots" :key="index" class="work-range">
            <picker class="work-range-picker" :range="workTimes.slice(0, -1)" :value="workTimes.indexOf(slot.split('-')[0])" :disabled="saving" @change="changeWorkRange(index, 0, $event)"><view class="recycle-select">{{ slot.split('-')[0] }}</view></picker><text>至</text><picker class="work-range-picker" :range="workTimes" :value="workTimes.indexOf(slot.split('-')[1])" :disabled="saving" @change="changeWorkRange(index, 1, $event)"><view class="recycle-select">{{ slot.split('-')[1] }}</view></picker><button class="recycle-pill" :disabled="saving" @click="removeWorkRange(index)">删除</button>
          </view><text v-if="!selectedSlots.length" class="recycle-copy">未添加工作时间，保存后所选服务日休息。</text><button class="recycle-secondary" :disabled="saving" @click="addWorkRange">添加工作时间</button>
          <button class="recycle-primary" :disabled="saving || !approvedAreas.length || (scheduleMode === 'weekly' && weeklyMismatch && !weeklyEdited)" @click="saveSchedule">{{ saving ? '保存中…' : (scheduleMode === 'weekly' ? '保存每周排班' : '保存单日调整') }}</button><button v-if="scheduleMode === 'daily' && hasDailyOverride" class="recycle-secondary" :disabled="saving" @click="resetDailySchedule">恢复周排班</button>
        </view>
      </template>
    </template>
  </RecyclingShell>
</template>
<script>
import RecyclingShell from './components/RecyclingShell.vue'
import RecyclingServiceMap from './components/RecyclingServiceMap.vue'
import { collectorMe, collectorSettings, collectorAvailability, collectorWeeklyAvailability, collectorOrders, bookingStatusText, collectorStatusText } from './api/recycling.js'
import { formatBookingDate } from './utils/booking-date.mjs'
export default {
  components: { RecyclingShell, RecyclingServiceMap },
  data: () => ({ isDark: false, loading: false, loadingOrders: false, saving: false, error: '', me: null, catalog: { areas: [], types: [], timeSlots: [] }, tab: 'available', tabs: [{ key: 'available', label: '待接单' }, { key: 'mine', label: '我的任务' }, { key: 'settings', label: '接单设置' }], filters: [{ key: 'active', label: '进行中' }, { key: 'completed', label: '已完成' }, { key: 'cancelled', label: '已取消' }, { key: '', label: '全部' }], status: 'active', date: '', orders: [], page: 0, hasMore: false, queryVersion: 0, scheduleMode: 'weekly', weekdays: [{ value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' }, { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 7, label: '周日' }], selectedWeekdays: [], weeklyEdited: false, weeklyMismatch: false, weeklyMismatchText: '', scheduleDate: '', today: '', lastDay: '', areaIndex: 0, selectedSlots: [], serviceOffers: [], offerUnits: [{ value: 'kg', label: '公斤' }, { value: 'piece', label: '件' }, { value: 'unit', label: '台' }, { value: 'bag', label: '袋' }], priceModes: [{ value: 'fixed', label: '固定参考单价' }, { value: 'negotiable', label: '现场议价' }], serviceDurations: Array.from({ length: 12 }, (_, index) => (index + 1) * 15), travelBuffers: [0,15,30,45,60], arrivalWindows: [30,60], serviceDurationMinutes: 30, travelBufferMinutes: 0, arrivalWindowMinutes: 60, workTimes: Array.from({ length: 49 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`), deviceNotificationStatus: '当前平台未提供状态查询' }),
  computed: { approvedAreas() { return (this.me?.areas || []).filter(area => area.enabled !== false && (this.me?.profile?.areaIds || []).map(Number).includes(Number(area.id))) }, hasDailyOverride() { return (this.me?.scheduleOverrides || []).some(row => row.date === this.scheduleDate) } },
  onLoad(options = {}) { if (['mine', 'settings'].includes(options.tab)) this.tab = options.tab; const now = new Date(); this.today = formatBookingDate(now); this.scheduleDate = this.today; now.setDate(now.getDate() + 30); this.lastDay = formatBookingDate(now) },
  onShow() { this.isDark = uni.getStorageSync('app_theme') === 'dark'; this.readPermission(); this.load() },
  onUnload() { this.queryVersion++ },
  methods: {
    statusText: bookingStatusText, collectorStatusText,
    money(value) { return Number(value || 0).toFixed(2) },
    areaName(id) { return (this.me?.areas || []).find(area => Number(area.id) === Number(id))?.name || '服务区域' },
    orderPriceText(order) { const snapshot = order.pricingSnapshot; if (snapshot?.collectorQuote) return snapshot.collectorQuote.totalPrice == null ? '合计待现场确认' : `参考收益 ¥${this.money(snapshot.collectorQuote.totalPrice)}`; if (snapshot?.reference) { const r = snapshot.reference; return r.minTotal == null || r.maxTotal == null ? '数量或报价待确认' : `参考收益 ¥${this.money(r.minTotal)}–${this.money(r.maxTotal)}${r.hasUnknown ? '（部分物品）' : ''}`; } return order.totalPrice == null ? '合计待现场确认' : `参考收益 ¥${this.money(order.totalPrice)}` },
    itemsText(order) { return (order.items || []).map(item => { const quantity = item.quantity ?? item.weight; return `${item.name} ${quantity == null || quantity === '' ? '数量待现场确认' : `${quantity}${this.unitLabel(item.quantityUnit || item.unit || 'kg')}`}` }).join('、') },
    apply() { uni.navigateTo({ url: '/pages-nonTheme/collector-apply' }) },
    systemNotices() { uni.navigateTo({ url: '/pages-nonTheme/system-notifications' }) },
    async load() { if (this.loading) return; this.loading = true; this.error = ''; try { const me = await collectorMe(); this.me = me; this.catalog = { timeSlots: me.timeSlots || [], areas: me.areas || [], types: me.types || [] }; this.restoreServiceOffers(); this.restoreSchedule(); if (me.profile?.status === 'approved' && this.tab !== 'settings') await this.loadOrders(true) } catch (e) { this.error = e.message || '加载失败' } finally { this.loading = false } },
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
    getWeeklyRows() { const area = this.approvedAreas[this.areaIndex]; return (this.me?.weeklySchedule || []).filter(row => Number(row.serviceAreaId) === Number(area?.id)) },
    getDailyRows() { const area = this.approvedAreas[this.areaIndex]; return (this.me?.availability || []).filter(row => row.date === this.scheduleDate && Number(row.serviceAreaId) === Number(area?.id)) },
    restoreSchedule() { if (this.scheduleMode === 'weekly') this.restoreWeeklySlots(); else this.restoreSlots() },
    restoreSlots() { this.selectedSlots = this.getDailyRows().map(row => row.slot) },
    restoreWeeklySlots() { const rows = this.getWeeklyRows(); const byDay = {}; rows.forEach(row => { const day = Number(row.weekday); (byDay[day] ||= []).push(row.slot) }); const days = Object.keys(byDay).map(Number).sort((a, b) => a - b); this.selectedWeekdays = days; const signatures = [...new Set(days.map(day => [...byDay[day]].sort().join('|')))]; this.weeklyMismatch = signatures.length > 1; this.weeklyMismatchText = this.weeklyMismatch ? days.map(day => `周${this.weekdays[day - 1]?.label.slice(1)} ${byDay[day].join('、')}`).join('；') : ''; this.selectedSlots = days.length ? [...byDay[days[0]]] : []; this.weeklyEdited = false },
    setScheduleMode(mode) { if (this.saving) return; this.scheduleMode = mode; this.restoreSchedule() },
    setWeekdays(days) { this.selectedWeekdays = [...days]; this.weeklyEdited = true },
    toggleWeekday(day) { this.selectedWeekdays = this.selectedWeekdays.includes(day) ? this.selectedWeekdays.filter(value => value !== day) : [...this.selectedWeekdays, day].sort((a, b) => a - b); this.weeklyEdited = true },
    unitLabel(unit) { return this.offerUnits.find(item => item.value === unit)?.label || unit },
    restoreServiceOffers() {
      const profile = this.me?.profile || {}; const saved = profile.serviceOffers; const approvedIds = (profile.typeIds || []).map(Number)
      this.serviceOffers = (this.me?.types || []).filter(type => type.enabled !== false && approvedIds.includes(Number(type.id))).map(type => {
        const offer = Array.isArray(saved) ? saved.find(item => Number(item.typeId) === Number(type.id)) : null
        return { typeId: Number(type.id), name: type.name, enabled: offer ? offer.enabled : saved == null, unit: offer?.unit || 'kg', priceMode: offer?.priceMode || 'fixed', unitPrice: offer ? offer.unitPrice : (type.unitPrice ?? ''), description: offer?.description || '', requiresPhoto: offer?.requiresPhoto || false }
      })
      this.serviceDurationMinutes = profile.serviceDurationMinutes ?? 30; this.travelBufferMinutes = profile.travelBufferMinutes ?? 0; this.arrivalWindowMinutes = profile.arrivalWindowMinutes ?? 60
    },
    async saveServiceOffers() {
      if (this.saving) return
      const serviceOffers = this.serviceOffers.map(({ name, ...offer }) => ({ ...offer, unitPrice: offer.priceMode === 'negotiable' ? null : (String(offer.unitPrice ?? '').trim() === '' ? null : Number(offer.unitPrice)), description: offer.description.trim() }))
      if (serviceOffers.some(offer => offer.enabled && offer.priceMode === 'fixed' && (offer.unitPrice === null || !Number.isFinite(offer.unitPrice) || offer.unitPrice < 0 || Math.abs(offer.unitPrice * 100 - Math.round(offer.unitPrice * 100)) > 0.000001))) { this.error = '请为启用的固定报价品类填写有效的非负参考单价（最多两位小数）'; return }
      if (serviceOffers.some(offer => offer.description.length > 200)) { this.error = '回收说明不能超过 200 字'; return }
      this.saving = true
      try { await collectorSettings({ serviceOffers, serviceDurationMinutes: this.serviceDurationMinutes, travelBufferMinutes: this.travelBufferMinutes, arrivalWindowMinutes: this.arrivalWindowMinutes }); this.me = await collectorMe(); this.restoreServiceOffers(); this.error = ''; uni.showToast({ title: '服务配置已保存', icon: 'success' }) } catch (e) { this.error = e.message || '保存失败' } finally { this.saving = false }
    },
    addWorkRange() { const lastEnd = this.selectedSlots.slice().sort().map(slot => slot.split('-')[1]).pop(); const start = lastEnd && lastEnd < '24:00' ? lastEnd : '08:30'; const end = lastEnd && lastEnd < '24:00' ? this.workTimes[this.workTimes.indexOf(start) + 1] : '12:00'; this.selectedSlots = [...this.selectedSlots, `${start}-${end}`]; if (this.scheduleMode === 'weekly') this.weeklyEdited = true },
    removeWorkRange(index) { this.selectedSlots = this.selectedSlots.filter((_, position) => position !== index); if (this.scheduleMode === 'weekly') this.weeklyEdited = true },
    changeWorkRange(index, part, event) { const range = this.selectedSlots[index].split('-'); range[part] = this.workTimes[Number(event.detail.value)]; this.selectedSlots = this.selectedSlots.map((slot, position) => position === index ? range.join('-') : slot); if (this.scheduleMode === 'weekly') this.weeklyEdited = true },
    workRangeError() {
      const ranges = this.selectedSlots.map(slot => slot.split('-')).sort((a, b) => a[0].localeCompare(b[0]))
      if (ranges.some(([start, end]) => !this.workTimes.includes(start) || !this.workTimes.includes(end) || start === '24:00' || start >= end)) return '工作时间须按半小时选择，开始早于结束，且不能跨夜'
      if (ranges.some(([start], index) => index > 0 && start < ranges[index - 1][1])) return '工作时间不能重叠，请调整后保存'
      return ''
    },
    async changeSetting(key, value) { if (this.saving) return; this.saving = true; try { await collectorSettings({ [key]: value }); this.me = await collectorMe(); this.error = '' } catch (e) { this.error = e.message || '设置失败'; this.me = { ...this.me }; await this.load() } finally { this.saving = false } },
    async saveSchedule() { if (this.saving) return; const area = this.approvedAreas[this.areaIndex]; if (!area) return; const rangeError = this.workRangeError(); if (rangeError) { this.error = rangeError; return } this.saving = true; try { if (this.scheduleMode === 'weekly') await collectorWeeklyAvailability({ serviceAreaId: area.id, weekdays: this.selectedWeekdays, slots: this.selectedSlots }); else await collectorAvailability({ date: this.scheduleDate, serviceAreaId: area.id, slots: this.selectedSlots }); this.me = await collectorMe(); this.restoreSchedule(); this.error = ''; uni.showToast({ title: '排班已保存', icon: 'success' }) } catch (e) { this.error = e.message || '保存失败' } finally { this.saving = false } },
    async resetDailySchedule() { if (this.saving) return; this.saving = true; try { await collectorAvailability({ date: this.scheduleDate, reset: true }); this.me = await collectorMe(); this.restoreSlots(); this.error = ''; uni.showToast({ title: '已恢复周排班', icon: 'success' }) } catch (e) { this.error = e.message || '恢复失败' } finally { this.saving = false } },
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
<style scoped>
.offer-item { margin: 24rpx 0; padding: 16rpx 0; border-bottom: 1rpx solid #cbdcd1; }
.work-range { display: flex; align-items: center; gap: 10rpx; margin: 16rpx 0; }
.work-range-picker { flex: 1; min-width: 0; }
.work-range .recycle-select { padding: 20rpx 10rpx; text-align: center; }
.work-range .recycle-pill { flex-shrink: 0; margin: 0; }
</style>
