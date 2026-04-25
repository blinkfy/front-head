<template>
  <view class="booking-page" :class="{ 'dark-mode': isDark }">
    <!-- 动态背景 -->
    <view class="bg-effects">
      <view class="bg-circle c1"></view>
      <view class="bg-circle c2"></view>
      <view class="bg-circle c3"></view>
    </view>

    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left" @click="goBack">
          <text class="back-icon">←</text>
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill"><text>♻️</text></view>
          <text class="nav-title">预约回收</text>
        </view>
        <view class="nav-right">
          <view class="action-icon-btn" @click="goToOrders">
            <text>📋</text>
          </view>
        </view>
      </view>
    </view>

    <scroll-view class="main-scroll" scroll-y>
      <view class="content-wrapper">

        <!-- 回收物品类型网格 -->
        <view class="section">
          <view class="section-title">选择回收物品</view>
          <view class="waste-grid">
            <view
              v-for="item in wasteTypes"
              :key="item.id"
              :class="['waste-card', selectedTypes.includes(item.id) ? 'selected' : '']"
              @click="toggleWasteType(item)"
            >
              <text class="waste-icon">{{ item.icon }}</text>
              <text class="waste-name">{{ item.name }}</text>
              <text class="waste-price">¥{{ item.price }}/kg</text>
            </view>
          </view>
        </view>

        <!-- 日期选择 -->
        <view class="section">
          <view class="section-title">选择回收日期</view>
          <view class="date-tabs">
            <view
              :class="['date-tab', selectedDate === 'today' ? 'active' : '']"
              @click="selectDate('today')"
            >
              <text class="date-label">今天</text>
              <text class="date-desc">{{ todayStr }}</text>
            </view>
            <view
              :class="['date-tab', selectedDate === 'tomorrow' ? 'active' : '']"
              @click="selectDate('tomorrow')"
            >
              <text class="date-label">明天</text>
              <text class="date-desc">{{ tomorrowStr }}</text>
            </view>
          </view>
        </view>

        <!-- 时间段选择 -->
        <view class="section">
          <view class="section-title">选择时间段</view>
          <view class="time-grid">
            <view
              v-for="slot in timeSlots"
              :key="slot.time"
              :class="['time-slot', {
                'selected': selectedTimeSlot === slot.time,
                'disabled': !slot.available
              }]"
              @click="slot.available && selectTimeSlot(slot.time)"
            >
              <text class="time-text">{{ slot.time }}</text>
              <text class="time-status">{{ slot.available ? '可预约' : '已约满' }}</text>
            </view>
          </view>
        </view>

        <!-- 地址输入 -->
        <view class="section">
          <view class="section-title">回收地址</view>
          <view class="input-card">
            <input
              v-model="address"
              class="input-field"
              placeholder="请输入详细地址"
              placeholder-class="input-placeholder"
            />
          </view>
        </view>

        <!-- 备注输入 -->
        <view class="section">
          <view class="section-title">备注信息（选填）</view>
          <view class="input-card textarea-card">
            <textarea
              v-model="remark"
              class="textarea-field"
              placeholder="请输入备注信息，如：大件物品、特殊需求等"
              placeholder-class="input-placeholder"
              auto-height
            ></textarea>
          </view>
        </view>

        <!-- 预估收益 -->
        <view class="estimate-card" v-if="estimateAmount > 0">
          <view class="estimate-info">
            <text class="estimate-label">预估收益</text>
            <text class="estimate-amount">¥{{ estimateAmount.toFixed(2) }}</text>
          </view>
          <text class="estimate-note">实际收益以回收员现场称重为准</text>
        </view>

        <!-- 预约按钮 -->
        <view class="submit-section">
          <view
            :class="['submit-btn', submitting ? 'disabled' : '']"
            @click="submitBooking"
          >
            <text class="submit-text">{{ submitting ? '提交中...' : '立即预约' }}</text>
          </view>
        </view>

      </view>
    </scroll-view>
  </view>
</template>

<script>
import { getWasteTypes, createBooking, getAvailableTimeSlots, estimatePrice } from '@/api/booking.js';

