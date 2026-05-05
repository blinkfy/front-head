<template>
  <view class="guide-container">
    <!-- 科技背景 -->
    <view class="tech-background">
      <view class="grid-overlay"></view>
      <!-- 蓝橙球形装饰 -->
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
        </view>

        <!-- 步骤 03: 图右文左 -->
        <view class="step-card horizontal">
          <view class="step-card-top">
            <view class="step-content-side">
              <view class="step-number">03</view>
              <text class="step-name">寻找最近箱体</text>
              <text class="step-desc">进入“点位地图”，我们将为您规划最近的“分投侠”智能柜路径。支持查看箱体当前承载状态。</text>
            </view>
            <view class="step-image-side">
              <image class="step-preview-mini" :src="getImageUrl('guide3.webp')" mode="aspectFit"></image>
            </view>
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
            
      <!-- 展示视频嵌入到步骤一 -->
      <view v-if="showVideo" class="app-video-section">
        <view class="detail-header">
          <text class="detail-title">📱 APP功能演示</text>
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
        <view class="fd-item map" @click="navigateTo('/pages/map/map')">
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
        <view class="fd-item community" @click="navigateTo('/pages-nonTheme/community')">
          <view class="fd-icon">🤝</view>
          <view class="fd-info">
            <text class="fd-name">绿色先行社区</text>
            <text class="fd-desc">与邻里分享心得，共同助力碳中和</text>
          </view>
        </view>
        <view class="fd-item booking" @click="navigateTo('/pages-nonTheme/booking')">
          <view class="fd-icon">📦</view>
          <view class="fd-info">
            <text class="fd-name">上门预约服务</text>
            <text class="fd-desc">大件垃圾处理难？一键预约专业上门</text>
          </view>
        </view>
        <view class="fd-item shop" @click="navigateTo('/pages-nonTheme/shop')">
          <view class="fd-icon">🎁</view>
          <view class="fd-info">
            <text class="fd-name">积分权益商城</text>
            <text class="fd-desc">分类产生价值，积分兑换精选好礼</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 垃圾分类指南汇总（紧凑版） -->
    <view id="guide-all" class="section-container">
      <view class="section-header">
        <text class="section-title">分类指南</text>
        <view class="title-line"></view>
      </view>
      
      <!-- 分类卡片网格 -->
    <view class="categories-grid">
      <!-- 可回收垃圾 -->
      <view class="category-card recyclable">
        <view class="card-header">
          <text class="category-icon">♻️</text>
          <text class="category-title">可回收垃圾</text>
        </view>
        <view class="card-content">
          <text class="category-desc">指适宜回收利用和资源化利用的生活废弃物，包括废纸、塑料、玻璃、金属、纺织物五大类。投放时应保持清洁干燥，避免污染</text>
          <view class="examples">
            <view class="examples-track">
              <text class="example-item">📰 纸类</text>
              <text class="example-item">🍶 玻璃</text>
              <text class="example-item">🥤 塑料</text>
              <text class="example-item">🥫 金属</text>
              <text class="example-item">👕 纺织物</text>
              <text class="example-item">📦 纸箱</text>
              <text class="example-item">📕 书籍</text>
              <text class="example-item">📄 纸张</text>
              <text class="example-item">🍾 酒瓶</text>
              <text class="example-item">🥛 牛奶盒</text>
              <text class="example-item">🧴 洗护品瓶</text>
              <text class="example-item">🪛 铁钉</text>
              <text class="example-item">👕 衣服</text>
              <text class="example-item">🧦 袜子</text>
              <text class="example-item">🎒 书包</text>
              <text class="example-item">🍶 玻璃</text>
              <text class="example-item">🥤 塑料</text>
              <text class="example-item">🥫 金属</text>
              <text class="example-item">👕 纺织物</text>
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
          <text class="category-desc">指对人体健康或者自然环境造成直接或者潜在危害的生活废弃物，需要特殊安全处理，投放时请注意轻放</text>
          <view class="examples">
            <view class="examples-track">
              <text class="example-item">🔋 电池</text>
              <text class="example-item">💡 灯管</text>
              <text class="example-item">🎨 油漆</text>
              <text class="example-item">💊 药品</text>
              <text class="example-item">🌡️ 水银</text>
              <text class="example-item">🧴 清洁剂</text>
              <text class="example-item">🪫 充电宝</text>
              <text class="example-item">🧪 化学试剂</text>
              <text class="example-item">🔌 电源线</text>
              <text class="example-item">📱 旧手机</text>
              <text class="example-item">💻 电子产品</text>
              <text class="example-item">🚬 烟蒂</text>
              <text class="example-item">🧴 杀虫剂</text>
              <text class="example-item">⚗️ 溶液</text>
              <text class="example-item">🔦 手电筒</text>
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
          <text class="category-desc">指居民日常生活及食品加工、饮食服务、单位供餐等活动中产生的易腐烂的生物质废弃物，应去除包装物后投放</text>
          <view class="examples">
            <view class="examples-track">
              <text class="example-item">🥬 菜叶</text>
              <text class="example-item">🍌 果皮</text>
              <text class="example-item">🍚 剩饭</text>
              <text class="example-item">🍳 蛋壳</text>
              <text class="example-item">🌸 花卉</text>
              <text class="example-item">🍖 骨头</text>
              <text class="example-item">🥕 蔬菜</text>
              <text class="example-item">🍎 果实</text>
              <text class="example-item">🧅 洋葱</text>
              <text class="example-item">🍝 面条</text>
              <text class="example-item">🥔 土豆皮</text>
              <text class="example-item">🥬 生菜</text>
              <text class="example-item">🌽 玉米</text>
              <text class="example-item">🍞 面包</text>
              <text class="example-item">🧈 油脂</text>
              <text class="example-item">🥬 菜叶</text>
              <text class="example-item">🍌 果皮</text>
              <text class="example-item">🍚 剩饭</text>
              <text class="example-item">🍳 蛋壳</text>
              <text class="example-item">🌸 花卉</text>
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
          <text class="category-desc">指除可回收物、有害垃圾、厨余垃圾之外的其他生活废弃物，一般采取填埋或焚烧等方式处理</text>
          <view class="examples">
            <view class="examples-track">
              <text class="example-item">🚬 烟头</text>
              <text class="example-item">🧻 纸巾</text>
              <text class="example-item">🍭 餐具</text>
              <text class="example-item">🏺 陶瓷</text>
              <text class="example-item">🐚 贝壳</text>
              <text class="example-item">🧷 胶带</text>
              <text class="example-item">🎈 气球</text>
              <text class="example-item">🧽 海绵</text>
              <text class="example-item">🪡 布料碎片</text>
              <text class="example-item">🗑️ 塑料袋</text>
              <text class="example-item">📖 湿巾</text>
              <text class="example-item">🚶 鞋子</text>
              <text class="example-item">🧤 手套</text>
              <text class="example-item">🪢 毛线</text>
              <text class="example-item">🧤 破布</text>
              <text class="example-item">🚬 烟头</text>
              <text class="example-item">🧻 纸巾</text>
              <text class="example-item">🍭 餐具</text>
              <text class="example-item">🏺 陶瓷</text>
              <text class="example-item">🐚 贝壳</text>
            </view>
          </view>
        </view>
        <view class="card-glow other-glow"></view>
      </view>
    </view>

    <!-- 小贴士 -->
    <view class="tips-section">
      <text class="tips-title">💡 分类小贴士</text>
      <view class="tips-list">
        <view class="tip-item">
          <text class="tip-icon">✨</text>
          <text class="tip-text">投放前请清空容器内的剩余物质</text>
        </view>
        <view class="tip-item">
          <text class="tip-icon">🧽</text>
          <text class="tip-text">有害垃圾单独投放，不要混入其他垃圾</text>
        </view>
        <view class="tip-item">
          <text class="tip-icon">📱</text>
          <text class="tip-text">不确定时可使用AI识别功能</text>
        </view>
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
          <text class="faq-q">视频里的功能在哪里？</text>
          <text class="faq-a">大部分核心功能（识别、地图）位于首页。其他高级功能（如挑战赛、抽奖）在首页“常用服务”分区中。</text>
        </view>
        <view class="faq-item">
          <text class="faq-q">小程序和 APP 有什么差别？</text>
          <text class="faq-a">APP 端支持更完整的原生震动反馈和离线识别预热，且在连接蓝牙设备时更加稳定。小程序端则即开即用。</text>
        </view>
        <view class="faq-item">
          <text class="faq-q">如何更新版本？</text>
          <text class="faq-a">小程序端由微信自动更新。APP 用户可以在“我的 - 关于我们”中检查新版本。</text>
        </view>
      </view>
    </view>

    <!-- 底部行动区 -->
    <view class="footer-actions">
      <view v-if="showVideo" class="footer-btn ghost" @click="scrollToVideoCard">
        <text>🎞️ 打开宣传片</text>
      </view>
      <view class="footer-btn main" @click="goHome">
        <text>🏠 去首页体验</text>
      </view>
      <view class="footer-link-box">
        <text class="footer-link" @click="navigateTo('/pages-nonTheme/chatlist')">联系我们</text>
        <text class="footer-sep">|</text>
        <text class="footer-link" @click="navigateTo('/pages-nonTheme/about')">关于页面</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { config } from "@/api/config"

