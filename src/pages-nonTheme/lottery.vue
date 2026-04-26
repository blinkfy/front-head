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

        <view class="lottery-hero-card">
          <view class="hero-copy">
            <text class="hero-kicker">低门槛试手气</text>
            <text class="hero-title">识别几次垃圾，就能再转一次</text>
            <text class="hero-desc">每日先送免费机会，用完后 {{ getDrawCost() }} 积分继续抽。</text>
          </view>
          <view class="hero-badge">
            <text class="hero-badge-num">{{ getDrawCost() }}</text>
            <text class="hero-badge-label">积分/次</text>
          </view>
        </view>

        <!-- 积分显示（信息卡片） -->
        <view class="points-card">
          <view class="points-icon-wrap">
            <text class="points-icon">💎</text>
          </view>
          <view class="points-info">
            <text class="points-label">我的积分</text>
            <text class="points-value">{{ userPoints }}</text>
            <text class="points-helper" v-if="freeCount <= 0 && userPoints < getDrawCost()">还差 {{ getDrawCost() - userPoints }} 积分可再抽一次</text>
            <text class="points-helper ready" v-else>{{ freeCount > 0 ? '今日免费机会可用' : '当前积分可继续抽奖' }}</text>
          </view>
        </view>

        <!-- 转盘区域 -->
        <view class="wheel-section" v-if="!showPrizeModal">
          <view class="wheel-container" :class="{ spinning: isSpinning }">
            <view class="wheel-shell">
              <view class="wheel-halo"></view>
              <!-- #ifdef H5 -->
              <canvas
                canvas-id="lotteryWheel"
                id="lotteryWheel"
                class="wheel-canvas"
                :width="wheelCanvasSize"
                :height="wheelCanvasSize"
                @click="onWheelClick"
              ></canvas>
              <!-- #endif -->
              <!-- #ifndef H5 -->
              <view class="wheel-rotor" :style="{ transform: `rotate(${spinAngle}deg)` }">
                <image
                  v-if="wheelImageSrc"
                  class="wheel-image"
                  :src="wheelImageSrc"
                  mode="aspectFit"
                  @click="onWheelClick"
                />
                <view v-else class="wheel-loading">
                  <text class="wheel-loading-text">加載中</text>
                </view>
              </view>
              <canvas
                canvas-id="lotteryWheel"
                id="lotteryWheel"
                class="wheel-canvas-stage"
                :width="wheelCanvasSize"
                :height="wheelCanvasSize"
              ></canvas>
              <!-- #endif -->
              <view
                v-for="n in 16"
                :key="`bulb-${n}`"
                class="wheel-bulb"
                :style="getWheelBulbStyle(n)"
              ></view>
            </view>
            <view class="wheel-center" @click="startDraw">
              <view class="center-inner">
                <text class="center-text">{{ isSpinning ? '...' : '开始' }}</text>
              </view>
            </view>
            <view class="wheel-pointer">
              <view class="pointer-head"></view>
              <view class="pointer-stem"></view>
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
            <text class="cost-text">免费次数已用完，消耗 {{ getDrawCost() }} 积分抽奖</text>
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
            <view v-for="prize in displayPrizes" :key="prize.id" class="prize-card" :class="`level-${prize.level}`">
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
      <view class="prize-modal-content" :class="{ 'is-win': currentPrize && currentPrize.level > 1, 'is-lose': currentPrize && currentPrize.level <= 1 }" @click.stop>
        <!-- 背景光效 -->
        <view class="prize-glow"></view>
        <view class="prize-rays"></view>
        <view class="prize-top-shine"></view>
        <view class="prize-close" @click="closePrizeModal"><text>x</text></view>
        
        <!-- 庆祝粒子（中奖时显示） -->
        <view class="confetti-layer" v-if="currentPrize && currentPrize.level > 1">
          <view v-for="n in 12" :key="n" class="confetti" :style="getConfettiStyle(n)"></view>
        </view>
        
        <!-- 图标区域 -->
        <view class="prize-icon-wrap">
          <view class="prize-icon-halo"></view>
          <view class="prize-icon-ring" :class="currentPrize && currentPrize.level > 1 ? 'win' : 'lose'">
            <text class="prize-modal-icon">{{ currentPrize && currentPrize.level > 1 ? '🎉' : '🍀' }}</text>
          </view>
        </view>
        
        <!-- 标题 -->
        <text class="prize-modal-title">{{ getPrizeModalTitle() }}</text>
        
        <!-- 奖品信息卡片 -->
        <view class="prize-info-card" v-if="currentPrize">
          <view class="prize-info-header">
            <text class="prize-info-label">获得奖品</text>
            <view class="prize-level-badge" :class="`level-${currentPrize.level}`">
              <text>{{ getLevelLabel(currentPrize.level) }}</text>
            </view>
          </view>
          <text class="prize-modal-name">{{ currentPrize.prizeName }}</text>
          <view class="prize-detail" v-if="isPointsPrize(currentPrize) && currentPrize.level > 1">
            <text class="prize-points-icon">💎</text>
            <text class="prize-modal-type">+{{ currentPrize.prizeValue }} 积分已到账</text>
          </view>
          <text class="prize-modal-type" v-else>{{ currentPrize.description }}</text>
        </view>
        
        <!-- 操作按钮 -->
        <view class="prize-modal-actions">
          <view class="modal-btn primary" v-if="currentPrize && currentPrize.grantsRetry" @click="continueDraw">
            <text class="btn-icon">🎰</text>
            <text>再来一次</text>
          </view>
          <view class="modal-btn primary" v-else-if="freeCount > 0 && currentPrize && currentPrize.level === 1" @click="continueDraw">
            <text class="btn-icon">🎰</text>
            <text>继续抽奖</text>
          </view>
          <view class="modal-btn secondary" @click="closePrizeModal">
            <text>{{ shouldShowLaterButton() ? '稍后再说' : '好的' }}</text>
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
          <text class="rule-item">2. 免费次数用完后，可消耗 {{ getDrawCost() }} 积分继续抽奖</text>
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
import { userinfo } from '@/api/user.js';

