<template>
  <view :class="['shop-admin', isDark ? 'dark-theme' : 'light-theme admin-light-theme']" :style="screenStyle">
    <view class="panel page-header">
      <button class="btn header-control" :disabled="busy" :aria-label="scene === 'list' ? '返回' : '返回列表'" @click="goBack">
        <ManifestIcon id="back" :scale="1" />
      </button>
      <view class="page-title">商城管理</view>
      <button v-if="scene !== 'editor'" class="btn header-control" :disabled="busy || authLoading || currentLoading" aria-label="刷新" @click="refreshCurrent">
        <ManifestIcon id="refresh" />
      </button>
      <view v-else class="header-spacer"></view>
    </view>

    <view v-if="authLoading" class="panel state" role="status">正在验证管理员权限…</view>
    <view v-else-if="authError" class="panel state" role="alert">
      <text class="error">{{ authError }}</text>
      <button class="btn" @click="initialize">重新验证</button>
    </view>
    <template v-else-if="authorized">
      <view v-if="notice" class="notice" role="status">{{ notice }}</view>

      <template v-if="scene === 'list'">
        <view class="tabs" role="tablist">
          <button v-for="tab in tabs" :key="tab.value" :class="['btn', { selected: activeTab === tab.value }]"
            role="tab" :aria-selected="activeTab === tab.value" @click="selectTab(tab.value)">{{ tab.label }}</button>
        </view>
        <view class="panel">
          <view class="section-heading">
            <view>
              <view class="section-title">{{ activeTab === 'products' ? '商品管理' : '订单管理' }}</view>
              <text class="muted">{{ activeTab === 'products' ? '实物可下单，优惠券仅供商品管理' : '查询订单、核对收货信息并确认发货' }}</text>
            </view>
            <button v-if="activeTab === 'products'" class="btn primary" @click="editProduct()">新增商品</button>
          </view>

          <view v-if="activeTab === 'orders'" class="filters">
            <picker :range="orderStatuses" range-key="label" :value="statusIndex" @change="changeOrderStatus">
              <view class="control filter-status">{{ orderStatuses[statusIndex].label }} ▾</view>
            </picker>
            <input v-model="searchInput" class="control search" aria-label="搜索订单" placeholder="搜索订单号、商品或收货信息"
              confirm-type="search" @confirm="searchOrders" />
            <button class="btn primary" @click="searchOrders">搜索</button>
            <button class="btn" @click="resetOrderFilters">重置</button>
          </view>

          <view v-if="currentList.loading" class="state" role="status">正在加载{{ activeTab === 'products' ? '商品' : '订单' }}…</view>
          <view v-else-if="currentList.error" class="state" role="alert">
            <text class="error">{{ currentList.error }}</text>
            <button class="btn" @click="loadList(activeTab, currentList.page)">重试</button>
          </view>
          <view v-else-if="!currentList.items.length" class="state">
            <text class="muted">{{ activeTab === 'products' ? '暂无商品，点击「新增商品」开始管理' : '暂无符合条件的订单' }}</text>
          </view>
          <template v-else>
            <view v-if="activeTab === 'products'" class="records">
              <view v-for="product in products.items" :key="product.id" class="record product-record">
                <image v-if="product.image" class="product-image" :src="product.image" mode="aspectFit" />
                <view v-else class="product-image image-empty">暂无图片</view>
                <view class="record-main">
                  <view class="record-title">{{ product.name }}</view>
                  <text class="muted copy">{{ product.description || '暂无描述' }}</text>
                  <view class="tags">
                    <text class="badge">{{ typeLabel(product.type) }}</text>
                    <text :class="['badge', product.status === 'active' ? 'success' : '']">{{ product.status === 'active' ? '上架' : '下架' }}</text>
                    <text v-if="product.hot" class="badge">热门</text>
                    <text class="muted">分类：{{ categoryLabel(product.category) }}</text>
                  </view>
                </view>
                <view class="record-numbers"><text class="points">{{ product.points }} 积分</text><text class="muted">库存 {{ product.stock }}</text></view>
                <button class="btn" @click="editProduct(product)">编辑</button>
              </view>
            </view>
            <view v-else class="records">
              <view v-for="order in orders.items" :key="order.id" class="record order-record">
                <view class="record-main">
                  <view class="record-title">{{ order.productName || '未命名商品' }} × {{ order.quantity }}</view>
                  <text class="muted copy">订单号：{{ order.orderNo || order.id }}</text>
                  <text class="muted copy">{{ order.recipientName || '未填写收货人' }} · {{ formatTime(order.purchasedAt) }}</text>
                </view>
                <text :class="['badge', { success: order.status === 'completed' }]">{{ statusLabel(order.status) }}</text>
                <text class="points">{{ order.totalPoints }} 积分</text>
                <button class="btn" @click="openOrder(order.id)">查看详情</button>
              </view>
            </view>
          </template>
          <view v-if="currentList.loaded && !currentList.loading && !currentList.error" class="pagination">
            <text class="muted">共 {{ currentList.total }} 条 · 第 {{ currentList.page }} / {{ Math.max(1, currentList.totalPages) }} 页</text>
            <button class="btn" :disabled="currentList.page <= 1" @click="loadList(activeTab, currentList.page - 1)">上一页</button>
            <button class="btn" :disabled="currentList.page >= currentList.totalPages" @click="loadList(activeTab, currentList.page + 1)">下一页</button>
          </view>
        </view>
      </template>

      <view v-else-if="scene === 'editor'" class="panel">
        <view class="section-heading">
          <view class="section-title">{{ editingId === null ? '新增商品' : '编辑商品' }}</view>
          <text v-if="editingId !== null" class="muted">商品 ID：{{ editingId }}</text>
        </view>
        <view class="form-grid">
          <view class="field"><text class="field-label">商品名称 *</text><input v-model="form.name" class="control" :maxlength="255" :disabled="saving" aria-label="商品名称" placeholder="请输入商品名称，最多 255 字" /></view>
          <view class="field"><text class="field-label">分类编号 *</text><picker :range="categoryOptions" range-key="label" :value="categoryIndex" :disabled="saving" @change="form.category = String(categoryOptions[Number($event.detail.value)].value)"><view class="control">{{ categoryOptions[categoryIndex]?.value === Number(form.category) ? categoryOptions[categoryIndex].label : '请选择分类编号（1–5）' }} ▾</view></picker><text class="hint">1 环保用品 / 2 数码配件 / 3 生活用品 / 4 学习用品 / 5 美食券</text></view>
          <view class="field full"><text class="field-label">商品描述</text><textarea v-model="form.description" class="control textarea" :maxlength="-1" :disabled="saving" aria-label="商品描述" placeholder="请输入商品描述" /></view>
          <view class="field full"><text class="field-label">图片地址</text><input v-model="form.image" class="control" :disabled="saving" aria-label="商品图片地址" placeholder="请输入图片 URL 或已有资源路径" /></view>
          <view class="field"><text class="field-label">兑换积分 *</text><input v-model="form.points" type="text" class="control" :disabled="saving" aria-label="兑换积分" placeholder="正整数，如 100" /></view>
          <view class="field"><text class="field-label">库存 *</text><input v-model="form.stock" type="text" class="control" :disabled="saving" aria-label="商品库存" placeholder="非负整数，0 表示无库存" /></view>
          <view class="field full"><text class="field-label">商品特点</text><textarea v-model="form.features" class="control textarea" :maxlength="-1" :disabled="saving" aria-label="商品特点" placeholder="请输入商品特点" /></view>
          <view class="field"><text class="field-label">商品类型</text><picker :range="productTypes" range-key="label" :value="typeIndex" :disabled="saving" @change="form.type = productTypes[Number($event.detail.value)].value"><view class="control">{{ productTypes[typeIndex].label }} ▾</view></picker><text class="hint">仅实物支持下单；优惠券可新增、编辑与上下架。</text></view>
          <view class="field"><text class="field-label">上架状态</text><picker :range="productStatuses" range-key="label" :value="productStatusIndex" :disabled="saving" @change="form.status = productStatuses[Number($event.detail.value)].value"><view class="control">{{ productStatuses[productStatusIndex].label }} ▾</view></picker></view>
          <view class="field"><text class="field-label">热门商品</text><switch :checked="form.hot" :disabled="saving" color="#18a77c" @change="form.hot = $event.detail.value" /></view>
        </view>
        <view v-if="formError" class="error inline-message" role="alert">{{ formError }}</view>
        <view class="form-actions">
          <button class="btn primary" :disabled="saving" @click="saveProduct">{{ saving ? '正在保存…' : '保存商品' }}</button>
          <button class="btn" :disabled="saving" @click="goBack">取消</button>
        </view>
      </view>

      <view v-else-if="scene === 'detail'" class="panel">
        <view class="section-heading"><view class="section-title">订单详情</view><text v-if="orderDetail" class="badge">{{ statusLabel(orderDetail.status) }}</text></view>
        <view v-if="detailLoading" class="state" role="status">正在加载订单详情…</view>
        <view v-else-if="detailError" class="state" role="alert"><text class="error">{{ detailError }}</text><button class="btn" @click="loadOrderDetail">重试</button></view>
        <template v-else-if="orderDetail">
          <view class="detail-grid">
            <view class="detail-section">
              <view class="section-title small">订单信息</view>
              <view v-for="row in orderRows" :key="row.label" class="detail-row"><text class="muted">{{ row.label }}</text><text class="detail-value" selectable>{{ row.value }}</text></view>
            </view>
            <view class="detail-section">
              <view class="section-title small">收货与物流</view>
              <view v-for="row in deliveryRows" :key="row.label" class="detail-row"><text class="muted">{{ row.label }}</text><text class="detail-value" selectable>{{ row.value }}</text></view>
            </view>
          </view>
          <view class="detail-section snapshot">
            <view class="section-title small">下单商品快照</view>
            <template v-if="snapshot">
              <image v-if="snapshot.image" class="snapshot-image" :src="snapshot.image" mode="aspectFit" />
              <view v-for="row in snapshotRows" :key="row.label" class="detail-row"><text class="muted">{{ row.label }}</text><text class="detail-value" selectable>{{ row.value }}</text></view>
            </template>
            <text v-else class="muted">此订单未提供商品快照</text>
            <text v-if="rawSnapshot" class="snapshot-raw" selectable>{{ rawSnapshot }}</text>
          </view>
          <view v-if="orderDetail.status === 'pending' && !shipmentConfirmed" class="detail-section shipping">
            <view class="section-title small">确认发货</view>
            <view class="form-grid">
              <view class="field"><text class="field-label">物流公司 *</text><input v-model="shippingForm.logisticsCompany" class="control" :disabled="shipping" aria-label="物流公司" placeholder="请输入物流公司" /></view>
              <view class="field"><text class="field-label">物流单号 *</text><input v-model="shippingForm.trackingNumber" class="control" :disabled="shipping" aria-label="物流单号" placeholder="请输入物流单号" /></view>
            </view>
            <view v-if="shipError" class="error inline-message" role="alert">{{ shipError }}</view>
            <button class="btn primary ship-button" :disabled="shipping" @click="shipOrder">{{ shipping ? '正在发货…' : '确认发货' }}</button>
          </view>
          <view v-else-if="shipmentConfirmed" class="notice">发货已成功，请以刷新后的订单状态为准。</view>
          <view v-else class="muted inline-message">{{ orderDetail.status === 'historical' ? '历史订单仅供查看' : '仅待发货订单可确认发货' }}</view>
        </template>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBackPress } from '@dcloudio/uni-app'
