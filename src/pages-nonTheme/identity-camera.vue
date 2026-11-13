<template>
  <view class="native-identity" :style="{ backgroundColor: display.fill || '#ffffff' }">
    <view class="native-header"><button class="native-link" @click="cancel">返回</button><text>实名认证</text><view class="header-spacer" /></view>
    <text class="native-title">{{ display.title || '正在准备认证…' }}</text>
    <text class="native-detail">{{ display.detail || '请本人独自入镜，保持光线充足' }}</text>
    <view id="identity-viewport" class="native-viewport" :class="{ 'is-ready': display.ready }">
      <!-- #ifdef MP-WEIXIN -->
      <camera v-if="cameraVisible" id="identity-camera" class="native-camera" device-position="front" flash="off" frame-size="medium" @initdone="cameraReady" @error="cameraError" @stop="cameraStopped" />
      <!-- #endif -->
    </view>
    <view class="native-steps"><text v-for="(action, index) in actions" :key="action" :class="{ complete: (display.progress || 0) > index }">{{ (display.progress || 0) > index ? '✓' : index + 1 }} {{ action === 'blink' ? '眨眼' : '张嘴' }}</text></view>
    <button class="native-light" @click="toggleLight">{{ display.light === false ? '柔光补光已关闭' : '柔光补光已开启' }}</button>
    <text class="native-hint">保持手机平稳 · 完成动作后继续认证</text>
  </view>
