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
            <view class="order-actions" v-if="order.status === 'pending' || order.status === 'scheduled'">
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
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    goBack() { uni.navigateBack(); },
    goToBooking() {
      uni.navigateTo({ url: '/pages-nonTheme/booking/booking' });
    },
    async loadOrders() {
      this.loading = true;
      this.currentPage = 1;
      try {
        const status = this.currentStatus === 'all' ? null : this.currentStatus;
        const res = await getBookingList(status, 1, 20);
        if (res.success && res.data) {
          this.orders = this.formatOrders(res.data.orders || []);
          this.hasMore = (res.data.page || 1) < (res.data.totalPages || 1);
        } else {
          this.orders = this.getMockOrders();
          this.hasMore = false;
        }
      } catch (e) {
        console.error('获取订单失败:', e);
        this.orders = this.getMockOrders();
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
        if (res.success && res.data) {
          this.orders = [...this.orders, ...this.formatOrders(res.data.orders || [])];
          this.hasMore = (res.data.page || 1) < (res.data.totalPages || 1);
        } else {
          this.currentPage--;
        }
      } catch (e) {
        this.currentPage--;
      }
      this.loadingMore = false;
    },
    formatOrders(rawOrders) {
      return rawOrders.map(o => ({
        id: o.id,
        orderNo: o.orderNo || `BK${Date.now()}`,
        items: o.items || [],
        date: o.date || '',
        timeSlot: o.timeSlot || '',
        address: o.address || '',
        status: o.status || 'pending',
        estimateAmount: o.estimateAmount || 0
      }));
    },
    getMockOrders() {
      return [
        {
          id: 1,
          orderNo: 'BK202404050001',
          items: [
            { name: '废纸', icon: '📄', price: 2.40 },
            { name: '塑料', icon: '🧴', price: 1.50 },
            { name: '金属', icon: '🔩', price: 3.00 }
          ],
          date: '2024-04-06',
          timeSlot: '09:00-10:00',
          address: '北京市朝阳区XX小区XX栋XX室',
          status: 'pending',
          estimateAmount: 6.90
        },
        {
          id: 2,
          orderNo: 'BK202404040001',
          items: [
            { name: '旧衣物', icon: '👕', price: 3.00 },
            { name: '书籍', icon: '📚', price: 4.00 }
          ],
          date: '2024-04-04',
          timeSlot: '14:00-15:00',
          address: '北京市海淀区XX街道XX号',
          status: 'completed',
          estimateAmount: 7.00
        }
      ];
    },
    changeStatus(status) {
      this.currentStatus = status;
      this.loadOrders();
    },
    getStatusText(status) {
      const map = {
        pending: '待上门',
        scheduled: '待上门',
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
        const res = await cancelBooking(this.currentCancelOrder.id, this.cancelReason);
        if (res.success) {
          uni.showToast({ title: '取消成功', icon: 'success' });
          this.showCancelDialog = false;
          this.loadOrders();
        } else {
          uni.showToast({ title: res.msg || '取消失败', icon: 'none' });
        }
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

/* ===== 筛选栏（横向滚动） ===== */
.filter-bar {
  position: relative; z-index: 10;
  padding: 0 32rpx 24rpx;
}
.filter-tabs {
  display: flex; gap: 16rpx;
  overflow-x: auto; white-space: nowrap;
  -webkit-overflow-scrolling: touch;
}
.filter-tabs::-webkit-scrollbar { display: none; }
.filter-tab {
  padding: 12rpx 28rpx;
  border-radius: 40rpx;
  font-size: 24rpx; font-weight: 600;
  color: #6b7280;
  background: rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  transition: all 0.3s;
}
.dark-mode .filter-tab { color: rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.1); }
.filter-tab.active {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.3);
}
.filter-tab:active { transform: scale(0.95); }

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