import { userinfo } from '@/api/user'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getMiniProgramTopInset } from '@/utils/mp-top-inset.js'
import { goBackFromAdminPage } from '@/utils/admin-page-nav.js'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'
import { createAdminProduct, fetchAdminOrder, fetchAdminOrders, fetchAdminProducts, shipAdminOrder, updateAdminProduct } from './api/shop.js'

const miniProgramTopInset = getMiniProgramTopInset()
const screenStyle = miniProgramTopInset ? { paddingTop: `${miniProgramTopInset}px` } : {}

const tabs = [{ value: 'products', label: '商品管理' }, { value: 'orders', label: '订单管理' }]
const orderStatuses = [
  { value: '', label: '全部状态' }, { value: 'pending', label: '待发货' },
  { value: 'shipped', label: '已发货' }, { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' }, { value: 'historical', label: '历史订单' }
]
const productTypes = [{ value: 'physical', label: '实物' }, { value: 'coupon', label: '优惠券' }]
const productStatuses = [{ value: 'active', label: '上架' }, { value: 'inactive', label: '下架' }]
const categoryNames = { 1: '环保用品', 2: '数码配件', 3: '生活用品', 4: '学习用品', 5: '美食券' }
const categoryOptions = Object.entries(categoryNames).map(([value, label]) => ({ value: Number(value), label: `${value} · ${label}` }))
const isDark = ref(false)
const authLoading = ref(true)
const authError = ref('')
const authorized = ref(false)
const scene = ref('list')
const activeTab = ref('products')
const notice = ref('')
const newList = () => reactive({ items: [], total: 0, page: 1, totalPages: 0, loading: false, loaded: false, error: '', revision: 0 })
const products = newList()
const orders = newList()
const currentList = computed(() => activeTab.value === 'products' ? products : orders)
const orderStatus = ref('')
const searchInput = ref('')
const appliedSearch = ref('')
const statusIndex = computed(() => Math.max(0, orderStatuses.findIndex(item => item.value === orderStatus.value)))
const editingId = ref(null)
const editingVersion = ref(null)
const emptyProduct = () => ({ name: '', description: '', image: '', points: '', stock: '', category: '', features: '', hot: false, type: 'physical', status: 'inactive' })
const form = reactive(emptyProduct())
const categoryIndex = computed(() => Math.max(0, categoryOptions.findIndex(item => item.value === Number(form.category))))
const saving = ref(false)
const formError = ref('')
const typeIndex = computed(() => Math.max(0, productTypes.findIndex(item => item.value === form.type)))
const productStatusIndex = computed(() => Math.max(0, productStatuses.findIndex(item => item.value === form.status)))
const detailId = ref(null)
const orderDetail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const shippingForm = reactive({ logisticsCompany: '', trackingNumber: '' })
const shipping = ref(false)
const shipError = ref('')
const shipmentConfirmed = ref(false)
const busy = computed(() => saving.value || shipping.value)
const currentLoading = computed(() => scene.value === 'detail' ? detailLoading.value : scene.value === 'list' && currentList.value.loading)
let detailRevision = 0
let disposed = false
let unbindTheme = () => {}

const display = value => value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const statusLabel = value => orderStatuses.find(item => item.value === value)?.label || display(value)
const typeLabel = value => productTypes.find(item => item.value === value)?.label || display(value)
const categoryLabel = value => categoryNames[value] || display(value)
function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? display(value) : date.toLocaleString('zh-CN', { hour12: false })
}
function errorMessage(error, fallback) {
  if (error?.statusCode === 403 || error?.code === 403) return error?.msg || '当前账号没有商城管理权限'
  return error?.msg || error?.message || fallback
}

