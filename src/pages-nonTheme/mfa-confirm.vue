<template>
  <view class="page" :class="{ 'dark-mode': dark }" :style="pageInsets">
    <view class="topbar">
      <button class="back-button" aria-label="返回" @tap="goBack">‹</button>
      <text class="topbar-title">微信验证</text>
    </view>

    <view class="content">
      <view class="card">
        <view class="icon-wrap"><text class="icon">✓</text></view>
        <text class="title">确认双因素验证</text>

        <view v-if="!isMiniProgram" class="notice">
          <text class="notice-title">请在绑定主微信的小程序中打开</text>
          <text class="notice-copy">此确认需要使用账号的主绑定微信。请通过微信扫描登录页面或 APP 上显示的二维码继续。</text>
        </view>

        <view v-else-if="loading" class="state-block">
          <text class="muted">正在核对主绑定微信…</text>
        </view>
        <view v-else-if="error" class="state-block">
          <text class="error-text">{{ error }}</text>
          <button v-if="validScene" class="secondary-button" :disabled="busy" @tap="inspect">重新检查</button>
        </view>
        <view v-else-if="info" class="request-block">
          <view class="operation-pill">{{ operationLabel }}</view>
          <text class="account">{{ info.accountName }}</text>
          <text class="muted">{{ operationDescription }}</text>

          <view class="details">
            <view class="detail-row"><text class="detail-label">发起设备</text><text class="detail-value">{{ info.client || '未知设备' }}</text></view>
            <view class="detail-row"><text class="detail-label">所在地区</text><text class="detail-value">{{ info.location || '暂不可用' }}</text></view>
            <view class="detail-row"><text class="detail-label">发起时间</text><text class="detail-value">{{ createdAt }}</text></view>
          </view>

          <view class="warning">
            仅在这是你本人刚发起的验证时确认。若你不认识这次请求，请选择拒绝。
          </view>

          <view v-if="info.status === 'waiting'" class="actions">
            <button class="approve-button" :loading="busy && action === 'approve'"
              :disabled="busy" @tap="submit(true)">{{ confirmActionLabel }}</button>
            <button class="deny-button" :loading="busy && action === 'deny'"
              :disabled="busy" @tap="submit(false)">拒绝这次请求</button>
          </view>
          <view v-else class="state-pill" :class="{ denied: info.status === 'denied' }">
            {{ info.status === 'approved' ? '已确认' : info.status === 'denied' ? '已拒绝' : '此请求已处理' }}
          </view>
        </view>

        <view v-if="resultMessage" class="result-message">{{ resultMessage }}</view>
        <text v-if="isMiniProgram && !validScene" class="error-text">二维码参数无效，请重新扫描。</text>
      </view>
      <text class="footer">本页面只确认当前请求，不会登录或切换账号。</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { ThemeManager } from '@/utils/theme.js'
import { getWechatLoginCode } from '@/utils/wechat-login.mjs'
import { mfaRequest } from '@/api/mfa.js'

const scene = ref('')
const info = ref(null)
const safeTop = ref('0px')
const topbarRow = ref('46px')
const loading = ref(false)
const busy = ref(false)
const action = ref('')
const error = ref('')
const resultMessage = ref('')
const isMiniProgram = ref(false)
const dark = ref(ThemeManager.getTheme() === 'dark')
const pageInsets = computed(() => ({ '--safe-top': safeTop.value, '--topbar-row': topbarRow.value }))
const validScene = computed(() => /^mf_[0-9a-f]{28}$/.test(scene.value))
const operationLabel = computed(() => ({ login: '登录验证', setup: '开启微信确认', bind: '添加微信确认' }[info.value?.operation] || '账号验证'))
const confirmActionLabel = computed(() => ({ login: '确认登录', setup: '确认开启', bind: '确认添加' }[info.value?.operation] || '确认'))
const operationDescription = computed(() => ({
  login: '有人正在使用密码登录此账号。',
  setup: '有人正在为此账号开启微信确认。',
  bind: '有人正在为此账号添加微信确认。'
}[info.value?.operation] || '有人正在发起账号验证。'))
const createdAt = computed(() => {
  const value = Date.parse(info.value?.createdAt || '')
  return Number.isFinite(value) ? new Date(value).toLocaleString() : '刚刚'
})

onLoad(options => {
  setTopInsets()
  scene.value = String(options?.scene || '')
  // #ifdef MP-WEIXIN
  isMiniProgram.value = true
  if (validScene.value) void inspect()
  // #endif
})

function setTopInsets() {
  let statusBarHeight = 0
  try {
    const system = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    statusBarHeight = Number(system?.statusBarHeight) || 0
  } catch (_) {}
  let rowHeight = 46
  // #ifdef MP-WEIXIN
  try {
    const capsule = wx.getMenuButtonBoundingClientRect?.()
    if (capsule?.bottom) rowHeight = Math.max(rowHeight, Number(capsule.bottom) + 8 - statusBarHeight)
  } catch (_) {}
  // #endif
  safeTop.value = `${statusBarHeight}px`
  topbarRow.value = `${rowHeight}px`
}

async function inspect() {
  if (!validScene.value || loading.value || busy.value) return
  loading.value = true
  error.value = ''
  resultMessage.value = ''
  try {
    const wechatCode = await getWechatLoginCode(uni)
    const response = await mfaRequest('wechat/inspect', { scene: scene.value, wechatCode })
    info.value = response.data
  } catch (cause) {
    info.value = null
    error.value = cause?.message || '无法核对请求，请稍后重试。'
  } finally { loading.value = false }
}

