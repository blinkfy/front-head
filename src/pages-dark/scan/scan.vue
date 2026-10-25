<template>
  <view class="scan-container scan-dark" :class="{ 'session-mode': connected && deviceMode === 'bin' }">
    <view class="light-eco-decor" aria-hidden="true">
      <text class="eco-symbol eco-leaf-one">🌿</text>
      <text class="eco-symbol eco-leaf-two">🍃</text>
      <ManifestIcon class="eco-symbol eco-recycle" id="recycling_contribution" />
    </view>
    <view class="scan-topbar">
      <view class="back-btn" @click="goBack" aria-label="返回">
        <ManifestIcon class="back-icon" id="back" />
      </view>
      <view class="topbar-brand">
        <image class="brand-image" :src="getManifestIconPath('colorful_bin')" mode="aspectFit" />
        <view class="brand-copy">
          <text class="brand-title">智能设备连接</text>
          <text class="brand-subtitle">分投侠设备服务</text>
        </view>
      </view>
      <view class="topbar-state" :class="{ online: connected, pending: loading, offline: !connected && !loading }">
        <view class="state-dot"></view>
        <text>{{ connected ? (sessionSyncState === 'paused' ? '同步暂停' : '已连接') : loading ? '连接中' : '待连接' }}</text>
      </view>
    </view>

    <view class="content-wrapper">
      <view class="connection-overview">
        <view class="device-visual" :class="{ connected, loading, error: !connected && !loading }">
          <view class="visual-ring ring-one"></view>
          <view class="visual-ring ring-two"></view>
          <image class="device-visual-image" :src="getManifestIconPath('colorful_bin')" mode="aspectFit" />
          <view class="visual-status-mark">
            <text v-if="loading">···</text>
            <ManifestIcon v-else-if="connected" id="confirm" />
            <ManifestIcon v-else id="dark_alert" />
          </view>
        </view>
        <text class="overview-title">{{ connected ? (deviceMode === 'bin' ? '连接后的每一投，都算数' : '设备已连接') : loading ? '正在验证设备' : '等待设备连接' }}</text>
        <text class="overview-desc">{{ connected ? (sessionSyncState === 'paused' ? '暂时无法更新投放反馈' : '在这里查看分类记录与积分反馈') : loading ? '正在校验设备身份与安全令牌' : '请返回后重新扫描设备二维码' }}</text>
        <view v-if="!connected || deviceMode !== 'bin'" class="connection-steps">
          <view class="step-item active"><view class="step-dot"></view><text>设备</text></view>
          <view class="step-line" :class="{ active: loading || connected }"></view>
          <view class="step-item" :class="{ active: loading || connected }"><view class="step-dot"></view><text>验证</text></view>
          <view class="step-line" :class="{ active: connected }"></view>
          <view class="step-item" :class="{ active: connected }"><view class="step-dot"></view><text>完成</text></view>
        </view>
      </view>

      <view v-if="connected && deviceMode === 'bin'" class="session-guide">
        <view class="guide-heading"><ManifestIcon class="guide-leaf" id="recycling_contribution" /><text>让每次投放都有回响</text></view>
        <view class="guide-step">
          <text class="guide-number">01</text>
          <view class="guide-copy"><text class="guide-title">跟随垃圾桶提示投放</text><text class="guide-description">开门、识别等操作，请以设备提示为准。</text></view>
        </view>
        <view class="guide-step">
          <text class="guide-number">02</text>
          <view class="guide-copy"><text class="guide-title">查看这一次分类结果</text><text class="guide-description">收到分类记录后，投放面板会自动更新。</text></view>
        </view>
        <view class="guide-step">
          <text class="guide-number">03</text>
          <view class="guide-copy"><text class="guide-title">收下你的环保积分</text><text class="guide-description">积分到账后会有加分反馈，也可查看记录。</text></view>
        </view>
        <view class="guide-note"><text>投放后稍等片刻，让分类结果与积分自动同步。</text></view>
      </view>

      <view class="status-card">
        <view v-if="loading" class="status-section loading-section">
          <view class="section-kicker">连接状态</view>
          <text class="status-title">正在连接智能设备</text>
          <text class="status-desc">建立安全连接中，请稍候</text>
          <view class="device-info-card">
            <view class="device-info-row">
              <text class="device-label">设备 ID</text>
              <text class="device-value mono">{{ deviceId || '获取中' }}</text>
            </view>
          </view>
          <view class="progress-bar">
            <view class="progress-fill"></view>
          </view>
        </view>

        <view v-else-if="connected" class="status-section success-section">
          <view class="session-device-heading">
            <text class="session-device-name">{{ deviceName || '智能分类设备' }}</text>
            <text class="session-device-id">#{{ deviceId }}</text>
          </view>
          <BinSessionPanel
            v-if="deviceMode === 'bin'"
            style="display: block; width: 100%; min-width: 0; align-self: stretch; box-sizing: border-box;"
            :device-id="deviceId"
            :active="pageVisible"
            :dark="true"
            @disconnected="handleSessionDisconnected"
            @sync-state="sessionSyncState = $event"
          />
          <template v-else>
            <text class="status-title">设备连接成功</text>
            <text class="status-desc">可以开始操作设备</text>
          </template>
          <view class="action-group">
            <button class="action-btn secondary" @click="goToMap"><text class="btn-text">查看地图</text></button>
            <button class="action-btn danger" @click="endConnection"><text class="btn-text">结束连接</text></button>
          </view>
        </view>

        <view v-else class="status-section error-section">
          <view class="section-kicker error">连接异常</view>
          <text class="status-title">连接暂时中断</text>
          <text class="status-desc">{{ errorMessage || '网络信号不稳定，请重试连接' }}</text>
          <view class="device-info-card error">
            <view class="device-info-row">
              <text class="device-label">设备 ID</text>
              <text class="device-value mono">{{ deviceId || '未获取到' }}</text>
            </view>
          </view>
          <view class="action-group">
            <button v-if="isH5" class="action-btn warning" @click="retryConnection">
              <text class="btn-text">重新连接</text>
            </button>
            <button v-if="isTokenError && !isH5" class="action-btn secondary" @click="startScan">
              <text class="btn-text">重新扫码</text>
            </button>
          </view>
        </view>
      </view>

      <view class="eco-tip">
        <view class="eco-dot"></view>
        <text class="tip-text">每次垃圾分类，都是对地球环境的一份贡献</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import BinSessionPanel from '@/components/BinSessionPanel.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getManifestIconPath } from '@/utils/manifest-icons.js'
