<template>
  <view class="orders-page" :class="{ 'dark-mode': isDark }">
    <!-- 动态背景 -->
    <view class="bg-effects">
      <view class="bg-circle c1"></view>
      <view class="bg-circle c2"></view>
    </view>

    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left" @click="goBack">
          <text class="back-icon">←</text>
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill"><text>📋</text></view>
          <text class="nav-title">我的订单</text>
        </view>
        <view class="nav-right"></view>
      </view>
    </view>

    <!-- 状态筛选（横向滚动） -->
    <view class="filter-bar">
      <scroll-view class="filter-tabs" scroll-x enable-flex>
        <view
          v-for="tab in statusTabs"
          :key="tab.value"
          :class="['filter-tab', currentStatus === tab.value ? 'active' : '']"
          @click="changeStatus(tab.value)"
        >
          <text>{{ tab.label }}</text>
        </view>
      </scroll-view>
    </view>

    <scroll-view class="main-scroll" scroll-y @scrolltolower="loadMore">
      <view class="content-wrapper">

        <!-- 加载中 -->
        <view class="loading-wrap" v-if="loading && orders.length === 0">
          <view class="loading-spinner"></view>
          <text class="loading-text">加载中...</text>
        </view>

        <!-- 订单列表 -->
        <view v-if="!loading || orders.length > 0">
          <view v-for="order in orders" :key="order.id" class="order-card">
            <view class="order-header">
              <text class="order-id">订单号: {{ order.orderNo }}</text>
              <view :class="['order-status', `status-${order.status}`]">
                <text>{{ getStatusText(order.status) }}</text>
              </view>
            </view>

            <!-- 物品清单 -->
            <view class="order-items">
              <view v-for="(item, idx) in order.items.slice(0, 3)" :key="idx" class="order-item">
                <text class="item-icon">{{ item.icon }}</text>
                <text class="item-name">{{ item.name }}</text>
                <text class="item-price">¥{{ item.price }}</text>
              </view>
              <view class="order-item more" v-if="order.items.length > 3">
                <text class="more-text">+{{ order.items.length - 3 }} 更多</text>
              </view>
            </view>

            <!-- 预约信息 -->
            <view class="order-info">
              <view class="info-row">
                <text class="info-label">预约时间</text>
                <text class="info-value">{{ order.date }} {{ order.timeSlot }}</text>
              </view>
              <view class="info-row">
                <text class="info-label">回收地址</text>
                <text class="info-value">{{ order.address }}</text>
              </view>
            </view>

            <!-- 预估金额 -->
            <view class="order-amount">
              <text class="amount-label">预估收益</text>
              <text class="amount-value">¥{{ order.estimateAmount.toFixed(2) }}</text>
            </view>

            <!-- 操作按钮 -->
            <view class="order-actions" v-if="order.status === 'pending' || order.status === 'scheduled' || order.status === 'confirmed' || order.status === 'picking'">
              <view class="action-btn cancel-btn" @click="showCancelModal(order)">
                <text>取消订单</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 空状态 -->
        <view class="empty-state" v-if="!loading && orders.length === 0">
          <text class="empty-icon">📋</text>
          <text class="empty-text">暂无订单</text>
          <view class="empty-btn" @click="goToBooking">
            <text>去预约</text>
          </view>
        </view>

        <!-- 加载更多 -->
        <view class="load-more" v-if="orders.length > 0 && hasMore" @click="loadMore">
          <text>{{ loadingMore ? '加载中...' : '加载更多' }}</text>
        </view>

      </view>
    </scroll-view>

    <!-- 取消订单弹窗 -->
    <view class="modal-overlay" v-if="showCancelDialog" @click="showCancelDialog = false">
      <view class="modal-content" @click.stop>
        <view class="modal-header">
          <text class="modal-title">取消订单</text>
        </view>
        <view class="modal-body">
          <textarea
            v-model="cancelReason"
            class="cancel-textarea"
            placeholder="请输入取消原因（选填）"
            placeholder-class="textarea-placeholder"
          ></textarea>
        </view>
        <view class="modal-footer">
          <view class="modal-btn cancel" @click="showCancelDialog = false">
            <text>暂不取消</text>
          </view>
          <view class="modal-btn confirm" @click="confirmCancel">
            <text>确认取消</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getBookingList, cancelBooking } from '@/api/booking.js';

