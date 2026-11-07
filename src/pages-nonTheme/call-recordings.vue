<template>
  <view class="recordings-page" :class="{ dark: darkTheme }">
    <view class="heading"><view class="back" @click="back"><ManifestIcon id="back" /></view><text>通话录音</text></view>
    <text v-if="loading" class="notice">正在读取录音…</text>
    <view v-else-if="!admin" class="empty">{{ error || '仅管理员可使用通话录音' }}</view>
    <template v-else>
      <view class="panel preference">
        <view class="preference-copy"><text class="title">接通后自动录音</text><text class="sub">语音和视频通话均只录制声音，可在通话中随时停止</text></view>
        <switch :checked="automatic" :disabled="!supported" color="#16835e" @change="setAutomatic" />
      </view>
      <text class="notice">{{ platformNote }}</text>
      <text v-if="!supported" class="notice">当前环境不支持录音，请更新安装包或使用支持录音的浏览器。</text>
      <view class="list-heading"><text>本地录音 · {{ rows.length }} 条</text><view class="text-button" @click="refreshFiles">{{ miniProgram ? '同步目录' : '刷新' }}</view></view>
      <text v-if="error" class="error">{{ error }}</text>
      <view v-if="!rows.length" class="panel empty">还没有通话录音</view>
      <view v-for="row in rows" :key="row.id" class="panel recording">
        <view class="recording-heading"><ManifestIcon id="chat_voice_text" size="42rpx" /><text class="recording-name">{{ row.name }}</text></view>
        <text class="sub">{{ row.peerName }} · {{ row.mode === 'video' ? '视频通话' : '语音通话' }}</text>
        <text class="sub">{{ dateLabel(row.createdAt) }} · {{ durationLabel(row.durationMs) }} · {{ sizeLabel(row.size) }}</text>
        <text v-if="row.status !== 'saved'" class="notice">{{ row.status === 'recording' ? '正在录制，结束后可播放' : '上次录制意外中断，文件未完整保存' }}</text>
        <view class="file-actions">
          <button v-if="row.status === 'saved'" @click="play(row)">{{ playingId === row.id ? '停止播放' : '播放' }}</button>
          <button v-if="row.status === 'saved'" @click="exportFile(row)">导出</button>
          <button v-if="row.status !== 'recording'" @click="rename(row)">重命名</button>
          <button v-if="row.status !== 'recording'" class="delete" @click="remove(row)">删除</button>
        </view>
      </view>
      <view v-if="showRename" class="modal-mask" @click="showRename = false"><view class="rename-dialog" @click.stop>
        <text class="title">重命名录音</text><input v-model="renameValue" maxlength="80" placeholder="录音名称" />
        <view class="dialog-actions"><button @click="showRename = false">取消</button><button class="primary" @click="saveRename">保存</button></view>
      </view></view>
    </template>
  </view>