const baseUrl = config.baseUrl
const getImageUrl = (url) => {
  if (!url) return ''
  // #ifdef MP-WEIXIN
  return `${baseUrl}/images/${url}`
  // #endif
  // #ifndef MP-WEIXIN
  return `/static/${url}`
  // #endif
}
// 场景视频 (Scenario)
const scenarioVideoUrl = `${baseUrl}/files/preview/%E5%88%86%E6%8A%95%E4%BE%A0%E8%AE%BE%E8%AE%A1/%E5%88%86%E6%8A%95%E4%BE%A0%E5%AE%A3%E4%BC%A0%E7%89%87/%E5%88%86%E6%8A%95%E4%BE%A0%E8%AE%BE%E8%AE%A1.m3u8`
const scenarioVideoPoster = getImageUrl(`cover.webp`)

// App 录屏视频 (App Screencap)
const appVideoUrl = `${baseUrl}/files/preview/%E5%88%86%E6%8A%95%E4%BE%A0%E8%AE%BE%E8%AE%A1/%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA/%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA.m3u8`
const appVideoPoster = getImageUrl(`app.webp`)

// 用于传递给 renderjs 的响应式对象
const scenarioVideoOptions = computed(() => ({
  src: scenarioVideoUrl,
  poster: scenarioVideoPoster
}))
const appVideoOptions = computed(() => ({
  src: appVideoUrl,
  poster: appVideoPoster
}))

