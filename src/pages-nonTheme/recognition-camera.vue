<template>
  <view class="capture-page">
    <view class="capture-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <button class="capture-icon-button capture-back" aria-label="返回" @click="goBack"><view class="back-chevron"></view></button>
      <text class="capture-title">拍照识别</text>
    </view>
    <view class="capture-stage">
      <view class="capture-viewport" :style="viewportStyle">
        <!-- #ifdef MP-WEIXIN -->
        <camera v-if="cameraActive" :key="cameraVersion" class="capture-camera" mode="normal" resolution="high"
          :device-position="devicePosition" :flash="flash" @initdone="onCameraReady" @error="onCameraError" @stop="onCameraStopped" />
        <!-- #endif -->
        <view v-if="!ready" class="capture-status">
          <text class="capture-message">{{ errorMessage || '正在打开相机…' }}</text>
          <view v-if="errorMessage" class="capture-error-actions">
            <button class="capture-retry" @click="retryCamera">重试</button>
            <button class="capture-retry" @click="openCameraSettings">相机权限</button>
          </view>
        </view>
        <view v-if="ready && maxZoom >= 2" class="capture-zooms">
          <button v-for="value in zoomChoices" :key="value" class="capture-zoom" :disabled="zoomBusy || capturing" :class="{ selected: zoom === value }" @click="setZoom(value)">{{ value }}×</button>
        </view>
      </view>
    </view>
    <view class="capture-footer">
      <text class="capture-hint">{{ capturing ? '正在拍摄…' : '拍照后自动识别' }}</text>
      <view class="capture-controls">
        <button class="capture-icon-button capture-flash" :disabled="!ready || capturing || devicePosition === 'front'" aria-label="切换常亮补光" @click="toggleFlash">
          <text class="flash-symbol">ϟ</text><text class="capture-control-label">{{ flashLabel }}</text>
        </button>
        <button class="capture-shutter" :disabled="!ready || zoomBusy || capturing || committed" aria-label="拍照并识别" @click="takePhoto"><view class="capture-shutter-core"></view></button>
        <button class="capture-icon-button" :disabled="capturing" aria-label="切换摄像头" @click="switchCamera"><text class="switch-symbol">↻</text><text class="capture-control-label">翻转</text></button>
      </view>
      <text class="capture-mode">拍照</text>
    </view>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, ref } from 'vue'
import { onHide, onResize, onShow, onUnload } from '@dcloudio/uni-app'

const page = getCurrentInstance()
const statusBarHeight = Number(uni.getSystemInfoSync().statusBarHeight) || 0
const cameraActive = ref(false), cameraVersion = ref(0), ready = ref(false)
const viewportStyle = ref({ width: '100%', height: '100%' }), zoomBusy = ref(false)
const devicePosition = ref('back'), flash = ref('off'), zoom = ref(1), maxZoom = ref(1)
const capturing = ref(false), committed = ref(false), errorMessage = ref('')
const zoomChoices = computed(() => [1, 2, 5].filter(value => value <= maxZoom.value))
const flashLabel = computed(() => flash.value === 'torch' ? '补光常亮' : '补光关闭')
let alive = true, visible = false, captureVersion = 0, mountVersion = 0
const channel = () => page?.proxy?.getOpenerEventChannel?.()

