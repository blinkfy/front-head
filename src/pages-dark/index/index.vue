/*Node.js*/
<template>
  <view class="login-bg">
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
    
    <!-- 主登录卡片 -->
    <view class="login-card">
      <!-- 头部区域 -->
      <view class="login-header">
        <view class="app-logo">
          <image src="/static/person.jpeg" class="logo-image" mode="aspectFit" />
          <view class="logo-rings">
            <view class="ring ring-1"></view>
            <view class="ring ring-2"></view>
            <view class="ring ring-3"></view>
          </view>
        </view>
        <view class="login-title">分投侠</view>
        <view class="login-subtitle">
          <text class="subtitle-line">智能垃圾分类系统</text>
          <text class="subtitle-line">请登录您的账号</text>
        </view>
      </view>
      
      <!-- 登录表单 -->
      <form class="login-form" @submit.prevent="onLogin(false)">
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
        
        <!-- 验证码区域（失败3次后显示） -->
        <view class="form-group captcha-form-group" v-if="showCaptcha">
          <text class="form-label">🛡️ 验证码</text>
          <captcha-box v-model="captchaInput" ref="captchaRef" @confirm="handleEnterKey" />
          <text class="hint" v-if="captchaHint">{{ captchaHint }}</text>
        </view>
        
        <view class="options-row">
          <view class="remember-me" @click="toggleRememberMe">
            <view class="tech-checkbox" :class="{ 'checked': rememberMe }">
              <view class="checkbox-inner"></view>
            </view>
            <text class="remember-text">记住我</text>
          </view>
        </view>
        
        <button type="submit" class="login-btn" @click="onLogin(false)" :disabled="isLoading">
          <view class="btn-content" v-if="!isLoading">
            <text class="btn-icon">🚀</text>
            <text class="btn-text">登录系统</text>
          </view>
          <view class="loading-content" v-else>
            <view class="loading-spinner"></view>
            <text class="loading-text">正在登录...</text>
          </view>
          <view class="btn-glow"></view>
        </button>
        
        <view class="register-row">
          <text class="register-prefix">还没有账号？</text>
          <text class="register-link" @click="onRegister">立即注册</text>
        </view>
      </form>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { login, userinfo } from '@/api/user'
import { checkDB } from '@/api/health'
import CaptchaBox from '@/components/CaptchaBox-black.vue'

const username = ref('')
const password = ref('')
const showPwd = ref(false)
const rememberMe = ref(true)
const isLoading = ref(false)
const passwordKey = ref(0) // 用于强制重新渲染密码输入框

// 登录失败次数与验证码相关
const loginFailCount = ref(0)  // 登录失败次数计数器
const showCaptcha = ref(false) // 是否显示验证码
const captchaInput = ref('')   // 验证码输入（v-model）
const captchaHint = ref('')    // 验证码提示信息
const captchaRef = ref(null)

// 生成粒子动画样式
const getParticleStyle = (index) => {
  const positions = [
    { left: '5%', top: '20%', animationDelay: '0s' },
    { left: '15%', top: '60%', animationDelay: '2s' },
    { left: '85%', top: '30%', animationDelay: '1s' },
    { left: '75%', top: '70%', animationDelay: '3s' },
    { left: '25%', top: '40%', animationDelay: '1.5s' },
    { left: '65%', top: '15%', animationDelay: '2.5s' },
    { left: '45%', top: '80%', animationDelay: '0.5s' },
    { left: '55%', top: '50%', animationDelay: '3.5s' }
  ]
  return positions[index - 1] || positions[0]
}

// captcha logic moved to shared component CaptchaBox

// 页面加载时检查是否有保存的登录信息
onMounted(() => {
  if (rememberMe.value) {
    const savedUser = uni.getStorageSync('savedUser')
    if (savedUser) {
      username.value = savedUser.username
      password.value = savedUser.password
      if(uni.getStorageSync('autoLogin')) {
        onLogin(true)
      }
    }
  }
})

function toggleRememberMe() {
  rememberMe.value = !rememberMe.value
}

// 切换密码显示/隐藏
function togglePassword() {
  showPwd.value = !showPwd.value
  // 微信小程序中强制重新渲染input组件
  /* #ifdef MP-WEIXIN */
  passwordKey.value++
  /* #endif */
}

// 处理回车键事件
function handleEnterKey() {
  onLogin(false)
}

// 通用键盘事件处理
function handleKeyup(event) {
  // 检查是否是回车键 (keyCode 13 或 key === 'Enter')
  if (event.keyCode === 13 || event.key === 'Enter') {
    handleEnterKey()
  }
}

