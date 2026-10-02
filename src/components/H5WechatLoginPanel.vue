<template>
  <view class="wechat-login-panel" :class="{ 'panel-dark': dark }">
    <view class="panel-heading">
      <view class="heading-icon"><ManifestIcon id="wechat" :scale="2.7" /></view>
      <view><text class="panel-title">{{ status === 'manual' ? '微信扫码注册' : '微信扫码登录 / 注册' }}</text><text class="panel-description">{{ status === 'manual' ? '在小程序完成注册后，使用账号密码登录网页。' : '已有账号扫码登录；新用户可在小程序注册，确认后自动登录网页。' }}</text></view>
    </view>
    <view class="qr-halo">
      <view class="qr-leaf leaf-left"></view><view class="qr-leaf leaf-right"></view>
      <view class="qr-disc" :aria-busy="qrState === 'loading'">
        <image v-if="qrSource" class="qr-image" :class="{ ready: qrState === 'ready' }" :src="qrSource" mode="aspectFit" @load="qrState = 'ready'" @error="qrState = 'error'" />
        <view v-if="qrState !== 'ready' || terminal" class="qr-placeholder" role="status">
          <view v-if="qrState === 'loading' && !terminal" class="qr-spinner"></view>
          <ManifestIcon v-else id="camera_scan" :scale="2.6" />
          <text>{{ terminal ? '请刷新二维码' : qrState === 'error' ? '二维码暂时不可用' : '正在加载小程序码…' }}</text>
        </view>
      </view>
    </view>
    <view class="scan-steps">
      <view v-for="(step, index) in steps" :key="step.icon" class="scan-step">
        <ManifestIcon :id="step.icon" :scale="2.3" /><text class="step-number">{{ index + 1 }}</text>
        <text class="step-title">{{ status === 'manual' && index === 3 ? '账号密码登录' : step.title }}</text><text class="step-description">{{ status === 'manual' && index === 3 ? '返回网页使用账号密码登录' : step.description }}</text>
      </view>
    </view>
    <view class="scan-status" role="status" aria-live="polite">
      <view class="status-icon"><ManifestIcon id="camera_scan" :scale="2.1" /></view>
      <view><text class="status-title">{{ message }}</text><text class="status-detail">{{ status === 'manual' ? '本页保留账号密码登录，注册完成后即可使用。' : `请在小程序确认网页登录${reference ? `，核对确认码 ${reference}` : '。'}` }}</text></view>
    </view>
    <text class="version-hint">若小程序未出现网页登录确认，完成注册后可用账号密码登录。</text>
    <button class="qr-refresh" :disabled="status === 'loading' || status === 'consuming' || disabled" @click="refresh">↻　刷新二维码</button>
  </view>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { registrationApi } from '@/utils/registration-relay.js'
import { createH5RegistrationRelay } from '@/utils/registration-relay.mjs'

const props = defineProps({ dark: Boolean, disabled: Boolean })
const emit = defineEmits(['login', 'busy'])
const qrSource = ref(''), qrState = ref('loading'), status = ref('loading'), message = ref('正在创建专属二维码…'), reference = ref('')
const terminal = computed(() => ['expired', 'consumed', 'uncertain', 'cancelled'].includes(status.value))
const messages = { loading: '正在创建专属二维码…', waiting: '等待微信扫码…', scanned: '已扫码，请在小程序中继续',
  authorized: '已确认，正在登录…', consuming: '正在登录…', complete: '登录成功，正在进入首页…',
  expired: '已过期，请刷新二维码', consumed: '登录结果已领取，请重新扫码', cancelled: '本次扫码已取消' }
const steps = [
  { icon: 'wechat', title: '微信扫码', description: '使用微信扫描上方小程序码' },
  { icon: 'mp-weixin', title: '进入小程序', description: '打开“分投侠”微信小程序' },
  { icon: 'user_profile', title: '登录或注册', description: '完成账号登录或新用户注册' },
  { icon: 'dark_success', title: '自动登录网页', description: '确认后网页将自动进入首页' }
]
let stopped = false
let fallbackAttempt = 0
const relay = createH5RegistrationRelay({ api: registrationApi,
  onUnsupported() { reference.value = ''; qrSource.value = `${registrationApi.fixedQrUrl()}?v=${++fallbackAttempt}`; qrState.value = 'loading' },
  onState(state) {
    status.value = state.status
    message.value = state.message || messages[state.status] || '扫码服务暂不可用，请刷新重试'
    reference.value = state.session?.sessionId?.slice(-6) || ''
    emit('busy', state.status === 'consuming')
    if (state.status === 'loading') { qrSource.value = ''; qrState.value = 'loading' }
    if (state.session && !terminal.value) {
      const source = registrationApi.qrUrl(state.session)
      if (source !== qrSource.value) { qrSource.value = source; qrState.value = 'loading' }
    }
    if (terminal.value || (state.status === 'error' && !state.session)) { qrSource.value = ''; qrState.value = 'error' }
  },
  onLogin(result) { emit('login', result) }
})
function resume() { if (!stopped && !props.disabled && !document.hidden) relay.resume() }
function pause() { relay.pause() }
function stop() { if (stopped) return; stopped = true; relay.stop(); emit('busy', false) }
function refresh() { if (!props.disabled) void relay.refresh() }
function visibilityChanged() { if (document.hidden) pause(); else resume() }
watch(() => props.disabled, disabled => { if (disabled) pause(); else resume() }, { flush: 'sync' })
onShow(resume)
onHide(pause)
onUnload(stop)
onMounted(() => { document.addEventListener('visibilitychange', visibilityChanged); resume() })
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', visibilityChanged); stop() })
defineExpose({ pause, resume })
</script>

