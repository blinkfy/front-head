<template>
  <!-- 启动动画 (小程序和App端) -->
  <!-- #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ -->
  <view v-if="showAppSplash" class="app-splash" :class="{ 'app-splash-fading': appSplashFading }">
    <view class="app-splash-content">
      <image class="app-splash-image" src="/static/moveable2.gif" mode="aspectFit" />
      <view class="app-splash-title">分投侠</view>
      <view class="app-splash-subtitle">智能垃圾分类助手</view>
      <view class="app-splash-progress">
        <view class="app-splash-progress-bar"></view>
      </view>
    </view>
  </view>
  <!-- #endif -->
</template>

<script>
import { ThemeManager } from '@/utils/theme.js'
import { initGlobalMessageBus } from '@/utils/message-event-bus.js'
import { warmManifestIcons } from '@/utils/icon-preload.js'
import { warmSmartSortRobot } from '@/utils/robot-preload.js'
import { onAppPageReady } from '@/utils/app-page-ready.mjs'
import { initUiSounds, setUiSoundsActive } from '@/utils/ui-sounds.js'
import { DEVICE_SCAN_PAGE, appendPageQuery, isLegacyDeviceScanPath, resolveLegacyDeviceScanUrl } from '@/utils/device-qr-entry.mjs'
// #ifdef APP-PLUS
import { checkAppUpdate } from '@/utils/app-update.js'
// #endif
// #ifdef MP-WEIXIN
import { captureRegistrationEntry, offerRegistrationRetry } from '@/utils/registration-relay.js'
// #endif

// 页面映射表
const PAGE_MAPPINGS = {
  'pages/index/index': 'pages-dark/index/index',
  'pages/register/register': 'pages-dark/register/register',
  'pages/home/home': 'pages-dark/home/home',
  'pages/profile/profile': 'pages-dark/profile/profile',
  'pages/about/about': 'pages-dark/about/about',
  'pages/guide/guide': 'pages-dark/guide/guide',
  'pages/change-password/change-password': 'pages-dark/change-password/change-password',
  'pages/map/map': 'pages-dark/map/map',
  'pages/history/history': 'pages-dark/history/history',
  'pages/ranking/ranking': 'pages-dark/ranking/ranking',
  'pages/shop/shop': 'pages-dark/shop/shop'
}

