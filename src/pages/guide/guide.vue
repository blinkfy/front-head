<template>
  <view class="guide-container">
    <!-- 科技背景 -->
    <view class="tech-background">
      <view class="grid-overlay"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 8" :key="n"></view>
      </view>
      <!-- 蓝橙球形装饰 -->
      <view class="bg-circle circle-blue"></view>
      <view class="bg-circle circle-orange"></view>
      <view class="bg-circle circle-green"></view>
    </view>

    <!-- 头部 -->
    <view class="guide-header">
      <view class="header-title">
        <image class="header-icon" src="/static/classfication.png" mode="aspectFill"></image>
        <text>垃圾分类指南</text>
      </view>
      <text class="header-subtitle">环保从分类开始</text>
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
              <text class="example-item">💊 ҩƷ</text>
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
              <text class="example-item">💊 ҩƷ</text>
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

    <!-- 返回按钮 -->
    <view class="back-button" @click="goBack">
      <text class="back-text">返回</text>
    </view>
  </view>
</template>

<script setup>
import { onMounted } from 'vue'

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

// 鼠标光感追踪
onMounted(() => {
  if (typeof window !== 'undefined') {
    const lightTrackElements = document.querySelectorAll('.tips-section, .back-button')
    
    lightTrackElements.forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        el.style.setProperty('--mouse-x', x + '%')
        el.style.setProperty('--mouse-y', y + '%')
      })
    })
  }
})
</script>

<style scoped>
.guide-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding: 40rpx 0 120rpx 0;
}

/* 清新背景 */
.tech-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(52, 211, 153, 0.06) 0%, transparent 40%);
}

.floating-particles {
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
  animation: floatParticle 6s ease-in-out infinite;
}

.particle:nth-child(1) { top: 10%; left: 20%; animation-delay: 0s; }
.particle:nth-child(2) { top: 30%; left: 80%; animation-delay: 1s; }
.particle:nth-child(3) { top: 60%; left: 15%; animation-delay: 2s; }
.particle:nth-child(4) { top: 80%; left: 70%; animation-delay: 3s; }

@keyframes floatParticle {
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
  width: 500rpx;
  height: 500rpx;
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  top: 300rpx;
  left: -200rpx;
  animation: circleFloat1 10s ease-in-out infinite;
}

.circle-orange {
  width: 450rpx;
  height: 450rpx;
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
  top: 600rpx;
  right: -180rpx;
  animation: circleFloat2 12s ease-in-out infinite;
}

.circle-green {
  width: 400rpx;
  height: 400rpx;
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  bottom: 200rpx;
  left: 100rpx;
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

/* 头部 */
.guide-header {
  position: relative;
  z-index: 10;
  text-align: center;
  padding: 60rpx 40rpx 40rpx;
}

.header-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  color: #059669;
  font-size: 44rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
}

.header-icon {
  width: 70rpx;
  height: 70rpx;
  object-fit: cover;
  border-radius: 10rpx;
  box-shadow: 0 6rpx 14rpx rgba(16, 185, 129, 0.12);
}

.header-subtitle {
  display: block;
  color: #6b7280;
  font-size: 28rpx;
  letter-spacing: 2rpx;
}

/* 分类网格 */
.categories-grid {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300rpx, 1fr));
  gap: 20rpx;
  margin: 0 30rpx;
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

/* 返回按钮 - 3D玻璃材质 + 鼠标光感追踪 */
.back-button {
  position: relative;
  z-index: 10;
  margin: 40rpx auto 0;
  width: 200rpx;
  height: 80rpx;
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.95) 0%, 
    rgba(236, 253, 245, 0.9) 50%,
    rgba(209, 250, 229, 0.85) 100%);
  backdrop-filter: blur(20rpx);
  border: 2px solid rgba(52, 211, 153, 0.4);
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 
    inset 0 2rpx 0 rgba(255, 255, 255, 0.9),
    inset 0 -2rpx 0 rgba(16, 185, 129, 0.2),
    0 6rpx 20rpx rgba(16, 185, 129, 0.2),
    0 2rpx 6rpx rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

/* 鼠标光感追踪效果 */
.back-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(
    circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(255, 255, 255, 0.6) 0%,
    rgba(52, 211, 153, 0.15) 30%,
    transparent 60%
  );
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.back-button:hover::before {
  opacity: 1;
}

/* 顶部高光 */
.back-button::after {
  content: '';
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1rpx;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0.9) 50%, 
    transparent 100%);
  pointer-events: none;
}

.back-button:active {
  transform: scale(0.95) translateY(2rpx);
  background: linear-gradient(145deg, 
    rgba(209, 250, 229, 0.95) 0%, 
    rgba(167, 243, 208, 0.9) 50%,
    rgba(110, 231, 183, 0.85) 100%);
  box-shadow: 
    inset 0 2rpx 4rpx rgba(0, 0, 0, 0.1),
    0 2rpx 8rpx rgba(16, 185, 129, 0.15);
}

.back-text {
  color: #059669;
  font-size: 32rpx;
  font-weight: 600;
}
</style>