import { useDeviceScanPage } from '@/utils/use-device-scan-page.js'

const {
  deviceId,
  deviceName,
  deviceMode,
  loading,
  connected,
  errorMessage,
  isTokenError,
  isH5,
  pageVisible,
  sessionSyncState,
  handleSessionDisconnected,
  retryConnection,
  goToMap,
  endConnection,
  startScan,
  goBack
} = useDeviceScanPage({ dark: true })
</script>

<style scoped>
/* 主容器 */
.scan-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #0d224e 0%, #1a0b3d 25%, #220f58 50%, #0a1a3a 75%, #044868 100%);
  position: relative;
  overflow: hidden;
  padding: 0;
}

/* 背景特效 */
.bg-effects {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.bg-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.15) 1px, transparent 1px),
    radial-gradient(circle at 20% 20%, rgba(64, 224, 255, 0.1) 2px, transparent 2px),
    radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.1) 2px, transparent 2px);
  background-size: 60px 60px, 60px 60px, 100px 100px, 120px 120px;
  animation: gridFloat 25s linear infinite;
}

@keyframes gridFloat {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(60px, 60px) rotate(360deg); }
}

.floating-elements {
  position: absolute;
  width: 100%;
  height: 100%;
}

.float-item {
  position: absolute;
  width: 12rpx;
  height: 12rpx;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.9) 0%, rgba(16, 185, 129, 0.6) 50%, transparent 100%);
  border-radius: 50%;
  animation: floatUp 15s ease-in-out infinite;
  box-shadow: 
    0 0 20rpx rgba(64, 224, 255, 0.5),
    0 0 40rpx rgba(16, 185, 129, 0.3);
}

.float-item:nth-child(1) { left: 15%; animation-delay: 0s; }
.float-item:nth-child(2) { left: 35%; animation-delay: 2.5s; }
.float-item:nth-child(3) { left: 55%; animation-delay: 5s; }
.float-item:nth-child(4) { left: 75%; animation-delay: 7.5s; }
.float-item:nth-child(5) { left: 25%; animation-delay: 10s; }
.float-item:nth-child(6) { left: 65%; animation-delay: 12.5s; }
.float-item:nth-child(7) { left: 45%; animation-delay: 15s; }
.float-item:nth-child(8) { left: 85%; animation-delay: 17.5s; }

@keyframes floatUp {
  0% { transform: translateY(100vh) scale(0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  50% { transform: translateY(50vh) scale(1) rotate(180deg); opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-10vh) scale(0) rotate(360deg); opacity: 0; }
}

.scan-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: 
    linear-gradient(90deg, transparent 49%, rgba(52, 211, 153, 0.4) 50%, transparent 51%),
    linear-gradient(0deg, transparent 49%, rgba(64, 224, 255, 0.3) 50%, transparent 51%),
    radial-gradient(circle at 30% 40%, rgba(139, 92, 246, 0.2) 1px, transparent 1px);
  background-size: 200px 200px, 200px 200px, 80px 80px;
  animation: scanMove 10s linear infinite;
}

@keyframes scanMove {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(200px, 200px) rotate(180deg); }
}