const isPlaying = ref(false)
const showScenarioOverlay = ref(true) 
const showAppOverlay = ref(true) 
const showVideo = ref(false)

// 响应来自 renderjs 的播放状态改变
function onPlayerStatusChange(status) {
  // 根据 status 中的 target 区分
  if (status.target === 'scenario') {
    if (!status.isPlaying) showScenarioOverlay.value = true
  } else {
    if (!status.isPlaying) showAppOverlay.value = true
  }
}

const scenarioPlayTrigger = ref(0)
const appPlayTrigger = ref(0)

// 通知 renderjs 播放
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
  // #ifdef H5
  try {
    return localStorage.getItem('token') || ''
  } catch (error) {
    return ''
  }
  // #endif
  // #ifndef H5
  try {
    return uni.getStorageSync('token') || ''
  } catch (error) {
    return ''
  }
  // #endif
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: options.method || 'GET',
      header: options.header || {},
      data: options.data,
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}

async function checkVideoEnabled() {
  try {
    const payload = await requestJson(`${baseUrl}/api/ai/settings`)
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

    const userPayload = await requestJson(`${baseUrl}/api/userinfo?avater=false`, {
      header: { Authorization: token }
    })
    showVideo.value = !!(userPayload && userPayload.code === 0 && userPayload.data && userPayload.data.isAdmin)
  } catch (error) {
    console.warn('[guide] check AI settings failed:', error)
    showVideo.value = true
  }
}

