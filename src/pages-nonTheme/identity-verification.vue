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
      <view v-else-if="identity.attempt?.state === 'unknown'" class="identity-notice"><text class="recycle-copy">上次认证未取得最终结果，请先刷新状态。如仍无结果，可稍后重新拍摄认证。</text></view>
      <view v-else-if="identity.attempt?.state === 'failed'" class="identity-notice"><text class="recycle-copy">{{ failureHint }}</text></view>
      <view v-if="!identity.available" class="identity-notice"><text class="recycle-copy">认证服务暂不可用，请稍后重试或联系平台。</text></view>
      <!-- #ifndef H5 || APP-PLUS || MP-WEIXIN -->
      <view class="identity-notice"><text class="recycle-heading">在安全网页完成动作认证</text><text class="recycle-copy">按随机顺序眨眼、张嘴后自动拍摄，不支持跳过。认证绑定当前账号，无需在浏览器重新登录。</text><text class="recycle-muted">请本人使用链接，勿转发。链接10分钟有效；完成后返回本页刷新状态。</text></view>
      <button class="recycle-primary" :disabled="openingWeb || processing || !identity.available" @click="openWebVerification">{{ openingWeb ? '正在准备…' : '前往网页认证' }}</button>
      <button v-if="handoffUrl" class="recycle-secondary" @click="copyWebLink">复制认证链接</button>
      <text v-if="webLinkReady" class="recycle-muted">链接已复制。若未自动打开，请粘贴到系统浏览器访问。</text>
      <!-- #endif -->
      <template v-if="!handoffFailed">
      <view class="identity-steps"><text>01 填写身份</text><text>02 人脸核验</text><text>03 确认核验</text></view>
      <text class="recycle-label">本人姓名</text><input class="recycle-input" v-model="name" maxlength="50" placeholder="与身份证一致的姓名" :disabled="busy" />
      <text class="recycle-label">身份证号码</text><input class="recycle-input" v-model="number" type="idcard" maxlength="18" placeholder="18位居民身份证号码" :disabled="busy" />
      <view class="identity-consent">
        <checkbox-group @change="consented = $event.detail.value.includes('agree')"><label><checkbox value="agree" :checked="consented" :disabled="busy" color="#059669" /><text>我已阅读并同意实名核验说明</text></label></checkbox-group>
        <button class="identity-link" @click="showConsent = !showConsent">{{ showConsent ? '收起说明' : '查看说明' }}</button>
      </view>
      <view v-if="showConsent" class="identity-disclosure"><text class="recycle-copy">为核验当前申请人身份，你同意将本人姓名、身份证号码和现场拍摄照片提供给北京互联三六五科技有限公司，用于身份核验。认证通过后，平台将保存你的完整姓名、身份证号码及本次现场照片，用于账号身份管理和必要核查。</text><text class="recycle-copy">请由证件本人完成检测动作。你可以随时取消，完成实名认证后才能申请成为回收员。</text></view>
      <view class="identity-capture">
        <image v-if="preview" :src="preview" class="identity-preview" mode="aspectFit" />
        <text v-else class="recycle-muted">请本人独自入镜，保持光线充足，摘下口罩及遮挡物。仅支持现场拍摄。</text>
        <view class="identity-assist"><view><text>按提示完成检测动作</text><text class="recycle-muted">眨眼、张嘴后自动拍摄，请保持网络畅通。</text></view></view>
        <button class="recycle-secondary" :disabled="busy || processing || !identity.available" @click="capture">{{ capturing ? '拍摄中…' : photo ? '重新拍摄' : '开始现场拍摄' }}</button>
      </view>
      <text class="identity-footnote recycle-muted">请使用本人身份信息和现场照片，提交后可在本页查看认证结果。</text>
      <button class="recycle-primary" :disabled="busy || processing || !identity.available || !photo || !consented" @click="submit">{{ submitting ? '正在核验…' : '确认并开始认证' }}</button>
      </template>
      <button class="identity-link refresh-status" :disabled="busy" @click="refresh">刷新认证状态</button>
    </template>
  </RecyclingShell>
