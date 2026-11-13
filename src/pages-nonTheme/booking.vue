<template>
  <view class="booking-page" :class="{ 'dark-mode': isDark }">
    <AppConfirmDialog ref="appConfirmDialog" />
    <view class="bg-effects" aria-hidden="true"><view class="bg-circle c1"></view><view class="bg-circle c2"></view><view class="bg-circle c3"></view></view>
    <view class="navbar">
      <view class="safe-area-top" :style="{ height: navInset + 'px' }"></view>
      <view class="nav-content">
        <view class="nav-left" role="button" aria-label="返回" @click="goBack">
          <ManifestIcon id="back" class="back-icon" :scale="1" />
        </view>
        <view class="nav-title-wrap"><view class="title-icon-pill"><ManifestIcon id="recycling_booking" /></view><text class="nav-title">预约回收</text></view>
        <button class="orders-entry" @click="goToOrders"><ManifestIcon id="reservation_order_table" size="28rpx" /><text>我的订单</text></button>
      </view>
    </view>

    <scroll-view class="main-scroll" scroll-y>
      <view class="content-wrapper">
        <view class="booking-intro">
          <view class="intro-heading">
            <view class="intro-title"><text>让闲置</text><text>再出发</text></view>
            <image class="recycling-loop" src="/static/icons/recycling-loop.png" mode="aspectFit" aria-hidden="true" />
          </view>
          <text class="intro-note">选好物品和时间，回收员上门收取</text>
          <view class="booking-route"><text>确认地址</text><view class="route-line"></view><text>选择物品</text><view class="route-line"></view><text>预约上门</text></view>
        </view>

        <view v-if="draftId" class="draft-status">
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
          <text v-else>请核对物品、预估数量和日期，选择可用时段后确认。当前尚未创建订单。</text>
        </view>

        <view v-if="!draftId || (draft && !draftLoading && !draftError && !draftReceipt && !draftExpired)" :class="['booking-form', { 'booking-form-busy': submitting }]">
          <view class="section address-section">
            <view class="section-heading"><text class="section-number">01</text><view class="section-heading-copy"><text class="section-title">回收地址</text><text class="section-description">确认上门位置，查看服务覆盖</text></view></view>
            <view class="booking-address-card">
              <view class="address-field-group">
                <text class="field-label">所在地区</text>
                <view class="region-field"><ShopRegionPicker v-model="addressRegion" :disabled="submitting || addressBusy" /></view>
              </view>
              <view class="address-field-group address-detail-group">
                <text class="field-label">详细地址</text>
                <input v-model="addressDetail" class="input-field address-detail-input" placeholder="街道、小区、楼栋及门牌号" placeholder-class="input-placeholder" :disabled="submitting || addressBusy" />
              </view>
              <ShopAddressPicker
                :model-value="address"
                :auto-locate="addressReady && !draftId"
                :auto-locate-when-filled="!bookingPoint"
                :disabled="submitting"
                @select="applyLocatedAddress"
                @busy-change="addressBusy = $event"
              />
            </view>
            <view class="coverage-block">
              <RecyclingServiceMap v-if="bookingPoint && matchingAreas.length" class="coverage-map" :areas="matchingAreas" :point="bookingPoint" readonly />
              <view v-if="catalogLoading" class="time-feedback" role="status">正在核验该地址的服务排班…</view>
              <view v-else-if="catalogError" class="time-feedback" role="alert"><text>{{ catalogError }}</text><button class="text-retry" @click="loadServiceAreas">重新加载</button></view>
              <text v-else-if="!bookingPoint" class="estimate-note">请通过地图选址或当前位置确认上门位置，查看附近的回收服务。</text>
              <view v-else-if="!selectedServiceArea" class="coverage-empty"><text class="estimate-note">该地址暂未有回收员提供服务，试试其他位置或稍后再来。</text><button class="text-retry" :disabled="catalogLoading" @click="loadServiceAreas">刷新服务覆盖</button></view>
              <view v-else class="coverage-confirmed"><view class="coverage-dot"></view><text>该地址有回收服务覆盖</text><text class="coverage-count">{{ matchingAreas.length }} 个范围</text></view>
              <text v-if="bookingPoint" class="estimate-note coverage-note">已预留 {{ bookingTolerance }} 米定位容差，请核对实际上门位置。</text>
            </view>
          </view>

          <view class="section items-section">
            <view class="section-heading"><text class="section-number">02</text><view class="section-heading-copy"><text class="section-title">回收物品</text><text class="section-description">选择品类，补充数量与照片</text></view><text class="section-aside">可多选</text></view>
            <text v-if="!allowedWasteTypes.length" class="estimate-note empty-note">确认地址有服务覆盖后，即可选择回收物品。</text>
            <view class="waste-grid">
              <view v-for="item in allowedWasteTypes" :key="item.id" :class="['waste-card', { selected: selectedTypes.includes(item.id) }]" role="checkbox" :aria-checked="selectedTypes.includes(item.id)" :aria-label="item.name" @click="toggleWasteType(item)">
                <text class="waste-icon">{{ item.icon }}</text>
                <view class="waste-info"><text class="waste-name">{{ item.name }}</text><text class="waste-price">{{ typePriceText(item.id) }}</text></view>
                <view class="selection-box"><view v-if="selectedTypes.includes(item.id)" class="selection-tick"></view></view>
              </view>
            </view>

            <view v-if="selectedWasteItems.length" class="quantity-section">
              <view class="subheading"><text>预估数量</text><text class="optional">选填</text></view>
              <view v-for="item in selectedWasteItems" :key="item.id" class="quantity-card">
                <view class="booking-weight-row">
                  <text class="quantity-name">{{ item.name }}</text>
                  <input v-model="itemWeights[item.id]" type="digit" maxlength="8" :disabled="submitting" placeholder="不清楚可留空" />
                  <picker :range="quantityUnits" range-key="label" :value="unitIndex(item.id)" :disabled="submitting" @change="changeQuantityUnit(item.id, $event)"><view class="unit-control">{{ unitText(itemUnits[item.id] || 'kg') }}<view class="small-chevron"></view></view></picker>
                </view>
                <input v-model="itemQuantityNotes[item.id]" class="input-field quantity-note" maxlength="200" :disabled="submitting" placeholder="数量说明，如：约两袋旧衣服（选填）" />
                <text class="estimate-note">{{ typePriceText(item.id) }}</text>
                <text v-if="typePriceDescriptions(item.id)" class="estimate-note price-description">{{ typePriceDescriptions(item.id) }}</text>
              </view>
              <text class="estimate-note">数量不清楚可留空，实际数量与金额以现场确认结果为准。</text>
            </view>

            <view class="photo-section">
              <view class="subheading"><text>物品照片</text><text class="optional">选填 · 最多6张</text><text class="photo-count">{{ photoCount }}/6</text></view>
              <view class="booking-photos">
                <view v-for="photo in photos" :key="photo.id" class="booking-photo">
                  <image :src="photo.url" mode="aspectFill" @click="previewPhotos(photo.url)" />
                  <button :disabled="submitting || photoUploading" @click="removePhoto(photo.id)">移除</button>
                </view>
                <button v-if="photoCount < 6" class="photo-add" :disabled="submitting || photoUploading" aria-label="拍照或从相册选择物品照片" @click="choosePhotos"><view v-if="!photoUploading" class="photo-plus"></view><text>{{ photoUploading ? '上传中…' : '添加照片' }}</text></button>
              </view>
              <view v-if="unresolvedPhotoCount"><text class="estimate-note">草稿中有 {{ unresolvedPhotoCount }} 张照片未能显示，可移除后重新上传。</text><button class="text-retry" :disabled="submitting || photoUploading" @click="clearUnresolvedPhotos">移除未显示照片</button></view>
              <text class="estimate-note">拍清物品种类、数量与成色，便于回收员报价。</text>
              <text v-if="requiresPhotoHint" class="photo-hint">部分回收员要求提供照片，上传后可匹配更多服务与时段。</text>
              <text v-if="photoError" class="photo-hint" role="alert">{{ photoError }}</text>
            </view>

            <view v-if="unavailableWasteItems.length" class="unavailable-items">
              <text class="photo-hint">以下物品在当前地址暂无服务，请移除后继续</text>
              <view v-for="item in unavailableWasteItems" :key="item.id" class="booking-weight-row"><text>{{ item.name }}</text><button class="text-retry" :disabled="submitting" @click="toggleWasteType(item)">移除</button></view>
            </view>
          </view>

          <view class="section schedule-section">
            <view class="section-heading"><text class="section-number">03</text><view class="section-heading-copy"><text class="section-title">上门时间</text><text class="section-description">先选日期，再选择可预约时段</text></view></view>
            <view class="date-tabs">
              <view :class="['date-tab', { active: selectedDate === 'today' }]" role="button" @click="selectDate('today')"><text class="date-label">今天</text><text class="date-desc">{{ todayStr }}</text></view>
              <view :class="['date-tab', { active: selectedDate === 'tomorrow' }]" role="button" @click="selectDate('tomorrow')"><text class="date-label">明天</text><text class="date-desc">{{ tomorrowStr }}</text></view>
              <picker class="custom-date-picker" mode="date" :value="dateValues.custom || dateValues.today" :start="dateValues.today" :end="maxBookingDate" :disabled="submitting" @change="chooseCustomDate"><view :class="['date-tab', { active: selectedDate === 'custom' }]"><text class="date-label">其他日期</text><text class="date-desc">{{ dateValues.custom || '未来30天' }}</text></view></picker>
            </view>
            <view v-if="timeSlotsLoading" class="time-feedback" role="status">正在加载可预约时段…</view>
            <view v-else-if="timeSlotsHint" class="time-feedback" role="status">{{ timeSlotsHint }}</view>
            <view v-else-if="timeSlotsError" class="time-feedback" role="alert"><text>{{ timeSlotsError }}</text><button class="text-retry" @click="loadTimeSlots">重新加载</button></view>
            <view v-else-if="!timeSlots.length" class="time-feedback">当天暂无符合所选品类的排班，可以选择其他日期。</view>
            <view v-else class="time-grid">
              <view v-for="slot in timeSlots" :key="slot.time" :class="['time-slot', { selected: selectedTimeSlot === slot.time, disabled: !slot.available }]" role="button" :aria-disabled="!slot.available" @click="slot.available && selectTimeSlot(slot.time)"><view class="time-radio"><view v-if="selectedTimeSlot === slot.time" class="time-radio-dot"></view></view><view class="time-slot-copy"><text class="time-text">{{ slot.time }}</text><text class="time-status">{{ slot.available ? '可预约' : '暂无名额' }}</text></view></view>
            </view>
          </view>

          <view class="section contact-section">
            <view class="section-heading"><text class="section-number">04</text><view class="section-heading-copy"><text class="section-title">联系与补充</text><text class="section-description">留下电话，提前说明上门需求</text></view></view>
            <view class="contact-field"><text class="field-label">联系电话</text><input v-model="contactPhone" class="input-field" type="number" maxlength="11" placeholder="请输入联系电话" placeholder-class="input-placeholder" :disabled="submitting" /></view>
            <view class="contact-field textarea-row"><view class="field-label"><text>上门条件</text><text class="optional">选填</text></view><textarea v-model="accessNotes" class="textarea-field" maxlength="500" :disabled="submitting" placeholder="楼层、电梯、停车或搬运需求" placeholder-class="input-placeholder" auto-height /></view>
            <view class="contact-field textarea-row"><view class="field-label"><text>备注信息</text><text class="optional">选填</text></view><textarea v-model="remark" class="textarea-field" :disabled="submitting" placeholder="其他需要提前沟通的事" placeholder-class="input-placeholder" auto-height /></view>
          </view>

          <view class="booking-checkout">
            <view v-if="selectedWasteItems.length" class="estimate-card">
              <view class="estimate-info"><text class="estimate-label">回收员报价参考</text><text class="estimate-amount">{{ estimateText }}</text></view>
              <text class="estimate-note">未填数量、面议或计价单位不同的物品需另行确认。接单后请核对报价，以现场确认结果为准。</text>
            </view>
            <button :class="['submit-btn', { disabled: submitting || addressBusy || photoUploading }]" :disabled="submitting || addressBusy || photoUploading" @click="submitBooking"><text class="submit-text">{{ submitting ? '提交中…' : (draftId ? '确认并提交预约' : '立即预约') }}</text></button>
          </view>
        </view>

        <button class="collector-entry" @click="goCollectorApply"><text class="collector-entry-title">成为回收员</text><text class="collector-entry-note">申请提供上门回收服务</text><view class="entry-chevron"></view></button>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { createBooking, getAvailableTimeSlots, uploadBookingPhoto, bookingUnitText } from '@/pages-nonTheme/api/booking.js';
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
import { chooseAppImage } from '@/utils/image-picker.js';
import { bookingDraftMethods } from './utils/booking-draft-methods.js';

