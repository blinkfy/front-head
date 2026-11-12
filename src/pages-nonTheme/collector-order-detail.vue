<template>
  <RecyclingShell title="回收任务详情" :dark="isDark">
    <view v-if="error" class="recycle-error">{{ error }}<button class="recycle-secondary" :disabled="loading" @click="load">刷新任务</button></view>
    <view v-if="loading && !order" class="recycle-empty">加载中…</view>
    <template v-if="order">
      <view class="recycle-card"><view class="recycle-row"><text class="recycle-heading">{{ statusText(order.status) }}</text><text class="recycle-status">{{ order.serviceAreaName || '预约回收' }}</text></view><text class="recycle-muted">订单号 {{ order.orderNo }}</text><text class="recycle-copy">{{ order.appointmentDate }} {{ order.appointmentTimeSlot }}</text>
        <text v-if="order.address" class="recycle-copy">{{ order.address }}</text><text v-if="order.contactName" class="recycle-copy">联系人：{{ order.contactName }}</text><text v-if="order.contactPhone" class="recycle-copy">联系电话：{{ order.contactPhone }}</text><text v-if="order.notes" class="recycle-copy">备注：{{ order.notes }}</text>
        <text v-if="order.accessNotes" class="recycle-copy">上门条件：{{ order.accessNotes }}</text>
        <text v-if="!order.address && order.status === 'pending'" class="recycle-muted">接单后可查看完整地址与联系方式。</text>
      </view>
      <view v-if="order.photos?.length" class="recycle-card"><text class="recycle-heading">物品照片（{{ order.photos.length }}张）</text><view class="task-photos"><image v-for="photo in order.photos" :key="photo.id" :src="photoUrl(photo.url)" mode="aspectFill" @click="previewPhoto(photo.url)" /></view></view>
      <view class="recycle-card"><text class="recycle-heading">回收物品与报价</text><view v-for="(item, index) in order.items || []" :key="index" class="recycle-row"><text>{{ item.name }} · {{ quantityText(item) }}{{ item.quantityNote ? ` · ${item.quantityNote}` : '' }}</text></view>
        <template v-if="order.pricingSnapshot?.collectorQuote"><view v-for="item in order.pricingSnapshot.collectorQuote.items || []" :key="item.typeId" class="recycle-copy">{{ item.name }}：{{ item.priceMode === 'negotiable' ? '面议' : `¥${money(item.unitPrice)}/${unitText(item.unit)}` }}{{ item.description ? ` · ${item.description}` : '' }}</view><text v-if="order.pricingSnapshot.status === 'pending'" class="recycle-copy">接单报价有变化，等待用户确认后才能开始上门。</text><text v-else-if="order.pricingSnapshot.status === 'accepted'" class="recycle-copy">用户已确认接单报价。</text></template>
        <view class="recycle-divider" /><text class="recycle-copy">{{ order.pricingSnapshot?.collectorQuote ? '接单报价' : '参考收益' }} {{ orderPriceText }}</text><text v-if="order.actualPrice != null" class="recycle-copy">现场确认金额 ¥{{ money(order.actualPrice) }}</text><text class="recycle-muted">实际数量与结算金额以现场双方确认结果为准。</text><text v-if="order.cancelReason" class="recycle-copy">取消原因：{{ order.cancelReason }}</text></view>
      <view class="recycle-card">
        <button v-if="order.status === 'pending'" class="recycle-primary" :disabled="busy" @click="act('accept')">{{ busy ? '处理中…' : '接受预约' }}</button>
        <template v-else-if="order.contactPhone">
          <button class="recycle-primary" :disabled="busy" @click="contact">联系用户 · 聊天</button><button class="recycle-secondary" @click="call">拨打业务电话</button>
          <template v-if="order.status === 'confirmed'">
            <text v-if="order.pricingSnapshot?.status === 'pending'" class="recycle-copy">等待用户确认回收员报价，暂不能开始上门。</text>
            <text class="recycle-muted recycle-copy">{{ startWindowText }}</text>
            <text class="recycle-muted recycle-copy">提前或延后上门，请先通过聊天或电话与用户协商一致。</text>
            <button v-if="!showStartAgreement" class="recycle-primary" :disabled="busy || loading || order.pricingSnapshot?.status === 'pending'" @click="start">{{ order.startWindow?.requiresConfirmation ? '协商后开始上门' : '开始上门' }}</button>
            <view v-else>
              <text class="recycle-label">协商说明</text>
              <textarea v-model="startReason" class="recycle-textarea" maxlength="200" placeholder="请说明与用户约定的上门时间及提前或延后的原因" :disabled="busy" />
              <text class="recycle-muted recycle-copy">确认即表示你已与用户协商一致。说明将记入任务记录，并通知用户。</text>
              <button class="recycle-primary" :disabled="busy || loading || order.pricingSnapshot?.status === 'pending' || !startReason.trim()" @click="confirmNegotiatedStart">已协商一致，确认开始上门</button>
              <button class="recycle-secondary" :disabled="busy" @click="cancelStartAgreement">暂不开始</button>
            </view>
          </template>
        </template>
        <text v-if="['confirmed', 'picking'].includes(order.status)" class="recycle-muted recycle-copy">需要退单、改约或遇到异常时，请联系平台处理；不要直接取消用户预约。</text>
        <button v-if="['confirmed', 'picking'].includes(order.status)" class="recycle-secondary" :disabled="busy" @click="support">联系平台处理异常</button>
      </view>
      <view v-if="order.status === 'picking' && order.contactPhone" class="recycle-card"><text class="recycle-heading">完成回收记录</text><text class="recycle-muted">请按报价单位填写实际数量，并与用户确认金额后提交。</text><view v-for="item in actualItems" :key="item.typeId" class="recycle-row"><text class="recycle-grow">{{ item.name }}（{{ unitText(item.quantityUnit) }}）</text><input v-model="item.quantity" class="recycle-input recycle-small-input" type="digit" placeholder="实际数量" :disabled="busy" /></view><text class="recycle-label">现场确认金额（元，可为 0）</text><input class="recycle-input" v-model="actualPrice" type="digit" placeholder="请输入现场确认金额" :disabled="busy" /><button class="recycle-primary" :disabled="busy" @click="complete">确认完成回收</button></view>
      <view v-if="order.status === 'completed' && order.actualItems?.length" class="recycle-card"><text class="recycle-heading">实际回收记录</text><text v-for="item in order.actualItems" :key="item.typeId" class="recycle-copy">{{ item.name || '实际回收' }} · {{ quantityText(item) }}</text></view>
      <view v-if="order.events?.length" class="recycle-card"><text class="recycle-heading">任务记录</text><view v-for="(event, index) in order.events" :key="event.id || index" class="recycle-event"><text>{{ event.title || eventLabel(event.eventType || event.type) }} {{ event.createdAt || '' }}</text><text v-if="event.reason" class="recycle-copy">{{ event.reason }}</text></view></view>
    </template>
  </RecyclingShell>
