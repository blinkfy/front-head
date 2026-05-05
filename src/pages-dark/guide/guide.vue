<template>
  <view class="guide-container">
    <!-- 科技背景 (暗色模式优化) -->
    <view class="tech-background">
      <view class="grid-overlay"></view>
      <!-- 蓝绿深色装饰球 -->
      <view class="bg-circle circle-blue"></view>
      <view class="bg-circle circle-orange"></view>
      <view class="bg-circle circle-green"></view>
    </view>
    <!-- 返回按钮 -->
    <view class="back-btn" @click="goBack">
      <text class="back-icon">←</text>
    </view>
    <!-- 顶部封面区 -->
    <view class="hero-section">
      <view class="hero-content">
        <text class="hero-title">分投侠 使用指南</text>
        <text v-if="showVideo" class="hero-subtitle">演示分投侠在日常生活中的应用场景</text>
      </view>
      
      <view v-if="showVideo" class="video-card">
        <!-- #ifdef APP-PLUS -->
        <view 
          id="video-container" 
          class="promo-video"
          :videoOptions="scenarioVideoOptions"
          :change:videoOptions="hlsPlayer.init"
          :playTrigger="scenarioPlayTrigger"
          :change:playTrigger="hlsPlayer.play"
        ></view>
        <!-- #endif -->

        <!-- #ifndef APP-PLUS -->
        <video
          id="scenarioVideo"
          class="promo-video"
          :src="scenarioVideoUrl"
          :poster="scenarioVideoPoster"
          object-fit="cover"
          controls
          @play="showScenarioOverlay = false"
          @pause="showScenarioOverlay = true"
          @ended="showScenarioOverlay = true"
        ></video>
        <!-- #endif -->
        
        <!-- 播放叠加层 -->
        <view v-if="showScenarioOverlay" class="video-overlay" @click="requestPlay('scenario')">
          <view class="play-icon-wrapper">
            <text class="play-icon">▶</text>
          </view>
          <text class="overlay-title">观看 使用场景演示</text>
        </view>
      </view>

      <view v-if="showVideo" class="hero-actions">
        <view class="action-btn primary" @click="goHome">
          <text class="btn-icon">🚀</text>
          <text>立即体验</text>
        </view>
        <view class="action-btn secondary" @click="scrollToSteps">
          <text class="btn-icon">📖</text>
          <text>查看新手步骤</text>
        </view>
      </view>
    </view>

    <!-- 使用路径区 -->
    <view id="steps-section" class="section-container">
      <view class="section-header">
        <text class="section-title">核心使用路径</text>
        <view class="title-line"></view>
      </view>

      <view class="steps-list">
        <!-- 步骤 01: 图右文左 -->
        <view class="step-card horizontal">
          <view class="step-card-top">
            <view class="step-content-side">
              <view class="step-number">01</view>
              <text class="step-name">精准拍照识别</text>
              <text class="step-desc">在首页点击“点击拍照识别”。将物体置于画面中心，确保光线充足，AI 将在数秒内给出分类建议。</text>
            </view>
            <view class="step-image-side">
              <image class="step-preview-mini" :src="getImageUrl('guide1.webp')" mode="aspectFit"></image>
            </view>
          </view>
          <view class="step-extra full-width">
            <text class="extra-tag">小技巧</text>
            <text class="extra-text">避开杂乱背景，单次拍摄一种物体识别率更高</text>
          </view>
        </view>

        <!-- 步骤 02: 图左文右 -->
        <view class="step-card horizontal reverse">
          <view class="step-card-top">
            <view class="step-content-side">
              <view class="step-number">02</view>
              <text class="step-name">详尽分类百科</text>
              <text class="step-desc">识别后不仅能看到类别，还能查看处理建议集。点击“分类指南”可搜索任何不确定的垃圾。</text>
            </view>
            <view class="step-image-side">
              <image class="step-preview-mini" :src="getImageUrl('guide2.webp')" mode="aspectFit"></image>
            </view>
          </view>
          <view class="step-extra full-width">
            <text class="extra-tag">小技巧</text>
            <text class="extra-text">支持 4 大类、上千种细分垃圾属性查询</text>
          </view>
        </view>

        <!-- 步骤 03: 图右文左 -->
        <view class="step-card horizontal">
          <view class="step-card-top">
            <view class="step-content-side">
              <view class="step-number">03</view>
              <text class="step-name">寻找最近箱体</text>
              <text class="step-desc">进入“点位地图”，我们将为您规划最近的“分投侠”智能柜路径。支持查看箱体当前满溢状态。</text>
            </view>
            <view class="step-image-side">
              <image class="step-preview-mini" :src="getImageUrl('guide3.webp')" mode="aspectFit"></image>
            </view>
          </view>
          <view class="step-extra full-width">
            <text class="extra-tag">小技巧</text>
            <text class="extra-text">手机开启定位，导航更精准</text>
          </view>
        </view>

        <!-- 步骤 04: 图左文右 -->
        <view class="step-card horizontal reverse">
          <view class="step-card-top">
            <view class="step-content-side">
              <view class="step-number">04</view>
              <text class="step-name">投递兑换好礼</text>
              <text class="step-desc">通过扫码开启箱门，投递可回收物后系统自动结算。在“积分商城”兑换生活用品或提取奖励。</text>
            </view>
            <view class="step-image-side">
              <image class="step-preview-mini" :src="getImageUrl('guide4.webp')" mode="aspectFit"></image>
            </view>
          </view>
          <view class="step-extra full-width">
            <text class="extra-tag">小技巧</text>
            <text class="extra-text">定期参与社区挑战，可获得额外翻倍积分奖励</text>
          </view>
        </view>
      </view>
            
      <!-- 录屏展示视频 -->
      <view v-if="showVideo" class="app-video-section">
        <view class="detail-header">
          <text class="detail-title">📱 实时录屏演示</text>
          <text class="detail-subtitle">直观感受分投侠的操作便捷性</text>
        </view>
        <view class="video-card app-video-card">
          <!-- #ifdef APP-PLUS -->
          <view 
            id="video-container-app" 
            class="app-video"
            :videoOptions="appVideoOptions"
            :change:videoOptions="hlsPlayer.initApp"
            :playTrigger="appPlayTrigger"
            :change:playTrigger="hlsPlayer.playApp"
          ></view>
          <!-- #endif -->

          <!-- #ifndef APP-PLUS -->
          <video
            id="appVideo"
            class="app-video"
            :src="appVideoUrl"
            :poster="appVideoPoster"
            object-fit="contain"
            controls
            @play="showAppOverlay = false"
            @pause="showAppOverlay = true"
            @ended="showAppOverlay = true"
          ></video>
          <!-- #endif -->
          <view v-if="showAppOverlay" class="video-overlay app-overlay" @click="requestPlay('app')">
            <view class="play-icon-wrapper mini">
              <text class="play-icon">▶</text>
            </view>
            <text class="overlay-title">App 功能演示</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 深度功能详解 -->
    <view class="section-container">
      <view class="section-header">
        <text class="section-title">全场景功能矩阵</text>
        <view class="title-line"></view>
      </view>
      
      <view class="features-detailed-grid">
        <view class="fd-item ai" @click="goHome">
          <view class="fd-icon">🤖</view>
          <view class="fd-info">
            <text class="fd-name">AI 图像增强识别</text>
            <text class="fd-desc">万物皆可识别，自研模型持续进化</text>
          </view>
        </view>
        <view class="fd-item map" @click="navigateTo('/pages-dark/map/map')">
          <view class="fd-icon">🗺️</view>
          <view class="fd-info">
            <text class="fd-name">智能网点地图</text>
            <text class="fd-desc">一键导航至最近的回收桶点位</text>
          </view>
        </view>
        <view class="fd-item device" @click="goScan">
          <view class="fd-icon">📱</view>
          <view class="fd-info">
            <text class="fd-name">物联网设备联动</text>
            <text class="fd-desc">蓝牙/扫码极速连接，智享开盖体验</text>
          </view>
        </view>
        <view class="fd-item community" @click="navigateTo('/pages-dark/community/community')">
          <view class="fd-icon">🤝</view>
          <view class="fd-info">
            <text class="fd-name">绿色先行社区</text>
            <text class="fd-desc">与邻里分享心得，共同助力碳中和</text>
          </view>
        </view>
        <view class="fd-item booking" @click="navigateTo('/pages-dark/booking/booking')">
          <view class="fd-icon">📦</view>
          <view class="fd-info">
            <text class="fd-name">上门预约服务</text>
            <text class="fd-desc">大件垃圾处理难？一键预约专业上门</text>
          </view>
        </view>
        <view class="fd-item shop" @click="navigateTo('/pages-dark/shop/shop')">
          <view class="fd-icon">🎁</view>
          <view class="fd-info">
            <text class="fd-name">积分权益商城</text>
            <text class="fd-desc">分类产生价值，积分兑换精选好礼</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 垃圾分类指南 -->
    <view id="guide-all" class="section-container">
      <view class="section-header">
        <text class="section-title">分类指南</text>
        <view class="title-line"></view>
      </view>
      
      <view class="categories-grid">
        <!-- 可回收垃圾 -->
        <view class="category-card recyclable">
          <view class="card-header">
            <text class="category-icon">♻️</text>
            <text class="category-title">可回收垃圾</text>
          </view>
          <view class="card-content">
            <text class="category-desc">适宜回收利用和资源化利用的生活废弃物。投放时应保持清洁干燥。</text>
            <view class="examples">
              <view class="examples-track">
                <text class="example-item">📰 纸类</text>
                <text class="example-item">🍶 玻璃</text>
                <text class="example-item">🥤 塑料</text>
                <text class="example-item">🥫 金属</text>
                <text class="example-item">👕 纺织物</text>
                <text class="example-item">📦 纸箱</text>
              </view>
            </view>
          </view>
          <view class="card-glow recyclable-glow"></view>
        </view>

        <!-- 有害垃圾 -->
        <view class="category-card harmful">
          <view class="card-header">
            <text class="category-icon">☢️</text>
            <text class="category-title">有害垃圾</text>
          </view>
          <view class="card-content">
            <text class="category-desc">对人体健康或环境造成危害。投放时请轻放，防止破碎。</text>
            <view class="examples">
              <view class="examples-track">
                <text class="example-item">🔋 电池</text>
                <text class="example-item">💡 灯管</text>
                <text class="example-item">🎨 油漆</text>
                <text class="example-item">💊 药品</text>
                <text class="example-item">🌡️ 水银</text>
              </view>
            </view>
          </view>
          <view class="card-glow harmful-glow"></view>
        </view>

        <!-- 厨余垃圾 -->
        <view class="category-card kitchen">
          <view class="card-header">
            <text class="category-icon">🍎</text>
            <text class="category-title">厨余垃圾</text>
          </view>
          <view class="card-content">
            <text class="category-desc">易腐烂的生物质废弃物。建议沥干水分并去除包装后投放。</text>
            <view class="examples">
              <view class="examples-track">
                <text class="example-item">🥬 菜叶</text>
                <text class="example-item">🍌 果皮</text>
                <text class="example-item">🍚 剩饭</text>
                <text class="example-item">🍳 蛋壳</text>
                <text class="example-item">🍖 骨头</text>
              </view>
            </view>
          </view>
          <view class="card-glow kitchen-glow"></view>
        </view>

        <!-- 其他垃圾 -->
        <view class="category-card other">
          <view class="card-header">
            <text class="category-icon">🗑️</text>
            <text class="category-title">其他垃圾</text>
          </view>
          <view class="card-content">
            <text class="category-desc">除上述三类外的其他生活废弃物。</text>
            <view class="examples">
              <view class="examples-track">
                <text class="example-item">🚬 烟头</text>
                <text class="example-item">🧻 纸巾</text>
                <text class="example-item">🏺 陶瓷</text>
                <text class="example-item">🐚 贝壳</text>
                <text class="example-item">🧤 破布</text>
              </view>
            </view>
          </view>
          <view class="card-glow other-glow"></view>
        </view>
      </view>
    </view>

    <!-- 常见问题区 -->
    <view class="section-container faq-section">
      <view class="section-header">
        <text class="section-title">常见问题</text>
        <view class="title-line"></view>
      </view>
      
      <view class="faq-list">
        <view class="faq-item">
          <text class="faq-q">为什么识别结果不准？</text>
          <text class="faq-a">AI 识别受拍摄光线、角度以及背景干扰影响。建议在光线充足的环境中对准物体拍摄。</text>
        </view>
        <view class="faq-item">
          <text class="faq-q">如何更新版本？</text>
          <text class="faq-a">暗色模式版本随系统自动更新。APP 用户可以在“我的 - 关于我们”中检查新版本。</text>
        </view>
      </view>
    </view>

    <!-- 底部行动区 -->
    <view class="footer-actions">
      <view class="footer-btn main" @click="goHome">
        <text>🏠 去首页体验</text>
      </view>
      <view class="footer-link-box">
        <text class="footer-link" @click="navigateTo('/pages-dark/chat/chatlist')">联系我们</text>
        <text class="footer-sep">|</text>
        <text class="footer-link" @click="navigateTo('/pages-dark/profile/about')">关于分投侠</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { config } from "@/api/config"

