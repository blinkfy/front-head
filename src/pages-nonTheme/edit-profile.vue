<template>
  <view :class="['edit-profile-container', { 'dark-theme': isDarkTheme }]">
    <!-- 隐藏的 Canvas 用于头像处理 -->
    <canvas id="avatar-canvas" style="display: none;"></canvas>

    <!-- 背景 -->
    <view class="bg-effects">
      <view class="bg-gradient"></view>
    </view>

    <!-- 返回按钮 -->
    <view class="back-btn" @click="goBack">
      <text>←</text>
    </view>

    <!-- 头部 -->
    <view class="edit-header">
      <text class="header-title">编辑个人资料</text>
    </view>

    <!-- 内容 -->
    <view class="edit-content">
      <!-- 头像编辑 -->
      <view class="avatar-section">
        <view class="section-label">头像</view>
        <view class="avatar-wrapper">
          <image :src="getAvatarUrl(formData.avatar || userInfo.avatar || '/static/person.jpeg', baseUrl)" class="avatar-image" mode="aspectFill"></image>
          <view class="avatar-overlay" @click="uploadAvatar">
            <text class="overlay-icon">📷</text>
            <text class="overlay-text">更换头像</text>
          </view>
        </view>
      </view>

      <!-- 表单区域 -->
      <view class="form-section">
        <!-- 用户名 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">用户名</text>
            <text class="label-required">*</text>
          </view>
          <input 
            v-model="formData.username" 
            type="text" 
            placeholder="请输入用户名"
            maxlength="20"
            class="form-input"
            @input="onUsernameInput"
          />
          <view class="input-hint">{{ formData.username?.length || 0 }}/20</view>
        </view>

        <!-- 个人简介 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">个人简介</text>
          </view>
          <textarea 
            v-model="formData.bio" 
            placeholder="请输入个人简介，介绍一下自己吧"
            maxlength="100"
            class="form-textarea"/>
          <view class="input-hint">{{ formData.bio?.length || 0 }}/100</view>
        </view>

        <!-- 联系电话 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">联系电话</text>
          </view>
          <input 
            v-model="formData.phone" 
            type="tel" 
            placeholder="请输入手机号码"
            maxlength="11"
            class="form-input"
          />
        </view>

        <!-- 邮箱 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">邮箱</text>
          </view>
          <input 
            v-model="formData.email" 
            type="email" 
            placeholder="请输入邮箱地址"
            maxlength="40"
            class="form-input"
          />
        </view>

        <!-- 所在地区 -->
        <view class="form-group">
          <view class="form-label">
            <text class="label-text">所在地区</text>
          </view>
          <view class="location-wrapper">
            <input
              v-model="formData.location"
              type="text"
              placeholder="点击定位或直接输入城市"
              class="form-input location-field"
            />
            <view class="location-action" @click="selectLocation">
              <text>📍</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="action-buttons">
        <view class="btn-cancel" @click="goBack">取消</view>
        <view class="btn-save" @click="saveProfile" :class="{ loading: isSaving }">
          <text v-if="!isSaving">保存修改</text>
          <text v-else>保存中...</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import * as userApi from '@/api/user.js'
import { compressImageToBase64, getAvatarUrl, validateAvatarSize } from '@/utils/avatar-handler.js'
import { baseUrl } from '@/api/settings.js'

const isDarkTheme = ref(false)
const userInfo = ref({})
const isSaving = ref(false)
const isLoading = ref(false)

const formData = reactive({
  username: '',
  avatar: '',
  bio: '',
  phone: '',
  email: '',
  location: '',
})

function checkTheme() {
  const theme = uni.getStorageSync('app_theme')
  isDarkTheme.value = theme === 'dark'
}

function goBack() {
  const pages = getCurrentPages()
    if (pages.length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({url: '/pages-nonTheme/settings'})
    }
}

function onUsernameInput() {
  // 只允许字母、数字、中文
  formData.username = formData.username.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
}

function uploadAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const tempFilePath = res.tempFilePaths[0]
      
      try {
        uni.showLoading({ title: '压缩头像中...' })
        
        // 压缩图片到 64x64 并转换为 Base64
        const base64Avatar = await compressImageToBase64(tempFilePath, 64, 64, 0.8)
        
        // 验证头像大小
        const validation = validateAvatarSize(base64Avatar)
        if (!validation.isValid) {
          uni.hideLoading()
          uni.showToast({
            title: validation.message,
            icon: 'none'
          })
          return
        }
        
        // 更新表单数据
        formData.avatar = base64Avatar
        
        uni.hideLoading()
        uni.showToast({
          title: `头像已更新 (${Math.round(validation.size / 1024)}KB)`,
          icon: 'success'
        })
      } catch (error) {
        uni.hideLoading()
        console.error('头像处理失败:', error)
        uni.showToast({
          title: '头像处理失败，请重试',
          icon: 'none'
        })
      }
    },
    fail: () => {
      uni.showToast({
        title: '选择图片失败',
        icon: 'none'
      })
    }
  })
}

