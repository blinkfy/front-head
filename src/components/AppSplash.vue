<template>
  <!-- #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ -->
  <view class="app-splash" v-show="showAppSplash" :class="{ 'fade-out': appSplashFading }">
    <view class="app-splash-content">
      <image class="app-splash-gif" src="/static/moveable2.gif" mode="aspectFit" />
      <text class="app-splash-title">分投侠</text>
      <text class="app-splash-subtitle">智能垃圾分类助手</text>
      <view class="app-splash-progress">
        <view class="app-splash-progress-bar" ></view>
      </view>
    </view>
  </view>
  <!-- #endif -->
</template>

<script>
import { onAppPageReady } from '@/utils/app-page-ready.mjs'
// #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ
export default {
  name: 'AppSplash',
  data() {
    return {
      showAppSplash: true,
      appSplashFading: false
    }
  },
  mounted() {
    this.startLoading()
  },
  beforeUnmount() { this._disposeSplash?.() },
  methods: {
    startLoading() {
      let finished = false
      let releaseTimer = null
      let safetyTimer = null
      const finish = () => {
        if (finished) return
        finished = true
        clearTimeout(safetyTimer)
        this.appSplashFading = true
        releaseTimer = setTimeout(() => {
          this.showAppSplash = false
          this.$emit('loaded')
        }, 200)
      }
      const unsubscribe = onAppPageReady(finish)
      if (!finished) safetyTimer = setTimeout(finish, 4000)
      this._disposeSplash = () => {
        unsubscribe()
        clearTimeout(safetyTimer)
        clearTimeout(releaseTimer)
      }
    }
  }
}
// #endif
</script>

<style scoped>
/* #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ */
.app-splash {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg,
    #10b981 0%,
    #34d399 30%,
    #6ee7b7 60%,
    #a7f3d0 100%);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease;
}

.app-splash.fade-out {
  opacity: 0;
  pointer-events: none;
}

.app-splash-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30rpx;
  animation: appSplashIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes appSplashIn {
  0% {
    opacity: 0;
    transform: scale(0.5) translateY(50rpx);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.app-splash-gif {
  width: 500rpx;
  height: 500rpx;
  border-radius: 32rpx;
  box-shadow: 0 16rpx 60rpx rgba(0, 0, 0, 0.2);
  animation: appGifPulse 1.5s ease-in-out infinite;
}

@keyframes appGifPulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.03);
  }
}

.app-splash-title {
  font-size: 56rpx;
  font-weight: 800;
  color: #ffffff;
  text-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.2);
  letter-spacing: 8rpx;
  animation: appTitleGlow 2s ease-in-out infinite;
}

@keyframes appTitleGlow {
  0%, 100% {
    text-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.2);
  }
  50% {
    text-shadow: 0 4rpx 20rpx rgba(255, 255, 255, 0.5), 0 4rpx 12rpx rgba(0, 0, 0, 0.2);
  }
}

.app-splash-subtitle {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 4rpx;
}

.app-splash-progress {
  width: 400rpx;
  height: 6rpx;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3rpx;
  overflow: hidden;
  margin-top: 40rpx;
}

.app-splash-progress-bar {
  width: 42%;
  height: 100%;
  background: linear-gradient(90deg, #ffffff 0%, #d1fae5 100%);
  border-radius: 3rpx;
  transition: width 0.2s ease;
  box-shadow: 0 0 10rpx rgba(255, 255, 255, 0.5);
  animation: splash-travel 1.4s ease-in-out infinite;
}
@keyframes splash-travel { from { transform: translateX(-100%); } to { transform: translateX(240%); } }
/* #endif */
</style>
