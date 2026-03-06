<template>
  <view class="password-container">
    <!-- 简化背景效果 -->
    <view class="bg-overlay">
      <view class="bg-grid"></view>
      <view class="bg-particles">
        <view class="particle" v-for="n in 6" :key="n"></view>
      </view>
      <!-- 蓝橙球形装饰 -->
      <view class="bg-circle circle-blue"></view>
      <view class="bg-circle circle-orange"></view>
      <view class="bg-circle circle-green"></view>
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

        <button class="submit-btn" @click="onChangePassword">
          <text class="btn-text">确认修改</text>
          <view class="btn-glow"></view>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { changePassword } from '@/api/user'
const username = ref('')
const password = ref('')
const newPassword = ref('')

// 页面加载时添加鼠标光感追踪
onMounted(() => {
  if (typeof document !== 'undefined') {
    const passwordCard = document.querySelector('.password-card')
    if (passwordCard) {
      passwordCard.addEventListener('mousemove', (e) => {
        const rect = passwordCard.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        passwordCard.style.setProperty('--mouse-x', x + '%')
        passwordCard.style.setProperty('--mouse-y', y + '%')
      })
    }
  }
})

function goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({
        url: '/pages/home/home'
      })
    }
}

function onChangePassword() {
  if (!username.value || !password.value || !newPassword.value) {
    uni.showToast({ title: '请填写完整信息', icon: 'none' }, 1500)
    return
  }
  // 密码强度校验
  if (newPassword.value.length < 6) {
    uni.showToast({ title: '密码长度至少6λ', icon: 'none' }, 1500)
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
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
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
    radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(52, 211, 153, 0.06) 0%, transparent 40%);
}

.bg-particles {
  position: absolute;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 8rpx;
  height: 8rpx;
  background: rgba(16, 185, 129, 0.3);
  border-radius: 50%;
  animation: particleFloat 6s ease-in-out infinite;
}

.particle:nth-child(1) { top: 20%; left: 15%; animation-delay: 0s; }
.particle:nth-child(2) { top: 40%; left: 80%; animation-delay: 2s; }
.particle:nth-child(3) { top: 70%; left: 25%; animation-delay: 4s; }
.particle:nth-child(4) { top: 85%; left: 70%; animation-delay: 1s; }
.particle:nth-child(5) { top: 15%; left: 60%; animation-delay: 3s; }
.particle:nth-child(6) { top: 60%; left: 90%; animation-delay: 5s; }

@keyframes particleFloat {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
  50% { transform: translateY(-10px) scale(1.2); opacity: 0.6; }
}

/* 蓝橙球形装饰 */
.bg-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.12;
  pointer-events: none;
}

.circle-blue {
  width: 600rpx;
  height: 600rpx;
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  top: 100rpx;
  left: -250rpx;
  animation: circleFloat1 10s ease-in-out infinite;
}

.circle-orange {
  width: 550rpx;
  height: 550rpx;
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
  top: 500rpx;
  right: -250rpx;
  animation: circleFloat2 12s ease-in-out infinite;
}

.circle-green {
  width: 500rpx;
  height: 500rpx;
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  bottom: 50rpx;
  left: 50rpx;
  animation: circleFloat3 8s ease-in-out infinite;
}

@keyframes circleFloat1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(30rpx, -20rpx) scale(1.02); }
  50% { transform: translate(20rpx, 30rpx) scale(0.98); }
  75% { transform: translate(-10rpx, 20rpx) scale(1.01); }
}

@keyframes circleFloat2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(-20rpx, 40rpx) scale(1.03); }
  66% { transform: translate(30rpx, -30rpx) scale(0.97); }
}

@keyframes circleFloat3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  20% { transform: translate(40rpx, 10rpx) scale(1.02); }
  40% { transform: translate(20rpx, -40rpx) scale(0.99); }
  60% { transform: translate(-30rpx, -20rpx) scale(1.01); }
  80% { transform: translate(-20rpx, 30rpx) scale(0.98); }
}