</template>
<script>
import { measureIdentityImageQuality, identityQualityRegion, identityImageQualityIssue, identityImageQualityHint } from '@/utils/identity-image-quality.mjs'
import { createIdentityNativeFlow } from '@/utils/identity-native-flow.mjs'
import { createWeixinIdentityLandmarks } from '@/utils/identity-weixin-landmarks.mjs'
import { createIdentityBrightness } from '@/utils/identity-brightness.mjs'
// #ifdef MP-WEIXIN
import { createWeixinIdentityDetector } from '@/utils/identity-weixin-detector.mjs'
const faceDetector = createWeixinIdentityDetector(wx)
// #endif
export default {
  data: () => ({ actions: ['blink', 'mouth'], display: {}, cameraVisible: true }),
  onLoad(options) {
    this.closed = false; this.frameBusy = false; this.lastFrame = 0; this.viewport = null
    this.channel = this.getOpenerEventChannel()
    if (options.order === 'mouth') this.actions = ['mouth', 'blink']
    this.flow = createIdentityNativeFlow(this.actions); this.landmarks = createWeixinIdentityLandmarks()
    this.brightness = createIdentityBrightness(uni)
    this.timer = setTimeout(() => this.finish(null, '认证超时，请重新开始'), 90000)
    this.channel.on('cancelCapture', () => this.cancel())
    if (this.closed) return
    // #ifdef MP-WEIXIN
    this.detectorToken = {}
    faceDetector.acquire(this.detectorToken).then(ready => {
      if (this.closed || !ready) return
      this.detectorReady = true; this.beginFrames()
    }).catch(() => { if (!this.closed) this.finish(null, '当前微信版本暂不支持动作认证，请更新微信后重试') })
    // #endif
  },
  onReady() { uni.createSelectorQuery().in(this).select('#identity-viewport').boundingClientRect(rect => { if (rect && !this.closed) this.viewport = rect }).exec() },
  onHide() { if (!this.closed) this.cancel() },
  onUnload() { if (!this.closed) { this.closed = true; this.channel?.emit('captureCancelled', {}) }; this.release() },
  methods: {
    cameraReady() {
      if (this.closed) return
      this.camera = uni.createCameraContext(); this.brightness.start(); this.beginFrames()
    },
    cameraError() { this.finish(null, '无法打开相机，请允许相机权限后重试') },
    cameraStopped() { if (!this.closed) this.finish(null, '相机已暂停，请重新认证') },
    beginFrames() {
      if (this.closed || this.frameListener || !this.camera || !this.detectorReady) return
      // #ifdef MP-WEIXIN
      if (!this.camera.onCameraFrame) { this.finish(null, '当前设备暂不支持动作认证，请更新微信后重试'); return }
      this.frameListener = this.camera.onCameraFrame(frame => this.detect(frame))
      this.frameListener.start({ fail: () => this.finish(null, '无法获取相机画面，请重新认证') })
      // #endif
    },
    detect(frame) {
      if (this.closed || this.taking || this.frameBusy || !this.viewport || Date.now() - this.lastFrame < 120) return
      this.lastFrame = Date.now()
      const pixels = { data: new Uint8Array(frame.data), width: frame.width, height: frame.height }
      const quality = measureIdentityImageQuality(pixels)
      const issue = identityImageQualityIssue(quality, { checkSharpness: false })
      if (issue === 'black') {
        this.display = this.flow.update({ count: 0, points: [], video: frame, viewport: this.viewport, quality }, Date.now()); return
      }
      this.frameBusy = true
      // #ifdef MP-WEIXIN
      wx.faceDetect({ frameBuffer: frame.data, width: frame.width, height: frame.height, enablePoint: true, enableMultiFace: true, enableAngle: true, enableConf: true,
        success: result => {
          if (this.closed || this.taking) return
          // Unknown multi-face schemas fail closed instead of silently choosing the first face.
          const faces = Array.isArray(result.faceInfo) ? result.faceInfo : []
          if (!Array.isArray(result.faceInfo)) { this.finish(null, '当前设备的动作认证暂不兼容，请更新微信后重试'); return }
          if (faces.length !== 1) {
            this.landmarks.reset()
            this.display = this.flow.update({ count: faces.length, points: [], video: frame, viewport: this.viewport, quality }, Date.now()); return
          }
          const measured = this.landmarks.update(faces[0].pointArray, frame.width, frame.height)
          if (!measured?.calibrated) {
            if (!measured) this.layoutFailures = (this.layoutFailures || 0) + 1
            else this.layoutFailures = 0
            if (this.layoutFailures >= 25) { this.finish(null, '暂时无法检测动作，请正对镜头重新认证'); return }
            this.display = this.flow.update({ count: 0, points: [], video: frame, viewport: this.viewport }, Date.now())
            this.display = { ...this.display, title: '请正对镜头', detail: '睁开双眼，自然闭嘴，保持片刻' }; return
          }
          this.display = this.flow.update({ count: 1, ...measured, video: frame, viewport: this.viewport, color: this.cheekColor(frame, measured.points), quality: measureIdentityImageQuality(pixels, measured.points) }, Date.now())
          if (this.display.capture) this.takePhoto(measured.points)
        },
        fail: () => { if (!this.closed) this.finish(null, '动作认证未完成，请检查微信版本并重新认证') },
        complete: () => { this.frameBusy = false }
      })
      // #endif
    },
    cheekColor(frame, points) {
      const data = new Uint8Array(frame.data), sum = [0, 0, 0]; let count = 0
      if (data.length !== frame.width * frame.height * 4) return null
      // Sample two inner-cheek patches relative to the pupil/nose anchors.
      for (const pupil of [points[104], points[105]]) {
        const cx = Math.round((pupil.x * .7 + points[45].x * .3) * frame.width), cy = Math.round((pupil.y + points[98].y) * .5 * frame.height)
        const radius = Math.max(1, Math.round(frame.width * .025))
        for (let y = Math.max(0, cy - radius); y <= Math.min(frame.height - 1, cy + radius); y++) for (let x = Math.max(0, cx - radius); x <= Math.min(frame.width - 1, cx + radius); x++) {
          const i = (y * frame.width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2]
          if (r + g + b < 45 || Math.min(r, g, b) > 245) continue
          sum[0] += r; sum[1] += g; sum[2] += b; count++
        }
      }
      return count >= 8 ? sum.map(n => n / count) : null
    },
    toggleLight() { if (!this.closed) this.display = { ...this.display, ...this.flow.toggleLight(Date.now()) } },
    async photoQuality(path, points) {
      // Validate the actual encoded still, not just a camera frame taken before it.
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: 1, height: 1 })
      const image = canvas.createImage()
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error('image timeout')) }, 5000)
          image.onload = () => { clearTimeout(timer); resolve() }
          image.onerror = () => { clearTimeout(timer); reject(new Error('image decode')) }
          image.src = path
        })
        const roi = identityQualityRegion(points, image.width, image.height)
        canvas.width = roi.width; canvas.height = roi.height
        const context = canvas.getContext('2d')
        context.drawImage(image, roi.left, roi.top, roi.width, roi.height, 0, 0, roi.width, roi.height)
        return measureIdentityImageQuality(context.getImageData(0, 0, roi.width, roi.height), null, { left: 0, top: 0, width: roi.width, height: roi.height })
      } finally { image.onload = null; image.onerror = null; canvas.width = 1; canvas.height = 1 }
    },
    retryQuality(issue) {
      if (this.closed) return
      this.taking = false; this.flow.retryImage(Date.now())
      this.display = { ...this.display, ...identityImageQualityHint(issue), capture: false, ready: false }
    },
    takePhoto(points) {
      if (this.taking || this.closed) return
      this.taking = true
      this.camera.takePhoto({ quality: 'high', selfieMirror: false, success: async res => {
        if (this.closed) { uni.getFileSystemManager().unlink({ filePath: res.tempImagePath, fail() {} }); return }
        let issue = 'unavailable'
        try { issue = identityImageQualityIssue(await this.photoQuality(res.tempImagePath, points)) } catch { /* Keep the camera open for another usable image. */ }
        if (this.closed || issue) {
          uni.getFileSystemManager().unlink({ filePath: res.tempImagePath, fail() {} })
          if (!this.closed) this.retryQuality(issue)
          return
        }
        this.finish({ path: res.tempImagePath, assist: 'client_actions', lightFeedback: this.display.lightFeedback })
      }, fail: () => this.retryQuality('unavailable') })
    },
    cancel() { this.finish() },
    finish(photo, message) {
      if (this.closed) return
      this.closed = true; this.release()
      this.channel?.emit(photo ? 'captured' : 'captureCancelled', photo || { message })
      uni.navigateBack({ fail() {} })
    },
    release() {
      clearTimeout(this.timer); this.brightness?.close()
      this.frameListener?.stop({}); this.frameListener = null; this.cameraVisible = false
      // #ifdef MP-WEIXIN
      this.detectorReady = false; faceDetector.release(this.detectorToken)
      // #endif
    }
  }
}
</script>
<style scoped>
.native-identity { min-height: 100vh; box-sizing: border-box; padding: calc(var(--status-bar-height, 0px) + 20rpx) 42rpx 44rpx; color: #163030; transition: background-color .2s; display: flex; flex-direction: column; align-items: center; }
.native-header { height: 88rpx; width: 100%; display: flex; align-items: center; justify-content: space-between; font-size: 32rpx; font-weight: 700; }
.native-link, .header-spacer { width: 90rpx; margin: 0; padding: 0; }
.native-link { background: transparent; color: #176457; font-size: 28rpx; line-height: 2; font-weight: 400; }
.native-link::after, .native-light::after { border: 0; }
.native-title { font-size: 44rpx; font-weight: 700; margin-top: 40rpx; text-align: center; }
.native-detail { font-size: 27rpx; color: #49615e; margin: 20rpx 0 34rpx; min-height: 42rpx; text-align: center; }
.native-viewport { width: 560rpx; max-width: 100%; height: 700rpx; max-height: 46vh; border-radius: 50%; overflow: hidden; border: 5rpx solid #c5d7d2; box-sizing: border-box; }
.native-viewport.is-ready { border-color: #099b77; }
.native-camera { display: block; width: 100%; height: 100%; }
.native-steps { display: flex; gap: 56rpx; padding: 42rpx 0; font-size: 30rpx; }
.complete { color: #008865; }
.native-light { background: rgba(255,255,255,.75); border-radius: 44rpx; color: #176457; font-size: 26rpx; line-height: 2.8; padding: 0 30rpx; }
.native-hint { font-size: 23rpx; color: #49615e; margin-top: 24rpx; text-align: center; }
</style>
