<template>
  <view class="register-page">
    <!-- 顶部绿色背景区域 -->
    <view class="header-bg">
      <!-- 装饰圆圈 -->
      <view class="decoration-circle circle-1"></view>
      <view class="decoration-circle circle-2"></view>
      <view class="decoration-circle circle-3"></view>
      
      <!-- 头部内容 -->
      <view class="header-content">
        <view class="header-top">
          <view class="back-btn" @click="goLogin">
            <text class="back-icon">‹</text>
          </view>
        </view>
        
        <view class="header-main">
          <view class="logo-wrap">
            <image src="/static/person.webp.png" class="logo-image" mode="aspectFit" />
          </view>
          <view class="header-text">
            <text class="welcome-title">欢迎加入</text>
            <text class="app-name">分投侠</text>
            <text class="app-slogan">开启您的环保之旅</text>
          </view>
        </view>
      </view>
      
      <!-- 波浪装饰 -->
      <view class="wave-decoration">
        <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="#ffffff"/>
        </svg>
      </view>
    </view>
    
    <!-- 注册表单区域 -->
    <view class="register-form-wrap">
      <!-- 背景装饰球 -->
      <view class="bg-sphere sphere-blue"></view>
      <view class="bg-sphere sphere-orange"></view>
      <view class="bg-sphere sphere-green"></view>
      <view class="form-card">
        <view class="form-header">
          <text class="form-title">创建账号</text>
          <text class="form-subtitle">填写以下信息完成注册</text>
        </view>
        
        <form class="register-form" @submit.prevent="onRegister">
          <!-- 用户名输入 -->
          <view class="input-group">
            <view class="input-label">
              <text class="label-icon">👤</text>
              <text class="label-text">用户名</text>
            </view>
            <view class="input-wrap">
              <input
                v-model="username"
                placeholder="请输入用户名"
                maxlength="20"
                class="form-input"
                type="text"
                @confirm="handleEnterKey"
                @keyup.enter="handleEnterKey"
                @keyup="handleKeyup"
              />
            </view>
          </view>
          
          <!-- 密码输入 -->
          <view class="input-group">
            <view class="input-label">
              <text class="label-icon">🔐</text>
              <text class="label-text">密码</text>
            </view>
            <view class="input-wrap">
              <input
                v-model="password"
                :key="passwordKey"
                :type="showPwd ? 'text' : 'password'"
                placeholder="请输入密码（至少6位）"
                maxlength="20"
                class="form-input"
                @confirm="handleEnterKey"
                @keyup.enter="handleEnterKey"
                @keyup="handleKeyup"
              />
              <view class="pwd-toggle" @click="togglePassword">
                <text class="toggle-icon">{{ showPwd ? '👁️' : '🔒' }}</text>
              </view>
            </view>
            <text class="input-hint">密码需包含大小写字母、数字、特殊字符中至少两种</text>
          </view>
          
          <!-- 确认密码 -->
          <view class="input-group">
            <view class="input-label">
              <text class="label-icon">🔄</text>
              <text class="label-text">确认密码</text>
            </view>
            <view class="input-wrap">
              <input
                v-model="confirmPwd"
                :key="confirmPasswordKey"
                :type="showConfirmPwd ? 'text' : 'password'"
                placeholder="请再次输入密码"
                maxlength="20"
                class="form-input"
                @confirm="handleEnterKey"
                @keyup.enter="handleEnterKey"
                @keyup="handleKeyup"
              />
              <view class="pwd-toggle" @click="toggleConfirmPassword">
                <text class="toggle-icon">{{ showConfirmPwd ? '👁️' : '🔒' }}</text>
              </view>
            </view>
          </view>
          
          <!-- 验证码 -->
          <view class="input-group captcha-group">
            <view class="input-label">
              <text class="label-icon">🛡️</text>
              <text class="label-text">验证码</text>
            </view>
            <captcha-box v-model="captchaInput" ref="captchaRef" @confirm="handleEnterKey" />
            <text class="captcha-hint" v-if="captchaHint">{{ captchaHint }}</text>
          </view>
          
          <!-- 注册按钮 -->
          <button type="submit" id="registerBtn" class="register-btn" :disabled="isLoading" @click="handleRegisterClick">
            <view class="light-track"></view>
            <view class="btn-content" v-if="!isLoading">
              <text class="btn-text">创建账号</text>
            </view>
            <view class="loading-content" v-else>
              <view class="loading-spinner"></view>
              <text class="loading-text">注册中...</text>
            </view>
          </button>
          
          <!-- 登录链接 -->
          <view class="login-row">
            <text class="login-text">已有账号？</text>
            <text class="login-link" @click="goLogin">立即登录</text>
          </view>
        </form>
      </view>
      
      <!-- 底部信息 -->
      <view class="footer-info">
        <text class="footer-text">🌿 加入我们，一起为环保贡献力量</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { register } from '@/api/user'
