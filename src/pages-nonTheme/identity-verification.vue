<template>
  <RecyclingShell title="实名认证" :dark="isDark" variant="workbench">
    <view class="identity-intro"><text class="identity-title">让每一次上门更安心</text><text class="recycle-muted">认证与当前账号绑定，成为回收员前需完成。</text></view>
    <view v-if="webHandoff" class="identity-notice"><text class="recycle-copy">正在为账号「{{ handoffAccount || '原应用账号' }}」认证。完成后请返回原应用。</text></view>
    <view v-if="error" class="recycle-error">{{ error }}</view>
    <view v-if="loading" class="recycle-empty">正在获取认证状态…</view>
    <view v-else-if="identity.verified" class="identity-result">
      <text class="identity-check">✓</text><text class="identity-title">实名认证已通过</text>
      <text class="recycle-copy">{{ identity.maskedName }} · {{ identity.maskedNumber }}</text>
      <text class="recycle-muted">认证信息不对其他用户展示。</text>
      <button class="recycle-primary" @click="back">{{ webHandoff ? '认证完成，请返回原应用' : '完成并返回' }}</button>
    </view>
    <template v-else>
      <view v-if="processing" class="identity-notice"><text class="recycle-heading">认证结果确认中</text><text class="recycle-copy">请稍候，勿重复提交。离开后可回到本页查看结果。</text></view>
      <view v-else-if="identity.attempt?.state === 'unknown'" class="identity-notice"><text class="recycle-copy">上次认证未取得最终结果，请先刷新状态。如仍无结果，可稍后重新认证。</text></view>
      <view v-if="!identity.available" class="identity-notice"><text class="recycle-copy">认证服务暂不可用，请稍后重试或联系平台。</text></view>
      <!-- #ifndef H5 || APP-PLUS || MP-WEIXIN -->
      <view class="identity-notice"><text class="recycle-heading">在安全网页完成动作认证</text><text class="recycle-copy">按随机顺序眨眼、张嘴后继续认证，不支持跳过。认证绑定当前账号，无需在浏览器重新登录。</text><text class="recycle-muted">请本人使用链接，勿转发。链接10分钟有效；完成后返回本页刷新状态。</text></view>
      <button class="recycle-primary" :disabled="openingWeb || processing || retryBlocked || !identity.available" @click="openWebVerification">{{ openingWeb ? '正在准备…' : '前往网页认证' }}</button>
      <button v-if="handoffUrl" class="recycle-secondary" @click="copyWebLink">复制认证链接</button>
      <text v-if="webLinkReady" class="recycle-muted">链接已复制。若未自动打开，请粘贴到系统浏览器访问。</text>
      <!-- #endif -->
      <template v-if="!handoffFailed">
      <view class="identity-steps"><text>01 填写身份</text><text>02 人脸核验</text><text>03 认证结果</text></view>
      <text class="recycle-label">本人姓名</text><input class="recycle-input" v-model="name" maxlength="100" placeholder="与身份证一致的姓名" :disabled="busy" :aria-invalid="!!fieldErrors.name" @input="editField('name', $event)" @blur="validateField('name', $event)" @confirm="validateField('name', $event)" />
      <text v-if="fieldErrors.name" class="identity-field-error" :class="{ 'is-dark': isDark }" role="alert">{{ fieldErrors.name }}</text>
      <text class="identity-name-note recycle-muted">少数民族姓名中的间隔符请使用“·”。</text>
      <text class="recycle-label">身份证号码</text><input class="recycle-input" v-model="number" type="idcard" maxlength="18" placeholder="18位居民身份证号码" :disabled="busy" :aria-invalid="!!fieldErrors.number" @input="editField('number', $event)" @blur="validateField('number', $event)" @confirm="validateField('number', $event)" />
      <text v-if="fieldErrors.number" class="identity-field-error" :class="{ 'is-dark': isDark }" role="alert">{{ fieldErrors.number }}</text>
      <text class="identity-age-note recycle-muted">实名认证需年满18周岁。</text>
      <view class="identity-consent">
        <checkbox-group @change="consented = $event.detail.value.includes('agree')"><label><checkbox value="agree" :checked="consented" :disabled="busy" color="#059669" /><text>我已阅读并同意实名核验说明</text></label></checkbox-group>
        <button class="identity-link" @click="showConsent = !showConsent">{{ showConsent ? '收起说明' : '查看说明' }}</button>
      </view>
      <view v-if="showConsent" class="identity-disclosure"><text class="recycle-copy">为核验当前申请人身份，你同意将本人姓名、身份证号码和现场认证照片提供给北京互联三六五科技有限公司，用于身份核验。认证通过后，平台将保存你的完整姓名、身份证号码及本次现场照片，用于账号身份管理和必要核查。</text><text class="recycle-copy">请由证件本人完成认证动作。你可以随时取消，完成实名认证后才能申请成为回收员。</text></view>
      <view v-if="verificationFailed" class="identity-failure" role="alert">
        <text class="identity-failure-icon">!</text>
        <text class="identity-failure-title">认证失败</text>
        <text v-if="retryBlocked" class="identity-retry-copy">认证机会已用完，请于 {{ retryDate }} 后重新认证。</text>
        <text v-else-if="identity.attempt?.finalFailure && identity.retry" class="identity-retry-copy">您还有 {{ identity.retry.remaining }} 次认证机会</text>
        <button class="recycle-primary identity-start" :class="{ 'is-disabled': !canStartVerification }" :disabled="!canStartVerification" @click="retryVerification">{{ retryBlocked ? '等待期内暂不可认证' : '重新认证' }}</button>
      </view>
      <view v-else class="identity-capture">
        <view class="identity-assist"><view><text>{{ busy ? '认证进行中，请稍候' : '请按提示完成人脸认证' }}</text><text class="recycle-muted">请本人独自入镜，保持光线充足，认证结果将自动显示。</text></view></view>
        <button class="recycle-primary identity-start" :class="{ 'is-disabled': !canStartVerification }" :disabled="!canStartVerification" @click="capture">{{ busy ? '认证中…' : '开始人脸认证' }}</button>
      </view>
      </template>
      <button class="identity-link refresh-status" :disabled="busy" @click="refresh">刷新认证状态</button>
    </template>
  </RecyclingShell>
