<template>
  <view class="lottery-page" :class="{ 'dark-mode': isDark }">
    <!-- 动态背景 -->
    <view class="bg-effects">
      <view class="bg-gradient"></view>
      <view class="particles">
        <view v-for="n in 12" :key="n" class="particle" :style="getParticleStyle(n)"></view>
      </view>
    </view>

    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left" @click="goBack">
          <text class="back-icon">←</text>
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill">
            <text>🎰</text>
          </view>
          <text class="nav-title">积分抽奖</text>
        </view>
        <view class="nav-right">
          <view class="action-icon-btn" @click="showRules = true">
            <text>📜</text>
          </view>
        </view>
      </view>
    </view>

    <scroll-view class="main-scroll" scroll-y>
      <view class="content-wrapper">

        <!-- 积分显示（信息卡片） -->
        <view class="points-card">
          <view class="points-icon-wrap">
            <text class="points-icon">💎</text>
          </view>
          <view class="points-info">
            <text class="points-label">我的积分</text>
            <text class="points-value">{{ userPoints }}</text>
          </view>
        </view>

        <!-- 转盘区域 -->
        <view class="wheel-section">
          <view class="wheel-container" :class="{ spinning: isSpinning }">
            <canvas canvas-id="lotteryWheel" id="lotteryWheel" class="wheel-canvas" @click="onWheelClick"></canvas>
            <view class="wheel-center" @click="startDraw">
              <text class="center-text">{{ isSpinning ? '...' : '开始' }}</text>
            </view>
            <view class="wheel-pointer">
              <view class="pointer-triangle"></view>
            </view>
          </view>
        </view>

        <!-- 抽奖状态 -->
        <view class="draw-status">
          <view class="status-pill free-usage" v-if="freeCount > 0">
            <text class="free-icon">🎁</text>
            <text class="free-text">今日免费次数: {{ freeCount }}/{{ totalFree }}</text>
          </view>
          <view class="status-pill points-usage" v-else>
            <text class="cost-icon">💰</text>
            <text class="cost-text">免费次数已用完，消耗 {{ config.cost || 50 }} 积分抽奖</text>
          </view>
        </view>

        <!-- 抽奖按钮（统一 CTA） -->
        <view class="draw-btn-wrap">
          <view class="draw-btn" :class="{ disabled: !canDraw || isSpinning }" @click="startDraw">
            <text class="draw-btn-text">{{ isSpinning ? '抽奖中...' : '立即抽奖' }}</text>
          </view>
        </view>

        <!-- 奖品列表 -->
        <view class="prizes-section">
          <view class="section-title-row">
            <view class="title-icon-pill small"><text>🎁</text></view>
            <text class="section-title">奖品池</text>
          </view>
          <view class="prizes-grid">
            <view v-for="prize in config.prizes" :key="prize.id" class="prize-card" :class="`level-${prize.level}`">
              <text class="prize-icon">{{ getPrizeIcon(prize.type) }}</text>
              <text class="prize-name">{{ prize.name }}</text>
              <text class="prize-desc">{{ prize.description }}</text>
              <text class="prize-prob">{{ Math.round(prize.probability * 100) }}%概率</text>
            </view>
          </view>
        </view>

        <!-- 中奖记录 -->
        <view class="records-section">
          <view class="section-title-row">
            <view class="title-icon-pill small"><text>📜</text></view>
            <text class="section-title">中奖记录</text>
          </view>
          <view class="records-list" v-if="records.length > 0">
            <view v-for="record in records" :key="record.id" class="record-item">
              <view class="record-info">
                <text class="record-prize" :class="{ won: record.won }">{{ record.prizeName }}</text>
                <text class="record-time">{{ formatTime(record.createdAt) }}</text>
              </view>
              <view class="record-tags">
                <text class="tag free" v-if="record.isFree">免费</text>
                <text class="tag points" v-else>-{{ record.costPoints }}积分</text>
              </view>
            </view>
          </view>
          <view class="empty-records" v-else>
            <text class="empty-icon">📋</text>
            <text class="empty-text">暂无抽奖记录</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 中奖弹窗 -->
    <view class="prize-modal" v-if="showPrizeModal" @click="closePrizeModal">
      <view class="prize-modal-content" @click.stop>
        <view class="prize-effect"></view>
        <text class="prize-modal-icon">{{ currentPrize && currentPrize.level > 1 ? '🎉' : '🍀' }}</text>
        <text class="prize-modal-title">{{ currentPrize && currentPrize.level > 1 ? '恭喜您!' : '再接再厉' }}</text>
        <view class="prize-modal-info" v-if="currentPrize">
          <text class="prize-modal-name">{{ currentPrize.prizeName }}</text>
          <text class="prize-modal-type" v-if="currentPrize.type === 'points'">+{{ currentPrize.prizeValue }} 积分已到账</text>
          <text class="prize-modal-type" v-else>{{ currentPrize.description }}</text>
        </view>
        <view class="prize-modal-actions">
          <view class="modal-btn primary" v-if="freeCount > 0 && currentPrize && currentPrize.level === 1" @click="continueDraw">
            <text>继续抽奖</text>
          </view>
          <view class="modal-btn secondary" @click="closePrizeModal">
            <text>关闭</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 规则弹窗 -->
    <view class="rule-modal" v-if="showRules" @click="showRules = false">
      <view class="rule-content" @click.stop>
        <text class="rule-title">抽奖规则</text>
        <view class="rule-list">
          <text class="rule-item">1. 每日可免费参与 {{ config.dailyFreeCount || 1 }} 次抽奖</text>
          <text class="rule-item">2. 免费次数用完后，可消耗 {{ config.cost || 50 }} 积分继续抽奖</text>
          <text class="rule-item">3. 积分奖品将直接发放到您的账户</text>
          <text class="rule-item">4. 优惠券奖品可在积分商城中使用</text>
          <text class="rule-item">5. 奖品数量有限，抽完即止</text>
          <text class="rule-item">6. 最终解释权归平台所有</text>
        </view>
        <view class="rule-close" @click="showRules = false">
          <text>我知道了</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getLotteryConfig, getLotteryDailyStatus, drawLottery, getLotteryRecords } from '@/api/lottery.js';

