<template>
  <view v-if="visible" class="wechat-mfa-overlay" :class="{ 'is-dark': dark }" @touchmove.stop.prevent>
    <view class="wechat-mfa-dialog">
      <text class="wechat-mfa-title">微信验证</text>
      <text class="wechat-mfa-copy">{{ direct ? '核对本次操作后确认即可。' : '使用已绑定的微信扫码确认，即可继续。' }}</text>
      <template v-if="request">
        <text class="wechat-mfa-account">{{ request.accountName }}</text>
        <text class="wechat-mfa-detail">{{ operationLabel }} · {{ request.client }}</text>
        <text class="wechat-mfa-detail">{{ request.location }}（按网络地址估算）</text>
        <text class="wechat-mfa-detail">{{ requestTime }}</text>
      </template>
      <template v-if="!direct">
        <image v-if="qr" class="wechat-mfa-qr" :src="qr" mode="aspectFit" />
        <text v-else class="wechat-mfa-copy">{{ preparing || loadingQr ? '正在准备确认码…' : '暂未获取确认码，可重试或返回使用其他方式。' }}</text>
        <button v-if="!qr && !loadingQr && request" class="wechat-mfa-secondary" @click="loadQr">重新获取确认码</button>
      </template>
      <text v-if="error" class="wechat-mfa-error" role="alert">{{ error }}</text>
      <button v-if="error && request" class="wechat-mfa-secondary" :disabled="busy" @click="refresh">刷新确认状态</button>
      <button v-if="direct && request" class="wechat-mfa-primary" :disabled="busy || !identityReady" :loading="busy" @click="confirm">{{ request.operation === 'login' ? '确认登录' : '确认开启' }}</button>
      <button v-if="direct && request && !identityReady" class="wechat-mfa-secondary" :disabled="busy" @click="inspect">重新核对微信身份</button>
      <button class="wechat-mfa-secondary" @click="finish(null)">返回使用其他方式</button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { mfaRequest } from '@/api/mfa'
// #ifdef MP-WEIXIN
import { getWechatLoginCode } from '@/utils/wechat-login.mjs'
// #endif
defineProps({ dark: Boolean })
const visible = ref(false), request = ref(null), qr = ref(''), error = ref(''), busy = ref(false), loadingQr = ref(false), identityReady = ref(false), preparing = ref(false)
let direct = false
// #ifdef MP-WEIXIN
direct = true
// #endif
const operationLabel = computed(() => request.value?.operation === 'setup' ? '开启双因素验证' : request.value?.operation === 'bind' ? '开启微信确认' : '密码登录确认')
const requestTime = computed(() => request.value?.createdAt ? new Date(request.value.createdAt).toLocaleString() : '')
let ticket = '', revision = 0, timer, resolver, page, foreground = true, pollingOwner = -1
const current = owner => visible.value && owner === revision
function finish(result) {
  const previousTicket = ticket, scene = request.value?.scene
  revision++; clearTimeout(timer); visible.value = false; request.value = null; qr.value = ''; ticket = ''; busy.value = false
  if (!result && previousTicket && scene) void mfaRequest('wechat/cancel', { mfaTicket: previousTicket, scene }).catch(() => {})
  const resolve = resolver; resolver = null; resolve?.(result)
}
async function loadQr() {
  if (!request.value || loadingQr.value) return
  const owner = revision
  loadingQr.value = true
  try {
    const result = await mfaRequest('wechat/qrcode', { mfaTicket: ticket, scene: request.value.scene })
    if (current(owner)) qr.value = result.data.image
  } catch (_) { if (current(owner)) error.value = '确认码暂不可用，可重试或使用其他验证方式' }
  finally { if (current(owner)) loadingQr.value = false }
}
async function poll(owner) {
  if (!current(owner) || !request.value || !foreground || pollingOwner === owner) return
  if (Date.now() >= request.value.expiresAt) { error.value = '请求已过期，请返回重新发起或使用其他验证方式'; return }
  pollingOwner = owner
  try {
    const result = await mfaRequest('wechat/status', { mfaTicket: ticket, scene: request.value.scene, consume: true })
    if (!current(owner)) return
    if (result.token) { finish(result); return }
    if (result.data?.status === 'denied') { error.value = '本次请求已拒绝，可返回使用其他方式'; return }
  } catch (cause) { if (current(owner)) { error.value = cause.message; return } }
  finally { if (pollingOwner === owner) pollingOwner = -1 }
  if (current(owner) && foreground) timer = setTimeout(() => { void poll(owner) }, 1800)
}
function refresh() { clearTimeout(timer); error.value = ''; void poll(revision) }
async function inspect() {
  // #ifdef MP-WEIXIN
  if (!request.value || busy.value) return
  const owner = revision
  busy.value = true; error.value = ''
  try {
    await mfaRequest('wechat/inspect', { scene: request.value.scene, wechatCode: await getWechatLoginCode(uni) })
    if (current(owner)) identityReady.value = true
  } catch (cause) { if (current(owner)) error.value = cause.message }
  finally { if (current(owner)) busy.value = false }
  // #endif
}
async function confirm() {
  // #ifdef MP-WEIXIN
  if (busy.value || !identityReady.value || !request.value) return
  const owner = revision
  busy.value = true; error.value = ''
  try {
    await mfaRequest('wechat/confirm', { scene: request.value.scene, wechatCode: await getWechatLoginCode(uni), approve: true })
    if (current(owner)) { clearTimeout(timer); await poll(owner) }
  } catch (cause) { if (current(owner)) error.value = cause.message }
  finally { if (current(owner)) busy.value = false }
  // #endif
}
async function prepare(owner) {
  const parentTicket = ticket
  try {
    const result = await mfaRequest('wechat/create', { mfaTicket: parentTicket })
    if (!current(owner)) {
      void mfaRequest('wechat/cancel', { mfaTicket: parentTicket, scene: result.data.scene }).catch(() => {})
      return
    }
    request.value = result.data
    if (direct) void inspect()
    else void loadQr()
    void poll(owner)
  } catch (cause) { if (current(owner)) error.value = cause.message }
  finally { if (current(owner)) preparing.value = false }
}
function open(parentTicket) {
  finish(null)
  visible.value = true; ticket = parentTicket; error.value = ''; qr.value = ''; identityReady.value = false; loadingQr.value = false; preparing.value = true; foreground = true
  page = getCurrentPages().slice(-1)[0]
  const promise = new Promise(resolve => { resolver = resolve })
  void prepare(revision)
  return promise
}
onHide(() => {
  if (!visible.value) return
  if (getCurrentPages().slice(-1)[0] !== page) finish(null)
  else { foreground = false; clearTimeout(timer) }
})
onShow(() => { foreground = true; if (visible.value && request.value) { clearTimeout(timer); void poll(revision) } })
onBeforeUnmount(() => finish(null))
defineExpose({ open })
</script>