function resetCamera() {
  ready.value = false
  errorMessage.value = ''
  zoom.value = 1
  zoomBusy.value = false
  maxZoom.value = 1
  cameraVersion.value++
  cameraActive.value = true
}
function onCameraReady(event) {
  if (!alive || !visible) return
  ready.value = true
  maxZoom.value = Math.max(1, Number(event.detail?.maxZoom) || 1)
  setZoom(1)
}
function onCameraError() {
  if (!alive || !visible) return
  ready.value = false
  zoomBusy.value = false
  flash.value = 'off'
  cameraActive.value = false
  errorMessage.value = '相机暂时无法使用，请重试或检查相机权限。'
}
function onCameraStopped() { if (visible && ready.value && !committed.value) onCameraError() }
async function retryCamera() {
  const version = ++mountVersion
  cameraActive.value = false
  ready.value = false
  flash.value = 'off'
  await nextTick()
  if (!alive || !visible || committed.value || version !== mountVersion) return
  // Keep a portrait 3:4 viewport instead of forcing a tall preview to fill the page.
  const mountCamera = rect => {
    if (!alive || !visible || committed.value || version !== mountVersion) return
    if (rect?.width > 0 && rect?.height > 0) {
      const width = Math.min(rect.width, rect.height * 3 / 4)
      viewportStyle.value = { width: `${width}px`, height: `${width * 4 / 3}px` }
    }
    resetCamera()
  }
  try {
    uni.createSelectorQuery().in(page.proxy).select('.capture-stage').boundingClientRect(mountCamera).exec()
  } catch (_) { mountCamera() }
}
function openCameraSettings() {
  uni.openSetting({ success: result => { if (result.authSetting?.['scope.camera']) void retryCamera() } })
}
function toggleFlash() {
  if (!ready.value || capturing.value || devicePosition.value === 'front') return
  flash.value = flash.value === 'torch' ? 'off' : 'torch'
}
function switchCamera() {
  devicePosition.value = devicePosition.value === 'back' ? 'front' : 'back'
  flash.value = 'off'
  void retryCamera()
}
function setZoom(value) {
  if (!ready.value || capturing.value || zoomBusy.value || value < 1 || value > maxZoom.value) return
  const version = cameraVersion.value
  const mount = mountVersion
  zoomBusy.value = true
  const current = () => alive && visible && ready.value && version === cameraVersion.value && mount === mountVersion
  const fail = () => { if (current()) uni.showToast({ title: '暂时无法调整倍率，请重试', icon: 'none' }) }
  try {
    uni.createCameraContext().setZoom({
      zoom: value,
      success: result => { if (current()) zoom.value = Number(result?.zoom) || value },
      fail,
      complete: () => { if (current()) zoomBusy.value = false }
    })
  } catch (_) { zoomBusy.value = false; fail() }
}
function goBack() {
  uni.navigateBack({ fail: () => uni.showToast({ title: '未能返回，请再次点击返回', icon: 'none' }) })
}
function takePhoto() {
  if (!ready.value || zoomBusy.value || capturing.value || committed.value) return
  const version = ++captureVersion
  capturing.value = true
  uni.createCameraContext().takePhoto({
    quality: 'high', selfieMirror: false,
    success: result => {
      if (!alive || !visible || version !== captureVersion) return
      if (!result.tempImagePath) { onCameraError(); return }
      committed.value = true
      channel()?.emit('captured', { tempFilePaths: [result.tempImagePath], tempFiles: [{ path: result.tempImagePath }] })
      goBack()
    },
    fail: () => { if (alive && visible && version === captureVersion) uni.showToast({ title: '这次没拍成功，请再试一次', icon: 'none' }) },
    complete: () => { if (alive && version === captureVersion) capturing.value = false }
  })
}
onShow(() => { visible = true; if (!committed.value) void retryCamera() })
onResize(() => { if (visible && !capturing.value && !committed.value) void retryCamera() })
onHide(() => { visible = false; flash.value = 'off'; ready.value = false; cameraActive.value = false; capturing.value = false; zoomBusy.value = false; captureVersion++; mountVersion++ })
onUnload(() => {
  alive = false
  visible = false
  cameraActive.value = false
  flash.value = 'off'
  captureVersion++
  mountVersion++
  if (!committed.value) channel()?.emit('cameraCancelled', { errMsg: 'chooseImage:fail cancel' })
})
</script>

<style scoped>
.capture-page { position: fixed; inset: 0; display: flex; flex-direction: column; background: #050505; color: #fff; }
.capture-header { flex-shrink: 0; display: flex; align-items: center; height: 56px; box-sizing: content-box; padding-right: 106px; }
.capture-title { font-size: 16px; font-weight: 500; margin-left: 8px; }
.capture-icon-button { width: 54px; height: 54px; padding: 0; margin: 0; border: 0; color: #fff; background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.capture-icon-button::after, .capture-shutter::after, .capture-retry::after, .capture-zoom::after { border: 0; }
.capture-back { margin-left: 12px; }
.back-chevron { width: 13px; height: 13px; border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(45deg); }
.capture-stage { position: relative; display: flex; align-items: center; justify-content: center; flex: 1; min-height: 0; overflow: hidden; background: #050505; }
.capture-viewport { position: relative; flex-shrink: 0; overflow: hidden; background: #101111; }
.capture-camera { width: 100%; height: 100%; }
.capture-status { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; background: #101111; }
.capture-message { color: #d3d6d5; font-size: 14px; line-height: 1.7; }
.capture-error-actions { display: flex; gap: 12px; margin-top: 22px; }
.capture-retry { background: #ffffff18; color: #fff; border-radius: 22px; font-size: 14px; line-height: 38px; padding: 0 20px; margin: 0; }
.capture-zooms { position: absolute; bottom: 18px; left: 0; right: 0; display: flex; justify-content: center; gap: 14px; }
.capture-zoom { width: 40px; height: 40px; padding: 0; margin: 0; line-height: 38px; border-radius: 50%; background: #0005; color: #fff; border: 1px solid transparent; font-size: 13px; }
.capture-zoom.selected { border-color: #fff; background: #0008; }
.capture-footer { flex-shrink: 0; padding: 20px 28px calc(18px + env(safe-area-inset-bottom)); text-align: center; }
.capture-hint { display: block; color: #d0d4d2; font-size: 13px; }
.capture-controls { display: flex; justify-content: space-around; align-items: center; margin: 20px auto 17px; max-width: 460px; }
.capture-shutter { width: 80px; height: 80px; padding: 5px; margin: 0; border-radius: 50%; border: 2px solid #fff; background: transparent; box-sizing: border-box; }
.capture-shutter-core { width: 100%; height: 100%; border-radius: 50%; background: #fff; }
.capture-shutter[disabled], .capture-icon-button[disabled] { opacity: .35; }
.flash-symbol { font-size: 33px; line-height: 32px; }
.switch-symbol { font-size: 38px; line-height: 32px; }
.capture-control-label { font-size: 10px; margin-top: 5px; }
.capture-mode { color: #85e4b7; font-size: 12px; letter-spacing: 2px; }
</style>
