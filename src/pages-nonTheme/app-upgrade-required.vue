<template>
  <view class="upgrade-page">
    <view class="upgrade-card">
      <text class="upgrade-title">请升级应用</text>
      <text class="upgrade-message">{{ state.blocked?.msg || '请更新应用后继续使用' }}</text>
      <text v-if="state.blocked" class="upgrade-version">当前版本 {{ state.version }} · 最低版本 {{ state.blocked.data.minVersion }}</text>
      <text v-if="!state.downloadUrl" class="upgrade-message">暂无适用的安装包，请联系管理员。</text>
      <button type="primary" :disabled="!state.downloadUrl" @click="download">立即升级</button>
      <button :loading="checking" @click="recheck">我已更新，重新检查</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { onShow, onBackPress } from '@dcloudio/uni-app'
// #ifdef APP-PLUS
import { appVersionGuard } from '@/utils/app-version-guard.js'
const guard = appVersionGuard()
const state = ref(guard.getState())
const unsubscribe = guard.subscribe(value => { state.value = value })
onUnmounted(unsubscribe)
// #endif
// #ifndef APP-PLUS
const state = ref({})
// #endif
const checking = ref(false)
onBackPress(() => true)
function download() {
  // #ifdef APP-PLUS
  guard.download()
  // #endif
}
async function recheck() {
  // #ifdef APP-PLUS
  if (checking.value) return
  checking.value = true
  try {
    await guard.refresh({ force: true })
    if (!state.value.blocked) uni.reLaunch({ url: uni.homeUrl() })
  } catch (_) { uni.showToast({ title: '检查失败，请稍后重试', icon: 'none' }) }
  finally { checking.value = false }
  // #endif
}
onShow(recheck)
</script>

<style scoped>
.upgrade-page { min-height: 100vh; box-sizing: border-box; padding: 160rpx 40rpx 60rpx; background: #f3f7f5; }
.upgrade-card { padding: 56rpx 36rpx; border-radius: 28rpx; background: #fff; }
.upgrade-title { display: block; margin-bottom: 28rpx; font-size: 44rpx; font-weight: 600; color: #183b2c; }
.upgrade-message, .upgrade-version { display: block; margin-bottom: 30rpx; font-size: 28rpx; line-height: 1.7; color: #52665b; }
.upgrade-version { font-size: 24rpx; }
button { margin-top: 24rpx; }
</style>