/* 能量球效果 */
.energy-orbs {
  position: absolute;
  width: 100%;
  height: 100%;
}

.energy-orb {
  position: absolute;
  width: 80rpx;
  height: 80rpx;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.3) 0%, rgba(16, 185, 129, 0.2) 50%, transparent 100%);
  border-radius: 50%;
  animation: orbFloat 8s ease-in-out infinite;
  filter: blur(2rpx);
}

@keyframes orbFloat {
  0%, 100% { 
    transform: translateY(0px) scale(1); 
    opacity: 0.3; 
  }
  50% { 
    transform: translateY(-40rpx) scale(1.2); 
    opacity: 0.7; 
  }
}

/* 科技波纹效果 */
.tech-waves {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 200rpx;
}

.wave {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 60rpx;
  background: linear-gradient(90deg, transparent, rgba(64, 224, 255, 0.1), transparent);
  animation: waveMove 6s ease-in-out infinite;
}

.wave:nth-child(1) { animation-delay: 0s; }
.wave:nth-child(2) { animation-delay: 2s; }
.wave:nth-child(3) { animation-delay: 4s; }

@keyframes waveMove {
  0% { transform: translateX(-100%) scaleX(1); opacity: 0; }
  50% { transform: translateX(0%) scaleX(1.5); opacity: 0.6; }
  100% { transform: translateX(100%) scaleX(1); opacity: 0; }
}

/* 返回按钮 */
.back-btn {
  position: absolute;
  top: 60rpx;
  left: 40rpx;
  box-sizing: border-box;
  width: 88rpx;
  height: 88rpx;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(20px);
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: pointer;
  box-shadow: 
    0 8rpx 32rpx rgba(0, 0, 0, 0.1),
    0 0 20rpx rgba(64, 224, 255, 0.3);
}

.back-btn:active {
  transform: scale(0.85);
  background: rgba(255, 255, 255, 0.4);
  box-shadow: 
    0 4rpx 16rpx rgba(0, 0, 0, 0.2),
    0 0 30rpx rgba(64, 224, 255, 0.6);
}

.back-btn:hover {
  transform: translateY(-4rpx);
  box-shadow: 
    0 12rpx 48rpx rgba(0, 0, 0, 0.15),
    0 0 40rpx rgba(64, 224, 255, 0.5);
}

.back-icon {
  color: #ffffff;
  font-size: 36rpx;
  font-weight: bold;
  filter: drop-shadow(0 0 10rpx rgba(64, 224, 255, 0.8));
}

/* 内容包装器 */
.content-wrapper {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  padding: 120rpx 40rpx 40rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 20rpx;
}

/* 标题区域 */
.title-section {
  text-align: center;
  margin-bottom: 40rpx;
  position: relative;
}

.title-decoration {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
}

.title-particles {
  position: absolute;
  width: 200rpx;
  height: 200rpx;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.particle {
  position: absolute;
  width: 6rpx;
  height: 6rpx;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.8) 0%, transparent 70%);
  border-radius: 50%;
  animation: particleOrbit 8s linear infinite;
}

.particle:nth-child(1) { animation-delay: 0s; }
.particle:nth-child(2) { animation-delay: 1.3s; }
.particle:nth-child(3) { animation-delay: 2.6s; }
.particle:nth-child(4) { animation-delay: 3.9s; }
.particle:nth-child(5) { animation-delay: 5.2s; }
.particle:nth-child(6) { animation-delay: 6.5s; }

@keyframes particleOrbit {
  0% { 
    transform: rotate(0deg) translateX(80rpx) rotate(0deg); 
    opacity: 0.3; 
  }
  50% { 
    opacity: 1; 
  }
  100% { 
    transform: rotate(360deg) translateX(80rpx) rotate(-360deg); 
    opacity: 0.3; 
  }
}

.title-icon {
  font-size: 64rpx;
  filter: drop-shadow(0 0 30rpx rgba(64, 224, 255, 0.8));
  animation: titleIconPulse 3s ease-in-out infinite;
  z-index: 2;
}

@keyframes titleIconPulse {
  0%, 100% { 
    transform: scale(1) rotate(0deg); 
    filter: drop-shadow(0 0 30rpx rgba(64, 224, 255, 0.8)); 
  }
  50% { 
    transform: scale(1.1) rotate(5deg); 
    filter: drop-shadow(0 0 40rpx rgba(16, 185, 129, 0.9)); 
  }
}

.main-title {
  display: block;
  font-size: 46rpx;
  font-weight: 800;
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 50%, #10b981 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  margin-bottom: 20rpx;
  text-shadow: 0 0 30rpx rgba(64, 224, 255, 0.5);
  letter-spacing: 3rpx;
  animation: titleShimmer 4s ease-in-out infinite;
}