const baseUrl = config.baseUrl

// 视频资源
const scenarioVideoUrl = `${baseUrl}/files/preview/%E5%88%86%E6%8A%95%E4%BE%A0%E8%AE%BE%E8%AE%A1/%E5%88%86%E6%8A%95%E4%BE%A0%E5%AE%A3%E4%BC%A0%E7%89%87/%E5%88%86%E6%8A%95%E4%BE%A0%E8%AE%BE%E8%AE%A1.m3u8`
const appVideoUrl = `${baseUrl}/files/preview/%E5%88%86%E6%8A%95%E4%BE%A0%E8%AE%BE%E8%AE%A1/%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA/%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA.m3u8`

const getImageUrl = (url) => {
  if (!url) return ''
  // #ifdef MP-WEIXIN
  return `${baseUrl}/images/${url}`
  // #endif
  // #ifndef MP-WEIXIN
  return `/static/${url}`
  // #endif
}

const scenarioVideoPoster = getImageUrl('cover.webp')
const appVideoPoster = getImageUrl('app.webp')

const scenarioVideoOptions = computed(() => ({ src: scenarioVideoUrl, poster: scenarioVideoPoster }))
const appVideoOptions = computed(() => ({ src: appVideoUrl, poster: appVideoPoster }))

const showScenarioOverlay = ref(true) 
const showAppOverlay = ref(true) 
const showVideo = ref(false)

