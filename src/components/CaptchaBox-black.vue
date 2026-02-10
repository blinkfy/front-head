<template>
  <view>
    <view class="captcha-container">
    <!-- reuse page input classes to ensure identical visuals -->
    <view class="captcha-input-wrapper input-wrapper-simple" :class="{ 'focused': captchaFocused }">
        <input
      :value="modelValue"
          @input="onInput"
          @focus="captchaFocused = true"
          @blur="captchaFocused = false"
          placeholder="请输入验证码"
          maxlength="6"
      class="captcha-input form-input-simple"
          @confirm="$emit('confirm')"
          @keyup.enter="$emit('confirm')"
        />
        <view class="input-border"></view>
      </view>
      <view class="captcha-image-container" @click="refreshCaptcha">
        <image :src="captchaImage" class="captcha-image" mode="aspectFill" />
      </view>
    </view>
    <text class="hint" v-if="captchaHint">{{ captchaHint }}</text>
  </view>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const captchaImage = ref('')
const correctCaptcha = ref('')
const captchaHint = ref('')
const captchaFocused = ref(false)

function genCaptchaText(len = 4) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return s
}

function svgToDataUrl(svgStr) {
  try {
    const encoded = btoa(unescape(encodeURIComponent(svgStr)))
    return 'data:image/svg+xml;base64,' + encoded
  } catch (e) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr)
  }
}

function buildCaptchaSvg(text, width = 120, height = 40) {
  const len = text.length
  const charGap = width / (len + 1)
  const bgColor = '#f7f9ff'
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
  svg += `<rect width="100%" height="100%" fill="${bgColor}" />`
  for (let i = 0; i < 10; i++) {
    const x1 = Math.random() * width
    const y1 = Math.random() * height
    const x2 = Math.random() * width
    const y2 = Math.random() * height
    const stroke = `rgba(${50+Math.floor(Math.random()*180)},${50+Math.floor(Math.random()*180)},${50+Math.floor(Math.random()*180)},0.6)`
    svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="1.5"/>`
  }
  for (let i = 0; i < 50; i++) {
    const cx = Math.random() * width
    const cy = Math.random() * height
    const r = Math.random() * 1.5 + 1
    const fill = `rgba(${100+Math.floor(Math.random()*120)},${100+Math.floor(Math.random()*120)},${100+Math.floor(Math.random()*120)},0.7)`
    svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(2)}" fill="${fill}" />`
  }
  for (let i = 0; i < len; i++) {
    const ch = text[i]
    const x = (i + 0.8) * charGap
    const y = height / 2 + (Math.random() * 6 - 2)
    const rotate = (Math.random() * 30 - 15).toFixed(1)
    const fontSize = Math.floor(height * (0.55 + Math.random() * 0.15))
    const color = `rgb(${30+Math.floor(Math.random()*160)},${30+Math.floor(Math.random()*160)},${30+Math.floor(Math.random()*160)})`
    svg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Arial" font-weight="700" font-size="${fontSize}" fill="${color}" transform="rotate(${rotate}, ${x.toFixed(1)}, ${y.toFixed(1)})" text-anchor="middle">${ch}</text>`
  }
  svg += `</svg>`
  return svg
}

function refreshCaptcha() {
  const txt = genCaptchaText(4)
  correctCaptcha.value = txt
  const svg = buildCaptchaSvg(txt, 140, 48)
  captchaImage.value = svgToDataUrl(svg)
  captchaHint.value = ''
  // clear model value in parent
  emit('update:modelValue', '')
}

function validate() {
  const v = (props.modelValue || '').trim()
  if (!v) return false
  return v.toLowerCase() === (correctCaptcha.value || '').toLowerCase()
}

function onInput(e) {
  // 兼容写法，避免使用 nullish 合并符 (??) 和可选链在部分小程序环境中不被支持
  let val = ''
  if (e && e.detail && typeof e.detail.value !== 'undefined') {
    val = e.detail.value
  } else if (e && e.target && typeof e.target.value !== 'undefined') {
    val = e.target.value
  } else {
    val = ''
  }
  emit('update:modelValue', val)
}

onMounted(() => {
  refreshCaptcha()
})

defineExpose({ validate, refresh: refreshCaptcha })
</script>

<style scoped>
/* 完整科技风验证码样式（与页面保持一致） */
.captcha-container {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.captcha-input-wrapper {
  /* match .input-wrapper-simple from pages for visual parity */
  flex: 1;
  position: relative;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 16rpx;
  border: 2rpx solid rgba(64, 224, 255, 0.5);
  min-height: 80rpx;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.captcha-input-wrapper.focused,
.captcha-input-wrapper.input-wrapper-simple:focus-within {
  border-color: #40e0ff;
  box-shadow: 0 0 15rpx rgba(64, 224, 255, 0.3);
}

.captcha-input {
  /* match .form-input-simple from pages for exact parity */
  width: 100%;
  height: 80rpx;
  padding: 0 15rpx;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 28rpx;
  box-sizing: border-box;
  vertical-align: middle;

  /* H5端样式 - 使用flex居中 */
  /* #ifdef H5 */
  display: flex;
  align-items: center;
  line-height: normal;
  /* #endif */

  /* 微信小程序样式 - 使用line-height居中 */
  /* #ifdef MP-WEIXIN */
  line-height: 80rpx;
  padding-top: 0;
  padding-bottom: 0;
  /* #endif */

  /* App端样式 */
  /* #ifdef APP-PLUS */
  line-height: 80rpx;
  /* #endif */

  /* 支付宝小程序样式 */
  /* #ifdef MP-ALIPAY */
  line-height: 80rpx;
  /* #endif */

  /* 其他小程序样式 */
  /* #ifdef MP */
  line-height: 80rpx;
  /* #endif */
}

.captcha-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
  font-size: 26rpx;
  vertical-align: middle;
}

/* 微信小程序验证码输入框额外修复 */
/* #ifdef MP-WEIXIN */
.captcha-input-wrapper {
  align-items: stretch;
}

.captcha-input {
  display: flex;
  align-items: center;
  padding: 0 18rpx;
  line-height: normal;
}
/* #endif */

.captcha-image-container {
  position: relative;
  width: 200rpx;
  height: 75rpx;
  border-radius: 12rpx;
  border: 2rpx solid rgba(64, 224, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s ease;
}

.captcha-image-container:hover {
  border-color: #40e0ff;
  box-shadow: 0 0 16rpx rgba(64, 224, 255, 0.4);
}

.captcha-image {
  width: 100%;
  height: 100%;
  border-radius: 10rpx;
}

.hint {
  color: #ff6b6b;
  font-size: 22rpx;
  margin-top: 8rpx;
  text-shadow: 0 0 8rpx rgba(255, 107, 107, 0.5);
}
</style>