@keyframes titleShimmer {
  0%, 100% { 
    filter: brightness(1) saturate(1);
    transform: scale(1);
  }
  50% { 
    filter: brightness(1.3) saturate(1.5);
    transform: scale(1.02);
  }
}

.sub-title {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 4rpx;
  font-weight: 300;
  text-transform: uppercase;
  margin-bottom: 20rpx;
  animation: subtitleFade 3s ease-in-out infinite alternate;
}

@keyframes subtitleFade {
  0% { opacity: 0.6; }
  100% { opacity: 0.9; }
}

.title-underline {
  display: flex;
  justify-content: center;
  gap: 8rpx;
}

.underline-segment {
  width: 60rpx;
  height: 4rpx;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  border-radius: 2rpx;
  animation: underlineGlow 2s ease-in-out infinite;
}

.underline-segment:nth-child(1) { animation-delay: 0s; }
.underline-segment:nth-child(2) { animation-delay: 0.3s; }
.underline-segment:nth-child(3) { animation-delay: 0.6s; }

@keyframes underlineGlow {
  0%, 100% { 
    transform: scaleX(1); 
    opacity: 0.6; 
    box-shadow: 0 0 10rpx rgba(64, 224, 255, 0.3);
  }
  50% { 
    transform: scaleX(1.2); 
    opacity: 1; 
    box-shadow: 0 0 20rpx rgba(64, 224, 255, 0.8);
  }
}

/* 状态卡片 */
.status-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(25px);
  border-radius: 35rpx;
  padding: 50rpx 40rpx;
  box-shadow: 
    0 25rpx 80rpx rgba(0, 0, 0, 0.15),
    0 0 60rpx rgba(64, 224, 255, 0.1),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.3);
  position: relative;
  overflow: hidden;
  margin-bottom: 10rpx;
}

.status-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(64, 224, 255, 0.1) 60deg,
    transparent 120deg,
    rgba(16, 185, 129, 0.1) 180deg,
    transparent 240deg,
    rgba(139, 92, 246, 0.1) 300deg,
    transparent 360deg
  );
  animation: cardRotate 20s linear infinite;
  z-index: -1;
}

@keyframes cardRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}

/* 状态图标包装器 */
.status-icon-wrapper {
  position: relative;
  width: 100rpx;
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-bottom: 16rpx;
}

.status-icon {
  font-size: 50rpx;
  z-index: 2;
}

/* 加载状态 */
.loading-section .status-icon-wrapper {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
}

.loading-ring {
  position: absolute;
  width: 120rpx;
  height: 120rpx;
  border: 4rpx solid rgba(59, 130, 246, 0.2);
  border-top: 4rpx solid #3b82f6;
  border-radius: 50%;
  animation: spin 2s linear infinite;
  z-index: 1;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 成功状态 */
.success-section .status-icon-wrapper {
  background: linear-gradient(135deg, #10b981, #059669);
}

.success-ring {
  position: absolute;
  width: 120rpx;
  height: 120rpx;
  border: 4rpx solid rgba(16, 185, 129, 0.3);
  border-radius: 50%;
  animation: successPulse 2s ease-in-out infinite;
  z-index: 1;
}

@keyframes successPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
}

/* 错误状态 */
.error-section .status-icon-wrapper {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.error-pulse {
  position: absolute;
  width: 120rpx;
  height: 120rpx;
  border: 4rpx solid rgba(245, 158, 11, 0.4);
  border-radius: 50%;
  animation: errorPulse 2s ease-in-out infinite;
  z-index: 1;
}

@keyframes errorPulse {
  0% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 0.3; }
  100% { transform: scale(1); opacity: 0.6; }
}

/* 状态标题和描述 */
.status-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1f2937;
  text-align: center;
  line-height: 1.2;
}

.status-desc {
  font-size: 26rpx;
  color: #6b7280;
  text-align: center;
  line-height: 1.4;
  max-width: 550rpx;
}

/* 设备信息卡片 */
.device-info-card {
  background: #f8fafc;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  width: 80%;
  max-width: 400rpx;
  margin: 0 auto;
  border-left: 3rpx solid #3b82f6;
  transition: all 0.3s ease;
}

.device-info-card.success {
  background: #f0fdf4;
  border-left-color: #10b981;
}

.device-info-card.error {
  background: #fefbf3;
  border-left-color: #f59e0b;
}

.device-label {
  display: block;
  font-size: 22rpx;
  color: #6b7280;
  margin-bottom: 6rpx;
  font-weight: 500;
}

.device-value {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
  font-family: 'Courier New', monospace;
  word-break: break-all;
}

/* 进度条 */
.progress-bar {
  width: 100%;
  height: 8rpx;
  background: #e5e7eb;
  border-radius: 4rpx;
  overflow: hidden;
  margin-top: 20rpx;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  border-radius: 4rpx;
  animation: progressMove 2s ease-in-out infinite;
}