export default {
  data() {
    return {
      loading: false,
      loadingMore: false,
      orders: [],
      currentStatus: 'all',
      currentPage: 1,
      hasMore: false,
      cancelReason: '',
      currentCancelOrder: null,
      showCancelDialog: false,
      statusTabs: [
        { label: '全部', value: 'all' },
        { label: '待上门', value: 'pending' },
        { label: '已完成', value: 'completed' },
        { label: '已取消', value: 'cancelled' }
      ],
      isDark: false
    };
  },
  onLoad() {
    this.checkTheme();
    this.loadOrders();
  },
  onShow() {
    this.checkTheme();
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
        uni.reLaunch({url: '/pages-nonTheme/booking'})
      }
    },
    goToBooking() {
      uni.navigateTo({ url: '/pages-nonTheme/booking' });
    },
    async loadOrders() {
      this.loading = true;
      this.currentPage = 1;
      try {
        const status = this.currentStatus === 'all' ? null : this.currentStatus;
        const res = await getBookingList(status, 1, 20);
        const data = this.extractData(res) || {};
        this.orders = this.formatOrders(data.orders || []);
        this.hasMore = (data.page || 1) < (data.totalPages || 1);
      } catch (e) {
        console.error('获取订单失败:', e);
        this.orders = [];
        this.hasMore = false;
      }
      this.loading = false;
    },
    async loadMore() {
      if (this.loadingMore || !this.hasMore) return;
      this.loadingMore = true;
      this.currentPage++;
      try {
        const status = this.currentStatus === 'all' ? null : this.currentStatus;
        const res = await getBookingList(status, this.currentPage, 20);
        const data = this.extractData(res) || {};
        this.orders = [...this.orders, ...this.formatOrders(data.orders || [])];
        this.hasMore = (data.page || 1) < (data.totalPages || 1);
      } catch (e) {
        this.currentPage--;
      }
      this.loadingMore = false;
    },
    formatOrders(rawOrders) {
      return rawOrders.map(o => ({
        id: o.id,
        orderNo: o.orderNo || `BK${Date.now()}`,
        items: (o.items || []).map((item) => ({
          ...item,
          price: Number(item.subtotal || item.price || 0)
        })),
        date: o.appointmentDate || o.date || '',
        timeSlot: o.appointmentTimeSlot || o.timeSlot || '',
        address: o.address || '',
        status: o.status || 'pending',
        estimateAmount: Number(o.totalPrice || o.estimateAmount || 0)
      }));
    },
    changeStatus(status) {
      this.currentStatus = status;
      this.loadOrders();
    },
    getStatusText(status) {
      const map = {
        pending: '待上门',
        scheduled: '待上门',
        confirmed: '已确认',
        picking: '回收中',
        completed: '已完成',
        cancelled: '已取消'
      };
      return map[status] || '未知';
    },
    showCancelModal(order) {
      this.currentCancelOrder = order;
      this.cancelReason = '';
      this.showCancelDialog = true;
    },
    async confirmCancel() {
      if (!this.currentCancelOrder) return;
      try {
        await cancelBooking(this.currentCancelOrder.id, this.cancelReason);
        uni.showToast({ title: '取消成功', icon: 'success' });
        this.showCancelDialog = false;
        this.loadOrders();
      } catch (e) {
        uni.showToast({ title: e.message || '取消失败', icon: 'none' });
      }
    }
  }
};
</script>

<style scoped>
/* ===== 主容器 ===== */
.orders-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}
.orders-page.dark-mode {
  background: linear-gradient(135deg, #28285f 0%, #28346f 30%, #322c8a 70%, #442977 100%);
}

/* ===== 背景效果 ===== */
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s; }
.orders-page:not(.dark-mode) .bg-circle { background: #10b981; }
.orders-page.dark-mode .bg-circle { background: rgba(255, 255, 255, 0.1); }
.c1 { width: 600rpx; height: 600rpx; top: -200rpx; right: -200rpx; }
.c2 { width: 400rpx; height: 400rpx; bottom: 20%; left: -200rpx; }

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

/* ===== 筛选栏（现代分段选择器） ===== */
.filter-bar {
  position: relative; z-index: 10;
  padding: 0 32rpx 24rpx;
}
.filter-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 16rpx;
  padding: 6rpx;
  gap: 4rpx;
}
.dark-mode .filter-tabs {
  background: rgba(255, 255, 255, 0.08);
}
.filter-tab {
  flex: 1;
  padding: 16rpx 0;
  border-radius: 12rpx;
  font-size: 26rpx; font-weight: 600;
  color: #6b7280;
  text-align: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}
