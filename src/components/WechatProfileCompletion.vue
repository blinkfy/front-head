<template>
  <view class="profile-overlay" :class="{ 'completion-dark': dark }" @touchmove.stop.prevent>
    <scroll-view class="profile-dialog" scroll-y>
      <text class="completion-title">完善个人资料</text>
      <text class="completion-description">欢迎加入分投侠！选择头像、填写昵称，让大家更容易认识你。</text>
      <WechatProfileForm :avatar="user.avatar || ''" :nickname="user.nickname || ''" :dark="dark" :saving="saving" @submit="saveProfile" />
      <text v-if="error" class="completion-error">{{ error }}</text>
      <button class="completion-skip" :disabled="saving" @click="$emit('done')">暂时跳过</button>
      <text class="completion-note">稍后也可以在“编辑个人资料”中修改</text>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { updateUserProfile } from '@/api/user.js'
import WechatProfileForm from '@/components/WechatProfileForm.vue'
const props = defineProps({ user: { type: Object, required: true }, dark: Boolean })
const emit = defineEmits(['done'])
const saving = ref(false)
const error = ref('')
async function saveProfile(values) {
  if (saving.value) return
  saving.value = true
  error.value = ''
  const token = uni.getStorageSync('token')
  try {
    const response = await updateUserProfile(values)
    if (response?.code !== 0) throw new Error(response?.msg || '资料保存失败，请重试')
    // Do not write a late response into a different account's local profile.
    if (uni.getStorageSync('token') !== token) return
    uni.setStorageSync('userInfo', { ...props.user, ...response.data })
    emit('done')
  } catch (err) {
    error.value = err?.msg || err?.message || '资料保存失败，可重试或暂时跳过'
  } finally { saving.value = false }
}
</script>

<style scoped>
.profile-overlay { position: fixed; z-index: 10020; inset: 0; display: flex; align-items: center; justify-content: center; padding: 36rpx; background: rgba(20, 43, 35, .55); box-sizing: border-box; }.profile-dialog { width: 100%; max-width: 620rpx; max-height: 82vh; padding: 36rpx; box-sizing: border-box; border-radius: 30rpx; background: #fff; box-shadow: 0 20rpx 70rpx rgba(0, 0, 0, .12); }.completion-title { display: block; font-size: 36rpx; font-weight: 700; color: #153c30; }.completion-description { display: block; margin: 14rpx 0 26rpx; color: #70857e; font-size: 25rpx; line-height: 1.65; }.completion-skip { margin: 20rpx 0 0; background: transparent; color: #688478; font-size: 27rpx; }.completion-skip::after { border: none; }.completion-note { display: block; text-align: center; font-size: 22rpx; color: #8b9892; margin-top: 10rpx; }.completion-error { display: block; margin-top: 14rpx; font-size: 24rpx; color: #d34646; }.completion-dark .profile-dialog { background: #172c2b; }.completion-dark .completion-title { color: #edf8f3; }.completion-dark .completion-description, .completion-dark .completion-skip, .completion-dark .completion-note { color: #a4b7b4; }
</style>
