<template>
  <view class="login-page">
    <!-- #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ -->
    <!-- 小程序/App端：使用组件启动页 -->
    <app-splash v-if="showSplash" @loaded="onSplashLoaded" />
    <!-- #endif -->
    
    <!-- 顶部绿色背景区域 -->
    <view class="header-bg">
      <!-- 装饰圆圈 -->
      <view class="decoration-circle circle-1"></view>
      <view class="decoration-circle circle-2"></view>
      <view class="decoration-circle circle-3"></view>
      
      <!-- 头部内容 -->
      <view class="header-content">
        <view class="app-brand">
          <view class="logo-wrap">
            <image src="/static/person.jpeg" class="logo-image" mode="aspectFit" />
          </view>
          <view class="brand-text">
            <text class="app-name">分投侠</text>
            <text class="app-slogan">智能垃圾分类助手</text>
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
    
    <!-- 登录表单区域 -->
    <view class="login-form-wrap">
      <!-- 蓝橙球形装饰背景 -->
      <view class="bg-circles">
        <view class="bg-circle circle-blue">
          <view class="saturn-ring"></view>
        </view>
        <view class="bg-circle circle-orange">
          <view class="saturn-ring"></view>
        </view>
        <view class="bg-circle circle-green">
          <view class="saturn-ring"></view>
        </view>
        <!-- 流光粒子 -->
        <view class="particle"></view>
        <view class="particle"></view>
        <view class="particle"></view>
      </view>
      <view class="form-card">
        <view class="form-header">
          <text class="form-title">欢迎登录</text>
          <text class="form-subtitle">请使用您的账号密码登录</text>
        </view>
        
        <form class="login-form" @submit.prevent="onLogin(false)">
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
                placeholder="请输入密码"
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
          </view>
          
          <!-- 验证码区域 -->
          <view class="input-group captcha-group" v-if="showCaptcha">
            <view class="input-label">
              <text class="label-icon">🛡️</text>
              <text class="label-text">验证码</text>
            </view>
            <captcha-box v-model="captchaInput" ref="captchaRef" @confirm="handleEnterKey" />
            <text class="captcha-hint" v-if="captchaHint">{{ captchaHint }}</text>
          </view>
          
          <!-- 记住我选项 -->
          <view class="options-row">
            <view class="remember-me" @click="toggleRememberMe">
              <view class="checkbox" :class="{ 'checked': rememberMe }">
                <view class="check-mark" v-if="rememberMe">✓</view>
              </view>
              <text class="remember-text">记住我</text>
            </view>
          </view>
          
          <!-- 登录按钮 -->
          <button type="submit" class="login-btn" @click="onLogin(false)" :disabled="isLoading" id="loginBtn">
            <view class="light-track"></view>
            <view class="btn-content" v-if="!isLoading">
              <text class="btn-text">登 录</text>
            </view>
            <view class="loading-content" v-else>
              <view class="loading-spinner"></view>
              <text class="loading-text">登录中...</text>
            </view>
          </button>
          
          <!-- 注册链接 -->
          <view class="register-row">
            <text class="register-text">还没有账号？</text>
            <text class="register-link" @click="onRegister">立即注册</text>
          </view>
        </form>
      </view>
      
      <!-- 底部信息 -->
      <view class="footer-info">
        <text class="footer-text">🌿 环保从分类开始，共建绿色家园</text>
      </view>
    </view>
    
    <!-- 加载动画遮罩 -->
    <view class="loading-overlay" v-if="isLoading">
      <view class="loading-animation">
        <image class="loading-gif" src="/static/moveable2.gif" mode="aspectFit" />
        <text class="loading-title">正在登录</text>
        <text class="loading-desc">环保从分类开始...</text>
        <view class="progress-bar">
          <view class="progress-fill"></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { login,userinfo } from '@/api/user'
import { checkDB } from '@/api/health'
import { ThemeManager } from '@/utils/theme.js'
import CaptchaBox from '@/components/CaptchaBox.vue'
import AppSplash from '@/components/AppSplash.vue'

const username = ref('')
const password = ref('')
const showPwd = ref(false)
const rememberMe = ref(true)
const isLoading = ref(false)
const passwordKey = ref(0)

// 启动页显示控制 - 根据平台不同
const showSplash = ref(false)

// #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ
// 小程序/App端：显示启动页
showSplash.value = true
// #endif

