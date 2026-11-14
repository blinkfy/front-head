<template>
  <view v-if="pending" class="mfa-overlay" :class="{ 'mfa-dark': dark }" @touchmove.stop.prevent>
    <view class="mfa-dialog">
      <view class="mfa-emblem">✓</view>
      <text class="mfa-title">双因素验证</text>
      <text class="mfa-description">{{ pending.accountName ? `正在登录 ${pending.accountName}` : '再验证一步，保护您的账号' }}</text>
      <text v-if="pending.mfaAuthorizeQuick" class="mfa-description">系统认证已完成；此凭据首次用于双因素登录，请再验证一次</text>
      <text class="mfa-label">{{ recovery ? '一次性恢复码' : '验证器中的6位动态码' }}</text>
      <input v-model="code" class="mfa-input" :type="recovery ? 'text' : 'number'" :maxlength="recovery ? 40 : 6"
        :placeholder="recovery ? '输入已保存的恢复码' : '000000'" :disabled="busy" @confirm="verify" />
      <text v-if="error" class="mfa-error" role="alert">{{ error }}</text>
      <button class="mfa-primary" :loading="busy" :disabled="busy || !code.trim()" @click="verify">验证并登录</button>
      <button v-if="pending.mfaHasTotp !== false" class="mfa-link" :disabled="busy" @click="recovery = !recovery; code = ''; error = ''">{{ recovery ? '使用验证器动态码' : '使用恢复码' }}</button>
      <!-- #ifdef APP-PLUS || H5 || MP-WEIXIN -->
      <button v-if="canQuick" class="mfa-link" :disabled="busy" @click="verifyQuick">{{ quickLabel }}</button>
      <!-- #endif -->
      <button v-if="pending.mfaWechatAvailable" class="mfa-link" :disabled="busy" @click="verifyWechat">使用微信验证</button>
      <button class="mfa-cancel" :disabled="busy" @click="finish(null)">返回登录</button>
    </view>
  </view>
  <WechatMfaApproval ref="wechatApproval" :dark="dark" />
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { onHide } from '@dcloudio/uni-app'
import { mfaRequest } from '@/api/mfa'
import WechatMfaApproval from './WechatMfaApproval.vue'
// #ifdef APP-PLUS || H5 || MP-WEIXIN
import { quickLogin, quickLoginForMfa, quickLoginApi, quickLoginPlatform } from '@/utils/quick-login.js'
import { biometricErrorMessage } from '@/utils/biometric-login-core.mjs'
// #endif
const props = defineProps({ dark: Boolean, promptOwner: Object })
const pending = ref(null), code = ref(''), error = ref(''), recovery = ref(false), busy = ref(false)
const canQuick = ref(false), quickLabel = ref('使用系统认证')
const wechatApproval = ref(null)
let resolvePending, page, generation = 0
const current = revision => revision === generation && pending.value && getCurrentPages().slice(-1)[0] === page
function finish(result) {
  const previous = pending.value
  generation++
  pending.value = null
  busy.value = false
  if (previous?.mfaTicket) void mfaRequest('cancel', { mfaTicket: previous.mfaTicket }).catch(() => {})
  const resolve = resolvePending; resolvePending = null; resolve?.(result)
}
async function verify() {
  if (busy.value || !pending.value || !code.value.trim()) return
  const revision = generation
  busy.value = true; error.value = ''
  try {
    const result = await mfaRequest('verify', { mfaTicket: pending.value.mfaTicket, code: code.value.trim() })
    if (current(revision)) finish(result)
  } catch (cause) { if (current(revision)) error.value = cause.message }
  finally { if (current(revision)) busy.value = false }
}
async function verifyWechat() {
  if (busy.value || !pending.value?.mfaWechatAvailable) return
  const revision = generation, accountId = pending.value.accountId
  busy.value = true; error.value = ''
  try {
    const result = await wechatApproval.value.open(pending.value.mfaTicket)
    if (!current(revision) || !result) return
    if (result.token && result.mfaVerified === true && String(result.accountId) === String(accountId)) finish(result)
    else error.value = '确认未完成，请使用其他验证方式'
  } catch (cause) { if (current(revision)) error.value = cause.message }
  finally { if (current(revision)) busy.value = false }
}
// #ifdef APP-PLUS || H5 || MP-WEIXIN
async function verifyQuick() {
  if (busy.value || !pending.value) return
  const revision = generation
  busy.value = true; error.value = ''
  try {
    const result = await quickLoginForMfa(pending.value.mfaTicket, () => Boolean(current(revision)), props.promptOwner, pending.value.accountId)
    if (!current(revision)) return
    if (result?.token && String(result.accountId) === String(pending.value.accountId) && result.mfaVerified === true) finish(result)
    else {
      if (result?.mfaTicket) void mfaRequest('cancel', { mfaTicket: result.mfaTicket }).catch(() => {})
      error.value = '此认证暂不能验证当前账号，请使用动态码或恢复码'
    }
  } catch (cause) { if (current(revision)) error.value = biometricErrorMessage(cause) || '认证未完成，可使用动态码或恢复码' }
  finally { if (current(revision)) busy.value = false }
}
// #endif
function open(result) {
  if (!result?.requiresMfa) return Promise.resolve(result)
  finish(null)
  pending.value = result; code.value = ''; error.value = ''; recovery.value = result.mfaHasTotp === false; canQuick.value = false
  page = getCurrentPages().slice(-1)[0]
  const revision = generation
  // #ifdef APP-PLUS || H5 || MP-WEIXIN
  void quickLogin.capability().then(async support => {
    if (!current(revision)) return
    const state = quickLogin.state(result.accountId)
    canQuick.value = false
    quickLabel.value = support.label ? `使用${support.label.replace(/登录$/, '')}` : '使用系统认证'
    // #ifndef H5
    if (state.enabled && String(state.userId) === String(result.accountId) && state.credentialId && support.supported && support.enrolled) {
      const availability = await mfaRequest('quick/availability', { mfaTicket: result.mfaTicket,
        platform: quickLoginPlatform === 'app' ? 'biometric' : 'soter', credentialId: state.credentialId })
      if (current(revision)) canQuick.value = availability.data?.available === true
    }
    // #endif
    // #ifdef H5
    canQuick.value = false
    quickLabel.value = '使用通行密钥'
    if (window.isSecureContext && window.PublicKeyCredential && window.navigator?.credentials) {
      const availability = await quickLoginApi('/quick-login/passkey/mfa/availability', { mfaTicket: result.mfaTicket })
      if (current(revision)) canQuick.value = availability.data?.available === true
    }
    // #endif
  }).catch(() => {})
  // #endif
  return new Promise(resolve => { resolvePending = resolve })
}
onHide(() => { if (pending.value && getCurrentPages().slice(-1)[0] !== page) finish(null) })
onBeforeUnmount(() => finish(null))
defineExpose({ open })
</script>

