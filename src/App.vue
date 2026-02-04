<template>
  <!-- 启动动画 (小程序和App端) -->
  <!-- #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ -->
  <view v-if="showAppSplash" class="app-splash" :class="{ 'app-splash-fading': appSplashFading }">
    <view class="app-splash-content">
      <image class="app-splash-image" src="/static/moveable2.gif" mode="aspectFit" />
      <view class="app-splash-title">分投侠</view>
      <view class="app-splash-subtitle">智能垃圾分类助手</view>
      <view class="app-splash-progress">
        <view class="app-splash-progress-bar" :style="{ width: appSplashProgress + '%' }"></view>
      </view>
    </view>
  </view>
  <!-- #endif -->
</template>

<script>
import { ThemeManager } from '@/utils/theme.js'
import { initGlobalMessageBus } from '@/utils/message-event-bus.js'

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
  'pages/scan/scan': 'pages-dark/scan/scan',
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
      appSplashProgress: 0,
      appSplashFading: false
    }
  },
// #endif
  onLaunch: function (options) {
    console.log('App Launch')
    
    // 初始化全局消息总线
    initGlobalMessageBus()
    
    // 立即尝试检查主题重定向
    const theme = ThemeManager.getTheme()
    console.log('onLaunch: Current theme =', theme)
    
    // 在 H5 端的默认首页通常是 pages/index/index
    // 如果主题是 dark，立即跳转到对应的暗色页面
    if (theme === 'dark') {
      // 检查是否需要重定向到暗色主题
      const pages = getCurrentPages()
      if (pages.length === 1) {
        const currentPage = pages[0]
        const currentRoute = currentPage.route
        console.log('onLaunch: Current route =', currentRoute)
        
        if (currentRoute.startsWith('pages/') && !currentRoute.startsWith('pages-dark/')) {
          const targetPath = PAGE_MAPPINGS[currentRoute] || currentRoute.replace('pages/', 'pages-dark/')
          console.log('onLaunch: Redirecting to', '/' + targetPath)
          setTimeout(() => {
            uni.reLaunch({ url: '/' + targetPath })
          }, 100)
        }
      }
    }
    
    // #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ
    this.startLoading()
    // #endif
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  },
// #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ
  methods: {
    startLoading() {
      // 启动页：等待应用真正加载完成
      let loadedResources = 0
      const totalResources = 4 // 框架加载、图片、字体、初始化
      
      const checkLoaded = () => {
        loadedResources++
        this.appSplashProgress = Math.min((loadedResources / totalResources) * 100, 95)
        
        if (loadedResources >= totalResources) {
          // 所有资源加载完成
          this.appSplashProgress = 100
          setTimeout(() => {
            this.appSplashFading = true
            setTimeout(() => {
              this.showAppSplash = false
            }, 500)
          }, 500)
        }
      }
      
      // 1. 框架加载完成 (立即)
      checkLoaded()
      
      // 2. 检查动图加载
      uni.getImageInfo({
        src: '/static/moveable2.gif',
        success: checkLoaded,
        fail: checkLoaded
      })
      
      // 3. 模拟系统初始化 (600ms)
      setTimeout(checkLoaded, 600)
      
      // 4. 页面渲染完成检查
      setTimeout(() => {
        checkLoaded()
      }, 1000)
      
      // 最长4秒后强制进入
      setTimeout(() => {
        if (this.showAppSplash) {
          this.appSplashProgress = 100
          setTimeout(() => {
            this.appSplashFading = true
            setTimeout(() => {
              this.showAppSplash = false
            }, 500)
          }, 300)
        }
      }, 4000)
    }
  }
// #endif
}
</script>

<style>
/*每个页面公共css */

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
    transform: scale(1.05);
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
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #ffffff 0%, #d1fae5 100%);
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
  animation: splash-progress 2s ease-in-out infinite;
  transition: width 0.3s ease;
}

@keyframes splash-progress {
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

/* 淡出效果 */
.app-splash-fading {
  animation: splash-fade-out 0.5s ease forwards;
}

@keyframes splash-fade-out {
  to {
    opacity: 0;
    transform: scale(1.05);
    pointer-events: none;
  }
}
</style>