const orderRows = computed(() => {
  const order = orderDetail.value || {}
  return [
    { label: '订单 ID', value: display(order.id) }, { label: '订单号', value: display(order.orderNo) },
    { label: '商品', value: display(order.productName) }, { label: '数量', value: display(order.quantity) },
    { label: '单件积分', value: display(order.pointsPerItem) }, { label: '总积分', value: display(order.totalPoints) },
    { label: '下单时间', value: formatTime(order.purchasedAt) }, { label: '发货时间', value: formatTime(order.shippedAt) },
    { label: '完成时间', value: formatTime(order.completedAt) }, { label: '取消时间', value: formatTime(order.cancelledAt) }
  ]
})
const deliveryRows = computed(() => {
  const order = orderDetail.value || {}
  return [
    { label: '收货人', value: display(order.recipientName) }, { label: '联系电话', value: display(order.recipientPhone) },
    { label: '收货地址', value: display(order.recipientAddress) }, { label: '物流公司', value: display(order.logisticsCompany) },
    { label: '物流单号', value: display(order.trackingNumber) }
  ]
})
const snapshot = computed(() => {
  const value = orderDetail.value?.productSnapshot
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch (_) { return null }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
})
const rawSnapshot = computed(() => {
  const value = orderDetail.value?.productSnapshot
  return value ? (snapshot.value ? JSON.stringify(snapshot.value, null, 2) : display(value)) : ''
})
const snapshotRows = computed(() => {
  const item = snapshot.value || {}
  return [
    { label: '商品名称', value: display(item.name) }, { label: '描述', value: display(item.description) },
    { label: '积分', value: display(item.points) }, { label: '库存', value: display(item.stock) },
    { label: '分类', value: categoryLabel(item.category) }, { label: '特点', value: display(item.features) },
    { label: '类型', value: typeLabel(item.type) }
  ]
})

