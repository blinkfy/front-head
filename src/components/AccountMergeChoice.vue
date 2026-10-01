<template>
  <view class="merge-mask" :class="{ dark }" @touchmove.stop.prevent>
    <view class="merge-panel">
      <view class="merge-heading">
        <view><text class="merge-title">合并你的两个账号</text><text class="merge-subtitle">请选择要保留的账号</text></view>
        <button class="merge-close" @click="$emit('cancel')">×</button>
      </view>
      <scroll-view scroll-y class="merge-body">
        <view v-for="card in cards" :key="card.value" class="account-card"
          :class="{ selected: selected === card.value, blocked: !card.direction.canMerge }"
          @click="select(card)">
          <view class="account-heading">
            <ManifestIcon id="user_profile" class="account-icon" />
            <view class="account-name"><text class="account-kind">{{ card.label }}</text><text class="account-nickname">{{ card.account.nickname || card.account.username }}</text><text class="account-id">账号：{{ card.account.username }}</text></view>
            <text class="account-points">{{ card.account.points }} 积分</text>
          </view>
          <view class="account-stats">
            <text>接收 {{ card.direction.counts?.recognitionHistory || 0 }} 条识别记录</text>
            <text>{{ card.direction.counts?.friends || 0 }} 位好友 · {{ card.direction.counts?.purchaseRecords || 0 }} 条兑换记录</text>
          </view>
          <view v-if="!card.direction.canMerge" class="merge-blockers">
            <text v-for="item in card.direction.blockers" :key="item.code">{{ item.message }}</text>
          </view>
          <view class="keep-account"><text>{{ card.direction.canMerge ? '保留这个账号' : '暂时无法选择' }}</text><text>{{ selected === card.value ? '✓' : '○' }}</text></view>
        </view>
        <view class="merge-note">
          <text>合并后共 {{ preview.pointsAfterMerge }} 积分</text>
          <text>保留账号的资料和密码不变，微信将绑定此账号。</text>
          <text>另一账号将永久删除，设备连接断开。此操作不能撤销。</text>
        </view>
      </scroll-view>
      <button class="merge-confirm" :disabled="!selected" @click="$emit('choose', selected)">确认合并并登录</button>
      <button class="merge-cancel" @click="$emit('cancel')">暂不合并</button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
const props = defineProps({ preview: { type: Object, required: true }, dark: Boolean })
defineEmits(['choose', 'cancel'])
const selected = ref('')
const cards = computed(() => [
  { value: 'currentWechat', label: '当前微信账号', account: props.preview.currentWechat, direction: props.preview.keepA },
  { value: 'verified', label: '已验证的历史账号', account: props.preview.verified, direction: props.preview.keepB }
])
function select(card) { if (card.direction.canMerge) selected.value = card.value }
</script>

<style scoped>
.merge-mask { position: fixed; inset: 0; z-index: 10020; display: flex; align-items: center; justify-content: center; padding: 24rpx; background: rgba(12, 36, 31, .55); }
.merge-panel { width: 100%; max-width: 520px; box-sizing: border-box; padding: 30rpx; border-radius: 30rpx; background: #f8fcfa; color: #20392f; box-shadow: 0 24rpx 90rpx rgba(5, 36, 28, .22); }
.merge-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24rpx; }
.merge-title { display: block; font-size: 36rpx; font-weight: 700; }
.merge-subtitle { display: block; font-size: 25rpx; color: #75867f; margin-top: 8rpx; }
.merge-close { margin: 0; width: 54rpx; height: 54rpx; padding: 0; line-height: 50rpx; font-size: 38rpx; color: #74857c; border-radius: 50%; background: #eaf2ee; }
.merge-close::after, .merge-confirm::after, .merge-cancel::after { border: 0; }
.merge-body { height: 62vh; max-height: 780rpx; }
.account-card { padding: 24rpx; margin-bottom: 20rpx; border: 2rpx solid #ddeae3; border-radius: 22rpx; background: #fff; }
.account-card.selected { border-color: #08aa7f; background: #effbf5; }
.account-card.blocked { background: #f3f5f4; }
.account-heading { display: flex; align-items: center; }
.account-icon { width: 68rpx; height: 68rpx; margin-right: 16rpx; flex-shrink: 0; }
.account-name { flex: 1; min-width: 0; }
.account-kind { display: block; font-size: 23rpx; color: #72877a; }
.account-nickname { display: block; font-size: 30rpx; font-weight: 700; word-break: break-all; margin-top: 4rpx; }
.account-id { display: block; font-size: 22rpx; color: #819088; word-break: break-all; }
.account-points { font-size: 24rpx; color: #079976; margin-left: 10rpx; }
.account-stats { margin-top: 18rpx; font-size: 23rpx; line-height: 1.7; color: #728078; }
.account-stats text, .merge-blockers text, .merge-note text { display: block; }
.keep-account { display: flex; justify-content: space-between; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid #e9f0ec; color: #079976; font-size: 26rpx; font-weight: 600; }
.blocked .keep-account { color: #88928c; }
.merge-blockers { margin-top: 14rpx; font-size: 23rpx; color: #a86b42; line-height: 1.65; }
.merge-note { padding: 4rpx 6rpx 18rpx; color: #8b7564; font-size: 23rpx; line-height: 1.8; }
.merge-confirm { margin-top: 20rpx; background: #06a97d; color: #fff; border-radius: 18rpx; font-size: 29rpx; font-weight: 600; }
.merge-confirm[disabled] { background: #cddbd3; color: #fff; }
.merge-cancel { margin-top: 8rpx; background: transparent; color: #7b8a81; font-size: 25rpx; }
.dark .merge-panel { background: #172b25; color: #e5f5ed; }
.dark .account-card { background: #20372f; border-color: #3c5549; }
.dark .account-card.selected { background: #1b4939; border-color: #35ca9c; }
.dark .account-card.blocked { background: #293831; }
.dark .account-kind, .dark .account-stats, .dark .account-id { color: #a0b6aa; }
.dark .keep-account { border-color: #3b5446; color: #55d2aa; }
.dark .account-points { color: #55d2aa; }
.dark .merge-note, .dark .merge-blockers { color: #d9ba92; }
</style>