import CaptchaBox from '@/components/CaptchaBox.vue'

// 表单字段
const username = ref('')
const password = ref('')
const confirmPwd = ref('')
const showPwd = ref(false)
const showConfirmPwd = ref(false)
const isLoading = ref(false)
const passwordKey = ref(0)
const confirmPasswordKey = ref(0)

// 验证码相关
const captchaInput = ref('')
const captchaHint = ref('')
const captchaRef = ref(null)

// 点击处理函数
function handleRegisterClick() {
  onRegister()
}

// 注册提交
function onRegister() {
  if (!username.value){ 
    captchaHint.value = '请输入用户名'
    uni.showToast({ title: '请输入用户名', icon: 'none' })
    return
  } 
  if (!password.value){
    captchaHint.value = '请输入密码'
    uni.showToast({ title: '请输入密码', icon: 'none' })
    return
  }
  if (!confirmPwd.value){
    captchaHint.value = '请确认密码'
    uni.showToast({ title: '请确认密码', icon: 'none' })
    return
  }
  if (password.value !== confirmPwd.value){
    captchaHint.value = '两次密码不一致'
    uni.showToast({ title: '两次密码不一致', icon: 'none' })
    return
  } 
  if (password.value.length < 6) {
    captchaHint.value = '密码过于简单'
    uni.showToast({ title: '密码长度至少6位', icon: 'none' })
    return
  }
  
  let complexity = 0;
  if (/[a-z]/.test(password.value)) complexity++;
  if (/[A-Z]/.test(password.value)) complexity++;
  if (/[0-9]/.test(password.value)) complexity++;
  if (/[^A-Za-z0-9]/.test(password.value)) complexity++;
  if (complexity < 2) {
    captchaHint.value = '密码过于简单'
    uni.showToast({ title: '密码需包含大小写字母、数字、特殊字符中至少两种', icon: 'none' })
    return
  }

  // 验证码校验
  if (!captchaRef.value || typeof captchaRef.value.validate !== 'function' || !captchaRef.value.validate()) {
    captchaHint.value = '验证码错误，请重新输入'
    captchaRef.value && typeof captchaRef.value.refresh === 'function' && captchaRef.value.refresh()
    uni.showToast({ title: '验证码错误', icon: 'none' })
    return
  }

  console.log('开始注册请求')
  isLoading.value = true
  
  register({ username: username.value, password: password.value }).then(res => {
    uni.showToast({ title: '注册成功', icon: 'success' })
    uni.setStorageSync('autoLogin', true)
    uni.setStorageSync('savedUser', {
      username: username.value,
      password: password.value
    })
    setTimeout(() => {
      isLoading.value = false
      uni.redirectTo({ url: '/pages/index/index' })
    }, 1200)
  }).catch(err => {
    uni.showToast({ title: '注册失败: ' + err.msg, icon: 'none' })
    console.error('注册失败:', err)
    isLoading.value = false
    captchaRef.value && typeof captchaRef.value.refresh === 'function' && captchaRef.value.refresh()
  })
}

function goLogin() {
  uni.redirectTo({ url: '/pages/index/index' })
}

// 切换密码显示/隐藏
function togglePassword() {
  showPwd.value = !showPwd.value
  /* #ifdef MP-WEIXIN */
  passwordKey.value++
  /* #endif */
}

// 切换确认密码显示/隐藏
function toggleConfirmPassword() {
  showConfirmPwd.value = !showConfirmPwd.value
  /* #ifdef MP-WEIXIN */
  confirmPasswordKey.value++
  /* #endif */
}

// 回车键处理函数
function handleEnterKey() {
  onRegister()
}

// 键盘事件处理
function handleKeyup(event) {
  if (event.keyCode === 13 || event.key === 'Enter') {
    onRegister()
  }
}