function syncTheme() { isDark.value = applyStoredTheme() === 'dark' }
function onThemeStorage(event) { if (!event || event.key === 'app_theme') syncTheme() }

async function initialize() {
  if (authorized.value) return
  authLoading.value = true
  authError.value = ''
  try {
    const response = await userinfo('false')
    if (disposed) return
    if (response?.code !== 0 || response?.data?.isAdmin !== true) {
      uni.removeStorageSync('isAdmin')
      throw new Error('当前账号没有商城管理权限，请使用管理员账号登录')
    }
    uni.setStorageSync('isAdmin', true)
    authorized.value = true
    await loadList(activeTab.value, 1)
  } catch (error) {
    if (!disposed) authError.value = errorMessage(error, '管理员权限验证失败，请重试')
  } finally {
    if (!disposed) authLoading.value = false
  }
}

async function loadList(tab, page = 1) {
  if (!authorized.value || disposed) return
  const list = tab === 'products' ? products : orders
  const revision = ++list.revision
  list.loading = true
  list.error = ''
  list.page = page
  try {
    const data = tab === 'products'
      ? await fetchAdminProducts({ page })
      : await fetchAdminOrders({ status: orderStatus.value, q: appliedSearch.value, page })
    if (disposed || revision !== list.revision) return
    if (!Array.isArray(data?.[tab]) || !Number.isInteger(data.total) || data.total < 0 ||
      !Number.isInteger(data.page) || data.page < 1 || !Number.isInteger(data.totalPages) || data.totalPages < 0) {
      throw new Error('列表数据格式异常，请重试')
    }
    // 编辑或发货后当前页可能已不存在；空列表也应退回第一页。
    const lastPage = Math.max(1, data.totalPages)
    if (page > lastPage) {
      await loadList(tab, lastPage)
      return
    }
    list.items = data[tab]
    list.total = data.total
    list.page = data.page
    list.totalPages = data.totalPages
    list.loaded = true
  } catch (error) {
    if (!disposed && revision === list.revision) list.error = errorMessage(error, '列表加载失败，请重试')
  } finally {
    if (!disposed && revision === list.revision) list.loading = false
  }
}

