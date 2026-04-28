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
            <view class="location-wrapper">
              <input
                v-model="address"
                class="input-field location-field"
                placeholder="请输入详细地址"
                placeholder-class="input-placeholder"
              />
              <view class="location-action" @click="selectLocation">
                <text>📍</text>
              </view>
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
            <text class="estimate-amount">¥{{ estimateAmount.toFixed(2) }}/kg</text>
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

    <!-- H5 地图选点弹窗 -->
    <view v-if="showMapPicker" class="map-picker-overlay" @click.self="closeMapPicker">
      <view class="map-picker-modal">
        <view class="map-picker-header">
          <text class="map-picker-title">选择位置</text>
          <text class="map-picker-close" @click="closeMapPicker">✕</text>
        </view>
        <view class="map-picker-search">
          <input
            v-model="mapSearchQuery"
            type="text"
            placeholder="搜索地址..."
            class="map-search-input"
            @confirm="searchAddress"
          />
          <text class="map-search-btn" @click="searchAddress">搜索</text>
        </view>
        <view class="map-picker-body">
          <view id="map-container" class="map-container"></view>
          <view class="map-center-marker">📍</view>
        </view>
        <view class="map-picker-footer">
          <view class="map-selected-addr">
            <text class="map-addr-label">已选：</text>
            <text class="map-addr-text">{{ mapSelectedAddress || '请在地图上点击选择位置' }}</text>
          </view>
          <view class="map-picker-actions">
            <view class="map-btn map-btn-cancel" @click="closeMapPicker">取消</view>
            <view class="map-btn map-btn-confirm" @click="confirmMapLocation">确认</view>
          </view>
        </view>
      </view>
    </view>

    <!-- App 附近地点弹窗 -->
    <view v-if="showNearbyPicker" class="nearby-picker-overlay" @click.self="closeNearbyPicker">
      <view class="nearby-picker-modal">
        <view class="nearby-picker-header">
          <text class="nearby-picker-title">选择附近地点</text>
          <text class="nearby-picker-close" @click="closeNearbyPicker">✕</text>
        </view>
        <view class="nearby-picker-search">
          <input
            v-model="nearbySearchQuery"
            type="text"
            placeholder="搜索小区/学校/写字楼..."
            class="nearby-search-input"
            @confirm="onNearbySearch"
          />
          <text class="nearby-search-btn" @click="onNearbySearch">搜索</text>
        </view>
        <view class="nearby-picker-body">
          <view v-if="nearbyLoading" class="nearby-loading">正在加载附近地点...</view>
          <view v-else-if="nearbyError" class="nearby-error">{{ nearbyError }}</view>
          <scroll-view v-else class="nearby-list" scroll-y>
            <view
              v-for="(item, idx) in nearbyResults"
              :key="`${item.id || item.uid || idx}`"
              class="nearby-item"
              @click="selectNearbyPlace(item)"
            >
              <text class="nearby-name">{{ item.title || item.name || '未命名地点' }}</text>
              <text class="nearby-addr">{{ item.address || item.addr || '' }}</text>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getWasteTypes, createBooking, getAvailableTimeSlots, estimatePrice } from '@/api/booking.js';
import { getUserProfile, updateUserProfile } from '@/api/user.js';
import { searchPlaces } from '@/api/map.js';