function goHome() {
  uni.reLaunch({
    url: "/pages/home/home"
  })
}
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({url: '/pages/profile/profile'})
  }
}

function navigateTo(url) {
  uni.navigateTo({ url })
}

function goScan() {
  // #ifdef H5
  uni.showToast({ title: "H5端暂不支持扫码连接", icon: "none" })
  // #endif
  // #ifndef H5
  uni.navigateTo({ url: "/pages/home/home" })
  // #endif
}

function scrollToSteps() {
  uni.pageScrollTo({
    selector: "#steps-section",
    duration: 500
  })
}

function scrollToGuide() {
  uni.pageScrollTo({
    selector: "#guide-all",
    duration: 500
  })
}

function scrollToVideoCard() {
  uni.pageScrollTo({
    selector: ".hero-section",
    duration: 400
  })
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
      video: null
    }
  },
  mounted() {
    this.createVideo();
  },
  methods: {
    createVideo(id, target) {
      const container = document.getElementById(id);
      if (!container) return;
      
      const video = document.createElement('video');
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.backgroundColor = '#000';
      // 场景视频 cover，录屏视频 contain
      video.style.objectFit = target === 'scenario' ? 'cover' : 'contain';
      video.controls = true;
      video.playsInline = true;
      video.webkitPlaysinline = true;
      
      video.onplay = () => this.sendStatus(true, target);
      video.onpause = () => this.sendStatus(false, target);
      video.onended = () => this.sendStatus(false, target);
      
      container.appendChild(video);
      return video;
    },
    init(options) {
      if (!options || !options.src) return;
      if (!this.video) this.video = this.createVideo('video-container', 'scenario');
      this._initPlayer(this.video, options);
    },
    initApp(options) {
      if (!options || !options.src) return;
      if (!this.appVideo) this.appVideo = this.createVideo('video-container-app', 'app');
      this._initPlayer(this.appVideo, options);
    },
    _initPlayer(video, options) {
      const { src, poster } = options;
      video.poster = poster;
      
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
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
  background: linear-gradient(180deg, #f3fff8 0%, #f7f9fb 34%, #f3fbff 72%, #f7f9fb 100%);
  position: relative;
  overflow-x: hidden;
  padding-top: 16rpx;
  padding-bottom: 36rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 背景球 */
.bg-circle {
  position: fixed;
  border-radius: 50%;
  filter: blur(80rpx);
  opacity: 0.15;
  z-index: 0;
  pointer-events: none;
}

.circle-blue { width: 400rpx; height: 400rpx; background: #3b82f6; top: 10%; left: -100rpx; }
.circle-orange { width: 350rpx; height: 350rpx; background: #f59e0b; top: 40%; right: -150rpx; }
.circle-green { width: 300rpx; height: 300rpx; background: #10b981; bottom: 10%; left: 20%; }

/* 封面/宣传卡片区 */
.hero-section {
  position: relative;
  z-index: 10;
  padding: 48rpx 30rpx 32rpx;
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(59, 130, 246, 0) 100%);
  text-align: center;
  width: calc(100% - 48rpx);
  max-width: 1500rpx;
  box-sizing: border-box;
}

.hero-content {
  margin-bottom: 24rpx;
}

.hero-title {
  font-size: 48rpx;
  font-weight: 800;
  color: #1f2937;
  display: block;
}

.hero-subtitle {
  font-size: 24rpx;
  color: #6b7280;
  margin-top: 12rpx;
  display: block;
}

.video-card {
  position: relative;
  width: 100%;
  margin: 0 auto 24rpx;
  aspect-ratio: 17/9;
  background: #000;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 12rpx 28rpx rgba(0, 0, 0, 0.12);
}

.promo-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #000;
}

.video-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.play-icon-wrapper {
  width: 110rpx;
  height: 110rpx;
  background: rgba(255, 255, 255, 0.25);
  border: 4rpx solid #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
}

.play-icon {
  color: #fff;
  font-size: 50rpx;
  margin-left: 10rpx;
}

/* 方案A：录屏视频样式 */
.app-video-section {
  width: 100%;
  margin-top: 20rpx;
  margin-bottom: 40rpx;
}

.detail-header {
  margin-bottom: 16rpx;
}

.detail-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1f2937;
  display: block;
}

.detail-subtitle {
  font-size: 22rpx;
  color: #9ca3af;
}

.app-video-card {
  margin: 0;
  border: 4rpx solid rgba(16, 185, 129, 0.2);
  background: #000;
  box-shadow: 0 8rpx 20rpx rgba(16, 185, 129, 0.08);
}

.app-video {
  width: 100%;
  height: 100%;
}

.app-overlay {
  background: rgba(0, 0, 0, 0.45) !important;
}

.play-icon-wrapper.mini {
  width: 80rpx;
  height: 80rpx;
}

.play-icon-wrapper.mini .play-icon {
  font-size: 36rpx;
}

.video-card-disabled {
  width: 100%;
  height: 380rpx;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
  border: 2rpx dashed #d1d5db;
}

.disabled-icon {
  font-size: 60rpx;
  margin-bottom: 16rpx;
}

.disabled-text {
  font-size: 28rpx;
  color: #4b5563;
  font-weight: 600;
}

.disabled-subtext {
  font-size: 22rpx;
  color: #9ca3af;
  margin-top: 8rpx;
}

@media screen and (min-width: 960px) {
  .hero-section {
    padding-top: 40rpx;
  }

  .video-card {
    width: 100%;
  }
}

.video-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  padding: 18rpx 22rpx 20rpx;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(8, 18, 32, 0.76) 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.overlay-title {
  color: #fff;
  font-size: 24rpx;
  font-weight: 600;
}

.video-tip {
  color: rgba(255, 255, 255, 0.82);
  font-size: 20rpx;
}

.hero-actions {
  display: flex;
  gap: 18rpx;
  justify-content: center;
}

.action-btn {
  padding: 20rpx 28rpx;
  border-radius: 50rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-weight: 600;
  font-size: 26rpx;
  transition: all 0.2s;
}

.action-btn.primary {
  background: #10b981;
  color: #fff;
  box-shadow: 0 10rpx 20rpx rgba(16, 185, 129, 0.3);
}

.action-btn.secondary {
  background: #fff;
  color: #374151;
  border: 2rpx solid #e5e7eb;
}

/* 分区通用样式 */
.section-container {
  padding: 40rpx 30rpx;
  position: relative;
  z-index: 10;
  width: calc(100% - 48rpx);
  max-width: 1500rpx;
  box-sizing: border-box;
}

.section-header {
  margin-bottom: 24rpx;
}

.section-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1f2937;
}

.title-line {
  width: 48rpx;
  height: 6rpx;
  background: #10b981;
  border-radius: 4rpx;
  margin-top: 8rpx;
}

/* 步骤卡片 */
.steps-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.step-card {
  background: #fff;
  border-radius: 28rpx;
  padding: 0;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.05);
  overflow: hidden;
}

.step-card.horizontal {
  padding: 0;
}

.step-card-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 20rpx 24rpx;
  gap: 10rpx;
}

