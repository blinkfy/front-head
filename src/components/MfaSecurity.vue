<template>
  <view class="mfa-section" :class="{ 'is-dark': dark }">
    <view class="security-row">
      <view class="security-info">
        <text class="security-title">双因素验证</text>
        <text class="security-desc">{{ status ? status.available === false ? '安全服务暂未配置，请联系管理员' : status.enabled ? '已开启，登录时验证身份' : status.adminAccount ? '开启并验证后可使用管理功能' : '为账号增加一层保护' : '正在获取安全设置…' }}</text>
      </view>
      <button v-if="loadError" class="text-button" @click="reload">重试</button>
      <switch v-else :key="switchVersion" class="security-switch" :checked="status?.enabled === true" :disabled="busy || !status || status.available === false"
        :color="dark ? '#5B8DEE' : '#059669'" aria-label="双因素验证" @change="toggle" />
    </view>
    <view v-if="status?.enabled" class="security-actions">
      <text class="security-desc">剩余 {{ status.recoveryRemaining }} 个恢复码</text>
      <button class="text-button" :disabled="busy" @click="show('verify')">重新验证</button>
      <button class="text-button" :disabled="busy" @click="show('recovery')">更新恢复码</button>
      <button v-if="status.totpEnabled === false" class="text-button" :disabled="busy" @click="show('totp-password')">添加验证器</button>
      <button v-if="status.wechatAvailable" class="text-button" :disabled="busy" @click="show(status.wechatEnabled ? 'wechat-remove' : 'wechat-add')">{{ status.wechatEnabled ? '关闭微信验证' : '开启微信验证' }}</button>
    </view>
    <view v-if="stage" class="security-overlay" @touchmove.stop.prevent>
      <view class="security-dialog">
        <text class="dialog-title">{{ titles[stage] }}</text>
        <template v-if="stage === 'password' || stage === 'totp-password' || stage === 'wechat-add' || stage === 'wechat-remove'">
          <text class="dialog-copy">{{ stage === 'wechat-remove' ? '确认账号密码；请先用系统认证、动态码或恢复码重新验证。' : stage === 'wechat-add' ? '确认账号密码，再使用微信验证。' : bindingTotp ? '确认当前账号密码，添加动态码验证器。' : '输入当前账号密码，选择一种验证方式即可。' }}</text>
          <input v-model="password" class="security-input" password maxlength="128" placeholder="当前账号密码" :disabled="busy" />
          <template v-if="stage === 'wechat-add' || stage === 'wechat-remove'">
            <button class="primary-button" :loading="busy" :disabled="busy || !password" @click="stage === 'wechat-add' ? start('wechat-add') : removeWechat()">{{ stage === 'wechat-add' ? '继续微信确认' : '确认关闭' }}</button>
            <button v-if="quickBound" class="text-button quick-action" :disabled="busy || !password" @click="verifyWithQuick">使用{{ quickName }}验证并继续</button>
          </template>
          <template v-else-if="bindingTotp">
            <button class="primary-button" :loading="busy" :disabled="busy || !password" @click="start('totp-add')">下一步</button>
            <button v-if="quickBound" class="text-button quick-action" :disabled="busy || !password" @click="verifyWithQuick">使用{{ quickName }}验证并继续</button>
          </template>
          <template v-else>
            <text v-if="quickLoading" class="dialog-copy">正在检查系统认证…</text>
            <button v-if="quickSupport.supported && quickSupport.enrolled" class="primary-button" :loading="busy" :disabled="busy || !password || !user?.id" @click="start('quick')">使用{{ quickName }}</button>
            <button class="secondary-button" :loading="busy" :disabled="busy || !password" @click="start('totp')">使用动态码验证器</button>
            <button v-if="status.wechatAvailable" class="secondary-button" :loading="busy" :disabled="busy || !password" @click="start('wechat')">使用微信验证</button>
          </template>
        </template>
        <template v-else-if="stage === 'setup'">
          <text class="dialog-copy">在验证器中添加账号，选择“输入设置密钥”，粘贴下方密钥。类型选择“基于时间”。</text>
          <text class="secret-value" selectable>{{ setup.secret }}</text>
          <button class="text-button" @click="copy(setup.secret)">{{ copied === 'setup' ? '✓ 已复制' : '复制设置密钥' }}</button>
          <input v-model="code" class="security-input" type="number" maxlength="6" placeholder="验证器中的6位动态码" :disabled="busy" @confirm="enable" />
          <button class="primary-button" :loading="busy" :disabled="busy || code.length !== 6" @click="enable">{{ bindingTotp ? '确认绑定' : '验证并开启' }}</button>
        </template>
        <template v-else-if="stage === 'saved'">
          <text class="dialog-copy">恢复码仅本次展示，每个只能使用一次。请存放在安全的地方，认证方式不可用时可用于登录。</text>
          <scroll-view scroll-y class="recovery-list"><text v-for="item in recoveryCodes" :key="item" class="recovery-code" selectable>{{ item }}</text></scroll-view>
          <button class="text-button" @click="copy(recoveryCodes.join('\n'))">{{ copied === 'saved' ? '✓ 已复制' : '复制恢复码' }}</button>
          <label class="saved-confirm" @click="saved = !saved"><checkbox :checked="saved" :color="dark ? '#5B8DEE' : '#059669'" /><text>我已妥善保存恢复码</text></label>
          <button class="primary-button" :disabled="!saved" @click="close">完成</button>
        </template>
        <template v-else>
          <text class="dialog-copy">{{ stage === 'disable' ? status.adminAccount ? '关闭后，本账号将失去管理员权限。' : '关闭后，登录将不再要求双因素验证。' : stage === 'recovery' ? '更新后，旧恢复码将全部失效。' : status.totpEnabled === false ? '使用系统认证或一个未使用的恢复码。' : '使用系统认证、新的动态码或恢复码。' }}</text>
          <input v-if="stage !== 'verify'" v-model="password" class="security-input" password maxlength="128" placeholder="当前账号密码" :disabled="busy" />
          <text v-if="status.alternativeSession && stage !== 'verify'" class="dialog-copy">已完成身份验证，本次只需确认账号密码。</text>
          <input v-else v-model="code" class="security-input" maxlength="40" :placeholder="status.totpEnabled === false ? '未使用的恢复码' : '新的动态码或恢复码'" :disabled="busy" @confirm="confirmAction" />
          <button class="primary-button" :loading="busy" :disabled="busy || (!code.trim() && !(status.alternativeSession && stage !== 'verify')) || (stage !== 'verify' && !password)" @click="confirmAction">{{ stage === 'disable' ? '确认关闭' : '确认验证' }}</button>
          <button v-if="quickBound" class="text-button quick-action" :disabled="busy || (stage !== 'verify' && !password)" @click="verifyWithQuick">使用{{ quickName }}验证</button>
        </template>
        <text v-if="error" class="security-error" role="alert">{{ error }}</text>
        <button v-if="stage !== 'saved'" class="cancel-button" :disabled="busy" @click="close">取消</button>
      </view>
    </view>
  </view>
  <WechatMfaApproval ref="wechatApproval" :dark="dark" />
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { mfaRequest, saveMfaSession } from '@/api/mfa'
import { quickLogin, quickLoginForSetup } from '@/utils/quick-login.js'
import { biometricErrorMessage } from '@/utils/biometric-login-core.mjs'
import { beginMfaTransition } from '@/utils/mfa-session-transition.mjs'
import WechatMfaApproval from './WechatMfaApproval.vue'
const props = defineProps({ dark: Boolean, user: Object, promptOwner: Object })
const emit = defineEmits(['changed'])
const status = ref(null), loadError = ref(false), busy = ref(false), stage = ref(''), switchVersion = ref(0)
const password = ref(''), code = ref(''), error = ref(''), setup = ref({}), recoveryCodes = ref([]), saved = ref(false)
const bindingTotp = ref(false)
const wechatApproval = ref(null)
const copied = ref(''), quickLoading = ref(false), quickSupport = ref({ supported: false, enrolled: false }), quickState = ref({})
const quickName = computed(() => (quickSupport.value.label || '系统认证').replace(/登录$/, ''))
const quickBound = computed(() => quickSupport.value.supported && quickSupport.value.enrolled && quickState.value.enabled &&
  Boolean(quickState.value.credentialId) && String(quickState.value.userId) === String(props.user?.id))
