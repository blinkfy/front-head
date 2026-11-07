<template>
  <view class="booking-page" :class="{ 'dark-mode': isDark }">
    <AppConfirmDialog ref="appConfirmDialog" />
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
        <view v-if="draftId" class="section draft-status">
          <text v-if="draftLoading">正在加载预约草稿…</text>
          <template v-else-if="draftError">
            <text>{{ draftError }}</text>
            <button :disabled="submitting" @click="loadBookingDraft()">重新加载草稿</button>
          </template>
          <template v-else-if="draftReceipt">
            <text class="section-title">预约已提交</text>
            <text>订单号：{{ draftReceipt.orderNo }}</text>
            <text>{{ draftReceipt.appointmentDate }} {{ draftReceipt.appointmentTimeSlot }}</text>
            <text>{{ draftReceipt.address }}</text>
            <text>这是提交回执，最新进度请查看回收订单。</text>
            <button @click="goToOrders">查看回收订单</button>
          </template>
          <template v-else-if="draftExpired">
            <text>预约草稿{{ draft?.status === 'cancelled' ? '已取消' : '已过期' }}，尚未创建订单。</text>
            <button :disabled="submitting" @click="recreateBookingDraft">重新准备预约</button>
          </template>
          <text v-else>请核对物品、重量和日期，选择可用时段后确认。当前尚未创建订单。</text>
        </view>
        <view v-if="!draftId || (draft && !draftLoading && !draftError && !draftReceipt && !draftExpired)" :class="{ 'booking-form-busy': submitting }">

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

        <view class="section">
          <view class="section-title">回收服务覆盖</view>
          <view v-if="catalogLoading" class="time-feedback">正在核验该地址的服务排班…</view>
          <view v-else-if="catalogError" class="time-feedback">{{ catalogError }}<button @click="loadServiceAreas">重新加载</button></view>
          <text v-else-if="!bookingPoint" class="estimate-note">请点击地图选址确认上门位置，系统将按圆形或多边形边界匹配服务范围。修改地址后需重新选址。</text>
          <text v-else-if="!selectedServiceArea" class="estimate-note">该上门位置暂无已审核服务范围与排班覆盖，暂不能预约。</text>
          <text v-else class="estimate-note">该地址匹配 {{ matchingAreas.length }} 个服务范围，请继续选择品类、日期与可用时段。</text>
          <text v-if="bookingPoint" class="estimate-note">边界已预留 {{ bookingTolerance }} 米定位容差。请核对实际上门位置，定位偏差较大时可重新选址。</text>
        </view>

        <RecyclingServiceMap v-if="bookingPoint && matchingAreas.length" :areas="matchingAreas" :point="bookingPoint" readonly />

        <!-- 回收物品类型网格 -->
        <view class="section">
          <view class="section-title">选择回收物品</view>
          <text v-if="!allowedWasteTypes.length" class="estimate-note">地址有服务覆盖后，将显示该地区回收员支持的品类。</text>
          <view class="waste-grid">
            <view
              v-for="item in allowedWasteTypes"
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

        <view v-if="selectedWasteItems.length" class="section">
          <view class="section-title">预估重量（公斤）</view>
          <view v-for="item in selectedWasteItems" :key="item.id" class="booking-weight-row">
            <text>{{ item.name }}</text>
            <input v-model="itemWeights[item.id]" type="digit" maxlength="8" :disabled="submitting" placeholder="公斤" />
          </view>
          <text class="estimate-note">填写预估重量，实际以回收员现场称重为准。</text>
        </view>

        <view v-if="unavailableWasteItems.length" class="section">
          <view class="section-title">这些物品在当前地址暂无服务，请移除后重新选择</view>
          <view v-for="item in unavailableWasteItems" :key="item.id" class="booking-weight-row">
            <text>{{ item.name }}</text>
            <button size="mini" :disabled="submitting" @click="toggleWasteType(item)">移除</button>
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
            <picker mode="date" :value="dateValues.custom || dateValues.today" :start="dateValues.today" :end="maxBookingDate" :disabled="submitting" @change="chooseCustomDate">
              <view :class="['date-tab', selectedDate === 'custom' ? 'active' : '']">
                <text class="date-label">其他日期</text>
                <text class="date-desc">{{ dateValues.custom || '未来30天' }}</text>
              </view>
            </picker>
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
          <view v-else-if="!timeSlots.length" class="time-feedback">当天暂无符合所选品类的排班，可以选择其他日期。</view>
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
              <text class="time-status">{{ slot.available ? '可预约' : '暂无名额' }}</text>
            </view>
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
            <text class="estimate-amount">¥{{ estimateAmount.toFixed(2) }}</text>
          </view>
          <text class="estimate-note">实际收益以回收员现场称重为准</text>
        </view>

        <!-- 预约按钮 -->
        <view class="submit-section">
          <view
            :class="['submit-btn', submitting || addressBusy ? 'disabled' : '']"
            @click="submitBooking"
          >
            <text class="submit-text">{{ submitting ? '提交中...' : (draftId ? '确认并提交预约' : '立即预约') }}</text>
          </view>
        </view>

        </view>
        <button class="collector-entry" @click="goCollectorApply">
          <view class="collector-entry-copy">
            <text class="collector-entry-title">成为回收员</text>
            <text class="collector-entry-note">申请提供上门回收服务</text>
          </view>
          <text class="collector-entry-arrow">›</text>
        </button>
      </view>
    </scroll-view>

  </view>