export default {
  data() {
    return {
      config: { prizes: [], cost: 50, dailyFreeCount: 1 },
      freeCount: 0,
      totalFree: 1,
      userPoints: 0,
      records: [],
      isSpinning: false,
      showPrizeModal: false,
      showRules: false,
      currentPrize: null,
      spinAngle: 0,
      canDraw: false,
      isDark: false
    };
  },
  onLoad() {
    this.checkTheme();
    this.loadData();
  },
  onShow() {
    this.checkTheme();
  },
  methods: {
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    goBack() { uni.navigateBack(); },
    getParticleStyle(n) {
      const colors = ['#FFD700', '#4CAF50', '#FF6B6B', '#4FC3F7', '#FF9F43', '#1DD1A1'];
      const positions = [
        { x: '10%', y: '15%' }, { x: '85%', y: '10%' }, { x: '5%', y: '60%' },
        { x: '90%', y: '55%' }, { x: '50%', y: '5%' }, { x: '70%', y: '80%' },
        { x: '25%', y: '75%' }, { x: '60%', y: '90%' }, { x: '15%', y: '40%' },
        { x: '80%', y: '35%' }, { x: '40%', y: '70%' }, { x: '55%', y: '20%' }
      ];
      const p = positions[n - 1] || positions[0];
      return {
        left: p.x, top: p.y,
        background: colors[(n - 1) % colors.length],
        animationDelay: `${(n * 0.3)}s`,
        animationDuration: `${3 + (n % 3)}s`
      };
    },
    getPrizeIcon(type) {
      const map = { points: '💎', coupon: '🎟️', goods: '📦' };
      return map[type] || '🎁';
    },
    async loadData() {
      try {
        const [configRes, statusRes, recordsRes] = await Promise.all([
          getLotteryConfig(),
          getLotteryDailyStatus(),
          getLotteryRecords(1, 20)
        ]);
        if (configRes.success) this.config = configRes.data;
        if (statusRes.success) {
          this.freeCount = statusRes.data.freeCount || 0;
          this.totalFree = statusRes.data.totalFree || 1;
        }
        if (recordsRes.success) this.records = recordsRes.data.records || [];
        this.canDraw = this.freeCount > 0;
      } catch (e) {
        console.error('加载失败:', e);
      }
    },
    onWheelClick() {
      if (!this.isSpinning && this.canDraw) this.startDraw();
    },
    async startDraw() {
      if (this.isSpinning) return;
      if (!this.canDraw) {
        uni.showToast({ title: '积分不足或次数已用完', icon: 'none' });
        return;
      }
      this.isSpinning = true;
      const usePoints = this.freeCount <= 0;
      try {
        const res = await drawLottery(usePoints);
        if (res.success) {
          this.currentPrize = res.data;
          this.spinToPrize(res.data);
          if (res.data.prizeType === 'points' && res.data.won) {
            this.userPoints = res.data.userPoints || this.userPoints;
          }
          if (res.data.isFree && this.freeCount > 0) this.freeCount--;
        } else {
          uni.showToast({ title: res.error || '抽奖失败', icon: 'none' });
          this.isSpinning = false;
        }
      } catch (e) {
        uni.showToast({ title: e.message || '抽奖失败', icon: 'none' });
        this.isSpinning = false;
      }
    },
    spinToPrize(prize) {
      // 简单动画模拟
      const prizes = this.config.prizes || [];
      if (prizes.length === 0) {
        this.isSpinning = false;
        return;
      }
      const prizeIndex = prizes.findIndex(p => p.id === prize.prizeId);
      const segmentAngle = 360 / prizes.length;
      const targetAngle = prizeIndex >= 0
        ? 360 - (prizeIndex * segmentAngle + segmentAngle / 2)
        : 0;
      const extraSpins = 5 * 360;
      const totalAngle = extraSpins + targetAngle;

      let current = 0;
      const duration = 3000;
      const start = Date.now();
      const animate = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        // 缓动函数
        const easeOut = 1 - Math.pow(1 - progress, 3);
        current = totalAngle * easeOut;
        this.spinAngle = current;
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.isSpinning = false;
          this.canDraw = this.freeCount > 0 || this.userPoints >= (this.config.cost || 50);
          setTimeout(() => {
            this.showPrizeModal = true;
          }, 300);
        }
      };
      requestAnimationFrame(animate);
    },
    continueDraw() {
      this.showPrizeModal = false;
      this.currentPrize = null;
      if (this.canDraw) this.startDraw();
    },
    closePrizeModal() {
      this.showPrizeModal = false;
      this.currentPrize = null;
      this.loadData();
    },
    formatTime(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
  }
};
</script>