/* 返回按钮 */
.back-btn {
  position: absolute;
  top: 60rpx;
  left: 40rpx;
  width: 80rpx;
  height: 80rpx;
  background: rgba(16, 185, 129, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 50%;
  border: 2px solid rgba(16, 185, 129, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.3s ease;
}

.back-btn:active {
  transform: scale(0.9);
  background: rgba(16, 185, 129, 0.2);
}

.back-icon {
  color: #059669;
  font-size: 32rpx;
  font-weight: bold;
}

/* 主卡片 */
.password-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 700rpx;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  border-radius: 30rpx;
  border: 2px solid rgba(16, 185, 129, 0.15);
  padding: 60rpx 40rpx;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

/* 卡片内部光感效果 */
.password-card::before {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 400rpx;
  height: 400rpx;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.password-card:hover::before {
  opacity: 1;
}

/* 卡片头部 - 玻璃材质质感 */
.card-header {
  text-align: center;
  margin-bottom: 50rpx;
  padding: 40rpx 30rpx;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 50%, rgba(241, 245, 249, 0.85) 100%);
  border-radius: 24rpx;
  border: 1rpx solid rgba(148, 163, 184, 0.15);
  box-shadow: 
    inset 0 1rpx 0 rgba(255, 255, 255, 0.8),
    0 4rpx 16rpx rgba(0, 0, 0, 0.06);
  position: relative;
  overflow: hidden;
}

/* 顶部高光 */
.card-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, transparent 100%);
  pointer-events: none;
}

.header-icon {
  display: block;
  font-size: 80rpx;
  margin-bottom: 20rpx;
  animation: iconPulse 3s ease-in-out infinite;
  position: relative;
  z-index: 1;
}

@keyframes iconPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.header-title {
  display: block;
  color: #1f2937;
  font-size: 48rpx;
  font-weight: 700;
  margin-bottom: 1rpx;
  position: relative;
  z-index: 1;
}

.header-subtitle {
  display: block;
  color: #6b7280;
  font-size: 28rpx;
  letter-spacing: 1rpx;
  position: relative;
  z-index: 1;
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
  color: #059669;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
  letter-spacing: 1rpx;
}

/* 输入框 - 凹陷质感 */
.form-input {
  width: 100%;
  height: 100rpx;
  background: linear-gradient(145deg, #f3f4f6 0%, #ffffff 50%, #f9fafb 100%);
  border: 2rpx solid rgba(148, 163, 184, 0.2);
  border-radius: 20rpx;
  padding: 0 30rpx;
  color: #1f2937;
  font-size: 30rpx;
  transition: all 0.3s ease;
  box-sizing: border-box;
  box-shadow: 
    inset 0 2rpx 4rpx rgba(0, 0, 0, 0.06),
    inset 0 1rpx 2rpx rgba(0, 0, 0, 0.04),
    0 1rpx 0 rgba(255, 255, 255, 0.8);
  position: relative;
}

.form-input:focus {
  border-color: #10b981;
  box-shadow: 
    inset 0 2rpx 6rpx rgba(0, 0, 0, 0.08),
    0 0 0 4rpx rgba(16, 185, 129, 0.1),
    0 2rpx 8rpx rgba(16, 185, 129, 0.15);
  background: linear-gradient(145deg, #ffffff 0%, #f0fdf4 100%);
}

.form-input::placeholder {
  color: #9ca3af;
}

/* 密码提示 */
.password-tip {
  color: #6b7280;
  font-size: 22rpx;
  margin-top: 12rpx;
  line-height: 1.4;
}

/* 提交按钮 - 3D立体材质 */
.submit-btn {
  position: relative;
  width: 100%;
  height: 100rpx;
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  border: none;
  border-radius: 25rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: all 0.3s ease;
  margin-top: 20rpx;
  box-shadow: 
    0 6rpx 0 #065f46,
    0 8rpx 16rpx rgba(5, 150, 105, 0.4),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.3),
    inset 0 -1rpx 0 rgba(0, 0, 0, 0.1);
}

.submit-btn:active {
  transform: translateY(4rpx);
  box-shadow: 
    0 2rpx 0 #065f46,
    0 4rpx 8rpx rgba(5, 150, 105, 0.4),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.2);
}

/* 按钮顶部高光 */
.submit-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.25) 0%, transparent 100%);
  border-radius: 25rpx 25rpx 0 0;
  pointer-events: none;
}

.btn-text {
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  z-index: 2;
  position: relative;
  text-shadow: 0 1rpx 2rpx rgba(0, 0, 0, 0.2);
}

.btn-glow {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  transition: left 0.5s ease;
}

.submit-btn:active .btn-glow {
  left: 100%;
}
</style> 