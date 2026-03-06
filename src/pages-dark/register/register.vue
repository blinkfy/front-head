<template> 
  <view class="register-bg">
    <!-- 科技背景动效 -->
    <view class="tech-bg">
      <view class="tech-grid"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 8" :key="n" :style="getParticleStyle(n)"></view>
      </view>
      <view class="circuit-lines">
        <view class="circuit-line line-1"></view>
        <view class="circuit-line line-2"></view>
        <view class="circuit-line line-3"></view>
      </view>
    </view>
    
    <!-- 主注册卡片 -->
    <view class="register-card">
      <!-- 头部区域 -->
      <view class="register-header">
        <view class="app-logo">
          <image src="/static/person.jpeg" class="logo-image" mode="aspectFit" />
          <view class="logo-rings">
            <view class="ring ring-1"></view>
            <view class="ring ring-2"></view>
            <view class="ring ring-3"></view>
          </view>
        </view>
        <view class="register-title">加入分投侠</view>
        <view class="register-subtitle">
          <text class="subtitle-line">创建您的专属账号</text>
          <text class="subtitle-line">开启智能分类之旅</text>
        </view>
      </view>
      
      <!-- 注册表单 -->
      <form class="register-form" @submit.prevent="onRegister">
        <view class="form-group">
          <text class="form-label">👤 用户名</text>
          <view class="input-wrapper-simple">
            <input
              v-model="username"
              placeholder="请输入用户名"
              maxlength="20"
              class="form-input-simple"
              type="text"
              @confirm="handleEnterKey"
              @keyup.enter="handleEnterKey"
              @keyup="handleKeyup"
            />
          </view>
        </view>
        
        <view class="form-group">
          <text class="form-label">🔐 密码</text>
          <view class="input-wrapper-simple">
            <input
              v-model="password"
              :key="passwordKey"
              :type="showPwd ? 'text' : 'password'"
              placeholder="请输入密码"
              maxlength="20"
              class="form-input-simple"
              @confirm="handleEnterKey"
              @keyup.enter="handleEnterKey"
              @keyup="handleKeyup"
            />
            <text class="pwd-toggle" @click="togglePassword">
              {{ showPwd ? '👁️' : '🔒' }}
            </text>
          </view>
        </view>
        
        <view class="form-group">
          <text class="form-label">🔄 确认密码</text>
          <view class="input-wrapper-simple">
            <input
              v-model="confirmPwd"
              :key="confirmPasswordKey"
              :type="showConfirmPwd ? 'text' : 'password'"
              placeholder="请再次输入密码"
              maxlength="20"
              class="form-input-simple"
              @confirm="handleEnterKey"
              @keyup.enter="handleEnterKey"
              @keyup="handleKeyup"
            />
            <text class="pwd-toggle" @click="toggleConfirmPassword">
              {{ showConfirmPwd ? '👁️' : '🔒' }}
            </text>
          </view>
        </view>

        <!-- 科技风验证码区域 -->
        <view class="form-group">
          <text class="form-label">🛡️ 验证码</text>
          <captcha-box v-model="captchaInput" ref="captchaRef" @confirm="handleEnterKey" />
          <text class="hint" v-if="captchaHint">{{ captchaHint }}</text>
        </view>

        <button class="register-btn" type="button" :disabled="isLoading" @click="handleRegisterClick">
          <view class="btn-content" v-if="!isLoading">
            <text class="btn-icon">🚀</text>
            <text class="btn-text">创建账号</text>
          </view>
          <view class="loading-content" v-else>
            <view class="loading-spinner"></view>
            <text class="loading-text">正在注册...</text>
          </view>
          <view class="btn-glow"></view>
        </button>
        
        <view class="login-row">
          <text class="login-prefix">已有账号？</text>
          <text class="login-link" @click="goLogin">立即登录</text>
        </view>
      </form>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { register } from '@/api/user'
import CaptchaBox from '@/components/CaptchaBox-black.vue'

