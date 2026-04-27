<template>
  <view class="password-container">
    <!-- 简化背景效果 -->
    <view class="bg-overlay">
      <view class="bg-grid"></view>
      <view class="bg-particles">
        <view class="particle" v-for="n in 6" :key="n"></view>
      </view>
    </view>

    <!-- 返回按钮 -->
    <view class="back-btn" @click="goBack">
      <text class="back-icon">←</text>
    </view>

    <!-- 主卡片 -->
    <view class="password-card">
      <view class="card-header">
        <text class="header-icon">🔐</text>
        <text class="header-title">修改密码</text>
        <text class="header-subtitle">保护您的账户安全</text>
      </view>

      <view class="form-container">
        <view class="input-group">
          <text class="input-label">用户名</text>
          <input class="form-input" v-model="username" placeholder="请输入用户名" />
        </view>

        <view class="input-group">
          <text class="input-label">当前密码</text>
          <input class="form-input" v-model="password" type="password" placeholder="请输入当前密码" />
        </view>

        <view class="input-group">
          <text class="input-label">新密码</text>
          <input class="form-input" v-model="newPassword" type="password" placeholder="请输入新密码（至少6位）" />
          <text class="password-tip">密码需包含字母、数字等至少两种字符</text>
        </view>

        <view class="input-group">
          <text class="input-label">确认新密码</text>
          <input class="form-input" v-model="confirmPassword" type="password" placeholder="请再次输入新密码" />
        </view>

        <button class="submit-btn" @click="onChangePassword">
          <text class="btn-text">确认修改</text>
          <view class="btn-glow"></view>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { changePassword } from '@/api/user'
const username = ref('')
const password = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

function goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({
        url: '/pages-dark/home/home'
      })
    }
}

function onChangePassword() {
  if (!username.value || !password.value || !newPassword.value || !confirmPassword.value) {
    uni.showToast({ title: '请填写完整信息', icon: 'none' }, 1500)
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    uni.showToast({ title: '两次输入的新密码不一致', icon: 'none' })
    return
  }
  // 密码强度校验
  if (newPassword.value.length < 6) {
    uni.showToast({ title: '密码长度至少6位', icon: 'none' }, 1500)
    return
  }
  let complexity = 0;
  if (/[a-z]/.test(newPassword.value)) complexity++;
  if (/[A-Z]/.test(newPassword.value)) complexity++;
  if (/[0-9]/.test(newPassword.value)) complexity++;
  if (/[^A-Za-z0-9]/.test(newPassword.value)) complexity++;
  if (complexity < 2) {
    uni.showToast({ title: '密码需包含大小写字母、数字、特殊字符中至少两种', icon: 'none' }, 1500)
    return
  }
  changePassword({
    username: username.value,
    password: password.value,
    new_password: newPassword.value
  }).then(res => {
    //const data = res.data || res[1]?.data
    console.log('修改密码响应:', res)
    if (res && res.code === 0) {
      uni.showToast({ title: res.msg, icon: 'success' }, 1500)
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      uni.showToast({ title: res.msg || '修改失败', icon: 'none' },1500)
    }
  }).catch(err => {
    console.error('修改密码错误:', err)
    uni.showToast({ title: err.msg ||'网络错误，请稍后重试', icon: 'none' },1500)
  })
}
</script>

<style scoped>
/* 主容器 */
.password-container {
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #0a1a2f 0%, #051015 70%, #000508 100%);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  overflow: hidden;
}

/* 背景效果 */
.bg-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.bg-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.1) 1px, transparent 1px);
  background-size: 60px 60px;
  animation: gridFloat 20s linear infinite;
}

@keyframes gridFloat {
  0% { transform: translate(0, 0); }
  100% { transform: translate(60px, 60px); }
}

.bg-particles {
  position: absolute;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: radial-gradient(circle, #40e0ff 0%, transparent 70%);
  border-radius: 50%;
  animation: particleFloat 8s ease-in-out infinite;
}

.particle:nth-child(1) { top: 20%; left: 15%; animation-delay: 0s; }
.particle:nth-child(2) { top: 40%; left: 80%; animation-delay: 2s; }
.particle:nth-child(3) { top: 70%; left: 25%; animation-delay: 4s; }
.particle:nth-child(4) { top: 85%; left: 70%; animation-delay: 1s; }
.particle:nth-child(5) { top: 15%; left: 60%; animation-delay: 3s; }
.particle:nth-child(6) { top: 60%; left: 90%; animation-delay: 5s; }

@keyframes particleFloat {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
  50% { transform: translateY(-25px) scale(1.3); opacity: 1; }
}

/* 返回按钮 */
.back-btn {
  position: absolute;
  top: 60rpx;
  left: 40rpx;
  width: 80rpx;
  height: 80rpx;
  background: rgba(64, 224, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 50%;
  border: 2px solid rgba(64, 224, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.3s ease;
}

.back-btn:active {
  transform: scale(0.9);
  background: rgba(64, 224, 255, 0.3);
}

.back-icon {
  color: #40e0ff;
  font-size: 32rpx;
  font-weight: bold;
}

/* 主卡片 */
.password-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 700rpx;
  background: rgba(0, 30, 60, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 30rpx;
  border: 2px solid rgba(64, 224, 255, 0.3);
  padding: 60rpx 40rpx;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.3);
}

/* 卡片头部 */
.card-header {
  text-align: center;
  margin-bottom: 50rpx;
}

.header-icon {
  display: block;
  font-size: 80rpx;
  margin-bottom: 20rpx;
  animation: iconPulse 3s ease-in-out infinite;
}

@keyframes iconPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.header-title {
  display: block;
  color: #ffffff;
  font-size: 48rpx;
  font-weight: 700;
  margin-bottom: 1rpx;
  text-shadow: 0 0 20rpx rgba(64, 224, 255, 0.6);
}

.header-subtitle {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 28rpx;
  letter-spacing: 1rpx;
}

/* 表单容器 */
.form-container {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

/* 输入组 */
.input-group {
  display: flex;
  flex-direction: column;
}

.input-label {
  color: #40e0ff;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
  letter-spacing: 1rpx;
}

.form-input {
  width: 100%;
  height: 100rpx;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(64, 224, 255, 0.3);
  border-radius: 20rpx;
  padding: 0 30rpx;
  color: #ffffff;
  font-size: 30rpx;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #40e0ff;
  box-shadow: 0 0 0 4rpx rgba(64, 224, 255, 0.1);
  background: rgba(255, 255, 255, 0.15);
}

.form-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

/* 密码提示 */
.password-tip {
  color: rgba(255, 255, 255, 0.6);
  font-size: 22rpx;
  margin-top: 12rpx;
  line-height: 1.4;
}

/* 提交按钮 */
.submit-btn {
  position: relative;
  width: 100%;
  height: 100rpx;
  background: linear-gradient(45deg, #40e0ff, #00ff88);
  border: none;
  border-radius: 25rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: all 0.3s ease;
  margin-top: 20rpx;
}

.submit-btn:active {
  transform: scale(0.98);
}

.btn-text {
  color: #000000;
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  z-index: 2;
  position: relative;
}

.btn-glow {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
}

.submit-btn:active .btn-glow {
  left: 100%;
}
</style> 