</template>
<script>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { ThemeManager } from '@/utils/theme.js'
import { recordingIdentity, readRecordingAuto, writeRecordingAuto } from '@/utils/call-recording-preference.mjs'
import { canRecordCalls, listCallRecordings, recordingFileAction, openWebRecordingManager, syncNativeRecordingConfiguration } from '@/utils/call-recordings.js'
export default {
  components: { ManifestIcon },
  data: () => ({ admin: false, automatic: false, supported: false, miniProgram: false, loading: true, rows: [], error: '',
    darkTheme: ThemeManager.getTheme() === 'dark', playingId: '', showRename: false, renameValue: '', renameRow: null,
    audio: null, releaseAudioUrl: null, disposed: false, refreshing: false, changedListener: null, playbackRevision: 0 }),
  computed: {
    platformNote() { return this.miniProgram ? '目录显示此微信内嵌网页保存的录音。播放、导出和文件操作会打开网页；切换设备不会同步。' : '录音仅保存在当前设备或浏览器，不上传服务器。清理网页数据或卸载应用可能删除录音，请及时导出。' }
  },
  onLoad() {
    // #ifdef MP-WEIXIN
    this.miniProgram = true
    // #endif
    this.changedListener = () => { void this.load() }
    uni.$on('call-recordings:changed', this.changedListener)
    void this.load()
  },
  onShow() { if (!this.loading) void this.load() },
  onHide() { this.stopPlaying() },
  onUnload() {
    this.disposed = true
    this.stopPlaying()
    if (this.changedListener) uni.$off('call-recordings:changed', this.changedListener)
  },
  methods: {
    async load() {
      if (this.disposed || this.refreshing) return
      this.refreshing = true
      const identity = recordingIdentity(), token = uni.getStorageSync('token')
      this.admin = identity.admin; this.automatic = readRecordingAuto(); this.supported = canRecordCalls()
      try {
        const rows = this.admin ? await listCallRecordings() : []
        if (!this.disposed && token === uni.getStorageSync('token')) this.rows = rows
        else { this.rows = []; this.admin = false; this.stopPlaying() }
      } catch (error) { this.error = error.message; this.rows = [] }
      finally { this.loading = false; this.refreshing = false }
    },
    setAutomatic(event) { this.automatic = writeRecordingAuto(event.detail.value); syncNativeRecordingConfiguration() },
    async refreshFiles() {
      if (this.miniProgram) { try { await openWebRecordingManager() } catch (error) { this.error = error.message } }
      else { this.error = ''; await this.load() }
    },
    stopPlaying() {
      this.playbackRevision++
      if (this.audio) { this.audio.stop(); this.audio.destroy(); this.audio = null }
      this.releaseAudioUrl?.()
      this.releaseAudioUrl = null
      this.playingId = ''
    },
    async play(row) {
      if (this.playingId === row.id) { this.stopPlaying(); return }
      this.stopPlaying(); this.error = ''
      const token = uni.getStorageSync('token')
      const revision = this.playbackRevision
      try {
        const file = await recordingFileAction('file', row)
        if (file.delegated) return
        if (this.disposed || revision !== this.playbackRevision || token !== uni.getStorageSync('token')) { file.revoke?.(); return }
        this.releaseAudioUrl = file.revoke; this.audio = uni.createInnerAudioContext(); this.audio.src = file.path
        this.playingId = row.id
        this.audio.onEnded(() => this.stopPlaying())
        this.audio.onError(() => { this.error = '录音播放失败，请尝试导出后播放'; this.stopPlaying() })
        this.audio.play()
      } catch (error) { this.error = error.message }
    },
    async exportFile(row) {
      this.error = ''
      try { const result = await recordingFileAction('export', row); if (result.exported) uni.showToast({ title: result.path ? '已导出到下载目录' : '已请求保存文件', icon: 'none' }) }
      catch (error) { this.error = error.message }
    },
    async openMiniFile(row) {
      this.error = ''
      try { await openWebRecordingManager(row.id) } catch (error) { this.error = error.message }
    },
    rename(row) {
      if (this.miniProgram) { void this.openMiniFile(row); return }
      this.renameRow = row; this.renameValue = row.name; this.showRename = true
    },
    async saveRename() {
      if (!this.renameValue.trim()) return
      try { await recordingFileAction('rename', this.renameRow, this.renameValue); this.showRename = false; await this.load() }
      catch (error) { this.error = error.message }
    },
    remove(row) {
      if (this.miniProgram) { void this.openMiniFile(row); return }
      uni.showModal({ title: '删除录音', content: `确定删除“${row.name}”？删除后无法恢复。`, success: async result => {
        if (!result.confirm || this.disposed) return
        try { this.stopPlaying(); await recordingFileAction('delete', row); await this.load() } catch (error) { this.error = error.message }
      } })
    },
    dateLabel(value) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` },
    durationLabel(value) { const seconds = Math.floor(value / 1000); return `${Math.floor(seconds / 60)}分${seconds % 60}秒` },
    sizeLabel(bytes) { return bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB` },
    back() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.redirectTo({ url: '/pages-nonTheme/settings' }) }
  }
}
</script>
<style scoped>
.recordings-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: calc(var(--status-bar-height,0px) + 24rpx) 28rpx 60rpx;
  background: #f3f6f4;
  color: #243730;
}
.heading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 34rpx;
  font-weight: 600;
  margin-bottom: 30rpx;
}
.back {
  width: 64rpx;
  display: flex;
  justify-content: center;
}
.panel {
  padding: 28rpx;
  border: 1px solid #e0e8e2;
  border-radius: 20rpx;
  background: #fff;
}
.preference {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.preference-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 12rpx;
}
.title {
  font-size: 30rpx;
  font-weight: 600;
}
.sub {
  display: block;
  font-size: 24rpx;
  line-height: 1.7;
  color: #718178;
}
.notice {
  display: block;
  font-size: 24rpx;
  line-height: 1.7;
  color: #718178;
  margin: 18rpx 4rpx;
}
.list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 38rpx 4rpx 18rpx;
  font-size: 28rpx;
}
.text-button {
  color: #16835e;
  padding: 10rpx;
}
.empty {
  text-align: center;
  padding: 70rpx 24rpx;
  color: #718178;
}
.recording {
  margin-bottom: 18rpx;
}
.recording-heading {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 12rpx;
}
.recording-name {
  font-size: 29rpx;
  font-weight: 600;
  word-break: break-all;
  flex: 1;
  min-width: 0;
}
.file-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 22rpx;
  border-top: 1px solid #edf1ee;
  padding-top: 20rpx;
}
.file-actions button {
  margin: 0;
  padding: 0 20rpx;
  font-size: 24rpx;
  line-height: 2.4;
  border-radius: 10rpx;
  color: #26704e;
  background: #edf5ef;
}
.file-actions .delete {
  color: #a94d49;
  background: #fbefed;
}
button::after {
  border: 0;
}
.error {
  display: block;
  margin: 18rpx 4rpx;
  color: #b25247;
  font-size: 25rpx;
  line-height: 1.7;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.rename-dialog {
  width: 80%;
  max-width: 600rpx;
  box-sizing: border-box;
  background: #fff;
  padding: 32rpx;
  border-radius: 20rpx;
}
.rename-dialog input {
  background: #f1f5f2;
  margin: 26rpx 0;
  padding: 18rpx;
  border-radius: 10rpx;
  font-size: 28rpx;
}
.dialog-actions {
  display: flex;
  gap: 16rpx;
}
.dialog-actions button {
  flex: 1;
  font-size: 28rpx;
  background: #edf1ee;
}
.dialog-actions .primary {
  background: #16835e;
  color: #fff;
}
.dark {
  background: #17231f;
  color: #e5eee8;
}
.dark .panel,.dark .rename-dialog {
  background: #24352c;
  border-color: #3b4e42;
}
.dark .sub,.dark .notice,.dark .empty {
  color: #a7b7ac;
}
.dark .file-actions {
  border-color: #3b4e42;
}
.dark .file-actions button,.dark .rename-dialog input {
  background: #31483a;
  color: #d8eade;
}
.dark .file-actions .delete {
  background: #4a302e;
  color: #f2bab2;
}
</style>