export default {
  components: { AppConfirmDialog, ManifestIcon, ShopRegionPicker, ShopAddressPicker, RecyclingServiceMap },
  data() {
    return {
      draftId: '', draft: null, draftLoading: false, draftError: '', draftExpired: false, draftReceipt: null, replacementRequestId: '',
      itemWeights: {}, itemUnits: {}, itemQuantityNotes: {}, photos: [], draftPhotoIds: [], photoUploading: false, photoError: '', accessNotes: '', estimateMax: 0, estimateUnknown: true, maxBookingDate: '',
      quantityUnits: [{ value: 'kg', label: '公斤' }, { value: 'piece', label: '件' }, { value: 'unit', label: '台' }, { value: 'bag', label: '袋' }],
      wasteTypes: [], serviceAreas: [], serviceAreaId: null, catalogError: '', catalogLoading: false, bookingInitialized: false, addressCoordinates: null, bookingWrites: {},
      selectedTypes: [],
      selectedDate: 'today',
      selectedTimeSlot: '',
      timeSlots: [],
      timeSlotsLoading: false,
      timeSlotsError: '',
      timeSlotsHint: '',
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
      statusBarHeight: 20,
      isDark: false
    };
  },
  async onLoad(options = {}) {
    this.statusBarHeight = (uni.getWindowInfo?.() || uni.getSystemInfoSync?.() || {}).statusBarHeight || 0;
    this.draftId = typeof options.draftId === 'string' ? options.draftId : '';
    this.draftLoading = !!this.draftId;
    this.checkTheme();
    this.initDates();
    await Promise.all([this.loadContactPhone(), this.loadAddress(), this.loadServiceAreas()]);
    this.bookingInitialized = true;
    if (this.draftId) await this.loadBookingDraft();
    else this.syncServiceCoverage();
  },
  onShow() {
    this.checkTheme();
    if (this.dateValues.today && this.dateValues.today !== formatBookingDate(new Date())) {
      this.initDates();
      this.selectedTimeSlot = '';
    }
    if (this.bookingInitialized && !this.draftLoading && !this.submitting) this.loadServiceAreas();
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
    navInset() { return Math.max(this.statusBarHeight, 22); },
    photoCount() { return new Set([...this.draftPhotoIds, ...this.photos.map(photo => photo.id)]).size; },
    unresolvedPhotoCount() { return this.draftPhotoIds.filter(id => !this.photos.some(photo => photo.id === id)).length; },
    requiresPhotoHint() { return this.selectedTypes.some(id => this.typePriceGuides(id).some(guide => guide.requiresPhoto)) && !this.photoCount; },
    estimateText() { if (this.estimateUnknown && !(this.estimateAmount > 0 || this.estimateMax > 0)) return '待报价确认'; return `¥${this.estimateAmount.toFixed(2)}${this.estimateMax === this.estimateAmount ? '' : `–${this.estimateMax.toFixed(2)}`}${this.estimateUnknown ? '（部分物品）' : ''}`; },
    selectedServiceArea() { return this.serviceAreas.find(area => Number(area.id) === Number(this.serviceAreaId)); },
    addressRegionComplete() { return this.addressRegion.length === 3 && this.addressRegion.every(part => String(part || '').trim()); },
    bookingSelectionKey() { return JSON.stringify([this.serviceAreaId, this.address, this.bookingPoint, this.dateValues[this.selectedDate], this.photoCount, [...this.selectedTypes].map(Number).sort((a, b) => a - b)]); },
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
    itemUnits: { handler() { this.calculateEstimate(); }, deep: true },
    photoCount() { if (this.bookingInitialized && !this.draftLoading && !this.submitting && !this.photoUploading) this.loadTimeSlots(); },
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
    unitText: bookingUnitText,
    unitIndex(typeId) { return Math.max(0, this.quantityUnits.findIndex(unit => unit.value === (this.itemUnits[typeId] || 'kg'))); },
    changeQuantityUnit(typeId, event) { this.itemUnits[typeId] = this.quantityUnits[Number(event.detail.value)]?.value || 'kg'; },
    typePriceGuides(typeId) { return this.matchingAreas.flatMap(area => area.priceGuides || []).filter(guide => Number(guide.typeId) === Number(typeId)); },
    typePriceDescriptions(typeId) { return [...new Set(this.typePriceGuides(typeId).flatMap(guide => guide.descriptions || []).filter(Boolean))].join('；'); },
    typePriceText(typeId) {
      const guides = this.typePriceGuides(typeId);
      if (!guides.length) return '待回收员报价';
      const labels = [...new Set(guides.map(guide => {
        const prices = [guide.minPrice, guide.maxPrice].filter(value => value != null && Number.isFinite(Number(value))).map(Number);
        const min = Math.min(...prices), max = Math.max(...prices);
        const price = prices.length ? `¥${min.toFixed(2)}${min === max ? '' : `–${max.toFixed(2)}`}/${this.unitText(guide.unit)}` : '';
        return `${price}${guide.negotiable ? (price ? '，可面议' : '面议') : ''}` || '待报价';
      }))];
      return labels.join(' · ');
    },
    choosePhotos() {
      if (this.submitting || this.photoUploading || this.photoCount >= 6) return;
      this.photoError = '';
      chooseAppImage({ count: 6 - this.photoCount, sizeType: ['compressed'], success: async result => {
        this.photoUploading = true;
        try {
          for (const path of (result.tempFilePaths || []).slice(0, 6 - this.photoCount)) this.photos.push(await uploadBookingPhoto(path));
        } catch (e) { this.photoError = e.message || '图片上传失败，请重新选择'; }
        finally { this.photoUploading = false; if (this.bookingInitialized && !this.draftLoading) this.loadTimeSlots(); }
      }, fail: error => { if (!/cancel/i.test(error?.errMsg || '')) this.photoError = '无法选择图片，请重试'; } });
    },
    clearUnresolvedPhotos() { this.draftPhotoIds = this.draftPhotoIds.filter(id => this.photos.some(photo => photo.id === id)); },
    removePhoto(id) { this.photos = this.photos.filter(photo => photo.id !== id); this.draftPhotoIds = this.draftPhotoIds.filter(photoId => photoId !== id); },
    previewPhotos(current) { uni.previewImage({ current, urls: this.photos.map(photo => photo.url).filter(Boolean) }); },
    async loadServiceAreas() {
      if (this.catalogLoading) return;
      this.catalogError = ''; this.catalogLoading = true;
      try { const catalog = await recyclingCatalog(); this.serviceAreas = catalog.areas || []; this.wasteTypes = catalog.types || []; }
      catch (e) { this.catalogError = e.message || '服务覆盖加载失败'; this.serviceAreas = []; this.wasteTypes = []; }
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
      const userId = this.bookingLocationOwner();
      if (userId && this.addressCoordinates) uni.setStorageSync('bookingAddressLocation', { ...this.addressCoordinates, userId });
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
    bookingLocationOwner() {
      try {
        let user = uni.getStorageSync('userInfo') || {};
        if (typeof user === 'string') user = JSON.parse(user);
        const id = user.id || user.userId || user.user?.id || user.data?.id;
        return /^[1-9]\d*$/.test(String(id || '')) ? String(id) : '';
      } catch (_) { return ''; }
    },
    restoreBookingLocation() {
      const userId = this.bookingLocationOwner();
      const cached = uni.getStorageSync('bookingAddressLocation');
      if (userId && cached?.userId === userId && cached.address === this.address && cached.coordinateSystem === 'wgs84' && normalizePoint(cached)) {
        this.addressCoordinates = { address: this.address, ...normalizePoint(cached), coordinateSystem: 'wgs84', ...(Number.isFinite(cached.accuracyMeters) && cached.accuracyMeters >= 0 ? { accuracyMeters: Math.min(200, cached.accuracyMeters) } : {}) };
      }
    },
    async loadAddress() {
      // 优先从缓存读取
      const cached = String(uni.getStorageSync('bookingAddress') || '').trim();
      if (cached) {
        if (!this.address.trim()) this.address = cached;
        this.restoreBookingLocation();
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
        this.restoreBookingLocation();
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
    async loadTimeSlots() {
      const requestId = ++this.timeSlotsRequestId;
      const dateStr = this.dateValues[this.selectedDate];
      this.timeSlotsLoading = true;
      this.timeSlotsError = '';
      this.timeSlotsHint = '';
      this.timeSlots = [];
      this.selectedTimeSlot = '';
      this.timeSlotsDate = ''; this.timeSlotsSelectionKey = '';
      const selectionKey = this.bookingSelectionKey;
      if (!this.serviceAreaId) { this.timeSlotsLoading = false; this.timeSlotsHint = this.bookingPoint ? '该上门位置暂无已审核范围与排班覆盖' : '请先通过地图确认上门位置'; return; }
      if (!this.selectedTypes.length) { this.timeSlotsLoading = false; this.timeSlotsHint = '请先在上方选择回收物品，再查看可预约时段'; return; }
      try {
        const res = await getAvailableTimeSlots(dateStr, this.serviceAreaId, this.selectedTypes, { photoCount: this.photoCount, addressLat: this.bookingPoint.latitude, addressLng: this.bookingPoint.longitude, addressCoordinateSystem: 'wgs84', ...(this.bookingPoint.accuracyMeters != null ? { addressAccuracy: this.bookingPoint.accuracyMeters } : {}) });
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
        if (this.itemWeights[item.id] == null) this.itemWeights[item.id] = '';
        if (!this.itemUnits[item.id]) this.itemUnits[item.id] = this.typePriceGuides(item.id)[0]?.unit || 'kg';
      }
    },
    selectDate(date) {
      this.selectedDate = date;
      this.selectedTimeSlot = '';
      this.loadTimeSlots();
    },
    selectTimeSlot(time) {
      if (this.timeSlotsLoading || this.timeSlotsHint || this.timeSlotsError) return;
      this.selectedTimeSlot = time;
    },
    calculateEstimate() {
      let min = 0, max = 0, unknown = false;
      for (const item of this.selectedWasteItems) {
        const quantity = Number(this.itemWeights[item.id]);
        const guides = this.typePriceGuides(item.id).filter(guide => guide.unit === (this.itemUnits[item.id] || 'kg'));
        const minimums = guides.filter(guide => guide.minPrice != null).map(guide => Number(guide.minPrice)).filter(Number.isFinite);
        const maximums = guides.filter(guide => guide.maxPrice != null).map(guide => Number(guide.maxPrice)).filter(Number.isFinite);
        if (!(quantity > 0) || !minimums.length || !maximums.length) { unknown = true; continue; }
        min += quantity * Math.min(...minimums); max += quantity * Math.max(...maximums);
        if (guides.some(guide => guide.negotiable) || guides.length !== this.typePriceGuides(item.id).length) unknown = true;
      }
      this.estimateAmount = min; this.estimateMax = max; this.estimateUnknown = unknown;
    },
    validateBookingForm() {
      if (this.photoUploading) { uni.showToast({ title: '请等待图片上传完成', icon: 'none' }); return false; }
      if (this.photoCount > 6) { uni.showToast({ title: '物品照片最多6张，请移除多余照片', icon: 'none' }); return false; }
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
      if (this.selectedTypes.length === 0) {
        uni.showToast({ title: '请选择回收物品', icon: 'none' });
        return false;
      }
      if (this.timeSlotsLoading || this.timeSlotsError || this.timeSlotsDate !== this.dateValues[this.selectedDate] || this.timeSlotsSelectionKey !== this.bookingSelectionKey) {
        uni.showToast({ title: this.timeSlotsLoading ? '正在加载时段，请稍候' : '请先重新加载预约时段', icon: 'none' });
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
        const raw = this.itemWeights[id];
        if (raw == null || String(raw).trim() === '') return false;
        const weight = Number(raw);
        return !Number.isFinite(weight) || weight <= 0 || weight > 10000 || Math.abs(weight * 100 - Math.round(weight * 100)) > 0.00001;
      })) {
        uni.showToast({ title: '预估数量需大于0、最多10000且不超过两位小数', icon: 'none' }); return false;
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
.booking-page {
  --booking-bg: #f5f7fa; --booking-text: #1f2937; --booking-body: #4b5563;
  --booking-muted: #6b7280; --booking-line: #dce6e7; --booking-accent: #059669;
  --booking-soft: #e5f7ef; --booking-field: #fff;
  --shop-card: var(--booking-bg); --shop-text: var(--booking-text); --shop-muted: var(--booking-muted);
  --shop-line: var(--booking-line); --shop-soft: var(--booking-soft); --shop-green: var(--booking-accent);
  height: 100vh; display: flex; flex-direction: column; overflow: hidden;
  position: relative; background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%); color: var(--booking-body); font-size: 26rpx; line-height: 1.6;
}
.booking-page.dark-mode {
  --booking-bg: #0f172a; --booking-text: #f8fafc; --booking-body: #cbd5e1;
  --booking-muted: #a8b4c4; --booking-line: #334155; --booking-accent: #34d399;
  --booking-soft: #153c36; --booking-field: #172334;
  background: radial-gradient(circle at 18% 8%, rgba(16,185,129,.22), transparent 34%), radial-gradient(circle at 86% 20%, rgba(56,189,248,.16), transparent 32%), linear-gradient(180deg, #07111f 0%, #0f172a 48%, #101827 100%);
}
.bg-effects { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.bg-circle { position: absolute; border-radius: 50%; background: #10b981; opacity: .06; }
.c1 { width: 600rpx; height: 600rpx; top: -200rpx; right: -200rpx; }
.c2 { width: 400rpx; height: 400rpx; bottom: 20%; left: -200rpx; }
.c3 { width: 300rpx; height: 300rpx; top: 30%; right: -100rpx; }
.dark-mode .bg-circle { opacity: .1; }
.dark-mode .c2 { background: #38bdf8; }
.navbar { position: relative; z-index: 1; flex-shrink: 0; }
.safe-area-top { min-height: 22px; }
.nav-content { display: flex; align-items: center; justify-content: space-between; height: 68px; padding: 0 32rpx; max-width: 1040rpx; margin: 0 auto; box-sizing: border-box; }
.nav-left { flex: 0 0 160rpx; min-height: 80rpx; display: flex; align-items: center; }
.back-icon { font-size: 48rpx; font-weight: 600; padding: 8rpx; color: #1f2937; }
.dark-mode .back-icon { filter: brightness(0) invert(1); }
.nav-title-wrap { display: flex; flex: 1; align-items: center; justify-content: center; gap: 12rpx; min-width: 0; }
.title-icon-pill { width: 56rpx; height: 56rpx; border-radius: 14rpx; background: rgba(16,185,129,.12); display: flex; align-items: center; justify-content: center; font-size: 26rpx; flex-shrink: 0; }
.dark-mode .title-icon-pill { background: rgba(255,255,255,.15); }
.nav-title { color: var(--booking-text); font-size: 32rpx; font-weight: 700; letter-spacing: 1rpx; white-space: nowrap; }
.orders-entry { flex: 0 0 160rpx; display: flex; align-items: center; justify-content: center; gap: 8rpx; padding: 12rpx 10rpx; margin: 0; box-sizing: border-box; background: rgba(16,185,129,.12); color: var(--booking-accent); font-size: 23rpx; line-height: 1.5; border-radius: 40rpx; white-space: nowrap; }
.dark-mode .orders-entry { background: rgba(255,255,255,.1); }
.orders-entry::after, .collector-entry::after, .photo-add::after, .text-retry::after, .submit-btn::after { border: 0; }
.main-scroll { position: relative; z-index: 1; flex: 1; min-height: 0; height: 0; }
.content-wrapper { max-width: 1040rpx; padding: 16rpx 32rpx calc(48rpx + env(safe-area-inset-bottom)); margin: 0 auto; box-sizing: border-box; }
.booking-intro { margin: 0 0 36rpx; padding: 0 4rpx; }
.intro-heading { display: flex; justify-content: space-between; align-items: center; }
.intro-title { color: var(--booking-text); font-size: 48rpx; font-weight: 800; line-height: 1.2; letter-spacing: -1rpx; }
.intro-title text { display: block; }
.intro-title text:last-child { color: var(--booking-accent); }
.recycling-loop { width: 124rpx; height: 124rpx; margin-right: 12rpx; flex-shrink: 0; }
.dark-mode .recycling-loop { opacity: .85; }
.intro-note { display: block; color: var(--booking-body); font-size: 25rpx; margin-top: 18rpx; }
.booking-route { display: flex; align-items: center; gap: 20rpx; margin-top: 32rpx; color: var(--booking-text); font-size: 22rpx; }
.route-line { height: 1rpx; flex: 1; background: var(--booking-line); }
.section { margin-bottom: 40rpx; min-width: 0; }
.section + .section { padding-top: 32rpx; border-top: 8rpx solid rgba(148,163,184,.12); }
.section-heading { display: flex; align-items: center; gap: 16rpx; padding: 20rpx; margin: 0 0 22rpx; background: linear-gradient(90deg, rgba(16,185,129,.1), rgba(16,185,129,.025)); border-left: 6rpx solid #10b981; border-radius: 0 14rpx 14rpx 0; }
.section-number { display: flex; align-items: center; justify-content: center; flex: 0 0 52rpx; height: 52rpx; border-radius: 14rpx; background: linear-gradient(135deg, #10b981, #059669); color: #fff; font-size: 25rpx; font-weight: 700; line-height: 1; }
.section-heading-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
.section-title { color: var(--booking-text); font-size: 30rpx; font-weight: 700; line-height: 1.4; }
.section-description { color: var(--booking-muted); font-size: 22rpx; line-height: 1.5; }
.section-aside { font-size: 23rpx; color: var(--booking-accent); margin-left: auto; flex-shrink: 0; }
.dark-mode .section-heading { background: linear-gradient(90deg, rgba(16,185,129,.17), rgba(16,185,129,.03)); }
.field-label { flex: 0 0 124rpx; color: var(--booking-text); font-size: 25rpx; line-height: 1.6; }
.address-field-group { display: flex; align-items: flex-start; gap: 12rpx; padding: 8rpx 0; }
.address-field-group > .field-label { padding-top: 16rpx; }
.region-field { flex: 1; width: 0; min-width: 0; }
.booking-address-card :deep(.region-value) { font-size: 25rpx; border-bottom: 1rpx solid var(--booking-line); }
.booking-address-card :deep(.region-switch) { font-size: 21rpx; padding: 6rpx 0; }
.input-field { flex: 1; min-width: 0; width: 0; height: 76rpx; color: var(--booking-text); font-size: 26rpx; line-height: normal; box-sizing: border-box; background: transparent; }
.address-detail-input { border-bottom: 1rpx solid var(--booking-line); }
.input-placeholder { color: var(--booking-muted); }
.booking-address-card :deep(.address-actions) { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 14rpx; }
.booking-address-card :deep(.address-actions .address-action) { flex: 1; min-width: 180rpx; margin: 0; border: 1rpx solid var(--booking-accent); border-radius: 40rpx; padding: 12rpx 16rpx; font-size: 24rpx; background: var(--booking-soft); line-height: 1.5; }
.booking-address-card :deep(.address-hint) { font-size: 21rpx; line-height: 1.6; }
.coverage-block { margin-top: 18rpx; }
.coverage-map { margin: 0; }
.coverage-map :deep(.map-stage) { height: 360rpx; min-height: 360rpx; border-radius: 12rpx; }
.coverage-map :deep(.map-canvas) { height: 360rpx; min-height: 360rpx; }
.coverage-map :deep(.map-bottom) { margin-top: 4rpx; }
.coverage-map :deep(.map-button) { padding: 6rpx 0; min-height: 56rpx; background: transparent; border-color: transparent; font-size: 22rpx; }
.coverage-map :deep(.map-legend) { margin-top: 0; font-size: 21rpx; }
.coverage-confirmed { display: flex; align-items: center; gap: 10rpx; margin-top: 12rpx; color: var(--booking-accent); font-size: 24rpx; font-weight: 600; }
.coverage-dot { width: 12rpx; height: 12rpx; flex-shrink: 0; border: 4rpx solid var(--booking-bg); border-radius: 50%; background: var(--booking-accent); box-shadow: 0 0 0 1rpx var(--booking-accent); }
.coverage-count { margin-left: auto; color: var(--booking-muted); font-size: 21rpx; font-weight: 400; white-space: nowrap; }
.estimate-note { display: block; color: var(--booking-muted); font-size: 22rpx; line-height: 1.65; overflow-wrap: anywhere; }
.coverage-note { margin-top: 8rpx; font-size: 21rpx; }
.empty-note { padding: 16rpx 0; }
.waste-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 20rpx; }
.waste-card { display: flex; align-items: center; gap: 10rpx; min-height: 100rpx; padding: 12rpx 8rpx; border-bottom: 1rpx solid var(--booking-line); box-sizing: border-box; min-width: 0; transition: background .18s; }
.waste-card.selected { background: var(--booking-soft); border-radius: 8rpx; }
.waste-icon { flex-shrink: 0; font-size: 32rpx; line-height: 1; }
.waste-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.waste-name { color: var(--booking-text); font-size: 25rpx; font-weight: 600; line-height: 1.5; }
.waste-price { color: var(--booking-body); font-size: 21rpx; line-height: 1.5; overflow-wrap: anywhere; }
.selection-box { width: 24rpx; height: 24rpx; box-sizing: border-box; flex-shrink: 0; border: 2rpx solid var(--booking-muted); border-radius: 5rpx; display: flex; align-items: center; justify-content: center; }
.selected .selection-box { background: var(--booking-accent); border-color: var(--booking-accent); }
.selection-tick { width: 12rpx; height: 7rpx; border-left: 3rpx solid var(--booking-bg); border-bottom: 3rpx solid var(--booking-bg); transform: translateY(-2rpx) rotate(-45deg); }
.subheading { display: flex; align-items: baseline; gap: 14rpx; margin-bottom: 14rpx; color: var(--booking-text); font-size: 26rpx; font-weight: 600; }
.optional { color: var(--booking-muted); font-size: 21rpx; font-weight: 400; }
.quantity-section { margin-top: 26rpx; }
.quantity-card { padding: 12rpx 0 20rpx; margin-bottom: 16rpx; border-bottom: 1rpx solid var(--booking-line); }
.booking-weight-row { display: flex; align-items: center; gap: 16rpx; min-width: 0; }
.quantity-name { flex: 0 0 124rpx; color: var(--booking-text); font-size: 26rpx; font-weight: 600; overflow-wrap: anywhere; }
.booking-weight-row input { width: 0; flex: 1; min-width: 0; height: 72rpx; border-bottom: 1rpx solid var(--booking-line); color: var(--booking-text); background: transparent; font-size: 26rpx; }
.unit-control { display: flex; align-items: center; justify-content: center; gap: 14rpx; min-width: 104rpx; height: 72rpx; padding: 0 12rpx; color: var(--booking-accent); font-size: 25rpx; }
.small-chevron, .entry-chevron { width: 10rpx; height: 10rpx; border-right: 2rpx solid currentColor; border-bottom: 2rpx solid currentColor; transform: rotate(45deg); flex-shrink: 0; }
.quantity-note { width: 100%; height: 70rpx; font-size: 23rpx; }
.price-description { margin-top: 4rpx; }
.photo-section { margin-top: 26rpx; }
.photo-count { margin-left: auto; color: var(--booking-muted); font-size: 22rpx; font-weight: 400; }
.booking-photos { display: flex; flex-wrap: wrap; gap: 14rpx; margin-bottom: 12rpx; }
.booking-photo { width: 136rpx; }
.booking-photo image { display: block; width: 136rpx; height: 136rpx; border-radius: 8rpx; }
.booking-photo button { width: 100%; margin: 0; padding: 8rpx; background: transparent; color: var(--booking-muted); font-size: 22rpx; line-height: 1.5; }
.booking-photo button::after { border: 0; }
.photo-add { width: 136rpx; height: 136rpx; padding: 14rpx 4rpx; margin: 0; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12rpx; border: 1rpx dashed var(--booking-muted); border-radius: 8rpx; background: transparent; color: var(--booking-muted); font-size: 21rpx; line-height: 1.5; }
.photo-plus { width: 32rpx; height: 32rpx; position: relative; }
.photo-plus::before, .photo-plus::after { content: ''; position: absolute; background: var(--booking-muted); }
.photo-plus::before { left: 15rpx; top: 0; width: 2rpx; height: 32rpx; }
.photo-plus::after { left: 0; top: 15rpx; width: 32rpx; height: 2rpx; }
.photo-hint { display: block; margin-top: 12rpx; color: #95632b; font-size: 23rpx; line-height: 1.65; }
.dark-mode .photo-hint { color: #e8bf7f; }
.unavailable-items { margin-top: 24rpx; border-top: 1rpx solid var(--booking-line); }
.date-tabs { display: flex; border-bottom: 1rpx solid var(--booking-line); margin-bottom: 22rpx; }
.date-tab { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4rpx; min-height: 100rpx; padding: 10rpx 4rpx; border-bottom: 4rpx solid transparent; box-sizing: border-box; }
.custom-date-picker { flex: 1; min-width: 0; }
.date-tab.active { border-bottom-color: var(--booking-accent); }
.date-label { color: var(--booking-text); font-size: 26rpx; font-weight: 500; }
.date-desc { color: var(--booking-muted); font-size: 21rpx; white-space: nowrap; }
.date-tab.active .date-label, .date-tab.active .date-desc { color: var(--booking-accent); font-weight: 600; }
.time-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14rpx; }
.time-slot { display: flex; align-items: center; gap: 12rpx; padding: 16rpx 14rpx; min-height: 96rpx; min-width: 0; box-sizing: border-box; border: 1rpx solid var(--booking-line); border-radius: 8rpx; }
.time-slot.selected { background: var(--booking-soft); border-color: var(--booking-accent); }
.time-slot.disabled { opacity: .5; }
.time-radio { width: 24rpx; height: 24rpx; border: 2rpx solid var(--booking-muted); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-sizing: border-box; }
.selected .time-radio { border-color: var(--booking-accent); }
.time-radio-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: var(--booking-accent); }
.time-slot-copy { display: flex; flex-direction: column; min-width: 0; }
.time-text { color: var(--booking-text); font-size: 24rpx; font-weight: 600; line-height: 1.5; }
.time-status { color: var(--booking-accent); font-size: 21rpx; }
.disabled .time-status { color: var(--booking-muted); }
.time-feedback { display: flex; flex-direction: column; align-items: flex-start; gap: 12rpx; padding: 22rpx 0; color: var(--booking-muted); font-size: 24rpx; line-height: 1.7; }
.time-feedback .text-retry { align-self: flex-start; margin: 0; padding: 10rpx 22rpx; border-radius: 32rpx; background: var(--booking-soft); }
.text-retry { display: inline-block; margin: 8rpx 0 0; padding: 8rpx 0; color: var(--booking-accent); background: transparent; font-size: 23rpx; line-height: 1.6; text-align: left; }
.contact-field { display: flex; align-items: center; gap: 12rpx; min-height: 88rpx; border-bottom: 1rpx solid var(--booking-line); }
.textarea-row { align-items: flex-start; padding: 20rpx 0; }
.textarea-row .field-label { display: flex; flex-direction: column; gap: 2rpx; padding-top: 2rpx; }
.textarea-field { flex: 1; min-width: 0; width: 0; min-height: 64rpx; color: var(--booking-text); font-size: 25rpx; line-height: 1.7; background: transparent; }
.booking-checkout { margin-top: -4rpx; }
.estimate-card { padding: 22rpx 24rpx; margin-bottom: 20rpx; background: var(--booking-soft); border-radius: 10rpx; }
.estimate-info { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8rpx 20rpx; margin-bottom: 6rpx; }
.estimate-label { color: var(--booking-text); font-size: 25rpx; }
.estimate-amount { color: var(--booking-accent); font-size: 34rpx; font-weight: 800; overflow-wrap: anywhere; }
.estimate-card .estimate-note { font-size: 21rpx; color: var(--booking-body); }
.submit-btn { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 100rpx; padding: 24rpx; border-radius: 40rpx; box-sizing: border-box; background: linear-gradient(135deg, #10b981, #059669); color: #fff; line-height: 1.5; }
.submit-text { font-size: 30rpx; font-weight: 600; letter-spacing: 2rpx; }
.submit-btn[disabled] { background: linear-gradient(135deg, #10b981, #059669); color: #fff; opacity: .5; }
.booking-form-busy { pointer-events: none; opacity: .7; }
.collector-entry { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12rpx; width: 100%; padding: 26rpx 0 0; margin: 0; background: transparent; color: var(--booking-muted); border-radius: 0; line-height: 1.6; }
.collector-entry-title { color: var(--booking-text); font-size: 23rpx; text-decoration: underline; text-underline-offset: 6rpx; }
.collector-entry-note { font-size: 21rpx; }
.entry-chevron { transform: rotate(-45deg); margin-left: 4rpx; }
.draft-status { margin-bottom: 32rpx; padding: 20rpx 0 20rpx 20rpx; border-left: 4rpx solid var(--booking-accent); }
.draft-status text { display: block; margin-bottom: 10rpx; font-size: 25rpx; overflow-wrap: anywhere; }
.draft-status button { margin: 12rpx 0 0; padding: 16rpx 24rpx; background: var(--booking-soft); color: var(--booking-text); font-size: 25rpx; line-height: 1.5; }
@media (min-width: 768px) {
  .nav-content, .content-wrapper { max-width: 780px; }
  .content-wrapper { padding-left: 36px; padding-right: 36px; }
  .booking-intro { margin-bottom: 36px; }
  .intro-title { font-size: 44px; }
  .recycling-loop { width: 104px; height: 104px; }
  .waste-card { min-height: 72px; }
  .time-slot-copy { flex-direction: row; align-items: center; justify-content: space-between; gap: 18px; width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .waste-card { transition: none; } }
</style>