function selectTab(tab) {
  activeTab.value = tab
  notice.value = ''
  const list = tab === 'products' ? products : orders
  if (!list.loaded && !list.loading) loadList(tab, list.page)
}
function searchOrders() {
  appliedSearch.value = searchInput.value.trim()
  loadList('orders', 1)
}
function changeOrderStatus(event) {
  orderStatus.value = orderStatuses[Number(event.detail.value)].value
  searchOrders()
}
function resetOrderFilters() {
  orderStatus.value = ''
  searchInput.value = ''
  searchOrders()
}
function editProduct(product) {
  if (busy.value) return
  editingId.value = product?.id ?? null
  editingVersion.value = product?.version ?? null
  Object.assign(form, emptyProduct())
  if (product) {
    for (const key of ['name', 'description', 'image', 'points', 'stock', 'category', 'features']) form[key] = String(product[key] ?? '')
    form.hot = product.hot === true || product.hot === 1
    form.type = product.type || 'physical'
    form.status = product.status || 'inactive'
  }
  formError.value = ''
  notice.value = ''
  scene.value = 'editor'
}
async function saveProduct() {
  if (saving.value || !authorized.value || scene.value !== 'editor') return
  formError.value = ''
  const points = String(form.points).trim()
  const stock = String(form.stock).trim()
  if (!form.name.trim()) { formError.value = '请输入商品名称'; return }
  if (form.name.trim().length > 255) { formError.value = '商品名称不能超过 255 字'; return }
  if (!/^\d+$/.test(points) || !Number.isSafeInteger(Number(points)) || Number(points) <= 0 || Number(points) > 10000000) {
    formError.value = '兑换积分必须为 1–10000000 的整数'; return
  }
  if (!/^\d+$/.test(stock) || !Number.isSafeInteger(Number(stock)) || Number(stock) > 10000000) {
    formError.value = '库存必须为 0–10000000 的整数'; return
  }
  if (!productTypes.some(item => item.value === form.type) || !productStatuses.some(item => item.value === form.status)) {
    formError.value = '请选择有效的商品类型与上架状态'; return
  }
  const category = form.category.trim()
  if (!/^[1-5]$/.test(category)) { formError.value = '分类编号必须为 1–5 的整数'; return }
  const data = {
    name: form.name.trim(), description: form.description.trim(), image: form.image.trim(),
    points: Number(points), stock: Number(stock),
    category: Number(category),
    features: form.features.trim(), hot: form.hot, type: form.type, status: form.status
  }
  saving.value = true
  try {
    if (editingId.value === null) await createAdminProduct(data)
    else await updateAdminProduct(editingId.value, { ...data, expectedVersion: editingVersion.value })
    if (disposed) return
    scene.value = 'list'
    activeTab.value = 'products'
    notice.value = '商品保存成功'
    await loadList('products', editingId.value === null ? 1 : products.page)
  } catch (error) {
    if (!disposed) formError.value = errorMessage(error, '商品保存失败，请重试')
  } finally {
    if (!disposed) saving.value = false
  }
}