onMounted(() => {
  // captcha component will initialize itself
  
  // 注册按钮鼠标光感追踪
  if (typeof document !== 'undefined') {
    setTimeout(() => {
      const registerBtn = document.getElementById('registerBtn')
      if (registerBtn) {
        registerBtn.addEventListener('mousemove', (e) => {
          const rect = registerBtn.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * 100
          const y = ((e.clientY - rect.top) / rect.height) * 100
          registerBtn.style.setProperty('--mouse-x', x + '%')
          registerBtn.style.setProperty('--mouse-y', y + '%')
        })
      }
    }, 500)
  }
})
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  background: #ffffff;
  display: flex;
  flex-direction: column;
}

/* 顶部绿色背景 */
.header-bg {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  position: relative;
  padding: 20rpx 30rpx 60rpx;
  overflow: hidden;
}

/* 装饰圆圈 */
.decoration-circle {
  position: absolute;
  border-radius: 50%;
  border: 2rpx solid rgba(255, 255, 255, 0.1);
}

.circle-1 {
  width: 300rpx;
  height: 300rpx;
  top: -100rpx;
  right: -100rpx;
  background: rgba(255, 255, 255, 0.05);
}

.circle-2 {
  width: 200rpx;
  height: 200rpx;
  bottom: 50rpx;
  left: -60rpx;
  background: rgba(255, 255, 255, 0.03);
}

.circle-3 {
  width: 100rpx;
  height: 100rpx;
  top: 40rpx;
  right: 100rpx;
  background: rgba(255, 255, 255, 0.08);
}

/* 头部内容 */
.header-content {
  position: relative;
  z-index: 10;
}

.header-top {
  margin-bottom: 0rpx;
}

.back-btn {
  width: 52rpx;
  height: 52rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
}

.back-icon {
  color: #ffffff;
  font-size: 40rpx;
  font-weight: bold;
  margin-left: -4rpx;
}

.header-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.logo-wrap {
  width: 120rpx;
  height: 120rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
  backdrop-filter: blur(10px);
  border: 2rpx solid rgba(255, 255, 255, 0.3);
}

.logo-image {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
}

.header-text {
  display: flex;
  flex-direction: column;
}

.welcome-title {
  color: rgba(255, 255, 255, 0.9);
  font-size: 24rpx;
  margin-bottom: 4rpx;
}

.app-name {
  color: #ffffff;
  font-size: 40rpx;
  font-weight: 700;
  margin-bottom: 4rpx;
}

.app-slogan {
  color: rgba(255, 255, 255, 0.9);
  font-size: 22rpx;
}

/* 波浪装饰 */
.wave-decoration {
  position: absolute;
  bottom: -2rpx;
  left: 0;
  right: 0;
  height: 50rpx;
}

.wave-decoration svg {
  width: 100%;
  height: 100%;
}

/* 注册表单区域 */
.register-form-wrap {
  flex: 1;
  padding: 0 40rpx 40rpx;
  margin-top: -40rpx;
  position: relative;
  z-index: 20;
  overflow: hidden;
}

/* 背景装饰球 */
.bg-sphere {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.sphere-blue {
  width: 220rpx;
  height: 220rpx;
  top: 40rpx;
  right: 10rpx;
  background: linear-gradient(135deg, #93c5fd 0%, #60a5fa 50%, #3b82f6 100%);
  opacity: 0.18;
  animation: floatSphere 8s ease-in-out infinite;
}

.sphere-orange {
  width: 260rpx;
  height: 260rpx;
  bottom: 180rpx;
  left: -80rpx;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%);
  opacity: 0.15;
  animation: floatSphere 10s ease-in-out infinite reverse;
}

.sphere-green {
  width: 180rpx;
  height: 180rpx;
  bottom: 80rpx;
  right: 20rpx;
  background: linear-gradient(135deg, #86efac 0%, #4ade80 50%, #22c55e 100%);
  opacity: 0.12;
  animation: floatSphere 9s ease-in-out infinite 1s;
}

@keyframes floatSphere {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-20rpx) scale(1.05);
  }
}