</template>
<script>
import { bookingUnitText, bookingQuantityText, bookingPhotoUrl } from './api/booking.js'
import RecyclingShell from './components/RecyclingShell.vue'
import { collectorOrder, collectorAction, bookingStatusText, openBookingChat, openPlatformSupport, mutationData } from './api/recycling.js'
export default {
  components: { RecyclingShell },
  data: () => ({ id: '', isDark: false, order: null, loading: false, busy: false, error: '', actualItems: [], actualPrice: '', writes: {}, showStartAgreement: false, startReason: '' }),
  onLoad(options = {}) { this.id = /^\d+$/.test(String(options.id || '')) ? options.id : '' },
  onShow() { this.isDark = uni.getStorageSync('app_theme') === 'dark'; this.load() },
  computed: {
    orderPriceText() { const snapshot = this.order?.pricingSnapshot; if (snapshot?.collectorQuote) return snapshot.collectorQuote.totalPrice == null ? '合计待现场确认' : `¥${this.money(snapshot.collectorQuote.totalPrice)}`; if (snapshot?.reference) { const r = snapshot.reference; return r.minTotal == null || r.maxTotal == null ? '数量或报价待确认' : `¥${this.money(r.minTotal)}–${this.money(r.maxTotal)}${r.hasUnknown ? '（部分物品）' : ''}`; } return `¥${this.money(this.order?.totalPrice)}`; },
    startWindowText() {
      const window = this.order?.startWindow
      if (!window) return '常规上门时间为预约开始前 1 小时至开始后 2 小时。'
      return `常规上门时间：${this.businessTime(window.opensAt)} 至 ${this.businessTime(window.closesAt)}（北京时间）`
    }
  },
  methods: {
    unitText: bookingUnitText, quantityText: bookingQuantityText, photoUrl: bookingPhotoUrl,
    previewPhoto(current) { uni.previewImage({ current: this.photoUrl(current), urls: this.order.photos.map(photo => this.photoUrl(photo.url)).filter(Boolean) }); },
    businessTime(value) {
      const date = new Date(Date.parse(value) + 8 * 3600000)
      if (!Number.isFinite(date.getTime())) return '时间待核实'
      const pad = value => (`0${value}`).slice(-2)
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
    },
    async start() {
      if (this.busy || this.loading) return
      this.busy = true
      let directStart = false
      try {
        await this.load()
        if (!this.order || this.error || this.order.status !== 'confirmed') return
        if (this.order.pricingSnapshot?.status === 'pending') { this.error = '请等待用户确认报价后再开始上门'; return }
        const window = this.order.startWindow
        if (!window) { this.error = '无法核对预约时间，请刷新任务或联系平台处理'; return }
        if (window.requiresConfirmation) this.showStartAgreement = true
        else { this.showStartAgreement = false; directStart = true }
      } finally { this.busy = false }
      if (directStart) await this.act('start')
    },
    confirmNegotiatedStart() {
      const reason = this.startReason.trim()
      if (!reason) { uni.showToast({ title: '请填写协商说明', icon: 'none' }); return }
      return this.act('start', { confirmedWithCustomer: true, reason })
    },
    cancelStartAgreement() { this.showStartAgreement = false; this.startReason = '' },
    statusText: bookingStatusText, money(value) { return Number(value || 0).toFixed(2) },
    eventLabel(type) { return ({ created: '预约已提交', accepted: '预约已接单', accept: '预约已接单', started: '开始上门', start: '开始上门', completed: '回收已完成', complete: '回收已完成', cancelled: '订单已取消', cancel: '订单已取消', assigned: '平台已指派', released: '退回待接单', mapped: '平台已核对区域', quote_confirmed: '用户已确认报价' }[type] || '订单状态更新') },
    async load() { if (!this.id) { this.error = '任务编号无效'; return } if (this.loading) return; this.loading = true; try { const order = await collectorOrder(this.id); this.order = order; if (order.status !== 'confirmed' || order.pricingSnapshot?.status === 'pending') this.cancelStartAgreement(); this.actualItems = (order.actualItems?.length ? order.actualItems : order.items || []).map(item => ({ typeId: item.typeId, name: item.name, quantityUnit: (order.pricingSnapshot?.collectorQuote?.items || []).find(quote => Number(quote.typeId) === Number(item.typeId))?.unit || item.quantityUnit || item.unit || 'kg', quantity: (order.actualItems?.length || !(order.pricingSnapshot?.collectorQuote?.items || []).some(quote => Number(quote.typeId) === Number(item.typeId) && quote.unit !== (item.quantityUnit || item.unit || 'kg'))) ? (item.quantity ?? item.weight ?? '') : '' })); this.actualPrice = order.actualPrice == null ? '' : String(order.actualPrice); this.error = '' } catch (e) { this.order = null; this.error = e.message || '任务加载失败' } finally { this.loading = false } },
    async act(action, extra = {}) { if (this.busy) return; if (action === 'start' && this.order?.pricingSnapshot?.status === 'pending') { this.error = '请等待用户确认报价后再开始上门'; return; } this.busy = true; try { const data = mutationData(this.writes, action, { version: this.order.version, ...extra }); await collectorAction(this.id, action, data); delete this.writes[action]; await this.load(); uni.showToast({ title: action === 'accept' ? '接单成功' : action === 'start' ? '已开始上门' : '回收已完成', icon: 'success' }) } catch (e) { this.error = e.message || '操作失败，请刷新后重试'; await this.load().catch(() => {}); this.error = e.message || '操作失败，请刷新后重试' } finally { this.busy = false } },
    complete() { const price = Number(this.actualPrice); if (this.actualPrice === '' || !Number.isFinite(price) || price < 0 || price >= 100000000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001 || !this.actualItems.length || this.actualItems.some(item => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) { uni.showToast({ title: '请填写有效实际数量和金额', icon: 'none' }); return } this.act('complete', { actualPrice: price, actualItems: this.actualItems.map(item => ({ typeId: item.typeId, quantity: Number(item.quantity), quantityUnit: item.quantityUnit, ...(item.quantityUnit === 'kg' ? { weight: Number(item.quantity) } : {}) })) }) },
    async contact() { if (this.busy) return; this.busy = true; try { await openBookingChat(this.order, this.writes) } catch (e) { this.error = e.message || '联系失败，请刷新任务' } finally { this.busy = false } },
    async support() { if (this.busy) return; this.busy = true; try { await openPlatformSupport() } catch (e) { this.error = e.message || '平台联系失败' } finally { this.busy = false } },
    call() { if (this.order.contactPhone) uni.makePhoneCall({ phoneNumber: String(this.order.contactPhone) }) }
  }
}
</script>

<style scoped>
.task-photos { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 20rpx; }
.task-photos image { width: 180rpx; height: 180rpx; border-radius: 12rpx; }
</style>