function openOrder(id) {
  if (busy.value) return
  detailId.value = id
  orderDetail.value = null
  shippingForm.logisticsCompany = ''
  shippingForm.trackingNumber = ''
  shipError.value = ''
  shipmentConfirmed.value = false
  notice.value = ''
  scene.value = 'detail'
  loadOrderDetail()
}
async function loadOrderDetail() {
  if (!authorized.value || disposed || detailId.value === null) return
  const revision = ++detailRevision
  detailLoading.value = true
  detailError.value = ''
  try {
    const data = await fetchAdminOrder(detailId.value)
    if (disposed || revision !== detailRevision) return
    if (!data || String(data.id) !== String(detailId.value) || !data.status) throw new Error('订单详情格式异常，请重试')
    orderDetail.value = data
  } catch (error) {
    if (!disposed && revision === detailRevision) detailError.value = errorMessage(error, '订单详情加载失败，请重试')
  } finally {
    if (!disposed && revision === detailRevision) detailLoading.value = false
  }
}
async function shipOrder() {
  if (shipping.value || detailLoading.value || !authorized.value || orderDetail.value?.status !== 'pending' || shipmentConfirmed.value) return
  shipError.value = ''
  const logisticsCompany = shippingForm.logisticsCompany.trim()
  const trackingNumber = shippingForm.trackingNumber.trim()
  if (!logisticsCompany || !trackingNumber) { shipError.value = '请填写物流公司和物流单号'; return }
  shipping.value = true
  try {
    await shipAdminOrder(detailId.value, { logisticsCompany, trackingNumber })
    if (disposed) return
    // 发货成功但刷新失败时仍锁住提交，避免对旧 pending 快照重复发货。
    shipmentConfirmed.value = true
    notice.value = '确认发货成功'
    await Promise.all([loadOrderDetail(), loadList('orders', orders.page)])
  } catch (error) {
    if (!disposed) shipError.value = errorMessage(error, '确认发货失败，请重试')
  } finally {
    if (!disposed) shipping.value = false
  }
}
function closeScene() {
  if (busy.value) return
  ++detailRevision
  detailLoading.value = false
  scene.value = 'list'
}
function goBack() {
  if (busy.value) return
  if (scene.value !== 'list') { closeScene(); return }
  goBackFromAdminPage('shopManagement', { fallback: 'profile' })
}
function refreshCurrent() {
  if (busy.value || currentLoading.value) return
  if (!authorized.value) { initialize(); return }
  if (scene.value === 'detail') loadOrderDetail()
  else if (scene.value === 'list') loadList(activeTab.value, currentList.value.page)
}
onBackPress(() => {
  if (busy.value) return true
  if (scene.value !== 'list') { closeScene(); return true }
  return false
})
onMounted(() => {
  syncTheme()
  unbindTheme = bindThemeStorageSync()
  uni.$on('app-theme-change', syncTheme)
  // #ifdef H5
  window.addEventListener('storage', onThemeStorage)
  // #endif
  initialize()
})
onBeforeUnmount(() => {
  disposed = true
  ++detailRevision
  unbindTheme()
  uni.$off('app-theme-change', syncTheme)
  // #ifdef H5
  window.removeEventListener('storage', onThemeStorage)
  // #endif
})
</script>