<style scoped>
.mfa-overlay { --mfa-bg: #fff; --mfa-text: #1f2937; --mfa-muted: #6b7280; --mfa-accent: #059669; --mfa-field: #f0fdf8; position: fixed; z-index: 20000; inset: 0; display: flex; align-items: center; justify-content: center; padding: 32rpx; background: rgba(9, 24, 32, .65); }
.mfa-dark { --mfa-bg: #202b43; --mfa-text: #eef2ff; --mfa-muted: #b0bdd2; --mfa-accent: #8ab0ff; --mfa-field: #162137; }
.mfa-dialog { width: 100%; max-width: 620rpx; max-height: 80vh; overflow-y: auto; box-sizing: border-box; padding: 40rpx 32rpx 24rpx; border-radius: 28rpx; background: var(--mfa-bg); color: var(--mfa-text); box-shadow: 0 24rpx 80rpx rgba(0, 0, 0, .18); }
.mfa-emblem { margin: 0 auto 20rpx; width: 72rpx; height: 72rpx; line-height: 72rpx; border-radius: 24rpx; text-align: center; background: var(--mfa-field); color: var(--mfa-accent); font-size: 40rpx; }
.mfa-title { display: block; font-size: 36rpx; font-weight: 700; text-align: center; }
.mfa-description { display: block; color: var(--mfa-muted); font-size: 25rpx; text-align: center; margin: 12rpx 0 32rpx; }
.mfa-label { display: block; font-size: 25rpx; margin-bottom: 12rpx; }
.mfa-input { height: 88rpx; padding: 0 22rpx; background: var(--mfa-field); border: 1rpx solid var(--mfa-accent); border-radius: 14rpx; font-size: 30rpx; color: var(--mfa-text); }
.mfa-error { display: block; color: #ef6464; font-size: 24rpx; margin-top: 16rpx; }
.mfa-primary { background: var(--mfa-accent); color: #fff; border-radius: 14rpx; font-size: 28rpx; margin-top: 24rpx; }
.mfa-dark .mfa-primary { color: #10213e; }
.mfa-link, .mfa-cancel { font-size: 25rpx; line-height: 2.8; margin-top: 8rpx; background: transparent; color: var(--mfa-accent); }
.mfa-cancel { color: var(--mfa-muted); }
.mfa-primary::after, .mfa-link::after, .mfa-cancel::after { border: 0; }
</style>
