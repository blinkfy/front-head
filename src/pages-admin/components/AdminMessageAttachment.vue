<template>
  <view v-if="attachment" class="attachment" @click.stop>
    <view class="attachment-action" @click.stop="open">{{ busy ? '加载中…' : attachment.type === 'voice' && playing ? '■ 停止播放' : attachment.type === 'voice' ? '▶ 播放语音' : attachment.type === 'video' ? '▶ 预览视频' : '📄 ' + attachment.name }}</view>
    <view v-if="attachment.type === 'file' && previewUrl" class="attachment-download" @click.stop="openFile">下载 / 本地打开</view>
    <view v-if="showVideo" class="attachment-overlay" @click.stop="showVideo = false"><view class="attachment-video-panel" @click.stop><view class="attachment-close" @click.stop="showVideo = false">关闭 ✕</view><video :src="attachment.url" controls autoplay class="attachment-video" @error="showError" /></view></view>
  </view>
</template>
<script setup>
import { computed, ref, onBeforeUnmount, watch } from 'vue'
import { baseUrl } from '@/api/settings'
import { adminMessageAttachment, adminOnlineFilePreview } from '../utils/admin-message-attachment.mjs'
const props = defineProps({ type: String, content: [String, Object] })
const attachment = computed(() => adminMessageAttachment(props.type, props.content, baseUrl))
const previewUrl = computed(() => attachment.value?.type === 'file' ? adminOnlineFilePreview(attachment.value.url, baseUrl) : '')
const playing = ref(false), busy = ref(false), showVideo = ref(false)
let audio = null
function stop() { if (audio) { audio.stop(); audio.destroy(); audio = null }; playing.value = false }
function showError() { uni.showToast({ title: '附件加载失败', icon: 'none' }) }
watch(attachment, () => { stop(); showVideo.value = false })
onBeforeUnmount(stop)
function open() {
  if (!attachment.value || busy.value) return
  if (attachment.value.type === 'voice') {
    if (playing.value) { stop(); return }
    stop(); audio = uni.createInnerAudioContext(); audio.src = attachment.value.url
    audio.onEnded(stop); audio.onError(() => { stop(); showError() }); audio.onPlay(() => { playing.value = true }); audio.play(); return
  }
  if (attachment.value.type === 'video') { showVideo.value = true; return }
  if (previewUrl.value) {
    // #ifdef H5
    const tab = window.open('', '_blank')
    if (tab) { tab.opener = null; tab.location.replace(previewUrl.value) }
    else window.location.assign(previewUrl.value)
    // #endif
    // #ifndef H5
    uni.navigateTo({ url: `/pages-nonTheme/webview?url=${encodeURIComponent(previewUrl.value)}&title=${encodeURIComponent(attachment.value.name || '文件预览')}`, fail: openFile })
    // #endif
    return
  }
  openFile()
}
function openFile() {
  if (!attachment.value || busy.value) return
  // #ifdef H5
  window.open(attachment.value.url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifndef H5
  busy.value = true
  uni.downloadFile({ url: attachment.value.url, success: res => {
    if (res.statusCode !== 200) { showError(); return }
    uni.openDocument({ filePath: res.tempFilePath, showMenu: true, fail: () => uni.showToast({ title: '该文件暂不支持预览', icon: 'none' }) })
  }, fail: showError, complete: () => { busy.value = false } })
  // #endif
}
</script>
<style scoped>
.attachment { max-width: 100%; }.attachment-action { display:inline-block; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:6px 10px; border-radius:7px; color:#087b64; background:#e4f4ec; font-size:12px; cursor:pointer; }.attachment-download { display:inline-block; padding:6px; color:#14866d; font-size:11px; cursor:pointer; }.attachment-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.8); display:flex; align-items:center; justify-content:center; }.attachment-video-panel { width:90%; max-width:760px; }.attachment-close { text-align:right; padding:10px; color:white; }.attachment-video { width:100%; height:52vh; background:#000; }
</style>
