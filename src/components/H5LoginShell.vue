<template>
  <view class="h5-login-shell" :class="{ 'shell-dark': dark }">
    <view class="login-hero">
      <view class="hero-orb orb-left"></view><view class="hero-orb orb-right"></view><view class="hero-orb orb-small"></view>
      <view class="hero-brand"><view class="brand-logo"><view class="mascot-motion" :class="['mascot-' + mascotMotion, { 'motion-paused': motionPaused }]" :style="{ animationDelay: mascotDelay + 's' }" @animationend="nextMascotMotion"><image class="brand-mascot" src="/static/person.webp.png" mode="aspectFit" /></view></view>
        <view class="brand-copy"><text class="brand-name">分投侠</text><text class="brand-slogan">智能垃圾分类助手</text></view>
      </view>
    </view>
    <view class="login-stage">
      <view class="stage-orb stage-blue"><view class="saturn-ring"></view></view><view class="stage-orb stage-green"><view class="saturn-ring"></view></view><view class="stage-orb stage-yellow"><view class="saturn-ring"></view></view>
      <view class="login-glass">
        <view class="mobile-tabs" role="tablist" aria-label="登录方式">
          <button role="tab" :aria-selected="mode === 'account'" :class="{ selected: mode === 'account' }" :disabled="loading || qrBusy" @click="mode = 'account'">账号登录</button>
          <button role="tab" :aria-selected="mode === 'wechat'" :class="{ selected: mode === 'wechat' }" :disabled="loading || qrBusy" @click="mode = 'wechat'">微信扫码</button>
        </view>
        <text class="mobile-hint">{{ mode === 'account' ? '可切换到微信扫码，完成登录或注册' : '在小程序完成登录或注册，返回网页继续' }}</text>
        <view class="login-columns">
          <view v-show="wide || mode === 'account'" class="account-column">
            <view class="account-heading"><view class="account-icon"><ManifestIcon id="user_profile" :scale="2.5" /></view><view><text class="account-title">账号密码登录</text><text class="account-description">使用您的账号密码登录分投侠</text></view></view>
            <form class="account-form" @submit="submitAccount">
              <view class="account-input"><ManifestIcon id="user_profile" :scale="1.8" /><input v-model="usernameModel" type="text" placeholder="用户名" maxlength="20" aria-label="用户名" @confirm="submitAccount" /></view>
              <view class="account-input"><ManifestIcon id="password" :scale="1.8" /><input v-model="passwordModel" :type="showPassword ? 'text' : 'password'" placeholder="密码" maxlength="20" aria-label="密码" @confirm="submitAccount" /><button type="button" class="eye-toggle" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="emit('update:showPassword', !showPassword)"><ManifestIcon :id="showPassword ? 'visibility_off' : 'visibility'" :scale="1.8" /></button></view>
              <view v-if="showCaptcha" class="captcha-section"><text>验证码</text><component :is="dark ? CaptchaDark : CaptchaBox" ref="captcha" :model-value="captchaInput" @update:model-value="emit('update:captchaInput', $event)" @confirm="submitAccount" /><text v-if="captchaHint" class="captcha-hint">{{ captchaHint }}</text></view>
              <view class="account-options"><button type="button" class="remember-toggle" role="checkbox" :aria-checked="rememberMe" @click="emit('update:rememberMe', !rememberMe)"><view class="remember-check" :class="{ checked: rememberMe }"><text v-if="rememberMe">✓</text></view><text>记住我</text></button></view>
              <button form-type="submit" class="account-submit" :disabled="loading || qrBusy"><ManifestIcon v-if="!loading" id="submit_action" :scale="1.8" /><view v-else class="submit-spinner"></view><text>{{ loading || qrBusy ? '正在登录…' : '登 录' }}</text></button>
              <text class="account-caption">已有账号可直接登录</text>
              <view class="register-entry"><text>还没有账号？</text><button type="button" @click="selectWechat">{{ wide ? '扫码注册 ›' : '切换到微信扫码注册' }}</button></view>
            </form>
          </view>
          <view v-if="wide || mode === 'wechat'" ref="qrColumn" class="wechat-column">
            <H5WechatLoginPanel ref="qrPanel" :dark="dark" :disabled="loading" @busy="qrBusy = $event" @login="emit('qrLogin', $event)" />
          </view>
        </view>
      </view>
      <text class="login-footer">🌿 环保从分类开始，共建绿色家园</text>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import CaptchaBox from '@/components/CaptchaBox.vue'
