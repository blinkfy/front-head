<template>
  <view class="recordings-page" :class="{ dark: darkTheme, 'selection-mode': selecting }">
    <view class="heading"><button class="back icon-button" aria-label="返回" @click="back"><ManifestIcon id="back" /></button><text>{{ selecting ? '已选 ' + selectedIds.length + ' 条' : '通话录音' }}</text>
      <button v-if="selecting" class="text-button heading-action" :disabled="deleting" @click="exitSelection">完成</button>
    </view>
    <text v-if="loading" class="notice">正在读取录音…</text>
    <view v-else-if="!admin" class="empty">{{ error || '仅管理员可使用通话录音' }}</view>
    <template v-else>
      <view class="panel preference">
        <view class="preference-copy"><text class="title">接通后自动录音</text><text class="sub">语音和视频通话均只录制声音，可在通话中随时停止</text></view>
        <switch :checked="automatic" :disabled="!supported" color="#16835e" @change="setAutomatic" />
      </view>
      <text class="notice">{{ platformNote }}</text>
      <text v-if="!supported" class="notice">当前环境不支持录音，请更新安装包或使用支持录音的浏览器。</text>
      <view class="list-heading"><text>{{ callId ? '本次通话录音' : '本地录音' }} · {{ visibleRows.length }} 条</text>
        <view class="list-toolbar">
          <button class="text-button" :disabled="deleting" @click="refreshFiles">{{ miniProgram ? '同步目录' : '刷新' }}</button>
          <button v-if="miniProgram" class="text-button" @click="refreshFiles">管理</button>
          <button v-else-if="selectableRows.length && !selecting" class="text-button" @click="startSelection">选择</button>
        </view>
      </view>
      <view class="panel list-tools">
        <input class="recording-search" v-model="query" placeholder="搜索录音名称或联系人" @input="selectedIds = []" />
        <button v-if="query" class="clear-search icon-button" aria-label="清除搜索" @click="query = ''; selectedIds = []">×</button>
        <button v-if="callId" class="text-button" @click="callId = ''; selectedIds = []">查看全部</button>
      </view>
      <text v-if="error" class="error">{{ error }}</text>
      <view v-if="!visibleRows.length" class="panel empty">{{ query || callId ? '没有匹配的录音' : '还没有通话录音' }}</view>
      <view v-for="row in visibleRows" :key="row.id" class="panel recording" :class="{ 'recording-selected': selectedIds.includes(row.id), 'recording-playing': playingId === row.id }" @click="toggleSelection(row)">
        <view class="recording-heading">
          <button v-if="selecting && row.status !== 'recording'" class="selection-check icon-button" :class="{ checked: selectedIds.includes(row.id) }"
            role="checkbox" :disabled="deleting" :aria-checked="selectedIds.includes(row.id)" :aria-label="'选择' + row.name" @click.stop="toggleSelection(row)"><text v-if="selectedIds.includes(row.id)">✓</text></button>
          <view class="recording-copy">
            <text class="recording-name">{{ row.name }}</text>
            <text class="sub">{{ row.peerName }} · {{ row.mode === 'video' ? '视频通话' : '语音通话' }}</text>
          </view>
          <button v-if="!selecting && row.status !== 'recording'" class="more-button icon-button" :aria-label="'更多操作 · ' + row.name" @click.stop="showFileActions(row)">
            <view class="more-dots" aria-hidden="true"><view v-for="dot in 3" :key="dot" class="more-dot"></view></view>
          </button>
        </view>
        <text class="sub recording-meta">{{ dateLabel(row.createdAt) }} · {{ sizeLabel(row.size) }}</text>
        <text v-if="row.status !== 'saved'" class="notice">{{ row.status === 'recording' ? '正在录制，结束后可播放' : row.size > 0 ? '录制意外中断，已保留部分声音，可尝试播放或导出' : '录制中断，没有收到可保存的声音' }}</text>
        <view v-if="!selecting && recordingPlayable(row)" class="playback" @click.stop>
          <button class="play-button icon-button" :disabled="playingId === row.id && !playbackReady"
            :aria-label="playingId !== row.id ? '播放' : !playbackReady ? '加载中' : playbackPlaying ? '暂停' : '继续播放'" @click="play(row)">
            <view v-if="playingId === row.id && !playbackReady" class="play-loading"></view>
            <view v-else-if="playingId === row.id && playbackPlaying" class="pause-symbol"></view>
            <view v-else class="play-symbol"></view>
          </button>
          <view v-if="playingId === row.id" class="playback-track">
            <slider :min="0" :max="Math.max(1, playbackDuration)" :value="dragPosition ?? playbackPosition" :disabled="!playbackReady" activeColor="#16835e" :block-size="16" @changing="dragPosition = $event.detail.value" @change="seekPlayback" />
            <view class="playback-times"><text>{{ timeLabel(dragPosition ?? playbackPosition) }}</text><text>{{ timeLabel(playbackDuration) }}</text></view>
          </view>
          <view v-else class="playback-summary"><text>{{ timeLabel(row.durationMs) }}</text><text class="sub">{{ miniProgram ? '打开录音播放' : '点击播放' }}</text></view>
        </view>
        <text v-if="selecting" class="sub selection-duration">{{ timeLabel(row.durationMs) }}</text>
      </view>
      <view v-if="selecting" class="selection-bar">
        <button class="text-button" :disabled="deleting || !selectableRows.length" @click="selectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        <button class="delete" :disabled="!selectedIds.length || deleting" @click="removeSelected">{{ deleting ? '正在删除…' : selectedIds.length ? '删除（' + selectedIds.length + '）' : '删除' }}</button>
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
import { recordingIdentity, readRecordingAuto, writeRecordingAuto, validRecordingCallId, matchesRecording, recordingPlayable } from '@/utils/call-recording-preference.mjs'
import { canRecordCalls, listCallRecordings, recordingFileAction, deleteCallRecordings, openWebRecordingManager, syncNativeRecordingConfiguration, createRecordingPlayer } from '@/utils/call-recordings.js'
export default {
  components: { ManifestIcon },
  data: () => ({ admin: false, automatic: false, supported: false, miniProgram: false, loading: true, rows: [], error: '',
    darkTheme: ThemeManager.getTheme() === 'dark', playingId: '', showRename: false, renameValue: '', renameRow: null,
    callId: '', query: '', selecting: false, selectedIds: [], deleting: false,
    player: null, playbackReady: false, playbackPlaying: false, playbackPosition: 0, playbackDuration: 0, dragPosition: null,
    owner: '', disposed: false, loadRevision: 0, changedListener: null, playbackRevision: 0 }),
  computed: {
    platformNote() { return this.miniProgram ? '目录显示此微信内嵌网页保存的录音。播放、导出和文件操作会打开网页；切换设备不会同步。' : '录音仅保存在当前设备或浏览器，不上传服务器。清理网页数据或卸载应用可能删除录音，请及时导出。' },
    visibleRows() { return this.rows.filter(row => (!this.callId || row.callId === this.callId) && matchesRecording(row, this.query)) },
    selectableRows() { return this.visibleRows.filter(row => row.status !== 'recording') },
    allSelected() { return this.selectableRows.length > 0 && this.selectableRows.every(row => this.selectedIds.includes(row.id)) }
  },
  watch: {
    visibleRows(rows) { if (this.playingId && !rows.some(row => row.id === this.playingId)) this.stopPlaying() }
  },
  onLoad(options) {
    if (validRecordingCallId(options?.callId)) this.callId = options.callId
    // #ifdef MP-WEIXIN
    this.miniProgram = true
    // #endif
    this.changedListener = () => { if (!this.deleting) void this.load() }
    uni.$on('call-recordings:changed', this.changedListener)
    void this.load()
  },
  onShow() { if (!this.loading) void this.load() },
  onHide() { this.stopPlaying() },
  onBackPress() { if (this.selecting) { this.exitSelection(); return true } return this.deleting },
  onUnload() {
    this.disposed = true
    this.stopPlaying()
    if (this.changedListener) uni.$off('call-recordings:changed', this.changedListener)
  },
  methods: {
    recordingPlayable,
    startSelection() { this.stopPlaying(); this.selectedIds = []; this.selecting = true },
    exitSelection() { if (!this.deleting) { this.selecting = false; this.selectedIds = [] } },
    toggleSelection(row) {
      if (this.selecting && !this.deleting && row.status !== 'recording') this.selectRow(row.id, !this.selectedIds.includes(row.id))
    },
    showFileActions(row) {
      if (this.miniProgram) { void this.openMiniFile(row); return }
      const owner = this.owner, token = uni.getStorageSync('token')
      const actions = [{ label: '重命名', run: () => this.rename(row) }]
      if (recordingPlayable(row)) actions.push({ label: '导出录音', run: () => this.exportFile(row) })
      if (this.playingId === row.id) actions.push({ label: '停止播放', run: () => this.stopPlaying() })
      actions.push({ label: '选择录音', run: () => { this.startSelection(); this.selectRow(row.id, true) } },
        { label: '删除录音', run: () => this.remove(row) })
      uni.showActionSheet({ itemList: actions.map(action => action.label), success: result => {
        if (!this.disposed && owner === recordingIdentity().owner && token === uni.getStorageSync('token') && this.rows.some(item => item.id === row.id)) actions[result.tapIndex]?.run()
      } })
    },
    async load() {
      if (this.disposed) return
      const revision = ++this.loadRevision
      const identity = recordingIdentity(), token = uni.getStorageSync('token')
      if (!identity.admin || identity.owner !== this.owner) {
        this.rows = []; this.selectedIds = []; this.showRename = false; this.stopPlaying()
      }
      this.owner = identity.admin ? identity.owner : ''
      this.admin = identity.admin; this.automatic = readRecordingAuto(); this.supported = canRecordCalls()
      try {
        const rows = this.admin ? await listCallRecordings() : []
        if (this.disposed || revision !== this.loadRevision) return
        const current = recordingIdentity()
        if (token === uni.getStorageSync('token') && identity.owner === current.owner && identity.admin === current.admin) {
          this.rows = rows
          this.selectedIds = this.selectedIds.filter(id => rows.some(row => row.id === id && row.status !== 'recording'))
          if (this.playingId && !rows.some(row => row.id === this.playingId)) this.stopPlaying()
        } else { this.rows = []; this.admin = false; this.stopPlaying() }
      } catch (error) { if (!this.disposed && revision === this.loadRevision) { this.error = error.message; this.rows = [] } }
      finally { if (revision === this.loadRevision) this.loading = false }
    },
    setAutomatic(event) { this.automatic = writeRecordingAuto(event.detail.value); syncNativeRecordingConfiguration() },
    async refreshFiles() {
      if (this.miniProgram) { try { await openWebRecordingManager('', this.callId) } catch (error) { this.error = error.message } }
      else { this.error = ''; await this.load() }
    },
    stopPlaying() {
      this.playbackRevision++
      this.player?.stop()
      this.player = null
      this.playingId = ''; this.playbackReady = false; this.playbackPlaying = false; this.dragPosition = null
    },
    play(row) {
      if (this.miniProgram) { void this.openMiniFile(row, 'play'); return }
      if (this.playingId === row.id) {
        if (this.playbackPlaying) this.player?.pause()
        else this.player?.resume()
        return
      }
      this.stopPlaying(); this.error = ''
      const revision = this.playbackRevision
      this.playingId = row.id; this.playbackPosition = 0; this.playbackDuration = row.durationMs
      try {
        this.player = createRecordingPlayer(row, state => {
          if (this.disposed || revision !== this.playbackRevision) return
          this.playbackReady = true; this.playbackPlaying = state.playing
          this.playbackPosition = state.positionMs; this.playbackDuration = state.durationMs || row.durationMs
          if (state.ended) this.stopPlaying()
        }, error => {
          if (this.disposed || revision !== this.playbackRevision) return
          this.error = error.message; this.stopPlaying()
        })
      } catch (error) { this.error = error.message; this.stopPlaying() }
    },
    seekPlayback(event) {
      this.dragPosition = null
      this.playbackPosition = event.detail.value
      this.player?.seek(this.playbackPosition)
    },
    async exportFile(row) {
      this.error = ''
      try { const result = await recordingFileAction('export', row); if (result.exported) uni.showToast({ title: result.path ? '已导出到下载目录' : '已请求保存文件', icon: 'none' }) }
      catch (error) { this.error = error.message }
    },
    async openMiniFile(row, action = '') {
      this.error = ''
      try { await openWebRecordingManager(row.id, this.callId, action) } catch (error) { this.error = error.message }
    },
    rename(row) {
      if (this.miniProgram) { void this.openMiniFile(row, 'rename'); return }
      this.renameRow = row; this.renameValue = row.name; this.showRename = true
    },
    async saveRename() {
      if (!this.renameValue.trim()) return
      try { await recordingFileAction('rename', this.renameRow, this.renameValue); this.showRename = false }
      catch (error) { this.error = error.message }
    },
    remove(row) {
      if (this.miniProgram) { void this.openMiniFile(row, 'delete'); return }
      this.confirmDelete([row])
    },
    selectRow(id, checked) { this.selectedIds = checked ? [...new Set([...this.selectedIds, id])] : this.selectedIds.filter(item => item !== id) },
    selectAll() { if (!this.deleting) this.selectedIds = this.allSelected ? [] : this.selectableRows.map(row => row.id) },
    removeSelected() { this.confirmDelete(this.selectableRows.filter(row => this.selectedIds.includes(row.id))) },
    confirmDelete(rows) {
      if (!rows.length || this.deleting) return
      const label = rows.length === 1 ? `“${rows[0].name}”` : `选中的 ${rows.length} 条录音`
      this.deleting = true
      uni.showModal({ title: '删除录音', content: `确定删除${label}？删除后无法恢复。`, success: async result => {
        try {
          if (!result.confirm || this.disposed) return
          this.error = ''
          if (rows.some(row => row.id === this.playingId)) this.stopPlaying()
          const failures = await deleteCallRecordings(rows)
          await this.load()
          if (failures.length) this.error = `${failures.length} 条录音删除失败 · ${failures[0]}`
          else { this.selecting = false; this.selectedIds = [] }
        } finally { this.deleting = false }
      }, fail: () => { this.deleting = false } })
    },
    timeLabel(value) { const seconds = Math.floor(value / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` },
    dateLabel(value) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` },
    sizeLabel(bytes) { return bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB` },
    back() { if (this.deleting) return; if (this.selecting) { this.exitSelection(); return }; if (getCurrentPages().length > 1) uni.navigateBack(); else uni.redirectTo({ url: '/pages-nonTheme/settings' }) }
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
.recordings-page.selection-mode { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 160rpx); }
.heading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 34rpx;
  font-weight: 600;
  margin-bottom: 30rpx;
}
.back {
  width: 80rpx;
  height: 80rpx;
  margin-left: -16rpx !important;
}
.icon-button { display: flex; align-items: center; justify-content: center; flex: none; padding: 0; margin: 0; background: transparent; color: inherit; line-height: 1; }
.heading-action { margin-left: auto !important; }
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
  padding: 12rpx 8rpx;
  margin: 0;
  background: transparent;
  line-height: 1.5;
  font-size: 26rpx;
}
.list-toolbar { display: flex; gap: 24rpx; }
.list-tools {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 18rpx;
  padding: 4rpx 16rpx;
  font-size: 24rpx;
}
.recording-search {
  flex: 1;
  min-width: 0;
  height: 80rpx;
  padding: 0;
  font-size: 27rpx;
}
.clear-search { width: 64rpx; height: 80rpx; font-size: 38rpx; color: #718178; }
.selection-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 32rpx; background: #fff; border-top: 1px solid #e0e8e2; padding: 20rpx 32rpx calc(env(safe-area-inset-bottom, 0px) + 20rpx); }
.selection-bar .delete { margin: 0; min-width: 220rpx; padding: 0 32rpx; font-size: 27rpx; line-height: 80rpx; border-radius: 14rpx; background: #b84f49; color: #fff; }
.selection-bar .delete[disabled] { background: #f0e8e7; color: #a89896; }
.playback { display: flex; align-items: center; gap: 24rpx; margin-top: 24rpx; }
.play-button { width: 80rpx; height: 80rpx; border-radius: 50%; background: #e6f1ea; color: #23734f; }
.play-button[disabled] { color: #718178; background: #edf1ee; }
.play-symbol { width: 0; height: 0; margin-left: 5rpx; border-top: 13rpx solid transparent; border-bottom: 13rpx solid transparent; border-left: 20rpx solid currentColor; }
.pause-symbol { width: 22rpx; height: 26rpx; box-sizing: border-box; border-left: 7rpx solid currentColor; border-right: 7rpx solid currentColor; }
.play-loading { width: 26rpx; height: 26rpx; border: 3rpx solid #bdd4c6; border-top-color: #23734f; border-radius: 50%; animation: recording-spin 1s linear infinite; }
@keyframes recording-spin { to { transform: rotate(360deg); } }
.playback-track { flex: 1; min-width: 0; }
.playback-track slider { margin: 8rpx 0 12rpx; }
.playback-summary { display: flex; align-items: center; justify-content: space-between; flex: 1; gap: 16rpx; font-size: 28rpx; font-variant-numeric: tabular-nums; }
.playback-times {
  display: flex;
  justify-content: space-between;
  font-size: 23rpx;
  font-variant-numeric: tabular-nums;
  color: #718178;
}
.empty {
  text-align: center;
  padding: 70rpx 24rpx;
  color: #718178;
}
.recording {
  margin-bottom: 18rpx;
}
.recording-selected { border-color: #70ac8b; background: #f0f8f3; }
.recording-playing { border-color: #93bba3; }
.recording-heading {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.recording-copy { flex: 1; min-width: 0; }
.recording-meta { margin-top: 12rpx; }
.more-button { width: 80rpx; height: 80rpx; margin-right: -16rpx; color: #718178; }
.more-dots { display: flex; align-items: center; justify-content: center; gap: 6rpx; width: 30rpx; height: 16rpx; flex: none; }
.more-dot { flex: none; width: 6rpx; height: 6rpx; border-radius: 50%; background: currentColor; }
.selection-check { display: flex; align-items: center; justify-content: center; flex: none; width: 38rpx; height: 38rpx; border: 1px solid #b9c8bf; border-radius: 50%; font-size: 27rpx; }
.selection-check.checked { background: #16835e; border-color: #16835e; color: #fff; }
.selection-duration { margin-top: 14rpx; }
.recording-name {
  display: block;
  font-size: 29rpx;
  font-weight: 600;
  word-break: break-all;
  flex: 1;
  min-width: 0;
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
  box-sizing: border-box;
  width: 100%;
  height: 80rpx;
  background: #f1f5f2;
  margin: 26rpx 0;
  padding: 0 18rpx;
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
.dark .sub,.dark .notice,.dark .empty,.dark .playback-times {
  color: #a7b7ac;
}
.dark .rename-dialog input {
  background: #31483a;
  color: #d8eade;
}
.dark .selection-bar { background: #24352c; border-color: #3b4e42; }
.dark .recording-selected { background: #284637; border-color: #70ac8b; }
.dark .play-button { background: #314c3d; color: #a8dfbf; }
.dark .text-button { color: #95d2b0; }
</style>