const titles = { 'wechat-add': '开启微信验证', 'wechat-remove': '关闭微信验证', 'totp-password': '添加验证器', password: '开启双因素验证', setup: '绑定验证器', saved: '保存恢复码', disable: '关闭双因素验证', verify: '验证身份', recovery: '更新恢复码' }
let alive = true, requestGeneration = 0, actionToken = '', copyTimer
const current = token => alive && token && token === uni.getStorageSync('token')
async function reload() {
  const revision = ++requestGeneration, token = uni.getStorageSync('token')
  try {
    const result = await mfaRequest('settings', {}, token, 'GET')
    if (current(token) && revision === requestGeneration) { status.value = result.data; loadError.value = false }
  } catch (_) { if (alive && revision === requestGeneration) loadError.value = true }
}
function show(next) {
  actionToken = uni.getStorageSync('token'); bindingTotp.value = next === 'totp-password'; stage.value = next; password.value = ''; code.value = ''; error.value = ''
  quickLoading.value = true
  void quickLogin.capability().then(support => { if (alive) { quickSupport.value = support; quickState.value = quickLogin.state(props.user?.id) } }).catch(() => {}).finally(() => { if (alive) quickLoading.value = false })
}
function toggle(event) { switchVersion.value++; if (status.value && !busy.value) show(event.detail.value ? 'password' : 'disable') }
function close() { if (busy.value) return; bindingTotp.value = false; stage.value = ''; password.value = ''; code.value = ''; setup.value = {}; recoveryCodes.value = []; saved.value = false; switchVersion.value++ }
function clearCopyFeedback() { clearTimeout(copyTimer); copied.value = '' }
watch(stage, clearCopyFeedback)
function copy(value) {
  const copyStage = stage.value
  uni.setClipboardData({ data: value, showToast: false, success: () => {
    if (!alive || stage.value !== copyStage) return
    clearCopyFeedback()
    copied.value = copyStage
    copyTimer = setTimeout(clearCopyFeedback, 2000)
  } })
}
async function start(method = 'totp') {
  if (busy.value || !current(actionToken)) return
  busy.value = true; error.value = ''
  let finishTransition = () => {}
  try {
    const token = actionToken
    const result = await mfaRequest(method === 'wechat-add' ? 'wechat/binding' : method === 'totp-add' ? 'totp/setup' : 'setup', { password: password.value, method }, token)
    if (!current(token)) return
    if (method === 'wechat' || method === 'wechat-add') {
      finishTransition = beginMfaTransition(token)
      const enabled = await wechatApproval.value.open(result.data.setupTicket)
      if (!current(token) || !enabled) return
      if (!enabled.mfaEnabled || !enabled.mfaVerified || String(enabled.accountId) !== String(props.user?.id)) throw new Error('微信确认未完成，请重新尝试')
      if (await accept(enabled, token)) {
        password.value = ''
        if (enabled.recoveryCodes) { recoveryCodes.value = enabled.recoveryCodes; saved.value = false; stage.value = 'saved' }
        else { stage.value = ''; uni.showToast({ title: '微信确认已开启', icon: 'none' }) }
      }
    } else if (method === 'quick') {
      if (!saveMfaSession(result.data, token)) return
      actionToken = result.data.token
      finishTransition = beginMfaTransition(actionToken)
      const setupToken = actionToken
      const isActive = () => current(setupToken) && stage.value === 'password'
      const enabled = await quickLoginForSetup(result.data.setupTicket, setupToken, props.user, isActive, props.promptOwner)
      if (!isActive()) return
      if (!enabled?.mfaEnabled || !enabled.mfaVerified || String(enabled.accountId) !== String(props.user?.id)) throw new Error('认证未完成，请重新尝试或使用动态码验证器')
      if (await accept(enabled, setupToken)) { recoveryCodes.value = enabled.recoveryCodes; password.value = ''; saved.value = false; stage.value = 'saved' }
    } else { bindingTotp.value = method === 'totp-add'; setup.value = result.data; password.value = ''; stage.value = 'setup' }
  } catch (cause) { if (current(actionToken)) error.value = biometricErrorMessage(cause) || '认证已取消，可重新选择验证方式' }
  finally { busy.value = false; quickState.value = quickLogin.state(props.user?.id); setTimeout(finishTransition, 0) }
}
async function accept(result, token) {
  if (!current(token) || !saveMfaSession(result, token)) return false
  actionToken = result.token
  emit('changed')
  await reload()
  return true
}
async function enable() {
  if (busy.value || !current(actionToken)) return
  const token = actionToken
  busy.value = true; error.value = ''
  try {
    const result = await mfaRequest(bindingTotp.value ? 'totp/enable' : 'enable', { setupTicket: setup.value.setupTicket, code: code.value }, token)
    if (await accept(result, token)) {
      setup.value = {}; code.value = ''
      if (bindingTotp.value) { bindingTotp.value = false; stage.value = ''; uni.showToast({ title: '验证器已添加', icon: 'none' }) }
      else { recoveryCodes.value = result.recoveryCodes; stage.value = 'saved' }
    }
  } catch (cause) { if (current(token)) error.value = cause.message }
  finally { busy.value = false }
}
async function verifyWithQuick() {
  if (busy.value || !current(actionToken)) return
  const token = actionToken, action = stage.value
  busy.value = true; error.value = ''
  try {
    const result = await quickLogin.login(() => current(token) && stage.value === action, props.promptOwner, { userId: props.user?.id })
    if (!current(token) || stage.value !== action) return
    if (!result?.token || !result.mfaVerified || String(result.accountId) !== String(props.user?.id)) {
      if (result?.mfaTicket) void mfaRequest('cancel', { mfaTicket: result.mfaTicket }).catch(() => {})
      throw new Error('此凭据尚未获准用于双因素验证，请使用动态码或恢复码')
    }
    if (!await accept(result, token)) return
    if (action === 'verify') { stage.value = ''; uni.showToast({ title: '身份验证成功', icon: 'none' }) }
    else if (action === 'totp-password') { busy.value = false; await start('totp-add') }
    else if (action === 'wechat-add') { busy.value = false; await start('wechat-add') }
    else if (action === 'wechat-remove') { busy.value = false; await removeWechat() }
    else { code.value = ''; busy.value = false; await confirmAction() }
  } catch (cause) { if (current(actionToken)) error.value = biometricErrorMessage(cause) || '认证已取消，可使用其他方式验证' }
  finally { busy.value = false }
}
async function confirmAction() {
  if (busy.value || !current(actionToken)) return
  const token = actionToken, action = stage.value
  busy.value = true; error.value = ''
  try {
    const result = await mfaRequest(action === 'verify' ? 'reauthenticate' : action === 'recovery' ? 'recovery-codes' : 'disable',
      { password: password.value, code: code.value.trim() }, token)
    if (await accept(result, token)) {
      password.value = ''; code.value = ''
      if (action === 'recovery') { recoveryCodes.value = result.recoveryCodes; saved.value = false; stage.value = 'saved' }
      else { stage.value = ''; uni.showToast({ title: action === 'disable' ? '双因素验证已关闭' : '身份验证成功', icon: 'none' }) }
    }
  } catch (cause) { if (current(token)) error.value = cause.message }
  finally { busy.value = false }
}
async function removeWechat() {
  if (busy.value || !current(actionToken)) return
  const token = actionToken
  busy.value = true; error.value = ''
  try {
    await mfaRequest('wechat/remove', { password: password.value }, token)
    if (!current(token)) return
    await reload(); emit('changed'); stage.value = ''; password.value = ''
    uni.showToast({ title: '微信确认已关闭', icon: 'none' })
  } catch (cause) { if (current(token)) error.value = cause.message }
  finally { busy.value = false }
}
onMounted(reload)
onBeforeUnmount(() => { alive = false; clearCopyFeedback(); password.value = ''; setup.value = {}; recoveryCodes.value = [] })
defineExpose({ reload })
</script>

