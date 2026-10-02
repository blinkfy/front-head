<template>
  <view class="wechat-register-guide" :class="{ 'guide-dark': dark }">
    <view class="guide-header">
      <view class="header-orb orb-one" aria-hidden="true"></view>
      <view class="header-orb orb-two" aria-hidden="true"></view>
      <view class="header-orb orb-three" aria-hidden="true"></view>
      <view class="guide-brand">
        <view class="brand-logo"><image mode="aspectFit" class="brand-mascot" src="/static/person.webp.png" alt="分投侠" /></view>
        <text class="brand-welcome">欢迎加入</text>
        <text class="brand-name">分投侠</text>
        <text class="brand-slogan">开启您的环保之旅</text>
      </view>
    </view>

    <view class="guide-scene">
      <view class="panel-orb-layer" aria-hidden="true">
        <view class="panel-orb panel-blue"></view>
        <view class="panel-orb panel-orange"></view>
        <view class="panel-orb panel-green"></view>
      </view>
      <view class="guide-panel" aria-labelledby="registration-guide-title">
      <view class="guide-code-column">
        <view class="code-halo">
          <view class="guide-leaf leaf-one" aria-hidden="true"></view>
          <view class="guide-leaf leaf-two" aria-hidden="true"></view>
          <view class="code-disc" :aria-busy="checking || qrState === 'loading'">
            <image mode="aspectFit" v-if="qrSource" :key="qrSource" class="registration-code" :class="{ 'code-ready': qrState === 'ready' }"
              :src="qrSource" alt="分投侠微信小程序注册入口码" @load="qrState = 'ready'" @error="qrState = 'error'" />
            <view v-if="checking || qrState !== 'ready'" class="code-placeholder" role="status">
              <view v-if="checking || qrState === 'loading'" class="code-spinner" aria-hidden="true"></view>
              <!-- #ifdef H5 -->
              <svg v-else class="code-error-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M4 11V4h7M21 4h7v7M28 21v7h-7M11 28H4v-7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <path d="m12 12 8 8m0-8-8 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              </svg>
              <!-- #endif -->
              <!-- #ifdef APP-PLUS -->
              <ManifestIcon v-else id="help" :scale="2.9" />
              <!-- #endif -->
              <text>{{ checking ? '正在读取注册方式…' : qrState === 'loading' ? '小程序码加载中…' : (sessionMessage || '小程序码暂时不可用') }}</text>
              <button v-if="!checking && qrState === 'error'" class="code-retry" type="button" @click="loadCode">重新加载</button>
            </view>
          </view>
        </view>
        <view class="code-caption">{{ relay && sessionStatus !== 'manual' ? '扫码确认后本页自动登录' : '扫码后将在小程序内完成注册' }}<text v-if="sessionReference"> · 确认码 {{ sessionReference }}</text></view>
      </view>

      <view class="guide-info-column">
        <view class="guide-title" id="registration-guide-title">请先通过微信完成注册 <text class="title-leaf" aria-hidden="true">🌿</text></view>
        <view class="guide-description">{{ clientLabel }}暂不直接创建账号，新用户请先扫码进入“分投侠”小程序完成身份绑定与注册。</view>

        <view class="registration-steps" aria-label="注册流程">
          <view v-for="step in steps" :key="step.number" class="registration-step">
            <view class="step-visual" aria-hidden="true">
              <view class="step-icon" :class="'step-' + step.number">
                <ManifestIcon v-if="step.number <= 2" :id="step.number === 1 ? 'wechat' : 'mp-weixin'" :scale="2.9" />
                <!-- #ifdef H5 -->
              <svg v-else-if="step.number === 3" class="step-icon-svg" viewBox="0 0 48 48">
                  <circle cx="24" cy="15" r="9" fill="#ffb34c" /><path d="M8 41v-6c0-7 7-11 16-11s16 4 16 11v6Z" fill="#ffa033" />
                </svg>
              <!-- #endif -->
              <!-- #ifdef APP-PLUS -->
              <ManifestIcon v-else-if="step.number === 3" id="user_profile" :scale="2.9" />
              <!-- #endif -->
                <!-- #ifdef H5 -->
              <svg v-else class="step-icon-svg" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="19" fill="#00b88a" /><path d="m15 24 6 6 13-13" stroke="white" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              <!-- #endif -->
              <!-- #ifdef APP-PLUS -->
              <ManifestIcon v-else id="dark_success" :scale="2.9" />
              <!-- #endif -->
              </view>
              <text class="step-number">{{ step.number }}</text>
            </view>
            <view class="step-copy">
              <view class="step-title">{{ sessionStatus === 'manual' && step.number === 4 ? '返回网页登录' : step.title }}</view>
              <view class="step-description">{{ sessionStatus === 'manual' && step.number === 4 ? '注册完成后，使用账号密码登录网页' : step.description }}</view>
            </view>
          </view>
        </view>

        <view class="scan-notice" role="status">
          <view class="notice-icon" aria-hidden="true">
            <!-- #ifdef H5 -->
              <svg class="notice-icon-svg" viewBox="0 0 32 32" fill="none"><path d="M4 11V4h7M21 4h7v7M28 21v7h-7M11 28H4v-7M4 16h24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>
              <!-- #endif -->
              <!-- #ifdef APP-PLUS -->
              <ManifestIcon id="camera_scan" :scale="2.3" />
              <!-- #endif -->
          </view>
          <view>
            <text class="scan-headline desktop-scan-copy">请使用微信扫描左侧小程序码</text>
            <text class="scan-headline mobile-scan-copy">请使用微信识别上方小程序码</text>
            <view class="scan-caption">{{ policyError || sessionMessage || (qrState === 'error' ? '小程序码加载失败，请重新加载后扫码。' : `扫码后在小程序内完成注册，再返回${returnLoginLabel}登录。`) }}</view>
            <!-- #ifdef H5 -->
            <view class="scan-caption">若小程序未出现网页登录确认，注册后可点击下方“立即登录”使用账号密码登录。</view>
            <!-- #endif -->
          </view>
        </view>
        <!-- #ifdef H5 -->
        <button v-if="['expired', 'consumed', 'cancelled', 'uncertain', 'error'].includes(sessionStatus) && qrState !== 'error'" class="code-retry" @click="loadCode">刷新二维码</button>
        <!-- #endif -->
        <button class="guide-login" type="button" @click="goLogin">
          <text>已有账号？</text><text class="login-action">立即登录</text><!-- #ifdef H5 -->
              <svg class="guide-login-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
              <!-- #endif -->
              <!-- #ifdef APP-PLUS -->
              <ManifestIcon id="chevron_right" :scale=".9" />
              <!-- #endif -->
        </button>
      </view>
      <view class="guide-footer panel-footer">🌿 加入我们，一起为环保贡献力量</view>
      </view>
    </view>
    <view class="guide-footer desktop-footer">🌿 加入我们，一起为环保贡献力量</view>
  </view>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { baseUrl } from '@/api/settings.js'
