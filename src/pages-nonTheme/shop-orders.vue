<template>
  <ShopShell title="我的订单" @back="backFromShopPage()">
    <view class="shop-card shop-tabs">
      <view v-for="tab in shopStatusTabs" :key="tab.value" class="shop-tab" :class="{ active: status === tab.value }" @click="changeStatus(tab.value)">{{ tab.label }}</view>
    </view>
    <view v-if="loading && !orders.length" class="shop-state">正在加载订单...</view>
    <view v-else-if="!error && !orders.length" class="shop-card shop-state">
      <ManifestIcon id="empty_state" :scale="2" /><view>暂无{{ currentLabel }}订单</view>
      <button class="shop-button" @click="returnToShop">去商城逛逛</button>
    </view>
    <view v-for="order in orders" :key="order.id" class="shop-card shop-order-card">
      <view class="shop-order-top"><text class="shop-muted">订单号 {{ order.orderNo || '—' }}</text><text class="shop-status" :class="order.status">{{ orderStatus(order.status) }}</text></view>
      <view class="shop-product">
        <image v-if="orderImage(order)" :src="orderImage(order)" class="shop-image" mode="aspectFill" />
        <view v-else class="shop-image shop-state"><ManifestIcon id="store" /></view>
        <view class="shop-product-info">
          <text class="shop-product-name">{{ order.productName || order.productSnapshot?.name || '商品信息待核实' }}</text>
          <view class="shop-order-meta"><view>下单时间 {{ orderTime(order.purchasedAt || order.createdAt) }}</view><view>数量 {{ order.quantity }} 件</view></view>
          <view class="shop-points"><ManifestIcon id="points_coin" />{{ order.totalPoints }} 积分</view>
        </view>
      </view>
      <view class="shop-order-bottom">
        <text class="shop-muted">{{ order.status === 'historical' ? '旧记录仅供核实，不支持订单操作' : '查看收货信息及订单进度' }}</text>
        <button class="shop-button shop-outline shop-small" @click="viewOrder(order)">查看详情 ›</button>
      </view>
    </view>
    <view v-if="error" class="shop-card shop-state"><text class="shop-error">{{ error }}</text><button class="shop-button" @click="load(nextPage)">重新加载</button></view>
    <view v-else-if="orders.length" class="shop-state">
      <button v-if="hasMore" class="shop-button shop-outline" :disabled="loading" @click="load(nextPage)">{{ loading ? '正在加载...' : '加载更多' }}</button>
      <text v-else>已显示全部 {{ total }} 条订单</text>
    </view>
  </ShopShell>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow, onReachBottom, onUnload } from '@dcloudio/uni-app'
import { fetchShopOrders } from '@/api/shop'
import ShopShell from '@/pages-nonTheme/components/shop/ShopShell.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { backFromShopPage, orderImage, orderStatus, orderTime, returnToShop, shopError, shopStatusTabs } from '@/pages-nonTheme/utils/shop-orders'
const status = ref('')
const orders = ref([])
const total = ref(0)
const nextPage = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const error = ref('')
const currentLabel = computed(() => shopStatusTabs.find(tab => tab.value === status.value)?.label.replace('全部', '') || '')
let version = 0
onShow(() => reset())
onUnload(() => { version++ })
onReachBottom(() => { if (hasMore.value && !error.value) load(nextPage.value) })
function reset() {
  version++
  loading.value = false
  orders.value = []
  total.value = 0
  nextPage.value = 1
  hasMore.value = false
  load(1)
}
function changeStatus(value) {
  if (value === status.value) return
  status.value = value
  reset()
}
async function load(page) {
  if (loading.value) return
  const ticket = version
  loading.value = true
  error.value = ''
  try {
    const response = await fetchShopOrders(status.value, page)
    if (ticket !== version) return
    const data = response.data
    if (!Array.isArray(data?.orders) || !Number.isFinite(Number(data.totalPages)) || !Number.isFinite(Number(data.total))) throw new Error('订单数据异常，请重试')
    orders.value = page === 1 ? data.orders : [...orders.value, ...data.orders.filter(item => !orders.value.some(existing => String(existing.id) === String(item.id)))]
    total.value = Number(data.total)
    nextPage.value = page + 1
    hasMore.value = page < Number(data.totalPages)
  } catch (reason) { if (ticket === version) error.value = shopError(reason) }
  finally { if (ticket === version) loading.value = false }
}
function viewOrder(order) { uni.navigateTo({ url: `/pages-nonTheme/shop-order-detail?id=${encodeURIComponent(order.id)}` }) }
</script>