function selectLocation() {
  // 获取当前平台
  const platform = uni.getSystemInfoSync().platform
  
  // H5/Web环境中地图功能需要配置，暂不支持
  // 仅在小程序环境中启用地图定位
  if (platform === 'android' || platform === 'ios') {
    if (typeof uni.chooseLocation === 'function') {
      uni.chooseLocation({
        success: function(res) {
          formData.location = res.address || res.name || `${res.latitude},${res.longitude}`
        },
        fail: function(err) {
          uni.showToast({
            title: '定位失败，请手动输入',
            icon: 'none'
          })
        }
      })
    } else {
      uni.showToast({
        title: '当前环境不支持地图选址，请手动输入',
        icon: 'none'
      })
    }
  } else {
    // H5环境：显示提示，让用户手动输入
    uni.showToast({
      title: 'H5环境暂不支持地图定位，请直接输入城市',
      icon: 'none'
    })
  }
}

async function saveProfile() {
  // 验证必填项
  if (!formData.username || formData.username.trim() === '') {
    uni.showToast({
      title: '用户名不能为空',
      icon: 'none'
    })
    return
  }

  if (formData.username.length < 2) {
    uni.showToast({
      title: '用户名至少2个字符',
      icon: 'none'
    })
    return
  }

  isSaving.value = true

  try {
    // 调用 API 保存用户资料
    const response = await userApi.updateUserProfile({
      username: formData.username,
      avatar: formData.avatar || userInfo.value.avatar,
      bio: formData.bio,
      phone: formData.phone,
      email: formData.email,
      location: formData.location
    })

    // 更新本地存储的 userInfo
    const updatedUserInfo = {
      ...userInfo.value,
      username: formData.username,
      avatar: formData.avatar || userInfo.value.avatar
    }
    
    // 保存到本地存储
    uni.setStorageSync('userInfo', updatedUserInfo)
    userInfo.value = updatedUserInfo

    uni.showToast({
      title: '保存成功',
      icon: 'success'
    })

    setTimeout(() => {
      goBack()
    }, 500)
  } catch (error) {
    console.error('保存用户资料失败:', error)
    uni.showToast({
      title: error?.msg || '保存失败，请重试',
      icon: 'none'
    })
  } finally {
    isSaving.value = false
  }
}

function loadUserInfo() {
  isLoading.value = true
  userApi.getUserProfile()
    .then(response => {
      // 假设服务器返回的数据结构为: { code: 0, data: {...} }
      const data = response.data || response
      userInfo.value = data
      
      // 更新表单数据
      formData.username = data.username || ''
      formData.avatar = data.avatar || ''
      formData.bio = data.bio || ''
      formData.phone = data.phone || ''
      formData.email = data.email || ''
      formData.location = data.location || ''
    })
    .catch(error => {
        console.error('获取用户资料失败:', error)
        uni.showToast({
            title: error?.msg || '加载用户资料失败',
            icon: 'none'
        })
    })
    .finally(() => {
      isLoading.value = false
    })
}

onMounted(() => {
  checkTheme()
  loadUserInfo()
})
</script>