.step-card.horizontal.reverse .step-card-top {
  flex-direction: row-reverse;
}

.step-content-side {
  flex: 1.4;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  text-align: left;
}

.step-image-side {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-preview-mini {
  width: 100%;
  height: 200rpx;
  border-radius: 12rpx;
}

.step-name {
  font-size: 28rpx;
  font-weight: 700;
  color: #111827;
  display: block;
  margin-bottom: 2rpx;
}

.step-desc {
  font-size: 22rpx;
  color: #6b7280;
  line-height: 1.4;
}

.step-extra.full-width {
  background: #fdfdfd;
  padding: 16rpx 24rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  border-top: 1rpx solid #f1f5f9;
}

.extra-tag {
  font-size: 18rpx;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
}

.extra-text {
  font-size: 20rpx;
  color: #6b7280;
}

.step-number {
  font-size: 48rpx;
  font-weight: 900;
  color: rgba(16, 185, 129, 0.15);
  line-height: 1;
}

.step-icons-box {
  display: flex;
  gap: 32rpx;
  margin-top: 10rpx;
}

.s-icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.s-icon-item text:first-child {
  font-size: 36rpx;
}

.s-icon-item text:last-child {
  font-size: 20rpx;
  color: #9ca3af;
}

/* 详尽功能网格 */
.features-detailed-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.fd-item {
  background: #fff;
  padding: 24rpx;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  box-shadow: 0 4rpx 10rpx rgba(0,0,0,0.03);
}

.fd-icon {
  width: 70rpx;
  height: 70rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
}

/* 根据类型设置渐变背景 */
.fd-item.ai .fd-icon { background: rgba(59, 130, 246, 0.1); }
.fd-item.map .fd-icon { background: rgba(16, 185, 129, 0.1); }
.fd-item.device .fd-icon { background: rgba(139, 92, 246, 0.1); }
.fd-item.community .fd-icon { background: rgba(245, 158, 11, 0.1); }
.fd-item.booking .fd-icon { background: rgba(236, 72, 153, 0.1); }
.fd-item.shop .fd-icon { background: rgba(16, 185, 129, 0.1); }

.fd-name {
  font-size: 26rpx;
  font-weight: 700;
  color: #111827;
  display: block;
}

.fd-desc {
  font-size: 20rpx;
  color: #9ca3af;
  line-height: 1.4;
}

.s-icon {
  font-size: 36rpx;
  background: #f0fdf4;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
}

/* 分类胶囊 */
.categories-compact {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.cat-pill {
  padding: 12rpx 22rpx;
  border-radius: 100rpx;
  font-size: 22rpx;
  font-weight: 600;
  border: 2rpx solid transparent;
}

.cat-pill.recyclable { background: #f0fdf4; color: #16a34a; border-color: rgba(22, 163, 74, 0.2); }
.cat-pill.harmful { background: #fef2f2; color: #dc2626; border-color: rgba(220, 38, 38, 0.2); }
.cat-pill.kitchen { background: #fffbeb; color: #d97706; border-color: rgba(217, 119, 6, 0.2); }
.cat-pill.other { background: #f9fafb; color: #4b5563; border-color: rgba(75, 85, 99, 0.2); }

/* FAQ */
.faq-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.faq-item {
  background: white;
  padding: 22rpx;
  border-radius: 18rpx;
}

.faq-q {
  font-size: 26rpx;
  font-weight: 700;
  color: #111827;
  display: block;
  margin-bottom: 8rpx;
}

.faq-a {
  font-size: 24rpx;
  color: #6b7280;
  line-height: 1.6;
}

/* 底部操作 */
.footer-actions {
  padding: 44rpx 30rpx 56rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  align-items: center;
  width: calc(100% - 48rpx);
  max-width: 900rpx;
  box-sizing: border-box;
}

.footer-btn {
  width: 100%;
  height: 84rpx;
  border-radius: 42rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 28rpx;
}

.footer-btn.main {
  background: #10b981;
  color: #fff;
  box-shadow: 0 10rpx 30rpx rgba(16, 185, 129, 0.3);
}

.footer-btn.ghost {
  background: #fff;
  color: #10b981;
  border: 3rpx solid #10b981;
}

.footer-link-box {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}

.footer-link {
  font-size: 22rpx;
  color: #9ca3af;
}

.footer-sep {
  color: #e5e7eb;
}


/* 分类网格 */
.categories-grid {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300rpx, 1fr));
  gap: 20rpx;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

/* 移动端和平板 */
@media (max-width: 768px) {
  .categories-grid {
    grid-template-columns: 1fr;
  }
}

/* 大屏幕 */
@media (min-width: 769px) {
  .categories-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}


.category-card {
  position: relative;
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.8) 0%, 
    rgba(248, 250, 252, 0.7) 40%,
    rgba(241, 245, 249, 0.6) 100%);
  backdrop-filter: blur(20rpx);
  border-radius: 20rpx;
  border: 1px solid;
  padding: 24rpx 20rpx;
  overflow: hidden;
  box-shadow: 
    inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
    inset 0 -2rpx 0 rgba(0, 0, 0, 0.03),
    0 8rpx 32rpx rgba(0, 0, 0, 0.06),
    0 2rpx 8rpx rgba(0, 0, 0, 0.03);
  transition: all 0.3s ease;
  animation: cardBreathe 4s ease-in-out infinite;
}

/* 卡片呼吸动画 */
@keyframes cardBreathe {
  0%, 100% {
    transform: scale(1);
    box-shadow: 
      inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
      inset 0 -2rpx 0 rgba(0, 0, 0, 0.03),
      0 8rpx 32rpx rgba(0, 0, 0, 0.06),
      0 2rpx 8rpx rgba(0, 0, 0, 0.03);
  }
  50% {
    transform: scale(1.005);
    box-shadow: 
      inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
      inset 0 -2rpx 0 rgba(0, 0, 0, 0.03),
      0 12rpx 40rpx rgba(0, 0, 0, 0.08),
      0 4rpx 12rpx rgba(0, 0, 0, 0.04);
  }
}

/* 卡片顶部高光 */
.category-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2rpx;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0.9) 20%, 
    rgba(255, 255, 255, 0.9) 80%, 
    transparent 100%);
  pointer-events: none;
}