@keyframes progressMove {
  0% { width: 0%; }
  50% { width: 70%; }
  100% { width: 100%; }
}

/* 操作按钮组 */
.action-group {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  width: 100%;
  margin-top: 20rpx;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 20rpx 40rpx;
  border-radius: 20rpx;
  border: none;
  font-size: 32rpx;
  font-weight: 600;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.action-btn:active::before {
  left: 100%;
}

.btn-icon {
  font-size: 36rpx;
}

.btn-text {
  color: inherit;
}

.action-btn.primary {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(16, 185, 129, 0.3);
}

.action-btn.primary:active {
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 15rpx rgba(16, 185, 129, 0.4);
}

.action-btn.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(239, 68, 68, 0.3);
}

.action-btn.danger:active {
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 15rpx rgba(239, 68, 68, 0.4);
}

.action-btn.warning {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(245, 158, 11, 0.3);
}

.action-btn.warning:active {
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 15rpx rgba(245, 158, 11, 0.4);
}

.action-btn.secondary {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  color: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(139, 92, 246, 0.3);
}

.action-btn.secondary:active {
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 15rpx rgba(139, 92, 246, 0.4);
}

/* 环保提示 */
.eco-tip {
  display: flex;
  align-items: center;
  gap: 20rpx;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(15px);
  border-radius: 25rpx;
  padding: 28rpx 32rpx;
  border: 2px solid rgba(16, 185, 129, 0.3);
  box-shadow: 
    0 15rpx 40rpx rgba(0, 0, 0, 0.1),
    0 0 30rpx rgba(16, 185, 129, 0.2);
  position: relative;
  overflow: hidden;
}

.eco-tip::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    transparent, 
    rgba(16, 185, 129, 0.1), 
    transparent);
  animation: tipShine 4s ease-in-out infinite;
}

@keyframes tipShine {
  0%, 100% { left: -100%; }
  50% { left: 100%; }
}

.tip-icon {
  font-size: 36rpx;
  flex-shrink: 0;
  animation: tipGlow 4s ease-in-out infinite;
  filter: drop-shadow(0 0 15rpx rgba(16, 185, 129, 0.6));
  z-index: 2;
}

@keyframes tipGlow {
  0%, 100% { 
    transform: scale(1) rotate(0deg); 
    filter: drop-shadow(0 0 15rpx rgba(16, 185, 129, 0.6));
  }
  50% { 
    transform: scale(1.15) rotate(5deg); 
    filter: drop-shadow(0 0 25rpx rgba(16, 185, 129, 0.9));
  }
}

.tip-text {
  font-size: 26rpx;
  color: #374151;
  line-height: 1.6;
  font-weight: 500;
  z-index: 2;
  background: linear-gradient(135deg, #374151 0%, #10b981 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>

<style scoped src="../../styles/scan-connection.css"></style>
<style scoped>
.scan-container {
  --scan-bg: #f3f7f6;
  --scan-surface: #ffffff;
  --scan-surface-soft: #f6faf8;
  --scan-text: #17211f;
  --scan-muted: #687673;
  --scan-subtle: #8a9794;
  --scan-border: #d9e3e0;
  --scan-border-strong: #c3d1cd;
  --scan-primary: #128b66;
  --scan-primary-strong: #087a59;
  --scan-primary-soft: #e6f5ef;
  --scan-danger: #d5443f;
  --scan-danger-soft: #fff1f0;
  --scan-warning: #b97818;
  --scan-shadow: 0 10px 30px rgba(24, 55, 48, 0.08);
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: max(env(safe-area-inset-top), 12px) 20px max(env(safe-area-inset-bottom), 24px);
  color: var(--scan-text);
  background: var(--scan-bg);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 0;
  box-sizing: border-box;
}

.scan-container.scan-dark {
  --scan-bg: #101716;
  --scan-surface: #17201f;
  --scan-surface-soft: #1d2927;
  --scan-text: #edf5f3;
  --scan-muted: #a7b7b3;
  --scan-subtle: #7f918d;
  --scan-border: #2d3d39;
  --scan-border-strong: #435651;
  --scan-primary: #42c897;
  --scan-primary-strong: #33b989;
  --scan-primary-soft: #173a30;
  --scan-danger: #ff7770;
  --scan-danger-soft: #402321;
  --scan-warning: #f0b45f;
  --scan-shadow: 0 12px 34px rgba(0, 0, 0, 0.28);
}

.bg-effects,
.title-section {
  display: none !important;
}

.scan-topbar {
  position: relative;
  z-index: 2;
  width: min(1040px, 100%);
  min-height: 64px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.scan-topbar .back-btn {
  position: static;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--scan-border);
  border-radius: 8px;
  color: var(--scan-text);
  background: var(--scan-surface);
  box-shadow: none;
}

.scan-topbar .back-btn:active {
  transform: scale(0.96);
  background: var(--scan-surface-soft);
}

.back-icon {
  color: inherit;
  font-size: 30px;
  line-height: 1;
  font-weight: 400;
}

.topbar-brand {
  position: absolute;
  left: 50%;
  z-index: 1;
  width: max-content;
  max-width: calc(100% - 120px);
  display: flex;
  align-items: center;
  gap: 10px;
  transform: translateX(-50%);
}

.brand-image {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
}

.brand-copy,
.brand-title,
.brand-subtitle {
  display: block;
  min-width: 0;
}

.brand-title {
  color: var(--scan-text);
  font-size: 16px;
  line-height: 1.3;
  font-weight: 760;
}

.brand-subtitle {
  margin-top: 2px;
  color: var(--scan-muted);
  font-size: 11px;
  line-height: 1.3;
}

.topbar-state {
  min-height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--scan-border);
  border-radius: 8px;
  color: var(--scan-muted);
  background: var(--scan-surface);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.state-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--scan-subtle);
}