/* ===== 订单卡片 ===== */
.order-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.order-card:active { transform: scale(0.99); }
.dark-mode .order-card { background: rgba(255, 255, 255, 0.1); border: 1rpx solid rgba(255, 255, 255, 0.1); }
.order-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20rpx;
}
.order-id { color: #9ca3af; font-size: 22rpx; }
.dark-mode .order-id { color: rgba(255, 255, 255, 0.5); }
.order-status {
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-size: 20rpx; font-weight: 600;
}
.status-pending, .status-scheduled { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.dark-mode .status-pending, .dark-mode .status-scheduled { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.status-completed { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.dark-mode .status-completed { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.status-cancelled { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.dark-mode .status-cancelled { background: rgba(239, 68, 68, 0.2); color: #f87171; }

.order-items { margin-bottom: 20rpx; }
.order-item {
  display: flex; align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.04);
}
.dark-mode .order-item { border-bottom-color: rgba(255, 255, 255, 0.06); }
.order-item:last-child { border-bottom: none; }
.item-icon { font-size: 32rpx; margin-right: 16rpx; }
.item-name { flex: 1; color: #1f2937; font-size: 26rpx; font-weight: 500; }
.dark-mode .item-name { color: #fff; }
.item-price { color: #10b981; font-size: 26rpx; font-weight: 700; }
.dark-mode .item-price { color: #34d399; }
.more-text { color: #9ca3af; font-size: 24rpx; }
.dark-mode .more-text { color: rgba(255, 255, 255, 0.5); }

.order-info { margin-bottom: 20rpx; }
.info-row { display: flex; justify-content: space-between; padding: 10rpx 0; }
.info-label { color: #9ca3af; font-size: 24rpx; }
.dark-mode .info-label { color: rgba(255, 255, 255, 0.6); }
.info-value { color: #1f2937; font-size: 24rpx; font-weight: 500; }
.dark-mode .info-value { color: #fff; }

.order-amount {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(0, 0, 0, 0.04);
}
.dark-mode .order-amount { border-top-color: rgba(255, 255, 255, 0.08); }
.amount-label { color: #6b7280; font-size: 24rpx; }
.dark-mode .amount-label { color: rgba(255, 255, 255, 0.7); }
.amount-value { color: #10b981; font-size: 36rpx; font-weight: 800; }
.dark-mode .amount-value { color: #34d399; }

.order-actions { margin-top: 20rpx; display: flex; justify-content: flex-end; }
.action-btn { padding: 12rpx 28rpx; border-radius: 40rpx; font-size: 24rpx; font-weight: 600; }
.cancel-btn {
  background: rgba(239, 68, 68, 0.1);
  border: 1rpx solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
}
.dark-mode .cancel-btn { background: rgba(239, 68, 68, 0.2); color: #f87171; }

/* ===== 空状态 ===== */
.empty-state { text-align: center; padding: 120rpx 40rpx; }
.empty-icon { font-size: 96rpx; display: block; margin-bottom: 24rpx; opacity: 0.5; }
.empty-text { color: #9ca3af; font-size: 28rpx; margin-bottom: 40rpx; }
.dark-mode .empty-text { color: rgba(255, 255, 255, 0.5); }
.empty-btn {
  display: inline-block;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  padding: 20rpx 48rpx;
  border-radius: 40rpx;
  font-size: 28rpx; font-weight: 700;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.3);
  transition: all 0.3s;
}
.empty-btn:active { transform: scale(0.96); }

.load-more { text-align: center; padding: 28rpx; color: #10b981; font-size: 26rpx; font-weight: 600; }
.dark-mode .load-more { color: #34d399; }

/* ===== 取消弹窗 ===== */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}
.modal-content {
  background: #fff;
  border-radius: 24rpx;
  width: 90%; max-width: 600rpx;
  overflow: hidden;
  box-shadow: 0 16rpx 64rpx rgba(0, 0, 0, 0.2);
}
.dark-mode .modal-content { background: rgba(40, 40, 95, 0.98); }
.modal-header {
  padding: 32rpx;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.06);
}
.dark-mode .modal-header { border-bottom-color: rgba(255, 255, 255, 0.1); }
.modal-title { color: #1f2937; font-size: 30rpx; font-weight: 700; }
.dark-mode .modal-title { color: #fff; }
.modal-body { padding: 32rpx; }
.cancel-textarea {
  width: 100%; min-height: 200rpx;
  background: rgba(0, 0, 0, 0.04);
  border: 1rpx solid rgba(0, 0, 0, 0.06);
  border-radius: 16rpx;
  padding: 24rpx;
  color: #1f2937;
  font-size: 28rpx;
  box-sizing: border-box;
}
.dark-mode .cancel-textarea { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); color: #fff; }
.textarea-placeholder { color: #9ca3af; }
.dark-mode .textarea-placeholder { color: rgba(255, 255, 255, 0.5); }
.modal-footer { display: flex; gap: 24rpx; padding: 24rpx 32rpx; }
.modal-btn {
  flex: 1; padding: 24rpx;
  border-radius: 20rpx; text-align: center;
  font-size: 28rpx; font-weight: 700;
  transition: all 0.3s;
}
.modal-btn:active { transform: scale(0.97); }
.modal-btn.cancel { background: rgba(0, 0, 0, 0.04); color: #6b7280; }
.dark-mode .modal-btn.cancel { background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.8); }
.modal-btn.confirm { background: #ef4444; color: #fff; box-shadow: 0 4rpx 16rpx rgba(239, 68, 68, 0.3); }
</style>
