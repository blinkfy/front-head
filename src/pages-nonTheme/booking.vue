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
          <ManifestIcon id="back" class="back-icon" :scale="1" />
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill"><ManifestIcon id="recycling_booking" /></view>
          <text class="nav-title">预约回收</text>
        </view>
        <view class="nav-right orders-nav-right">
          <view class="action-icon-btn recycling-orders-entry" @click="goToOrders">
            <ManifestIcon class="nav-action-icon" id="reservation_order_table" />
            <text class="nav-action-label">回收订单</text>
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
          <view v-if="timeSlotsLoading" class="time-feedback" role="status">正在加载可预约时段…</view>
          <view v-else-if="timeSlotsError" class="time-feedback" role="alert">
            <text>{{ timeSlotsError }}</text>
            <button class="time-retry" @click="loadTimeSlots">重新加载</button>
          </view>
          <view v-else-if="!timeSlots.length" class="time-feedback">当天暂无可预约时段，可以选择其他日期。</view>
          <view v-else class="time-grid">
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
          <view class="input-card booking-address-card">
            <view class="address-field-group">
              <text class="address-field-label">所在地区</text>
              <ShopRegionPicker v-model="addressRegion" :disabled="submitting || addressBusy" />
            </view>
            <view class="address-field-group address-detail-group">
              <text class="address-field-label">详细地址</text>
              <input
                v-model="addressDetail"
                class="input-field address-detail-input"
                placeholder="街道、小区、楼栋及门牌号"
                placeholder-class="input-placeholder"
                :disabled="submitting || addressBusy"
              />
            </view>
            <ShopAddressPicker
              :model-value="address"
              :auto-locate="addressReady"
              :disabled="submitting"
              @select="applyLocatedAddress"
              @busy-change="addressBusy = $event"
            />
          </view>
        </view>

        <!-- 联系方式输入 -->
        <view class="section">
          <view class="section-title">联系方式</view>
          <view class="input-card">
            <input
              v-model="contactPhone"
              class="input-field"
              type="number"
              maxlength="11"
              placeholder="请输入联系电话"
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
            <text class="estimate-amount">¥{{ estimateAmount.toFixed(2) }}/kg</text>
          </view>
          <text class="estimate-note">实际收益以回收员现场称重为准</text>
        </view>

        <!-- 预约按钮 -->
        <view class="submit-section">
          <view
            :class="['submit-btn', submitting || addressBusy ? 'disabled' : '']"
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
import { getWasteTypes, createBooking, getAvailableTimeSlots, estimatePrice } from '@/pages-nonTheme/api/booking.js';
import { getUserProfile, updateUserProfile } from '@/api/user.js';
import ManifestIcon from '@/components/ManifestIcon.vue';
import ShopRegionPicker from './components/ShopRegionPicker.vue';
import ShopAddressPicker from '@/pages-nonTheme/components/shop/ShopAddressPicker.vue';
import { splitShopAddress, composeShopAddress } from './utils/shop-address.js';
import { playUiSound } from '@/utils/ui-sounds.js';
import { formatBookingDate } from './utils/booking-date.mjs';