.topbar-state.online { color: var(--scan-primary); }
.topbar-state.online .state-dot { background: var(--scan-primary); }
.topbar-state.pending { color: var(--scan-warning); }
.topbar-state.pending .state-dot { background: var(--scan-warning); animation: scanPulse 1.3s ease-in-out infinite; }
.topbar-state.offline { color: var(--scan-danger); }
.topbar-state.offline .state-dot { background: var(--scan-danger); }

.content-wrapper {
  position: relative;
  z-index: 1;
  width: min(1040px, 100%);
  min-height: 0;
  margin: 18px auto 0;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(260px, 0.78fr) minmax(420px, 1.22fr);
  grid-template-areas:
    "overview status"
    "tip tip";
  align-items: stretch;
  gap: 16px;
}

.connection-overview {
  grid-area: overview;
  min-width: 0;
  padding: 36px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.device-visual {
  position: relative;
  width: 168px;
  height: 168px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.device-visual-image {
  position: relative;
  z-index: 2;
  width: 106px;
  height: 106px;
  object-fit: contain;
  filter: drop-shadow(0 12px 20px rgba(18, 139, 102, 0.16));
}

.visual-ring {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--scan-primary) 34%, transparent);
  border-radius: 50%;
}

.ring-one { inset: 16px; }
.ring-two { inset: 34px; opacity: 0.7; }

.device-visual.loading .ring-one { animation: ringRotate 2.2s linear infinite; border-style: dashed; }
.device-visual.connected .ring-one { box-shadow: 0 0 0 12px color-mix(in srgb, var(--scan-primary) 8%, transparent); }
.device-visual.error .visual-ring { border-color: color-mix(in srgb, var(--scan-danger) 38%, transparent); }

.visual-status-mark {
  position: absolute;
  z-index: 4;
  right: 20px;
  bottom: 24px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--scan-bg);
  border-radius: 50%;
  color: #ffffff;
  background: var(--scan-primary);
  font-size: 16px;
  font-weight: 800;
}

.device-visual.loading .visual-status-mark { background: var(--scan-warning); font-size: 12px; }
.device-visual.error .visual-status-mark { background: var(--scan-danger); }

.overview-title {
  margin-top: 18px;
  color: var(--scan-text);
  font-size: 22px;
  line-height: 1.35;
  font-weight: 780;
}

.overview-desc {
  max-width: 280px;
  margin-top: 8px;
  color: var(--scan-muted);
  font-size: 13px;
  line-height: 1.7;
}

.connection-steps {
  width: min(280px, 100%);
  margin-top: 28px;
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto;
  align-items: start;
  gap: 8px;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--scan-subtle);
  font-size: 10px;
}

.step-dot {
  width: 9px;
  height: 9px;
  border: 2px solid var(--scan-border-strong);
  border-radius: 50%;
  background: var(--scan-bg);
}

.step-item.active { color: var(--scan-primary); }
.step-item.active .step-dot { border-color: var(--scan-primary); background: var(--scan-primary); }

.step-line {
  height: 2px;
  margin-top: 4px;
  background: var(--scan-border);
}

.step-line.active { background: var(--scan-primary); }

.status-card {
  grid-area: status;
  width: auto;
  min-width: 0;
  min-height: 430px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--scan-border);
  border-radius: 8px;
  background: var(--scan-surface);
  box-shadow: var(--scan-shadow);
  backdrop-filter: none;
  animation: panelIn 260ms ease both;
}

.status-card::before,
.status-card::after {
  display: none !important;
  content: none !important;
}

.status-section {
  width: 100%;
  min-height: 430px;
  max-width: none;
  padding: 44px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
  box-sizing: border-box;
}

.section-kicker {
  display: block;
  color: var(--scan-warning);
  font-size: 12px;
  line-height: 1.3;
  font-weight: 760;
}

.section-kicker.success { color: var(--scan-primary); }
.section-kicker.error { color: var(--scan-danger); }

