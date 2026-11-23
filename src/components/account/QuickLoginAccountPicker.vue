<template>
  <view v-if="pending" class="quick-account-overlay" :class="{ 'is-dark': dark }" @click="finish(null)" @touchmove.stop.prevent>
    <view class="quick-account-dialog" @click.stop>
      <text class="quick-account-title">选择登录账号</text>
      <scroll-view scroll-y class="quick-account-list" :style="{ height: Math.min(accounts.length * 112, 560) + 'rpx' }">
        <button v-for="account in accounts" :key="account.userId" class="quick-account-row" @click="finish(account.userId)">
          <text class="quick-account-name">{{ account.username || `账号 ${account.userId}` }}</text>
          <text v-if="String(account.userId) === String(selectedId)" class="quick-account-selected">当前选择</text>
        </button>
      </scroll-view>
      <button class="quick-account-cancel" @click="finish(null)">取消</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { onHide } from '@dcloudio/uni-app'
defineProps({ dark: Boolean })
const pending = ref(false), accounts = ref([]), selectedId = ref(null)
let resolvePending
function finish(id) {
  pending.value = false
  accounts.value = []
  const resolve = resolvePending; resolvePending = null; resolve?.(id)
}
function open(items, currentId) {
  finish(null)
  accounts.value = items.map(item => ({ userId: item.userId, username: item.username }))
  selectedId.value = currentId
  pending.value = true
  return new Promise(resolve => { resolvePending = resolve })
}
onHide(() => finish(null))
onBeforeUnmount(() => finish(null))
defineExpose({ open })
</script>

<style scoped>
.quick-account-overlay { --quick-bg: #fff; --quick-text: #1f2937; --quick-muted: #6b7280; --quick-accent: #059669; --quick-field: #f0fdf8; position: fixed; inset: 0; z-index: 20010; display: flex; align-items: center; justify-content: center; padding: 32rpx; background: rgba(9, 24, 32, .65); }
.is-dark { --quick-bg: #202b43; --quick-text: #eef2ff; --quick-muted: #b0bdd2; --quick-accent: #8ab0ff; --quick-field: #162137; }
.quick-account-dialog { width: 100%; max-width: 620rpx; padding: 32rpx 24rpx 20rpx; box-sizing: border-box; border-radius: 24rpx; color: var(--quick-text); background: var(--quick-bg); }
.quick-account-title { display: block; padding: 0 8rpx 24rpx; font-size: 32rpx; font-weight: 600; }
.quick-account-list { max-height: 50vh; }
.quick-account-row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin: 0 0 12rpx; padding: 22rpx; text-align: left; border-radius: 14rpx; background: var(--quick-field); color: var(--quick-text); font-size: 28rpx; line-height: 1.6; }
.quick-account-name { min-width: 0; overflow-wrap: anywhere; }
.quick-account-selected { flex-shrink: 0; color: var(--quick-accent); font-size: 23rpx; }
.quick-account-cancel { margin-top: 16rpx; color: var(--quick-muted); background: transparent; font-size: 26rpx; }
.quick-account-row::after, .quick-account-cancel::after { border: 0; }
</style>