export default {
  components: { ManifestIcon, ShopRegionPicker, ShopAddressPicker },
  data() {
    return {
      wasteTypes: [],
      selectedTypes: [],
      selectedDate: 'today',
      selectedTimeSlot: '',
      timeSlots: [],
      timeSlotsLoading: false,
      timeSlotsError: '',
      timeSlotsRequestId: 0,
      timeSlotsDate: '',
      dateValues: { today: '', tomorrow: '' },
      addressRegion: ['', '', ''],
      addressDetail: '',
      addressBusy: false,
      addressReady: false,
      contactPhone: '',
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
    this.loadContactPhone();
    this.loadAddress();
  },
  onShow() {
    this.checkTheme();
    if (this.dateValues.today && this.dateValues.today !== formatBookingDate(new Date())) {
      this.initDates();
      this.selectedTimeSlot = '';
      this.loadTimeSlots();
    }
  },
  onUnload() { this.timeSlotsRequestId++; },
  computed: {
    address: {
      get() {
        return composeShopAddress(this.addressRegion, this.addressDetail);
      },
      set(full) {
        const parsed = splitShopAddress(full);
        this.addressRegion = parsed.region;
        this.addressDetail = parsed.detail;
      }
    },
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
    applyLocatedAddress(selection) {
      if (this.submitting || !selection) return;
      const parsed = splitShopAddress(selection.address, selection.parts);
      this.addressRegion = parsed.region;
      this.addressDetail = parsed.detail;
      uni.setStorageSync('bookingAddress', this.address);
    },
    extractData(res) {
      return res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res;
    },
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    async loadContactPhone() {
      const cachedPhone = String(uni.getStorageSync('userPhone') || '').trim();
      if (cachedPhone) {
        this.contactPhone = cachedPhone;
        return;
      }
      try {
        const res = await getUserProfile();
        const data = this.extractData(res) || {};
        const phone = String(data.phone || '').trim();
        if (phone) {
          this.contactPhone = phone;
          uni.setStorageSync('userPhone', phone);
        }
      } catch (e) {
        console.warn('获取用户联系方式失败:', e);
      }
    },
    async loadAddress() {
      // 优先从缓存读取
      const cached = String(uni.getStorageSync('bookingAddress') || '').trim();
      if (cached) {
        if (!this.address.trim()) this.address = cached;
        this.addressReady = true;
        return;
      }
      try {
        const res = await getUserProfile();
        const data = this.extractData(res) || {};
        const loc = String(data.location || '').trim();
        if (loc && !this.address.trim()) {
          this.address = loc;
          uni.setStorageSync('bookingAddress', loc);
        }
      } catch (e) {
        console.warn('获取用户地址失败:', e);
      } finally {
        this.addressReady = true;
      }
    },
    isValidPhone(phone) {
      return /^1[3-9]\d{9}$/.test(String(phone || '').trim());
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
      this.dateValues = { today: formatBookingDate(today), tomorrow: formatBookingDate(tomorrow) };
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
      const requestId = ++this.timeSlotsRequestId;
      const dateStr = this.dateValues[this.selectedDate];
      this.timeSlotsLoading = true;
      this.timeSlotsError = '';
      this.timeSlots = [];
      this.selectedTimeSlot = '';
      this.timeSlotsDate = '';
      try {
        const res = await getAvailableTimeSlots(dateStr);
        if (requestId !== this.timeSlotsRequestId) return;
        const data = this.extractData(res);
        this.timeSlots = Array.isArray(data)
          ? data.map((slot) => ({
              ...slot,
              time: slot.slot || slot.time || ''
            }))
          : [];
        this.timeSlotsDate = dateStr;
      } catch (e) {
        if (requestId !== this.timeSlotsRequestId) return;
        console.error('获取时间段失败:', e);
        this.timeSlots = [];
        this.timeSlotsError = '时段加载失败，请重新加载后选择。';
      } finally {
        if (requestId === this.timeSlotsRequestId) this.timeSlotsLoading = false;
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
      if (this.timeSlotsLoading || this.timeSlotsError) return;
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
      if (this.dateValues.today !== formatBookingDate(new Date())) {
        this.initDates();
        this.selectedTimeSlot = '';
        this.loadTimeSlots();
        uni.showToast({ title: '日期已更新，请重新选择时段', icon: 'none' });
        return;
      }
      if (this.timeSlotsLoading || this.timeSlotsError || this.timeSlotsDate !== this.dateValues[this.selectedDate]) {
        uni.showToast({ title: this.timeSlotsLoading ? '正在加载时段，请稍候' : '请先重新加载预约时段', icon: 'none' });
        return;
      }
      if (this.selectedTypes.length === 0) {
        uni.showToast({ title: '请选择回收物品', icon: 'none' });
        return;
      }
      if (!this.selectedTimeSlot) {
        uni.showToast({ title: '请选择时间段', icon: 'none' });
        return;
      }
      if (this.addressBusy) {
        uni.showToast({ title: '请等待附近地址选择完成', icon: 'none' });
        return;
      }
      if (!this.addressRegion.every(part => String(part || '').trim())) {
        uni.showToast({ title: '请完善所在地区（省、市、区）', icon: 'none' });
        return;
      }
      if (!this.addressDetail.trim()) {
        uni.showToast({ title: '请输入详细地址（街道、小区及门牌号）', icon: 'none' });
        return;
      }
      if (!this.contactPhone.trim()) {
        uni.showToast({ title: '请输入联系方式', icon: 'none' });
        return;
      }
      if (!this.isValidPhone(this.contactPhone)) {
        uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return;
      }
      this.submitting = true;
      const dateStr = this.timeSlotsDate;
      try {
        const response = await createBooking({
          items: this.selectedTypes.map(id => ({ typeId: id, weight: 1 })),
          appointmentDate: dateStr,
          appointmentTimeSlot: this.selectedTimeSlot,
          address: this.address,
          contactPhone: this.contactPhone.trim(),
          notes: this.remark
        });
        const booking = response?.data || response;
        playUiSound('bookingSuccess', {
          key: booking?.id != null ? `booking:${booking.id}` : undefined,
          page: 'pages-nonTheme/booking'
        });
        uni.showToast({ title: '预约成功!', icon: 'success' });
        // 若用户信息中未填 phone/location，提交后自动同步到用户资料
        this.syncProfileAfterBooking();
        setTimeout(() => {
          this.goToOrders();
        }, 1500);
      } catch (e) {
        uni.showToast({ title: e.message || '预约失败', icon: 'none' });
      } finally {
        this.submitting = false;
      }
    },
    async syncProfileAfterBooking() {
      try {
        const res = await getUserProfile();
        const data = this.extractData(res) || {};
        const payload = {};
        // 用户信息中 phone 为空 → 同步
        if (!String(data.phone || '').trim() && this.contactPhone.trim()) {
          payload.phone = this.contactPhone.trim();
        }
        // 用户信息中 location 为空 → 同步
        if (!String(data.location || '').trim() && this.address.trim()) {
          payload.location = this.address.trim();
        }
        if (Object.keys(payload).length > 0) {
          await updateUserProfile(payload);
          // 更新缓存
          if (payload.phone) uni.setStorageSync('userPhone', payload.phone);
          if (payload.location) uni.setStorageSync('bookingAddress', payload.location);
        }
      } catch (e) {
        console.warn('同步资料到用户信息失败:', e);
      }
    }
  }
};
</script>

<style scoped>
.time-feedback { padding: 24rpx 8rpx; color: #536678; font-size: 26rpx; line-height: 1.6; text-align: center; }
.time-retry { margin: 16rpx auto 0; width: 200rpx; border: 0; border-radius: 40rpx; background: #e4f8ee; color: #087b54; font-size: 26rpx; line-height: 72rpx; }
.time-retry::after { border: 0; }
.dark-mode .time-feedback { color: #b4c9d8; }
.dark-mode .time-retry { background: #153e36; color: #8be6ba; }
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
  background:
    radial-gradient(circle at 16% 10%, rgba(56, 189, 248, 0.2) 0%, transparent 34%),
    radial-gradient(circle at 86% 18%, rgba(16, 185, 129, 0.18) 0%, transparent 34%),
    radial-gradient(circle at 70% 82%, rgba(245, 158, 11, 0.1) 0%, transparent 36%),
    linear-gradient(180deg, #07111f 0%, #0f172a 46%, #101827 100%);
}

/* ===== 背景效果 ===== */
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.booking-page.dark-mode .bg-effects::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.045) 1rpx, transparent 1rpx),
    linear-gradient(90deg, rgba(148, 163, 184, 0.035) 1rpx, transparent 1rpx);
  background-size: 64rpx 64rpx;
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.08));
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.08));
}
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s; }
.booking-page:not(.dark-mode) .bg-circle { background: #10b981; }
.booking-page.dark-mode .bg-circle { opacity: 0.18; filter: blur(10rpx); }
.booking-page.dark-mode .c1 { background: rgba(56, 189, 248, 0.42); }
.booking-page.dark-mode .c2 { background: rgba(16, 185, 129, 0.4); }
.booking-page.dark-mode .c3 { background: rgba(245, 158, 11, 0.22); }
.c1 { width: 600rpx; height: 600rpx; top: -200rpx; right: -200rpx; }
.c2 { width: 400rpx; height: 400rpx; bottom: 20%; left: -200rpx; }
.c3 { width: 300rpx; height: 300rpx; top: 30%; right: -100rpx; }

/* ===== 导航栏 ===== */
.navbar { position: relative; z-index: 10; }
.safe-area-top { height: env(safe-area-inset-top); min-height: 44rpx; }
.nav-content {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 32rpx;
  height: 136rpx; box-sizing: border-box;
}
.back-icon { font-size: 48rpx; font-weight: 600; padding: 8rpx; color: #1f2937; }
.dark-mode .back-icon { color: #fff; filter: brightness(0) invert(1); }
.dark-mode .navbar .nav-right .nav-action-icon {
  filter: saturate(1.2) brightness(1.08) drop-shadow(0 0 4rpx rgba(255, 255, 255, 0.4));
}
.nav-left, .nav-right { flex: 0 0 80rpx; }
.orders-nav-right { flex-basis: 160rpx; }
.nav-right { display: flex; justify-content: flex-end; }
.nav-title-wrap { display: flex; align-items: center; gap: 12rpx; flex: 1; justify-content: center; }
.title-icon-pill {
  width: 56rpx; height: 56rpx;
  background: rgba(16, 185, 129, 0.12);
  border-radius: 14rpx;
  display: flex; align-items: center; justify-content: center;
  font-size: 32rpx;
}
.dark-mode .title-icon-pill { background: rgba(255, 255, 255, 0.15); }
.nav-title { font-size: 32rpx; font-weight: 700; color: #1f2937; }
.dark-mode .nav-title { color: #fff; }
.action-icon-btn {
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.12);
  display: flex; align-items: center; justify-content: center;
  font-size: 34rpx;
  transition: all 0.3s;
}
.action-icon-btn:active { transform: scale(0.92); }
.dark-mode .action-icon-btn { background: rgba(255, 255, 255, 0.15); }
.recycling-orders-entry {
  width: auto;
  height: auto;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  gap: 8rpx;
}
.recycling-orders-entry .nav-action-icon { font-size: 28rpx; }
.nav-action-label { color: #059669; font-size: 22rpx; white-space: nowrap; }
.dark-mode .nav-action-label { color: #a7f3d0; }

/* ===== 主内容区 ===== */
.main-scroll {
  position: relative;
  z-index: 10;
  height: calc(100vh - 180rpx);
  height: calc(100vh - max(env(safe-area-inset-top), 44rpx) - 136rpx);
}
.content-wrapper { padding: 32rpx; padding-bottom: calc(120rpx + env(safe-area-inset-bottom)); }

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

.booking-address-card {
  --shop-card: #fff;
  --shop-text: #1f2937;
  --shop-muted: #9ca3af;
  --shop-line: rgba(16, 185, 129, 0.16);
  --shop-soft: rgba(16, 185, 129, 0.08);
  --shop-green: #059669;
}
.dark-mode .booking-address-card {
  --shop-card: #172334;
  --shop-text: #f8fafc;
  --shop-muted: #a8b4c4;
  --shop-line: rgba(148, 163, 184, 0.28);
  --shop-soft: rgba(16, 185, 129, 0.16);
  --shop-green: #6ee7b7;
}
.address-field-group { margin-bottom: 20rpx; }
.address-detail-group { padding-top: 16rpx; border-top: 1rpx solid var(--shop-line); }
.address-field-label { display: block; margin-bottom: 12rpx; color: var(--shop-muted); font-size: 23rpx; }
.address-detail-input { width: 100%; min-height: 72rpx; color: var(--shop-text); }
.address-detail-input[disabled] { opacity: 0.55; }
.input-placeholder { color: var(--shop-muted); }
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

/* ===== 预约按钮（统一绿渐变） ===== */
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