// 启动页加载完成回调
function onSplashLoaded() {
  showSplash.value = false
}

// 登录失败次数与验证码相关
const loginFailCount = ref(0)
const showCaptcha = ref(false)
const captchaInput = ref('')
const captchaHint = ref('')
const captchaRef = ref(null)

// 页面加载时检查是否有保存的登录信息
onMounted(() => {
  // 检查主题 - 如果是暗色模式，重定向到暗色首页
  const theme = ThemeManager.getTheme()
  console.log('index.vue onMounted: theme =', theme)
  
  if (theme === 'dark') {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    const currentRoute = currentPage.route
    console.log('index.vue onMounted: currentRoute =', currentRoute)
    
    if (currentRoute === 'pages/index/index') {
      console.log('index.vue onMounted: Redirecting to dark theme')
      uni.reLaunch({ url: '/pages-dark/index/index' })
      return // 不继续执行后续逻辑
    }
  }
  
  // 小程序/App端：等待启动页加载完成后再检查
  // H5端：启动页在index.html中处理，这里直接检查登录信息
  checkAutoLogin()
})

function checkAutoLogin() {
  // 原有的登录信息检查
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

  // 登录按钮鼠标光感追踪
  if (typeof document !== 'undefined') {
    setTimeout(() => {
      const loginBtn = document.getElementById('loginBtn')
      if (loginBtn) {
        loginBtn.addEventListener('mousemove', (e) => {
          const rect = loginBtn.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * 100
          const y = ((e.clientY - rect.top) / rect.height) * 100
          loginBtn.style.setProperty('--mouse-x', x + '%')
          loginBtn.style.setProperty('--mouse-y', y + '%')
        })
      }
    }, 500)
  }
}

function toggleRememberMe() {
  rememberMe.value = !rememberMe.value
}

// 切换密码显示/隐藏
function togglePassword() {
  showPwd.value = !showPwd.value
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
  if (event.keyCode === 13 || event.key === 'Enter') {
    handleEnterKey()
  }
}

function onLogin(isauto) {
  if (!username.value) return uni.showToast({ title: '请输入用户名', icon: 'none' })
  if (!password.value) return uni.showToast({ title: '请输入密码', icon: 'none' })
  
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
    if (rememberMe.value) {
      uni.setStorageSync('savedUser', {
        username: username.value,
        password: password.value
      })
      uni.setStorageSync('autoLogin', true)
    } else {
      uni.removeStorageSync('savedUser')
    }
    setTimeout(() => {
      isLoading.value = false
      uni.reLaunch({ url: '/pages/home/home' })
    }, 500)
  }).catch(err => {
    isLoading.value = false
    
    try{
      if(err&&err.msg.includes('网络错误')){
      }else{
        loginFailCount.value++
      }
    }catch(e){
      loginFailCount.value++
    }
    
    if (loginFailCount.value >3 && !showCaptcha.value) {
      showCaptcha.value = true
      captchaRef.value && typeof captchaRef.value.refresh === 'function' && captchaRef.value.refresh()
      uni.showToast({ title: '密码错误次数过多，请输入验证码', icon: 'none', duration: 2000 })
    }
    
    uni.removeStorageSync('isAdmin')
    uni.removeStorageSync('token')
    
    if (err && err.msg) {
      uni.showToast({ title: err.msg, icon: 'none' })
    }

    if (err && err.code === 2) {
      checkDB().then(dbRes => {
        if (dbRes && dbRes.data && dbRes.data.online === false) {
          uni.showToast({ title: '数据库关闭不支持登录，即将进入游客模式', icon: 'none' })
          uni.setStorageSync('guestMode', true)
          setTimeout(() => {
            uni.reLaunch({ url: '/pages/home/home' })
          }, 800)
        }
      }).catch(() => {
        uni.showToast({ title: '登录失败', icon: 'none' })
      })
    }
  })
}

function onRegister() {
  uni.navigateTo({ url: '/pages/register/register' })
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #ffffff;
  display: flex;
  flex-direction: column;
}

/* 顶部绿色背景 */
.header-bg {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  position: relative;
  padding: 80rpx 40rpx 100rpx;
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
  animation: circleRotate1 20s linear infinite;
}

.circle-2 {
  width: 200rpx;
  height: 200rpx;
  bottom: 50rpx;
  left: -60rpx;
  background: rgba(255, 255, 255, 0.03);
  animation: circleRotate2 15s linear infinite reverse;
}