/* 卡片材质纹理 */
.category-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: 
    linear-gradient(135deg, transparent 48%, rgba(255, 255, 255, 0.3) 50%, transparent 52%),
    linear-gradient(225deg, transparent 48%, rgba(255, 255, 255, 0.2) 50%, transparent 52%);
  background-size: 20rpx 20rpx;
  opacity: 0.3;
  pointer-events: none;
}

.category-card.recyclable {
  border-color: rgba(34, 197, 94, 0.15);
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.85) 0%, 
    rgba(236, 253, 245, 0.75) 40%,
    rgba(209, 250, 229, 0.65) 100%);
  animation-delay: 0s;
}

.category-card.harmful {
  border-color: rgba(239, 68, 68, 0.15);
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.85) 0%, 
    rgba(254, 242, 242, 0.75) 40%,
    rgba(254, 226, 226, 0.65) 100%);
  animation-delay: 1s;
}

.category-card.kitchen {
  border-color: rgba(245, 158, 11, 0.15);
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.85) 0%, 
    rgba(255, 251, 235, 0.75) 40%,
    rgba(254, 243, 199, 0.65) 100%);
  animation-delay: 2s;
}

.category-card.other {
  border-color: rgba(107, 114, 128, 0.15);
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.85) 0%, 
    rgba(243, 244, 246, 0.75) 40%,
    rgba(229, 231, 235, 0.65) 100%);
  animation-delay: 3s;
}