</template>

<script>
import { getWasteTypes, createBooking, getAvailableTimeSlots } from '@/pages-nonTheme/api/booking.js';
import { recyclingCatalog, mutationData } from './api/recycling.js';
import { getUserProfile, updateUserProfile } from '@/api/user.js';
import AppConfirmDialog from '@/components/AppConfirmDialog.vue';
import ManifestIcon from '@/components/ManifestIcon.vue';
import ShopRegionPicker from './components/ShopRegionPicker.vue';
import RecyclingServiceMap from './components/RecyclingServiceMap.vue';
import { coversServiceLocation, bookingToleranceMeters, normalizePoint, gcj02ToWgs84 } from './utils/recycling-geometry.mjs';
import ShopAddressPicker from '@/pages-nonTheme/components/shop/ShopAddressPicker.vue';
import { splitShopAddress, composeShopAddress } from './utils/shop-address.js';
import { playUiSound } from '@/utils/ui-sounds.js';
import { formatBookingDate } from './utils/booking-date.mjs';
import { bookingDraftMethods } from './utils/booking-draft-methods.js';

export default {
  components: { AppConfirmDialog, ManifestIcon, ShopRegionPicker, ShopAddressPicker, RecyclingServiceMap },
  data() {
    return {
      draftId: '', draft: null, draftLoading: false, draftError: '', draftExpired: false, draftReceipt: null, replacementRequestId: '',
      itemWeights: {}, maxBookingDate: '',
      wasteTypes: [], serviceAreas: [], serviceAreaId: null, catalogError: '', catalogLoading: false, bookingInitialized: false, addressCoordinates: null, bookingWrites: {},
      selectedTypes: [],
      selectedDate: 'today',
      selectedTimeSlot: '',
      timeSlots: [],
      timeSlotsLoading: false,
      timeSlotsError: '',
      timeSlotsRequestId: 0,
      timeSlotsDate: '', timeSlotsSelectionKey: '',
      dateValues: { today: '', tomorrow: '', custom: '' },
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
  async onLoad(options = {}) {
    this.draftId = typeof options.draftId === 'string' ? options.draftId : '';
    this.draftLoading = !!this.draftId;
    this.checkTheme();
    this.initDates();
    await Promise.all([this.loadWasteTypes(), this.loadContactPhone(), this.loadAddress(), this.loadServiceAreas()]);
    this.bookingInitialized = true;
    if (this.draftId) await this.loadBookingDraft();
    else this.syncServiceCoverage();
  },
  onShow() {
    this.checkTheme();
    if (this.dateValues.today && this.dateValues.today !== formatBookingDate(new Date())) {
      this.initDates();
      this.selectedTimeSlot = '';
      this.loadTimeSlots();
    }
  },
  // #ifdef APP-PLUS
  onBackPress(event) {
    if (event.from === 'backbutton' && this.$refs.appConfirmDialog?.current) {
      this.$refs.appConfirmDialog.settle(false);
      return true;
    }
  },
  // #endif
  onHide() { this.$refs.appConfirmDialog?.cancelAll(); },
  onUnload() { this.$refs.appConfirmDialog?.cancelAll(); this.timeSlotsRequestId++; },
  computed: {
    selectedServiceArea() { return this.serviceAreas.find(area => Number(area.id) === Number(this.serviceAreaId)); },
    addressRegionComplete() { return this.addressRegion.length === 3 && this.addressRegion.every(part => String(part || '').trim()); },
    bookingSelectionKey() { return JSON.stringify([this.serviceAreaId, this.address, this.bookingPoint, this.dateValues[this.selectedDate], [...this.selectedTypes].map(Number).sort((a, b) => a - b)]); },
    bookingPoint() { const p = this.addressCoordinates; const point = p?.address === this.address && p.coordinateSystem === 'wgs84' ? normalizePoint(p) : null; return point ? { ...point, ...(Number.isFinite(p.accuracyMeters) && p.accuracyMeters >= 0 ? { accuracyMeters: Math.min(200, p.accuracyMeters) } : {}) } : null; },
    bookingTolerance() { return bookingToleranceMeters(this.bookingPoint?.accuracyMeters); },
    matchingAreas() { return this.bookingPoint ? this.serviceAreas.filter(area => area.geometry && coversServiceLocation(area.geometry, this.bookingPoint)) : []; },
    allowedWasteTypes() { const ids = [...new Set(this.matchingAreas.flatMap(area => area.typeIds || []))]; return this.wasteTypes.filter(item => ids.map(Number).includes(Number(item.id))); },
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
    unavailableWasteItems() {
      return this.selectedTypes.filter(id => !this.allowedWasteTypes.some(item => Number(item.id) === Number(id))).map(id => ({
        id, name: this.draft?.snapshot?.details?.find(item => Number(item.typeId) === id)?.name || `回收物品 ${id}`
      }));
    },
    selectedWasteItems() {
      return this.allowedWasteTypes.filter(t => this.selectedTypes.includes(t.id));
    }
  },
  watch: {
    addressRegion: { handler() { this.syncServiceCoverage(); }, deep: true },
    address(value) { if (this.addressCoordinates && this.addressCoordinates.address !== value) this.addressCoordinates = null; this.syncServiceCoverage(); },
    itemWeights: { handler() { this.calculateEstimate(); }, deep: true },
    selectedTypes: {
      handler() {
        this.calculateEstimate();
        if (this.bookingInitialized && !this.draftLoading && !this.submitting) this.loadTimeSlots();
      },
      deep: true
    }
  },
  methods: {
    ...bookingDraftMethods,
    async loadServiceAreas() {
      this.catalogError = ''; this.catalogLoading = true;
      try { const catalog = await recyclingCatalog(); this.serviceAreas = catalog.areas || []; }
      catch (e) { this.catalogError = e.message || '服务覆盖加载失败'; this.serviceAreas = []; }
      finally { this.catalogLoading = false; this.syncServiceCoverage(); }
    },
    syncServiceCoverage() {
      const matched = this.matchingAreas[0];
      this.serviceAreaId = matched?.id || null;
      this.calculateEstimate();
      if (this.bookingInitialized && !this.draftLoading && !this.submitting) this.loadTimeSlots();
    },
    chooseCustomDate(event) {
      this.dateValues.custom = event.detail.value;
      this.selectDate('custom');
    },
    applyLocatedAddress(selection) {
      if (this.submitting || !selection) return;
      const parsed = splitShopAddress(selection.address, selection.parts);
      this.addressRegion = parsed.region;
      this.addressDetail = parsed.detail;
      let point = normalizePoint({ latitude: Number(selection.latitude), longitude: Number(selection.longitude) });
      if (point && selection.coordinateSystem === 'gcj02') point = gcj02ToWgs84(point);
      else if (selection.coordinateSystem !== 'wgs84') point = null;
      this.addressCoordinates = point && selection.latitude != null && selection.longitude != null ? { ...point, address: this.address, coordinateSystem: 'wgs84', ...(Number.isFinite(selection.accuracy) && selection.accuracy >= 0 ? { accuracyMeters: Math.min(200, selection.accuracy) } : {}) } : null;
      this.syncServiceCoverage();
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
    goCollectorApply() { uni.navigateTo({ url: '/pages-nonTheme/collector-apply' }); },
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
      this.dateValues = { today: formatBookingDate(today), tomorrow: formatBookingDate(tomorrow), custom: this.dateValues.custom || '' };
      const last = new Date(today); last.setDate(last.getDate() + 30);
      this.maxBookingDate = formatBookingDate(last);
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
      this.timeSlotsDate = ''; this.timeSlotsSelectionKey = '';
      const selectionKey = this.bookingSelectionKey;
      if (!this.serviceAreaId) { this.timeSlotsLoading = false; this.timeSlotsError = this.bookingPoint ? '该上门位置暂无已审核范围与排班覆盖' : '请通过地图选择上门位置'; return; }
      if (!this.selectedTypes.length) { this.timeSlotsLoading = false; this.timeSlotsError = '请先选择回收物品，再查询可预约时段'; return; }
      try {
        const res = await getAvailableTimeSlots(dateStr, this.serviceAreaId, this.selectedTypes, { addressLat: this.bookingPoint.latitude, addressLng: this.bookingPoint.longitude, addressCoordinateSystem: 'wgs84', ...(this.bookingPoint.accuracyMeters != null ? { addressAccuracy: this.bookingPoint.accuracyMeters } : {}) });
        if (requestId !== this.timeSlotsRequestId) return;
        const data = this.extractData(res);
        this.timeSlots = Array.isArray(data)
          ? data.map((slot) => ({
              ...slot,
              time: slot.slot || slot.time || ''
            }))
          : [];
        this.timeSlotsDate = dateStr; this.timeSlotsSelectionKey = selectionKey;
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
        if (this.itemWeights[item.id] == null) this.itemWeights[item.id] = 1;
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
    calculateEstimate() {
      // Unit prices are already loaded; typing a weight never makes an extra backend request.
      this.estimateAmount = this.selectedWasteItems.reduce((sum, item) => {
        const weight = Number(this.itemWeights[item.id] ?? 1);
        return sum + (Number.isFinite(weight) && weight > 0 ? item.price * weight : 0);
      }, 0);
    },
    validateBookingForm() {
      if (!this.selectedServiceArea) { uni.showToast({ title: this.bookingPoint ? '该上门位置暂无有效范围与排班覆盖' : '请通过地图选择上门位置', icon: 'none' }); return false; }
      if (this.selectedServiceArea.bounds && (!this.addressCoordinates || this.addressCoordinates.address !== this.address)) { uni.showToast({ title: '该区域需地图核验地址，请重新定位或地图选址', icon: 'none' }); return false; }
      if (this.selectedTypes.some(id => !this.allowedWasteTypes.some(type => Number(type.id) === Number(id)))) { uni.showToast({ title: '所选品类不在该区域服务范围，请重新选择', icon: 'none' }); return false; }
      if (this.dateValues.today !== formatBookingDate(new Date())) {
        this.initDates();
        this.selectedTimeSlot = '';
        this.loadTimeSlots();
        uni.showToast({ title: '日期已更新，请重新选择时段', icon: 'none' });
        return false;
      }
      if (this.timeSlotsLoading || this.timeSlotsError || this.timeSlotsDate !== this.dateValues[this.selectedDate] || this.timeSlotsSelectionKey !== this.bookingSelectionKey) {
        uni.showToast({ title: this.timeSlotsLoading ? '正在加载时段，请稍候' : '请先重新加载预约时段', icon: 'none' });
        return false;
      }
      if (this.selectedTypes.length === 0) {
        uni.showToast({ title: '请选择回收物品', icon: 'none' });
        return false;
      }
      if (!this.selectedTimeSlot) {
        uni.showToast({ title: '请选择时间段', icon: 'none' });
        return false;
      }
      if (this.addressBusy) {
        uni.showToast({ title: '请等待附近地址选择完成', icon: 'none' });
        return false;
      }
      if (!this.selectedServiceArea.geometry && !this.addressRegion.every(part => String(part || '').trim())) {
        uni.showToast({ title: '请完善所在地区（省、市、区）', icon: 'none' });
        return false;
      }
      if (!this.addressDetail.trim()) {
        uni.showToast({ title: '请输入详细地址（街道、小区及门牌号）', icon: 'none' });
        return false;
      }
      if (!this.contactPhone.trim()) {
        uni.showToast({ title: '请输入联系方式', icon: 'none' });
        return false;
      }
      if (!this.isValidPhone(this.contactPhone)) {
        uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return false;
      }
      if (this.selectedTypes.some(id => !this.wasteTypes.some(type => type.id === id))) {
        uni.showToast({ title: '部分回收物品已停用，请重新选择', icon: 'none' }); return false;
      }
      if (this.selectedTypes.some(id => {
        const weight = Number(this.itemWeights[id] ?? 1);
        return !Number.isFinite(weight) || weight <= 0 || weight > 10000 || Math.abs(weight * 100 - Math.round(weight * 100)) > 0.00001;
      })) {
        uni.showToast({ title: '请填写有效的预估重量，最多两位小数', icon: 'none' }); return false;
      }
      return true;
    },
    async submitBooking() {
      if (this.submitting) return;
      if (this.draftId) return this.submitDraftBooking();
      if (!this.validateBookingForm()) return;
      this.submitting = true;
      try {
        const response = await createBooking(mutationData(this.bookingWrites, 'create', this.getBookingPayload()));
        const booking = response?.data || response;
        delete this.bookingWrites.create;
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
.draft-status text { display: block; margin-bottom: 12rpx; font-size: 26rpx; line-height: 1.6; overflow-wrap: anywhere; }
.draft-status button { margin-top: 16rpx; font-size: 26rpx; }
.booking-weight-row { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-bottom: 16rpx; }
.booking-weight-row input { width: 180rpx; height: 76rpx; line-height: 76rpx; padding: 0 16rpx; box-sizing: border-box; border: 1rpx solid #d1d5db; border-radius: 12rpx; font-size: 28rpx; text-align: right; }
.booking-form-busy { pointer-events: none; opacity: .7; }

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
.nav-left, .orders-nav-right { flex-basis: 160rpx; }
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

.collector-entry {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; margin: 48rpx 0 0; padding: 28rpx 4rpx 0;
  border: 0; border-top: 1rpx solid rgba(148, 163, 184, 0.2); border-radius: 0;
  background: transparent; text-align: left; line-height: 1.5;
}
.collector-entry::after { border: 0; }
.collector-entry-copy { display: flex; flex-direction: column; gap: 6rpx; }
.collector-entry-title { color: #64748b; font-size: 26rpx; font-weight: 500; }
.collector-entry-note { color: #94a3b8; font-size: 22rpx; }
.collector-entry-arrow { color: #94a3b8; font-size: 36rpx; padding-left: 24rpx; }
.collector-entry:active { opacity: 0.65; }
.dark-mode .collector-entry { border-top-color: rgba(148, 163, 184, 0.22); }
.dark-mode .collector-entry-title { color: #cbd5e1; }
.dark-mode .collector-entry-note, .dark-mode .collector-entry-arrow { color: #94a3b8; }

</style>
