<template>
  <form class="wechat-profile-form" :class="{ 'profile-dark': dark }" @submit="submitProfile">
    <text class="field-label">头像</text>
    <button v-if="supportsAvatar" class="avatar-picker" open-type="chooseAvatar" :disabled="busy" @chooseavatar="chooseAvatar">
      <image class="profile-avatar" :src="previewAvatar" mode="aspectFill" />
      <text class="avatar-hint">选择头像</text>
    </button>
    <button v-else class="avatar-picker" :disabled="busy" @click="chooseLocalAvatar">
      <image class="profile-avatar" :src="previewAvatar" mode="aspectFill" />
      <text class="avatar-hint">选择头像</text>
    </button>
    <text class="field-label nickname-label">昵称</text>
    <input class="nickname-input" name="nickname" :type="supportsNickname ? 'nickname' : 'text'" :value="draftNickname" maxlength="32" :disabled="busy" placeholder="填写昵称，可使用微信昵称" @input="draftNickname = $event.detail.value" />
    <text class="field-note">昵称用于展示，不改变登录账号。头像和昵称由你确认保存。</text>
    <text v-if="error" class="profile-error">{{ error }}</text>
    <button class="profile-submit" form-type="submit" :disabled="busy" :loading="saving">{{ processing ? '正在处理头像…' : submitLabel }}</button>
    <canvas canvas-id="wechat-profile-avatar" id="wechat-profile-avatar" class="avatar-canvas" />
  </form>
</template>

<script setup>
import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'
import { baseUrl } from '@/api/settings.js'
import { compressImageToBase64, getAvatarUrl, validateAvatarSize } from '@/utils/avatar-handler.js'
import { nicknameError } from '@/utils/wechat-profile.mjs'

const props = defineProps({ avatar: { type: String, default: '' }, nickname: { type: String, default: '' }, dark: Boolean, saving: Boolean, submitLabel: { type: String, default: '保存头像和昵称' } })
const emit = defineEmits(['submit'])
const draftAvatar = ref(props.avatar)
const draftNickname = ref(props.nickname)
const processing = ref(false)
const error = ref('')
const context = getCurrentInstance()?.proxy
let active = true
onBeforeUnmount(() => { active = false })
watch(() => props.avatar, value => { draftAvatar.value = value })
watch(() => props.nickname, value => { draftNickname.value = value })
const supportsAvatar = typeof uni.canIUse === 'function' && uni.canIUse('button.open-type.chooseAvatar')
const supportsNickname = typeof uni.canIUse === 'function' && uni.canIUse('input.type.nickname')
const busy = computed(() => processing.value || props.saving)
const previewAvatar = computed(() => {
  const value = draftAvatar.value
  if (value.startsWith('/images/')) return baseUrl + value
  return getAvatarUrl(value, baseUrl)
})

async function prepareAvatar(path) {
  if (!path || busy.value) return
  processing.value = true
  error.value = ''
  try {
    const avatar = await compressImageToBase64(path, 128, 128, 0.8, { canvasId: 'wechat-profile-avatar', context })
    const validation = validateAvatarSize(avatar)
    if (!validation.isValid) throw new Error(validation.message)
    if (active) draftAvatar.value = avatar
  } catch (err) {
    if (active) error.value = err?.message || '头像处理失败，请重新选择'
  } finally {
    if (active) processing.value = false
  }
}
function chooseAvatar(event) { void prepareAvatar(event.detail?.avatarUrl) }
function chooseLocalAvatar() {
  if (busy.value) return
  uni.chooseImage({ count: 1, sizeType: ['compressed'], success: result => { void prepareAvatar(result.tempFilePaths?.[0]) } })
}
function submitProfile(event) {
  if (busy.value) return
  // Collect the native form value, including WeChat's nickname safety-check result.
  const nickname = event.detail?.value?.nickname ?? ''
  error.value = nicknameError(nickname)
  if (error.value) return
  emit('submit', { nickname: nickname.trim(), ...(draftAvatar.value ? { avatar: draftAvatar.value } : {}) })
}
</script>

<style scoped>
.wechat-profile-form { color: #233545; }.field-label { display: block; font-size: 27rpx; font-weight: 600; }.avatar-picker { display: flex; align-items: center; justify-content: center; gap: 24rpx; padding: 18rpx; margin: 14rpx 0 0; border: 1rpx solid #d7ece4; border-radius: 20rpx; background: #f0faf6; color: #118768; font-size: 26rpx; line-height: 1.5; }.avatar-picker::after, .profile-submit::after { border: none; }.profile-avatar { width: 108rpx; height: 108rpx; border-radius: 50%; flex-shrink: 0; }.nickname-label { margin-top: 28rpx; }.nickname-input { box-sizing: border-box; margin-top: 14rpx; min-height: 88rpx; padding: 20rpx; border: 1rpx solid #d7ece4; border-radius: 16rpx; font-size: 28rpx; background: #f8fcfa; }.field-note { display: block; margin-top: 14rpx; color: #788895; font-size: 23rpx; line-height: 1.6; }.profile-error { display: block; margin-top: 12rpx; color: #d34646; font-size: 24rpx; }.profile-submit { margin-top: 26rpx; border-radius: 18rpx; background: #0bab80; color: white; font-size: 28rpx; line-height: 2.7; }.profile-submit[disabled] { opacity: .6; }.avatar-canvas { position: fixed; left: -10000px; top: 0; width: 128px; height: 128px; pointer-events: none; }.profile-dark { color: #ecf3ff; }.profile-dark .avatar-picker, .profile-dark .nickname-input { background: #203b37; border-color: #407064; color: #edf8f3; }.profile-dark .field-note { color: #a4b7b4; }
</style>
