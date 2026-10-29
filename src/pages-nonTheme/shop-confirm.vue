<template>
  <ShopShell title="确认兑换" @back="backFromShopPage()">
    <view v-if="loading" class="shop-state">正在加载兑换信息...</view>
    <view v-else-if="loadError" class="shop-card shop-state">
      <text class="shop-error">{{ loadError }}</text>
      <button class="shop-button" @click="load">重新加载</button>
    </view>
    <template v-else-if="product">
      <view class="shop-card shop-product">
        <image v-if="product.image" :src="product.image" class="shop-image" mode="aspectFill" />
        <view v-else class="shop-image shop-state"><ManifestIcon id="store" /></view>
        <view class="shop-product-info">
          <text class="shop-product-name">{{ product.name }}</text>
          <text class="shop-description">{{ product.description }}</text>
          <view class="shop-points"><ManifestIcon id="points_coin" />{{ product.points }}<text class="shop-muted">积分/件</text></view>
          <view class="shop-stepper">
            <button :disabled="locked || quantity <= 1" aria-label="减少数量" @click="quantity--">−</button>
            <text>{{ quantity }}</text>
            <button :disabled="locked || quantity >= Math.min(Number(product.stock), 99)" aria-label="增加数量" @click="quantity++">+</button>
          </view>
          <text class="shop-description">剩余库存 {{ product.stock }} 件</text>
        </view>
      </view>
      <view class="shop-card">
        <view class="shop-heading"><ManifestIcon id="points_info" />积分结算</view>
        <view class="shop-row"><text class="shop-label">当前积分</text><text class="shop-points">{{ points }}</text></view>
        <view class="shop-row"><text class="shop-label">兑换数量</text><text>{{ quantity }} 件</text></view>
        <view class="shop-row"><text class="shop-label">本次所需</text><text class="shop-points">{{ totalPoints }} 积分</text></view>
        <view class="shop-row"><text class="shop-label">预计兑换后余额</text><text :class="remaining < 0 ? 'shop-error' : 'shop-green'">{{ remaining }} 积分</text></view>
      </view>
      <view class="shop-card">
        <view class="shop-heading"><ManifestIcon id="map_location" />收货信息</view>
        <view class="shop-form-row"><text class="shop-label">收货人</text><input v-model="form.recipientName" class="shop-input" :disabled="locked" maxlength="50" placeholder="请输入收货人姓名" /></view>
        <view class="shop-form-row"><text class="shop-label">联系电话</text><input v-model="form.recipientPhone" class="shop-input" :disabled="locked" type="text" maxlength="30" placeholder="请输入完整联系电话" /></view>
        <view class="shop-form-row"><text class="shop-label">所在地区</text><view class="shop-input"><ShopRegionPicker v-model="region" :disabled="locked || addressBusy" /></view></view>
        <view class="shop-form-row"><text class="shop-label">详细地址</text><textarea v-model="form.recipientAddress" class="shop-input" :disabled="locked || addressBusy" maxlength="500" auto-height placeholder="请输入街道、小区、楼栋及门牌号" /></view>
        <ShopAddressPicker :model-value="fullAddress" :disabled="locked" :auto-locate="addressReady" @select="applyLocatedAddress" @busy-change="addressBusy = $event" />
      </view>
      <view class="shop-notice">
        <view class="shop-heading"><ManifestIcon id="points_info" />兑换说明</view>
        <view>1. 仅支持实物商品，兑换成功后进入待发货状态。</view>
        <view>2. 请核对收货信息；最终库存及积分以服务端结算为准。</view>
        <view v-if="unavailable" class="shop-error">{{ unavailable }}</view>
      </view>
    </template>
    <view v-if="intent && !result" class="shop-card">
      <view class="shop-description">本次请求已保存。请使用下方按钮重试同一笔兑换，或前往“我的订单”核实。</view>
      <button class="shop-button shop-outline shop-small" :disabled="submitting" @click="goOrders">我的订单</button>
    </view>
    <template #fixed>
      <view v-if="!result && (product || intent)" class="shop-fixed">
        <view v-if="product"><text class="shop-muted">合计 </text><text class="shop-points">{{ totalPoints }}</text><text> 积分</text></view>
        <button class="shop-button" :loading="submitting" :disabled="submitting || addressBusy || (!intent && (loading || !!loadError || !!unavailable))" @click="submit">{{ submitting ? '提交中...' : intent ? '重试本次兑换' : '确认兑换' }}</button>
      </view>
    </template>
    <template #overlay="{ dark }">
      <view v-if="result" class="shop-modal-overlay">
        <view class="shop-success">
          <ManifestIcon :id="result.order.status === 'pending' ? 'reward_gift' : 'points_info'" class="shop-success-icon" />
          <text class="shop-success-title">{{ !resultWasRetry && result.order.status === 'pending' ? '兑换成功！' : '订单结果已确认' }}</text>
          <text class="shop-description">{{ result.order.productName }} 的订单当前为{{ orderStatus(result.order.status) }}，请在订单中查看详情</text>
          <text v-if="resultWasRetry" class="shop-description">已核实本次请求对应的订单，同一请求重试不会重复扣分。</text>
          <view class="shop-row"><text class="shop-label">订单积分</text><text class="shop-points">{{ result.order.totalPoints }} 积分</text></view>
          <view class="shop-row"><text class="shop-label">订单状态</text><text class="shop-green">{{ orderStatus(result.order.status) }}</text></view>
          <button class="shop-button" @click="viewOrder">查看订单</button>
          <button class="shop-button shop-outline" @click="returnToShop">继续逛逛</button>
          <button v-if="hasAchievements" class="shop-button shop-outline shop-small" @click="viewAchievements">查看新成就</button>
        </view>
      </view>
      <AchievementUnlockModal :visible="showAchievement" :items="achievementItems" :dark="dark" @close="showAchievement = false" />
    </template>
  </ShopShell>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { userinfo } from '@/api/user'