<style scoped>
.mfa-section { --mfa-accent: #059669; --mfa-text: #1f2937; --mfa-muted: #6b7280; --mfa-line: rgba(5, 150, 105, .09); --mfa-bg: #fff; --mfa-field: #f0fdf8; color: var(--mfa-text); }
.is-dark { --mfa-accent: #8ab0ff; --mfa-text: #e0e0ee; --mfa-muted: #a0a0c0; --mfa-line: rgba(139, 170, 235, .14); --mfa-bg: #202b43; --mfa-field: #162137; }
.security-row { display: flex; align-items: center; padding: 28rpx 24rpx; border-top: 1rpx solid var(--mfa-line); }
.security-info { flex: 1; min-width: 0; }
.security-title { display: block; font-size: 28rpx; line-height: 1.5; font-weight: 500; }
.security-desc { display: block; font-size: 24rpx; color: var(--mfa-muted); line-height: 1.65; margin-top: 8rpx; }
.security-switch { flex-shrink: 0; margin-left: 16rpx; transform: scale(.8); transform-origin: right center; }
.security-actions { display: flex; align-items: center; flex-wrap: wrap; padding: 0 24rpx 20rpx; gap: 16rpx; }
.text-button { color: var(--mfa-accent); background: transparent; margin: 0; padding: 0 8rpx; font-size: 24rpx; line-height: 2.3; }
.security-overlay { position: fixed; inset: 0; z-index: 20000; padding: 32rpx; display: flex; align-items: center; justify-content: center; background: rgba(9, 24, 32, .65); }
.security-dialog { background: var(--mfa-bg); width: 100%; max-width: 660rpx; max-height: 80vh; overflow-y: auto; box-sizing: border-box; padding: 36rpx 30rpx 24rpx; border-radius: 24rpx; box-shadow: 0 24rpx 80rpx rgba(0, 0, 0, .18); }
.dialog-title { display: block; font-size: 34rpx; font-weight: 700; margin-bottom: 20rpx; }
.dialog-copy { display: block; font-size: 25rpx; color: var(--mfa-muted); line-height: 1.7; margin-bottom: 24rpx; }
.security-input { height: 88rpx; margin-top: 18rpx; padding: 0 20rpx; border: 1rpx solid var(--mfa-line); border-radius: 14rpx; color: var(--mfa-text); background: var(--mfa-field); font-size: 28rpx; }
.primary-button { margin-top: 24rpx; border-radius: 14rpx; color: #fff; background: var(--mfa-accent); font-size: 28rpx; }
.secondary-button { margin-top: 18rpx; border: 1rpx solid var(--mfa-accent); border-radius: 14rpx; color: var(--mfa-accent); background: var(--mfa-field); font-size: 28rpx; }
.quick-action { margin-top: 18rpx; }
.is-dark .primary-button { color: #10213e; }
.cancel-button { margin-top: 12rpx; color: var(--mfa-muted); background: transparent; font-size: 26rpx; }
.text-button::after, .primary-button::after, .secondary-button::after, .cancel-button::after { border: 0; }
.secret-value { display: block; padding: 20rpx; border-radius: 14rpx; background: var(--mfa-field); color: var(--mfa-accent); font-family: monospace; font-size: 28rpx; overflow-wrap: anywhere; word-break: break-all; }
.recovery-list { height: 340rpx; padding: 16rpx 0; border-radius: 14rpx; background: var(--mfa-field); }
.recovery-code { display: block; padding: 7rpx 16rpx; font-family: monospace; font-size: 23rpx; text-align: center; }
.saved-confirm { display: flex; align-items: center; margin-top: 20rpx; font-size: 24rpx; }
.security-error { display: block; margin-top: 16rpx; color: #ef6464; font-size: 24rpx; line-height: 1.6; }
</style>
