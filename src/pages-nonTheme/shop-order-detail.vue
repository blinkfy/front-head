<template>
  <ShopShell title="订单详情" @back="backFromShopPage('orders')">
    <view v-if="loading" class="shop-state">正在加载订单详情...</view>
    <view v-else-if="error" class="shop-card shop-state"><text class="shop-error">{{ error }}</text><button class="shop-button" @click="load">重新加载</button></view>
    <template v-else-if="order">
      <view class="shop-card">
        <view class="shop-heading"><ManifestIcon :id="statusIcon" :scale="1.5" /><text class="shop-green">{{ orderStatus(order.status) }}</text></view>
        <text class="shop-description">{{ statusDescription }}</text>
      </view>
      <view v-if="order.status !== 'historical'" class="shop-card shop-timeline">
        <view v-for="(step, index) in timeline" :key="step.label" class="shop-step" :class="{ done: !!step.time }">
          <view class="shop-step-dot">{{ step.time ? '✓' : index + 1 }}</view>
          <text>{{ step.label }}</text><text class="shop-step-time">{{ step.time ? orderTime(step.time) : '等待处理' }}</text>
        </view>
      </view>
      <view class="shop-card">
        <view class="shop-heading"><ManifestIcon id="eco_products" />商品信息</view>
        <view class="shop-product">
          <image v-if="orderImage(order)" :src="orderImage(order)" class="shop-image" mode="aspectFill" />
          <view v-else class="shop-image shop-state"><ManifestIcon id="store" /></view>
          <view class="shop-product-info">
            <text class="shop-product-name">{{ order.productName || order.productSnapshot?.name || '商品信息待核实' }}</text>
            <text class="shop-description">{{ order.productSnapshot?.description || '' }}</text>
            <view class="shop-row"><text class="shop-label">数量</text><text>{{ order.quantity }} 件</text></view>
            <view class="shop-order-meta">单价 {{ order.pointsPerItem }} 积分/件</view>
            <view class="shop-points"><ManifestIcon id="points_coin" />{{ order.totalPoints }} 积分</view>
          </view>
        </view>
      </view>
      <view class="shop-card">
        <view class="shop-heading"><ManifestIcon id="map_location" />物流信息</view>
        <view class="shop-row"><text class="shop-label">物流公司</text><text class="shop-value">{{ order.logisticsCompany || '暂无物流信息' }}</text></view>
        <view class="shop-row"><text class="shop-label">物流单号</text><text class="shop-value" selectable>{{ order.trackingNumber || '—' }}</text><button v-if="order.trackingNumber" class="shop-button shop-outline shop-small" @click="copyTracking">复制</button></view>
      </view>
      <view class="shop-card">
        <view class="shop-heading"><ManifestIcon id="user_profile" />收货信息</view>
        <view class="shop-row"><text class="shop-label">收货人</text><text class="shop-value">{{ order.recipientName || '未记录' }}</text></view>
        <view class="shop-row"><text class="shop-label">联系电话</text><text class="shop-value" selectable>{{ order.recipientPhone || '未记录' }}</text></view>
        <view class="shop-row"><text class="shop-label">收货地址</text><text class="shop-value" selectable>{{ order.recipientAddress || '未记录' }}</text></view>
      </view>
      <view class="shop-card">
        <view class="shop-heading"><ManifestIcon id="reservation_order_table" />订单信息</view>
        <view class="shop-row"><text class="shop-label">订单编号</text><text class="shop-value" selectable>{{ order.orderNo || '—' }}</text></view>
        <view v-for="item in orderDates" :key="item.label" class="shop-row"><text class="shop-label">{{ item.label }}</text><text class="shop-value">{{ orderTime(item.time) }}</text></view>
      </view>
      <view v-if="order.status === 'historical'" class="shop-notice">历史兑换待核实：这是旧版兑换记录，收货及物流信息可能未记录，不支持取消或确认收货。</view>
      <view v-if="actionError" class="shop-card shop-state">
        <text class="shop-error">{{ actionError }}</text><view class="shop-description">请先刷新订单状态，核实上一次操作结果后再继续。</view>
        <button class="shop-button shop-outline" :disabled="busy" @click="load">刷新订单状态</button>
      </view>
      <button class="shop-button shop-outline" @click="goOrders">返回我的订单</button>
    </template>
    <template #fixed>
      <view v-if="order && !loading && !error && ['pending', 'shipped'].includes(order.status)" class="shop-fixed">
        <button class="shop-button" :class="{ 'shop-outline': order.status === 'pending' }" :disabled="busy || !!actionError" :loading="busy" @click="act">{{ busy ? '处理中...' : order.status === 'pending' ? '取消订单' : '确认收货' }}</button>
      </view>
    </template>
  </ShopShell>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { cancelShopOrder, fetchShopOrder, receiveShopOrder } from '@/api/shop'