import ManifestIcon from '@/components/ManifestIcon.vue'
// #ifdef H5
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { registrationApi } from '@/utils/registration-relay.js'
import { createH5RegistrationRelay, commitRegistrationLogin } from '@/utils/registration-relay.mjs'
// #endif

const props = defineProps({ dark: Boolean, checking: Boolean, policyError: { type: String, default: '' } })
const emit = defineEmits(['login'])
const qrSource = ref('')
const qrState = ref('loading')
const sessionStatus = ref('')
const sessionMessage = ref('')
const sessionReference = ref('')
let attempt = 0
let clientLabel = '网页端'
let returnLoginLabel = '网页'
let sessionCaption = '扫码后在小程序内完成注册，再返回APP登录。'
let relay = null
// #ifdef APP-PLUS
clientLabel = 'APP端'
returnLoginLabel = 'APP'
// #endif
// #ifdef H5
sessionCaption = '扫码后完成小程序注册或登录，并确认登录此网页，本页将自动登录。'
const statusMessages = {
  waiting: '等待微信扫码…',
  scanned: '已扫码，请在小程序中继续',
  authorized: '注册或登录完成，正在登录…',
  consuming: '注册或登录完成，正在登录…', complete: '登录成功，正在进入首页…',
  expired: '已过期，请刷新二维码', consumed: '本次登录凭证已领取，请刷新二维码重新扫码。',
  cancelled: '本次扫码已取消，请刷新二维码。', loading: '正在创建本页专属二维码…'
}
relay = createH5RegistrationRelay({ api: registrationApi,
  onUnsupported() { sessionReference.value = ''; qrSource.value = `${registrationApi.fixedQrUrl()}?v=${++attempt}`; qrState.value = 'loading' },
  onState: state => {
    sessionReference.value = state.session?.sessionId?.slice(-6) || ''
    sessionStatus.value = state.status
    sessionMessage.value = state.message || statusMessages[state.status] || sessionCaption
    if (state.status === 'loading') { qrSource.value = ''; qrState.value = 'loading' }
    if (state.session && !['expired', 'consumed', 'cancelled', 'uncertain'].includes(state.status)) {
      const source = registrationApi.qrUrl(state.session)
      if (qrSource.value !== source) { qrSource.value = source; qrState.value = 'loading' }
    }
    if (['expired', 'consumed', 'cancelled', 'uncertain'].includes(state.status) || (state.status === 'error' && !state.session)) {
      qrSource.value = ''; qrState.value = 'error'
    }
  },
  onLogin: result => {
    commitRegistrationLogin(uni, result)
    uni.showToast({ title: '登录成功', icon: 'success' })
    uni.reLaunch({ url: props.dark ? '/pages-dark/home/home' : '/pages/home/home' })
  }
})
const handleVisibility = () => {
  if (document.hidden) relay.pause()
  else if (!props.checking) relay.resume()
}
onShow(() => { if (!props.checking && !document.hidden) relay.resume() })
onHide(() => relay.pause())
onUnload(() => relay.stop())
onMounted(() => document.addEventListener('visibilitychange', handleVisibility))
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', handleVisibility); relay.stop() })
// #endif
const steps = [
  { number: 1, title: '微信扫码', description: '使用微信扫描上方小程序码' },
  { number: 2, title: '进入小程序', description: '打开“分投侠”微信小程序' },
  { number: 3, title: '绑定微信并设置账号密码', description: '完成身份绑定并设置登录密码' },
  { number: 4, title: `返回${returnLoginLabel}登录`, description: '注册完成后，即可使用账号登录网页版 / APP' }
]
// #ifdef H5
steps[3] = { number: 4, title: '确认网页登录', description: '确认当前账号后，本页自动登录' }
// #endif
function loadCode() {
  if (props.checking) return
  if (relay) { void relay.refresh(); return }
  qrState.value = 'loading'
  qrSource.value = `${baseUrl.replace(/\/$/, '')}/api/registration/wechat-qrcode?v=${++attempt}`
}
function goLogin() { if (relay) relay.stop(); emit('login') }
function beginCode() {
  if (relay) { if (!document.hidden) relay.resume() }
  else loadCode()
}
onMounted(() => { if (!props.checking) beginCode() })
watch(() => props.checking, checking => {
  if (checking) { if (relay) relay.pause() }
  else beginCode()
})
</script>