export default {
  data() {
    return {
      wasteTypes: [],
      selectedTypes: [],
      selectedDate: 'today',
      selectedTimeSlot: '',
      timeSlots: [],
      address: '',
      remark: '',
      estimateAmount: 0,
      submitting: false,
      todayStr: '',
      tomorrowStr: '',
      isDark: false
    };
  },
  onLoad() {
    this.checkTheme();
    this.initDates();
    this.loadWasteTypes();
    this.loadTimeSlots();
  },
  onShow() {
    this.checkTheme();
  },
  computed: {
    selectedWasteItems() {
      return this.wasteTypes.filter(t => this.selectedTypes.includes(t.id));
    }
  },
  watch: {
    selectedTypes: {
      handler() {
        this.calculateEstimate();
      },
      deep: true
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
    goBack() { uni.navigateBack(); },
    goToOrders() {
      uni.navigateTo({ url: '/pages-nonTheme/booking-orders' });
    },
    initDates() {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const format = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
      this.todayStr = format(today);
      this.tomorrowStr = format(tomorrow);
    },
    async loadWasteTypes() {
      try {
        const res = await getWasteTypes();
        const data = this.extractData(res);
        this.wasteTypes = Array.isArray(data)
          ? data.map((item) => ({
              ...item,
              price: Number(item.unitPrice || item.price || 0)
            }))
          : [];
      } catch (e) {
        console.error('获取废品类型失败:', e);
        this.wasteTypes = [];
      }
    },
    async loadTimeSlots() {
      const dateStr = this.selectedDate === 'today'
        ? new Date().toISOString().split('T')[0]
        : new Date(Date.now() + 86400000).toISOString().split('T')[0];
      try {
        const res = await getAvailableTimeSlots(dateStr);
        const data = this.extractData(res);
        this.timeSlots = Array.isArray(data)
          ? data.map((slot) => ({
              ...slot,
              time: slot.slot || slot.time || ''
            }))
          : [];
      } catch (e) {
        console.error('获取时间段失败:', e);
        this.timeSlots = [];
      }
    },
    toggleWasteType(item) {
      const idx = this.selectedTypes.indexOf(item.id);
      if (idx > -1) {
        this.selectedTypes.splice(idx, 1);
      } else {
        this.selectedTypes.push(item.id);
      }
    },
    selectDate(date) {
      this.selectedDate = date;
      this.selectedTimeSlot = '';
      this.loadTimeSlots();
    },
    selectTimeSlot(time) {
      this.selectedTimeSlot = time;
    },
    async calculateEstimate() {
      if (this.selectedTypes.length === 0) {
        this.estimateAmount = 0;
        return;
      }
      const items = this.selectedWasteItems.map(t => ({
        typeId: t.id,
        weight: 1
      }));
      try {
        const res = await estimatePrice(items);
        const data = this.extractData(res) || {};
        this.estimateAmount = Number(data.totalPrice || 0);
      } catch (e) {
        this.estimateAmount = this.selectedWasteItems.reduce((sum, t) => sum + t.price, 0);
      }
    },
    async submitBooking() {
      if (this.submitting) return;
      if (this.selectedTypes.length === 0) {
        uni.showToast({ title: '请选择回收物品', icon: 'none' });
        return;
      }
      if (!this.selectedTimeSlot) {
        uni.showToast({ title: '请选择时间段', icon: 'none' });
        return;
      }
      if (!this.address.trim()) {
        uni.showToast({ title: '请输入回收地址', icon: 'none' });
        return;
      }
      this.submitting = true;
      const dateStr = this.selectedDate === 'today'
        ? new Date().toISOString().split('T')[0]
        : new Date(Date.now() + 86400000).toISOString().split('T')[0];
      try {
        await createBooking({
          items: this.selectedTypes.map(id => ({ typeId: id, weight: 1 })),
          appointmentDate: dateStr,
          appointmentTimeSlot: this.selectedTimeSlot,
          address: this.address,
          notes: this.remark
        });
        uni.showToast({ title: '预约成功!', icon: 'success' });
        setTimeout(() => {
          this.goToOrders();
        }, 1500);
      } catch (e) {
        uni.showToast({ title: e.message || '预约失败', icon: 'none' });
      } finally {
        this.submitting = false;
      }
    }
  }
};
</script>

<style scoped>
/* ===== 主容器 ===== */
.booking-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}
.booking-page.dark-mode {
  background: linear-gradient(135deg, #28285f 0%, #28346f 30%, #322c8a 70%, #442977 100%);
}

/* ===== 背景效果 ===== */
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s; }
.booking-page:not(.dark-mode) .bg-circle { background: #10b981; }
.booking-page.dark-mode .bg-circle { background: rgba(255, 255, 255, 0.1); }
.c1 { width: 600rpx; height: 600rpx; top: -200rpx; right: -200rpx; }
.c2 { width: 400rpx; height: 400rpx; bottom: 20%; left: -200rpx; }
.c3 { width: 300rpx; height: 300rpx; top: 30%; right: -100rpx; }

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
.nav-title-wrap { display: flex; align-items: center; gap: 12rpx; flex: 1; justify-content: center; }
.title-icon-pill {
  width: 56rpx; height: 56rpx;
  background: rgba(16, 185, 129, 0.12);
  border-radius: 14rpx;
  display: flex; align-items: center; justify-content: center;
  font-size: 26rpx;
}
.dark-mode .title-icon-pill { background: rgba(255, 255, 255, 0.15); }
.nav-title { font-size: 32rpx; font-weight: 700; color: #1f2937; }
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
.content-wrapper { padding: 32rpx; padding-bottom: 40rpx; }

/* ===== 区块通用样式 ===== */
.section { margin-bottom: 32rpx; }
.section-title {
  display: flex; align-items: center; gap: 12rpx;
  color: #1f2937; font-size: 28rpx; font-weight: 700;
  margin-bottom: 20rpx;
}
.dark-mode .section-title { color: #fff; }
.section-title::before {
  content: '';
  width: 6rpx; height: 28rpx;
  background: linear-gradient(180deg, #10b981, #34d399);
  border-radius: 3rpx;
}

/* ===== 废品网格 ===== */
.waste-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
}
.waste-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx 12rpx;
  display: flex; flex-direction: column; align-items: center;
  border: 2rpx solid rgba(16, 185, 129, 0.06);
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.waste-card:active { transform: scale(0.95); }
.dark-mode .waste-card { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.waste-card.selected {
  background: rgba(16, 185, 129, 0.08);
  border-color: #10b981;
  box-shadow: 0 4rpx 20rpx rgba(16, 185, 129, 0.2);
}
.dark-mode .waste-card.selected { background: rgba(16, 185, 129, 0.2); border-color: #34d399; }
.waste-icon { font-size: 44rpx; margin-bottom: 10rpx; }
.waste-name { color: #1f2937; font-size: 24rpx; font-weight: 700; margin-bottom: 6rpx; text-align: center; }
.dark-mode .waste-name { color: #fff; }
.waste-price { color: #10b981; font-size: 22rpx; font-weight: 600; }
.dark-mode .waste-price { color: #34d399; }

/* ===== 日期选择 ===== */
.date-tabs { display: flex; gap: 16rpx; }
.date-tab {
  flex: 1;
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  display: flex; flex-direction: column; align-items: center;
  border: 2rpx solid rgba(16, 185, 129, 0.06);
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.date-tab:active { transform: scale(0.97); }
.dark-mode .date-tab { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.date-tab.active {
  background: rgba(16, 185, 129, 0.08);
  border-color: #10b981;
  box-shadow: 0 4rpx 20rpx rgba(16, 185, 129, 0.2);
}
.dark-mode .date-tab.active { background: rgba(16, 185, 129, 0.2); border-color: #34d399; }
.date-label { color: #1f2937; font-size: 28rpx; font-weight: 700; margin-bottom: 8rpx; }
.dark-mode .date-label { color: #fff; }
.date-desc { color: #9ca3af; font-size: 22rpx; }

/* ===== 时间段网格 ===== */
.time-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
}
.time-slot {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx 12rpx;
  display: flex; flex-direction: column; align-items: center;
  border: 2rpx solid rgba(16, 185, 129, 0.06);
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.time-slot:active:not(.disabled) { transform: scale(0.97); }
.dark-mode .time-slot { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.time-slot.selected {
  background: rgba(16, 185, 129, 0.08);
  border-color: #10b981;
  box-shadow: 0 4rpx 20rpx rgba(16, 185, 129, 0.2);
}
.dark-mode .time-slot.selected { background: rgba(16, 185, 129, 0.2); border-color: #34d399; }
.time-slot.disabled { opacity: 0.4; }
.time-text { color: #1f2937; font-size: 26rpx; font-weight: 700; margin-bottom: 6rpx; }
.dark-mode .time-text { color: #fff; }
.time-status { color: #9ca3af; font-size: 20rpx; }
.time-slot:not(.disabled) .time-status { color: #10b981; font-weight: 600; }
.dark-mode .time-slot:not(.disabled) .time-status { color: #34d399; }

/* ===== 输入卡片 ===== */
.input-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(16, 185, 129, 0.08);
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
}
.dark-mode .input-card { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.input-field {
  color: #1f2937;
  font-size: 28rpx;
}
.dark-mode .input-field { color: #fff; }
.input-placeholder { color: #9ca3af; }
.dark-mode .input-placeholder { color: rgba(255, 255, 255, 0.5); }
.textarea-card { padding: 20rpx 24rpx; }
.textarea-field {
  color: #1f2937;
  font-size: 28rpx;
  width: 100%;
  min-height: 160rpx;
  line-height: 1.7;
}
.dark-mode .textarea-field { color: #fff; }

/* ===== 预估收益卡片 ===== */
.estimate-card {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(52, 211, 153, 0.05) 100%);
  border: 1rpx solid rgba(16, 185, 129, 0.15);
  border-radius: 20rpx;
  padding: 28rpx;
  margin-bottom: 32rpx;
}
.dark-mode .estimate-card {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.2);
}
.estimate-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8rpx; }
.estimate-label { color: #6b7280; font-size: 26rpx; }
.dark-mode .estimate-label { color: rgba(255, 255, 255, 0.7); }
.estimate-amount { color: #10b981; font-size: 48rpx; font-weight: 800; }
.dark-mode .estimate-amount { color: #34d399; }
.estimate-note { color: #9ca3af; font-size: 22rpx; }
.dark-mode .estimate-note { color: rgba(255, 255, 255, 0.5); }

/* ===== 提交按钮（统一绿渐变） ===== */
.submit-section { padding-top: 12rpx; }
.submit-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  border-radius: 20rpx;
  padding: 28rpx;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.35);
  transition: all 0.3s;
}
.submit-btn:active:not(.disabled) { transform: scale(0.98); }
.submit-btn.disabled { opacity: 0.6; }
.submit-text { color: #fff; font-size: 32rpx; font-weight: 700; letter-spacing: 2rpx; }
</style>