function onPlayerStatusChange(status) {
  if (status.target === 'scenario') {
    if (!status.isPlaying) showScenarioOverlay.value = true
  } else {
    if (!status.isPlaying) showAppOverlay.value = true
  }
}
function goScan() {
  // #ifdef H5
  uni.showToast({ title: "H5端暂不支持扫码连接", icon: "none" })
  // #endif
  // #ifndef H5
  uni.navigateTo({ url: "/pages/home/home" })
  // #endif
}
const scenarioPlayTrigger = ref(0)
const appPlayTrigger = ref(0)

function requestPlay(type) {
  if (type === 'scenario') {
    showScenarioOverlay.value = false
    // #ifdef APP-PLUS
    scenarioPlayTrigger.value = Date.now()
    // #endif
    // #ifndef APP-PLUS
    uni.createVideoContext('scenarioVideo').play()
    // #endif
  } else {
    showAppOverlay.value = false
    // #ifdef APP-PLUS
    appPlayTrigger.value = Date.now()
    // #endif
    // #ifndef APP-PLUS
    uni.createVideoContext('appVideo').play()
    // #endif
  }
}

function getAuthToken() {
  try {
    return uni.getStorageSync('token') || ''
  } catch (error) {
    return ''
  }
}

async function checkVideoEnabled() {
  try {
    const res = await uni.request({ url: `${baseUrl}/api/ai/settings` })
    const payload = res.data
    const settings = payload && payload.code === 0 ? payload.data : null
    if (!settings || settings.aiEnabled !== false) {
      showVideo.value = true
      return
    }
    const token = getAuthToken()
    if (!token) {
      showVideo.value = false
      return
    }
    const userRes = await uni.request({
      url: `${baseUrl}/api/userinfo?avater=false`,
      header: { Authorization: token }
    })
    const userPayload = userRes.data
    showVideo.value = !!(userPayload && userPayload.code === 0 && userPayload.data && userPayload.data.isAdmin)
  } catch (error) {
    showVideo.value = true
  }
}