<style scoped>
.wechat-login-panel { --ink: #172039; --muted: #8793a8; --green: #00a77c; color: var(--ink); width: 100%; }
.panel-dark { --ink: #edf6f4; --muted: #a4b7bc; --green: #65dfba; }
.panel-heading { display: flex; gap: 15px; align-items: flex-start; }.heading-icon { flex: 0 0 52px; height: 52px; display: grid; place-items: center; border-radius: 50%; background: #e5fbf1; }.panel-title { display: block; font-size: 23px; font-weight: 700; line-height: 1.45; }.panel-description { display: block; margin-top: 5px; color: var(--muted); font-size: 13px; line-height: 1.65; }
.qr-halo { position: relative; width: 250px; height: 250px; display: grid; place-items: center; border-radius: 50%; margin: 17px auto 12px; background: radial-gradient(circle, transparent 57%, #def9ee80 58%, #ebfbf480 70%, transparent 71%); }.qr-disc { position: relative; width: 82%; height: 82%; border-radius: 50%; background: #fff; overflow: hidden; }.qr-image { width: 100%; height: 100%; opacity: 0; transition: opacity 200ms; }.qr-image.ready { opacity: 1; }.qr-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 13px; background: #ffffffed; color: #668b80; font-size: 12px; text-align: center; }.qr-spinner { width: 24px; height: 24px; border: 3px solid #ddf6eb; border-top-color: #00ae80; border-radius: 50%; animation: qr-spin 900ms linear infinite; }
.qr-leaf { position: absolute; width: 29px; height: 15px; border-radius: 2px 90% 2px 90%; background: linear-gradient(130deg, #d0ec8c, #7acc80); }.leaf-left { left: 2px; top: 29px; transform: rotate(24deg); }.leaf-right { right: 0; bottom: 40px; transform: rotate(-55deg); }
.scan-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 4px 0 20px; }.scan-step { position: relative; display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center; }.scan-step:not(:last-child)::after { content: ''; position: absolute; left: 76%; top: 20px; width: 60%; border-top: 1px dashed #d5e9e2; }.step-number { width: 21px; height: 21px; display: grid; place-items: center; border-radius: 50%; background: #04b583; color: #fff; font-size: 13px; }.step-title { font-size: 13px; font-weight: 600; }.step-description { color: var(--muted); font-size: 11px; line-height: 1.55; }
.scan-status { display: flex; align-items: center; gap: 14px; min-height: 68px; padding: 8px 15px; border-radius: 21px; background: #e6faf3; box-sizing: border-box; }.status-icon { flex: 0 0 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: #fff9; }.status-title { display: block; color: var(--green); font-size: 15px; font-weight: 600; line-height: 1.4; }.status-detail { display: block; color: var(--muted); font-size: 12px; margin-top: 4px; line-height: 1.5; }
.qr-refresh { display: block; width: 100%; margin-top: 10px; border: 1px solid #55cbb0; border-radius: 999px; color: var(--green); background: transparent; min-height: 39px; line-height: 39px; font-size: 15px; }.qr-refresh::after { border: 0; }.qr-refresh[disabled] { opacity: .5; background: transparent; color: var(--muted); }
.version-hint { display: block; margin: 9px 2px 0; font-size: 11px; line-height: 1.5; color: var(--muted); }
.panel-dark .heading-icon { background: #214d40; }.panel-dark .scan-status { background: #193d34; }.panel-dark .status-icon { background: #31594e; }.panel-dark .scan-step::after { border-color: #3a6358; }
@keyframes qr-spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .panel-heading { display: none; }.qr-halo { width: 225px; height: 225px; margin-top: 5px; }.scan-steps { gap: 8px; }.step-title { font-size: 12px; }.step-description { font-size: 10px; }.scan-status { padding: 10px; gap: 10px; }.status-title { font-size: 13px; }.status-detail { font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .qr-spinner { animation: none; }.qr-image { transition: none; } }
</style>
