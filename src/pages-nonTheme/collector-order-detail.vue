<template>
  <RecyclingShell title="回收任务详情" :dark="isDark">
    <view v-if="error" class="recycle-error">{{ error }}<button class="recycle-secondary" :disabled="loading" @click="load">刷新任务</button></view>
    <view v-if="loading && !order" class="recycle-empty">加载中…</view>
    <template v-if="order">
      <view class="recycle-card"><view class="recycle-row"><text class="recycle-heading">{{ statusText(order.status) }}</text><text class="recycle-status">{{ order.serviceAreaName || '预约回收' }}</text></view><text class="recycle-muted">订单号 {{ order.orderNo }}</text><text class="recycle-copy">{{ order.appointmentDate }} {{ order.appointmentTimeSlot }}</text>
        <text v-if="order.address" class="recycle-copy">{{ order.address }}</text><text v-if="order.contactName" class="recycle-copy">联系人：{{ order.contactName }}</text><text v-if="order.contactPhone" class="recycle-copy">联系电话：{{ order.contactPhone }}</text><text v-if="order.notes" class="recycle-copy">备注：{{ order.notes }}</text>
        <text v-if="!order.address && order.status === 'pending'" class="recycle-muted">接单后可查看完整地址与联系方式。</text>
      </view>
      <view class="recycle-card"><text class="recycle-heading">回收物品</text><view v-for="(item, index) in order.items || []" :key="index" class="recycle-row"><text>{{ item.name }} · {{ item.weight }}kg</text><text>预估 ¥{{ money(item.subtotal) }}</text></view><view class="recycle-divider" /><text class="recycle-copy">预估合计 ¥{{ money(order.totalPrice) }}</text><text v-if="order.actualPrice != null" class="recycle-copy">现场确认金额 ¥{{ money(order.actualPrice) }}</text><text class="recycle-muted">预估收益与积分不代表已付款或已到账。</text><text v-if="order.cancelReason" class="recycle-copy">取消原因：{{ order.cancelReason }}</text></view>
      <view class="recycle-card">
        <button v-if="order.status === 'pending'" class="recycle-primary" :disabled="busy" @click="act('accept')">{{ busy ? '处理中…' : '接受预约' }}</button>
        <template v-else-if="order.contactPhone">
          <button class="recycle-primary" :disabled="busy" @click="contact">联系用户 · 聊天</button><button class="recycle-secondary" @click="call">拨打业务电话</button>
          <button v-if="order.status === 'confirmed'" class="recycle-primary" :disabled="busy" @click="act('start')">开始上门</button>
        </template>
        <text v-if="['confirmed', 'picking'].includes(order.status)" class="recycle-muted recycle-copy">需要退单、改约或遇到异常时，请联系平台处理；不要直接取消用户预约。</text>
        <button v-if="['confirmed', 'picking'].includes(order.status)" class="recycle-secondary" :disabled="busy" @click="support">联系平台处理异常</button>
      </view>
      <view v-if="order.status === 'picking' && order.contactPhone" class="recycle-card"><text class="recycle-heading">完成回收记录</text><text class="recycle-muted">请按现场称重填写实际数量，并与用户确认金额后提交。</text><view v-for="item in actualItems" :key="item.typeId" class="recycle-row"><text class="recycle-grow">{{ item.name }}（kg）</text><input v-model="item.weight" class="recycle-small-input" type="digit" placeholder="实际重量" :disabled="busy" /></view><text class="recycle-label">现场确认金额（元，可为 0）</text><input v-model="actualPrice" type="digit" placeholder="请输入现场确认金额" :disabled="busy" /><button class="recycle-primary" :disabled="busy" @click="complete">确认完成回收</button></view>
      <view v-if="order.events?.length" class="recycle-card"><text class="recycle-heading">任务记录</text><view v-for="(event, index) in order.events" :key="event.id || index" class="recycle-event"><text>{{ event.title || eventLabel(event.eventType || event.type) }} {{ event.createdAt || '' }}</text><text v-if="event.reason" class="recycle-copy">{{ event.reason }}</text></view></view>
    </template>
  </RecyclingShell>
</template>
<script>
import RecyclingShell from './components/RecyclingShell.vue'
import { collectorOrder, collectorAction, bookingStatusText, openBookingChat, openPlatformSupport, mutationData } from './api/recycling.js'
export default {
  components: { RecyclingShell },
  data: () => ({ id: '', isDark: false, order: null, loading: false, busy: false, error: '', actualItems: [], actualPrice: '', writes: {} }),
  onLoad(options = {}) { this.id = /^\d+$/.test(String(options.id || '')) ? options.id : '' },
  onShow() { this.isDark = uni.getStorageSync('app_theme') === 'dark'; this.load() },
  methods: {
    statusText: bookingStatusText, money(value) { return Number(value || 0).toFixed(2) },
    eventLabel(type) { return ({ created: '预约已提交', accepted: '预约已接单', accept: '预约已接单', started: '开始上门', start: '开始上门', completed: '回收已完成', complete: '回收已完成', cancelled: '订单已取消', cancel: '订单已取消', assigned: '平台已指派', released: '退回待接单', mapped: '平台已核对区域' }[type] || '订单状态更新') },
    async load() { if (!this.id) { this.error = '任务编号无效'; return } if (this.loading) return; this.loading = true; try { const order = await collectorOrder(this.id); this.order = order; this.actualItems = (order.actualItems?.length ? order.actualItems : order.items || []).map(item => ({ typeId: item.typeId, name: item.name, weight: item.weight })); this.actualPrice = order.actualPrice == null ? '' : String(order.actualPrice); this.error = '' } catch (e) { this.order = null; this.error = e.message || '任务加载失败' } finally { this.loading = false } },
    async act(action, extra = {}) { if (this.busy) return; this.busy = true; try { const data = mutationData(this.writes, action, { version: this.order.version, ...extra }); await collectorAction(this.id, action, data); delete this.writes[action]; await this.load(); uni.showToast({ title: action === 'accept' ? '接单成功' : action === 'start' ? '已开始上门' : '回收已完成', icon: 'success' }) } catch (e) { this.error = e.message || '操作失败，请刷新后重试'; await this.load().catch(() => {}); this.error = e.message || '操作失败，请刷新后重试' } finally { this.busy = false } },
    complete() { const price = Number(this.actualPrice); if (this.actualPrice === '' || !Number.isFinite(price) || price < 0 || price >= 100000000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001 || !this.actualItems.length || this.actualItems.some(item => !Number.isFinite(Number(item.weight)) || Number(item.weight) <= 0)) { uni.showToast({ title: '请填写有效实际重量和金额', icon: 'none' }); return } this.act('complete', { actualPrice: price, actualItems: this.actualItems.map(item => ({ typeId: item.typeId, weight: Number(item.weight) })) }) },
    async contact() { if (this.busy) return; this.busy = true; try { await openBookingChat(this.order, this.writes) } catch (e) { this.error = e.message || '联系失败，请刷新任务' } finally { this.busy = false } },
    async support() { if (this.busy) return; this.busy = true; try { await openPlatformSupport() } catch (e) { this.error = e.message || '平台联系失败' } finally { this.busy = false } },
    call() { if (this.order.contactPhone) uni.makePhoneCall({ phoneNumber: String(this.order.contactPhone) }) }
  }
}
</script>