// 表单字段
const username = ref('')
const password = ref('')
const confirmPwd = ref('')
const showPwd = ref(false)
const showConfirmPwd = ref(false)
const isLoading = ref(false)
const passwordKey = ref(0) // 用于强制重新渲染密码输入框
const confirmPasswordKey = ref(0) // 用于强制重新渲染确认密码输入框

// 验证码相关
const captchaInput = ref('')
const captchaHint = ref('')
const captchaRef = ref(null)

// 生成粒子动画样式
const getParticleStyle = (index) => {
  const positions = [
    { left: '5%', top: '15%', animationDelay: '0s' },
    { left: '20%', top: '80%', animationDelay: '2s' },
    { left: '80%', top: '25%', animationDelay: '1s' },
    { left: '90%', top: '70%', animationDelay: '3s' },
    { left: '15%', top: '45%', animationDelay: '1.5s' },
    { left: '75%', top: '10%', animationDelay: '2.5s' },
    { left: '40%', top: '85%', animationDelay: '0.5s' },
    { left: '60%', top: '55%', animationDelay: '3.5s' }
  ]
  return positions[index - 1] || positions[0]
}

// 生成随机验证码文本（避免易混淆字符）

// captcha handled by CaptchaBox component

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
    uni.showToast({ title: '密码长度至少6λ', icon: 'none' })
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

  // 验证码校验（使用 CaptchaBox 的 validate）
  if (!captchaRef.value || typeof captchaRef.value.validate !== 'function' || !captchaRef.value.validate()) {
    captchaHint.value = '验证码错误，请重新输入'
    // refresh via component
    captchaRef.value && typeof captchaRef.value.refresh === 'function' && captchaRef.value.refresh()
    uni.showToast({ title: '验证码错误', icon: 'none' })
    return
  }

  console.log('开始注册请求')
  // 通过验证码后继续发送注册请求
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
      uni.redirectTo({ url: '/pages-dark/index/index' })
    }, 1200)
  }).catch(err => {
    uni.showToast({ title: '注册失败: ' + err.msg, icon: 'none' })
    console.error('注册失败:', err)
    isLoading.value = false
    captchaRef.value && typeof captchaRef.value.refresh === 'function' && captchaRef.value.refresh()
  })
}

function goLogin() {
  uni.redirectTo({ url: '/pages-dark/index/index' })
}

// 切换密码显示/隐藏
function togglePassword() {
  showPwd.value = !showPwd.value
  // 微信小程序中强制重新渲染input组件
  /* #ifdef MP-WEIXIN */
  passwordKey.value++
  /* #endif */
}

// 切换确认密码显示/隐藏
function toggleConfirmPassword() {
  showConfirmPwd.value = !showConfirmPwd.value
  // 微信小程序中强制重新渲染input组件
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

// 页面加载时先生成一次
onMounted(() => {
  // captcha component will initialize itself
})
</script>

<style scoped>
/* 主背景 */
.register-bg {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 25%, #2d1b69 50%, #1e3a5f 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  position: relative;
  overflow: hidden;
}

/* 科技背景元素 */
.tech-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.tech-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.1) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 20s linear infinite;
}

@keyframes gridMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(50px, 50px); }
}

/* 浮动粒子 */
.floating-particles {
  position: absolute;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 6rpx;
  height: 6rpx;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  border-radius: 50%;
  animation: float 8s ease-in-out infinite;
  box-shadow: 0 0 20rpx rgba(64, 224, 255, 0.6);
}

@keyframes float {
  0%, 100% { transform: translateY(0px) scale(1); opacity: 0.7; }
  50% { transform: translateY(-40rpx) scale(1.3); opacity: 1; }
}

/* 电路线条 */
.circuit-lines {
  position: absolute;
  width: 100%;
  height: 100%;
}