.status-title {
  margin-top: 10px;
  color: var(--scan-text);
  font-size: 27px;
  line-height: 1.3;
  font-weight: 800;
  text-align: left;
  text-shadow: none;
}

.status-desc {
  margin-top: 8px;
  color: var(--scan-muted);
  font-size: 14px;
  line-height: 1.65;
  text-align: left;
}

.device-info-card {
  width: 100%;
  max-width: none;
  margin: 28px 0 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--scan-border);
  border-left: 3px solid var(--scan-primary);
  border-radius: 6px;
  background: var(--scan-surface-soft);
  box-shadow: none;
  transform: none;
}

.device-info-card.error { border-left-color: var(--scan-danger); }

.scan-container.scan-dark .device-info-card,
.scan-container.scan-dark .device-info-card.success,
.scan-container.scan-dark .device-info-card.error {
  border-color: var(--scan-border);
  background: var(--scan-surface-soft);
}

.scan-container.scan-dark .device-info-card.success {
  border-left-color: var(--scan-primary);
}

.scan-container.scan-dark .device-info-card.error {
  border-left-color: var(--scan-danger);
}

.device-info-row {
  min-height: 58px;
  padding: 11px 14px;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid var(--scan-border);
}

.device-info-row:last-child { border-bottom: 0; }

.device-label,
.device-value {
  display: block;
  margin: 0;
  text-align: left;
}

.device-label {
  color: var(--scan-muted);
  font-size: 12px;
  font-weight: 600;
}

.device-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--scan-text);
  font-size: 14px;
  line-height: 1.45;
  font-weight: 720;
}

.mono {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.action-group {
  width: 100%;
  max-width: none;
  margin-top: 24px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.action-btn {
  width: 100%;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--scan-border-strong);
  border-radius: 7px;
  color: var(--scan-text);
  background: var(--scan-surface);
  box-shadow: none;
  font-size: 14px;
  line-height: 1;
  font-weight: 760;
}

.action-btn::after { display: none; }
.action-btn:active { transform: scale(0.985); opacity: 0.9; }
.action-btn.primary { color: #ffffff; border-color: var(--scan-primary); background: var(--scan-primary); }
.action-btn.primary:active { background: var(--scan-primary-strong); }
.action-btn.danger { color: var(--scan-danger); border-color: color-mix(in srgb, var(--scan-danger) 42%, var(--scan-border)); background: var(--scan-danger-soft); }
.action-btn.warning { color: #ffffff; border-color: var(--scan-warning); background: var(--scan-warning); }
.action-btn.secondary { color: var(--scan-primary); border-color: var(--scan-primary); background: var(--scan-primary-soft); }

.btn-icon { display: none; }
.btn-text { color: inherit; font-size: inherit; font-weight: inherit; }

.timeout-note {
  width: 100%;
  margin-top: 14px;
  color: var(--scan-subtle);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.progress-bar {
  width: 100%;
  max-width: none;
  height: 6px;
  margin-top: 24px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--scan-border);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--scan-primary);
  animation: progressMove 1.5s ease-in-out infinite;
}

.eco-tip {
  grid-area: tip;
  width: 100%;
  max-width: none;
  min-height: 46px;
  margin: 0;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid var(--scan-border);
  border-radius: 8px;
  color: var(--scan-muted);
  background: var(--scan-surface);
  box-shadow: none;
  box-sizing: border-box;
}

.eco-tip::before,
.eco-tip::after { display: none !important; content: none !important; }

.eco-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--scan-primary);
}

.tip-icon { display: none; }

.tip-text {
  color: inherit;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 600;
  text-shadow: none;
}

@keyframes scanPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
}

@keyframes ringRotate {
  to { transform: rotate(360deg); }
}

@keyframes progressMove {
  0% { width: 16%; transform: translateX(-100%); }
  60%, 100% { width: 48%; transform: translateX(220%); }
}