import { createShopOrder, fetchShopProduct } from '@/api/shop'
import ShopShell from '@/pages-nonTheme/components/shop/ShopShell.vue'
import ShopAddressPicker from '@/pages-nonTheme/components/shop/ShopAddressPicker.vue'
import ShopRegionPicker from './components/ShopRegionPicker.vue'
import { composeShopAddress, splitShopAddress } from './utils/shop-address.js'
import ManifestIcon from '@/components/ManifestIcon.vue'
import AchievementUnlockModal from '@/components/AchievementUnlockModal.vue'
import { enqueueAchievementUnlocks, extractAchievementUnlocks, takeAchievementUnlocks } from '@/utils/achievements'
import { playUiSound } from '@/utils/ui-sounds.js'
import { backFromShopPage, newShopRequestId, orderStatus, returnToShop, shopError, shopIntentKey } from '@/pages-nonTheme/utils/shop-orders'

const productId = ref('')
const product = ref(null)
const points = ref(0)
const quantity = ref(1)
const form = reactive({ recipientName: '', recipientPhone: '', recipientAddress: '' })
const region = ref(['', '', ''])
const fullAddress = computed(() => composeShopAddress(region.value, form.recipientAddress))
const addressBusy = ref(false)
const addressReady = ref(false)
const loading = ref(false)
const loadError = ref('')
const submitting = ref(false)
const intent = ref(null)
const result = ref(null)
const resultWasRetry = ref(false)
const hasAchievements = ref(false)
const showAchievement = ref(false)
const achievementItems = ref([])
let prefilled = false
const locked = computed(() => submitting.value || !!intent.value || !!result.value)
const totalPoints = computed(() => Number(product.value?.points || 0) * quantity.value)
const remaining = computed(() => points.value - totalPoints.value)
const unavailable = computed(() => {
  if (!product.value) return '商品信息未加载'
  if (!Number.isInteger(quantity.value) || quantity.value < 1 || quantity.value > 99) return '兑换数量须为1至99的整数'
  if (product.value.type !== 'physical') return '该商品暂不支持兑换'
  if (product.value.status !== 'active') return '商品已下架'
  if (quantity.value > Number(product.value.stock) || Number(product.value.stock) <= 0) return '商品库存不足'
  if (remaining.value < 0) return '当前积分不足'
  return ''
})

onLoad(options => {
  productId.value = String(options?.productId || '')
  if (productId.value) {
    try {
      const saved = uni.getStorageSync(shopIntentKey(productId.value))
      if (saved?.requestId && String(saved.productId) === productId.value) {
        intent.value = saved
        quantity.value = saved.quantity
        Object.assign(form, { recipientName: saved.recipientName, recipientPhone: saved.recipientPhone })
        applyAddress(saved.recipientAddress)
        prefilled = true
        showSubmitError('有一笔兑换结果尚未确认，请重试原请求或查看“我的订单”。', '请核实兑换结果')
      }
    } catch (_) { /* 无缓存时按新意图处理 */ }
  }
  load()
})

async function load() {
  if (loading.value) return
  if (!productId.value) { loadError.value = '缺少商品信息，请返回商城重新选择'; return }
  loading.value = true
  loadError.value = ''
  try {
    const [productResponse, userResponse] = await Promise.all([fetchShopProduct(productId.value), userinfo('false')])
    if (!productResponse.data?.id || !userResponse.data || !Number.isFinite(Number(userResponse.data.points))) throw new Error('兑换信息异常，请重试')
    product.value = productResponse.data
    points.value = Number(userResponse.data.points)
    if (!prefilled) {
      const user = userResponse.data
      form.recipientName = String(user.nickname || user.username || '')
      form.recipientPhone = String(user.phone || '')
      if (!fullAddress.value.trim()) applyAddress(typeof user.location === 'string' ? user.location : '')
      prefilled = true
    }
  } catch (error) { loadError.value = shopError(error) }
  finally { loading.value = false; addressReady.value = true }
}