export default {
  data() {
    return {
      wasteTypes: [],
      selectedTypes: [],
      selectedDate: 'today',
      selectedTimeSlot: '',
      timeSlots: [],
      address: '',
      contactPhone: '',
      remark: '',
      estimateAmount: 0,
      submitting: false,
      todayStr: '',
      tomorrowStr: '',
      isDark: false,
      // H5 地图选点
      showMapPicker: false,
      mapSearchQuery: '',
      mapSelectedAddress: '',
      mapSelectedLat: null,
      mapSelectedLng: null,
      _mapInstance: null,
      _mapMarker: null,
      // App 附近地点选择
      showNearbyPicker: false,
      nearbySearchQuery: '',
      nearbyResults: [],
      nearbyLoading: false,
      nearbyError: '',
      nearbyLocation: null
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
        this.address = cached;
        return;
      }
      try {
        const res = await getUserProfile();
        const data = this.extractData(res) || {};
        const loc = String(data.location || '').trim();
        if (loc) {
          this.address = loc;
          uni.setStorageSync('bookingAddress', loc);
        }
      } catch (e) {
        console.warn('获取用户地址失败:', e);
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
      if (!this.contactPhone.trim()) {
        uni.showToast({ title: '请输入联系方式', icon: 'none' });
        return;
      }
      if (!this.isValidPhone(this.contactPhone)) {
        uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
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
          contactPhone: this.contactPhone.trim(),
          notes: this.remark
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
    formatLocationResult(res) {
      if (res && typeof res.addresses === 'string' && res.addresses.trim()) return res.addresses.trim();
      const address = res && res.address
      if (typeof address === 'string' && address.trim()) return address.trim()
      if (address && typeof address === 'object') {
        const detail = [
          address.province,
          address.city,
          address.district,
          address.street,
          address.streetNum,
          address.poiName
        ].filter(Boolean).join('')
        if (detail) return detail
      }
      const name = String((res && (res.name || res.addressName)) || '').trim()
      if (name) return name
      const lat = res && (res.latitude || (res.coords && res.coords.latitude))
      const lng = res && (res.longitude || (res.coords && res.coords.longitude))
      if (lat && lng) return `${lat},${lng}`
      return ''
    },
    isAppPlusPlatform() {
      const platform = uni.getSystemInfoSync().uniPlatform
      return platform === 'app' || platform === 'app-plus'
    },
    getAppCurrentLocation() {
      return new Promise((resolve, reject) => {
        if (typeof plus === 'undefined' || !plus.geolocation || typeof plus.geolocation.getCurrentPosition !== 'function') {
          reject(new Error('当前环境不支持原生定位'))
          return
        }
        plus.geolocation.getCurrentPosition(
          (position) => resolve(position),
          (error) => reject(error),
          {
            provider: 'system',
            geocode: false,
            timeout: 15000
          }
        )
      })
    },
    fillCurrentLocation() {
      uni.showLoading({ title: '定位中...' })
      const useNativeLocation = this.isAppPlusPlatform() && typeof plus !== 'undefined'
      const locationTask = useNativeLocation
        ? this.getAppCurrentLocation()
        : new Promise((resolve, reject) => {
            if (typeof uni.getLocation !== 'function') {
              reject(new Error('当前环境不支持定位'))
              return
            }
            uni.getLocation({
              type: 'gcj02',
              geocode: false,
              success: resolve,
              fail: reject
            })
          })

      locationTask
        .then((res) => {
          const locationText = this.formatLocationResult(res)
          const lat = res && (res.latitude || (res.coords && res.coords.latitude))
          const lng = res && (res.longitude || (res.coords && res.coords.longitude))

          // 如果获取到的地址只是一串经纬度，使用与 H5 选点同源的 OSM 接口进行强制兜底逆地理编码
          if (locationText && lat && lng && /^[-+]?\d+\.?\d+,\s*[-+]?\d+\.?\d+$/.test(locationText)) {
            uni.request({
              url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh`,
              header: { 'User-Agent': 'FenTouXia/1.0' },
              success: (geoRes) => {
                const data = geoRes.data;
                const finalAddr = (data && data.display_name) ? data.display_name : locationText;
                this.address = finalAddr;
                uni.setStorageSync('bookingAddress', this.address);
                uni.showToast({ title: '地址已更新', icon: 'success' });
              },
              fail: () => {
                this.address = locationText;
                uni.setStorageSync('bookingAddress', this.address);
                uni.showToast({ title: '地址已更新', icon: 'success' });
              }
            });
            return;
          }

          if (locationText) {
            this.address = locationText
            uni.setStorageSync('bookingAddress', this.address)
            uni.showToast({ title: '地址已更新', icon: 'success' })
          } else {
            uni.showToast({ title: '定位成功，请补充详细地址', icon: 'none' })
          }
        })
        .catch((err) => {
          console.warn('获取当前位置失败:', err)
          const message = this.isAppPlusPlatform()
            ? '定位失败，请检查系统定位权限'
            : '定位失败，请手动输入'
          uni.showToast({ title: message, icon: 'none' })
        })
        .finally(() => {
          uni.hideLoading()
        })
    },
    getCurrentCoords() {
      const useNativeLocation = this.isAppPlusPlatform() && typeof plus !== 'undefined'
      const locationTask = useNativeLocation
        ? this.getAppCurrentLocation()
        : new Promise((resolve, reject) => {
            if (typeof uni.getLocation !== 'function') {
              reject(new Error('当前环境不支持定位'))
              return
            }
            uni.getLocation({
              type: 'gcj02',
              geocode: false,
              success: resolve,
              fail: reject
            })
          })

      return locationTask.then((res) => {
        const lat = res && (res.latitude || (res.coords && res.coords.latitude))
        const lng = res && (res.longitude || (res.coords && res.coords.longitude))
        if (!lat || !lng) throw new Error('无法获取定位坐标')
        return { lat, lng }
      })
    },
    openNearbyPicker() {
      this.showNearbyPicker = true
      this.nearbySearchQuery = ''
      this.nearbyResults = []
      this.nearbyError = ''
      this.loadNearbyPlaces()
    },
    closeNearbyPicker() {
      this.showNearbyPicker = false
    },
    loadNearbyPlaces(keyword = '') {
      this.nearbyLoading = true
      this.nearbyError = ''
      this.getCurrentCoords()
        .then(({ lat, lng }) => {
          this.nearbyLocation = { lat, lng }
          const query = String(keyword || '').trim() || '小区'
          return searchPlaces(query, lat, lng, 2000)
        })
        .then((res) => {
          const list = Array.isArray(res && res.data) ? res.data : []
          this.nearbyResults = list
          if (!list.length) this.nearbyError = '附近没有找到可选地点'
        })
        .catch((err) => {
          this.nearbyError = (err && err.message) ? err.message : '加载附近地点失败'
        })
        .finally(() => {
          this.nearbyLoading = false
        })
    },
    onNearbySearch() {
      this.loadNearbyPlaces(this.nearbySearchQuery)
    },
    selectNearbyPlace(item) {
      const title = String(item && (item.title || item.name) || '').trim()
      const addr = String(item && (item.address || item.addr) || '').trim()
      let finalText = ''
      if (title && addr) {
        finalText = addr.includes(title) ? addr : `${title} ${addr}`
      } else {
        finalText = title || addr
      }
      if (!finalText && item && item.location && item.location.lat && item.location.lng) {
        finalText = `${item.location.lat},${item.location.lng}`
      }
      if (finalText) {
        this.address = finalText
        uni.setStorageSync('bookingAddress', this.address)
        uni.showToast({ title: '地址已更新', icon: 'success' })
      }
      this.closeNearbyPicker()
    },
    selectLocation() {
      const systemInfo = uni.getSystemInfoSync()
      const uniPlatform = systemInfo.uniPlatform

      // H5环境：打开地图选点弹窗
      if (uniPlatform === 'web') {
        this.openMapPicker()
        return
      }

      if (uniPlatform === 'app' || uniPlatform === 'app-plus') {
        this.openNearbyPicker()
        return
      }

      // 小程序端使用 uni 自带的地图选择
      if (typeof uni.chooseLocation === 'function') {
        uni.chooseLocation({
          success: (res) => {
            this.address = res.address || res.name || `${res.latitude},${res.longitude}`
            uni.setStorageSync('bookingAddress', this.address)
          },
          fail: () => {
            uni.showToast({ title: '定位失败，请手动输入', icon: 'none' })
          }
        })
      } else {
        uni.showToast({ title: '当前环境不支持地图选址，请手动输入', icon: 'none' })
      }
    },

    // ===== H5 地图选点弹窗 =====
    openMapPicker() {
      this.showMapPicker = true
      this.mapSearchQuery = ''
      this.mapSelectedAddress = this.address || ''
      this.mapSelectedLat = null
      this.mapSelectedLng = null

      setTimeout(() => {
        this.initMap()
      }, 300)
    },

    closeMapPicker() {
      this.showMapPicker = false
      if (this._mapInstance) {
        this._mapInstance.remove()
        this._mapInstance = null
        this._mapMarker = null
      }
    },

    initMap() {
      const container = document.getElementById('map-container')
      if (!container) return

      if (this._mapInstance) {
        this._mapInstance.remove()
        this._mapInstance = null
        this._mapMarker = null
      }

      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      if (typeof window.L === 'undefined') {
        const script = document.createElement('script')
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        script.onload = () => {
          this.createMap(container)
        }
        document.head.appendChild(script)
      } else {
        this.createMap(container)
      }
    },

    createMap(container) {
      const defaultCenter = [35.86, 104.19]
      let initialCenter = defaultCenter
      let initialZoom = 5

      if (this.address) {
        const coords = this.parseCoordsFromAddress(this.address)
        if (coords) {
          initialCenter = coords
          initialZoom = 15
        }
      }

      this._mapInstance = window.L.map(container, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: true
      })

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(this._mapInstance)

      this._mapInstance.on('click', (e) => {
        const { lat, lng } = e.latlng
        this.placeMarker(lat, lng)
        this.reverseGeocode(lat, lng)
      })

      if (this.address && !this.parseCoordsFromAddress(this.address)) {
        this.mapSearchQuery = this.address
        setTimeout(() => this.searchAddress(), 500)
      }
    },

    placeMarker(lat, lng) {
      if (this._mapMarker) {
        this._mapInstance.removeLayer(this._mapMarker)
      }
      this._mapMarker = window.L.marker([lat, lng], { draggable: true })
        .addTo(this._mapInstance)
        .bindPopup('所选位置')
        .openPopup()

      this.mapSelectedLat = lat
      this.mapSelectedLng = lng

      this._mapMarker.on('dragend', () => {
        const pos = this._mapMarker.getLatLng()
        this.mapSelectedLat = pos.lat
        this.mapSelectedLng = pos.lng
        this.reverseGeocode(pos.lat, pos.lng)
      })
    },

    async reverseGeocode(lat, lng) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh`,
          { headers: { 'User-Agent': 'FenTouXia/1.0' } }
        )
        const data = await res.json()
        this.mapSelectedAddress = data.display_name || `${lat},${lng}`
      } catch {
        this.mapSelectedAddress = `${lat},${lng}`
      }
    },

    async searchAddress() {
      const query = this.mapSearchQuery.trim()
      if (!query || !this._mapInstance) return

      uni.showLoading({ title: '搜索中...' })
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=zh`,
          { headers: { 'User-Agent': 'FenTouXia/1.0' } }
        )
        const results = await res.json()
        uni.hideLoading()

        if (results && results.length > 0) {
          const r = results[0]
          const lat = parseFloat(r.lat)
          const lng = parseFloat(r.lon)
          this._mapInstance.setView([lat, lng], 16)
          this.placeMarker(lat, lng)
          this.mapSelectedAddress = r.display_name
        } else {
          uni.showToast({ title: '未找到该地址', icon: 'none' })
        }
      } catch {
        uni.hideLoading()
        uni.showToast({ title: '搜索失败，请重试', icon: 'none' })
      }
    },

    parseCoordsFromAddress(addr) {
      if (!addr) return null
      const match = addr.match(/([-+]?\d+\.?\d+)\s*,\s*([-+]?\d+\.?\d+)/)
      if (match) {
        return [parseFloat(match[1]), parseFloat(match[2])]
      }
      return null
    },

    confirmMapLocation() {
      if (this.mapSelectedAddress) {
        this.address = this.mapSelectedAddress
      } else if (this.mapSelectedLat && this.mapSelectedLng) {
        this.address = `${this.mapSelectedLat},${this.mapSelectedLng}`
      }
      this.closeMapPicker()
      uni.setStorageSync('bookingAddress', this.address)
      uni.showToast({ title: '地址已更新', icon: 'success' })
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

/* 地址定位按钮 */
.location-wrapper {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.location-field {
  flex: 1;
}
.location-action {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28rpx;
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.3);
  flex-shrink: 0;
}
.location-action:active {
  transform: scale(0.95);
}
.dark-mode .location-action {
  background: #5B8DEE;
  box-shadow: 0 4rpx 12rpx rgba(91, 141, 238, 0.4);
}
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

/* ===== H5 地图选点弹窗 ===== */
.map-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30rpx;
}
.map-picker-modal {
  width: 100%;
  max-width: 700rpx;
  max-height: 85vh;
  background: #fff;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.3);
}
.map-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 30rpx;
  border-bottom: 1rpx solid #eee;
}
.map-picker-title { font-size: 32rpx; font-weight: 700; color: #1f2937; }
.map-picker-close { font-size: 36rpx; color: #999; padding: 10rpx; }
.map-picker-close:active { color: #333; }
.map-picker-search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 30rpx;
  border-bottom: 1rpx solid #eee;
}
.map-search-input {
  flex: 1;
  height: 64rpx;
  padding: 0 20rpx;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  font-size: 26rpx;
  color: #333;
  background: #f9f9f9;
}
.map-search-input:focus { border-color: #10b981; background: #fff; }
.map-search-btn {
  padding: 12rpx 24rpx;
  background: #10b981;
  color: #fff;
  border-radius: 10rpx;
  font-size: 26rpx;
  font-weight: 500;
  white-space: nowrap;
}
.map-search-btn:active { opacity: 0.8; }
.map-picker-body {
  position: relative;
  width: 100%;
  height: 600rpx;
  min-height: 400rpx;
}
.map-container { width: 100%; height: 100%; }
.map-center-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -100%);
  font-size: 48rpx;
  z-index: 1000;
  pointer-events: none;
  text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.3);
}
.map-picker-footer {
  padding: 20rpx 30rpx;
  border-top: 1rpx solid #eee;
  background: #fafafa;
}
.map-selected-addr {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  margin-bottom: 16rpx;
}
.map-addr-label { font-size: 24rpx; color: #666; white-space: nowrap; margin-top: 2rpx; }
.map-addr-text { font-size: 24rpx; color: #333; line-height: 1.5; word-break: break-all; }
.map-picker-actions { display: flex; gap: 16rpx; }
.map-btn {
  flex: 1;
  padding: 16rpx 0;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 600;
  text-align: center;
}
.map-btn-cancel { background: #f0f0f0; color: #666; }
.map-btn-cancel:active { background: #e0e0e0; }
.map-btn-confirm { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }
.map-btn-confirm:active { opacity: 0.9; }

/* ===== App 附近地点弹窗 ===== */
.nearby-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30rpx;
}
.nearby-picker-modal {
  width: 100%;
  max-width: 700rpx;
  max-height: 80vh;
  background: #fff;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.3);
}
.nearby-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 30rpx;
  border-bottom: 1rpx solid #eee;
}
.nearby-picker-title { font-size: 32rpx; font-weight: 700; color: #1f2937; }
.nearby-picker-close { font-size: 36rpx; color: #999; padding: 10rpx; }
.nearby-picker-close:active { color: #333; }
.nearby-picker-search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 30rpx;
  border-bottom: 1rpx solid #eee;
}
.nearby-search-input {
  flex: 1;
  height: 64rpx;
  padding: 0 20rpx;
  border: 2rpx solid #ddd;
  border-radius: 12rpx;
  font-size: 26rpx;
  color: #333;
  background: #f9f9f9;
}
.nearby-search-input:focus { border-color: #10b981; background: #fff; }
.nearby-search-btn {
  padding: 12rpx 24rpx;
  background: #10b981;
  color: #fff;
  border-radius: 10rpx;
  font-size: 26rpx;
  font-weight: 500;
  white-space: nowrap;
}
.nearby-search-btn:active { opacity: 0.8; }
.nearby-picker-body {
  padding: 12rpx 0 20rpx;
  max-height: 60vh;
}
.nearby-loading,
.nearby-error {
  padding: 24rpx 30rpx;
  color: #6b7280;
  font-size: 26rpx;
}
.nearby-list { max-height: 56vh; }
.nearby-item {
  padding: 20rpx 30rpx;
  border-bottom: 1rpx solid #f0f0f0;
}
.nearby-item:active { background: #f9fafb; }
.nearby-name { display: block; font-size: 28rpx; font-weight: 600; color: #111827; }
.nearby-addr { display: block; margin-top: 6rpx; font-size: 24rpx; color: #6b7280; }
</style>
