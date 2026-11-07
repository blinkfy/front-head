<template>
  <view class="web-call-entry">
    <text class="title">{{ target?.mode === 'video' ? '视频通话' : '语音通话' }}</text>
    <text class="peer">{{ target?.name || '联系人' }}</text>
    <text class="hint">{{ hint }}</text>
    <button v-if="target && !accountMatches && !loggingIn" @click="login">{{ hasLogin ? '切换登录账号' : '登录后继续' }}</button>
    <button v-else-if="target" :disabled="loggingIn || (!ready && !busy)" @click="start">{{ loggingIn ? '正在登录' : busy ? '返回当前通话' : '发起通话' }}</button>
    <button v-if="target && accountMatches && !loggingIn" class="secondary" @click="login">重新登录</button>
    <text class="note">保持此网页打开以接收来电。切后台或锁屏是否继续运行，取决于微信和系统。返回小程序前请先挂断。</text>
  </view>
</template>
<script>
import { voiceCalls, voiceCallState } from '@/utils/voice-call.js'
import { WEB_CALL_RETURN_KEY, webCallTarget, redeemWebCallTicket, stripWebCallTicket } from '@/utils/web-call-entry.mjs'
import { baseUrl } from '@/api/settings.js'
export default {
  data: () => ({ target: null, hasLogin: false, accountMatches: false, loggingIn: false, entryClosed: false, state: voiceCallState }),
  computed: {
    ready() { return this.target?.mode === 'video' ? this.state.videoSupported : this.state.supported },
    busy() { return ['calling', 'incoming', 'connecting', 'connected'].includes(this.state.phase) },
    hint() {
      if (!this.target) return '通话入口无效，请返回小程序重新打开'
      if (this.loggingIn) return '正在使用小程序账号登录…'
      if (!this.hasLogin) return '请登录与小程序相同的账号，登录后会返回这里'
      if (!this.accountMatches) return '当前网页账号与小程序账号不同，请切换到同一账号'
      return this.ready ? '点击发起，向联系人发送通话邀请' : '正在连接通话服务；若持续不可用，请检查网络、网页版本和设备权限'
    }
  },
  onLoad(options) {
    this.target = webCallTarget(options)
    // #ifdef H5
    const ticket = options?.ticket || ''
    window.history.replaceState(window.history.state, '', stripWebCallTicket(window.location.href))
    if (this.target && ticket) this.autoLogin(ticket)
    // #endif
  },
  onShow() { this.refreshAccount() },
  onUnload() { this.entryClosed = true },
  methods: {
    refreshAccount() {
      const user = uni.getStorageSync('userInfo') || {}
      this.hasLogin = !!uni.getStorageSync('token')
      this.accountMatches = this.hasLogin && String(user.id || user.userId || user.user?.id || user.data?.id || '') === this.target?.selfId
      if (this.accountMatches) uni.removeStorageSync(WEB_CALL_RETURN_KEY)
    },
    async autoLogin(ticket) {
      this.loggingIn = true
      const originalToken = uni.getStorageSync('token') || ''
      try {
        const result = await redeemWebCallTicket(uni, baseUrl, ticket, this.target.selfId)
        if (this.entryClosed || (uni.getStorageSync('token') || '') !== originalToken) return
        uni.setStorageSync('userInfo', result.userInfo)
        if (result.userInfo.isAdmin === true) uni.setStorageSync('isAdmin', true)
        else uni.removeStorageSync('isAdmin')
        uni.removeStorageSync('guestMode')
        uni.setStorageSync('token', result.token)
      } catch (_) { /* Manual login remains available, including with older backends. */ }
      finally { this.loggingIn = false; if (!this.entryClosed) this.refreshAccount() }
    },
    login() {
      if (!this.target || this.loggingIn) return
      uni.setStorageSync(WEB_CALL_RETURN_KEY, { target: this.target, at: Date.now() })
      const dark = uni.getStorageSync('app_theme') === 'dark'
      uni.navigateTo({ url: (dark ? '/pages-dark/index/index' : '/pages/index/index') + '?manualLogin=1' })
    },
    start() {
      if (!this.accountMatches || this.loggingIn) return
      if (this.busy) { uni.navigateTo({ url: '/pages-nonTheme/voice-call' }); return }
      try { voiceCalls.start({ id: this.target.peerId, name: this.target.name }, this.target.mode) }
      catch (error) { uni.showToast({ title: error.message || '暂时无法发起通话', icon: 'none' }) }
    }
  }
}
</script>
<style scoped>
.web-call-entry{min-height:100vh;padding:100px 24px 40px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;text-align:center;background:#f3f7f4;color:#263c30}.title{font-size:18px}.peer{font-size:28px;font-weight:600}.hint{line-height:1.7;color:#566d5e}.note{font-size:13px;line-height:1.7;color:#738378}button{width:100%;max-width:360px;background:#16835e;color:white;border-radius:10px;font-size:16px}button[disabled]{opacity:.5}.secondary{background:#e3ece6;color:#365641}
</style>