function scrollToSteps() {
  uni.pageScrollTo({ selector: '#steps-section', duration: 300 })
}

function goHome() {
  uni.reLaunch({ url: "/pages-dark/home/home" })
}

function navigateTo(url) {
  uni.navigateTo({ url })
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages-dark/home/home' })
  }
}

onMounted(() => {
  checkVideoEnabled()
})
</script>

<script module="hlsPlayer" lang="renderjs">
import Hls from 'hls.js'

export default {
  data() {
    return {
      hls: null,
      video: null,
      appHls: null,
      appVideo: null
    }
  },
  methods: {
    init(options) {
      this.video = document.querySelector('#video-container video') || document.createElement('video');
      this.video.style.width = '100%';
      this.video.style.height = '100%';
      this.video.setAttribute('playsinline', 'true');
      this.video.poster = options.poster;
      document.querySelector('#video-container').appendChild(this.video);

      this.video.onplay = () => this.sendStatus(true, 'scenario');
      this.video.onpause = () => this.sendStatus(false, 'scenario');
      this.video.onended = () => this.sendStatus(false, 'scenario');

      if (Hls.isSupported()) {
        this.hls = new Hls();
        this.hls.loadSource(options.src);
        this.hls.attachMedia(this.video);
      } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
        this.video.src = options.src;
      }
    },
    initApp(options) {
      this.appVideo = document.querySelector('#video-container-app video') || document.createElement('video');
      this.appVideo.style.width = '100%';
      this.appVideo.style.height = '100%';
      this.appVideo.setAttribute('playsinline', 'true');
      this.appVideo.poster = options.poster;
      document.querySelector('#video-container-app').appendChild(this.appVideo);

      this.appVideo.onplay = () => this.sendStatus(true, 'app');
      this.appVideo.onpause = () => this.sendStatus(false, 'app');
      this.appVideo.onended = () => this.sendStatus(false, 'app');

      if (Hls.isSupported()) {
        this.appHls = new Hls();
        this.appHls.loadSource(options.src);
        this.appHls.attachMedia(this.appVideo);
      } else if (this.appVideo.canPlayType('application/vnd.apple.mpegurl')) {
        this.appVideo.src = options.src;
      }
    },
    play(trigger) {
      if (trigger && this.video) this.video.play();
    },
    playApp(trigger) {
      if (trigger && this.appVideo) this.appVideo.play();
    },
    sendStatus(isPlaying, target) {
      this.$ownerInstance.callMethod('onPlayerStatusChange', { isPlaying, target });
    }
  }
}
</script>