<style scoped>
@import './styles/admin-light-theme.css';

.shop-admin {
  --bg: #0b1c29; --surface: #112b3b; --soft: #163446; --border: #2a4859;
  --text: #e2eff5; --muted: #9db7c6; --primary: #5ce0b4; --primary-soft: #143f3b;
  --danger: #ff9aa5; --radius: 12px;
  min-height: 100vh; box-sizing: border-box; padding: 24px;
  color: var(--text); background: var(--bg); font-size: 14px; line-height: 1.6;
}
.shop-admin.light-theme {
  --bg: var(--admin-light-bg); --surface: var(--admin-light-surface); --soft: var(--admin-light-surface-soft);
  --border: var(--admin-light-border); --text: var(--admin-light-text); --muted: var(--admin-light-text-secondary);
  --primary: var(--admin-light-primary); --primary-soft: var(--admin-light-primary-soft); --danger: #b73543;
  --radius: var(--admin-light-radius-panel);
}
.panel { max-width: 1280px; margin: 0 auto 20px; padding: 24px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-sizing: border-box; }
.light-theme .panel { box-shadow: var(--admin-light-shadow); }
.page-header, .section-heading, .filters, .record, .pagination, .form-actions, .tabs, .tags { display: flex; align-items: center; gap: 12px; }
.section-heading { justify-content: space-between; flex-wrap: wrap; }
.panel.page-header { padding: 12px 16px; flex-wrap: nowrap; }
.page-title { flex: 1; min-width: 0; text-align: center; font-size: 20px; line-height: 1.4; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.btn.header-control, .header-spacer { width: 40px; height: 40px; flex: 0 0 40px; }
.btn.header-control { padding: 0; font-size: 20px; }
/* #ifdef MP-WEIXIN */
.panel.page-header { padding-right: 108px; }
/* #endif */
.section-title { font-size: 19px; font-weight: 650; }
.section-title.small { font-size: 16px; margin-bottom: 16px; }
.section-heading { margin-bottom: 22px; }
.muted, .hint { color: var(--muted); font-size: 13px; }
.copy { display: block; white-space: pre-wrap; overflow-wrap: anywhere; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin: 0; padding: 0 16px; min-height: 36px; line-height: 1.4; font-size: 13px; font-weight: 600; color: var(--text); border: 1px solid var(--border); border-radius: 8px; background: var(--surface); box-sizing: border-box; flex-shrink: 0; }
.btn::after { border: 0; }
.btn.primary, .btn.selected { color: var(--primary); border-color: var(--primary); background: var(--primary-soft); }
.btn[disabled] { opacity: .45; color: var(--muted); }
.tabs, .notice { max-width: 1280px; margin: 0 auto 16px; }
.tabs { flex-wrap: wrap; }
.filters { margin-bottom: 22px; flex-wrap: wrap; }
.control { width: 100%; min-height: 42px; padding: 9px 12px; box-sizing: border-box; color: var(--text); background: var(--soft); border: 1px solid var(--border); border-radius: 8px; font-size: 14px; }
.filter-status { min-width: 140px; }
.search { flex: 1; min-width: 180px; }
.state { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; text-align: center; min-height: 180px; padding: 24px; box-sizing: border-box; }
.error { color: var(--danger); white-space: pre-wrap; overflow-wrap: anywhere; }
.notice { padding: 12px 16px; border-radius: 8px; box-sizing: border-box; background: var(--primary-soft); color: var(--primary); }
.record { padding: 20px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
.record-main { flex: 1; min-width: 180px; }
.record-title { font-size: 16px; font-weight: 650; overflow-wrap: anywhere; }
.product-image { width: 70px; height: 70px; flex-shrink: 0; border-radius: 8px; background: var(--soft); }
.image-empty { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; }
.record-numbers { display: flex; flex-direction: column; min-width: 100px; }
.points { color: var(--primary); font-weight: 650; }
.tags { margin-top: 8px; flex-wrap: wrap; gap: 8px; }
.badge { display: inline-block; padding: 3px 9px; border-radius: 6px; color: var(--muted); background: var(--soft); font-size: 12px; }
.badge.success { color: var(--primary); background: var(--primary-soft); }
.pagination { justify-content: flex-end; flex-wrap: wrap; border-top: 1px solid var(--border); padding-top: 20px; margin-top: 8px; }
.pagination .muted { margin-right: auto; }
.form-grid, .detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.field { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.field-label { font-weight: 600; }
.full { grid-column: 1 / -1; }
.textarea { height: 100px; }
.hint { font-size: 12px; }
.inline-message { margin: 20px 0; }
.form-actions { margin-top: 28px; flex-wrap: wrap; }
.detail-section { padding: 20px; background: var(--soft); border: 1px solid var(--border); border-radius: 10px; min-width: 0; }
.detail-row { display: flex; align-items: flex-start; gap: 16px; margin: 10px 0; }
.detail-row .muted { flex: 0 0 78px; }
.detail-value { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.snapshot, .shipping { margin-top: 20px; }
.snapshot-image { width: 100px; height: 100px; margin-bottom: 10px; }
.snapshot-raw { display: block; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; }
.ship-button { margin-top: 20px; }
@media screen and (max-width: 700px) {
  .shop-admin { padding: 12px; }
  .panel { padding: 16px; }
  .page-title { font-size: 18px; }
  .form-grid, .detail-grid { grid-template-columns: minmax(0, 1fr); }
  .detail-section { padding: 14px; }
  .product-record .record-main { min-width: calc(100% - 90px); }
  .order-record .record-main { flex-basis: 100%; }
  .filters .search { min-width: 160px; }
}
</style>