.dark-mode .filter-tab {
  color: rgba(255, 255, 255, 0.6);
}
.filter-tab.active {
  background: #fff;
  color: #10b981;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}
.dark-mode .filter-tab.active {
  background: rgba(255, 255, 255, 0.15);
  color: #34d399;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.2);
}
.filter-tab:active { transform: scale(0.97); }

/* ===== 主内容区 ===== */
.main-scroll { position: relative; z-index: 10; height: calc(100vh - env(safe-area-inset-top) - 88rpx - 80rpx); }
.content-wrapper { padding: 0 32rpx 40rpx; }

/* ===== 加载态 ===== */
.loading-wrap { text-align: center; padding: 80rpx; }
.loading-spinner {
  width: 64rpx; height: 64rpx;
  border: 4rpx solid rgba(16, 185, 129, 0.2);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16rpx;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { color: #9ca3af; font-size: 26rpx; }
.dark-mode .loading-text { color: rgba(255, 255, 255, 0.5); }

/* ===== 订单卡片（新拟态设计） ===== */
.order-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.08);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.order-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4rpx;
  background: linear-gradient(90deg, #10b981, #34d399);
  opacity: 0;
  transition: opacity 0.3s;
}
.order-card:active { transform: scale(0.98); }
.order-card:active::before { opacity: 1; }
.dark-mode .order-card {
  background: rgba(255, 255, 255, 0.08);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.2);
}
.order-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24rpx;
}
.order-id {
  color: #9ca3af;
  font-size: 22rpx;
  font-family: monospace;
  letter-spacing: 0.5rpx;
}
.dark-mode .order-id { color: rgba(255, 255, 255, 0.5); }
.order-status {
  padding: 8rpx 20rpx;
  border-radius: 24rpx;
  font-size: 22rpx; font-weight: 700;
  display: flex; align-items: center; gap: 6rpx;
}
.order-status::before {
  content: '';
  width: 8rpx; height: 8rpx;
  border-radius: 50%;
  display: inline-block;
}
.status-pending, .status-scheduled {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.status-pending::before, .status-scheduled::before { background: #f59e0b; }
.dark-mode .status-pending, .dark-mode .status-scheduled {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}
.status-completed {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.status-completed::before { background: #10b981; }
.dark-mode .status-completed {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}
.status-cancelled {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}
.status-cancelled::before { background: #ef4444; }
.dark-mode .status-cancelled {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.order-items {
  margin-bottom: 24rpx;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
}
.dark-mode .order-items { background: rgba(255, 255, 255, 0.05); }
.order-item {
  display: flex; align-items: center;
  padding: 14rpx 0;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.04);
}
.dark-mode .order-item { border-bottom-color: rgba(255, 255, 255, 0.06); }
.order-item:last-child { border-bottom: none; }
.item-icon {
  font-size: 36rpx;
  margin-right: 16rpx;
  width: 48rpx; height: 48rpx;
  display: flex; align-items: center; justify-content: center;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 12rpx;
}
.item-name {
  flex: 1;
  color: #1f2937;
  font-size: 26rpx;
  font-weight: 500;
}
.dark-mode .item-name { color: #fff; }
.item-price {
  color: #10b981;
  font-size: 28rpx;
  font-weight: 700;
}
.dark-mode .item-price { color: #34d399; }
.more-text {
  color: #9ca3af;
  font-size: 24rpx;
  font-style: italic;
}
.dark-mode .more-text { color: rgba(255, 255, 255, 0.5); }

.order-info {
  margin-bottom: 24rpx;
  display: grid;
  gap: 12rpx;
}
.info-row {
  display: flex;
  align-items: center;
  padding: 12rpx 16rpx;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12rpx;
}
.dark-mode .info-row { background: rgba(255, 255, 255, 0.05); }
.info-label {
  color: #9ca3af;
  font-size: 24rpx;
  min-width: 120rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.dark-mode .info-label { color: rgba(255, 255, 255, 0.6); }
.info-value {
  flex: 1;
  color: #1f2937;
  font-size: 24rpx;
  font-weight: 500;
  text-align: right;
}
.dark-mode .info-value { color: #fff; }

.order-amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-top: 2rpx dashed rgba(0, 0, 0, 0.08);
  margin-bottom: 16rpx;
}
.dark-mode .order-amount { border-top-color: rgba(255, 255, 255, 0.1); }
.amount-label { color: #6b7280; font-size: 24rpx; }
.dark-mode .amount-label { color: rgba(255, 255, 255, 0.7); }
.amount-value {
  color: #10b981;
  font-size: 40rpx;
  font-weight: 800;
  letter-spacing: -1rpx;
}
.dark-mode .amount-value { color: #34d399; }

.order-actions {
  display: flex;
  justify-content: flex-end;
}
.action-btn {
  padding: 14rpx 32rpx;
  border-radius: 28rpx;
  font-size: 26rpx;
  font-weight: 600;
  transition: all 0.3s;
}
.action-btn:active { transform: scale(0.96); }
.cancel-btn {
  background: rgba(239, 68, 68, 0.1);
  border: 1rpx solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
}
.dark-mode .cancel-btn {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

/* ===== 空状态（居中优化） ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 160rpx 40rpx;
  min-height: 50vh;
}
.empty-icon {
  font-size: 120rpx;
  margin-bottom: 32rpx;
  opacity: 0.6;
  filter: grayscale(0.3);
}
.empty-text {
  color: #9ca3af;
  font-size: 30rpx;
  margin-bottom: 48rpx;
  font-weight: 500;
}
.dark-mode .empty-text { color: rgba(255, 255, 255, 0.5); }
.empty-btn {
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  padding: 24rpx 56rpx;
  border-radius: 48rpx;
  font-size: 30rpx;
  font-weight: 700;
  box-shadow: 0 8rpx 24rpx rgba(16, 185, 129, 0.35);
  transition: all 0.3s;
}
.empty-btn:active {
  transform: scale(0.96);
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.25);
}
.empty-btn::before {
  content: '+';
  font-size: 32rpx;
  font-weight: 400;
}

.load-more {
  text-align: center;
  padding: 32rpx;
  color: #10b981;
  font-size: 26rpx;
  font-weight: 600;
}
.dark-mode .load-more { color: #34d399; }

/* ===== 取消弹窗（优化） ===== */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(8px);
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.modal-content {
  background: #fff;
  border-radius: 28rpx;
  width: 90%; max-width: 600rpx;
  overflow: hidden;
  box-shadow: 0 24rpx 80rpx rgba(0, 0, 0, 0.25);
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes slideUp {
  from { transform: translateY(40rpx); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.dark-mode .modal-content { background: rgba(40, 40, 95, 0.98); }
.modal-header {
  padding: 36rpx 32rpx 24rpx;
  text-align: center;
}
.modal-title {
  color: #1f2937;
  font-size: 32rpx;
  font-weight: 700;
}
.dark-mode .modal-title { color: #fff; }
.modal-body { padding: 0 32rpx 32rpx; }
.cancel-textarea {
  width: 100%; min-height: 200rpx;
  background: rgba(0, 0, 0, 0.04);
  border: 2rpx solid rgba(0, 0, 0, 0.06);
  border-radius: 20rpx;
  padding: 24rpx;
  color: #1f2937;
  font-size: 28rpx;
  box-sizing: border-box;
  transition: border-color 0.3s;
}
.cancel-textarea:focus {
  border-color: rgba(16, 185, 129, 0.4);
  outline: none;
}
.dark-mode .cancel-textarea {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.textarea-placeholder { color: #9ca3af; }
.dark-mode .textarea-placeholder { color: rgba(255, 255, 255, 0.5); }
.modal-footer {
  display: flex;
  gap: 20rpx;
  padding: 24rpx 32rpx 32rpx;
}
.modal-btn {
  flex: 1;
  padding: 24rpx;
  border-radius: 20rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: 700;
  transition: all 0.3s;
}
.modal-btn:active { transform: scale(0.97); }
.modal-btn.cancel {
  background: rgba(0, 0, 0, 0.04);
  color: #6b7280;
}
.dark-mode .modal-btn.cancel {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}
.modal-btn.confirm {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  box-shadow: 0 4rpx 16rpx rgba(239, 68, 68, 0.3);
}
</style>