function onLogin(isauto) {
  if (!username.value) return uni.showToast({ title: '请输入用户名', icon: 'none' })
  if (!password.value) return uni.showToast({ title: '请输入密码', icon: 'none' })
  
  // 如果已显示验证码，使用 CaptchaBox 组件进行验证
  if (showCaptcha.value) {
    if (!captchaRef.value || typeof captchaRef.value.validate !== 'function' || !captchaRef.value.validate()) {
      captchaHint.value = '验证码错误，请重新输入'
      captchaRef.value && typeof captchaRef.value.refresh === 'function' && captchaRef.value.refresh()
      uni.showToast({ title: '验证码错误', icon: 'none' })
      return
    }
  }
  
  isLoading.value = true
  
  login({ username: username.value, password: password.value }).then(async res => {
    // 登录成功,重置失败计数和验证码
    loginFailCount.value = 0
    showCaptcha.value = false
    captchaInput.value = ''
    captchaHint.value = ''
    
    uni.setStorageSync('token', res.token)
    try {
      const adminFlag = res.isAdmin === true
      if (adminFlag) {
        uni.setStorageSync('isAdmin', true)
      } else {
        uni.removeStorageSync('isAdmin')
      }
    } catch (e) {
      // ignore
    }
    
    // 获取并保存完整的用户信息
    try {
      const userInfoRes = await userinfo()
      if (userInfoRes && userInfoRes.data) {
        uni.setStorageSync('userInfo', userInfoRes.data)
        console.log('用户信息已保存:', userInfoRes.data)
      }
    } catch (e) {
      console.error('获取用户信息失败:', e)
    }
    
    uni.showToast({ title: isauto ? '自动登录' : '登录成功', icon: 'success' })
    // 如果勾选了"记住我"，则保存用户名和密码
    if (rememberMe.value) {
      uni.setStorageSync('savedUser', {
        username: username.value,
        password: password.value
      })
      uni.setStorageSync('autoLogin', true)
    } else {
      // 如果没有勾选"记住我"，则清除保存的信息
      uni.removeStorageSync('savedUser')
    }
    setTimeout(() => {
      isLoading.value = false
      uni.reLaunch({ url: '/pages-dark/home/home' })
    }, 1000)
  }).catch(err => {
    isLoading.value = false
    
    // 登录失败，增加失败计数
    console.log(err)
    try{
      if(err&&err.msg.includes('网络错误')){

      }else{
        loginFailCount.value++
      }
    }catch(e){
      loginFailCount.value++
    }
    
    // 如果失败次数达到3次，显示验证码
    if (loginFailCount.value >3 && !showCaptcha.value) {
      showCaptcha.value = true
      captchaRef.value && typeof captchaRef.value.refresh === 'function' && captchaRef.value.refresh()
      uni.showToast({ title: '密码错误次数过多，请输入验证码', icon: 'none', duration: 2000 })
    }
    
    // 登录失败时，清除所有权限相关标记
    uni.removeStorageSync('isAdmin')
    uni.removeStorageSync('token')
    
    // 优先展示后端返回的提示信息（如果有）
    if (err && err.msg) {
      uni.showToast({ title: err.msg, icon: 'none' })
    }

    // 如果后端返回特定错误码 2，尝试确认 db 状态，若 db 离线则以游客模式跳过登录
    if (err && err.code === 2) {
      checkDB().then(dbRes => {
        if (dbRes && dbRes.data && dbRes.data.online === false) {
          // 明确 db 离线，进入游客模式
          uni.showToast({ title: '数据库关闭不支持登录，即将进入游客模式', icon: 'none' })
          uni.setStorageSync('guestMode', true)
          setTimeout(() => {
            uni.reLaunch({ url: '/pages-dark/home/home' })
          }, 800)
        } else {
          // db 在线或返回异常，保持登录失败提示（上面已显示 err.msg）
        }
      }).catch(() => {
        uni.showToast({ title: '登录失败', icon: 'none' })
      })
    }
  })
}
function onRegister() {
  uni.navigateTo({ url: '/pages-dark/register/register' })
}
</script>