.circuit-line {
  position: absolute;
  background: linear-gradient(90deg, transparent, #40e0ff, transparent);
  opacity: 0.3;
  animation: pulse 4s ease-in-out infinite;
}

.line-1 {
  top: 20%;
  left: 0;
  width: 100%;
  height: 2rpx;
  animation-delay: 0s;
}

.line-2 {
  top: 60%;
  left: 0;
  width: 100%;
  height: 2rpx;
  animation-delay: 1.5s;
}

.line-3 {
  top: 0;
  left: 70%;
  width: 2rpx;
  height: 100%;
  background: linear-gradient(0deg, transparent, #4ecdc4, transparent);
  animation-delay: 3s;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

/* 主注册卡片 */
.register-card {
  width: 90vw;
  max-width: 100vh;
  background: rgba(15, 15, 35, 0.95);
  border-radius: 32rpx;
  backdrop-filter: blur(20px);
  border: 2rpx solid rgba(64, 224, 255, 0.3);
  box-shadow: 
    0 16rpx 64rpx rgba(0, 0, 0, 0.4),
    0 0 80rpx rgba(64, 224, 255, 0.1),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.1);
  padding: 50rpx 45rpx;
  position: relative;
  z-index: 2;
  overflow: hidden;
}

.register-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2rpx;
  background: linear-gradient(90deg, transparent, #40e0ff, transparent);
  animation: scanTop 3s ease-in-out infinite;
}

@keyframes scanTop {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

/* 头部区域 */
.register-header {
  text-align: center;
  margin-bottom: 50rpx;
  position: relative;
}

.app-logo {
  position: relative;
  display: inline-block;
  margin-bottom: 30rpx;
}

.logo-image {
  width: 100rpx;
  height: 100rpx;
  display: block;
  border-radius: 50%;
  filter: drop-shadow(0 0 30rpx rgba(64, 224, 255, 0.6));
  z-index: 2;
  position: relative;
  background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(64, 224, 255, 0.1));
  border: 3rpx solid rgba(64, 224, 255, 0.3);
  padding: 8rpx;
  animation: logoFloat 3s ease-in-out infinite;
}

@keyframes logoFloat {
  0%, 100% { 
    transform: translateY(0px) scale(1);
    filter: drop-shadow(0 0 30rpx rgba(64, 224, 255, 0.6));
  }
  50% { 
    transform: translateY(-6rpx) scale(1.05);
    filter: drop-shadow(0 8rpx 30rpx rgba(64, 224, 255, 0.8));
  }
}

.logo-rings {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.ring {
  position: absolute;
  border: 2rpx solid rgba(64, 224, 255, 0.3);
  border-radius: 50%;
  animation: rotate 10s linear infinite;
}

.ring-1 {
  width: 140rpx;
  height: 140rpx;
  top: -70rpx;
  left: -70rpx;
  animation-duration: 8s;
}

.ring-2 {
  width: 180rpx;
  height: 180rpx;
  top: -90rpx;
  left: -90rpx;
  animation-duration: 12s;
  animation-direction: reverse;
}

.ring-3 {
  width: 220rpx;
  height: 220rpx;
  top: -110rpx;
  left: -110rpx;
  animation-duration: 15s;
}

@keyframes rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.register-title {
  font-size: 44rpx;
  font-weight: 700;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4, #44a08d);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 30rpx rgba(64, 224, 255, 0.5);
  margin-bottom: 20rpx;
  letter-spacing: 3rpx;
}

.register-subtitle {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.subtitle-line {
  color: rgba(255, 255, 255, 0.7);
  font-size: 24rpx;
  letter-spacing: 2rpx;
}

/* 表单样式 */
.register-form {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.form-group {
  position: relative;
}

.form-label {
  display: block;
  font-size: 26rpx;
  color: #40e0ff;
  margin-bottom: 12rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
}

/* 简化的输入框样式 - H5兼容 */
.input-wrapper-simple {
  position: relative;
  background: rgba(255, 255, 255, 0.1);
  border: 2rpx solid rgba(64, 224, 255, 0.5);
  border-radius: 16rpx;
  margin-bottom: 32rpx;
  min-height: 80rpx;
  transition: all 0.3s ease;
}

.input-wrapper-simple:focus-within {
  border-color: #40e0ff;
  box-shadow: 0 0 15rpx rgba(64, 224, 255, 0.3);
}

.form-input-simple {
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

.form-input-simple::placeholder {
  color: rgba(255, 255, 255, 0.5);
  font-size: 26rpx;
  vertical-align: middle;
}

/* 微信小程序额外修复 */
/* #ifdef MP-WEIXIN */
.input-wrapper-simple {
  align-items: stretch;
}

.form-input-simple {
  display: flex;
  align-items: center;
  padding: 0 15rpx;
  line-height: normal;
}
/* #endif */

/* H5端额外优化 */
/* #ifdef H5 */
.form-input-simple:focus {
  outline: none;
}
/* #endif */

.pwd-toggle {
  position: absolute;
  right: 20rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 30rpx;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  transition: color 0.3s ease;
  z-index: 3;
  padding: 10rpx;
}

.pwd-toggle:active {
  color: #40e0ff;
}

/* 科技风验证码区域 */
.captcha-container {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.captcha-input-wrapper {
  flex: 1;
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 14rpx;
  border: 2rpx solid rgba(64, 224, 255, 0.3);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  overflow: hidden;
}

.captcha-input-wrapper.focused {
  border-color: #40e0ff;
  box-shadow: 
    0 0 20rpx rgba(64, 224, 255, 0.3),
    inset 0 0 20rpx rgba(64, 224, 255, 0.1);
}

.captcha-input {
  width: 100%;
  height: 75rpx;
  padding: 0 18rpx;
  background: transparent;
  border: none;
  outline: none;
  color: #fff !important;
  font-size: 26rpx;
  letter-spacing: 2rpx;
  -webkit-text-fill-color: #fff !important;
  text-transform: uppercase;
  vertical-align: middle;
  box-sizing: border-box;
  
  /* H5端样式 - 使用flex居中 */
  /* #ifdef H5 */
  display: flex;
  align-items: center;
  line-height: normal;
  /* #endif */
  
  /* 微信小程序样式 - 使用line-height居中 */
  /* #ifdef MP-WEIXIN */
  line-height: 75rpx;
  padding-top: 0;
  padding-bottom: 0;
  /* #endif */
  
  /* App端样式 */
  /* #ifdef APP-PLUS */
  line-height: 75rpx;
  /* #endif */
  
  /* 支付宝小程序样式 */
  /* #ifdef MP-ALIPAY */
  line-height: 75rpx;
  /* #endif */
  
  /* 其他小程序样式 */
  /* #ifdef MP */
  line-height: 75rpx;
  /* #endif */
}

.captcha-input::placeholder {
  color: rgba(255, 255, 255, 0.4) !important;
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

/* 注册按钮 */
.register-btn {
  position: relative;
  width: 100%;
  padding: 28rpx 0;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4, #44a08d);
  border: none;
  border-radius: 18rpx;
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s ease;
  box-shadow: 
    0 8rpx 32rpx rgba(64, 224, 255, 0.3),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.2);
  margin-top: 20rpx;
}

.register-btn:disabled {
  opacity: 0.8;
  cursor: not-allowed;
}

.register-btn:active:not(:disabled) {
  transform: translateY(2rpx);
  box-shadow: 
    0 4rpx 16rpx rgba(64, 224, 255, 0.4),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.2);
}

.btn-content,
.loading-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  position: relative;
  z-index: 2;
}

.btn-icon {
  font-size: 26rpx;
}

.btn-text {
  letter-spacing: 2rpx;
}

.loading-spinner {
  width: 26rpx;
  height: 26rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.3);
  border-top: 3rpx solid #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  letter-spacing: 2rpx;
}

.btn-glow {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  transition: left 0.6s ease;
}

.register-btn:active:not(:disabled) .btn-glow {
  left: 100%;
}

/* 登录区域 */
.login-row {
  text-align: center;
  margin-top: 16rpx;
}

.login-prefix {
  color: rgba(255, 255, 255, 0.6);
  font-size: 24rpx;
  margin-right: 8rpx;
}

.login-link {
  color: #40e0ff;
  font-weight: 600;
  font-size: 24rpx;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.3s ease;
  text-shadow: 0 0 10rpx rgba(64, 224, 255, 0.5);
}

.login-link:active {
  color: #4ecdc4;
  text-shadow: 0 0 15rpx rgba(78, 205, 196, 0.8);
}
</style>