</template>
<script>
import RecyclingShell from './components/RecyclingShell.vue'
import { identityAgeError } from '@/utils/identity-age.mjs'
import { normalizeIdentityName, identityNameError } from '@/utils/identity-name.mjs'
import { identityStatus, identityChallenge, submitIdentity, createIdentityWebSession, exchangeIdentityWebSession, identityWebContext, clearIdentityWebSession } from '@/api/identity.js'
import { baseUrl } from '@/api/settings.js'
import { captureIdentityPhoto, cancelIdentityCapture, discardIdentityPhoto, ensureIdentityPhotoUsable } from '@/utils/identity-capture.js'
import { recycleBack } from './api/recycling.js'
export default {
  components: { RecyclingShell },
  data: () => ({ isDark: false, identity: {}, loading: true, error: '', name: '', number: '', fieldErrors: { name: '', number: '' }, consented: false,
    showConsent: true, captureFailure: '', photo: null, photoUsable: false, challenge: null, capturing: false, submitting: false,
    openingWeb: false, webLinkReady: false, handoffUrl: '', webHandoff: false, handoffAccount: '', handoffLoading: false, handoffFailed: false }),
  computed: {
    busy() { return this.capturing || this.submitting },
    processing() { return this.identity.attempt?.state === 'processing' },
    retryBlocked() { return this.identity.retry?.blocked === true },
    canStartVerification() {
      return !this.loading && !this.busy && !this.processing && !this.retryBlocked && !this.handoffFailed &&
        !this.identity.verified && !!this.identity.available && this.consented &&
        !identityNameError(this.name) && !identityAgeError(this.number)
    },
    retryDate() {
      const value = this.identity.retry?.blockedUntil
      if (!value) return ''
      const date = new Date(value)
      const pad = n => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    },
    verificationFailed() { return !this.identity.verified && !this.processing && !this.capturing && !!(this.captureFailure || this.retryBlocked || (!this.photo && this.identity.attempt?.state === 'failed')) },
  },
  async onLoad(options = {}) {
    // #ifdef H5
    const saved = identityWebContext()
    if (Object.prototype.hasOwnProperty.call(options, 'handoff')) {
      this.webHandoff = true; this.handoffLoading = true
      try {
        const session = await exchangeIdentityWebSession(options.handoff)
        if (this.pageClosed) return
        this.handoffAccount = session.account
        if (session.persisted) history.replaceState(history.state, '', location.pathname + location.search + '#/pages-nonTheme/identity-verification')
      }
      catch (e) { if (!this.pageClosed) { this.handoffFailed = true; this.error = '认证入口暂不可用，请重新进入。' } }
      finally {
        this.handoffLoading = false; this.loading = false
      }
      if (!this.pageClosed && !this.handoffFailed) await this.refresh()
    } else if (saved) { this.webHandoff = true; this.handoffAccount = saved.account }
    // #endif
  },
  onShow() { this.pageClosed = false; this.pageVisible = true; this.isDark = uni.getStorageSync('app_theme') === 'dark'; if (!this.handoffLoading && !this.handoffFailed) this.refresh() },
  onHide() { this.pageVisible = false; clearTimeout(this.pollTimer) },
  onUnload() { this.pageClosed = true; cancelIdentityCapture(); clearTimeout(this.pollTimer); this.clearPhoto(); this.name = ''; this.number = ''; if (this.webHandoff) clearIdentityWebSession() },
  methods: {
    back() { if (!this.webHandoff) recycleBack(); else uni.showToast({ title: '请返回原应用查看认证状态', icon: 'none' }) },
    async copyWebLink() {
      try {
        await new Promise((resolve, reject) => uni.setClipboardData({ data: this.handoffUrl, success: resolve, fail: reject }))
        this.webLinkReady = true
      } catch { this.error = '链接复制失败，请允许剪贴板权限后重试' }
    },
    async openWebVerification() {
      if (this.openingWeb || this.processing || this.retryBlocked) return
      this.openingWeb = true; this.error = ''; this.webLinkReady = false
      try {
        const session = await createIdentityWebSession()
        const url = `${baseUrl.replace(/\/$/, '')}/#/pages-nonTheme/identity-verification?handoff=${encodeURIComponent(session.code)}`
        this.handoffUrl = url
        // #ifdef APP-PLUS
        plus.runtime.openURL(url, () => { this.error = '浏览器未打开，请复制链接后手动打开' })
        // #endif
        // #ifndef APP-PLUS
        await this.copyWebLink()
        // #endif
      } catch (e) { this.error = '认证入口暂不可用，请稍后重试。' }
      finally { this.openingWeb = false }
    },
    clearPhoto() {
      discardIdentityPhoto(this.photo)
      this.photo = null; this.photoUsable = false
    },
    async retryVerification() {
      if (this.busy || this.processing || this.retryBlocked || !this.identity.available || !this.valid()) return
      this.clearPhoto(); this.challenge = null; this.captureFailure = ''; this.error = ''
      await this.capture()
    },
    async refresh() {
      if (this.handoffLoading || this.handoffFailed) return
      clearTimeout(this.pollTimer)
      const version = this.identityVersion || 0
      try {
        const identity = await identityStatus()
        if (this.pageClosed || version !== (this.identityVersion || 0)) return
        this.identity = identity; this.error = ''
        if (identity.verified) { this.captureFailure = ''; this.clearPhoto(); this.name = ''; this.number = '' }
        if (identity.attempt?.state === 'processing' && this.pageVisible) this.pollTimer = setTimeout(() => this.refresh(), 3000)
      } catch (e) { if (!this.pageClosed && version === (this.identityVersion || 0)) this.error = '暂时无法获取认证状态，请稍后重试。' }
      finally { if (!this.pageClosed) this.loading = false }
    },
    editField(field, event) {
      if (this.pageClosed || this.identity.verified) return
      if (typeof event?.detail?.value === 'string') this[field] = event.detail.value
      this.fieldErrors[field] = ''
      if (field === 'number' && this.number.trim().length === 18) this.validateField(field)
    },
    validateField(field, event) {
      if (this.pageClosed || this.identity.verified) return false
      if (typeof event?.detail?.value === 'string') this[field] = event.detail.value
      this[field] = field === 'name' ? normalizeIdentityName(this.name) : this.number.trim().toUpperCase()
      this.fieldErrors[field] = field === 'name' ? identityNameError(this.name) : identityAgeError(this.number)
      return !this.fieldErrors[field]
    },
    valid() {
      this.error = ''
      const nameValid = this.validateField('name'), numberValid = this.validateField('number')
      if (!nameValid || !numberValid) return false
      if (!this.consented) { this.error = '请先阅读并同意实名核验说明'; return false }
      return true
    },
    async capture() {
      if (this.busy || this.processing || this.retryBlocked || !this.valid()) return
      const fields = { name: this.name.trim(), number: this.number.trim().toUpperCase() }
      this.identityVersion = (this.identityVersion || 0) + 1
      this.capturing = true; this.error = ''; this.captureFailure = ''
      let stage = 'challenge', captured = null
      try {
        const challenge = await identityChallenge()
        if (this.pageClosed) return
        if (challenge.alreadyVerified) { await this.refresh(); return }
        this.challenge = challenge
        stage = 'capture'
        captured = await captureIdentityPhoto({ actions: challenge.actions })
        if (this.pageClosed) { discardIdentityPhoto(captured); return }
        await ensureIdentityPhotoUsable(captured)
        if (this.pageClosed || this.identity.verified || this.processing) { discardIdentityPhoto(captured); return }
        this.clearPhoto(); this.photo = captured; captured = null; this.photoUsable = true
        this.capturing = false
        await this.submit(fields)
      } catch (e) {
        discardIdentityPhoto(captured)
        if (!this.pageClosed) { this.clearPhoto(); this.challenge = null }
        if (!this.pageClosed && !e.cancelled && !/cancel/i.test(e.errMsg || '')) {
          this.captureFailure = '认证失败'
          if (e.retry) this.identity = { ...this.identity, retry: e.retry }
          if (stage === 'challenge') await this.refresh()
        }
      }
      finally { this.capturing = false }
    },
    async submit(fields) {
      if (this.pageClosed || this.busy || this.processing || this.retryBlocked || !this.photo || !this.photoUsable || !this.challenge || !this.valid()) return
      this.identityVersion = (this.identityVersion || 0) + 1
      this.submitting = true; this.error = ''
      const challengeId = this.challenge.id
      try {
        const result = await submitIdentity({ challengeId, consentVersion: this.challenge.consentVersion, ...fields }, this.photo)
        if (this.pageClosed) return
        this.identityVersion = (this.identityVersion || 0) + 1
        this.identity = { ...this.identity, ...(result.identity || {}), verified: result.verified,
          retry: result.retry || this.identity.retry,
          attempt: { id: challengeId, state: result.status, finalFailure: result.finalFailure === true } }
        if (result.verified) { this.captureFailure = ''; this.name = ''; this.number = '' }
        if (result.status === 'processing' && this.pageVisible) this.pollTimer = setTimeout(() => this.refresh(), 3000)
      } catch (e) {
        if (!this.pageClosed) {
          if (e.retry) this.identity = { ...this.identity, retry: e.retry }
          await this.refresh()
          if (!this.identity.verified && this.identity.attempt?.id !== challengeId) {
            this.identity = { ...this.identity, attempt: { id: challengeId, state: 'unknown' } }
          }
          if (!this.identity.verified && this.identity.attempt?.state !== 'failed' && this.identity.attempt?.state !== 'processing') {
            this.error = '认证结果尚未确认，请刷新认证状态。'
          }
        }
      }
      finally { this.clearPhoto(); this.challenge = null; this.submitting = false }
    }
  }
}
</script>
<style scoped>
.recycle-primary.identity-start.is-disabled { background: var(--workbench-line); color: var(--workbench-muted); opacity: 1; }
.identity-field-error { display: block; margin-top: 10rpx; color: #b42318; font-size: 24rpx; line-height: 1.6; }
.identity-field-error.is-dark { color: #ffb4ab; }
.identity-age-note, .identity-name-note { display: block; margin-top: 12rpx; font-size: 23rpx; }
.identity-intro { padding: 8rpx 0 28rpx; }
.identity-title { display: block; color: var(--workbench-text); font-size: 36rpx; font-weight: 700; margin-bottom: 12rpx; }
.identity-failure { margin-top: 24rpx; padding: 40rpx 28rpx; text-align: center; background: var(--workbench-soft); border-radius: 24rpx; }
.identity-failure-icon { display: inline-block; width: 68rpx; height: 68rpx; line-height: 68rpx; border-radius: 50%; background: #fff0e8; color: #bd572c; font-size: 42rpx; font-weight: 700; }
.identity-retry-copy { display: block; margin: 0 0 28rpx; color: var(--workbench-muted); font-size: 26rpx; line-height: 1.6; }
.identity-failure-title { display: block; margin: 20rpx 0 28rpx; color: var(--workbench-text); font-size: 34rpx; font-weight: 700; }
.identity-result { padding: 50rpx 12rpx; text-align: center; }
.identity-check { display: block; color: var(--workbench-green); font-size: 80rpx; margin-bottom: 28rpx; }
.identity-notice, .identity-disclosure { border-left: 4rpx solid var(--workbench-green); background: var(--workbench-soft); padding: 16rpx 22rpx; margin: 12rpx 0; border-radius: 0 14rpx 14rpx 0; }
.identity-steps { display: flex; justify-content: space-between; gap: 12rpx; padding: 24rpx 0; color: var(--workbench-green); font-size: 23rpx; border-bottom: 1rpx solid var(--workbench-line); }
.identity-consent { display: flex; align-items: flex-start; gap: 12rpx; margin-top: 28rpx; font-size: 24rpx; }
.identity-consent checkbox-group { flex: 1; min-width: 0; }
.identity-consent label { display: flex; align-items: flex-start; gap: 6rpx; }
.identity-consent checkbox { transform: scale(.85); transform-origin: left top; flex-shrink: 0; }
.identity-link { padding: 0; margin: 0; background: transparent; color: var(--workbench-green); font-size: 24rpx; line-height: 1.7; flex-shrink: 0; }
.identity-link::after { border: 0; }
.identity-disclosure .recycle-copy { font-size: 23rpx; }
.identity-capture { padding: 26rpx 0; margin-top: 20rpx; border-top: 1rpx solid var(--workbench-line); }
.identity-assist { display: flex; align-items: center; gap: 16rpx; margin-top: 22rpx; font-size: 25rpx; }
.identity-assist .recycle-muted { display: block; margin-top: 6rpx; font-size: 22rpx; }
.refresh-status { margin: 24rpx auto; }
</style>
