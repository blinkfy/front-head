<template>
  <view class="guide-container">
    <!-- 科技背景 -->
    <view class="tech-background">
      <view class="grid-overlay"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 8" :key="n"></view>
      </view>
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
          <text class="category-desc">主要包括废纸、塑料、玻璃、金属和纺织物五大类</text>
          <view class="examples">
            <text class="example-item">📰 报纸杂志</text>
            <text class="example-item">🍶 玻璃瓶</text>
            <text class="example-item">🥤 塑料瓶</text>
            <text class="example-item">🥫 金属罐</text>
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
          <text class="category-desc">含有有毒有害化学物质的垃圾</text>
          <view class="examples">
            <text class="example-item">🔋 废电池</text>
            <text class="example-item">💡 废灯管</text>
            <text class="example-item">🎨 废油漆</text>
            <text class="example-item">💊 过期药品</text>
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
          <text class="category-desc">易腐烂的生物质废弃物</text>
          <view class="examples">
            <text class="example-item">🥬 蔬菜叶子</text>
            <text class="example-item">🍌 果皮果核</text>
            <text class="example-item">🍚 剩饭剩菜</text>
            <text class="example-item">🍳 食物残渣</text>
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
          <text class="category-desc">除上述三类之外的其他生活废弃物</text>
          <view class="examples">
            <text class="example-item">🚬 烟头</text>
            <text class="example-item">🧻 污损纸张</text>
            <text class="example-item">🍭 糖果包装</text>
            <text class="example-item">🏺 陶瓷制品</text>
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
function goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({
        url: '/pages-dark/home/home'
      })
    }
}
</script>

<style scoped>
.guide-container {
  min-height: 100vh;
  background: radial-gradient(ellipse at center, #0a1a2f 0%, #051015 70%, #000508 100%);
  position: relative;
  overflow: hidden;
  padding: 40rpx 0 120rpx 0;
}

/* 科技背景 */
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
    linear-gradient(rgba(64, 224, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.08) 1px, transparent 1px);
  background-size: 40px 40px;
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
  color: #40e0ff;
  font-size: 44rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
  text-shadow: 0 0 16rpx rgba(64, 224, 255, 0.5);
}

.header-icon {
  width: 70rpx;
  height: 70rpx;
  object-fit: cover;
  border-radius: 10rpx;
  box-shadow: 0 6rpx 14rpx rgba(64, 224, 255, 0.12);
}

.header-subtitle {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 28rpx;
  letter-spacing: 2rpx;
}

/* 分类网格 */
.categories-grid {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 30rpx;
  margin: 0 40rpx;
}

.category-card {
  position: relative;
  background: rgba(0, 30, 60, 0.8);
  backdrop-filter: blur(15px);
  border-radius: 24rpx;
  border: 2px solid;
  padding: 40rpx 30rpx;
  overflow: hidden;
}

.category-card.recyclable {
  border-color: rgba(34, 197, 94, 0.5);
}

.category-card.harmful {
  border-color: rgba(239, 68, 68, 0.5);
}

.category-card.kitchen {
  border-color: rgba(245, 158, 11, 0.5);
}

.category-card.other {
  border-color: rgba(107, 114, 128, 0.5);
}

.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.category-icon {
  font-size: 48rpx;
  margin-right: 20rpx;
}

.category-title {
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 600;
}

.card-content {
  margin-left: 68rpx;
}

.category-desc {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  font-size: 28rpx;
  line-height: 1.6;
  margin-bottom: 20rpx;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.example-item {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  padding: 12rpx 20rpx;
  border-radius: 20rpx;
  font-size: 24rpx;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.card-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 24rpx;
  opacity: 0.3;
  animation: cardPulse 4s ease-in-out infinite;
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

/* 小贴士 */
.tips-section {
  position: relative;
  z-index: 10;
  margin: 40rpx 40rpx 0;
  background: rgba(0, 255, 136, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20rpx;
  border: 1px solid rgba(0, 255, 136, 0.3);
  padding: 30rpx;
}

.tips-title {
  display: block;
  color: #00ff88;
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
  color: rgba(255, 255, 255, 0.9);
  font-size: 26rpx;
  line-height: 1.5;
  flex: 1;
}

/* 返回按钮 */
.back-button {
  position: relative;
  z-index: 10;
  margin: 40rpx auto 0;
  width: 200rpx;
  height: 80rpx;
  background: rgba(64, 224, 255, 0.2);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(64, 224, 255, 0.5);
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.back-button:active {
  transform: scale(0.95);
  background: rgba(64, 224, 255, 0.3);
}

.back-text {
  color: #40e0ff;
  font-size: 32rpx;
  font-weight: 600;
}
</style>