<style scoped>
/* ===== 主容器 ===== */
.lottery-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}
.lottery-page.dark-mode {
  background: linear-gradient(135deg, #28285f 0%, #28346f 30%, #322c8a 70%, #442977 100%);
}

/* ===== 背景效果 ===== */
.bg-effects {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 1;
  pointer-events: none;
}
.bg-gradient {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.1) 0%, transparent 60%);
  transition: all 0.3s;
}
.particle {
  position: absolute;
  width: 12rpx; height: 12rpx;
  border-radius: 50%;
  opacity: 0.5;
  animation: floatParticle linear infinite;
  filter: drop-shadow(0 2rpx 4rpx rgba(0,0,0,0.1));
}
@keyframes floatParticle {
  0% { transform: translateY(0) scale(1); opacity: 0.5; }
  50% { transform: translateY(-40rpx) scale(1.2); opacity: 0.7; }
  100% { transform: translateY(-80rpx) scale(0.8); opacity: 0; }
}

/* ===== 导航栏 ===== */
.navbar { position: relative; z-index: 10; }
.safe-area-top { height: env(safe-area-inset-top); min-height: 44rpx; }
.nav-content {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 32rpx;
  height: 88rpx; box-sizing: content-box;
}
.back-icon { font-size: 48rpx; font-weight: 600; padding: 8rpx; color: #1f2937; }
.dark-mode .back-icon { color: #fff; }
.nav-title-wrap {
  display: flex; align-items: center; gap: 12rpx;
  flex: 1; justify-content: center;
}
.title-icon-pill {
  width: 56rpx; height: 56rpx;
  background: rgba(16, 185, 129, 0.12);
  border-radius: 14rpx;
  display: flex; align-items: center; justify-content: center;
  font-size: 26rpx;
}
.title-icon-pill.small {
  width: 40rpx; height: 40rpx;
  font-size: 20rpx;
  border-radius: 10rpx;
}
.dark-mode .title-icon-pill { background: rgba(255, 255, 255, 0.15); }
.nav-title {
  font-size: 32rpx; font-weight: 700; letter-spacing: 1rpx; color: #1f2937;
}
.dark-mode .nav-title { color: #fff; }
.action-icon-btn {
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.12);
  display: flex; align-items: center; justify-content: center;
  font-size: 28rpx;
  transition: all 0.3s;
}
.action-icon-btn:active { transform: scale(0.92); }
.dark-mode .action-icon-btn { background: rgba(255, 255, 255, 0.15); }

/* ===== 主内容区 ===== */
.main-scroll { position: relative; z-index: 10; height: calc(100vh - env(safe-area-inset-top) - 88rpx); }
.content-wrapper { padding: 32rpx; padding-bottom: 120rpx; }

/* ===== 积分卡片（对齐 about info-card） ===== */
.points-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.1);
  border: 1rpx solid rgba(16, 185, 129, 0.08);
}
.dark-mode .points-card {
  background: linear-gradient(135deg, rgba(40, 40, 95, 0.8) 0%, rgba(50, 45, 135, 0.9) 100%);
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.3);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.points-icon-wrap {
  width: 96rpx; height: 96rpx;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 24rpx;
  display: flex; align-items: center; justify-content: center;
}
.dark-mode .points-icon-wrap { background: rgba(16, 185, 129, 0.2); }
.points-icon { font-size: 48rpx; }
.points-label {
  display: block;
  color: #6b7280;
  font-size: 24rpx;
  font-weight: 500;
  margin-bottom: 6rpx;
}
.dark-mode .points-label { color: rgba(255, 255, 255, 0.7); }
.points-value {
  display: block;
  color: #10b981;
  font-size: 48rpx;
  font-weight: 800;
}
.dark-mode .points-value { color: #34d399; }

/* ===== 转盘区域 ===== */
.wheel-section { display: flex; justify-content: center; margin-bottom: 32rpx; }
.wheel-container { position: relative; width: 560rpx; height: 560rpx; }
.wheel-canvas {
  width: 560rpx; height: 560rpx;
  border-radius: 50%;
  box-shadow: 0 0 60rpx rgba(16, 185, 129, 0.2), 0 0 120rpx rgba(16, 185, 129, 0.1);
}
.wheel-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 140rpx; height: 140rpx;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.4);
  z-index: 2;
}
.center-text { color: #fff; font-size: 28rpx; font-weight: 800; }
.wheel-pointer {
  position: absolute;
  top: -20rpx; left: 50%;
  transform: translateX(-50%);
  z-index: 3;
}
.pointer-triangle {
  width: 0; height: 0;
  border-left: 30rpx solid transparent;
  border-right: 30rpx solid transparent;
  border-top: 60rpx solid #10b981;
  filter: drop-shadow(0 4rpx 8rpx rgba(0,0,0,0.2));
}

/* ===== 抽奖状态 ===== */
.draw-status { text-align: center; margin-bottom: 32rpx; }
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  background: #fff;
  padding: 16rpx 32rpx;
  border-radius: 40rpx;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.08);
  border: 1rpx solid rgba(16, 185, 129, 0.08);
}
.dark-mode .status-pill { background: rgba(255, 255, 255, 0.1); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.free-icon, .cost-icon { font-size: 28rpx; }
.free-text { color: #10b981; font-size: 24rpx; font-weight: 600; }
.dark-mode .free-text { color: #34d399; }
.cost-text { color: #f59e0b; font-size: 24rpx; font-weight: 600; }
.dark-mode .cost-text { color: #fbbf24; }

/* ===== 抽奖按钮（统一绿渐变） ===== */
.draw-btn-wrap { display: flex; justify-content: center; margin-bottom: 40rpx; }
.draw-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  color: #fff;
  padding: 28rpx 96rpx;
  border-radius: 40rpx;
  font-size: 32rpx;
  font-weight: 700;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.35);
  letter-spacing: 2rpx;
  transition: all 0.3s;
}
.draw-btn:active:not(.disabled) { transform: scale(0.98); }
.draw-btn.disabled { opacity: 0.5; }

/* ===== 区块标题行 ===== */
.prizes-section, .records-section { margin-bottom: 32rpx; }
.section-title-row {
  display: flex; align-items: center; gap: 12rpx;
  margin-bottom: 20rpx;
}
.section-title {
  font-size: 28rpx; font-weight: 700; color: #1f2937;
}
.dark-mode .section-title { color: #fff; }
.section-title::before {
  content: '';
  width: 6rpx; height: 28rpx;
  background: linear-gradient(180deg, #10b981, #34d399);
  border-radius: 3rpx;
  margin-right: 8rpx;
}

/* ===== 奖品网格 ===== */
.prizes-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx; }
.prize-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 20rpx 12rpx;
  text-align: center;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.prize-card:active { transform: scale(0.96); }
.dark-mode .prize-card { background: rgba(255, 255, 255, 0.08); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.prize-card.level-3 { border-color: rgba(245, 158, 11, 0.4); background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%); }
.prize-card.level-2 { border-color: rgba(16, 185, 129, 0.4); background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(52, 211, 153, 0.05) 100%); }
.prize-icon { display: block; font-size: 40rpx; margin-bottom: 8rpx; }
.prize-name { display: block; color: #1f2937; font-size: 22rpx; font-weight: 700; margin-bottom: 4rpx; }
.dark-mode .prize-name { color: #fff; }
.prize-desc { display: block; color: #9ca3af; font-size: 18rpx; margin: 4rpx 0; }
.dark-mode .prize-desc { color: rgba(255, 255, 255, 0.5); }
.prize-prob { display: block; color: #10b981; font-size: 18rpx; font-weight: 600; }
.dark-mode .prize-prob { color: #34d399; }

/* ===== 记录列表 ===== */
.records-list {
  background: #fff;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
}
.dark-mode .records-list { background: rgba(255, 255, 255, 0.08); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.record-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 24rpx 28rpx;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.04);
}
.dark-mode .record-item { border-bottom-color: rgba(255, 255, 255, 0.06); }
.record-item:last-child { border-bottom: none; }
.record-prize { display: block; color: #1f2937; font-size: 26rpx; font-weight: 600; }
.dark-mode .record-prize { color: #fff; }
.record-prize.won { color: #10b981; }
.dark-mode .record-prize.won { color: #34d399; }
.record-time { display: block; color: #9ca3af; font-size: 20rpx; margin-top: 4rpx; }
.dark-mode .record-time { color: rgba(255, 255, 255, 0.5); }
.tag {
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-size: 20rpx;
  font-weight: 600;
}
.tag.free { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.dark-mode .tag.free { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.tag.points { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.dark-mode .tag.points { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.empty-records { text-align: center; padding: 48rpx; }
.empty-icon { font-size: 64rpx; display: block; margin-bottom: 16rpx; opacity: 0.4; }
.empty-text { color: #9ca3af; font-size: 26rpx; }
.dark-mode .empty-text { color: rgba(255, 255, 255, 0.5); }

/* ===== 弹窗（保持暗色沉浸风格，与其他页面一致） ===== */
.prize-modal {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 40rpx;
  backdrop-filter: blur(4px);
}
.prize-modal-content {
  background: linear-gradient(160deg, #0f4a3e 0%, #1a5f4a 50%, #0f4a3e 100%);
  border-radius: 32rpx;
  padding: 60rpx 48rpx;
  text-align: center;
  width: 100%; max-width: 600rpx;
  position: relative; overflow: hidden;
  box-shadow: 0 24rpx 80rpx rgba(0, 0, 0, 0.4);
  border: 1rpx solid rgba(16, 185, 129, 0.3);
}
.prize-effect {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.2) 0%, transparent 70%);
  pointer-events: none;
}
.prize-modal-icon { font-size: 96rpx; display: block; margin-bottom: 16rpx; animation: bounce 0.6s ease; }
@keyframes bounce {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
.prize-modal-title { display: block; color: #fbbf24; font-size: 40rpx; font-weight: 800; margin-bottom: 24rpx; }
.prize-modal-name { display: block; color: #fff; font-size: 32rpx; font-weight: 700; }
.prize-modal-type { display: block; color: #34d399; font-size: 24rpx; margin-top: 8rpx; }
.prize-modal-actions { display: flex; gap: 24rpx; justify-content: center; margin-top: 32rpx; }
.modal-btn {
  padding: 20rpx 48rpx;
  border-radius: 40rpx;
  font-size: 28rpx; font-weight: 700;
}
.modal-btn.primary {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #fff;
  box-shadow: 0 4rpx 16rpx rgba(245, 158, 11, 0.3);
}
.modal-btn.secondary {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
}
.modal-btn:active { transform: scale(0.95); }

.rule-modal {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 40rpx;
  backdrop-filter: blur(4px);
}
.rule-content {
  background: #fff;
  border-radius: 24rpx;
  padding: 48rpx 40rpx;
  width: 100%; max-width: 600rpx;
  box-shadow: 0 16rpx 64rpx rgba(0, 0, 0, 0.2);
}
.dark-mode .rule-content {
  background: rgba(40, 40, 95, 0.95);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.rule-title {
  display: block;
  color: #10b981;
  font-size: 32rpx; font-weight: 800;
  text-align: center; margin-bottom: 32rpx;
}
.dark-mode .rule-title { color: #34d399; }
.rule-list { margin-bottom: 32rpx; }
.rule-item { display: block; color: #4b5563; font-size: 26rpx; line-height: 2; }
.dark-mode .rule-item { color: rgba(255, 255, 255, 0.8); }
.rule-close {
  text-align: center;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  padding: 20rpx;
  border-radius: 40rpx;
  font-size: 28rpx; font-weight: 700;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.3);
  transition: all 0.3s;
}
.rule-close:active { transform: scale(0.98); }
</style>