export default {
  data() {
    return {
      config: { prizes: [], cost: 10, dailyFreeCount: 1 },
      freeCount: 0,
      totalFree: 1,
      userPoints: 0,
      records: [],
      isSpinning: false,
      showPrizeModal: false,
      showRules: false,
      currentPrize: null,
      spinAngle: 0,
      wheelImageSrc: '',
      wheelCanvasSize: 280,
      canDraw: false,
      isDark: false,
      hasLoadedData: false
    };
  },
  computed: {
    displayPrizes() {
      const prizes = (this.config && this.config.prizes) || [];
      return prizes.filter(prize => Number(prize.level) > 1);
    }
  },
  onLoad() {
    this.checkTheme();
    this.loadData();
  },
  onReady() {
    this.requestDrawWheel();
  },
  onShow() {
    this.checkTheme();
    if (this.hasLoadedData) {
      this.loadData();
    }
  },
  methods: {
    extractData(res) {
      return res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res;
    },
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    goBack() { 
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack()
      } else {
        if (this.isDark) {
          uni.reLaunch({url: '/pages-dark/home/home'})
        } else {
          uni.reLaunch({url: '/pages/home/home'})
        }
      }
    },
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
    getWheelBulbStyle(n) {
      const angle = (n - 1) * (360 / 16);
      return {
        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-266rpx)`,
        animationDelay: `${(n % 2) * 0.45}s`
      };
    },
    getConfettiStyle(n) {
      const colors = ['#FFD700', '#FF6B6B', '#4FC3F7', '#FF9F43', '#1DD1A1', '#A29BFE', '#FD79A8', '#00CEC9'];
      const positions = [
        { left: '10%', top: '5%', delay: '0s', size: '10rpx' },
        { left: '85%', top: '8%', delay: '0.2s', size: '8rpx' },
        { left: '5%', top: '25%', delay: '0.4s', size: '12rpx' },
        { left: '90%', top: '30%', delay: '0.1s', size: '9rpx' },
        { left: '20%', top: '15%', delay: '0.3s', size: '11rpx' },
        { left: '75%', top: '20%', delay: '0.5s', size: '7rpx' },
        { left: '35%', top: '3%', delay: '0.15s', size: '10rpx' },
        { left: '65%', top: '10%', delay: '0.35s', size: '8rpx' },
        { left: '50%', top: '2%', delay: '0.25s', size: '12rpx' },
        { left: '15%', top: '35%', delay: '0.45s', size: '9rpx' },
        { left: '80%', top: '40%', delay: '0.55s', size: '11rpx' },
        { left: '45%', top: '8%', delay: '0.05s', size: '10rpx' }
      ];
      const p = positions[n - 1] || positions[0];
      return {
        left: p.left, top: p.top,
        width: p.size, height: p.size,
        background: colors[(n - 1) % colors.length],
        animationDelay: p.delay
      };
    },
    requestAnimationFrameCompat(callback) {
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(callback);
      }
      return setTimeout(callback, 16);
    },
    getLevelLabel(level) {
      const map = { 1: '谢谢参与', 2: '幸运奖', 3: '大奖' };
      return map[level] || '奖品';
    },
    getPrizeIcon(type) {
      const map = { points: '💎', coupon: '🎟️', goods: '📦' };
      return map[type] || '🎁';
    },
    getDrawCost() {
      return Number(this.config && this.config.cost) || 10;
    },
    getPrizeModalTitle() {
      if (!this.currentPrize) return '';
      if (this.currentPrize.grantsRetry) return '再来一次';
      return this.currentPrize.level > 1 ? '恭喜中奖！' : '再接再厉';
    },
    shouldShowLaterButton() {
      return !!(
        this.currentPrize &&
        (this.currentPrize.grantsRetry || (this.freeCount > 0 && this.currentPrize.level === 1))
      );
    },
    requestDrawWheel() {
      this.$nextTick(() => {
        setTimeout(() => {
          this.drawLotteryWheel(0);
        }, 80);
      });
    },
    drawLotteryWheel(rotationDeg = 0) {
      const prizes = (this.config && this.config.prizes) || [];
      const query = uni.createSelectorQuery().in(this);
      query.select('#lotteryWheel').boundingClientRect(rect => {
        const size = Math.round((rect && rect.width) || this.wheelCanvasSize || 280);
        if (size !== this.wheelCanvasSize) {
          this.wheelCanvasSize = size;
          this.$nextTick(() => this.drawLotteryWheel(rotationDeg));
          return;
        }
        const center = size / 2;
        const outerRadius = center - 6;
        const segmentRadius = center - 28;
        const innerRadius = center * 0.23;
        const ctx = uni.createCanvasContext('lotteryWheel', this);

        ctx.clearRect(0, 0, size, size);

        if (!prizes.length) {
          ctx.beginPath();
          ctx.arc(center, center, segmentRadius, 0, Math.PI * 2);
          ctx.setFillStyle('#fff7ed');
          ctx.fill();
          ctx.setStrokeStyle('#f59e0b');
          ctx.setLineWidth(4);
          ctx.stroke();
          ctx.setFillStyle('#b45309');
          ctx.setFontSize(16);
          ctx.setTextAlign('center');
          ctx.setTextBaseline('middle');
          ctx.fillText('奖品加载中', center, center);
          ctx.draw();
          return;
        }

        const colors = ['#fff1b8', '#c9f7dc', '#d7ecff', '#ffd7d7', '#eadcff', '#c8fbf1', '#ffe0bd', '#ffd9ea'];
        const accentColors = ['#f59e0b', '#10b981', '#0ea5e9', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899'];
        const segmentAngle = (Math.PI * 2) / prizes.length;
        const rotation = (Number(rotationDeg) || 0) * Math.PI / 180;
        const startOffset = -Math.PI / 2 - segmentAngle / 2 + rotation;

        ctx.beginPath();
        ctx.arc(center, center, outerRadius, 0, Math.PI * 2);
        ctx.setFillStyle('#f59e0b');
        ctx.fill();

        ctx.beginPath();
        ctx.arc(center, center, outerRadius - 8, 0, Math.PI * 2);
        ctx.setFillStyle('#fff7ed');
        ctx.fill();

        prizes.forEach((prize, index) => {
          const startAngle = startOffset + index * segmentAngle;
          const endAngle = startAngle + segmentAngle;
          const midAngle = startAngle + segmentAngle / 2;

          ctx.beginPath();
          ctx.moveTo(center, center);
          ctx.arc(center, center, segmentRadius, startAngle, endAngle);
          ctx.closePath();
          ctx.setFillStyle(colors[index % colors.length]);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(center, center);
          ctx.arc(center, center, segmentRadius, startAngle, endAngle);
          ctx.closePath();
          ctx.setStrokeStyle('rgba(255, 255, 255, 0.96)');
          ctx.setLineWidth(3);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(center, center);
          ctx.lineTo(center + Math.cos(startAngle) * segmentRadius, center + Math.sin(startAngle) * segmentRadius);
          ctx.setStrokeStyle('rgba(255, 255, 255, 0.72)');
          ctx.setLineWidth(2);
          ctx.stroke();

          ctx.save();
          const labelRadius = segmentRadius * 0.62;
          ctx.translate(center + Math.cos(midAngle) * labelRadius, center + Math.sin(midAngle) * labelRadius);
          ctx.rotate(midAngle + Math.PI / 2);
          ctx.setTextAlign('center');
          ctx.setTextBaseline('middle');

          ctx.setFillStyle(accentColors[index % accentColors.length]);
          ctx.setFontSize(22);
          ctx.fillText(this.getPrizeIcon(prize.type), 0, -18);

          ctx.setFillStyle('#1f2937');
          ctx.setFontSize(12);
          this.drawWheelText(ctx, prize.name || '', 0, 6);
          ctx.restore();
        });

        ctx.beginPath();
        ctx.arc(center, center, segmentRadius, 0, Math.PI * 2);
        ctx.setStrokeStyle('#fbbf24');
        ctx.setLineWidth(6);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(center, center, segmentRadius - 8, 0, Math.PI * 2);
        ctx.setStrokeStyle('rgba(16, 185, 129, 0.38)');
        ctx.setLineWidth(2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(center, center, innerRadius + 13, 0, Math.PI * 2);
        ctx.setFillStyle('#fbbf24');
        ctx.fill();

        ctx.beginPath();
        ctx.arc(center, center, innerRadius + 7, 0, Math.PI * 2);
        ctx.setFillStyle('#ffffff');
        ctx.fill();
        ctx.setStrokeStyle('rgba(16, 185, 129, 0.22)');
        ctx.setLineWidth(2);
        ctx.stroke();

        // #ifdef H5
        ctx.draw();
        // #endif
        // #ifndef H5
        ctx.draw(false, () => {
          try {
            uni.canvasToTempFilePath({
              canvasId: 'lotteryWheel',
              success: (res) => {
                this.wheelImageSrc = (res && res.tempFilePath) || '';
              },
              fail: () => {
                this.wheelImageSrc = '';
              }
            }, this);
          } catch (err) {
            console.warn('[lottery] export wheel image failed:', err && err.message ? err.message : err);
            this.wheelImageSrc = '';
          }
        });
        // #endif
      }).exec();
    },
    drawWheelText(ctx, text, x, y) {
      const safeText = String(text || '');
      const firstLine = safeText.slice(0, 5);
      const secondLine = safeText.slice(5, 10);
      ctx.fillText(firstLine, x, y);
      if (secondLine) {
        ctx.fillText(secondLine, x, y + 14);
      }
    },
    isPointsPrize(prize) {
      return prize && (prize.type === 'points' || prize.prizeType === 'points');
    },
    async loadUserPoints() {
      const token = uni.getStorageSync('token');
      if (!token) {
        this.userPoints = 0;
        uni.removeStorageSync('userPoints');
        return;
      }

      try {
        const res = await userinfo('false');
        const data = this.extractData(res) || {};
        this.userPoints = Number(data.points) || 0;
        uni.setStorageSync('userPoints', this.userPoints);
      } catch (e) {
        const storedPoints = uni.getStorageSync('userPoints');
        this.userPoints = Number(storedPoints) || 0;
      }
    },
    async loadData() {
      try {
        const [configRes, statusRes, recordsRes] = await Promise.all([
          getLotteryConfig(),
          getLotteryDailyStatus(),
          getLotteryRecords(1, 20),
          this.loadUserPoints()
        ]);
        const configData = this.extractData(configRes) || {};
        const statusData = this.extractData(statusRes) || {};
        const recordData = this.extractData(recordsRes) || {};
        this.config = configData;
        this.freeCount = statusData.freeCount || 0;
        this.totalFree = statusData.totalFree || 1;
        this.records = recordData.records || [];
        this.canDraw = this.freeCount > 0 || this.userPoints >= this.getDrawCost();
        this.wheelImageSrc = '';
      } catch (e) {
        console.error('加载失败:', e);
      } finally {
        this.hasLoadedData = true;
        this.requestDrawWheel();
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
        const data = this.extractData(res) || {};
        this.currentPrize = data;
        this.spinToPrize(data);
        if (Object.prototype.hasOwnProperty.call(data, 'userPoints')) {
          this.userPoints = Number(data.userPoints) || 0;
          uni.setStorageSync('userPoints', this.userPoints);
        }
        if (data.isFree && this.freeCount > 0 && !data.grantsRetry) this.freeCount--;
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
        ? (360 - prizeIndex * segmentAngle) % 360
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
        // #ifdef H5
        this.drawLotteryWheel(current);
        // #endif
        if (progress < 1) {
          this.requestAnimationFrameCompat(animate);
        } else {
          this.isSpinning = false;
          this.canDraw = this.freeCount > 0 || this.userPoints >= this.getDrawCost();
          setTimeout(() => {
            this.showPrizeModal = true;
          }, 300);
        }
      };
      this.requestAnimationFrameCompat(animate);
    },
    continueDraw() {
      this.showPrizeModal = false;
      this.currentPrize = null;
      if (this.canDraw) {
        this.$nextTick(() => {
          this.requestDrawWheel();
          this.startDraw();
        });
      }
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
  background:
    radial-gradient(circle at 18% 8%, rgba(251, 191, 36, 0.22) 0%, transparent 32%),
    radial-gradient(circle at 86% 18%, rgba(16, 185, 129, 0.2) 0%, transparent 34%),
    radial-gradient(circle at 58% 84%, rgba(168, 85, 247, 0.13) 0%, transparent 36%),
    linear-gradient(180deg, #0b1220 0%, #101827 48%, #111827 100%);
}

/* ===== 背景效果 ===== */
.bg-effects {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}
.lottery-page.dark-mode .bg-effects::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(251, 191, 36, 0.04) 1rpx, transparent 1rpx),
    linear-gradient(90deg, rgba(16, 185, 129, 0.04) 1rpx, transparent 1rpx);
  background-size: 68rpx 68rpx;
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.54), rgba(0,0,0,0.08));
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.54), rgba(0,0,0,0.08));
}
.bg-gradient {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.1) 0%, transparent 60%);
  transition: all 0.3s;
}
.lottery-page.dark-mode .bg-gradient {
  background:
    radial-gradient(ellipse at 50% 0%, rgba(251, 191, 36, 0.13) 0%, transparent 56%),
    radial-gradient(ellipse at 82% 34%, rgba(16, 185, 129, 0.1) 0%, transparent 46%);
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

.lottery-hero-card {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 24rpx;
  padding: 30rpx;
  border-radius: 26rpx;
  background:
    radial-gradient(circle at 82% 18%, rgba(251, 191, 36, 0.34), transparent 34%),
    linear-gradient(135deg, #ecfdf5 0%, #ffffff 48%, #fff7ed 100%);
  border: 1rpx solid rgba(16, 185, 129, 0.1);
  box-shadow: 0 14rpx 36rpx rgba(16, 185, 129, 0.12);
}
.lottery-hero-card::after {
  content: '';
  position: absolute;
  right: -60rpx;
  bottom: -80rpx;
  width: 240rpx;
  height: 240rpx;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.1);
}
.dark-mode .lottery-hero-card {
  background:
    radial-gradient(circle at 82% 18%, rgba(251, 191, 36, 0.18), transparent 36%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.86), rgba(16, 185, 129, 0.14));
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 14rpx 36rpx rgba(0, 0, 0, 0.24);
}
.hero-copy { position: relative; z-index: 1; flex: 1; min-width: 0; }
.hero-kicker {
  display: block;
  color: #f59e0b;
  font-size: 22rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}
.hero-title {
  display: block;
  color: #0f172a;
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1.35;
  margin-bottom: 8rpx;
}
.dark-mode .hero-title { color: #f8fafc; }
.hero-desc {
  display: block;
  color: #64748b;
  font-size: 23rpx;
  line-height: 1.5;
}
.dark-mode .hero-desc { color: rgba(255, 255, 255, 0.66); }
.hero-badge {
  position: relative;
  z-index: 1;
  width: 112rpx;
  height: 112rpx;
  border-radius: 30rpx;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 28rpx rgba(16, 185, 129, 0.28);
  flex-shrink: 0;
}
.hero-badge-num { color: #fff; font-size: 38rpx; font-weight: 900; line-height: 1; }
.hero-badge-label { color: rgba(255, 255, 255, 0.86); font-size: 20rpx; margin-top: 8rpx; }

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
.points-helper {
  display: block;
  color: #f59e0b;
  font-size: 22rpx;
  font-weight: 600;
  margin-top: 8rpx;
}
.points-helper.ready { color: #10b981; }
.dark-mode .points-helper { color: #fbbf24; }
.dark-mode .points-helper.ready { color: #34d399; }

/* ===== 转盘区域 ===== */
.wheel-section { display: flex; justify-content: center; margin-bottom: 34rpx; }
.wheel-container {
  position: relative;
  width: 590rpx;
  height: 590rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wheel-shell {
  position: relative;
  width: 560rpx;
  height: 560rpx;
  overflow: visible;
  border-radius: 50%;
  background: linear-gradient(145deg, #f59e0b 0%, #fbbf24 45%, #10b981 100%);
  box-shadow: 0 24rpx 70rpx rgba(16, 185, 129, 0.18), 0 12rpx 32rpx rgba(245, 158, 11, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wheel-shell::before {
  content: '';
  position: absolute;
  inset: 18rpx;
  border-radius: 50%;
  border: 2rpx solid rgba(255, 255, 255, 0.86);
  box-shadow: inset 0 0 26rpx rgba(255, 255, 255, 0.32);
}
.wheel-halo {
  position: absolute;
  inset: -34rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.22) 0%, rgba(245, 158, 11, 0.12) 44%, transparent 72%);
  pointer-events: none;
}
.wheel-rotor {
  position: relative;
  z-index: 1;
  width: 532rpx;
  height: 532rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  will-change: transform;
}
.wheel-image {
  width: 532rpx;
  height: 532rpx;
  border-radius: 50%;
  display: block;
}
.wheel-loading {
  width: 532rpx;
  height: 532rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.88);
  border: 2rpx dashed rgba(16, 185, 129, 0.28);
}
.wheel-loading-text {
  color: #059669;
  font-size: 24rpx;
  font-weight: 700;
}
.wheel-canvas {
  position: relative;
  z-index: 1;
  width: 532rpx; height: 532rpx;
  border-radius: 50%;
}
.wheel-canvas-stage {
  position: absolute;
  left: -9999rpx;
  top: -9999rpx;
  width: 532rpx;
  height: 532rpx;
  opacity: 0;
  pointer-events: none;
}
.wheel-bulb {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 12rpx rgba(255, 255, 255, 0.95), 0 0 18rpx rgba(251, 191, 36, 0.45);
  animation: wheelBulb 0.9s ease-in-out infinite alternate;
}
@keyframes wheelBulb {
  from { opacity: 0.58; box-shadow: 0 0 8rpx rgba(255, 255, 255, 0.72), 0 0 12rpx rgba(251, 191, 36, 0.28); }
  to { opacity: 1; box-shadow: 0 0 14rpx rgba(255, 255, 255, 1), 0 0 22rpx rgba(251, 191, 36, 0.58); }
}
.wheel-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 154rpx; height: 154rpx;
  background: linear-gradient(135deg, #fef3c7 0%, #ffffff 55%, #d1fae5 100%);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 12rpx 34rpx rgba(15, 23, 42, 0.16), inset 0 0 0 4rpx rgba(255, 255, 255, 0.9);
  z-index: 5;
}
.center-inner {
  width: 118rpx;
  height: 118rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 24rpx rgba(16, 185, 129, 0.34);
}
.center-text { color: #fff; font-size: 28rpx; font-weight: 800; }
.wheel-pointer {
  position: absolute;
  top: 58rpx; left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pointer-head {
  width: 0; height: 0;
  border-left: 32rpx solid transparent;
  border-right: 32rpx solid transparent;
  border-top: 76rpx solid #10b981;
  filter: drop-shadow(0 8rpx 10rpx rgba(5, 150, 105, 0.28));
}
.pointer-stem {
  width: 26rpx;
  height: 26rpx;
  border-radius: 50%;
  background: #047857;
  margin-top: -22rpx;
  border: 4rpx solid #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(15, 23, 42, 0.16);
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

/* ===== 弹窗（美化版） ===== */
.prize-modal {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.68);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 40rpx;
  backdrop-filter: blur(12px);
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.prize-modal-content {
  background: linear-gradient(180deg, #ffffff 0%, #f8fffb 48%, #eefcf5 100%);
  border-radius: 36rpx;
  padding: 58rpx 38rpx 36rpx;
  text-align: center;
  width: 100%; max-width: 640rpx;
  position: relative; overflow: hidden;
  box-shadow: 0 36rpx 100rpx rgba(15, 23, 42, 0.34), 0 0 0 1rpx rgba(255, 255, 255, 0.9);
  border: 2rpx solid rgba(16, 185, 129, 0.18);
  animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.prize-modal-content.is-win {
  background: linear-gradient(180deg, #fffaf0 0%, #ffffff 42%, #ecfdf5 100%);
  border-color: rgba(245, 158, 11, 0.34);
  box-shadow: 0 36rpx 110rpx rgba(15, 23, 42, 0.36), 0 0 80rpx rgba(245, 158, 11, 0.18);
}
.prize-modal-content.is-lose {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 54%, #f1f5f9 100%);
  border-color: rgba(148, 163, 184, 0.28);
}
.dark-mode .prize-modal-content {
  background: linear-gradient(180deg, #172033 0%, #111827 58%, #0f172a 100%);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 36rpx 110rpx rgba(0, 0, 0, 0.58), 0 0 70rpx rgba(16, 185, 129, 0.12);
}
.dark-mode .prize-modal-content.is-win {
  background: linear-gradient(180deg, #2d2415 0%, #172033 48%, #10251f 100%);
  border-color: rgba(251, 191, 36, 0.26);
}
@keyframes slideUp {
  from { transform: translateY(60rpx) scale(0.9); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

/* 背景光效 */
.prize-glow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% -8%, rgba(16, 185, 129, 0.18) 0%, transparent 62%);
  pointer-events: none;
}
.prize-rays {
  position: absolute; inset: 0;
  background: conic-gradient(from 0deg at 50% 14%, transparent 0deg, rgba(251, 191, 36, 0.12) 28deg, transparent 56deg, rgba(16, 185, 129, 0.08) 118deg, transparent 148deg, rgba(251, 191, 36, 0.1) 210deg, transparent 240deg, rgba(16, 185, 129, 0.08) 300deg, transparent 330deg);
  pointer-events: none;
  animation: rotateRays 20s linear infinite;
  opacity: 0.72;
}
.prize-top-shine {
  position: absolute;
  left: 50%;
  top: -120rpx;
  width: 520rpx;
  height: 260rpx;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(251, 191, 36, 0.32) 0%, rgba(16, 185, 129, 0.12) 44%, transparent 72%);
  pointer-events: none;
}
.prize-close {
  position: absolute;
  top: 22rpx;
  right: 22rpx;
  z-index: 3;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.06);
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1;
}
.dark-mode .prize-close {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.72);
}
.prize-close:active {
  transform: scale(0.92);
}
@keyframes rotateRays {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 庆祝粒子 */
.confetti-layer {
  position: absolute; inset: 0;
  pointer-events: none; overflow: hidden;
}
.confetti {
  position: absolute;
  border-radius: 50%;
  animation: confettiFall 3s ease-in-out infinite;
  opacity: 0.8;
}
@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 0.8; }
  50% { transform: translateY(100rpx) rotate(180deg); opacity: 1; }
  100% { transform: translateY(200rpx) rotate(360deg); opacity: 0; }
}

/* 图标区域 */
.prize-icon-wrap {
  position: relative; z-index: 1;
  margin-bottom: 22rpx;
  min-height: 172rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.prize-icon-halo {
  position: absolute;
  width: 220rpx;
  height: 220rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.2) 0%, rgba(16, 185, 129, 0.08) 46%, transparent 70%);
  animation: haloBreath 2.6s ease-in-out infinite;
}
.prize-icon-ring {
  width: 156rpx; height: 156rpx;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}
.prize-icon-ring.win {
  background: linear-gradient(135deg, #fff7d6 0%, #fef3c7 45%, #d1fae5 100%);
  border: 6rpx solid #ffffff;
  box-shadow: 0 16rpx 42rpx rgba(245, 158, 11, 0.22), inset 0 0 0 2rpx rgba(251, 191, 36, 0.36);
  animation: pulseWin 2s ease-in-out infinite;
}
.prize-icon-ring.lose {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border: 6rpx solid #ffffff;
  box-shadow: 0 14rpx 36rpx rgba(100, 116, 139, 0.18), inset 0 0 0 2rpx rgba(148, 163, 184, 0.26);
}
@keyframes pulseWin {
  0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 16rpx 42rpx rgba(245, 158, 11, 0.22), inset 0 0 0 2rpx rgba(251, 191, 36, 0.36); }
  50% { transform: translateY(-4rpx) scale(1.03); box-shadow: 0 20rpx 58rpx rgba(245, 158, 11, 0.32), inset 0 0 0 2rpx rgba(251, 191, 36, 0.5); }
}
@keyframes haloBreath {
  0%, 100% { transform: scale(0.92); opacity: 0.72; }
  50% { transform: scale(1.08); opacity: 1; }
}
.dark-mode .prize-icon-ring.win {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.28), rgba(16, 185, 129, 0.18));
  border-color: rgba(255, 255, 255, 0.16);
}
.dark-mode .prize-icon-ring.lose {
  background: linear-gradient(135deg, rgba(148, 163, 184, 0.16), rgba(71, 85, 105, 0.18));
  border-color: rgba(255, 255, 255, 0.14);
}
.prize-modal-icon { font-size: 78rpx; display: block; animation: bounce 0.6s ease; }
@keyframes bounce {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

/* 标题 */
.prize-modal-title {
  display: block;
  font-size: 46rpx;
  font-weight: 800;
  margin-bottom: 28rpx;
  position: relative; z-index: 1;
  color: #0f172a;
  text-shadow: none;
  letter-spacing: 1rpx;
}
.prize-modal-content.is-win .prize-modal-title {
  color: #92400e;
}
.prize-modal-content.is-lose .prize-modal-title {
  color: #334155;
}
.dark-mode .prize-modal-title {
  color: #f8fafc;
}
.dark-mode .prize-modal-content.is-win .prize-modal-title {
  color: #fbbf24;
}

/* 奖品信息卡片 */
.prize-info-card {
  position: relative; z-index: 1;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 24rpx;
  padding: 30rpx 26rpx;
  margin-bottom: 32rpx;
  border: 1rpx solid rgba(16, 185, 129, 0.13);
  box-shadow: 0 14rpx 38rpx rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(12px);
}
.prize-modal-content.is-win .prize-info-card {
  border-color: rgba(245, 158, 11, 0.2);
  box-shadow: 0 16rpx 42rpx rgba(245, 158, 11, 0.12);
}
.dark-mode .prize-info-card {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 14rpx 38rpx rgba(0, 0, 0, 0.2);
}
.prize-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.prize-info-label {
  font-size: 22rpx;
  color: #64748b;
  font-weight: 500;
}
.dark-mode .prize-info-label { color: rgba(255, 255, 255, 0.62); }
.prize-level-badge {
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-size: 20rpx;
  font-weight: 600;
}
.prize-level-badge.level-1 {
  background: rgba(148, 163, 184, 0.13);
  color: #64748b;
  border: 1rpx solid rgba(148, 163, 184, 0.22);
}
.prize-level-badge.level-2 {
  background: linear-gradient(135deg, rgba(52, 211, 153, 0.14), rgba(16, 185, 129, 0.1));
  color: #059669;
  border: 1rpx solid rgba(16, 185, 129, 0.22);
}
.prize-level-badge.level-3 {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.13));
  color: #b45309;
  border: 1rpx solid rgba(245, 158, 11, 0.28);
}
.dark-mode .prize-level-badge.level-2 { color: #34d399; }
.dark-mode .prize-level-badge.level-3 { color: #fbbf24; }
.prize-modal-name {
  display: block;
  color: #0f172a;
  font-size: 36rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
  letter-spacing: 1rpx;
}
.dark-mode .prize-modal-name { color: #fff; }
.prize-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}
.prize-points-icon { font-size: 28rpx; }
.prize-modal-type {
  display: block;
  color: #059669;
  font-size: 26rpx;
  font-weight: 500;
  line-height: 1.55;
}
.prize-modal-content.is-lose .prize-modal-type { color: #64748b; }
.dark-mode .prize-modal-type { color: #34d399; }
.dark-mode .prize-modal-content.is-lose .prize-modal-type { color: rgba(255, 255, 255, 0.68); }

/* 操作按钮 */
.prize-modal-actions {
  display: flex;
  gap: 18rpx;
  justify-content: center;
  position: relative; z-index: 1;
}
.modal-btn {
  min-width: 190rpx;
  padding: 22rpx 34rpx;
  border-radius: 22rpx;
  font-size: 28rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  transition: all 0.2s ease;
}
.modal-btn.primary {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  box-shadow: 0 10rpx 26rpx rgba(16, 185, 129, 0.28);
}
.modal-btn.primary:active {
  transform: scale(0.95);
  box-shadow: 0 5rpx 14rpx rgba(16, 185, 129, 0.22);
}
.modal-btn.secondary {
  background: #0f172a;
  color: #fff;
  border: 1rpx solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.16);
}
.modal-btn.secondary:active {
  transform: scale(0.95);
  background: #1e293b;
}
.prize-modal-content.is-lose .modal-btn.secondary {
  background: #10b981;
  border-color: rgba(16, 185, 129, 0.18);
  box-shadow: 0 10rpx 26rpx rgba(16, 185, 129, 0.22);
}
.dark-mode .modal-btn.secondary {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: none;
}
.btn-icon { font-size: 28rpx; }

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