<style scoped>
.edit-profile-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.edit-profile-container.dark-theme {
  background: linear-gradient(135deg, #1a1a3e 0%, #15213a 30%, #1e2a5f 70%, #2d1b4e 100%);
}

.bg-effects {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.bg-gradient {
  width: 100%;
  height: 100%;
  background: inherit;
}

/* 返回按钮 */
.back-btn {
  position: fixed;
  top: 65rpx;
  left: 25rpx;
  width: 50rpx;
  height: 50rpx;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.back-btn:active {
  transform: scale(0.9);
}

.edit-profile-container.dark-theme .back-btn {
  background: rgba(137, 136, 136, 0.503);
  border: 2px solid rgba(255, 255, 255, 0.156);
}

.back-btn text {
  font-size: 32rpx;
  font-weight: bold;
  color: #059669;
}

.edit-profile-container.dark-theme .back-btn text {
  color: #5B8DEE;
}

/* 头部 */
.edit-header {
  position: relative;
  z-index: 10;
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  padding: 60rpx 30rpx 20rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
  text-align: center;
}

.edit-profile-container.dark-theme .edit-header {
  background: linear-gradient(135deg, #1a1a3e 0%, #16213e 100%);
}

.header-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
  text-align: center;
}

.edit-profile-container.dark-theme .header-title {
  color: #e0e0e0;
}

/* 编辑内容 */
.edit-content {
  position: relative;
  z-index: 10;
  padding: 0 20rpx 100rpx;
}

/* 头像部分 */
.avatar-section {
  margin-bottom: 40rpx;
}

.section-label {
  font-size: 24rpx;
  font-weight: 600;
  color: #059669;
  margin-bottom: 15rpx;
  padding: 0 5rpx;
}

.edit-profile-container.dark-theme .section-label {
  color: #5B8DEE;
}

.avatar-wrapper {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  margin: 0 auto;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.15);
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.avatar-wrapper:active .avatar-overlay {
  opacity: 1;
}

.overlay-icon {
  font-size: 48rpx;
}

.overlay-text {
  font-size: 24rpx;
  color: #fff;
  font-weight: 500;
}

/* 表单区域 */
.form-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20rpx;
  padding: 30rpx;
  margin-bottom: 30rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.08);
}

.edit-profile-container.dark-theme .form-section {
  background: rgba(30, 30, 50, 0.85);
}

.form-group {
  margin-bottom: 10rpx;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}

.label-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
}

.edit-profile-container.dark-theme .label-text {
  color: #e0e0e0;
}

.label-required {
  color: #ef4444;
  margin-left: 4rpx;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 16rpx 20rpx;
  background: rgba(255, 255, 255, 0.8);
  border: 2rpx solid rgba(5, 150, 105, 0.2);
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1f2937;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.edit-profile-container.dark-theme .form-input,
.edit-profile-container.dark-theme .form-textarea {
  background: rgba(20, 20, 40, 0.6);
  border-color: rgba(91, 141, 238, 0.2);
  color: #e0e0e0;
}

.form-input:focus,
.form-textarea:focus {
  border-color: #059669;
  background: #fff;
  box-shadow: 0 0 0 3rpx rgba(5, 150, 105, 0.1);
}

.edit-profile-container.dark-theme .form-input:focus,
.edit-profile-container.dark-theme .form-textarea:focus {
  border-color: #5B8DEE;
  background: rgba(20, 20, 40, 0.8);
  box-shadow: 0 0 0 3rpx rgba(91, 141, 238, 0.15);
}
.form-input {
  min-height: 70rpx;
  display: block;
  box-sizing: border-box;
}

.form-textarea {
  min-height: 60rpx;
  resize: vertical;
  font-family: inherit;
}

.input-hint {
  font-size: 20rpx;
  color: #9ca3af;
  margin-top: 8rpx;
  text-align: right;
}

.edit-profile-container.dark-theme .input-hint {
  color: #a0a0c0;
}

/* 位置输入 */
.location-wrapper {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.location-field {
  flex: 1;
}

.location-action {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: #059669;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28rpx;
  box-shadow: 0 4rpx 12rpx rgba(5, 150, 105, 0.3);
}

.location-action:active {
  transform: scale(0.95);
}

.edit-profile-container.dark-theme .location-action {
  background: #5B8DEE;
  box-shadow: 0 4rpx 12rpx rgba(91, 141, 238, 0.4);
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  gap: 15rpx;
  padding: 0 20rpx;
}

.btn-cancel,
.btn-save {
  flex: 1;
  padding: 18rpx 30rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 600;
  text-align: center;
  transition: all 0.3s ease;
}

.btn-cancel {
  background: rgba(0, 0, 0, 0.05);
  color: #6b7280;
}

.edit-profile-container.dark-theme .btn-cancel {
  background: rgba(91, 141, 238, 0.1);
  color: #b0b0d0;
}

.btn-cancel:active {
  transform: scale(0.98);
}

.btn-save {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(5, 150, 105, 0.2);
}

.edit-profile-container.dark-theme .btn-save {
  background: linear-gradient(135deg, #5B8DEE 0%, #4c63d2 100%);
  box-shadow: 0 4rpx 12rpx rgba(91, 141, 238, 0.2);
}

.btn-save:active {
  transform: scale(0.98);
}

.btn-save.loading {
  opacity: 0.8;
}
</style>
