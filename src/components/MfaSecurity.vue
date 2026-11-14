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
    </view>
    <view v-if="stage" class="security-overlay" @touchmove.stop.prevent>
      <view class="security-dialog">
        <text class="dialog-title">{{ titles[stage] }}</text>
        <template v-if="stage === 'password'">
          <text class="dialog-copy">先确认当前账号密码，再绑定验证器。</text>
          <input v-model="password" class="security-input" password maxlength="128" placeholder="当前账号密码" :disabled="busy" @confirm="start" />
          <button class="primary-button" :loading="busy" :disabled="busy || !password" @click="start">下一步</button>
        </template>
        <template v-else-if="stage === 'setup'">
          <text class="dialog-copy">在验证器中添加账号，选择“输入设置密钥”，粘贴下方密钥。类型选择“基于时间”。</text>
          <text class="secret-value" selectable>{{ setup.secret }}</text>
          <button class="text-button" @click="copy(setup.secret)">复制设置密钥</button>
          <input v-model="code" class="security-input" type="number" maxlength="6" placeholder="验证器中的6位动态码" :disabled="busy" @confirm="enable" />
          <button class="primary-button" :loading="busy" :disabled="busy || code.length !== 6" @click="enable">验证并开启</button>
        </template>
        <template v-else-if="stage === 'saved'">
          <text class="dialog-copy">恢复码仅本次展示，每个只能使用一次。请存放在安全的地方，认证方式不可用时可用于登录。</text>
          <scroll-view scroll-y class="recovery-list"><text v-for="item in recoveryCodes" :key="item" class="recovery-code" selectable>{{ item }}</text></scroll-view>
          <button class="text-button" @click="copy(recoveryCodes.join('\n'))">复制恢复码</button>
          <label class="saved-confirm" @click="saved = !saved"><checkbox :checked="saved" :color="dark ? '#5B8DEE' : '#059669'" /><text>我已妥善保存恢复码</text></label>
          <button class="primary-button" :disabled="!saved" @click="close">完成</button>
        </template>
        <template v-else>
          <text class="dialog-copy">{{ stage === 'disable' ? status.adminAccount ? '关闭后，本账号将失去管理员权限。' : '关闭后，登录将不再要求双因素验证。' : stage === 'recovery' ? '更新后，旧恢复码将全部失效。' : '输入新的动态码或一个未使用的恢复码。' }}</text>
          <input v-if="stage !== 'verify'" v-model="password" class="security-input" password maxlength="128" placeholder="当前账号密码" :disabled="busy" />
          <text v-if="status.recoverySession && stage !== 'verify'" class="dialog-copy">刚使用恢复码验证，本次只需确认账号密码。</text>
          <input v-else v-model="code" class="security-input" maxlength="40" placeholder="新的动态码或恢复码" :disabled="busy" @confirm="confirmAction" />
          <button class="primary-button" :loading="busy" :disabled="busy || (!code.trim() && !(status.recoverySession && stage !== 'verify')) || (stage !== 'verify' && !password)" @click="confirmAction">{{ stage === 'disable' ? '确认关闭' : '确认验证' }}</button>
        </template>
        <text v-if="error" class="security-error" role="alert">{{ error }}</text>
        <button v-if="stage !== 'saved'" class="cancel-button" :disabled="busy" @click="close">取消</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { mfaRequest, saveMfaSession } from '@/api/mfa'
defineProps({ dark: Boolean })
const emit = defineEmits(['changed'])
const status = ref(null), loadError = ref(false), busy = ref(false), stage = ref(''), switchVersion = ref(0)
const password = ref(''), code = ref(''), error = ref(''), setup = ref({}), recoveryCodes = ref([]), saved = ref(false)
const titles = { password: '开启双因素验证', setup: '绑定验证器', saved: '保存恢复码', disable: '关闭双因素验证', verify: '验证身份', recovery: '更新恢复码' }
let alive = true, requestGeneration = 0, actionToken = ''
const current = token => alive && token && token === uni.getStorageSync('token')
async function reload() {
  const revision = ++requestGeneration, token = uni.getStorageSync('token')
  try {
    const result = await mfaRequest('settings', {}, token, 'GET')
    if (current(token) && revision === requestGeneration) { status.value = result.data; loadError.value = false }
  } catch (_) { if (alive && revision === requestGeneration) loadError.value = true }
}
function show(next) { actionToken = uni.getStorageSync('token'); stage.value = next; password.value = ''; code.value = ''; error.value = '' }
function toggle(event) { switchVersion.value++; if (status.value && !busy.value) show(event.detail.value ? 'password' : 'disable') }
function close() { if (busy.value) return; stage.value = ''; password.value = ''; code.value = ''; setup.value = {}; recoveryCodes.value = []; saved.value = false; switchVersion.value++ }
function copy(value) { uni.setClipboardData({ data: value, showToast: false, success: () => uni.showToast({ title: '已复制', icon: 'none' }) }) }
async function start() {
  if (busy.value || !current(actionToken)) return
  busy.value = true; error.value = ''
  try {
    const result = await mfaRequest('setup', { password: password.value }, actionToken)
    if (current(actionToken)) { setup.value = result.data; password.value = ''; stage.value = 'setup' }
  } catch (cause) { if (current(actionToken)) error.value = cause.message }
  finally { busy.value = false }
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
    const result = await mfaRequest('enable', { setupTicket: setup.value.setupTicket, code: code.value }, token)
    if (await accept(result, token)) { recoveryCodes.value = result.recoveryCodes; setup.value = {}; code.value = ''; stage.value = 'saved' }
  } catch (cause) { if (current(token)) error.value = cause.message }
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
onMounted(reload)
onBeforeUnmount(() => { alive = false; password.value = ''; setup.value = {}; recoveryCodes.value = [] })
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
.is-dark .primary-button { color: #10213e; }
.cancel-button { margin-top: 12rpx; color: var(--mfa-muted); background: transparent; font-size: 26rpx; }
.text-button::after, .primary-button::after, .cancel-button::after { border: 0; }
.secret-value { display: block; padding: 20rpx; border-radius: 14rpx; background: var(--mfa-field); color: var(--mfa-accent); font-family: monospace; font-size: 28rpx; overflow-wrap: anywhere; word-break: break-all; }
.recovery-list { height: 340rpx; padding: 16rpx 0; border-radius: 14rpx; background: var(--mfa-field); }
.recovery-code { display: block; padding: 7rpx 16rpx; font-family: monospace; font-size: 23rpx; text-align: center; }
.saved-confirm { display: flex; align-items: center; margin-top: 20rpx; font-size: 24rpx; }
.security-error { display: block; margin-top: 16rpx; color: #ef6464; font-size: 24rpx; line-height: 1.6; }
</style>
