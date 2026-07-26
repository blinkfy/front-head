<template>
  <view v-if="visible && normalizedItems.length" :class="['achievement-modal-overlay', { 'dark-theme': dark }]" @click="emit('close')">
    <view class="achievement-modal" @click.stop>
      <view class="achievement-modal-glow"></view>
      <view class="achievement-modal-header">
        <text class="achievement-modal-trophy">🏆</text>
        <text class="achievement-modal-title">新成就解锁!</text>
        <text class="achievement-modal-subtitle">恭喜获得 {{ normalizedItems.length }} 项新成就</text>
      </view>
      <scroll-view scroll-y class="achievement-modal-list">
        <view v-for="item in normalizedItems" :key="item.key" class="achievement-modal-item">
          <view :class="['achievement-modal-icon', item.rarity]">
            <AchievementIcon :icon-key="item.iconKey || item.key" size="medium" />
          </view>
          <view class="achievement-modal-info">
            <text class="achievement-modal-name">{{ item.name }}</text>
            <text class="achievement-modal-desc">{{ item.description || '你已达成一个新的里程碑' }}</text>
          </view>
          <text :class="['achievement-modal-rarity', item.rarity]">{{ item.rarityLabel }}</text>
        </view>
      </scroll-view>
      <button class="achievement-modal-button" @click="emit('close')">太棒了!</button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import AchievementIcon from '@/components/AchievementIcon.vue'
import { dedupeAchievementUnlocks } from '@/utils/achievements'

const props = defineProps({
  visible: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
  dark: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])
const normalizedItems = computed(() => dedupeAchievementUnlocks(props.items))
</script>

<style scoped>
.achievement-modal-overlay {
  --am-bg: #ffffff; --am-surface: #f8fafc; --am-text: #0f172a; --am-secondary: #64748b; --am-border: rgba(15,23,42,.09);
  position: fixed; inset: 0; z-index: 10020; display: flex; align-items: center; justify-content: center;
  padding: 32rpx; background: rgba(2, 6, 23, .7); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.achievement-modal-overlay.dark-theme { --am-bg: #172033; --am-surface: #0f172a; --am-text: #f8fafc; --am-secondary: #94a3b8; --am-border: rgba(255,255,255,.08); }
.achievement-modal {
  position: relative; width: 100%; max-width: 680rpx; overflow: hidden; padding: 44rpx 32rpx 32rpx;
  border: 1px solid rgba(212, 175, 55, .32); border-radius: 40rpx;
  color: var(--am-text); background: var(--am-bg);
  box-shadow: 0 36rpx 100rpx rgba(0, 0, 0, .4); animation: achievement-modal-in .35s ease-out both;
}
.achievement-modal-glow { position: absolute; inset: -40%; pointer-events: none; background: radial-gradient(circle, rgba(245, 158, 11, .2), transparent 58%); }
.achievement-modal-header { position: relative; display: flex; flex-direction: column; align-items: center; margin-bottom: 28rpx; }
.achievement-modal-trophy { font-size: 84rpx; line-height: 1; filter: drop-shadow(0 12rpx 20rpx rgba(245, 158, 11, .35)); }
.achievement-modal-title { margin-top: 18rpx; font-size: 38rpx; font-weight: 800; color: var(--am-text); }
.achievement-modal-subtitle { margin-top: 8rpx; font-size: 24rpx; color: var(--am-secondary); }
.achievement-modal-list { position: relative; max-height: 52vh; }
.achievement-modal-item {
  display: flex; align-items: center; gap: 20rpx; margin-bottom: 16rpx; padding: 20rpx;
  border: 1px solid var(--am-border); border-radius: 28rpx; background: var(--am-surface);
}
.achievement-modal-icon { width: 82rpx; height: 82rpx; flex: 0 0 82rpx; display: flex; align-items: center; justify-content: center; border: 4rpx solid; border-radius: 50%; }
.achievement-modal-icon.common { border-color: #b7791f; }.achievement-modal-icon.rare { border-color: #64748b; }
.achievement-modal-icon.epic { border-color: #a855f7; }.achievement-modal-icon.legendary { border-color: #f59e0b; box-shadow: 0 0 24rpx rgba(245,158,11,.28); }
.achievement-modal-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
.achievement-modal-name { font-size: 28rpx; font-weight: 700; color: var(--am-text); }
.achievement-modal-desc { font-size: 21rpx; line-height: 1.45; color: var(--am-secondary); }
.achievement-modal-rarity { flex: 0 0 auto; padding: 6rpx 12rpx; border-radius: 12rpx; font-size: 18rpx; font-weight: 800; }
.achievement-modal-rarity.common { color: #b7791f; background: rgba(183,121,31,.12); }.achievement-modal-rarity.rare { color: #94a3b8; background: rgba(100,116,139,.15); }
.achievement-modal-rarity.epic { color: #c084fc; background: rgba(168,85,247,.14); }.achievement-modal-rarity.legendary { color: #fbbf24; background: rgba(245,158,11,.14); }
.achievement-modal-button { position: relative; margin: 28rpx auto 0; width: 280rpx; border: 0; border-radius: 999rpx; color: #fff; background: linear-gradient(135deg, #d97706, #f59e0b); font-size: 28rpx; font-weight: 800; }
.achievement-modal-button::after { border: 0; }
@keyframes achievement-modal-in { from { opacity: 0; transform: translateY(30rpx) scale(.94); } to { opacity: 1; transform: none; } }
</style>