.circle-3 {
  width: 100rpx;
  height: 100rpx;
  top: 40rpx;
  right: 100rpx;
  background: rgba(255, 255, 255, 0.08);
  animation: circleRotate3 10s linear infinite;
}

/* 装饰圆圈旋转动画 */
@keyframes circleRotate1 {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes circleRotate2 {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes circleRotate3 {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 头部内容 */
.header-content {
  position: relative;
  z-index: 10;
}

.app-brand {
  display: flex;
  align-items: center;
}

.logo-wrap {
  width: 120rpx;
  height: 120rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 24rpx;
  backdrop-filter: blur(10px);
  border: 2rpx solid rgba(255, 255, 255, 0.3);
}

.logo-image {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  animation: logoBounceIn 0.8s ease-out 0.6s both, logoIdleBounce 4s ease-in-out infinite 2.5s;
  transform-origin: center bottom;
}

/* Logo初始弹跳动画 - 与卡片同时开始 */
@keyframes logoBounceIn {
  0% {
    transform: scale(0) translateY(-50rpx) rotate(0deg);
    opacity: 0;
  }
  25% {
    transform: scale(1.3) translateY(-20rpx) rotate(0deg);
    opacity: 1;
  }
  35% {
    transform: scale(1.3) translateY(-20rpx) rotate(-8deg);
  }
  45% {
    transform: scale(1.3) translateY(-20rpx) rotate(8deg);
  }
  55% {
    transform: scale(1.3) translateY(-20rpx) rotate(-5deg);
  }
  65% {
    transform: scale(1.3) translateY(-20rpx) rotate(0deg);
  }
  75% {
    transform: scale(0.9) translateY(5rpx) rotate(0deg);
  }
  88% {
    transform: scale(1.05) translateY(-3rpx) rotate(0deg);
  }
  100% {
    transform: scale(1) translateY(0) rotate(0deg);
  }
}

/* Logo空闲时不定时弹跳 */
@keyframes logoIdleBounce {
  0%, 15%, 30%, 100% {
    transform: scale(1) translateY(0);
  }
  5% {
    transform: scale(1.15) translateY(-15rpx);
  }
  10% {
    transform: scale(0.95) translateY(5rpx);
  }
  20% {
    transform: scale(1.05) translateY(-8rpx);
  }
  25% {
    transform: scale(0.98) translateY(2rpx);
  }
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.app-name {
  color: #ffffff;
  font-size: 48rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}

.app-slogan {
  color: rgba(255, 255, 255, 0.9);
  font-size: 26rpx;
}

/* 波浪装饰 */
.wave-decoration {
  position: absolute;
  bottom: -2rpx;
  left: 0;
  right: 0;
  height: 80rpx;
}

.wave-decoration svg {
  width: 100%;
  height: 100%;
}

/* 登录表单区域 */
.login-form-wrap {
  flex: 1;
  padding: 0 40rpx 120rpx;
  margin-top: -40rpx;
  position: relative;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 400rpx);
  overflow: hidden;
}

/* 蓝橙球形装饰背景 */
.bg-circles {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}

/* 背景流动光效 - 更明显 */
.bg-circles::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(ellipse at 20% 30%, 
    rgba(147, 197, 253, 0.15) 0%, 
    transparent 40%
  ), radial-gradient(ellipse at 80% 70%, 
    rgba(251, 191, 36, 0.15) 0%, 
    transparent 40%
  ), radial-gradient(ellipse at 50% 50%, 
    rgba(52, 211, 153, 0.12) 0%, 
    transparent 50%
  );
  animation: bgGlowFlow 20s ease-in-out infinite;
  pointer-events: none;
}

.bg-circles::after {
  content: '';
  position: absolute;
  top: -30%;
  left: -30%;
  width: 160%;
  height: 160%;
  background: radial-gradient(ellipse at 70% 20%, 
    rgba(251, 191, 36, 0.12) 0%, 
    transparent 45%
  ), radial-gradient(ellipse at 30% 80%, 
    rgba(96, 165, 250, 0.12) 0%, 
    transparent 45%
  ), radial-gradient(ellipse at 60% 40%, 
    rgba(52, 211, 153, 0.1) 0%, 
    transparent 50%
  );
  animation: bgGlowFlow 16s ease-in-out infinite reverse;
  pointer-events: none;
}

@keyframes bgGlowFlow {
  0%, 100% {
    transform: translate(0, 0) rotate(0deg) scale(1);
    opacity: 0.7;
  }
  20% {
    transform: translate(3%, -2%) rotate(3deg) scale(1.08);
    opacity: 0.9;
  }
  40% {
    transform: translate(-2%, 4%) rotate(-2deg) scale(1.02);
    opacity: 0.8;
  }
  60% {
    transform: translate(4%, 2%) rotate(4deg) scale(1.12);
    opacity: 1;
  }
  80% {
    transform: translate(-3%, -3%) rotate(-4deg) scale(0.98);
    opacity: 0.85;
  }
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 1;
}

/* 球形主体 - 平面渐变风格，错落有致 */
.circle-blue {
  width: 420rpx;
  height: 420rpx;
  background: linear-gradient(135deg, #93c5fd 0%, #60a5fa 50%, #3b82f6 100%);
  top: 80rpx;
  left: -150rpx;
  opacity: 0.55;
}

.circle-blue::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 180%;
  height: 180%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, 
    rgba(52, 211, 153, 0.25) 0%, 
    rgba(52, 211, 153, 0.15) 20%,
    rgba(96, 165, 250, 0.1) 40%,
    rgba(96, 165, 250, 0.05) 60%,
    transparent 80%
  );
  border-radius: 50%;
  animation: planetGlow 10s ease-in-out infinite;
}

.circle-orange {
  width: 380rpx;
  height: 380rpx;
  background: linear-gradient(135deg, #fcd34d 0%, #fbbf24 50%, #f59e0b 100%);
  top: 350rpx;
  right: -120rpx;
  opacity: 0.55;
}

.circle-orange::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 180%;
  height: 180%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, 
    rgba(96, 165, 250, 0.25) 0%, 
    rgba(96, 165, 250, 0.15) 20%,
    rgba(251, 191, 36, 0.1) 40%,
    rgba(251, 191, 36, 0.05) 60%,
    transparent 80%
  );
  border-radius: 50%;
  animation: planetGlow 8s ease-in-out infinite;
}