.form-card {
  background: rgba(255, 255, 255, 0.65);
  border-radius: 24rpx;
  padding: 36rpx 30rpx;
  box-shadow: 0 8rpx 40rpx rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(20rpx);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.form-header {
  text-align: center;
  margin-bottom: 28rpx;
}

.form-title {
  display: block;
  color: #1f2937;
  font-size: 36rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}

.form-subtitle {
  display: block;
  color: #9ca3af;
  font-size: 24rpx;
}

/* 表单样式 */
.register-form {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.input-group {
  display: flex;
  flex-direction: column;
}

.input-label {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}

.label-icon {
  font-size: 28rpx;
  margin-right: 8rpx;
}

.label-text {
  color: #4b5563;
  font-size: 28rpx;
  font-weight: 500;
}

/* 输入框容器 - 下凹材质效果 */
.input-wrap {
  position: relative;
  background: linear-gradient(145deg, #e5e7eb 0%, #f3f4f6 30%, #ffffff 50%, #f9fafb 100%);
  border: 1rpx solid rgba(148, 163, 184, 0.25);
  border-radius: 16rpx;
  height: 90rpx;
  display: flex;
  align-items: center;
  padding: 0 24rpx;
  transition: all 0.3s ease;
  box-shadow: 
    inset 0 2rpx 4rpx rgba(0, 0, 0, 0.08),
    inset 0 1rpx 2rpx rgba(0, 0, 0, 0.05),
    0 1rpx 0 rgba(255, 255, 255, 0.8);
  overflow: hidden;
}

/* 顶部边缘阴影 - 增强下凹感 */
.input-wrap::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1rpx;
  background: linear-gradient(90deg, transparent 0%, rgba(148, 163, 184, 0.3) 50%, transparent 100%);
  pointer-events: none;
}

/* 底部边缘高光 */
.input-wrap::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1rpx;
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%);
  pointer-events: none;
}

.input-wrap:focus-within {
  border-color: #10b981;
  background: linear-gradient(145deg, #f0fdf4 0%, #ffffff 50%, #f0fdf4 100%);
  box-shadow: 
    inset 0 2rpx 6rpx rgba(0, 0, 0, 0.1),
    0 0 0 4rpx rgba(16, 185, 129, 0.1),
    0 2rpx 8rpx rgba(16, 185, 129, 0.15);
}

.form-input {
  flex: 1;
  height: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #1f2937;
  font-size: 28rpx;
}

.form-input::placeholder {
  color: #9ca3af;
}

.pwd-toggle {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.toggle-icon {
  font-size: 32rpx;
  color: #9ca3af;
}

.input-hint {
  color: #9ca3af;
  font-size: 22rpx;
  margin-top: 8rpx;
}

/* 验证码提示 */
.captcha-hint {
  color: #ef4444;
  font-size: 24rpx;
  margin-top: 12rpx;
}

/* 注册按钮 - 炫光效果 */
.register-btn {
  width: 100%;
  height: 96rpx;
  background: linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%);
  border: none;
  border-radius: 48rpx;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 20rpx;
  box-shadow: 
    0 8rpx 24rpx rgba(16, 185, 129, 0.4),
    0 0 40rpx rgba(16, 185, 129, 0.2),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

/* 鼠标光感追踪 */
.register-btn .light-track {
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 120rpx;
  height: 120rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.5) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: 2;
}

.register-btn:hover .light-track {
  opacity: 1;
}

/* 流动炫光效果 */
.register-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0) 20%,
    rgba(255, 255, 255, 0.4) 50%,
    rgba(255, 255, 255, 0) 80%,
    transparent 100%
  );
  animation: shimmer 3s ease-in-out infinite;
  pointer-events: none;
}

/* 顶部高光 */
.register-btn::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, transparent 100%);
  border-radius: 48rpx 48rpx 0 0;
  pointer-events: none;
}

@keyframes shimmer {
  0% { left: -100%; }
  50%, 100% { left: 100%; }
}

.register-btn:disabled {
  opacity: 0.7;
}

.register-btn:active:not(:disabled) {
  transform: translateY(2rpx) scale(0.98);
  box-shadow: 
    0 4rpx 16rpx rgba(16, 185, 129, 0.4),
    0 0 30rpx rgba(16, 185, 129, 0.15);
}

.btn-content,
.loading-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.loading-spinner {
  width: 32rpx;
  height: 32rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.3);
  border-top: 3rpx solid #ffffff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  font-size: 28rpx;
}

/* 登录链接 */
.login-row {
  text-align: center;
  margin-top: 30rpx;
}

.login-text {
  color: #9ca3af;
  font-size: 26rpx;
}

.login-link {
  color: #10b981;
  font-weight: 600;
  font-size: 26rpx;
  margin-left: 8rpx;
}

/* 底部信息 */
.footer-info {
  text-align: center;
  margin-top: 40rpx;
}

.footer-text {
  color: #9ca3af;
  font-size: 24rpx;
}
</style>