import ShopShell from '@/pages-nonTheme/components/shop/ShopShell.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { backFromShopPage, orderImage, orderStatus, orderTime, shopError } from '@/pages-nonTheme/utils/shop-orders'
const id = ref('')
const order = ref(null)
const loading = ref(false)
const error = ref('')
const busy = ref(false)
const actionError = ref('')
const statusIcon = computed(() => ({ pending: 'inventory', shipped: 'map_location', completed: 'confirm', cancelled: 'close' }[order.value?.status] || 'points_info'))
const statusDescription = computed(() => ({ pending: '兑换成功，等待商家发货。发货前可取消订单。', shipped: '商品已发货，请注意查收。收到商品后再确认收货。', completed: '订单已完成，感谢您的环保行动！', cancelled: '订单已取消，积分结算以账户实际余额为准。', historical: '历史兑换待核实，旧记录仅供查询。' }[order.value?.status] || '订单状态待核实，请稍后刷新。'))
const timeline = computed(() => {
  const value = order.value || {}
  const start = { label: '兑换成功', time: value.purchasedAt || value.createdAt }
  return value.status === 'cancelled' ? [start, { label: '订单取消', time: value.cancelledAt }] : [start, { label: '商家发货', time: value.shippedAt }, { label: '确认收货', time: value.completedAt }]
})
const orderDates = computed(() => {
  const value = order.value || {}
  return [{ label: '下单时间', time: value.purchasedAt || value.createdAt }, { label: '发货时间', time: value.shippedAt }, { label: '完成时间', time: value.completedAt }, { label: '取消时间', time: value.cancelledAt }].filter((item, index) => index === 0 || item.time)
})
onLoad(options => { id.value = String(options?.id || options?.orderId || '') })
onShow(() => { load() })
async function load() {
  if (loading.value || busy.value) return
  if (!id.value) { error.value = '缺少订单信息，请返回我的订单'; return }
  loading.value = true
  error.value = ''
  try {
    const response = await fetchShopOrder(id.value)
    if (!response.data?.id || !response.data.status) throw new Error('订单详情异常，请重试')
    order.value = response.data
    actionError.value = ''
  } catch (reason) { error.value = shopError(reason) }
  finally { loading.value = false }
}
async function act() {
  if (busy.value || loading.value || actionError.value || !['pending', 'shipped'].includes(order.value?.status)) return
  busy.value = true
  const cancelling = order.value.status === 'pending'
  try {
    const confirmed = await new Promise((resolve, reject) => uni.showModal({
      title: cancelling ? '取消订单' : '确认收货',
      content: cancelling ? '确认取消此订单？取消成功后积分将按订单退回。' : '请确认已收到商品。确认后订单将完成。',
      confirmText: cancelling ? '确认取消' : '确认收货',
      confirmColor: '#00a780',
      success: result => resolve(result.confirm), fail: reject
    }))
    if (!confirmed) return
    const response = await (cancelling ? cancelShopOrder(id.value) : receiveShopOrder(id.value))
    if (!response.data?.order?.id) throw new Error('操作结果暂未确认，请刷新订单状态')
    order.value = response.data.order
    if (response.data.remainingPoints != null && Number.isFinite(Number(response.data.remainingPoints))) {
      try { uni.setStorageSync('userPoints', Number(response.data.remainingPoints)) } catch (_) {}
    }
    uni.showToast({ title: cancelling ? '订单已取消' : '已确认收货', icon: 'success' })
  } catch (reason) { actionError.value = shopError(reason, '操作失败，请刷新状态后重试') }
  finally { busy.value = false }
}
function goOrders() {
  const pages = getCurrentPages()
  if (pages[pages.length - 2]?.route === 'pages-nonTheme/shop-orders') uni.navigateBack()
  else uni.redirectTo({ url: '/pages-nonTheme/shop-orders' })
}
function copyTracking() { uni.setClipboardData({ data: String(order.value.trackingNumber) }) }
</script>
