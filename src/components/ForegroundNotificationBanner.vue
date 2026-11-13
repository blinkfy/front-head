<template>
  <view v-if="notice" class="foreground-notice" :class="{ 'foreground-notice-dark': dark }" :style="{ top: top + 'px' }" role="alert" aria-live="polite">
    <view class="foreground-notice-body" role="button" tabindex="0" :aria-label="notice.title + '，' + notice.content" @click="open" @keydown.enter.prevent="open" @keydown.space.prevent="open"
      @touchstart="touchStart" @touchend="touchEnd">
      <view class="foreground-notice-avatar">
        <text v-if="!notice.avatar || avatarFailed" class="foreground-notice-icon">{{ notice.icon }}</text>
        <image v-else :key="notice.id" class="foreground-notice-image" :src="notice.avatar" :data-notice-id="notice.id" mode="aspectFill" @error="failAvatar" />
      </view>
      <view class="foreground-notice-copy">
        <text class="foreground-notice-title">{{ notice.title }}</text>
        <text v-if="notice.content" class="foreground-notice-content">{{ notice.content }}</text>
      </view>
    </view>
    <view class="foreground-notice-close" role="button" tabindex="0" aria-label="关闭消息提示" @click.stop="dismiss" @keydown.enter.prevent="dismiss"><text>×</text></view>
  </view>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { foregroundNotifications } from '@/utils/foreground-notification.mjs'
import { ThemeManager } from '@/utils/theme.js'

const notice = ref(null), avatarFailed = ref(false), dark = ref(false), top = ref(12)
const props = defineProps({ nativeNavigation: Boolean, pagePath: { type: String, default: '' } })
let unsubscribe, touchY = null
onMounted(() => {
  try {
    const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    top.value = Math.max(Number(info.statusBarHeight) || 0, Number(info.safeArea?.top) || 0) + 12
    // #ifdef MP-WEIXIN
    const capsule = uni.getMenuButtonBoundingClientRect()
    top.value = Math.max(Number(capsule?.bottom) || 0, (Number(info.statusBarHeight) || 0) + 44) + 8
    // #endif
    // A native navigation bar already sits above the page viewport.
    if (props.nativeNavigation) top.value = 12
  } catch (_) {}
  unsubscribe = foregroundNotifications.subscribe(value => {
    if (props.pagePath && getCurrentPages().slice(-1)[0]?.route !== props.pagePath) value = null
    if (value?.id !== notice.value?.id) avatarFailed.value = false
    dark.value = ThemeManager.getTheme() === 'dark'
    notice.value = value
  })
})
onBeforeUnmount(() => unsubscribe?.())
function open() { if (notice.value) foregroundNotifications.tap(notice.value.id) }
function dismiss() { if (notice.value) foregroundNotifications.dismiss(notice.value.id) }
function failAvatar(event) {
  if (String(event.currentTarget?.dataset?.noticeId) === String(notice.value?.id)) avatarFailed.value = true
}
function touchStart(event) { touchY = event.touches?.[0]?.clientY ?? null }
function touchEnd(event) {
  const end = event.changedTouches?.[0]?.clientY
  if (touchY !== null && Number.isFinite(end) && touchY - end > 24) dismiss()
  touchY = null
}
</script>

<style scoped>
.foreground-notice { position: fixed; left: 16px; right: 16px; max-width: 440px; margin: 0 auto; z-index: 99999; display: flex; align-items: stretch; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; color: #1f2937; box-shadow: 0 6px 24px #0002; overflow: hidden; animation: foreground-notice-enter .18s ease-out; }
.foreground-notice-body { display: flex; align-items: center; flex: 1; min-width: 0; gap: 11px; padding: 13px 0 13px 14px; cursor: pointer; }
.foreground-notice-avatar { flex-shrink: 0; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 11px; background: #eef5f2; overflow: hidden; }
.foreground-notice-icon { font-size: 23px; line-height: 1; }
.foreground-notice-image { display: block; width: 42px; height: 42px; }
.foreground-notice-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.foreground-notice-title { display: block; font-size: 14px; font-weight: 600; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.foreground-notice-content { display: block; font-size: 13px; line-height: 19px; color: #66736c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.foreground-notice-close { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; min-height: 56px; color: #7b8680; font-size: 22px; cursor: pointer; }
.foreground-notice-dark { background: #1f2925; border-color: #39463e; color: #f2f6f3; box-shadow: 0 6px 24px #0005; }
.foreground-notice-dark .foreground-notice-content { color: #bbc7c0; }
.foreground-notice-dark .foreground-notice-avatar { background: #31453b; }
@keyframes foreground-notice-enter { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
</style>