import CaptchaDark from '@/components/CaptchaBox-black.vue'
import H5WechatLoginPanel from '@/components/H5WechatLoginPanel.vue'
const props = defineProps({ dark: Boolean, username: String, password: String, showPassword: Boolean,
  rememberMe: Boolean, loading: Boolean, showCaptcha: Boolean, captchaInput: String, captchaHint: String })
const emit = defineEmits(['update:username', 'update:password', 'update:showPassword', 'update:rememberMe', 'update:captchaInput', 'login', 'qrLogin'])
const usernameModel = computed({ get: () => props.username, set: value => emit('update:username', value) })
const passwordModel = computed({ get: () => props.password, set: value => emit('update:password', value) })
const mode = ref('account'), qrBusy = ref(false), captcha = ref(null), qrPanel = ref(null), qrColumn = ref(null)
const media = typeof window !== 'undefined' ? window.matchMedia('(min-width: 901px)') : null
const wide = ref(media?.matches || false)
const mascotMotion = ref('enter'), mascotDelay = ref(.2), motionPaused = ref(false)
const idleMotions = ['bounce', 'sway', 'turn']
function nextMascotMotion() {
  const choices = idleMotions.filter(value => value !== mascotMotion.value)
  mascotDelay.value = 2.5 + Math.random() * 3
  mascotMotion.value = choices[Math.floor(Math.random() * choices.length)]
}
function syncMotionVisibility() { motionPaused.value = document.hidden }
function resize(event) { wide.value = event.matches }
function submitAccount() {
  if (props.loading || qrBusy.value) return
  // Pause before emitting so a simultaneous QR response cannot race the password request.
  qrPanel.value?.pause()
  emit('login')
  nextTick(() => { if (!props.loading) qrPanel.value?.resume() })
}
async function selectWechat() {
  if (props.loading || qrBusy.value) return
  mode.value = 'wechat'
  await nextTick()
  const element = qrColumn.value?.$el || qrColumn.value
  element?.scrollIntoView?.({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
}
watch(() => props.loading, loading => { if (!loading) qrPanel.value?.resume() })
onMounted(() => {
  media?.addEventListener('change', resize)
  syncMotionVisibility()
  document.addEventListener('visibilitychange', syncMotionVisibility)
})
onBeforeUnmount(() => {
  media?.removeEventListener('change', resize)
  document.removeEventListener('visibilitychange', syncMotionVisibility)
})
defineExpose({ validate: () => captcha.value?.validate() || false, refresh: () => captcha.value?.refresh() })
</script>

<style scoped>
.h5-login-shell { --ink: #18213a; --muted: #8793a8; --surface: #fff; --card: #ffffffb8; --input: #f7f8fb; --border: #d6dfeb; --green: #00a67b; min-height: 100vh; background: radial-gradient(ellipse at 0 65%, #e3f7ff, transparent 45%), radial-gradient(ellipse at 100% 80%, #effbed, transparent 42%), var(--surface); color: var(--ink); overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.shell-dark { --ink: #edf5f4; --muted: #a6b8bc; --surface: #101e28; --card: #142831de; --input: #1c303b; --border: #34505a; --green: #62ddb5; background: radial-gradient(ellipse at 0 65%, #173544, transparent 45%), radial-gradient(ellipse at 100% 80%, #193831, transparent 42%), var(--surface); }
.login-hero { height: 132px; position: relative; background: radial-gradient(ellipse at 40% 15%, #40dcb7a6, transparent 52%), linear-gradient(120deg, #03b98b, #008262); overflow: hidden; }.hero-orb { position: absolute; border: 1px solid #ffffff38; border-radius: 50%; background: #ffffff15; }.orb-left { width: 200px; height: 200px; top: 54px; left: -32px; }.orb-right { width: 280px; height: 280px; top: -112px; right: 8%; }.orb-small { width: 64px; height: 64px; top: 29px; right: 21%; }
.hero-brand { display: flex; justify-content: center; align-items: center; gap: 14px; position: relative; color: #fff; padding-top: 25px; }.brand-logo { width: 64px; height: 64px; display: grid; place-items: center; border: 1px solid #ffffff80; border-radius: 17px; background: #ffffff24; box-shadow: inset 0 0 22px #ffffff18; }.brand-mascot { width: 58px; height: 58px; }.brand-copy { display: flex; flex-direction: column; }.brand-name { font-size: 25px; font-weight: 700; }.brand-slogan { font-size: 14px; margin-top: 5px; }
.mascot-motion { display: flex; transform-origin: center bottom; animation-fill-mode: both; animation-timing-function: ease-in-out; }.mascot-enter { animation-name: mascot-enter; animation-duration: .85s; }.mascot-bounce { animation-name: mascot-bounce; animation-duration: 1.25s; }.mascot-sway { animation-name: mascot-sway; animation-duration: 1.5s; }.mascot-turn { animation-name: mascot-turn; animation-duration: 1.4s; }.motion-paused { animation-play-state: paused; }
@keyframes mascot-enter { 0% { opacity: 0; transform: translateY(-22px) scale(.3); } 45% { opacity: 1; transform: translateY(-7px) scale(1.12) rotate(-7deg); } 65% { transform: translateY(3px) scale(.96) rotate(5deg); } 85% { transform: translateY(-2px) scale(1.03); } 100% { transform: none; } }
@keyframes mascot-bounce { 0%, 100% { transform: none; } 22% { transform: translateY(-9px) scale(1.08); } 42% { transform: translateY(2px) scale(.96, 1.02); } 63% { transform: translateY(-4px) scale(1.03); } 80% { transform: translateY(1px); } }
@keyframes mascot-sway { 0%, 100% { transform: none; } 22% { transform: rotate(-10deg); } 48% { transform: rotate(9deg); } 72% { transform: rotate(-5deg); } }
@keyframes mascot-turn { 0%, 100% { transform: none; } 25% { transform: rotate(-5deg) scaleX(.88); } 50% { transform: translateY(-3px) rotate(5deg) scale(1.04); } 75% { transform: rotate(-3deg); } }
.login-stage { position: relative; margin-top: -18px; padding-bottom: 25px; }.login-glass { position: relative; z-index: 1; width: calc(100% - 112px); max-width: 1380px; margin: auto; border: 1px solid #ffffffa6; border-radius: 27px; background: linear-gradient(180deg, #d4f4ea66, transparent 90px), var(--card); backdrop-filter: blur(18px); box-shadow: 0 18px 48px #23584714; padding: 32px 36px 24px; box-sizing: border-box; }.login-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; }.account-column { min-width: 0; padding: 14px 18px 0; }.wechat-column { min-width: 0; padding-left: 32px; border-left: 1px solid #dcebe6; }
.account-heading { display: flex; align-items: center; gap: 17px; }.account-icon { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 50%; background: #e6fbf3; }.account-title { display: block; font-size: 23px; font-weight: 700; }.account-description { display: block; font-size: 13px; color: var(--muted); margin-top: 8px; }.account-form { display: block; margin-top: 39px; }.account-input { display: flex; align-items: center; gap: 13px; min-height: 53px; margin-bottom: 18px; padding: 0 15px; background: var(--input); border: 1px solid var(--border); border-radius: 12px; box-sizing: border-box; }.account-input:focus-within { border-color: #32bd9b; box-shadow: 0 0 0 3px #06b78912; }.account-input input { flex: 1; min-width: 0; font-size: 17px; color: var(--ink); height: 51px; }.account-input input::placeholder { color: var(--muted); }.eye-toggle { display: grid; place-items: center; padding: 0; margin: 0; background: transparent; border: 0; line-height: 1; }.eye-toggle::after { border: 0; }
.account-options { margin: 4px 0 22px; }.remember-toggle { display: inline-flex; gap: 10px; align-items: center; border: 0; background: transparent; margin: 0; padding: 0; font-size: 15px; color: var(--ink); line-height: 1.6; }.remember-toggle::after { border: 0; }.remember-check { width: 21px; height: 21px; border-radius: 5px; border: 1px solid var(--border); display: grid; place-items: center; box-sizing: border-box; }.remember-check.checked { color: #fff; background: linear-gradient(130deg, #23d1a0, #00a578); border-color: #08b48a; }
.account-submit { width: 100%; min-height: 54px; border: 0; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 9px; background: linear-gradient(110deg, #3ed8a9, #00a77e); color: #fff; font-size: 19px; font-weight: 600; box-shadow: 0 8px 20px #04b48738; }.account-submit::after { border: 0; }.account-submit[disabled] { opacity: .6; color: #fff; background: #1da786; }.account-caption { display: block; text-align: center; font-size: 13px; color: var(--muted); margin-top: 20px; }.register-entry { margin-top: 43px; padding-top: 25px; border-top: 1px solid #e2e9ef; display: flex; justify-content: center; align-items: center; gap: 8px; color: var(--muted); font-size: 14px; }.register-entry button { padding: 0; margin: 0; line-height: 1.6; font-size: inherit; color: var(--green); background: transparent; border: 0; font-weight: 600; }.register-entry button::after { border: 0; }.captcha-section { font-size: 13px; margin-bottom: 15px; }.captcha-hint { display: block; color: #db5966; margin-top: 6px; }
.mobile-tabs, .mobile-hint { display: none; }.login-footer { position: relative; z-index: 1; display: block; text-align: center; font-size: 13px; color: var(--muted); margin-top: 22px; }.stage-orb { position: absolute; border-radius: 50%; pointer-events: none; }.stage-blue { width: 180px; height: 180px; background: #e1ebff; right: -40px; top: -20px; }.stage-green { width: 160px; height: 160px; background: linear-gradient(135deg, #6ee7b7, #34d399, #10b981); opacity: .5; left: 34px; bottom: -12px; }.stage-yellow { width: 210px; height: 210px; background: #faffdc; right: -70px; top: 55%; }
.saturn-ring { position: absolute; top: 50%; left: 50%; width: 260%; height: 29%; border-radius: 50%; transform: translate(-50%, -50%) rotate(17deg) scaleY(.38); background: linear-gradient(90deg, transparent, #34d39966 25%, #6ee7b7b3 45%, #34d39999 70%, transparent); }.saturn-ring::before { content: ''; position: absolute; inset: 25% 15%; border-radius: 50%; background: #a7f3d044; }.stage-blue .saturn-ring { background: linear-gradient(90deg, transparent, #93c5fd66, #60a5fa88, transparent); transform: translate(-50%, -50%) rotate(-17deg) scaleY(.38); }.stage-yellow .saturn-ring { background: linear-gradient(90deg, transparent, #fcd34d44, #fbbf2466, transparent); }
.shell-dark .login-glass { border-color: #5fa58e4d; background: linear-gradient(180deg, #225f4d55, transparent 100px), var(--card); box-shadow: 0 18px 48px #0003; }.shell-dark .wechat-column, .shell-dark .register-entry { border-color: #31515a; }.shell-dark .account-icon { background: #20483d; }.shell-dark .stage-orb { opacity: .16; }
.submit-spinner { width: 17px; height: 17px; border: 2px solid #ffffff60; border-top-color: white; border-radius: 50%; animation: submit-spin 900ms linear infinite; }@keyframes submit-spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) and (min-width: 901px) { .login-glass { width: calc(100% - 50px); padding: 28px 20px 24px; }.login-columns { gap: 23px; }.account-column { padding-left: 5px; padding-right: 5px; }.wechat-column { padding-left: 23px; } }
@media (max-width: 900px) { .login-hero { height: 212px; }.hero-brand { flex-direction: column; gap: 0; padding-top: 25px; }.brand-copy { align-items: center; }.brand-name { font-size: 29px; margin-top: 8px; }.brand-slogan { font-size: 15px; }.brand-logo { width: 68px; height: 68px; }.brand-mascot { width: 61px; height: 61px; }.login-stage { margin-top: -26px; }.login-glass { width: calc(100% - 30px); max-width: 540px; padding: 22px 20px 25px; border-radius: 24px; }.login-columns { display: block; }.account-column { padding: 0; }.account-heading { display: none; }.account-form { margin-top: 0; }.wechat-column { padding: 0; border: 0; }.mobile-tabs { display: flex; padding: 5px; border-radius: 999px; background: #e9faf4; margin-bottom: 15px; }.mobile-tabs button { flex: 1; padding: 9px 0; margin: 0; border: 0; background: transparent; color: var(--ink); font-size: 16px; line-height: 1.7; border-radius: 999px; }.mobile-tabs button::after { border: 0; }.mobile-tabs button.selected { color: #fff; background: linear-gradient(110deg, #21cfa0, #00a577); box-shadow: 0 4px 12px #13b88b24; }.mobile-hint { display: block; text-align: center; font-size: 12px; color: var(--muted); margin-bottom: 23px; line-height: 1.6; }.account-input { min-height: 51px; margin-bottom: 17px; border-radius: 13px; padding: 0 12px; gap: 9px; }.account-input input { font-size: 16px; height: 49px; }.account-options { margin: 3px 0 22px; }.remember-toggle { font-size: 15px; }.account-submit { min-height: 49px; font-size: 18px; }.account-caption { display: none; }.register-entry { border: 0; margin-top: 24px; padding-top: 0; font-size: 13px; }.login-footer { font-size: 12px; margin-top: 29px; padding: 0 15px; }.stage-green { left: 16px; bottom: -38px; width: 140px; height: 140px; }.shell-dark .mobile-tabs { background: #21453d; } }
@media (prefers-reduced-motion: reduce) { .submit-spinner, .mascot-motion { animation: none; } }
</style>