.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.category-icon {
  font-size: 40rpx;
  margin-right: 16rpx;
}

.category-title {
  color: #1f2937;
  font-size: 32rpx;
  font-weight: 600;
}

.card-content {
  margin-left: 56rpx;
}

.category-desc {
  display: block;
  color: #6b7280;
  font-size: 26rpx;
  line-height: 1.5;
  margin-bottom: 16rpx;
}

.examples {
  overflow: hidden;
  white-space: nowrap;
  position: relative;
}

.examples-track {
  display: inline-flex;
  gap: 12rpx;
  animation: scrollTrack 15s linear infinite;
}

@keyframes scrollTrack {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.example-item {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  padding: 8rpx 16rpx;
  border-radius: 16rpx;
  font-size: 22rpx;
  border: 1px solid rgba(16, 185, 129, 0.2);
  white-space: nowrap;
  flex-shrink: 0;
}

.card-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 20rpx;
  opacity: 0.3;
  animation: cardPulse 4s ease-in-out infinite;
  pointer-events: none;
}

.recyclable-glow {
  background: radial-gradient(circle at center, rgba(34, 197, 94, 0.2) 0%, transparent 70%);
}

.harmful-glow {
  background: radial-gradient(circle at center, rgba(239, 68, 68, 0.2) 0%, transparent 70%);
}