.circle-green {
  width: 320rpx;
  height: 320rpx;
  background: linear-gradient(135deg, #6ee7b7 0%, #34d399 50%, #10b981 100%);
  bottom: 200rpx;
  left: 80rpx;
  opacity: 0.55;
}

.circle-green::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 180%;
  height: 180%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, 
    rgba(251, 191, 36, 0.25) 0%, 
    rgba(251, 191, 36, 0.15) 20%,
    rgba(52, 211, 153, 0.1) 40%,
    rgba(52, 211, 153, 0.05) 60%,
    transparent 80%
  );
  border-radius: 50%;
  animation: planetGlow 12s ease-in-out infinite;
}

@keyframes planetGlow {
  0%, 100% {
    transform: translate(-50%, -50%) scale(0.95);
    opacity: 0.5;
  }
  25% {
    transform: translate(-50%, -50%) scale(1.05);
    opacity: 0.75;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.25);
    opacity: 1;
  }
  75% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.85;
  }
}

/* 土星环效果 - 椭圆形，固定不旋转 */
.saturn-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 260%;
  height: 90rpx;
  border-radius: 50%;
  pointer-events: none;
}

/* 蓝色球土星环 - 左下到右上 / 方向 */
.circle-blue .saturn-ring {
  transform: translate(-50%, -50%) rotateX(65deg) rotateZ(25deg);
  background: linear-gradient(90deg, 
    transparent 0%, 
    transparent 3%,
    rgba(147, 197, 253, 0.4) 10%, 
    rgba(96, 165, 250, 0.7) 35%, 
    rgba(96, 165, 250, 0.85) 50%,
    rgba(96, 165, 250, 0.7) 65%,
    rgba(147, 197, 253, 0.4) 90%, 
    transparent 97%,
    transparent 100%
  );
  opacity: 0.8;
}

/* 蓝色星环内侧 */
.circle-blue .saturn-ring::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 70%;
  height: 50rpx;
  transform: translate(-50%, -50%);
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(191, 219, 254, 0.35) 15%, 
    rgba(147, 197, 253, 0.6) 50%, 
    rgba(191, 219, 254, 0.35) 85%, 
    transparent 100%
  );
  border-radius: 50%;
  opacity: 0.65;
}