<style scoped>
.wechat-register-guide { --ink: #172037; --muted: #858da2; --green: #00a779; --surface: #fff; --panel-glass: rgba(255, 255, 255, .62); min-height: 100vh; position: relative; isolation: isolate; overflow: hidden; background: var(--surface); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
.guide-header { height: 238px; position: relative; z-index: 1; background: radial-gradient(circle at 30% 42%, #79ffd027, transparent 28%), radial-gradient(ellipse at 78% 100%, #00654d24, transparent 44%), radial-gradient(ellipse at 33% 4%, #21d8ad70, transparent 44%), linear-gradient(110deg, #04bd90, #019971 66%, #087959); overflow: hidden; animation: header-reveal 850ms cubic-bezier(.2, .75, .25, 1) both; }
.guide-brand { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; padding-top: 20px; color: #fff; animation: brand-rise 760ms 80ms cubic-bezier(.2, .75, .25, 1) both; }
.brand-logo { width: 80px; height: 80px; display: grid; place-items: center; border: 1px solid #ffffff78; border-radius: 20px; background: linear-gradient(145deg, #ffffff36, #ffffff12); box-shadow: inset 0 0 24px #ffffff12, 0 10px 26px #005a4a25; animation: mascot-float 4.6s 850ms ease-in-out infinite; }
.brand-mascot { width: 70px; height: 70px; object-fit: contain; }
.brand-welcome { display: inline-flex; align-items: center; gap: 7px; padding: 3px 11px; border: 1px solid #ffffff38; border-radius: 999px; background: #ffffff12; font-size: 17px; margin-top: 11px; }.brand-welcome::before { content: ''; width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: #cafa79; box-shadow: 0 0 10px #d7ff92a6; }.brand-name { font-size: 28px; line-height: 1.45; text-shadow: 0 2px 14px #005a4a38; }.brand-slogan { position: relative; font-size: 17px; margin-top: 2px; }.brand-slogan::after { content: ''; position: absolute; left: 50%; bottom: -4px; width: 38px; height: 2px; border-radius: 99px; transform: translateX(-50%); background: linear-gradient(90deg, #d2ff8170, #e0ff9e, #d2ff8170); box-shadow: 0 0 8px #e0ff9e50; }
.header-orb { position: absolute; border-radius: 50%; border: 1px solid #ffffff30; background: #ffffff12; animation: orb-drift 11s ease-in-out infinite; }.orb-one { width: 190px; height: 190px; left: -30px; top: 55px; }.orb-two { width: 270px; height: 270px; right: 7%; top: -86px; animation-delay: -4s; }.orb-three { width: 66px; height: 66px; right: 21%; top: 38px; animation-delay: -7s; }
.guide-scene { position: relative; z-index: 1; width: 100%; margin-top: -30px; }
.panel-orb-layer { position: absolute; z-index: 0; inset: 0; overflow: visible; pointer-events: none; }
.guide-panel { position: relative; z-index: 1; display: grid; grid-template-columns: 42% minmax(0, 1fr); gap: 42px; width: calc(100% - 112px); max-width: 1380px; box-sizing: border-box; margin: 0 auto; padding: 48px 48px 30px; border-radius: 27px; border: 1.5px solid #ffffffa8; background: linear-gradient(180deg, rgba(216, 248, 239, .58), rgba(255, 255, 255, .38) 75px), var(--panel-glass); box-shadow: 0 15px 38px #23383213; animation: panel-rise 900ms 120ms cubic-bezier(.2, .75, .25, 1) both; }
.guide-code-column, .guide-info-column { position: relative; z-index: 1; min-width: 0; }.guide-code-column { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 3px; }
.code-halo { position: relative; width: min(100%, 405px); aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; background: radial-gradient(circle, #effbf600 56%, #c8f5e74d 57%, #e6faf466 70%, #e8faf000 71%); }
.code-halo::before { content: ''; position: absolute; inset: 12%; border: 1px solid #a7ebd2a6; border-radius: 50%; box-shadow: 0 0 24px #27c99a18; pointer-events: none; animation: halo-breathe 3.8s ease-in-out infinite; }
.code-disc { position: relative; width: 80%; height: 80%; border-radius: 50%; background: #fff; overflow: hidden; box-shadow: 0 0 34px #15c79c0a; }
.registration-code { width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity 220ms ease; }.registration-code.code-ready { opacity: 1; }
.code-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: #6f8690; font-size: 14px; text-align: center; padding: 20px; }.code-spinner { width: 26px; height: 26px; border: 3px solid #d8f5eb; border-top-color: var(--green); border-radius: 50%; animation: guide-spin 1s linear infinite; }.code-error-icon { width: 38px; height: 38px; color: var(--green); }
.code-retry { padding: 7px 15px; background: #e9faf4; border: 1px solid #b1e8d6; border-radius: 999px; color: #009b70; font: inherit; cursor: pointer; }
.guide-leaf { position: absolute; width: 43px; height: 23px; border-radius: 2px 90% 2px 90%; background: linear-gradient(135deg, #c1eb80, #74cc7c); box-shadow: inset -6px -5px 10px #3396520d; }.guide-leaf::after { content: ''; position: absolute; top: 50%; left: 10%; width: 80%; height: 1px; transform: rotate(20deg); background: #effbd57d; }.leaf-one { left: 8%; top: 12%; transform: rotate(28deg); animation: leaf-drift-one 5s ease-in-out infinite; }.leaf-two { right: -1%; bottom: 20%; transform: rotate(-55deg); animation: leaf-drift-two 5.6s 600ms ease-in-out infinite; }
.code-caption { margin: 4px 0 0; color: var(--muted); font-size: 16px; line-height: 1.5; text-align: center; }
.guide-title, .step-title, .code-caption, .guide-description, .step-description, .scan-caption { padding: 0; }.guide-title { margin: 3px 0 13px; font-size: clamp(25px, 2.65vw, 38px); line-height: 1.38; font-weight: 750; letter-spacing: -.8px; }.title-leaf { font-size: .67em; white-space: nowrap; }
.guide-description { margin: 0; color: var(--muted); font-size: 18px; line-height: 1.65; }
.registration-steps { list-style: none; padding: 0; margin: 24px 0 20px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; }.registration-step { position: relative; text-align: center; min-width: 0; animation: step-arrive 650ms cubic-bezier(.2, .75, .25, 1) both; }.registration-step:nth-child(1) { animation-delay: 300ms; }.registration-step:nth-child(2) { animation-delay: 410ms; }.registration-step:nth-child(3) { animation-delay: 520ms; }.registration-step:nth-child(4) { animation-delay: 630ms; }.registration-step:not(:last-child)::after { content: ''; position: absolute; width: 28%; border-top: 1px dashed #b9c6d8; left: 91%; top: 37px; }.step-visual { display: flex; flex-direction: column; align-items: center; }.step-icon { width: 72px; height: 72px; margin: 0 auto 5px; display: grid; place-items: center; border-radius: 50%; }.step-icon-svg { width: 47px; height: 47px; }
.step-number { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(130deg, #16cda0, #00a375); color: #fff; font-size: 16px; box-shadow: 0 0 0 3px var(--surface); }.step-title { margin: 8px 0 7px; font-size: 16px; line-height: 1.3; min-height: 42px; font-weight: 650; }.step-description { color: var(--muted); margin: 0; font-size: 14px; line-height: 1.45; text-wrap: pretty; }
.scan-notice { display: flex; align-items: center; gap: 21px; border-radius: 23px; background: #e7faf3; padding: 12px 22px; color: var(--green); animation: panel-rise 650ms 700ms cubic-bezier(.2, .75, .25, 1) both; }.notice-icon { display: grid; place-items: center; flex: 0 0 62px; height: 62px; border-radius: 50%; background: #ffffffb0; }.notice-icon-svg { width: 36px; height: 36px; }.scan-headline { display: block; font-size: 18px; line-height: 1.4; }.scan-caption { color: var(--muted); margin: 4px 0 0; font-size: 14px; line-height: 1.5; }.mobile-scan-copy { display: none !important; }
.guide-login { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 51px; margin: 10px 0 0; padding: 8px 12px; border: 1px solid #74d6b9; border-radius: 999px; background: transparent; color: var(--muted); font-size: 18px; font-family: inherit; cursor: pointer; transition: background 160ms ease; animation: panel-rise 650ms 820ms cubic-bezier(.2, .75, .25, 1) both; }.login-action { color: var(--green); font-weight: 650; }.guide-login-icon { width: 16px; height: 16px; color: var(--green); margin-left: 2px; animation: login-arrow 2.2s 1.5s ease-in-out infinite; }.guide-login:hover { background: #ebfbf6; }.guide-login:focus-visible, .code-retry:focus-visible { outline: 3px solid #05b482; outline-offset: 4px; }
.guide-footer { position: relative; z-index: 1; color: var(--muted); text-align: center; padding: 20px 16px 22px; font-size: 14px; line-height: 1.5; }
.panel-orb { position: absolute; z-index: 0; pointer-events: none; border-radius: 50%; animation: card-orb-drift 12s ease-in-out infinite; }.panel-blue { width: 165px; height: 165px; top: -6px; right: -38px; background: linear-gradient(135deg, #f2f6ff, #dde9ffc9); }.panel-orange { width: 230px; height: 230px; bottom: -54px; left: -73px; background: linear-gradient(135deg, #fff0dcaf, #fff1df75); animation-delay: -4s; }.panel-green { width: 180px; height: 180px; bottom: -55px; right: -56px; background: #d7fbe7a6; animation-delay: -8s; }
.guide-dark { --ink: #f0f4fb; --muted: #a3afc4; --surface: #131e2c; --panel-glass: rgba(19, 30, 44, .58); }.guide-dark .guide-panel { border-color: #a2d9ca35; background: linear-gradient(180deg, rgba(19, 81, 67, .58), rgba(23, 36, 53, .42) 85px), var(--panel-glass); box-shadow: 0 15px 38px #0004; }.guide-dark .scan-notice { background: #0b503d; color: #7ce4bc; }.guide-dark .login-action, .guide-dark .guide-login .guide-login-icon { color: #7ce4bc; }.guide-dark .guide-login:hover { background: #235044; }.guide-dark .panel-orb { opacity: .38; }.guide-dark .guide-login { border-color: #42856f; }
.step-icon { font-size: 16px; }.panel-footer { display: none; }
@keyframes header-reveal { from { opacity: .72; } to { opacity: 1; } }
@keyframes brand-rise { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mascot-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes orb-drift { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(0, -9px, 0) scale(1.025); } }
@keyframes panel-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
@keyframes halo-breathe { 0%, 100% { opacity: .35; transform: scale(.96); } 50% { opacity: .8; transform: scale(1.025); } }
@keyframes leaf-drift-one { 0%, 100% { transform: rotate(28deg) translateY(0); } 50% { transform: rotate(20deg) translateY(-5px); } }
@keyframes leaf-drift-two { 0%, 100% { transform: rotate(-55deg) translateY(0); } 50% { transform: rotate(-47deg) translateY(5px); } }
@keyframes step-arrive { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes login-arrow { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
@keyframes card-orb-drift { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(0, -13px, 0) scale(1.04); } }
@keyframes guide-spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) and (min-width: 761px) { .guide-panel { width: calc(100% - 64px); gap: 24px; padding: 38px 28px 28px; grid-template-columns: 37% minmax(0, 1fr); }.guide-description { font-size: 16px; }.step-icon { width: 60px; height: 60px; }.step-title { font-size: 14px; }.step-description { font-size: 12px; }.scan-notice { gap: 12px; padding: 10px 15px; }.scan-headline { font-size: 16px; }.notice-icon { flex-basis: 48px; height: 48px; }.code-caption { font-size: 14px; } }
@media (max-width: 760px) {
  .guide-header { height: 154px; border-radius: 0 0 48% 7% / 0 0 7% 2%; }.guide-brand { display: grid; grid-template-columns: 80px auto; grid-template-rows: auto auto auto; column-gap: 16px; width: fit-content; max-width: calc(100% - 32px); margin: 0 auto; padding-top: 17px; align-items: center; justify-items: start; }.brand-logo { grid-column: 1; grid-row: 1 / 4; }.brand-welcome, .brand-name, .brand-slogan { grid-column: 2; white-space: nowrap; }.brand-welcome { align-self: end; margin: 0; padding: 2px 9px; font-weight: 600; letter-spacing: .03em; }.brand-name { align-self: center; margin: 0; font-size: 30px; line-height: 1.2; letter-spacing: .02em; }.brand-slogan { align-self: start; margin: 2px 0 0; font-size: 17px; line-height: 1.4; opacity: .9; letter-spacing: .015em; }.orb-one { width: 160px; height: 160px; left: -73px; top: 61px; }.orb-two { width: 182px; height: 182px; right: -23px; top: -46px; }.orb-three { width: 43px; height: 43px; right: 19%; top: 30px; }
  .guide-scene { margin-top: -28px; }.panel-orb-layer { overflow: hidden; border-radius: 25px; }.guide-panel { --panel-glass: rgba(255, 255, 255, .56); display: flex; flex-direction: column; width: calc(100% - 38px); gap: 10px; margin: 0 auto; padding: 12px 18px; border-radius: 25px; background: linear-gradient(180deg, rgba(220, 248, 239, .58), rgba(255, 255, 255, .28) 100px), var(--panel-glass); }.guide-code-column { padding-top: 0; }.code-halo { width: min(100%, 180px); }.code-disc { width: 81%; height: 81%; }.guide-leaf { width: 32px; height: 18px; }.code-caption { font-size: 13px; margin-top: 2px; }.code-placeholder { font-size: 12px; gap: 11px; }
  .guide-title { text-align: center; font-size: clamp(20px, 5.8vw, 31px); letter-spacing: -.6px; margin: 0 0 8px; }.title-leaf { font-size: .65em; }.guide-description { font-size: 13px; line-height: 1.6; text-align: center; }
  .registration-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0 8px; }.registration-step { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border: 1px solid #e3eaf1; border-radius: 15px; text-align: left; background: #ffffff47; }.registration-step:not(:last-child)::after { display: none; }.step-visual { position: relative; flex: 0 0 36px; width: 36px; height: 36px; }.step-icon { width: 36px; height: 36px; margin: 0; }.step-icon-svg { width: 29px; height: 29px; }.step-copy { min-width: 0; }.step-number { position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; font-size: 12px; }.step-title { min-height: 0; font-size: 12px; margin: 0 0 3px; line-height: 1.35; }.step-description { font-size: 11px; line-height: 1.5; }
  .scan-notice { gap: 10px; padding: 10px; border-radius: 18px; }.notice-icon { flex-basis: 46px; height: 46px; }.notice-icon-svg { width: 28px; height: 28px; }.scan-headline { font-size: 13px; }.scan-caption { font-size: 11px; line-height: 1.5; }.desktop-scan-copy { display: none !important; }.mobile-scan-copy { display: block !important; }.guide-login { min-height: 41px; font-size: 16px; margin-top: 8px; gap: 8px; }.guide-footer { font-size: 12px; padding: 15px 12px 20px; }.panel-blue { width: 125px; height: 125px; right: -41px; top: -2px; }.panel-orange { width: 164px; height: 164px; left: -69px; bottom: 32%; }.panel-green { width: 136px; height: 136px; right: -40px; bottom: -22px; }.guide-dark .registration-step { background: #20324566; border-color: #8da1bc2b; }
}
@media (max-width: 360px) { .guide-panel { padding-left: 14px; padding-right: 14px; width: calc(100% - 28px); }.registration-step { gap: 6px; padding: 8px 7px; }.step-visual { flex-basis: 34px; width: 34px; height: 34px; }.step-icon { width: 34px; height: 34px; }.step-icon-svg { width: 25px; height: 25px; }.step-title { font-size: 12px; }.guide-description { font-size: 13px; } }
@media (max-width: 760px) { .step-icon { font-size: 10px; }.desktop-footer { display: none; }.panel-footer { display: block; margin-top: -14px; padding: 4px 0 0; } }
@media (prefers-reduced-motion: reduce) { .guide-header, .guide-brand, .brand-logo, .header-orb, .guide-panel, .code-halo::before, .guide-leaf, .registration-step, .scan-notice, .guide-login, .guide-login-icon, .code-spinner { animation: none !important; }.registration-code, .guide-login { transition: none; } }
.brand-name, .scan-headline { font-weight: 700; }
.guide-login::after, .code-retry::after { border: 0; }
</style>
