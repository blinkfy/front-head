<template>
  <view class="booking-chat-card" role="button" :aria-disabled="disabled" @click.stop="openOrder">
    <ManifestIcon id="recycling_booking" size="54rpx" />
    <view class="booking-chat-copy">
      <text class="booking-chat-title">预约联系</text>
      <text class="booking-chat-detail">{{ statusText(order.status) }} · {{ order.appointmentDate }} {{ order.appointmentTimeSlot }}</text>
      <text class="booking-chat-number">订单 {{ order.orderNo }}</text>
      <view class="booking-chat-action"><text>查看预约</text><text class="booking-chat-arrow">›</text></view>
    </view>
  </view>
</template>

<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { bookingStatusText } from '../api/recycling.js'

export default {
  components: { ManifestIcon },
  props: { order: { type: Object, required: true }, disabled: Boolean },
  methods: {
    statusText: bookingStatusText,
    openOrder() {
      if (this.disabled) return
      const { id, role } = this.order
      const url = role === 'collector' ? `/pages-nonTheme/collector-order-detail?id=${id}` : `/pages-nonTheme/booking-orders?orderId=${id}`
      uni.navigateTo({ url })
    }
  }
}
</script>

<style scoped>
.booking-chat-card { display: flex; align-items: flex-start; gap: 20rpx; width: 450rpx; max-width: 100%; box-sizing: border-box; margin: 0 auto; padding: 24rpx; border-radius: 18rpx; color: var(--text-primary); background: var(--bg-secondary); }
.booking-chat-copy { flex: 1; min-width: 0; }
.booking-chat-title, .booking-chat-detail, .booking-chat-number { display: block; line-height: 1.5; }
.booking-chat-title { font-size: 29rpx; font-weight: 600; }
.booking-chat-detail { margin-top: 10rpx; font-size: 25rpx; overflow-wrap: anywhere; }
.booking-chat-number { margin-top: 6rpx; font-size: 23rpx; color: var(--text-secondary); word-break: break-all; }
.booking-chat-action { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx; padding-top: 14rpx; border-top: 1rpx solid var(--border-color, #e6ebe8); font-size: 23rpx; color: var(--text-secondary); }
.booking-chat-arrow { font-size: 30rpx; }
</style>
