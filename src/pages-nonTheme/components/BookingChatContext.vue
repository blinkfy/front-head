<template>
  <view v-if="currentOrder" class="booking-chat-context" :class="{ dark }">
    <view class="booking-chat-row"><text class="booking-chat-title">预约联系 · {{ statusText(currentOrder.status) }}</text><text class="booking-chat-link" @click="openOrder">查看预约 ›</text></view>
    <picker v-if="orders.length > 1" :range="orders" range-key="orderNo" :value="selectedIndex" @change="selectedIndex = Number($event.detail.value)"><view class="booking-chat-copy">订单 {{ currentOrder.orderNo }} · 切换预约⌄</view></picker>
    <text v-else class="booking-chat-copy">订单 {{ currentOrder.orderNo }}</text>
    <text class="booking-chat-copy">{{ currentOrder.appointmentDate }} {{ currentOrder.appointmentTimeSlot }}</text>
  </view>
  <view v-else-if="error && initialOrderId" class="booking-chat-context" :class="{ dark }" @click="load"><text class="booking-chat-copy">预约信息暂不可用，点击重试</text></view>
</template>
<script>
import { bookingChatContext, bookingStatusText } from '../api/recycling.js'
import { messageBus } from '@/utils/message-event-bus.js'
export default {
  props: { targetUserId: { type: [String, Number], default: '' }, initialOrderId: { type: [String, Number], default: '' }, refreshToken: Number, dark: Boolean },
  data: () => ({ orders: [], selectedIndex: 0, error: false, revision: 0, listener: null }),
  computed: { currentOrder() { return this.orders[this.selectedIndex] || null } },
  watch: { targetUserId: { immediate: true, handler() { this.load() } }, refreshToken() { this.load() } },
  mounted() { this.listener = event => { if (event?.notification?.kind === 'booking' || event?.type === 'chat.reconnected') this.load() }; messageBus.on('notification.changed', this.listener); messageBus.on('chat.reconnected', this.listener) },
  beforeUnmount() { this.revision++; messageBus.off('notification.changed', this.listener); messageBus.off('chat.reconnected', this.listener) },
  methods: {
    statusText: bookingStatusText,
    async load() { const revision = ++this.revision; if (!/^\d+$/.test(String(this.targetUserId || ''))) { this.orders = []; return } const account = uni.getStorageSync('token'); this.error = false; try { const data = await bookingChatContext(this.targetUserId); if (revision !== this.revision || account !== uni.getStorageSync('token')) return; const currentId = this.currentOrder?.id || this.initialOrderId; this.orders = data.orders || []; this.selectedIndex = Math.max(0, this.orders.findIndex(order => String(order.id) === String(currentId))) } catch (_) { if (revision === this.revision) { this.orders = []; this.error = true } } },
    openOrder() { const order = this.currentOrder; if (!order) return; uni.navigateTo({ url: order.role === 'collector' ? `/pages-nonTheme/collector-order-detail?id=${order.id}` : `/pages-nonTheme/booking-orders?orderId=${order.id}` }) }
  }
}
</script>
<style scoped>
.booking-chat-context { margin:0 8rpx 22rpx; padding:22rpx; border-radius:16rpx; background:#e7f4ec; color:#28523a; border:1rpx solid #c8e3d0; }
.booking-chat-row { display:flex; align-items:center; justify-content:space-between; gap:18rpx; }
.booking-chat-title { font-size:26rpx; font-weight:600; }
.booking-chat-link { font-size:25rpx; color:#087346; white-space:nowrap; }
.booking-chat-copy { display:block; font-size:23rpx; line-height:1.7; margin-top:6rpx; }
.dark { background:#203e2d; color:#dbefe2; border-color:#375e45; }
.dark .booking-chat-link { color:#8bddae; }
</style>