@keyframes panelIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 760px) {
  .scan-container {
    padding: max(env(safe-area-inset-top), 8px) 12px max(env(safe-area-inset-bottom), 18px);
  }

  .scan-topbar {
    min-height: 56px;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 9px;
  }

  .scan-topbar .back-btn {
    width: 44px;
    height: 44px;
  }

  .brand-image { width: 32px; height: 32px; }
  .brand-title { font-size: 14px; }
  .brand-subtitle { display: none; }

  .topbar-state {
    min-height: 30px;
    padding: 0 8px;
    font-size: 11px;
  }

  .content-wrapper {
    margin-top: 12px;
    grid-template-columns: 1fr;
    grid-template-areas:
      "overview"
      "status"
      "tip";
    gap: 12px;
  }

  .connection-overview {
    padding: 18px 14px 12px;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    grid-template-areas:
      "visual title"
      "visual desc"
      "steps steps";
    align-items: center;
    gap: 2px 14px;
    text-align: left;
  }

  .device-visual {
    grid-area: visual;
    width: 88px;
    height: 88px;
  }

  .device-visual-image { width: 58px; height: 58px; }
  .ring-one { inset: 6px; }
  .ring-two { inset: 18px; }

  .visual-status-mark {
    right: 2px;
    bottom: 5px;
    width: 25px;
    height: 25px;
    border-width: 2px;
    font-size: 13px;
  }

  .overview-title {
    grid-area: title;
    margin: 0;
    font-size: 18px;
  }

  .overview-desc {
    grid-area: desc;
    max-width: none;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.55;
  }

  .connection-steps {
    grid-area: steps;
    width: 100%;
    margin-top: 16px;
  }

  .status-card,
  .status-section {
    min-height: 0;
  }

  .status-section {
    padding: 24px 20px;
  }

  .status-title { font-size: 23px; }
  .status-desc { font-size: 13px; }
  .device-info-card { margin-top: 20px; }

  .device-info-row {
    min-height: 54px;
    grid-template-columns: 90px minmax(0, 1fr);
  }

  .action-group { margin-top: 20px; }
}

@media (max-width: 420px) {
  .topbar-state text { display: none; }
  .topbar-state { width: 32px; padding: 0; justify-content: center; }

  .connection-overview {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 2px 12px;
  }

  .device-visual { width: 72px; height: 72px; }
  .device-visual-image { width: 48px; height: 48px; }
  .visual-status-mark { width: 22px; height: 22px; }
  .overview-title { font-size: 17px; }

  .status-section { padding: 22px 16px; }

  .device-info-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .action-group { grid-template-columns: 1fr; }
  .eco-tip { padding: 10px 12px; text-align: left; }
}

@media (prefers-reduced-motion: reduce) {
  .device-visual.loading .ring-one,
  .topbar-state.pending .state-dot,
  .progress-fill,
  .status-card {
    animation: none !important;
  }
}

/* Give the connected bin's actual feedback the main space. */
.session-mode .content-wrapper { grid-template-columns: minmax(220px, .7fr) minmax(420px, 1.3fr); align-items: start; }
.session-mode .connection-overview { min-height: 340px; padding: 30px 18px; box-sizing: border-box; }
.session-mode .success-section { padding: 26px 32px; justify-content: flex-start; }
.session-device-heading { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--scan-border); }
.session-device-name { font-size: 14px; font-weight: 700; color: var(--scan-text); overflow-wrap: anywhere; }
.session-device-id { color: var(--scan-muted); font-size: 12px; }
.session-mode .action-group { margin-top: 22px; }
@media (max-width: 780px) {
  .session-mode .content-wrapper { grid-template-columns: 1fr; }
  .session-mode .connection-overview { min-height: 0; padding: 16px; }
  .session-mode .success-section { padding: 22px 20px; }
}
@media (max-width: 420px) {
  .session-mode .success-section { padding: 20px 16px; }
  .session-mode .overview-title { font-size: 16px; }
}

.session-mode .content-wrapper { grid-template-areas: "overview status" "guide status" "tip tip"; grid-template-rows: auto 1fr auto; align-items: stretch; }
.session-guide { grid-area: guide; display: flex; flex-direction: column; justify-content: flex-start; padding: 24px; gap: 20px; border: 1px solid var(--scan-border); border-radius: 8px; background: var(--scan-surface); color: var(--scan-text); box-shadow: var(--scan-shadow); }
.guide-note { margin-top: auto; padding: 12px; border-radius: 8px; background: var(--scan-surface-soft); color: var(--scan-muted); font-size: 11px; line-height: 1.8; }
.guide-heading { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; margin-bottom: 2px; }
.guide-leaf { color: var(--scan-primary); font-size: 22px; }
.guide-step { display: flex; align-items: flex-start; gap: 12px; }
.guide-number { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid var(--scan-border); border-radius: 8px; color: var(--scan-primary); background: var(--scan-surface-soft); font-size: 11px; font-weight: 700; }
.guide-copy { display: flex; flex-direction: column; gap: 5px; }
.guide-title { font-size: 12px; font-weight: 700; line-height: 1.5; }
.guide-description { font-size: 11px; line-height: 1.7; color: var(--scan-muted); }
@media (max-width: 780px) {
  .session-guide { display: none; }
  .session-mode .content-wrapper { grid-template-areas: "overview" "status" "tip"; grid-template-rows: auto; }
}

@media (max-width: 780px) {
  .session-mode .content-wrapper { grid-template-areas: "status"; margin-top: 8px; gap: 0; }
  .session-mode .connection-overview, .session-mode .eco-tip { display: none; }
  .session-mode .success-section { padding: 16px; }
  .session-mode .session-device-heading { padding-bottom: 10px; margin-bottom: 12px; }
  .session-mode .action-group { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; gap: 10px; }
}
</style>