<style scoped>
.wechat-mfa-overlay { --wx-bg: #fff; --wx-text: #1f2937; --wx-muted: #6b7280; --wx-accent: #059669; --wx-field: #f0fdf8; position: fixed; inset: 0; z-index: 20030; padding: 32rpx; display: flex; align-items: center; justify-content: center; background: rgba(9, 24, 32, .65); }
.is-dark { --wx-bg: #202b43; --wx-text: #eef2ff; --wx-muted: #b0bdd2; --wx-accent: #8ab0ff; --wx-field: #162137; }
.wechat-mfa-dialog { width: 100%; max-width: 620rpx; max-height: 85vh; overflow-y: auto; padding: 32rpx; box-sizing: border-box; border-radius: 24rpx; background: var(--wx-bg); color: var(--wx-text); }
.wechat-mfa-title { display: block; font-size: 34rpx; font-weight: 700; text-align: center; }
.wechat-mfa-copy { display: block; margin: 18rpx 0; font-size: 24rpx; line-height: 1.6; color: var(--wx-muted); text-align: center; }
.wechat-mfa-account { display: block; font-size: 28rpx; margin-top: 24rpx; text-align: center; overflow-wrap: anywhere; }
.wechat-mfa-detail { display: block; margin: 7rpx 0; font-size: 23rpx; line-height: 1.5; text-align: center; color: var(--wx-muted); }
.wechat-mfa-qr { display: block; width: 330rpx; height: 330rpx; margin: 20rpx auto; border-radius: 16rpx; background: #fff; }
.wechat-mfa-primary { margin-top: 24rpx; color: #fff; background: var(--wx-accent); border-radius: 14rpx; font-size: 28rpx; }
.is-dark .wechat-mfa-primary { color: #10213e; }
.wechat-mfa-secondary { margin-top: 16rpx; color: var(--wx-accent); background: transparent; font-size: 25rpx; }
.wechat-mfa-primary::after, .wechat-mfa-secondary::after { border: 0; }
.wechat-mfa-error { display: block; margin-top: 16rpx; color: #ef6464; font-size: 24rpx; line-height: 1.6; }
</style>