function applyAddress(address, parts = {}) {
  const parsed = splitShopAddress(address, parts)
  region.value = parsed.region
  form.recipientAddress = parsed.detail
}
function applyLocatedAddress(selection) {
  if (!locked.value) applyAddress(selection.address, selection.parts)
}

async function submit() {
  if (submitting.value || result.value || addressBusy.value) return
  const retrying = !!intent.value
  if (!intent.value) {
    if (loading.value || loadError.value || unavailable.value) return
    const recipientName = form.recipientName.trim()
    const recipientPhone = form.recipientPhone.trim()
    const recipientAddress = fullAddress.value
    const detailAddress = form.recipientAddress.trim()
    const issues = []
    if (!recipientName) issues.push('收货人：请填写收货人的真实姓名。')
    if (!recipientPhone) issues.push('联系电话：请填写能联系到收货人的完整电话号码。')
    else if (!/^\+?[\d\s()-]{6,30}$/.test(recipientPhone) || recipientPhone.replace(/\D/g, '').length < 6) issues.push('联系电话：格式不正确，请填写手机号或带区号的座机号码，例如 13800138000、010-12345678。')
    if (region.value.length !== 3 || region.value.some(name => !String(name || '').trim())) issues.push('所在地区：请选择或填写完整的省、市、区（县）。')
    if (!detailAddress) issues.push('详细地址：请填写街道、小区、楼栋及门牌号，不能只选择所在地区。')
    else if (/^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/.test(detailAddress)) issues.push('详细地址：不能仅填写经纬度，请选择具体地点并补充楼栋门牌号。')
    if (recipientAddress.length > 500) issues.push('收货地址：地区与详细地址合计不能超过500字，请精简后重试。')
    if (issues.length) {
      showSubmitError(issues.join('\n\n'), '请完善收货信息')
      return
    }
    const payload = { productId: productId.value, quantity: quantity.value, expectedPointsPerItem: Number(product.value.points), requestId: newShopRequestId(), recipientName, recipientPhone, recipientAddress }
    // 先持久化再发请求；持久化失败时不提交，避免刷新后丢失幂等键。
    try { uni.setStorageSync(shopIntentKey(productId.value), payload) }
    catch (_) { showSubmitError('无法保存本次兑换请求，请检查设备存储空间后重试。本次尚未提交，不会扣除积分。'); return }
    intent.value = payload
  }
  submitting.value = true
  try {
    const response = await createShopOrder({ ...intent.value })
    if (!response.data?.order?.id || !Number.isFinite(Number(response.data.remainingPoints))) throw new Error('兑换结果暂未确认，请重试本次兑换')
    result.value = response.data
    resultWasRetry.value = retrying
    points.value = Number(response.data.remainingPoints)
    // 下单成功后，缓存/声音等辅助功能失败不能将成功订单误报为失败。
    try { uni.removeStorageSync(shopIntentKey(productId.value)); uni.setStorageSync('userPoints', points.value) } catch (_) {}
    intent.value = null
    try {
      const unlocks = extractAchievementUnlocks(response.data)
      if (unlocks.length) { enqueueAchievementUnlocks(unlocks); hasAchievements.value = true }
      if (!retrying && response.data.order.status === 'pending') playUiSound('redeemSuccess', { key: `redeem:${response.data.order.id}`, page: 'pages-nonTheme/shop-confirm' })
    } catch (_) { /* 辅助反馈失败不影响已成功的兑换 */ }
  } catch (error) {
    const message = shopError(error, '兑换失败，请重试本次兑换')
    // 仅按明确拒绝的 HTTP 状态清理意图；未知、超时及服务故障保留原请求。
    if ([400, 409, 422].includes(Number(error?.statusCode))) {
      try { uni.removeStorageSync(shopIntentKey(productId.value)); intent.value = null } catch (_) {}
      await load()
    }
    showSubmitError(message)
  } finally { submitting.value = false }
}

function showSubmitError(message, title = '兑换未完成') {
  const pending = intent.value ? '\n\n本次请求已保存。请重试同一笔兑换，或到“我的订单”核实结果，避免重新创建兑换。' : ''
  uni.showModal({ title, content: message + pending, showCancel: false, confirmText: title === '请完善收货信息' ? '去完善' : '我知道了' })
}

function goOrders() { uni.navigateTo({ url: '/pages-nonTheme/shop-orders' }) }
function viewOrder() { uni.redirectTo({ url: `/pages-nonTheme/shop-order-detail?id=${encodeURIComponent(result.value.order.id)}` }) }
function viewAchievements() {
  achievementItems.value = takeAchievementUnlocks()
  showAchievement.value = achievementItems.value.length > 0
  hasAchievements.value = false
}
</script>