/* 橙色球土星环 - 左上到右下 \ 方向 */
.circle-orange .saturn-ring {
  transform: translate(-50%, -50%) rotateX(65deg) rotateZ(-25deg);
  background: linear-gradient(90deg, 
    transparent 0%, 
    transparent 3%,
    rgba(252, 211, 77, 0.4) 10%, 
    rgba(251, 191, 36, 0.7) 35%, 
    rgba(251, 191, 36, 0.85) 50%,
    rgba(251, 191, 36, 0.7) 65%,
    rgba(252, 211, 77, 0.4) 90%, 
    transparent 97%,
    transparent 100%
  );
  opacity: 0.8;
}

/* 橙色星环内侧 */
.circle-orange .saturn-ring::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 65%;
  height: 45rpx;
  transform: translate(-50%, -50%);
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(254, 243, 199, 0.35) 15%, 
    rgba(252, 211, 77, 0.6) 50%, 
    rgba(254, 243, 199, 0.35) 85%, 
    transparent 100%
  );
  border-radius: 50%;
  opacity: 0.65;
}

/* 绿色球土星环 - 左下到右上 / 方向 */
.circle-green .saturn-ring {
  transform: translate(-50%, -50%) rotateX(65deg) rotateZ(35deg);
  background: linear-gradient(90deg, 
    transparent 0%, 
    transparent 3%,
    rgba(110, 231, 183, 0.4) 10%, 
    rgba(52, 211, 153, 0.7) 35%, 
    rgba(52, 211, 153, 0.85) 50%,
    rgba(52, 211, 153, 0.7) 65%,
    rgba(110, 231, 183, 0.4) 90%, 
    transparent 97%,
    transparent 100%
  );
  opacity: 0.8;
}

/* 绿色星环内侧 */
.circle-green .saturn-ring::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60%;
  height: 40rpx;
  transform: translate(-50%, -50%);
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(167, 243, 208, 0.35) 15%, 
    rgba(110, 231, 183, 0.6) 50%, 
    rgba(167, 243, 208, 0.35) 85%, 
    transparent 100%
  );
  border-radius: 50%;
  opacity: 0.65;
}



/* 流光粒子 */
.bg-circles .particle {
  position: absolute;
  width: 6rpx;
  height: 6rpx;
  border-radius: 50%;
  opacity: 0;
  animation: particleOrbit 4s linear infinite;
}

.bg-circles .particle:nth-child(1) {
  background: #3b82f6;
  top: 350rpx;
  left: 50rpx;
  animation-delay: 0s;
}

.bg-circles .particle:nth-child(2) {
  background: #f59e0b;
  top: 625rpx;
  right: 45rpx;
  animation-delay: 1s;
}

.bg-circles .particle:nth-child(3) {
  background: #10b981;
  bottom: 350rpx;
  left: 250rpx;
  animation-delay: 2s;
}

@keyframes particleOrbit {
  0% {
    transform: scale(0) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 1;
    transform: scale(1);
  }
  90% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    transform: scale(0) rotate(360deg);
    opacity: 0;
  }
}

.form-card {
  background: rgba(255, 255, 255, 0.75);
  border-radius: 32rpx;
  padding: 50rpx 40rpx;
  box-shadow: 0 8rpx 40rpx rgba(0, 0, 0, 0.08);
  animation: cardSlideUp 0.6s ease-out;
  position: relative;
  z-index: 10;
  backdrop-filter: blur(20rpx);
  border: 1px solid rgba(255, 255, 255, 0.6);
}