</template>
<script>
import RecyclingShell from './components/RecyclingShell.vue'
import { identityStatus, identityChallenge, submitIdentity, createIdentityWebSession, exchangeIdentityWebSession, identityWebContext, clearIdentityWebSession } from '@/api/identity.js'
import { baseUrl } from '@/api/settings.js'
import { captureIdentityPhoto, cancelIdentityCapture, discardIdentityPhoto } from '@/utils/identity-capture.js'
import { recycleBack } from './api/recycling.js'
export default {
  components: { RecyclingShell },
  data: () => ({ isDark: false, identity: {}, loading: true, error: '', name: '', number: '', consented: false,
    showConsent: true, photo: null, preview: '', challenge: null, capturing: false, submitting: false,
    openingWeb: false, webLinkReady: false, handoffUrl: '', webHandoff: false, handoffAccount: '', handoffLoading: false, handoffFailed: false }),
  computed: {
    busy() { return this.capturing || this.submitting },
    processing() { return this.identity.attempt?.state === 'processing' },
    failureHint() { return ({ '-1': '姓名与身份证不一致，请核对后重新认证。', '-2': '未查到身份证记录，请核对信息。', '-3': '缺少可比对的基准照片，请联系平台。', 2: '比对结果不确定，请在光线充足处重新拍摄。', 3: '人脸比对未通过，请由证件本人重新拍摄。', 4: '未检测到清晰人脸，请重新拍摄。', 5: '活体核验未通过，请使用本人现场拍摄照片。', 6: '画面中有多张人脸，请独自入镜。', 7: '服务商人脸比对未完成，请稍后重试。' })[this.identity.attempt?.resultCode] || '上次认证未通过，请核对信息并重新拍摄，或稍后再试。' }
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
      catch (e) { if (!this.pageClosed) { this.handoffFailed = true; this.error = e.message } }
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
      if (this.openingWeb) return
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
      } catch (e) { this.error = e.message || '无法打开认证网页，请稍后重试' }
      finally { this.openingWeb = false }
    },
    clearPhoto() {
      // #ifdef H5
      if (this.preview) URL.revokeObjectURL(this.preview)
      // #endif
      discardIdentityPhoto(this.photo)
      this.photo = null; this.preview = ''
    },
    async refresh() {
      if (this.handoffLoading || this.handoffFailed) return
      clearTimeout(this.pollTimer)
      try {
        const identity = await identityStatus()
        if (this.pageClosed) return
        this.identity = identity; this.error = ''
        if (identity.verified) { this.clearPhoto(); this.name = ''; this.number = '' }
        if (identity.attempt?.state === 'processing' && this.pageVisible) this.pollTimer = setTimeout(() => this.refresh(), 3000)
      } catch (e) { if (!this.pageClosed) this.error = e.message || '认证状态获取失败' }
      finally { if (!this.pageClosed) this.loading = false }
    },
    valid() {
      if (!this.name.trim() || !/^[1-9]\d{16}[\dXx]$/.test(this.number.trim())) { this.error = '请填写本人姓名和18位身份证号码'; return false }
      if (!this.consented) { this.error = '请先阅读并同意实名核验说明'; return false }
      return true
    },
    async capture() {
      if (this.busy || this.processing || !this.valid()) return
      this.capturing = true; this.error = ''
      try {
        const challenge = await identityChallenge()
        if (this.pageClosed) return
        if (challenge.alreadyVerified) { await this.refresh(); return }
        this.challenge = challenge
        const photo = await captureIdentityPhoto({ actions: challenge.actions })
        if (this.pageClosed) { discardIdentityPhoto(photo); return }
        this.clearPhoto(); this.photo = photo
        // #ifdef H5
        this.preview = URL.createObjectURL(photo.file)
        // #endif
        // #ifndef H5
        this.preview = photo.path
        // #endif
      } catch (e) { if (!e.cancelled && !/cancel/i.test(e.errMsg || '')) this.error = e.message || '拍摄未完成，请检查相机权限' }
      finally { this.capturing = false }
    },
    async submit() {
      if (this.busy || this.processing || !this.photo || !this.challenge || !this.valid()) return
      this.submitting = true; this.error = ''
      try {
        await submitIdentity({ challengeId: this.challenge.id, consentVersion: this.challenge.consentVersion,
          name: this.name.trim(), number: this.number.trim().toUpperCase() }, this.photo)
        this.clearPhoto(); this.challenge = null
        await this.refresh()
      } catch (e) { await this.refresh(); this.error = this.identity.verified ? '' : e.message || '认证未完成，请刷新结果' }
      finally { this.submitting = false }
    }
  }
}
</script>
<style scoped>
.identity-intro { padding: 8rpx 0 28rpx; }
.identity-title { display: block; color: var(--workbench-text); font-size: 36rpx; font-weight: 700; margin-bottom: 12rpx; }
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
.identity-preview { display: block; width: 100%; height: 360rpx; border-radius: 18rpx; background: var(--workbench-soft); }
.identity-assist { display: flex; align-items: center; gap: 16rpx; margin-top: 22rpx; font-size: 25rpx; }
.identity-assist .recycle-muted { display: block; margin-top: 6rpx; font-size: 22rpx; }
.identity-footnote { display: block; font-size: 22rpx; }
.refresh-status { margin: 24rpx auto; }
</style>