async function submit(approve) {
  if (!validScene.value || busy.value) return
  busy.value = true
  action.value = approve ? 'approve' : 'deny'
  error.value = ''
  resultMessage.value = ''
  try {
    const wechatCode = await getWechatLoginCode(uni)
    await mfaRequest('wechat/confirm', { scene: scene.value, wechatCode, approve })
    info.value = { ...info.value, status: approve ? 'approved' : 'denied' }
    resultMessage.value = approve ? '已确认。请返回发起验证的页面继续。' : '已拒绝这次请求。'
  } catch (cause) {
    error.value = cause?.message || '操作未完成，请重试。'
  } finally {
    busy.value = false
    action.value = ''
  }
}

function goBack() { uni.navigateBack({ fail: () => {} }) }
</script>

<style scoped>
.page { min-height: 100vh; box-sizing: border-box; background: #f2f6f4; color: #20352b; padding-top: var(--safe-top, 0px); padding-bottom: env(safe-area-inset-bottom); }
.topbar { height: var(--topbar-row, 46px); display: flex; align-items: center; justify-content: center; position: relative; padding: 0 28rpx; box-sizing: border-box; }
.topbar-title { font-size: 32rpx; font-weight: 700; }
.back-button { position: absolute; left: 22rpx; top: 0; width: 68rpx; height: 100%; line-height: 58rpx; padding: 0; border: 0; background: transparent; color: inherit; font-size: 58rpx; font-weight: 300; }
.back-button::after, .approve-button::after, .deny-button::after, .secondary-button::after { border: 0; }
.content { min-height: calc(100vh - var(--safe-top, 0px) - var(--topbar-row, 46px)); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32rpx 28rpx 60rpx; box-sizing: border-box; }
.card { width: 100%; max-width: 680rpx; box-sizing: border-box; padding: 48rpx 36rpx 38rpx; border-radius: 30rpx; background: #fff; box-shadow: 0 18rpx 55rpx rgba(38, 72, 54, .09); }
.icon-wrap { width: 82rpx; height: 82rpx; margin: 0 auto 20rpx; border-radius: 28rpx; display: flex; align-items: center; justify-content: center; background: #e8f6ee; color: #188653; }
.icon { font-size: 44rpx; font-weight: 700; }
.title { display: block; text-align: center; font-size: 36rpx; font-weight: 750; margin-bottom: 30rpx; }
.notice, .state-block { display: flex; flex-direction: column; align-items: center; gap: 18rpx; padding: 24rpx 8rpx; text-align: center; }
.notice-title { font-size: 29rpx; font-weight: 650; }
.notice-copy, .muted { display: block; color: #718077; font-size: 25rpx; line-height: 1.65; }
.request-block { display: flex; flex-direction: column; align-items: center; }
.operation-pill, .state-pill { display: inline-flex; align-items: center; justify-content: center; padding: 10rpx 22rpx; border-radius: 999rpx; color: #167848; background: #eaf7ef; font-size: 23rpx; font-weight: 650; }
.account { margin-top: 20rpx; font-size: 38rpx; font-weight: 750; overflow-wrap: anywhere; }
.account + .muted { margin-top: 10rpx; text-align: center; }
.details { width: 100%; margin-top: 30rpx; border-top: 1rpx solid #e9eeeb; border-bottom: 1rpx solid #e9eeeb; padding: 8rpx 0; }
.detail-row { min-height: 66rpx; display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.detail-label { color: #79877f; font-size: 24rpx; flex: none; }
.detail-value { color: #2d4136; font-size: 25rpx; text-align: right; overflow-wrap: anywhere; }
.warning { width: 100%; box-sizing: border-box; margin-top: 24rpx; padding: 20rpx 22rpx; border-radius: 16rpx; background: #fff7e8; color: #806229; font-size: 23rpx; line-height: 1.6; }
.actions { width: 100%; margin-top: 28rpx; }
.approve-button, .deny-button, .secondary-button { width: 100%; border-radius: 14rpx; font-size: 27rpx; margin-top: 18rpx; }
.approve-button { color: #fff; background: #178553; }
.approve-button[disabled] { opacity: .5; }
.deny-button, .secondary-button { color: #43564a; background: #eef2ef; }
.state-pill { margin-top: 28rpx; }
.state-pill.denied { color: #a0443d; background: #fff0ee; }
.error-text { display: block; text-align: center; color: #bb4941; font-size: 25rpx; line-height: 1.6; margin-top: 18rpx; }
.result-message { margin-top: 20rpx; color: #167848; font-size: 25rpx; text-align: center; line-height: 1.6; }
.footer { max-width: 620rpx; margin-top: 26rpx; color: #718077; font-size: 22rpx; text-align: center; line-height: 1.6; }
.dark-mode { background: #141d19; color: #ecf3ee; }
.dark-mode .card { background: #202b25; box-shadow: 0 18rpx 55rpx rgba(0, 0, 0, .25); }
.dark-mode .icon-wrap, .dark-mode .operation-pill { color: #9ce0b8; background: #263d30; }
.dark-mode .muted, .dark-mode .detail-label, .dark-mode .footer { color: #a8b8ae; }
.dark-mode .detail-value { color: #e0ebe4; }
.dark-mode .details { border-color: #39483f; }
.dark-mode .warning { background: #3c3322; color: #e9cf91; }
.dark-mode .deny-button, .dark-mode .secondary-button { color: #d9e4dd; background: #334239; }
.dark-mode .state-pill.denied { color: #ffbbb4; background: #462b29; }
.dark-mode .error-text { color: #ff9e95; }
.dark-mode .state-pill:not(.denied) { color: #9ce0b8; background: #263d30; }
.dark-mode .result-message { color: #9ce0b8; }
</style>