export default {
// #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ
// 小程序和App端：使用Vue组件形式的启动页
  data() {
    return {
      showAppSplash: true,
      appSplashFading: false
    }
  },
// #endif
  onLaunch: function (options) {
    console.log('App Launch')
    initUiSounds()
    // #ifdef MP-WEIXIN
    captureRegistrationEntry(options)
    // #endif
    
    // 初始化全局消息总线
    initGlobalMessageBus()
    warmManifestIcons()
    warmSmartSortRobot()
    
    // 立即尝试检查主题重定向
    const theme = ThemeManager.getTheme()
    
    // 在 H5 端的默认首页通常是 pages/index/index
    // 如果主题是 dark，立即跳转到对应的暗色页面
    const scanEntry = isLegacyDeviceScanPath(options?.path) ||
      '/' + String(options?.path || '').replace(/^\//, '') === DEVICE_SCAN_PAGE
    if (theme === 'dark' && !scanEntry) {
      // 检查是否需要重定向到暗色主题
      const pages = getCurrentPages()
      if (pages.length === 1) {
        const currentPage = pages[0]
        const currentRoute = currentPage.route
        console.log('onLaunch: Current route =', currentRoute)
        
        if (currentRoute.startsWith('pages/') && !isLegacyDeviceScanPath(currentRoute)) {
          const targetPath = PAGE_MAPPINGS[currentRoute] || currentRoute.replace('pages/', 'pages-dark/')
          const launchQuery = {
            ...(options?.query || {}),
            ...(currentPage.options || {}),
            ...(currentPage.$page?.options || {})
          }
          const targetUrl = appendPageQuery('/' + targetPath, launchQuery)
          console.log('onLaunch: Redirecting to', '/' + targetPath)
          setTimeout(() => {
            uni.reLaunch({ url: targetUrl })
          }, 100)
        }
      }
    }
    
    // #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ
    this.startLoading()
    // #endif
  },
  onShow: function (options) {
    // #ifdef MP-WEIXIN
    captureRegistrationEntry(options)
    void offerRegistrationRetry()
    // #endif
    setUiSoundsActive(true)
    // #ifdef APP-PLUS
    uni.$emit('smart-sort-robot:visibility', true)
    // #endif
    console.log('App Show')
  },
  onPageNotFound: function (options) {
    const target = resolveLegacyDeviceScanUrl(options?.path, options?.query || {})
    // Missing-page recovery must happen synchronously in mini-programs.
    if (target) uni.reLaunch({ url: target })
  },
  beforeUnmount() { this._disposeSplash?.() },
  onHide: function () {
    setUiSoundsActive(false)
    // #ifdef APP-PLUS
    uni.$emit('smart-sort-robot:visibility', false)
    // #endif
    console.log('App Hide')
  },
// #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ
  methods: {
    startLoading() {
      let finished = false
      let releaseTimer = null
      let safetyTimer = null
      let unsubscribe = null
      const finish = () => {
        if (finished) return
        finished = true
        unsubscribe?.()
        clearTimeout(safetyTimer)
        this.appSplashFading = true
        releaseTimer = setTimeout(() => {
          this.showAppSplash = false
          // #ifdef APP-PLUS
          void checkAppUpdate()
          // #endif
        }, 200)
      }
      // Page readiness covers the usable shell; decorative media loads independently.
      unsubscribe = onAppPageReady(finish)
      if (!finished) safetyTimer = setTimeout(finish, 4000)
      this._disposeSplash = () => {
        unsubscribe?.()
        clearTimeout(safetyTimer)
        clearTimeout(releaseTimer)
      }

    }
  }
// #endif
}
</script>

<style>
/* #ifndef APP-NVUE */
@import "@/styles/auth-orbs.css";
/*每个页面公共css */

/* #ifdef H5 */
/* Framework action sheets must sit above page dialogs, including photo entry in map forms. */
uni-actionsheet {
  position: relative;
  z-index: 1000000;
}

:root {
  --page-transition-background: #f8f8f8;
}

:root[data-theme='dark'] {
  --page-transition-background: #020617;
}

html,
body,
#app,
uni-page,
uni-page-wrapper,
uni-page-body {
  background-color: var(--page-transition-background, #f8f8f8) !important;
}
/* #endif */

/* 底部四个主页面按导航位置执行短时位移，不触发重排。 */
/* 微信小程序的底部换页使用内容节点 animation 属性，底栏保持静止。 */

/* #ifndef MP-WEIXIN */
.tab-page-enter-left > view {
  animation: bottom-tab-page-enter-left 180ms cubic-bezier(0.2, 0.7, 0.25, 1) both;
  will-change: transform, opacity;
}

.tab-page-enter-right > view {
  animation: bottom-tab-page-enter-right 180ms cubic-bezier(0.2, 0.7, 0.25, 1) both;
  will-change: transform, opacity;
}

.tab-page-enter-left > .tabbar,
.tab-page-enter-left > .tech-tabbar,
.tab-page-enter-right > .tabbar,
.tab-page-enter-right > .tech-tabbar {
  animation: none !important;
  opacity: 1 !important;
  transform: none !important;
  will-change: auto;
}
/* #endif */

@keyframes bottom-tab-page-enter-left {
  from { opacity: 0.92; transform: translateX(36rpx); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes bottom-tab-page-enter-right {
  from { opacity: 0.92; transform: translateX(-36rpx); }
  to { opacity: 1; transform: translateX(0); }
}

/* 启动动画样式 */
.app-splash {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #10b981 0%, #34d399 30%, #6ee7b7 60%, #a7f3d0 100%);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-splash-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  animation: splash-in 0.5s ease-out;
}

@keyframes splash-in {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(30px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.app-splash-image {
  width: 250px;
  height: 250px;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  animation: splash-pulse 1.5s ease-in-out infinite;
}

@keyframes splash-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
  }
}

.app-splash-title {
  font-size: 28px;
  font-weight: 800;
  color: #ffffff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  letter-spacing: 4px;
  animation: splash-glow 2s ease-in-out infinite;
}

@keyframes splash-glow {
  0%, 100% {
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  50% {
    text-shadow: 0 2px 16px rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.2);
  }
}

.app-splash-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 2px;
}

.app-splash-progress {
  width: 200px;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 20px;
}

.app-splash-progress-bar {
  width: 42%;
  height: 100%;
  background: linear-gradient(90deg, #ffffff 0%, #d1fae5 100%);
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
  animation: splash-progress 2s ease-in-out infinite;
  transition: width 0.3s ease;
}

@keyframes splash-progress {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(80%);
  }
  100% {
    transform: translateX(240%);
  }
}

/* 淡出效果 */
.app-splash-fading {
  animation: splash-fade-out 0.2s ease forwards;
}

@keyframes splash-fade-out {
  to {
    opacity: 0;
    pointer-events: none;
  }
}
/* #endif */
</style>