.kitchen-glow {
  background: radial-gradient(circle at center, rgba(245, 158, 11, 0.2) 0%, transparent 70%);
}

.other-glow {
  background: radial-gradient(circle at center, rgba(107, 114, 128, 0.2) 0%, transparent 70%);
}

@keyframes cardPulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.4; }
}

/* 小贴士 - 玻璃材质 + 鼠标光感追踪 */
.tips-section {
  position: relative;
  z-index: 10;
  margin: 40rpx 40rpx 0;
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.98) 0%, 
    rgba(236, 253, 245, 0.95) 30%,
    rgba(209, 250, 229, 0.92) 70%,
    rgba(167, 243, 208, 0.9) 100%);
  backdrop-filter: blur(20rpx);
  border-radius: 20rpx;
  border: 1px solid rgba(52, 211, 153, 0.3);
  padding: 30rpx;
  box-shadow: 
    inset 0 1rpx 0 rgba(255, 255, 255, 0.8),
    inset 0 -1rpx 0 rgba(52, 211, 153, 0.15),
    0 8rpx 32rpx rgba(16, 185, 129, 0.15),
    0 2rpx 8rpx rgba(16, 185, 129, 0.08);
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 鼠标光感追踪效果 */
.tips-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(
    circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(255, 255, 255, 0.4) 0%,
    rgba(52, 211, 153, 0.1) 30%,
    transparent 60%
  );
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.tips-section:hover::before {
  opacity: 1;
}

/* 顶部高光 */
.tips-section::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1rpx;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0.8) 20%, 
    rgba(255, 255, 255, 0.8) 80%, 
    transparent 100%);
  pointer-events: none;
}

.tips-title {
  display: block;
  color: #059669;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 24rpx;
  text-align: center;
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.tip-item {
  display: flex;
  align-items: center;
}

.tip-icon {
  font-size: 28rpx;
  margin-right: 16rpx;
}

.tip-text {
  color: #4b5563;
  font-size: 26rpx;
  line-height: 1.5;
  flex: 1;
}

/* ===== 返回按钮 ===== */
.back-btn {
  position: absolute;
  top: 50rpx;
  left: 20rpx;
  width: 80rpx;
  height: 80rpx;
  backdrop-filter: blur(10px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: all 0.3s ease;
  cursor: pointer;
}

.about-container .back-btn {
  background: rgba(16, 185, 129, 0.1);
  border: 2px solid rgba(16, 185, 129, 0.3);
}

.about-container .back-btn:active {
  transform: scale(0.9);
  background: rgba(16, 185, 129, 0.2);
}
</style>