<style scoped>
.guide-container {
  min-height: 100vh;
  background: #000508;
  position: relative;
  overflow-x: hidden;
  padding-bottom: 60rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 科技背景 */
.tech-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(16, 185, 129, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16, 185, 129, 0.08) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 25s linear infinite;
}
@keyframes gridMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(40px, 40px); }
}

.floating-particles {
  position: absolute;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 3px;
  height: 3px;
  background: radial-gradient(circle, #40e0ff 0%, transparent 70%);
  border-radius: 50%;
  animation: floatParticle 6s ease-in-out infinite;
}

.particle:nth-child(1) { top: 10%; left: 20%; animation-delay: 0s; }
.particle:nth-child(2) { top: 30%; left: 80%; animation-delay: 1s; }
.particle:nth-child(3) { top: 60%; left: 15%; animation-delay: 2s; }
.particle:nth-child(4) { top: 80%; left: 70%; animation-delay: 3s; }

@keyframes floatParticle {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
  50% { transform: translateY(-20px) scale(1.2); opacity: 1; }
}
.bg-circle {
  position: fixed;
  border-radius: 50%;
  filter: blur(100rpx);
  opacity: 0.35;
  z-index: 0;
}

.circle-blue { width: 500rpx; height: 500rpx; background: #1d4ed8; top: 5%; left: -200rpx; }
.circle-orange { width: 400rpx; height: 400rpx; background: #9a3412; top: 35%; right: -200rpx; }
.circle-green { width: 400rpx; height: 400rpx; background: #064e3b; bottom: 10%; left: 10%; }

.back-btn {
  position: fixed;
  left: 30rpx;
  top: 60rpx;
  z-index: 100;
  width: 70rpx;
  height: 70rpx;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.back-icon { color: #fff; font-size: 40rpx; }

.hero-section {
  position: relative;
  z-index: 10;
  padding: 100rpx 30rpx 40rpx;
  text-align: center;
  width: 100%;
  max-width: 1500rpx;
  box-sizing: border-box;
}

.hero-title {
  font-size: 48rpx;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 0 20rpx rgba(16, 185, 129, 0.3);
}

.hero-subtitle {
  font-size: 24rpx;
  color: #9ca3af;
  margin-top: 16rpx;
  display: block;
}

.video-card {
  position: relative;
  width: calc(100% - 60rpx);
  margin: 40rpx auto 0;
  aspect-ratio: 16/9;
  background: #000;
  border-radius: 24rpx;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20rpx 40rpx rgba(0, 0, 0, 0.4);
}

.promo-video { width: 100%; height: 100%; }

.video-overlay {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.play-icon-wrapper {
  width: 100rpx; height: 100rpx;
  background: rgba(16, 185, 129, 0.2);
  border: 2px solid #10b981;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
}

.play-icon { color: #10b981; font-size: 40rpx; margin-left: 8rpx; }
.overlay-title { color: #fff; font-size: 24rpx; font-weight: 600; }

.hero-actions { display: flex; gap: 20rpx; justify-content: center; margin-top: 40rpx; }
.action-btn {
  padding: 22rpx 40rpx;
  border-radius: 50rpx;
  font-weight: 600;
  font-size: 26rpx;
  display: flex; align-items: center; gap: 12rpx;
}
.action-btn.primary { background: #10b981; color: #fff; }
.action-btn.secondary { background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); }

.section-container {
  padding: 40rpx 30rpx;
  z-index: 10;
  width: 100%;
  max-width: 1500rpx;
  box-sizing: border-box;
}

.section-title { font-size: 36rpx; font-weight: 700; color: #fff; }
.title-line { width: 60rpx; height: 6rpx; background: #10b981; border-radius: 3rpx; margin-top: 12rpx; margin-bottom: 30rpx; }

.steps-list { display: flex; flex-direction: column; gap: 24rpx; }

.step-card {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 24rpx;
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.step-card-top {
  display: flex; padding: 24rpx; gap: 20rpx; align-items: center;
}

.step-card.reverse .step-card-top { flex-direction: row-reverse; }

.step-content-side { flex: 1.5; display: flex; flex-direction: column; gap: 12rpx; }
.step-number { font-size: 40rpx; font-weight: 900; color: rgba(16, 185, 129, 0.2); line-height: 1; }
.step-name { font-size: 30rpx; font-weight: 700; color: #fff; }
.step-desc { font-size: 24rpx; color: #9ca3af; line-height: 1.5; }

.step-image-side { flex: 1; display: flex; justify-content: center; }
.step-preview-mini { width: 100%; height: 210rpx; border-radius: 16rpx; }

/* 重点改进处：小技巧占据卡片底部整行（暗色版） */
.step-extra.full-width {
  background: rgba(255, 255, 255, 0.02);
  padding: 16rpx 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.extra-tag {
  font-size: 18rpx; font-weight: 700; color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 4rpx 12rpx; border-radius: 6rpx;
}
.extra-text { font-size: 22rpx; color: #6b7280; }

.app-video-section { margin-top: 40rpx; width: 100%; }
.detail-title { color: #fff; font-size: 30rpx; font-weight: 700; }
.detail-subtitle { color: #6b7280; font-size: 24rpx; margin-bottom: 20rpx; display: block; }
.app-video-card { margin: 0; background: #000; border: 1px solid rgba(16, 185, 129, 0.3); width: 100%; box-sizing: border-box; }
.app-video { width: 100%; height: 100%; display: block; }

.features-detailed-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 20rpx;
}
.fd-item {
  background: rgba(255, 255, 255, 0.03);
  padding: 20rpx 10rpx; border-radius: 20rpx;
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.fd-icon { font-size: 44rpx; margin-bottom: 12rpx; }
.fd-name { color: #fff; font-size: 24rpx; font-weight: 700; margin-bottom: 4rpx; display: block; }
.fd-desc { color: #6b7280; font-size: 18rpx; line-height: 1.2; }

.categories-grid { display: grid; grid-template-columns: 1fr; gap: 24rpx; }
.category-card {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 24rpx; border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 30rpx; position: relative;
}
.category-card.recyclable { border-left: 8rpx solid #10b981; }
.category-card.harmful { border-left: 8rpx solid #ef4444; }
.category-card.kitchen { border-left: 8rpx solid #f59e0b; }
.category-card.other { border-left: 8rpx solid #6b7280; }

.category-title { color: #fff; font-size: 32rpx; font-weight: 600; }
.category-desc { color: #9ca3af; font-size: 24rpx; margin: 16rpx 0; display: block; }
.example-item {
  display: inline-block; background: rgba(255, 255, 255, 0.05);
  color: #d1d5db; padding: 6rpx 16rpx; border-radius: 8rpx;
  font-size: 22rpx; margin-right: 12rpx; margin-bottom: 12rpx;
}

.faq-item { background: rgba(255, 255, 255, 0.02); padding: 24rpx; border-radius: 16rpx; margin-bottom: 16rpx; }
.faq-q { color: #10b981; font-size: 26rpx; font-weight: 700; margin-bottom: 8rpx; display: block; }
.faq-a { color: #9ca3af; font-size: 24rpx; line-height: 1.6; }

.footer-actions { padding:60rpx 40rpx; width: 100%; box-sizing: border-box; max-width: 1500rpx;}
.footer-btn.main { background: #10b981; color: #fff; height: 90rpx; border-radius: 45rpx; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.footer-link-box { display: flex; justify-content: center; gap: 20rpx; margin-top: 40rpx; }
.footer-link { color: #6b7280; font-size: 24rpx; }
.footer-sep { color: rgba(255, 255, 255, 0.1); }
</style>