<style scoped>
/* 主背景 */
.login-bg {
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

/* 主登录卡片 */
.login-card {
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
  padding: 60rpx 50rpx;
  position: relative;
  z-index: 2;
  overflow: hidden;
}

.login-card::before {
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
.login-header {
  text-align: center;
  margin-bottom: 60rpx;
  position: relative;
}

.app-logo {
  position: relative;
  display: inline-block;
  margin-bottom: 40rpx;
}

.logo-image {
  width: 120rpx;
  height: 120rpx;
  display: block;
  border-radius: 50%;
  filter: drop-shadow(0 0 30rpx rgba(64, 224, 255, 0.6));
  z-index: 2;
  position: relative;
  background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(64, 224, 255, 0.1));
  border: 3rpx solid rgba(64, 224, 255, 0.3);
  padding: 10rpx;
  animation: logoFloat 3s ease-in-out infinite;
}

@keyframes logoFloat {
  0%, 100% { 
    transform: translateY(0px) scale(1);
    filter: drop-shadow(0 0 30rpx rgba(64, 224, 255, 0.6));
  }
  50% { 
    transform: translateY(-8rpx) scale(1.05);
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
  width: 160rpx;
  height: 160rpx;
  top: -80rpx;
  left: -80rpx;
  animation-duration: 8s;
}

.ring-2 {
  width: 200rpx;
  height: 200rpx;
  top: -100rpx;
  left: -100rpx;
  animation-duration: 12s;
  animation-direction: reverse;
}

.ring-3 {
  width: 240rpx;
  height: 240rpx;
  top: -120rpx;
  left: -120rpx;
  animation-duration: 15s;
}

@keyframes rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.login-title {
  font-size: 48rpx;
  font-weight: 700;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4, #44a08d);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 30rpx rgba(64, 224, 255, 0.5);
  margin-bottom: 24rpx;
  letter-spacing: 4rpx;
}

.login-subtitle {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.subtitle-line {
  color: rgba(255, 255, 255, 0.7);
  font-size: 26rpx;
  letter-spacing: 2rpx;
}

/* 表单样式 */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 40rpx;
}

.form-group {
  position: relative;
}

/* 验证码区域增加底部间距 */
.captcha-form-group {
  margin-bottom: 20rpx;
}

.form-label {
  display: block;
  font-size: 28rpx;
  color: #40e0ff;
  margin-bottom: 16rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
}

/* 简化的输入框样式 - 多平台兼容 */
.input-wrapper-simple {
  position: relative;
  background: rgba(255, 255, 255, 0.1);
  border: 2rpx solid rgba(64, 224, 255, 0.5);
  border-radius: 16rpx;
  margin-bottom: 32rpx;
  min-height: 80rpx;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
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
  font-size: 32rpx;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  transition: color 0.3s ease;
  z-index: 3;
  padding: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  
  /* 微信小程序优化 */
  /* #ifdef MP-WEIXIN */
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 10rpx;
  /* #endif */
}

.pwd-toggle:active {
  color: #40e0ff;
}

/* 选项行 */
.options-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-top: -20rpx;
}

.remember-me {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.tech-checkbox {
  width: 32rpx;
  height: 32rpx;
  border: 2rpx solid rgba(64, 224, 255, 0.5);
  border-radius: 8rpx;
  margin-right: 16rpx;
  position: relative;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.05);
}

.tech-checkbox.checked {
  border-color: #40e0ff;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  box-shadow: 0 0 16rpx rgba(64, 224, 255, 0.5);
}

.checkbox-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  width: 12rpx;
  height: 12rpx;
  background: #fff;
  border-radius: 3rpx;
  transition: transform 0.3s ease;
}

.tech-checkbox.checked .checkbox-inner {
  transform: translate(-50%, -50%) scale(1);
}

.remember-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 26rpx;
}

/* 登录按钮 */
.login-btn {
  position: relative;
  width: 100%;
  padding: 32rpx 0;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4, #44a08d);
  border: none;
  border-radius: 20rpx;
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s ease;
  box-shadow: 
    0 8rpx 32rpx rgba(64, 224, 255, 0.3),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.2);
}

.login-btn:disabled {
  opacity: 0.8;
  cursor: not-allowed;
}

.login-btn:active:not(:disabled) {
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
  font-size: 28rpx;
}

.btn-text {
  letter-spacing: 2rpx;
}

.loading-spinner {
  width: 28rpx;
  height: 28rpx;
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

.login-btn:active:not(:disabled) .btn-glow {
  left: 100%;
}

/* 注册区域 */
.register-row {
  text-align: center;
  margin-top: 20rpx;
}

.register-prefix {
  color: rgba(255, 255, 255, 0.6);
  font-size: 26rpx;
  margin-right: 8rpx;
}

.register-link {
  color: #40e0ff;
  font-weight: 600;
  font-size: 26rpx;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.3s ease;
  text-shadow: 0 0 10rpx rgba(64, 224, 255, 0.5);
}

.register-link:active {
  color: #4ecdc4;
  text-shadow: 0 0 15rpx rgba(78, 205, 196, 0.8);
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
</style>