/* 卡片从下方淡入上浮动画 */
@keyframes cardSlideUp {
  0% {
    opacity: 0;
    transform: translateY(60rpx);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.form-header {
  text-align: center;
  margin-bottom: 50rpx;
}

.form-title {
  display: block;
  color: #1f2937;
  font-size: 40rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}

.form-subtitle {
  display: block;
  color: #9ca3af;
  font-size: 26rpx;
}

/* 表单样式 */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 32rpx;
}

.input-group {
  display: flex;
  flex-direction: column;
}

.input-label {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
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

/* 验证码提示 */
.captcha-hint {
  color: #ef4444;
  font-size: 24rpx;
  margin-top: 12rpx;
}

/* 选项行 */
.options-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.remember-me {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox {
  width: 36rpx;
  height: 36rpx;
  border: 2rpx solid #d1d5db;
  border-radius: 8rpx;
  margin-right: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.checkbox.checked {
  background: #10b981;
  border-color: #10b981;
}

.check-mark {
  color: #ffffff;
  font-size: 24rpx;
  font-weight: bold;
}

.remember-text {
  color: #6b7280;
  font-size: 26rpx;
}

/* 登录按钮 - 炫光效果 */
.login-btn {
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
.login-btn .light-track {
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

.login-btn:hover .light-track {
  opacity: 1;
}

/* 流动炫光效果 */
.login-btn::before {
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
.login-btn::after {
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

.login-btn:disabled {
  opacity: 0.7;
}

.login-btn:active:not(:disabled) {
  transform: translateY(2rpx);
  box-shadow: 
    0 4rpx 16rpx rgba(16, 185, 129, 0.5),
    0 0 30rpx rgba(16, 185, 129, 0.3);
}

/* 按钮文字发光 */
.btn-text {
  position: relative;
  z-index: 1;
  text-shadow: 0 0 10rpx rgba(255, 255, 255, 0.5), 0 0 20rpx rgba(255, 255, 255, 0.3);
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

/* 注册链接 */
.register-row {
  text-align: center;
  margin-top: 30rpx;
}

.register-text {
  color: #9ca3af;
  font-size: 26rpx;
}

.register-link {
  color: #10b981;
  font-weight: 600;
  font-size: 26rpx;
  margin-left: 8rpx;
}

/* 底部信息 */
.footer-info {
  text-align: center;
  margin-top: auto;
  padding-bottom: 40rpx;
  position: fixed;
  bottom: 40rpx;
  left: 0;
  right: 0;
}

.footer-text {
  color: #9ca3af;
  font-size: 24rpx;
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  animation: footerFadeIn 1s ease-out 0.8s both, textFloat 3s ease-in-out infinite 1.8s;
}

/* 叶子图标晃动动画 - 持续进行 */
.footer-text .leaf-icon,
.footer-text span:first-child {
  display: inline-block;
  animation: leafSway 1.5s ease-in-out infinite;
  transform-origin: bottom center;
}

@keyframes leafSway {
  0%, 100% {
    transform: rotate(-8deg) scale(1);
  }
  25% {
    transform: rotate(0deg) scale(1.1);
  }
  50% {
    transform: rotate(8deg) scale(1);
  }
  75% {
    transform: rotate(0deg) scale(1.05);
  }
}

/* 文字持续浮动动画 */
@keyframes textFloat {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6rpx);
  }
}

/* 底部文字淡入动画 */
@keyframes footerFadeIn {
  0% {
    opacity: 0;
    transform: translateY(20rpx);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 加载动画遮罩 */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, 
    rgba(236, 253, 245, 0.98) 0%, 
    rgba(209, 250, 229, 0.95) 50%,
    rgba(167, 243, 208, 0.92) 100%);
  backdrop-filter: blur(20rpx);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlayFadeIn 0.4s ease;
}

@keyframes overlayFadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.loading-animation {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30rpx;
  animation: contentScaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
}

@keyframes contentScaleIn {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(30rpx);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 加载动图 */
.loading-gif {
  width: 400rpx;
  height: 400rpx;
  border-radius: 24rpx;
  animation: gifBounce 2s ease-in-out infinite;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.2);
}

@keyframes gifBounce {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.loading-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #10b981;
  letter-spacing: 4rpx;
  animation: titlePulse 1.5s ease-in-out infinite;
}

@keyframes titlePulse {
  0%, 100% {
    opacity: 0.8;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

.loading-desc {
  font-size: 26rpx;
  color: #6b7280;
  animation: descFade 2s ease-in-out infinite;
}

@keyframes descFade {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* 进度条 */
.progress-bar {
  width: 400rpx;
  height: 8rpx;
  background: rgba(16, 185, 129, 0.2);
  border-radius: 4rpx;
  overflow: hidden;
  margin-top: 20rpx;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #34d399 50%, #10b981 100%);
  border-radius: 4rpx;
  animation: progressLoad 2s ease-in-out infinite;
  box-shadow: 0 0 10rpx rgba(16, 185, 129, 0.5);
}

@keyframes progressLoad {
  0% {
    width: 0%;
    transform: translateX(-100%);
  }
  50% {
    width: 100%;
    transform: translateX(0%);
  }
  100% {
    width: 100%;
    transform: translateX(100%);
  }
}
</style>
